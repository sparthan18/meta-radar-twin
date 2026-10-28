"""SAM 3.1 segmentation via the Meta Model API (SPEC §6.1).

Request: ``POST /v1/responses`` with model ``sam-3.1``,
``input=[{"type":"message","role":"user","content":[
{"type":"input_text","text": PROMPT},
{"type":"input_image","image_url": data_url}]}]``,
``metadata={"include_confidence":"true"}``.

Record parsing and mask decoding use Meta's official ``meta_sam_parser``
package: the response text is parsed with ``image_segmentation_format`` and
each mask is decoded with ``decode_mask_to_raster`` (``!`` one-bit and ``~``
lossless payloads both handled by the parser; no hand-decoding). Box prompts
are built with ``build_object_prompt`` via the ``box_prompt`` wrapper.
"""
from __future__ import annotations

import base64
import io
import os
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from dotenv import load_dotenv
from meta_sam_parser import (
    CompletedOutcome,
    FramePrompt,
    PromptBox,
    PromptObject,
    build_object_prompt,
    decode_mask_to_raster,
    image_segmentation_format,
)
from PIL import Image
from rasterio.features import shapes
from shapely.geometry import shape as shapely_shape
from shapely.ops import unary_union

load_dotenv()

BASE_URL = "https://api.meta.ai/v1"
MODEL = "sam-3.1"


def encode_chip(tif: str | Path) -> tuple[str, int, int, object, object]:
    """Read a GeoTIFF's RGB bands as a base64 PNG data URL.

    Returns ``(data_url, width, height, transform, crs)``.
    """
    with rasterio.open(tif) as src:
        r = src.read(1)
        g = src.read(2) if src.count >= 2 else r
        b = src.read(3) if src.count >= 3 else r
        width, height = src.width, src.height
        transform, crs = src.transform, src.crs
    if r.dtype != np.uint8:
        def _scale(a: np.ndarray) -> np.ndarray:
            a = a.astype(float)
            lo, hi = float(np.nanmin(a)), float(np.nanmax(a))
            if hi <= lo:
                return np.zeros_like(a, dtype=np.uint8)
            return ((a - lo) / (hi - lo) * 255.0).clip(0, 255).astype(np.uint8)

        r, g, b = _scale(r), _scale(g), _scale(b)
    rgb = np.dstack([r, g, b])
    buf = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    return data_url, width, height, transform, crs


def box_prompt(boxes_px: list[tuple[int, int, int, int]], width: int, height: int) -> str:
    """Build the ``<0f>`` box-prompt grammar, ids starting at 1.

    Thin wrapper around ``meta_sam_parser.build_object_prompt``. Callers pass
    inclusive ``x2,y2`` pixels; they are converted to the half-open edges the
    builder expects. ``w``/``h`` equal the image size.
    """
    objects = [
        PromptObject(
            id=i,
            prompts=[
                FramePrompt(
                    frame=0,
                    box=PromptBox(
                        left=int(x1), top=int(y1),
                        right=int(x2) + 1, bottom=int(y2) + 1,
                    ),
                )
            ],
        )
        for i, (x1, y1, x2, y2) in enumerate(boxes_px, start=1)
    ]
    return build_object_prompt(size=(int(width), int(height)), objects=objects)


def _parse_masks(out_text: str) -> list[tuple[str, float, np.ndarray, tuple[int, int, int, int]]]:
    """Parse response text into ``(object_id, score, mask, bounds)`` tuples.

    Uses the official record parser; each mask is decoded with
    ``decode_mask_to_raster`` to a row-major 0/1 array of its own (H, W).
    Masks are box-local: ``bounds`` is the half-open ``(left, top, right,
    bottom)`` frame region the raster maps onto (it matches the record's
    box). Score prefers the box confidence, then the mask confidence,
    else NaN.
    """
    parser = image_segmentation_format().create_parser()
    parser.push(out_text)
    result = parser.finish(CompletedOutcome()).result
    boxes: dict[str, object] = {}
    for rec in result.records:
        if getattr(rec, "kind", None) == "box":
            boxes[rec.object_id] = rec
    triples: list[tuple[str, float, np.ndarray, tuple[int, int, int, int]]] = []
    for rec in result.records:
        if getattr(rec, "kind", None) != "mask":
            continue
        mask = rec.mask
        raster = decode_mask_to_raster(mask)
        arr = np.frombuffer(raster, dtype=np.uint8).reshape(mask.height, mask.width)
        arr = arr.astype(np.uint8)
        score = None
        box = boxes.get(rec.object_id)
        if box is not None and box.confidence is not None:
            score = box.confidence
        elif rec.confidence is not None:
            score = rec.confidence
        b = rec.bounds
        bounds = (int(b.left), int(b.top), int(b.right), int(b.bottom))
        triples.append((rec.object_id, float(score) if score is not None else float("nan"), arr, bounds))
    return triples


