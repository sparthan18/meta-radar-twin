"""Ascending + descending LOS -> vertical / east motion (SPEC §3.3)."""
from __future__ import annotations

import numpy as np


def decompose(los: np.ndarray, v: np.ndarray) -> tuple[float, float, int]:
    """Solve LOS rows ``(los_east, los_north, los_up)`` for east + up motion.

    Requires both signs of ``los_east`` (ascending + descending present) and
    solves least squares on the ``[east, up]`` columns only — Sentinel-1 is
    blind to north. Returns ``(east, up, n_used)``; NaN when unsolvable.
    """
    los = np.asarray(los, dtype=float)
    v = np.asarray(v, dtype=float)
    ok = np.isfinite(v) & np.isfinite(los).all(axis=1)
    los, v = los[ok], v[ok]
    if len(v) < 2 or not (los[:, 0].min() < 0 < los[:, 0].max()):
        return np.nan, np.nan, 0
    (east, up), _, _, _ = np.linalg.lstsq(los[:, [0, 2]], v, rcond=None)
    return float(east), float(up), len(v)
