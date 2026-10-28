"""Per-asset features per cutoff (SPEC §3.6): what a decision model sees.

Small and literal: pre-computed trend values plus deterministic context
(city percentiles, owner-register condition, radar coverage). No arithmetic
is left for the reader.
"""
from __future__ import annotations

import math
import pickle
from pathlib import Path

import pandas as pd

from radartwin.agents.fidelity import radar_visibility
from radartwin.config import SITES
from radartwin.decide.rubric import OUTLIER_Z

COLUMNS = [
    "asset",
    "cutoff",
    "scatterers",
    "tracks",
    "spans",
    "long_term_velocity_mm_yr",
    "max_span_velocity_change_mm_yr",
    "span_to_span_spread_mm_yr",
    "anomaly_score",
    "score_vs_own_history_z",
    "rank_in_city",
    "bridges_in_city",
    "city_p80_velocity_change_mm_yr",
    "city_p80_spread_mm_yr",
    "condition",
    "condition_source",
    "escalations_12m",
    "months_since_esc",
    "points_per_ha",
    "bright_fraction",
    "radar_coverage",
]


def _load_state(state: dict | str | Path) -> dict:
    if isinstance(state, dict):
        return state
    with open(state, "rb") as fh:
        return pickle.load(fh)


def _condition(asset: str) -> str:
    for site in SITES.values():
        if site.condition and asset in site.condition:
            return site.condition[asset]
    return "unknown"


def _condition_source(asset: str) -> str:
    for site in SITES.values():
        if site.condition_source and asset in site.condition_source:
            return site.condition_source[asset]
    return "none"


def _month_diff(later: pd.Timestamp, earlier: pd.Timestamp) -> int:
    return (later.year - earlier.year) * 12 + (later.month - earlier.month)


def escalation_history(state: dict, cutoff: str) -> dict[str, tuple[int, float]]:
    """Leak-free persistence per asset at ``cutoff`` (SPEC §4).

    Uses only cutoffs at or before ``cutoff``. Returns
    ``asset -> (escalations_12m, months_since_esc)`` where
    ``months_since_esc`` is NaN when no escalation fired yet.
    The 12-month window holds the cutoffs ``c`` with
    ``cutoff - 12 months < c <= cutoff`` (twelve monthly cutoffs).
    """
    cutoffs: list[str] = state["cutoffs"]
    if cutoff not in cutoffs:
        raise KeyError(f"cutoff {cutoff} not in state")
    earlier = [c for c in cutoffs if c <= cutoff]
    current = pd.Timestamp(cutoff)
    window_start = current - pd.DateOffset(months=12)
    window = [c for c in earlier if pd.Timestamp(c) > window_start]
    wspread: pd.DataFrame = state["wspread"]
    z: pd.DataFrame = state["z"]
    p80 = {c: float(wspread.loc[c].quantile(0.8)) for c in earlier}
    out: dict[str, tuple[int, float]] = {}
    for asset in wspread.columns:
        esc_dates = []
        for c in earlier:
            wv = wspread.loc[c, asset]
            zv = z.loc[c, asset]
            try:
                wv_f = float(wv)
                zv_f = float(zv)
            except (TypeError, ValueError):
                continue
            if (
                math.isfinite(wv_f)
                and math.isfinite(zv_f)
                and math.isfinite(p80[c])
                and zv_f > OUTLIER_Z
                and wv_f > p80[c]
            ):
                esc_dates.append(c)
        esc12 = sum(1 for c in esc_dates if c in set(window))
        if esc_dates:
            mse: float = float(_month_diff(current, pd.Timestamp(esc_dates[-1])))
        else:
            mse = float("nan")
        out[asset] = (int(esc12), mse)
    return out


def asset_features(
    state: dict | str | Path,
    cutoff: str,
    s1_rtc_vv: str | Path | None = None,
) -> pd.DataFrame:
    """One row per analysed bridge at ``cutoff`` with exactly the SPEC §3.6 fields.

    ``state`` is the ``rank_city`` state dict or the path of the pickle (e.g.
    ``out/dresden_state.pkl``). ``long_term_velocity_mm_yr`` is the mean EGMS
    ``mean_velocity`` over the asset's points; city p80 values are computed
    across the bridges at that cutoff; ``condition`` comes from the owner
    register (``SITES[*].condition``), default ``"unknown"``. Without a radar
    chip (``s1_rtc_vv=None``), ``bright_fraction`` is null.
    """
    st = _load_state(state)
    if cutoff not in st["scores"].index:
        raise KeyError(f"cutoff {cutoff} not in state (have {st['cutoffs'][0]}..{st['cutoffs'][-1]})")
    scores = st["scores"].loc[cutoff]
    wmax = st["wmax"].loc[cutoff]
    wspread = st["wspread"].loc[cutoff]
    z = st["z"].loc[cutoff]
    ranks = scores.rank(ascending=False, method="min").astype(int)
    p80_vel = float(wmax.quantile(0.8))
    p80_spread = float(wspread.quantile(0.8))
    pts: pd.DataFrame = st["pts"]
    bridges = st["bridges"]
    by_asset = pts.groupby("asset_id")
    vis = radar_visibility(st, s1_rtc_vv=s1_rtc_vv).set_index("asset")
    persist = escalation_history(st, cutoff)
    rows = []
    for _, b in bridges.sort_values("name").iterrows():
        bp = by_asset.get_group(b["asset_id"]) if b["asset_id"] in by_asset.groups else None
        n = 0 if bp is None else len(bp)
        ntracks = 0 if bp is None else int(bp["track"].nunique())
        vel = float("nan") if bp is None else float(bp["mean_velocity"].mean())
        name = b["name"]
        esc12, mse = persist[name]
        rows.append({
            "asset": name,
            "cutoff": cutoff,
            "scatterers": n,
            "tracks": ntracks,
            "spans": int(len(st["meta"][name])),
            "long_term_velocity_mm_yr": vel,
            "max_span_velocity_change_mm_yr": float(wmax[name]),
            "span_to_span_spread_mm_yr": float(wspread[name]),
            "anomaly_score": float(scores[name]),
            "score_vs_own_history_z": float(z[name]),
            "rank_in_city": int(ranks[name]),
            "bridges_in_city": int(len(bridges)),
            "city_p80_velocity_change_mm_yr": p80_vel,
            "city_p80_spread_mm_yr": p80_spread,
            "condition": _condition(name),
            "condition_source": _condition_source(name),
            "escalations_12m": int(esc12),
            "months_since_esc": mse,
            "points_per_ha": float(vis.loc[name, "points_per_ha"]),
            "bright_fraction": float(vis.loc[name, "bright_fraction"]),
            "radar_coverage": str(vis.loc[name, "radar_coverage"]),
        })
    return pd.DataFrame(rows, columns=COLUMNS)
