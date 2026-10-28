#!/usr/bin/env python3
"""SAM vs OSM bridge footprints by IoU (SPEC §6.1).

Loads the OSM footprints intersecting the site bbox from the cached Overpass
JSON (no network), prompts SAM 3.1 with their bounding boxes in ONE request,
and compares the returned polygons to the OSM polygons per bridge by IoU. A
text-prompt variant (``"bridge"``, one request) is compared honestly in the
same table. Writes ``out/sam_vs_osm.png`` and ``out/sam_polygons.geojson``
(the box-prompt polygons, so later stages can reuse them without new calls).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from shapely.geometry import box as sbox
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import geopandas as gpd  # noqa: E402

from radartwin.config import SITES  # noqa: E402
from radartwin.segment.osm import dissolve_bridges, load_bridges  # noqa: E402
from radartwin.segment.sam import segment  # noqa: E402

DRESDEN_CENTRE = (13.700, 51.030, 13.790, 51.080)  # cached Overpass JSON bbox
CHIP = ROOT / "data" / "carola" / "s2_visual.tif"
OUT_PNG = ROOT / "out" / "sam_vs_osm.png"
OUT_GEOJSON = ROOT / "out" / "sam_polygons.geojson"
TEXT = "bridge"


def load_site_bridges(site_slug: str = "carola") -> tuple[object, gpd.GeoDataFrame]:
    """Dissolved OSM bridges intersecting the site bbox (cached JSON only)."""
    site = SITES[site_slug]
    ways = load_bridges(DRESDEN_CENTRE, site, data_dir=ROOT / "data" / site.slug)
    ways = ways[ways.intersects(sbox(*site.bbox))].copy()
    bridges = dissolve_bridges(ways).sort_values("asset_id").reset_index(drop=True)
    return site, bridges


def footprint_pixel_boxes(
    bridges: gpd.GeoDataFrame, chip: Path = CHIP
) -> list[tuple[int, int, int, int]]:
    """Each footprint's bounding box in chip pixels (``x2,y2`` inclusive)."""
    with rasterio.open(chip) as src:
        crs, transform, w, h = src.crs, src.transform, src.width, src.height
    inv = ~transform
    boxes: list[tuple[int, int, int, int]] = []
    for _, row in bridges.iterrows():
        geom = gpd.GeoSeries([row.geometry], crs="EPSG:4326").to_crs(crs).iloc[0]
        minx, miny, maxx, maxy = geom.bounds
        cols, rows = [], []
        for x, y in ((minx, miny), (minx, maxy), (maxx, miny), (maxx, maxy)):
            c, r = inv * (x, y)
            cols.append(c)
            rows.append(r)
        x1 = max(0, math.floor(min(cols)))
        y1 = max(0, math.floor(min(rows)))
        x2 = min(w - 1, math.floor(max(cols)))
        y2 = min(h - 1, math.floor(max(rows)))
        x2 = max(x2, min(w - 1, x1))
        y2 = max(y2, min(h - 1, y1))
        boxes.append((x1, y1, x2, y2))
    return boxes


def sam_polygons_for_bridges(
    sam_gdf: gpd.GeoDataFrame, n_bridges: int
) -> list[object | None]:
    """Map box-prompt records (labels ``sam-1..sam-N``) back to bridge order."""
    polys: list[object | None] = []
    for i in range(n_bridges):
        rows = sam_gdf[sam_gdf["label"] == f"sam-{i + 1}"]
        polys.append(None if len(rows) == 0 else unary_union(rows.geometry.tolist()))
    return polys


def _iou(a, b) -> float:
    union = a.union(b).area
    return a.intersection(b).area / union if union > 0 else float("nan")


def _pixel_rings(geom_4326, src) -> list[np.ndarray]:
    """Exterior rings of a lon/lat geometry in chip pixel coordinates."""
    from rasterio.warp import transform_geom

    g = transform_geom("EPSG:4326", src.crs, geom_4326.__geo_interface__)
    t = src.transform
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    rings = []
    for poly in polys:
        ring = np.asarray(poly[0], dtype=float)
        cols = (ring[:, 0] - t.c) / t.a
        rows = (ring[:, 1] - t.f) / t.e
        rings.append(np.column_stack([cols, rows]))
    return rings


