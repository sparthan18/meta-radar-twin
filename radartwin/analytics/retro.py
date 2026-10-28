"""Leak-free rolling retrospective + scoring (SPEC §3.5).

For each monthly cutoff the seasonal model is refit on truncated RAW data, so
no future information leaks into the score at that cutoff.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from radartwin.analytics.decompose import decompose
from radartwin.analytics.trends import (
    linear_velocity,
    seasonal_fit,
    windowed_velocity,
)

SHRINK_K = 8  # reliability weight: w = n_eff / (n_eff + 8)
MIN_KEEP_EPOCHS = 24  # epochs strictly before the cutoff required per track
MIN_EARLIER_FOR_Z = 6  # earlier cutoffs required for a z-score
MAD_SCALE = 1.4826  # robust sigma from MAD under normality


def _track_recent_minus_long(td: dict, keep: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-row ``recent - long`` LOS velocity (mm/yr) on truncated raw data.

    Seasonal fit, long-term slope and 1-yr windowed slope are all computed on
    the kept epochs only. Fits are per-row independent, so one call covers all
    of the track's points; the caller slices spans out of the result.
    """
    tk = td["t"][keep]
    yk = td["Y"][:, keep]
    _, yd = seasonal_fit(tk, yk)
    long, _ = linear_velocity(tk, yd)
    recent = windowed_velocity(tk, yd, 1.0)
    return recent - long, tk


def rolling_span_anomaly(track_data: dict[str, dict], cutoffs: list[str],
                         event_date: str | None = None) -> pd.DataFrame:
    """Vertical per-span anomaly (mm/yr) at each cutoff, leak-free.

    Per (cutoff, span, track): keep epochs with ``date < cutoff`` (and
    ``< event_date``); require >= 24; ``dv_track = nanmean(recent - long)``
    over the span's points; ``L_track`` = mean LOS vector. Per (cutoff, span):
    decompose the stacked tracks to vertical. Columns are span ids.
    """
    spans = sorted({int(s) for td in track_data.values() for s in td["span"]})
    roll = pd.DataFrame(np.nan, index=list(cutoffs), columns=spans)
    limit_event = pd.Timestamp(event_date) if event_date else None
    for cutoff in cutoffs:
        limit = pd.Timestamp(cutoff)
        if limit_event is not None:
            limit = min(limit, limit_event)
        dv_all: dict[str, np.ndarray] = {}
        for name, td in track_data.items():
            keep = np.asarray(td["dates"] < limit)
            if int(keep.sum()) < MIN_KEEP_EPOCHS:
                continue
            diff, _ = _track_recent_minus_long(td, keep)
            dv_all[name] = diff
        for span in spans:
            los_rows: list[np.ndarray] = []
            dv_rows: list[float] = []
            for name, td in track_data.items():
                if name not in dv_all:
                    continue
                rows = np.flatnonzero(np.asarray(td["span"]) == span)
                if len(rows) == 0:
                    continue
                diff = dv_all[name][rows]
                if not np.isfinite(diff).any():
                    continue
                dv_rows.append(float(np.nanmean(diff)))
                los_rows.append(np.asarray(td["los"])[rows].mean(axis=0))
            if not dv_rows:
                continue
            _, up, _ = decompose(np.stack(los_rows), np.array(dv_rows))
            roll.loc[cutoff, span] = up
    return roll


def span_meta(pts: pd.DataFrame) -> pd.DataFrame:
    """Per-span ``n``, ``tracks``, ``coherence`` and ``n_eff = n * coherence``."""
    grp = pts.groupby("span")
    meta = pd.DataFrame({
        "n": grp.size(),
        "tracks": grp["track"].nunique(),
        "coherence": grp["temporal_coherence"].mean(),
    })
    meta["n_eff"] = meta["n"] * meta["coherence"]
    return meta


def _robust_z(scores: pd.Series) -> pd.Series:
    """``z = (score - median(earlier)) / (1.4826 * MAD(earlier))``.

    Strictly earlier cutoffs only; needs >= 6 of them, else NaN.
    """
    z = pd.Series(np.nan, index=scores.index)
    vals = scores.to_numpy(dtype=float)
    for i in range(len(vals)):
        if i < MIN_EARLIER_FOR_Z or not np.isfinite(vals[i]):
            continue
        earlier = vals[:i][np.isfinite(vals[:i])]
        if len(earlier) < MIN_EARLIER_FOR_Z:
            continue
        med = float(np.median(earlier))
        mad = float(np.median(np.abs(earlier - med)))
        if mad > 0:
            z.iloc[i] = (vals[i] - med) / (MAD_SCALE * mad)
    return z


def score_history(roll: pd.DataFrame, meta: pd.DataFrame) -> pd.DataFrame:
    """Shrink, then ``wmax``, ``wspread``, ``score`` and ``z`` per cutoff.

    ``w_span = n_eff / (n_eff + 8)``; ``shr = roll * w``;
    ``wmax = max |shr|``; ``wspread = max(shr) - min(shr)``;
    ``score = wmax + wspread``; ``z`` against the asset's own earlier scores.
    """
    w = meta["n_eff"] / (meta["n_eff"] + SHRINK_K)
    shr = roll * w.reindex(roll.columns)
    wmax = shr.abs().max(axis=1)
    wspread = shr.max(axis=1) - shr.min(axis=1)
    score = wmax + wspread
    out = pd.DataFrame({"wmax": wmax, "wspread": wspread, "score": score})
    out["z"] = _robust_z(score)
    return out
