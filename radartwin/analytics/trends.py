"""Per-point velocity, acceleration and seasonal fits (SPEC §3.1).

Units: displacement mm, time decimal years, velocity mm/yr.
"""
from __future__ import annotations

import numpy as np

MIN_EPOCHS_SLOPE = 6
MIN_EPOCHS_SEASONAL = 12


def _slope_and_rms(t: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Least-squares slope and RMS residual: ``np.polyfit(t, y, 1)``."""
    ok = np.isfinite(y)
    if int(ok.sum()) < MIN_EPOCHS_SLOPE:
        return np.nan, np.nan
    slope, intercept = np.polyfit(t[ok], y[ok], 1)
    resid = y[ok] - (slope * t[ok] + intercept)
    return float(slope), float(np.sqrt(np.mean(resid**2)))


def linear_velocity(t: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-row least-squares slope and RMS residual; <6 valid epochs -> NaN."""
    slopes = np.empty(y.shape[0])
    rms = np.empty(y.shape[0])
    for i in range(y.shape[0]):
        slopes[i], rms[i] = _slope_and_rms(np.asarray(t), y[i])
    return slopes, rms


def windowed_velocity(t: np.ndarray, y: np.ndarray, window_years: float = 1.0) -> np.ndarray:
    """Per-row slope on epochs with ``t >= t[-1] - window_years``."""
    t = np.asarray(t)
    keep = t >= t[-1] - window_years
    slopes = np.empty(y.shape[0])
    for i in range(y.shape[0]):
        slopes[i], _ = _slope_and_rms(t[keep], y[i][keep])
    return slopes


def acceleration(t: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Signed change of pace: ``sign(recent) * (|recent| - |long|)``.

    ``recent`` = 1-yr windowed velocity, ``long`` = full-span velocity.
    Positive = speeding up along the current direction.
    """
    long, _ = linear_velocity(t, y)
    recent = windowed_velocity(t, y, 1.0)
    return np.sign(recent) * (np.abs(recent) - np.abs(long))


def seasonal_fit(t: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Fit ``a + b*t + c*sin(2*pi*t) + d*cos(2*pi*t)`` per row.

    Rows with <12 valid epochs keep their raw values (no deseasoning).
    Returns params (n, 4) and the deseasoned series ``y - (c*sin + d*cos)``.
    """
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    n, m = y.shape
    w = 2.0 * np.pi * t
    design = np.column_stack([np.ones(m), t, np.sin(w), np.cos(w)])
    params = np.full((n, 4), np.nan)
    season = np.zeros_like(y)
    if m >= MIN_EPOCHS_SEASONAL and not np.isnan(y).any():
        coef, _, _, _ = np.linalg.lstsq(design, y.T, rcond=None)  # (4, n), all rows at once
        params = coef.T
        season = (design[:, 2:4] @ params[:, 2:4].T).T
    else:
        for i in range(n):
            ok = np.isfinite(y[i])
            if int(ok.sum()) < MIN_EPOCHS_SEASONAL:
                continue
            coef, _, _, _ = np.linalg.lstsq(design[ok], y[i][ok], rcond=None)
            params[i] = coef
            season[i] = design[:, 2] * coef[2] + design[:, 3] * coef[3]
    return params, y - season
