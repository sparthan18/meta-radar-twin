#!/usr/bin/env python3
"""Render the Sentinel-1 RTC chip as a greyscale PNG (phase 5c, step 6).

Reads ``data/carola/s1_rtc_vv.tif`` (linear power, EPSG:32633), converts to
dB, stretches between the 2nd and 98th percentile of the valid pixels, and
writes ``out/s1_amplitude.png`` (greyscale) plus ``out/s1_amplitude.json``
with the four corner coordinates in lon/lat. Each UTM corner is transformed
exactly with pyproj; the chip is not assumed axis-aligned in lon/lat.

The JSON ``coordinates`` are in MapLibre image-source order:
[top-left, top-right, bottom-right, bottom-left], each [lon, lat].

Usage::

    .venv/bin/python scripts/render_s1_chip.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent

SRC = ROOT / "data" / "carola" / "s1_rtc_vv.tif"
OUT_PNG = ROOT / "out" / "s1_amplitude.png"
OUT_JSON = ROOT / "out" / "s1_amplitude.json"


def main() -> int:
    with rasterio.open(SRC) as ds:
        arr = ds.read(1).astype(np.float64)
        nodata = ds.nodata
        bounds = ds.bounds
        src_crs = ds.crs
        width, height = ds.width, ds.height

    valid = np.isfinite(arr) & (arr > 0)
    if nodata is not None:
        valid &= arr != nodata
    if not valid.any():
        raise ValueError("no valid pixels in the S1 chip")

    db = np.full(arr.shape, np.nan)
    db[valid] = 10.0 * np.log10(arr[valid])
    lo, hi = np.percentile(db[valid], [2.0, 98.0])
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        raise ValueError(f"bad dB stretch: p2={lo!r} p98={hi!r}")

    scaled = np.zeros(arr.shape, dtype=np.uint8)
    scaled[valid] = np.clip((db[valid] - lo) / (hi - lo), 0.0, 1.0) * 255.0
    Image.fromarray(scaled, mode="L").save(OUT_PNG)

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
        "db_p2": round(float(lo), 3),
        "db_p98": round(float(hi), 3),
    }))

    print(f"wrote {OUT_PNG} ({width}x{height}, dB {lo:.2f}..{hi:.2f})")
    print(f"wrote {OUT_JSON}: {lonlat}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
