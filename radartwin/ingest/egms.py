"""EGMS CSV clip + load (SPEC §2.1).

Epoch columns are named ``YYYYMMDD`` and hold LOS displacement in mm relative
to the first epoch. Positive LOS = toward the satellite.
"""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

CHUNKSIZE = 200_000


def _is_epoch_column(col: object) -> bool:
    """True for 8-digit ``YYYYMMDD`` epoch columns (str or int labels)."""
    s = str(col)
    return len(s) == 8 and s.isdigit()


def clip_egms(src: str | Path, dst: str | Path, bbox: tuple[float, float, float, float],
              chunksize: int = CHUNKSIZE) -> int:
    """Clip a raw (~1 GB) EGMS tile to ``bbox`` without loading it whole.

    Reads with ``pandas.read_csv(chunksize=...)``, keeps rows with lat/lon
    inside ``bbox`` (inclusive), writes one CSV. Returns rows written.
    """
    minlon, minlat, maxlon, maxlat = bbox
    n_out = 0
    first = True
    for chunk in pd.read_csv(src, chunksize=chunksize):
        keep = (
            (chunk["longitude"] >= minlon) & (chunk["longitude"] <= maxlon)
            & (chunk["latitude"] >= minlat) & (chunk["latitude"] <= maxlat)
        )
        sub = chunk.loc[keep]
        sub.to_csv(dst, mode="w" if first else "a", header=first, index=False)
        first = False
        n_out += len(sub)
    return n_out


def load_egms(path: str | Path, bbox: tuple[float, float, float, float] | None = None,
              track: str | None = None) -> gpd.GeoDataFrame:
    """Load a (clipped) EGMS CSV, tag it with its track, add point geometry.

    ``track`` defaults to the filename stem minus the ``clip_`` prefix, e.g.
    ``clip_asc_044.csv`` -> ``asc_044``.
    """
    path = Path(path)
    df = pd.read_csv(path)
    if bbox is not None:
        minlon, minlat, maxlon, maxlat = bbox
        keep = (
            (df["longitude"] >= minlon) & (df["longitude"] <= maxlon)
            & (df["latitude"] >= minlat) & (df["latitude"] <= maxlat)
        )
        df = df.loc[keep].reset_index(drop=True)
    if track is None:
        track = path.stem.removeprefix("clip_").removeprefix("_")
    df["track"] = track
    geom = [Point(xy) for xy in zip(df["longitude"].to_numpy(), df["latitude"].to_numpy())]
    return gpd.GeoDataFrame(df, geometry=geom, crs="EPSG:4326")


def date_columns(df: pd.DataFrame, until: str | None = None) -> list:
    """Epoch columns in chronological order, strictly before ``until`` if given."""
    cols = sorted((c for c in df.columns if _is_epoch_column(c)), key=str)
    if until is not None:
        cut = pd.Timestamp(until)
        cols = [c for c in cols if pd.Timestamp(str(c)) < cut]
    return cols


def time_series(df: pd.DataFrame, cols: list) -> tuple[np.ndarray, np.ndarray, pd.DatetimeIndex]:
    """Time vector + displacement matrix for epoch columns ``cols``.

    ``t`` = decimal years from the first epoch: ``(date - date0) / 365.25``.
    ``Y`` = per-point LOS displacement in mm, shape (n_points, n_epochs).
    """
    dates = pd.to_datetime([str(c) for c in cols], format="%Y%m%d")
    t = (dates - dates[0]).total_seconds().to_numpy() / (86400.0 * 365.25)
    y = df[cols].to_numpy(dtype=float)
    return t, y, dates
