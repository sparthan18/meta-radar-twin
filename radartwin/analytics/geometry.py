"""Deck axis, along/cross coordinates and span bins (SPEC §3.2)."""
from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd


def bridge_axis(points: gpd.GeoDataFrame) -> tuple[np.ndarray, np.ndarray, object]:
    """Deck axis from an SVD of UTM scatterer coordinates.

    First right-singular vector, flipped to point north (``axis[1] >= 0``).
    Returns (origin, axis, crs) with origin = UTM mean.
    """
    crs = points.estimate_utm_crs()
    xy = np.column_stack(
        [points.to_crs(crs).geometry.x.to_numpy(), points.to_crs(crs).geometry.y.to_numpy()]
    )
    origin = xy.mean(axis=0)
    _, _, vt = np.linalg.svd(xy - origin)
    axis = vt[0]
    if axis[1] < 0:
        axis = -axis
    return origin, axis, crs


def along_cross(points: gpd.GeoDataFrame, origin: np.ndarray, axis: np.ndarray,
                crs: object) -> tuple[np.ndarray, np.ndarray]:
    """Deck coordinates: ``along = xy·axis``, ``cross = xy·(-axis_y, axis_x)``."""
    g = points.to_crs(crs)
    xy = np.column_stack([g.geometry.x.to_numpy(), g.geometry.y.to_numpy()])
    along = xy @ axis
    cross = xy @ np.array([-axis[1], axis[0]])
    return along, cross


def assign_spans(pts: pd.DataFrame, span_m: float = 60, min_pts: int = 3) -> np.ndarray:
    """Bin ``along`` into ``span_m``-metre spans; merge spans with < ``min_pts``.

    ``span = floor((along - min) / span_m)``; each small span joins the nearest
    span that has >= ``min_pts`` points (ties -> lower id, per SPEC §3.2).
    With no span that big, everything is span 0.
    """
    along = np.asarray(pts["along"], dtype=float)
    labels = np.floor((along - along.min()) / span_m).astype(int)
    sizes = pd.Series(labels).value_counts()
    big = sorted(s for s, c in sizes.items() if c >= min_pts)
    if not big:
        return np.zeros_like(labels)
    for s, c in sizes.items():
        if c >= min_pts:
            continue
        nearest = min(big, key=lambda b: (abs(b - s), b))
        labels[labels == s] = nearest
    return labels
