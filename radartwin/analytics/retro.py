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
COHERENCE_WAVELENGTH_MM = 55.465  # Sentinel-1 C-band, SPEC 3.5
MIN_CUTOFF_EPOCHS = 24  # per-point epochs before cutoff for coherence/velocity

# Whole-period EGMS columns banned from per-cutoff quantities (SPEC 3.5).
# Any column ending in "_std" is also banned.
BANNED_WHOLE_PERIOD_COLUMNS = frozenset({
    "mean_velocity",
    "acceleration",
    "seasonality",
    "temporal_coherence",
    "rmse_ts",
})


def is_banned_column(col: object) -> bool:
    """True for whole-period columns banned from per-cutoff code paths."""
    s = str(col)
    return s in BANNED_WHOLE_PERIOD_COLUMNS or s.endswith("_std")


def cutoff_coherence_velocity(t: np.ndarray, y: np.ndarray
                              ) -> tuple[np.ndarray, np.ndarray]:
    """Per-point cutoff coherence and long-term velocity on truncated data.

    ``t`` and ``y`` are already truncated to epochs with ``date < cutoff``
    from one track (SPEC 3.5). Reuses :func:`seasonal_fit` and
    :func:`linear_velocity` from trends.py; no second fitting routine.

    Coherence ``γ = |mean(exp(i·4π·r/λ))|`` with ``λ = 55.465 mm`` from the
    ``seasonal_fit`` residuals ``r``; velocity is ``linear_velocity`` on the
    deseasoned series. Rows with < 24 valid epochs get NaN for both (weight 0).
    """
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    n = y.shape[0]
    params, yd = seasonal_fit(t, y)
    vel, _ = linear_velocity(t, yd)
    coherence = np.full(n, np.nan)
    w = 2.0 * np.pi * t
    sin_w = np.sin(w)
    cos_w = np.cos(w)
    lam = COHERENCE_WAVELENGTH_MM
    for i in range(n):
        yrow = y[i]
        if int(np.isfinite(yrow).sum()) < MIN_CUTOFF_EPOCHS:
            vel[i] = np.nan
            continue
        p = params[i]
        if not np.all(np.isfinite(p)):
            continue
        ok = np.isfinite(yrow)
        pred = p[0] + p[1] * t[ok] + p[2] * sin_w[ok] + p[3] * cos_w[ok]
        r = yrow[ok] - pred
        coherence[i] = float(np.abs(np.mean(np.exp(1j * 4.0 * np.pi * r / lam))))
    return coherence, vel


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


def span_meta(pts: pd.DataFrame, cutoff: str | None = None,
              point_coherence=None, use_egms_columns: bool = False) -> pd.DataFrame:
    """Per-span ``n``, ``tracks``, ``coherence`` and ``n_eff = n * coherence``.

    Baseline (``use_egms_columns=True`` only): mean of the whole-period EGMS
    ``temporal_coherence`` column; ``cutoff`` ignored. This path reproduces
    the pre-4d numbers exactly and exists only for the baseline reproduction.

    Leak-free (default): ``cutoff`` (required) labels the cutoff and
    ``point_coherence`` (array or Series aligned with ``pts`` rows, required)
    gives the per-point cutoff coherence at that cutoff. ``n_eff`` is the sum
    with NaN -> 0 (weight 0) and ``coherence = n_eff / n``, so
    ``n_eff = n * coherence`` still holds. Raises when ``point_coherence``
    is missing unless ``use_egms_columns=True`` is passed explicitly.
    """
    if use_egms_columns:
        grp = pts.groupby("span")
        meta = pd.DataFrame({
            "n": grp.size(),
            "tracks": grp["track"].nunique(),
            "coherence": grp["temporal_coherence"].mean(),
        })
        meta["n_eff"] = meta["n"] * meta["coherence"]
        return meta
    if point_coherence is None:
        raise ValueError(
            "span_meta leak-free requires point_coherence "
            "(per-cutoff coherence); pass use_egms_columns=True explicitly "
            "to reproduce the whole-period baseline via temporal_coherence")
    if cutoff is None:
        raise ValueError("span_meta leak-free requires cutoff")
    if isinstance(point_coherence, pd.Series):
        coh = point_coherence.reindex(pts.index).to_numpy(dtype=float)
    else:
        coh = np.asarray(point_coherence, dtype=float)
        if len(coh) != len(pts):
            raise ValueError(
                f"point_coherence length {len(coh)} != pts rows {len(pts)}")
    work = pts.copy()
    work["_cutoff_coherence"] = coh
    grp = work.groupby("span")
    n = grp.size()
    tracks = grp["track"].nunique()
    n_eff = grp["_cutoff_coherence"].agg(
        lambda s: float(np.nansum(s.to_numpy(dtype=float))))
    coherence = n_eff / n
    meta = pd.DataFrame({"n": n, "tracks": tracks, "coherence": coherence})
    meta["n_eff"] = n_eff
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


def score_history(roll: pd.DataFrame, meta: pd.DataFrame | None = None,
                  meta_by_cutoff: dict | None = None) -> pd.DataFrame:
    """Shrink, then ``wmax``, ``wspread``, ``score`` and ``z`` per cutoff.

    ``w_span = n_eff / (n_eff + 8)``; ``shr = roll * w``;
    ``wmax = max |shr|``; ``wspread = max(shr) - min(shr)``;
    ``score = wmax + wspread``; ``z`` against the asset's own earlier scores.

    Baseline: ``meta`` alone (one static shrink per span). Leak-free:
    ``meta_by_cutoff`` maps each cutoff to its span meta, so shrink weights
    can differ between cutoffs.
    """
    if meta_by_cutoff is None:
        if meta is None:
            raise ValueError("score_history needs meta or meta_by_cutoff")
        w = meta["n_eff"] / (meta["n_eff"] + SHRINK_K)
        shr = roll * w.reindex(roll.columns)
        wmax = shr.abs().max(axis=1)
        wspread = shr.max(axis=1) - shr.min(axis=1)
        score = wmax + wspread
        out = pd.DataFrame({"wmax": wmax, "wspread": wspread, "score": score})
        out["z"] = _robust_z(score)
        return out
    wmax_vals: dict = {}
    wspread_vals: dict = {}
    score_vals: dict = {}
    for cutoff in roll.index:
        m = meta_by_cutoff[cutoff]
        w = m["n_eff"] / (m["n_eff"] + SHRINK_K)
        shr_row = roll.loc[cutoff] * w.reindex(roll.columns)
        wmax_vals[cutoff] = float(shr_row.abs().max())
        wspread_vals[cutoff] = float(shr_row.max() - shr_row.min())
        score_vals[cutoff] = float(wmax_vals[cutoff] + wspread_vals[cutoff])
    score = pd.Series(score_vals)
    out = pd.DataFrame({
        "wmax": pd.Series(wmax_vals),
        "wspread": pd.Series(wspread_vals),
        "score": score,
    })
    out["z"] = _robust_z(score)
    return out