def _resize_mask(mask: np.ndarray, height: int, width: int) -> np.ndarray:
    """Nearest-neighbour resize of a 0/1 mask to the chip size."""
    if mask.shape == (height, width):
        return mask.astype(np.uint8)
    img = Image.fromarray(mask.astype(np.uint8) * 255, mode="L")
    resized = img.resize((width, height), Image.NEAREST)
    return (np.asarray(resized) > 127).astype(np.uint8)


def _mask_to_polygon(mask: np.ndarray, transform) -> object | None:
    """Union all value-1 shapes of a chip-sized mask into one (multi)polygon."""
    geoms = []
    for geom, value in shapes(mask, transform=transform):
        if int(value) == 1:
            geoms.append(shapely_shape(geom))
    if not geoms:
        return None
    return unary_union(geoms)


def _response_text(resp) -> str:
    """Extract the text payload from a Responses API result."""
    text = getattr(resp, "output_text", None)
    if isinstance(text, str) and text:
        return text
    # Fallback: walk output items for output_text blocks.
    chunks: list[str] = []
    for item in getattr(resp, "output", []) or []:
        for block in getattr(item, "content", []) or []:
            t = getattr(block, "text", None)
            if isinstance(t, str):
                chunks.append(t)
    return "".join(chunks)


def segment(
    tif: str | Path,
    text: str | None = None,
    boxes_px: list[tuple[int, int, int, int]] | None = None,
    include_confidence: bool = True,
) -> gpd.GeoDataFrame:
    """Segment a chip with SAM 3.1; return polygons in EPSG:4326.

    ``text`` is one noun phrase, or ``boxes_px`` gives box prompts (pixels,
    ``x2,y2`` inclusive); exactly one of them must be set. Returns a
    GeoDataFrame with columns ``label, score, geometry``.
    """
    if (text is None) == (boxes_px is None):
        raise ValueError("pass exactly one of text or boxes_px")
    api_key = os.getenv("MODEL_API_KEY")
    if not api_key:
        raise RuntimeError("MODEL_API_KEY is missing (not set in .env); cannot call SAM 3.1.")

    data_url, width, height, transform, crs = encode_chip(tif)
    if boxes_px is not None:
        prompt = box_prompt(boxes_px, width, height)
    else:
        assert text is not None
        prompt = text

    from openai import OpenAI

    client = OpenAI(base_url=BASE_URL, api_key=api_key)
    try:
        resp = client.responses.create(
            model=MODEL,
            input=[
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": data_url},
                    ],
                }
            ],
            metadata={"include_confidence": "true" if include_confidence else "false"},
        )
    except Exception as exc:
        msg = str(exc)
        if "401" in msg or "Unauthorized" in msg or "unauthorized" in msg:
            raise RuntimeError(
                "SAM 3.1 API returned 401 Unauthorized; MODEL_API_KEY is invalid or missing."
            ) from exc
        raise

    out_text = _response_text(resp).strip()
    if not out_text:
        return gpd.GeoDataFrame({"label": [], "score": [], "geometry": []}, crs="EPSG:4326")

    recs = []
    for object_id, score, mask, (left, top, right, bottom) in _parse_masks(out_text):
        # The raster is box-local: resize to the box, then paste into a
        # full-chip mask at the box offset (SPEC's "resize to the frame"
        # would smear a box-sized raster over the whole chip).
        box_mask = _resize_mask(mask, bottom - top, right - left)
        chip_mask = np.zeros((height, width), dtype=np.uint8)
        l0, t0 = max(left, 0), max(top, 0)
        r0, b0 = min(right, width), min(bottom, height)
        if r0 > l0 and b0 > t0:
            chip_mask[t0:b0, l0:r0] = box_mask[t0 - top:b0 - top, l0 - left:r0 - left]
        poly = _mask_to_polygon(chip_mask, transform)
        if poly is None or poly.is_empty:
            continue
        label = text if text is not None else f"sam-{object_id}"
        recs.append({"label": label, "score": float(score), "geometry": poly})

    if not recs:
        return gpd.GeoDataFrame({"label": [], "score": [], "geometry": []}, crs="EPSG:4326")
    gdf = gpd.GeoDataFrame(recs, crs=crs)
    return gdf.to_crs("EPSG:4326")[["label", "score", "geometry"]]
