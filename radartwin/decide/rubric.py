"""Deterministic flags, persistence and risk ladder (SPEC §4).

General engineering principles behind the rules:

- Bulk motion only matters above the sensor noise floor; below it, a
  non-zero velocity is measurement scatter, not movement.
- Whether motion is *unusual* is judged against peers measured by the same
  instrument at the same time, not against a fixed number: a city-wide
  percentile absorbs seasonal processing artefacts that hit every asset.
- An asset moving differently along its length is under strain; uniform
  settlement of the whole structure is far less concerning.
- An asset exceeding anything in its own measured record deserves attention
  even when its absolute values look modest; history is the strictest
  baseline available.
- A record exceedance concentrated at one end of the structure is the
  strongest single-epoch warning sign: it combines an unusual amplitude
  with a strain-inducing shape.
- Only a warning firing now reaches the top of the ladder: raising "high"
  on past warnings kept quiet assets high for a year (5-8 of 19 bridges
  high in most months), so the 12-month escalation count is reported as
  evidence, never as a level raiser. A recently escalated asset stays
  elevated for a few months even when the current epoch looks quiet.
  History is counted only from epochs at or before the current one, never
  from the future.
- Thin or blind measurements cap the verdict instead of raising it: few
  scatterers, a single viewing direction, or a structure radar barely sees
  can keep an asset on the watchlist, but never send an inspection crew.
- The owner's own inspection grade is an external input, not a radar
  finding: it is reported alongside the ladder verdict with its source,
  and headline counts use the ladder alone so every asset can reach every
  level.

``decide`` is an interim deterministic mapping kept behind the decision
schema (pattern, risk_level, needs_inspection) so a decision model can be
slotted in later. Its output carries ``source: "rubric"`` to distinguish it.
"""
from __future__ import annotations

import math
from collections.abc import Mapping

import pandas as pd

VELOCITY_NOISE_FLOOR = 1.5  # mm/yr; EGMS noise floor ~1-2 mm/yr
OUTLIER_Z = 2.0
MIN_SCATTERERS = 20
MIN_TRACKS = 2
ELEVATED_MONTHS_AFTER_ESC = 3  # a past escalation keeps "elevated" this long

FLAG_NAMES = (
    "moving",
    "accelerating",
    "differential",
    "outlier",
    "low_quality",
    "low_coverage",
    "escalate",
)


def _num(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def flags(features: Mapping | pd.Series) -> dict[str, bool]:
    """Deterministic flags for one asset's feature row (SPEC §4)."""
    f = dict(features) if isinstance(features, Mapping) else features.to_dict()
    vel = _num(f.get("long_term_velocity_mm_yr"))
    wmax = _num(f.get("max_span_velocity_change_mm_yr"))
    wspread = _num(f.get("span_to_span_spread_mm_yr"))
    p80_vel = _num(f.get("city_p80_velocity_change_mm_yr"))
    p80_spread = _num(f.get("city_p80_spread_mm_yr"))
    z = _num(f.get("score_vs_own_history_z"))
    n = _num(f.get("scatterers"))
    ntracks = _num(f.get("tracks"))

    moving = math.isfinite(vel) and abs(vel) > VELOCITY_NOISE_FLOOR
    accelerating = math.isfinite(wmax) and math.isfinite(p80_vel) and wmax > p80_vel
    differential = math.isfinite(wspread) and math.isfinite(p80_spread) and wspread > p80_spread
    outlier = math.isfinite(z) and z > OUTLIER_Z
    low_quality = (math.isfinite(n) and n < MIN_SCATTERERS) or (
        math.isfinite(ntracks) and ntracks < MIN_TRACKS
    )
    low_coverage = f.get("radar_coverage") == "low"
    escalate = bool(outlier and differential)
    return {
        "moving": bool(moving),
        "accelerating": bool(accelerating),
        "differential": bool(differential),
        "outlier": bool(outlier),
        "low_quality": bool(low_quality),
        "low_coverage": bool(low_coverage),
        "escalate": escalate,
    }


_RISK_ORDER = ["none", "watch", "elevated", "high"]


def decide(features: Mapping | pd.Series, flag_values: Mapping) -> dict:
    """Interim deterministic decision for one asset (SPEC §4 risk ladder).

    ``features`` supplies persistence (``months_since_esc`` keeps a recent
    escalation elevated; ``escalations_12m`` is memo evidence only) and the
    owner-register ``condition`` for the overlay; the ladder verdict derives
    from ``flags`` plus persistence. Thin or blind measurements cap risk at
    ``"watch"``.
    """
    f = dict(features) if isinstance(features, Mapping) else features.to_dict()
    fl = {name: bool(flag_values.get(name, False)) for name in FLAG_NAMES}
    if fl["low_quality"]:
        pattern = "unreliable"
    elif fl["differential"]:
        pattern = "differential"
    elif fl["accelerating"]:
        pattern = "accelerating"
    elif fl["moving"]:
        pattern = "uniform_settlement"
    else:
        pattern = "stable"

    mse = _num(f.get("months_since_esc"))
    # escalations_12m is evidence for the memo, never a level raiser.
    high = bool(fl["escalate"])
    elevated = bool(
        (math.isfinite(mse) and mse <= ELEVATED_MONTHS_AFTER_ESC)
        or (fl["accelerating"] and fl["differential"])
        or fl["outlier"]
    )
    watch = bool(fl["moving"] or fl["accelerating"] or fl["differential"])
    if high:
        risk = "high"
    elif elevated:
        risk = "elevated"
    elif watch:
        risk = "watch"
    else:
        risk = "none"
    if (fl["low_quality"] or fl["low_coverage"]) and _RISK_ORDER.index(risk) > _RISK_ORDER.index(
        "watch"
    ):
        risk = "watch"
    owner_condition_alert = bool(risk == "high" and f.get("condition") == "poor")
    return {
        "pattern": pattern,
        "risk_level": risk,
        "needs_inspection": risk == "high",
        "owner_condition_alert": owner_condition_alert,
        "source": "rubric",
    }
