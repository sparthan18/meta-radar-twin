#!/usr/bin/env python3
"""Render the Sentinel-2 visual chip as an RGB PNG (phase 7c).

Reads ``data/carola/s2_visual.tif`` (the 3-band uint8 visual chip SAM saw,
EPSG:32633) and writes ``out/s2_visual.png`` (RGB) plus
``out/s2_visual.json`` with the four corner coordinates in lon/lat, the same
way ``render_s1_chip.py`` does for radar. Each UTM corner is transformed
exactly with pyproj; the chip is not assumed axis-aligned in lon/lat.

The JSON ``coordinates`` are in MapLibre image-source order:
[top-left, top-right, bottom-right, bottom-left], each [lon, lat].

Usage::

    .venv/bin/python scripts/render_s2_chip.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent

SRC = ROOT / "data" / "carola" / "s2_visual.tif"
OUT_PNG = ROOT / "out" / "s2_visual.png"
OUT_JSON = ROOT / "out" / "s2_visual.json"


def main() -> int:
    with rasterio.open(SRC) as ds:
        if ds.count < 3:
            raise ValueError(f"expected 3 bands in the S2 chip, got {ds.count}")
        r = ds.read(1)
        g = ds.read(2)
        b = ds.read(3)
        bounds = ds.bounds
        src_crs = ds.crs
        width, height = ds.width, ds.height

    rgb = np.dstack([r, g, b])
    if rgb.dtype != np.uint8:
        rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, mode="RGB").save(OUT_PNG)

    transformer = Transformer.from_crs(src_crs, "EPSG:4326", always_xy=True)
    utm_corners = [
        (bounds.left, bounds.top),      # top-left
        (bounds.right, bounds.top),     # top-right
        (bounds.right, bounds.bottom),  # bottom-right
        (bounds.left, bounds.bottom),   # bottom-left
    ]
    lonlat = [
        [round(float(lon), 6), round(float(lat), 6)]
        for lon, lat in (transformer.transform(e, n) for e, n in utm_corners)
    ]
    OUT_JSON.write_text(json.dumps({
        "coordinates": lonlat,
        "order": ["top-left", "top-right", "bottom-right", "bottom-left"],
        "crs": "EPSG:4326",
        "source_crs": str(src_crs),
        "width": int(width),
        "height": int(height),
        "bands": 3,
    }))

    print(f"wrote {OUT_PNG} ({width}x{height} RGB)")
    print(f"wrote {OUT_JSON}: {lonlat}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
