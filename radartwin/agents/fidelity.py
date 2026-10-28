"""Fidelity guardrail (SPEC §7): two separate questions.

7.1 Is the polygon the right object? (:func:`outline_check`) — agreement
between the SAM polygon and the OSM footprint by IoU, or SAM's own
confidence when there is no OSM outline.

7.2 Can radar monitor this structure? (:func:`radar_visibility`) — scatterer
density relative to the city's bridges, plus bright fraction where a radar
chip exists.

Neither question removes an asset from the ranking. Low radar coverage is a
finding (the structure needs another inspection method), not an error.
"""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import geometry_mask

OUTLINE_IOU_THRESHOLD = 0.2
SAM_SCORE_THRESHOLD = 0.5
LOW_COVERAGE_FRACTION = 0.25


def backscatter_fidelity(
    assets: gpd.GeoDataFrame,
    s1_rtc_vv: str | Path,
    bright_db: float = -8.0,
) -> gpd.GeoDataFrame:
    """Add ``bright_fraction`` per polygon from the S1 RTC VV chip.

    The chip holds linear power; it is converted to dB via ``10·log10`` and
    ``bright_fraction = mean(dB > bright_db)`` over the pixels each polygon
    covers. Nodata pixels are excluded; a polygon covering no valid pixels
    gets NaN. Returns a copy; the input is unchanged.
    """
    out = assets.copy()
    with rasterio.open(s1_rtc_vv) as src:
        vv = src.read(1).astype(float)
        transform, crs, nodata = src.transform, src.crs, src.nodata
    with np.errstate(divide="ignore", invalid="ignore"):
        db = 10.0 * np.log10(vv)
    geoms = out.to_crs(crs)["geometry"]
    fracs: list[float] = []
    for geom in geoms:
        mask = geometry_mask([geom], out_shape=vv.shape, transform=transform, invert=True)
        if nodata is not None:
            mask &= vv != nodata
        if not mask.any():
            fracs.append(float("nan"))
            continue
        fracs.append(float(np.mean(db[mask] > bright_db)))
    out["bright_fraction"] = fracs
    return out


def _pairwise_iou(a, b) -> float:
    union = a.union(b).area
    return a.intersection(b).area / union if union > 0 else float("nan")


def outline_check(
    sam_polys: gpd.GeoDataFrame,
    osm_polys: gpd.GeoDataFrame,
    iou_threshold: float = OUTLINE_IOU_THRESHOLD,
    score_threshold: float = SAM_SCORE_THRESHOLD,
) -> gpd.GeoDataFrame:
    """Compare SAM polygons with OSM footprints by IoU (SPEC §7.1).

    Rows are matched by asset name when ``sam_polys`` has a ``bridge`` column
    and ``osm_polys`` has a ``name`` column, else pairwise by row order (the
    caller must align them first). Returns a copy of ``sam_polys`` with
    ``outline_iou`` and ``outline_mismatch`` (``outline_iou < iou_threshold``).
    A SAM polygon with no OSM counterpart falls back to SAM's own confidence
    (``score < score_threshold`` → mismatch); without a score either, it is a
    mismatch.
    """
    out = sam_polys.copy()
    if "bridge" in sam_polys.columns and "name" in osm_polys.columns:
        osm_by_name = {r["name"]: r["geometry"] for _, r in osm_polys.iterrows()}
        pairs = [(row["geometry"], osm_by_name.get(row["bridge"])) for _, row in out.iterrows()]
    elif len(sam_polys) == len(osm_polys):
        pairs = list(zip(sam_polys["geometry"], osm_polys["geometry"], strict=True))
    else:
        raise ValueError(
            "cannot match SAM to OSM polygons: no bridge/name columns and "
            f"lengths differ ({len(sam_polys)} vs {len(osm_polys)})"
        )
    utm = out.estimate_utm_crs()
    sam_utm = out.to_crs(utm)["geometry"]
    ious: list[float] = []
    for s_geom, (_, o_geom) in zip(sam_utm, pairs, strict=True):
        if o_geom is None or o_geom.is_empty:
            ious.append(float("nan"))
            continue
        o_utm = gpd.GeoSeries([o_geom], crs=osm_polys.crs).to_crs(utm).iloc[0]
        ious.append(_pairwise_iou(s_geom, o_utm))
    out["outline_iou"] = ious
    mismatch: list[bool] = []
    for idx, iou in enumerate(ious):
        if np.isfinite(iou):
            mismatch.append(bool(iou < iou_threshold))
        elif "score" in out.columns and pd.notna(out["score"].iloc[idx]):
            mismatch.append(bool(out["score"].iloc[idx] < score_threshold))
        else:
            mismatch.append(True)
    out["outline_mismatch"] = mismatch
    return out


def radar_visibility(
    state: dict,
    s1_rtc_vv: str | Path | None = None,
    low_fraction: float = LOW_COVERAGE_FRACTION,
) -> pd.DataFrame:
    """Radar coverage per analysed bridge (SPEC §7.2).

    ``state`` is the ``rank_city`` pickle (``bridges`` + bound ``pts``).
    ``points_per_ha`` = EGMS scatterers inside the OSM footprint / footprint
    area. ``bright_fraction`` comes from the Sentinel-1 RTC chip where given;
    bridges outside the chip get NaN (null). ``radar_coverage`` is ``"low"``
    below ``low_fraction`` × the city median points_per_ha, else ``"ok"``.
    Returns one row per bridge: asset, points_per_ha, bright_fraction,
    radar_coverage.
    """
    bridges: gpd.GeoDataFrame = state["bridges"]
    pts: pd.DataFrame = state["pts"]
    utm = bridges.estimate_utm_crs()
    area_ha = bridges.to_crs(utm)["geometry"].area / 1e4
    counts = pts.groupby("asset_id").size()
    if s1_rtc_vv is not None:
        bright = backscatter_fidelity(bridges, s1_rtc_vv)["bright_fraction"]
    else:
        bright = pd.Series(np.nan, index=bridges.index)
    rows = []
    for idx, b in bridges.iterrows():
        ha = float(area_ha.loc[idx])
        n = int(counts.get(b["asset_id"], 0))
        ppha = n / ha if ha > 0 else float("nan")
        rows.append({
            "asset": b["name"],
            "points_per_ha": ppha,
            "bright_fraction": float(bright.loc[idx]),
        })
    vis = pd.DataFrame(rows)
    median = float(vis["points_per_ha"].median())
    vis["radar_coverage"] = np.where(vis["points_per_ha"] < low_fraction * median, "low", "ok")
    return vis
