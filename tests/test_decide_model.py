"""Focused regression tests for radartwin/decide/model.py (SPEC §5.0).

Stdlib-only asserts; runnable without pytest::

    .venv/bin/python tests/test_decide_model.py

Covers the phase-4 cache bugs: the model input must be identical whether the
caller passes a pure §3.6 feature row or an enriched decisions-table row
(a blacklist let rubric-derived fields in and split the cache), and cache
keys must be stable across processes (a lazily resolved effort made fresh
processes miss stored entries and silently re-draw samples).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.decide import model as M  # noqa: E402

FEATURES = {
    "asset": "Carolabrücke",
    "cutoff": "2024-09-01",
    "scatterers": 61,
    "tracks": 3,
    "spans": 3,
    "long_term_velocity_mm_yr": -0.51,
    "max_span_velocity_change_mm_yr": 3.99,
    "span_to_span_spread_mm_yr": 4.20,
    "anomaly_score": 8.19,
    "score_vs_own_history_z": 4.241,
    "rank_in_city": 1,
    "bridges_in_city": 19,
    "city_p80_velocity_change_mm_yr": 1.07,
    "city_p80_spread_mm_yr": 1.31,
    "condition": "poor",
    "condition_source": "owner register",
    "escalations_12m": 3,
    "months_since_esc": 0.0,
    "points_per_ha": 54.1,
    "bright_fraction": 0.643,
    "radar_coverage": "ok",
}

FLAGS = {
    "moving": False,
    "accelerating": True,
    "differential": True,
    "outlier": True,
    "low_quality": False,
    "low_coverage": False,
    "escalate": True,
}

# What scripts/decisions.py passes: features + flags + verdict + metadata.
ENRICHED_ROW = {
    **FEATURES,
    **FLAGS,
    "reason": "",
    "pattern": "differential",
    "risk_level": "high",
    "needs_inspection": True,
    "owner_condition_alert": True,
    "source": "rubric",
}


def test_input_whitelists_features_and_flags() -> None:
    payload = M.build_model_input(FEATURES, FLAGS)
    assert set(payload) == (M.MODEL_FEATURE_KEYS | {"flags"}), set(payload)
    assert payload["flags"] == FLAGS
    assert payload["asset"] == "Carolabrücke"
    assert payload["escalations_12m"] == 3
    for leaked in ("condition", "condition_source", "pattern", "risk_level",
                   "needs_inspection", "owner_condition_alert", "source", "reason",
                   "moving", "escalate"):
        assert leaked not in payload, leaked


def test_enriched_row_matches_pure_row() -> None:
    """Decisions-table rows and audit feature rows must hash to one input."""
    assert M.build_model_input(ENRICHED_ROW, FLAGS) == M.build_model_input(FEATURES, FLAGS)


def test_integer_float_drift_matches() -> None:
    """Pandas upcasts int columns with NaN rows to float (rank 1 -> 1.0);
    both spellings must build identical inputs (``1.0 == 1`` but they
    serialize differently, which once split the cache)."""
    as_float = dict(FEATURES)
    as_float["rank_in_city"] = 1.0
    as_float["scatterers"] = 61.0
    assert M.build_model_input(as_float, FLAGS) == M.build_model_input(FEATURES, FLAGS)


def test_cache_key_stable_and_distinct_per_sample() -> None:
    payload = M.build_model_input(FEATURES, FLAGS)
    assert M.reasoning_effort() == "minimal"
    first = M._cache_key(payload, 0)
    assert M._cache_key(payload, 0) == first  # deterministic, no process state
    assert M._cache_key(payload, 1) != first  # votes stay distinct
    assert len(first) == 64


def test_parse_and_majority() -> None:
    assert M._parse_answer("C D A") == ("differential", "high", True)
    assert M._parse_answer("C D") is None
    assert M._parse_answer("C D A now") is None
    assert M._majority(["a", "b", "a"]) == ("a", 2 / 3)
    assert M._majority(["b", "a"]) == ("b", 0.5)  # tie -> first-appearing


def test_anonymised_input_hides_name_and_date_only() -> None:
    """Anonymised mode swaps asset for "bridge NN" and drops cutoff; nothing else."""
    import json
    import re

    named = M.build_model_input(FEATURES, FLAGS)
    anon = M.build_model_input(FEATURES, FLAGS, anonymous=True)
    assert M.build_model_input(FEATURES, FLAGS, anonymous=False) == named  # named default
    assert anon["asset"] == "bridge 04"  # Carolabrücke is 4th by OSM asset id
    assert re.fullmatch(r"bridge \d{2}", anon["asset"])
    assert "cutoff" not in anon
    blob = json.dumps(anon, sort_keys=True)
    for name in M._ANON_ORDER:
        assert name not in blob, name
    assert FEATURES["cutoff"] not in blob
    assert not re.search(r"\d{4}-\d{2}-\d{2}", blob)
    assert set(anon) == set(named) - {"cutoff"}
    for key in anon:
        if key == "asset":
            continue
        assert anon[key] == named[key], key
    assert set(M.ANON_BY_ASSET.values()) == {f"bridge {i:02d}" for i in range(1, 20)}
    assert M.ANON_BY_ASSET["Albertbrücke"] == "bridge 01"
    assert M.ANON_BY_ASSET["Waltherstraße"] == "bridge 19"
    assert M.anonymised_asset("Not a bridge") == "bridge 00"


def test_anonymised_cache_key_differs() -> None:
    named = M.build_model_input(FEATURES, FLAGS)
    anon = M.build_model_input(FEATURES, FLAGS, anonymous=True)
    for sample in range(M.K_VOTES):
        assert M._cache_key(anon, sample) != M._cache_key(named, sample)
    assert M._cache_key(named, 100) != M._cache_key(named, 0)  # noise baseline offset


if __name__ == "__main__":
    test_input_whitelists_features_and_flags()
    test_enriched_row_matches_pure_row()
    test_integer_float_drift_matches()
    test_cache_key_stable_and_distinct_per_sample()
    test_parse_and_majority()
    test_anonymised_input_hides_name_and_date_only()
    test_anonymised_cache_key_differs()
    print("tests/test_decide_model.py: 7 passed")