def main() -> int:
    site, bridges = load_site_bridges()
    print(f"site={site.slug} bridges={list(bridges['name'])}")
    boxes = footprint_pixel_boxes(bridges)
    for name, b in zip(bridges["name"], boxes):
        print(f"  {name}: pixel box (x1,y1,x2,y2)={b}")

    try:
        sam_box = segment(CHIP, boxes_px=boxes)  # ONE request for all boxes
    except RuntimeError as exc:
        print(str(exc))
        return 1
    print(f"box prompts (one request): {len(sam_box)} records")
    for _, r in sam_box.iterrows():
        print(f"  label={r['label']} score={r['score']:.3f}")

    try:
        sam_text = segment(CHIP, text=TEXT)  # text-prompt variant, one request
    except RuntimeError as exc:
        print(str(exc))
        return 1
    print(f'text "{TEXT}": {len(sam_text)} records')

    utm = bridges.estimate_utm_crs()
    osm_utm = bridges.to_crs(utm)
    sam_polys = sam_polygons_for_bridges(sam_box, len(bridges))
    text_union = (
        None
        if len(sam_text) == 0
        else unary_union(sam_text.to_crs(utm).geometry.tolist())
    )

    print(f"\n{'bridge':<15}{'IoU(box)':>9}{'IoU(text)':>10}{'SAM area m2':>12}{'OSM area m2':>12}")
    rows = []
    for idx, orow in osm_utm.iterrows():
        og, oarea = orow["geometry"], orow["geometry"].area
        sp = sam_polys[idx]
        if sp is None or sp.is_empty:
            iou_box, sarea = 0.0, 0.0
        else:
            spg = gpd.GeoSeries([sp], crs="EPSG:4326").to_crs(utm).iloc[0]
            iou_box, sarea = _iou(spg, og), spg.area
        iou_text = 0.0 if text_union is None or text_union.is_empty else _iou(text_union, og)
        rows.append((bridges.loc[idx, "name"], iou_box, iou_text, sarea, oarea))
        print(f"{bridges.loc[idx, 'name']:<15}{iou_box:>9.3f}{iou_text:>10.3f}"
              f"{sarea:>12.0f}{oarea:>12.0f}")

    # Reusable box-prompt polygons (bridge order, EPSG:4326).
    recs = []
    for idx, sp in enumerate(sam_polys):
        if sp is None or sp.is_empty:
            continue
        sub = sam_box[sam_box["label"] == f"sam-{idx + 1}"]
        recs.append({
            "bridge": bridges.loc[idx, "name"],
            "score": float(sub["score"].iloc[0]),
            "geometry": sp,
        })
    if recs:
        gpd.GeoDataFrame(recs, crs="EPSG:4326").to_file(OUT_GEOJSON, driver="GeoJSON")
        print(f"saved {OUT_GEOJSON} ({len(recs)} polygons)")
    else:
        print("no SAM polygons to save")

    with rasterio.open(CHIP) as src:
        rgb = np.dstack([src.read(1), src.read(2), src.read(3)])
        fig, (ax0, ax1) = plt.subplots(1, 2, figsize=(12, 6))
        for ax in (ax0, ax1):
            ax.imshow(rgb)
            ax.axis("off")
        colors = plt.cm.tab10.colors
        for i, (_, orow) in enumerate(bridges.iterrows()):
            for ring in _pixel_rings(orow["geometry"], src):
                ax0.plot(ring[:, 0], ring[:, 1], lw=1.5,
                         color=colors[i % len(colors)], label=orow["name"])
        ax0.set_title("OSM footprints")
        ax0.legend(fontsize=8, loc="lower right")
        for i, sp in enumerate(sam_polys):
            if sp is None or sp.is_empty:
                continue
            for ring in _pixel_rings(sp, src):
                ax1.fill(ring[:, 0], ring[:, 1], color=colors[i % len(colors)],
                         alpha=0.5, label=f"{bridges.loc[i, 'name']} IoU={rows[i][1]:.2f}")
        for _, orow in bridges.iterrows():  # faint OSM reference on the SAM panel
            for ring in _pixel_rings(orow["geometry"], src):
                ax1.plot(ring[:, 0], ring[:, 1], "w--", lw=0.8, alpha=0.8)
        ax1.set_title(f"SAM box prompts (+ OSM dashed); text \"{TEXT}\": "
                      f"{len(sam_text)} masks")
        ax1.legend(fontsize=8, loc="lower right")
    fig.suptitle(f"SAM vs OSM ({site.slug} S2 chip {rgb.shape[1]}x{rgb.shape[0]})")
    fig.tight_layout()
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT_PNG, dpi=150)
    plt.close(fig)
    print(f"saved {OUT_PNG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
