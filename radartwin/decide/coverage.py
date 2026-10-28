"""Not-monitored bridges: named spans radar cannot see (SPEC §4).

Lists the named bridges >= 80 m that the city ranking dropped for too few
scatterers or tracks. Uses the same OSM loading, dissolving and binding
functions as ``scripts/rank_city.py`` (imported, not copied), so the list
cannot drift from the ranking.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

from radartwin.analytics.bind import bind_points
from radartwin.config import SITES
from radartwin.segment.osm import dissolve_bridges, load_bridges

ROOT = Path(__file__).resolve().parent.parent.parent


def _rank_city_module():
    """Import ``scripts/rank_city.py`` for its loaders and thresholds."""
    spec = importlib.util.spec_from_file_location(
        "radartwin_rank_city", ROOT / "scripts" / "rank_city.py"
    )
    if spec is None or spec.loader is None:
        raise ImportError("cannot load scripts/rank_city.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def not_monitored_bridges(
    site_slug: str = "carola",
    data_dir: str | Path | None = None,
) -> gpd.GeoDataFrame:
    """Named bridges >= 80 m dropped for too few scatterers or tracks.

    Returns a GeoDataFrame with ``asset, scatterers, tracks, len_m,
    area_ha, points_per_ha, reason, geometry`` sorted by name. ``reason``
    names the failed minimum(s) with the observed counts.
    """
    rank_city = _rank_city_module()
    site = SITES[site_slug]
    bbox = rank_city.DRESDEN_CENTRE
    min_n = rank_city.MIN_SCATTERERS
    min_t = rank_city.MIN_TRACKS
    data_path = Path(data_dir) if data_dir is not None else ROOT / "data" / site.slug
    pts, _track_cols = rank_city.load_city_points(data_path)
    ways = load_bridges(bbox, site, data_dir=data_path)
    dissolved = dissolve_bridges(ways)
    bound = bind_points(pts, dissolved)
    on = bound.dropna(subset=["asset_id"]).copy()
    if len(on):
        on["asset_id"] = on["asset_id"].astype(int)
        counts = on.groupby("asset_id").agg(n=("track", "size"), tracks=("track", "nunique"))
    else:
        counts = pd.DataFrame(columns=["n", "tracks"])
    utm = dissolved.estimate_utm_crs()
    area_ha = dissolved.to_crs(utm)["geometry"].area / 1e4
    rows = []
    for idx, b in dissolved.iterrows():
        aid = int(b["asset_id"])
        n = int(counts.loc[aid, "n"]) if aid in counts.index else 0
        ntracks = int(counts.loc[aid, "tracks"]) if aid in counts.index else 0
        if n >= min_n and ntracks >= min_t:
            continue
        ha = float(area_ha.loc[idx])
        ppha = n / ha if ha > 0 else float("nan")
        fails = []
        if n < min_n:
            fails.append(f"{n} scatterers < {min_n} minimum")
        if ntracks < min_t:
            fails.append(f"{ntracks} tracks < {min_t} minimum")
        rows.append({
            "asset": b["name"],
            "scatterers": n,
            "tracks": ntracks,
            "len_m": float(b["len_m"]),
            "area_ha": ha,
            "points_per_ha": float(ppha),
            "reason": "; ".join(fails),
            "geometry": b["geometry"],
        })
    gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    return gdf.sort_values("asset").reset_index(drop=True)


if __name__ == "__main__":
    table = not_monitored_bridges()
    print(table[["asset", "scatterers", "tracks", "len_m", "area_ha",
                 "points_per_ha", "reason"]].to_string(index=False))
