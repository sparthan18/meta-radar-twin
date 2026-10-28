#!/usr/bin/env python3
"""SAM 3.1 smoke test: text-prompt segmentation of the Carola S2 chip."""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.warp import transform_geom

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.segment.sam import segment  # noqa: E402

CHIP = ROOT / "data" / "carola" / "s2_visual.tif"
OUT = ROOT / "out" / "sam_smoke.png"
CANDIDATES = ["bridge", "river bridge", "road bridge"]


def main() -> int:
    tried: list[str] = []
    gdf = None
    used = None
    for text in CANDIDATES[:1]:
        tried.append(text)
        try:
            gdf = segment(CHIP, text=text)
        except RuntimeError as exc:
            print(str(exc))
            return 1
        print(f'text="{text}": {len(gdf)} records')
        for _, r in gdf.iterrows():
            print(f"  label={r['label']} score={r['score']:.3f} bounds={r['geometry'].bounds}")
        if len(gdf) > 0:
            used = text
            break
    if gdf is None or len(gdf) == 0:
        for text in CANDIDATES[1:]:
            tried.append(text)
            try:
                gdf = segment(CHIP, text=text)
            except RuntimeError as exc:
                print(str(exc))
                return 1
            print(f'text="{text}": {len(gdf)} records')
            for _, r in gdf.iterrows():
                print(f"  label={r['label']} score={r['score']:.3f} bounds={r['geometry'].bounds}")
            if len(gdf) > 0:
                used = text
                break
    if used is None:
        print(f"no matches for any of {tried}")
    else:
        print(f"worked: {used!r} (tried {tried})")

    with rasterio.open(CHIP) as src:
        rgb = np.dstack([src.read(1), src.read(2), src.read(3)])
        crs, transform = src.crs, src.transform
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.imshow(rgb)
    if gdf is not None and len(gdf) > 0:
        for _, r in gdf.iterrows():
            geom = transform_geom("EPSG:4326", crs, r["geometry"].__geo_interface__)
            for poly in (
                geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
            ):
                ring = np.asarray(poly[0])
                cols = (ring[:, 0] - transform.c) / transform.a
                rows = (ring[:, 1] - transform.f) / transform.e
                ax.plot(cols, rows, "r-", lw=1.5)
                ax.fill(cols, rows, color="red", alpha=0.3)
    ax.set_title(f"SAM smoke: {used or 'no match'} ({len(gdf) if gdf is not None else 0} masks)")
    ax.axis("off")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(OUT, dpi=150)
    plt.close(fig)
    print(f"saved {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
