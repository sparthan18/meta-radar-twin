"""Scatterer -> polygon binding (SPEC §3.4)."""
from __future__ import annotations

import geopandas as gpd


def bind_points(points: gpd.GeoDataFrame, polygons: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Left-join points to ``asset_id`` polygons with the ``within`` predicate."""
    joined = gpd.sjoin(points, polygons[["asset_id", "geometry"]], how="left", predicate="within")
    return joined.drop(columns=["index_right"])
