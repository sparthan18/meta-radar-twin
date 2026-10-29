"""Focused regression tests for leak-free coherence/velocity (SPEC §3.5).

Stdlib-only asserts; runnable without pytest::

    .venv/bin/python tests/test_leakfree.py

Phase 4d: cutoff coherence/velocity, per-cutoff span meta and scoring.
Phase 4e: leak-free is the default; the whole-period path only on explicit
``use_egms_columns=True``. Missing per-cutoff inputs raise instead of
silently falling back to whole-period columns.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.analytics.retro import (  # noqa: E402
    cutoff_coherence_velocity,
    score_history,
    span_meta,
)
from radartwin.decide.features import asset_features  # noqa: E402


def test_cutoff_coherence_velocity_clean() -> None:
    t = np.linspace(0, 3, 40)
    y = np.stack([2.0 * t + 1.0, -1.5 * t])
    coh, vel = cutoff_coherence_velocity(t, y)
    assert np.allclose(vel, [2.0, -1.5], atol=1e-9), vel
    assert bool(np.all(coh > 0.99)), coh


def test_cutoff_coherence_velocity_needs_24() -> None:
    t = np.linspace(0, 1, 10)
    y = np.ones((2, 10))
    coh, vel = cutoff_coherence_velocity(t, y)
    assert bool(np.isnan(coh).all()), coh
    assert bool(np.isnan(vel).all()), vel


def test_span_meta_baseline_vs_cutoff() -> None:
    pts = pd.DataFrame({
        "span": [0, 0, 1, 1],
        "track": ["a", "b", "a", "b"],
        "temporal_coherence": [0.8, 0.6, 0.9, 0.7],
    })
    base = span_meta(pts, use_egms_columns=True)
    assert np.allclose(base["coherence"].to_numpy(), [0.7, 0.8]), base
    assert np.allclose(base["n_eff"].to_numpy(), [1.4, 1.6]), base
    cut = span_meta(pts, cutoff="2023-10-01",
                    point_coherence=pd.Series([1.0, 0.0, 0.5, np.nan]))
    # NaN has weight 0: span 0 sums to 1.0, span 1 to 0.5.
    assert np.allclose(cut["n_eff"].to_numpy(), [1.0, 0.5]), cut
    assert np.allclose(cut["coherence"].to_numpy(), [0.5, 0.25]), cut


def test_score_history_per_cutoff() -> None:
    roll = pd.DataFrame(
        [[1.0, -2.0], [3.0, 1.0]],
        index=["2022-01-01", "2022-02-01"], columns=[0, 1])
    meta = pd.DataFrame({"n": [4, 4], "tracks": [2, 2],
                         "coherence": [0.5, 0.5], "n_eff": [2.0, 2.0]},
                        index=[0, 1])
    static = score_history(roll, meta)
    same = score_history(roll, meta_by_cutoff={c: meta for c in roll.index})
    pd.testing.assert_frame_equal(static, same)
    other = meta.copy()
    other["n_eff"] = [100.0, 100.0]
    varied = score_history(
        roll, meta_by_cutoff={"2022-01-01": meta, "2022-02-01": other})
    assert varied.loc["2022-02-01", "wmax"] > same.loc["2022-02-01", "wmax"]


def test_span_meta_raises_without_point_coherence() -> None:
    pts = pd.DataFrame({
        "span": [0, 0, 1, 1],
        "track": ["a", "b", "a", "b"],
        "temporal_coherence": [0.8, 0.6, 0.9, 0.7],
    })
    for kwargs in ({}, {"cutoff": "2023-10-01"}):
        try:
            span_meta(pts, **kwargs)
        except ValueError as exc:
            assert "point_coherence" in str(exc), exc
            assert "use_egms_columns=True" in str(exc), exc
        else:
            raise AssertionError(f"span_meta{kwargs} did not raise")
    try:
        span_meta(pts, point_coherence=[1.0, 0.0, 0.5, 0.5])
    except ValueError as exc:
        assert "cutoff" in str(exc), exc
    else:
        raise AssertionError("span_meta without cutoff did not raise")


def test_span_meta_baseline_switch_reproduces_old_numbers() -> None:
    pts = pd.DataFrame({
        "span": [0, 0, 1, 1],
        "track": ["a", "b", "a", "b"],
        "temporal_coherence": [0.8, 0.6, 0.9, 0.7],
    })
    base = span_meta(pts, use_egms_columns=True)
    assert np.allclose(base["coherence"].to_numpy(), [0.7, 0.8]), base
    assert np.allclose(base["n_eff"].to_numpy(), [1.4, 1.6]), base


def _tiny_state(*, with_velocity: bool) -> dict:
    import geopandas as gpd
    from shapely.geometry import Polygon

    cutoff = "2022-01-01"
    bridges = gpd.GeoDataFrame(
        {"asset_id": [0], "name": ["Testbrücke"]},
        geometry=[Polygon([(0, 0), (0.001, 0), (0.001, 0.001), (0, 0.001)])],
        crs="EPSG:4326",
    )
    pts = pd.DataFrame({
        "asset_id": [0, 0],
        "track": ["asc_044", "desc_095"],
        "mean_velocity": [-0.51, 0.18],
    })
    scores = pd.DataFrame({"Testbrücke": [1.0]}, index=[cutoff])
    wmax = pd.DataFrame({"Testbrücke": [0.6]}, index=[cutoff])
    wspread = pd.DataFrame({"Testbrücke": [0.4]}, index=[cutoff])
    z = pd.DataFrame({"Testbrücke": [0.0]}, index=[cutoff])
    meta = {"Testbrücke": pd.DataFrame(
        {"n": [2], "tracks": [2], "coherence": [0.5], "n_eff": [1.0]})}
    state = {
        "bridges": bridges, "pts": pts, "scores": scores, "wmax": wmax,
        "wspread": wspread, "z": z, "cutoffs": [cutoff], "meta": meta,
    }
    if with_velocity:
        state["velocity"] = pd.DataFrame(
            {"Testbrücke": [2.5]}, index=[cutoff])
    return state


def test_asset_features_raises_without_velocity_table() -> None:
    state = _tiny_state(with_velocity=False)
    try:
        asset_features(state, "2022-01-01")
    except ValueError as exc:
        assert "velocity" in str(exc), exc
        assert "use_egms_columns=True" in str(exc), exc
    else:
        raise AssertionError("asset_features without velocity did not raise")


def test_asset_features_baseline_switch_reproduces_old_numbers() -> None:
    state = _tiny_state(with_velocity=False)
    feats = asset_features(state, "2022-01-01", use_egms_columns=True)
    assert np.allclose(feats["long_term_velocity_mm_yr"].to_numpy(),
                       [(-0.51 + 0.18) / 2]), feats
    leakfree = _tiny_state(with_velocity=True)
    got = asset_features(leakfree, "2022-01-01")
    assert np.allclose(got["long_term_velocity_mm_yr"].to_numpy(), [2.5]), got


if __name__ == "__main__":
    test_cutoff_coherence_velocity_clean()
    test_cutoff_coherence_velocity_needs_24()
    test_span_meta_baseline_vs_cutoff()
    test_score_history_per_cutoff()
    test_span_meta_raises_without_point_coherence()
    test_span_meta_baseline_switch_reproduces_old_numbers()
    test_asset_features_raises_without_velocity_table()
    test_asset_features_baseline_switch_reproduces_old_numbers()
    print("tests/test_leakfree.py: 8 passed")
