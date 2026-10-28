#!/usr/bin/env python3
"""Features + flags + interim rubric decision per bridge (stage 3b).

Usage::

    uv run python scripts/decisions.py <cutoff|all>

Prints the decision table and writes ``out/decisions_<cutoff>.csv``. With
``all``, runs every cutoff in the state and also writes
``out/escalation_counts.csv``.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.decide.coverage import not_monitored_bridges  # noqa: E402
from radartwin.decide.features import asset_features  # noqa: E402
from radartwin.decide.rubric import decide, flags  # noqa: E402

STATE = ROOT / "out" / "dresden_state.pkl"
CHIP = ROOT / "data" / "carola" / "s1_rtc_vv.tif"
FLAG_LETTERS = [
    ("moving", "M"),
    ("accelerating", "A"),
    ("differential", "D"),
    ("outlier", "O"),
    ("low_quality", "Q"),
    ("low_coverage", "C"),
]

_NOT_MONITORED_CACHE: pd.DataFrame | None = None


def get_not_monitored() -> pd.DataFrame:
    """Cached not-monitored list (cutoff-independent)."""
    global _NOT_MONITORED_CACHE
    if _NOT_MONITORED_CACHE is None:
        _NOT_MONITORED_CACHE = not_monitored_bridges()
    return _NOT_MONITORED_CACHE


def flag_string(fl: dict) -> str:
    return "".join(letter if fl.get(name) else "." for name, letter in FLAG_LETTERS)


def decide_cutoff(cutoff: str) -> pd.DataFrame:
    """Features + flags + decision for every bridge at one cutoff."""
    feats = asset_features(STATE, cutoff, s1_rtc_vv=CHIP if CHIP.exists() else None)
    rows = []
    for _, row in feats.iterrows():
        fl = flags(row)
        dec = decide(row, fl)
        rows.append({**row.to_dict(), **fl, "reason": "", **dec})
    table = pd.DataFrame(rows)
    dropped = get_not_monitored()
    for _, d in dropped.iterrows():
        rows.append({
            "asset": d["asset"],
            "cutoff": cutoff,
            "scatterers": int(d["scatterers"]),
            "tracks": int(d["tracks"]),
            "spans": 0,
            "long_term_velocity_mm_yr": float("nan"),
            "max_span_velocity_change_mm_yr": float("nan"),
            "span_to_span_spread_mm_yr": float("nan"),
            "anomaly_score": float("nan"),
            "score_vs_own_history_z": float("nan"),
            "rank_in_city": float("nan"),
            "bridges_in_city": int(len(table)),
            "city_p80_velocity_change_mm_yr": float(table["city_p80_velocity_change_mm_yr"].iloc[0]),
            "city_p80_spread_mm_yr": float(table["city_p80_spread_mm_yr"].iloc[0]),
            "condition": "unknown",
            "condition_source": "none",
            "escalations_12m": 0,
            "months_since_esc": float("nan"),
            "points_per_ha": float(d["points_per_ha"]),
            "bright_fraction": float("nan"),
            "radar_coverage": "none",
            "moving": False,
            "accelerating": False,
            "differential": False,
            "outlier": False,
            "low_quality": False,
            "low_coverage": False,
            "escalate": False,
            "reason": str(d["reason"]),
            "pattern": "not_monitored",
            "risk_level": "unknown",
            "needs_inspection": False,
            "owner_condition_alert": False,
            "source": "rubric",
        })
    full = pd.DataFrame(rows)
    full["sort_rank"] = full["rank_in_city"].fillna(9999)
    return full.sort_values(["sort_rank", "asset"]).drop(columns=["sort_rank"]).reset_index(drop=True)


def print_table(table: pd.DataFrame) -> None:
    print(f"{'rank':>4} {'asset':<42} {'n':>4} {'wmax':>5} {'wspr':>5} "
          f"{'z':>6} {'flags':>6} {'E':>1} {'e12':>3} {'mse':>3} {'pattern':<18} {'risk':<9} insp alert")
    for _, r in table.iterrows():
        z = r["score_vs_own_history_z"]
        z_s = f"{z:>6.2f}" if pd.notna(z) else "     -"
        wmax = r["max_span_velocity_change_mm_yr"]
        wmax_s = f"{wmax:>5.2f}" if pd.notna(wmax) else "    -"
        wspr = r["span_to_span_spread_mm_yr"]
        wspr_s = f"{wspr:>5.2f}" if pd.notna(wspr) else "    -"
        rank = str(int(r["rank_in_city"])) if pd.notna(r["rank_in_city"]) else "-"
        mse = r["months_since_esc"]
        mse_s = str(int(mse)) if pd.notna(mse) else "-"
        print(f"{rank:>4} {r['asset']:<42} {int(r['scatterers']):>4} "
              f"{wmax_s} {wspr_s} "
              f"{z_s} {flag_string(r.to_dict()):>6} "
              f"{'E' if r['escalate'] else '.':>1} {int(r['escalations_12m']):>3} {mse_s:>3} "
              f"{r['pattern']:<18} {r['risk_level']:<9} "
              f"{'yes' if r['needs_inspection'] else 'no':<4} "
              f"{'ALERT' if r.get('owner_condition_alert') else ''}")
        if r["pattern"] == "not_monitored":
            print(f"      reason: {r['reason']}")


def main(which: str) -> int:
    import pickle

    with open(STATE, "rb") as fh:
        cutoffs = pickle.load(fh)["cutoffs"]
    if which == "all":
        selected = cutoffs
    elif which in cutoffs:
        selected = [which]
    else:
        print(f"unknown cutoff {which!r} (have {cutoffs[0]}..{cutoffs[-1]})")
        return 1
    dropped = get_not_monitored()
    print("not monitored by radar:")
    if len(dropped):
        print(dropped[["asset", "scatterers", "tracks", "len_m", "area_ha",
                       "points_per_ha", "reason"]].to_string(index=False))
    else:
        print("  (none)")
    out_dir = ROOT / "out"
    counts = []
    for cutoff in selected:
        table = decide_cutoff(cutoff)
        table.to_csv(out_dir / f"decisions_{cutoff}.csv", index=False)
        if which != "all":
            print_table(table)
        analysed = table[table["pattern"] != "not_monitored"]
        carola = analysed[analysed["asset"] == "Carolabrücke"]
        counts.append({
            "cutoff": cutoff,
            "n_bridges": int(len(analysed)),
            "n_not_monitored": int(len(table) - len(analysed)),
            "n_high": int((analysed["risk_level"] == "high").sum()),
            "n_elevated": int((analysed["risk_level"] == "elevated").sum()),
            "n_watch": int((analysed["risk_level"] == "watch").sum()),
            "carola_risk": carola["risk_level"].iloc[0] if len(carola) else "",
            "carola_escalations_12m": int(carola["escalations_12m"].iloc[0]) if len(carola) else 0,
            "owner_condition_alerts": int(table["owner_condition_alert"].sum()),
        })
    if which == "all":
        counts_df = pd.DataFrame(counts)
        counts_df.to_csv(out_dir / "escalation_counts.csv", index=False)
        print(counts_df.to_string(index=False))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
