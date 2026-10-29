#!/usr/bin/env python3
"""Features + flags + interim rubric decision per bridge (phase 3b).

Usage::

    uv run python scripts/decisions.py [--model] <cutoff|all>

Prints the decision table and writes ``out/decisions_<cutoff>.csv``. With
``all``, runs every cutoff in the state and also writes
``out/escalation_counts.csv``. With ``--model`` (phase 4), every analysed
bridge also gets a Muse Spark decision; the rubric table is reused unchanged
and the side-by-side result goes to ``out/model_decisions_<cutoff>.csv``
(plus ``out/model_agreement.csv`` and ``out/model_disagreements.csv`` with
``all``). Not-monitored bridges keep their deterministic row.
"""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
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


def decide_cutoff(cutoff: str, state_path: str | Path | None = None,
                  use_egms_columns: bool = False) -> pd.DataFrame:
    """Features + flags + decision for every bridge at one cutoff."""
    state_src = Path(state_path) if state_path is not None else STATE
    feats = asset_features(state_src, cutoff,
                           s1_rtc_vv=CHIP if CHIP.exists() else None,
                           use_egms_columns=use_egms_columns)
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


def main(which: str, state_path: str | Path | None = None,
         out_dir: str | Path | None = None,
         use_egms_columns: bool = False) -> int:
    import pickle

    state_src = Path(state_path) if state_path is not None else STATE
    with open(state_src, "rb") as fh:
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
    out_dir = Path(out_dir) if out_dir is not None else ROOT / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = []
    for cutoff in selected:
        table = decide_cutoff(cutoff, state_path=state_src,
                              use_egms_columns=use_egms_columns)
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


MODEL_PRICE_IN = 1.25 / 1e6  # $ per token, Muse Spark (SPEC §6.2)
MODEL_PRICE_OUT = 4.25 / 1e6
MODEL_WORKERS = 5


def model_cost(usage: dict) -> float:
    return usage["prompt_tokens"] * MODEL_PRICE_IN + usage["completion_tokens"] * MODEL_PRICE_OUT


def cached_cutoff_cost(cutoff: str) -> float:
    """True Sep-2024-style per-cutoff cost from cache entries' recorded usage.

    Used for the projection when the first cutoff is already fully cached
    (measuring $0 fresh would project $0 and wrongly select 33 cutoffs).
    """
    import json

    from radartwin.decide import model as model_mod

    table = decide_cutoff(cutoff)
    prompt = completion = 0
    for i in table.index[table["pattern"] != "not_monitored"]:
        feats, flag_values = _row_input(table.loc[i])
        model_input = model_mod.build_model_input(feats, flag_values)
        for s in range(model_mod.K_VOTES):
            path = model_mod._cache_path(model_mod._cache_key(model_input, s))
            if path.exists():
                entry = json.loads(path.read_text())
                prompt += entry.get("usage", {}).get("prompt_tokens", 0)
                completion += entry.get("usage", {}).get("completion_tokens", 0)
    return model_cost({"prompt_tokens": prompt, "completion_tokens": completion})


def _row_input(row: pd.Series) -> tuple[dict, dict]:
    feats = row.to_dict()
    flag_values = {name: bool(row.get(name, False)) for name in (
        "moving", "accelerating", "differential", "outlier",
        "low_quality", "low_coverage", "escalate",
    )}
    return feats, flag_values


def _model_for_row(row: pd.Series) -> dict:
    """Model decision + P(high) for one analysed bridge (worker-safe)."""
    from radartwin.decide import model as model_mod

    feats, flag_values = _row_input(row)
    dec = model_mod.decide_with_model(feats, flag_values)
    shares = model_mod.vote_shares(feats, flag_values)
    return {
        "model_pattern": dec["pattern"],
        "model_risk_level": dec["risk_level"],
        "model_needs_inspection": dec["needs_inspection"],
        "model_p_pattern": dec["p_pattern"],
        "model_p_risk": dec["p_risk"],
        "model_p_inspect": dec["p_inspect"],
        "model_p_high": shares["risk"].get("high"),
        "model_prob_method": dec["prob_method"],
        "model_source": dec["source"],
        "model_error": dec["error"] or "",
    }


def decide_cutoff_model(cutoff: str) -> pd.DataFrame:
    """Rubric table (unchanged) plus one Muse Spark decision per analysed bridge."""
    table = decide_cutoff(cutoff).copy()
    analysed_idx = table.index[table["pattern"] != "not_monitored"].tolist()
    results: dict = {}
    with ThreadPoolExecutor(max_workers=MODEL_WORKERS) as pool:
        pending = {pool.submit(_model_for_row, table.loc[i]): i for i in analysed_idx}
        try:
            for fut in as_completed(pending):
                results[pending[fut]] = fut.result()
        except RuntimeError:
            pool.shutdown(wait=False, cancel_futures=True)
            raise
    for key in ("model_pattern", "model_risk_level", "model_needs_inspection",
                "model_p_pattern", "model_p_risk", "model_p_inspect", "model_p_high",
                "model_prob_method", "model_source", "model_error"):
        table[key] = None
    for i in analysed_idx:
        for key, val in results[i].items():
            table.at[i, key] = val
    dropped = table["pattern"] == "not_monitored"
    table.loc[dropped, "model_error"] = "not monitored by radar: not sent to the model"
    return table


def print_model_table(table: pd.DataFrame) -> None:
    print(f"{'asset':<42} {'rubric':<9} {'model':<9} {'p_risk':>6} {'p_high':>6} insp  error")
    for _, r in table.iterrows():
        if r["pattern"] == "not_monitored":
            continue
        p = r["model_p_risk"]
        ph = r["model_p_high"]
        print(f"{r['asset']:<42} {r['risk_level']:<9} "
              f"{str(r['model_risk_level']):<9} "
              f"{(f'{p:.2f}' if p is not None else '-'):>6} "
              f"{(f'{ph:.2f}' if ph is not None else '-'):>6} "
              f"{'yes' if r['model_needs_inspection'] else 'no':<4} "
              f"{r['model_error'] or ''}")


def agreement_row(cutoff: str, table: pd.DataFrame) -> dict:
    analysed = table[table["pattern"] != "not_monitored"]
    ok = analysed[analysed["model_risk_level"].notna()]
    agree = float((ok["model_risk_level"] == ok["risk_level"]).mean()) if len(ok) else float("nan")
    carola = ok[ok["asset"] == "Carolabrücke"]
    return {
        "cutoff": cutoff,
        "n_bridges": int(len(analysed)),
        "agree_risk": round(agree, 3),
        "n_model_high": int((ok["model_risk_level"] == "high").sum()),
        "n_rubric_high": int((analysed["risk_level"] == "high").sum()),
        "carola_model_risk": carola["model_risk_level"].iloc[0] if len(carola) else "",
        "carola_p_high": (round(float(carola["model_p_high"].iloc[0]), 3)
                          if len(carola) and carola["model_p_high"].notna().iloc[0] else ""),
    }


def disagreement_rows(cutoff: str, table: pd.DataFrame) -> list[dict]:
    out = []
    for _, r in table.iterrows():
        if r["pattern"] == "not_monitored" or r["model_risk_level"] is None:
            continue
        if r["model_risk_level"] != r["risk_level"]:
            out.append({
                "cutoff": cutoff,
                "asset": r["asset"],
                "rubric_risk": r["risk_level"],
                "model_risk": r["model_risk_level"],
                "p_risk": r["model_p_risk"],
            })
    return out


def main_model(which: str) -> int:
    import pickle

    from radartwin.decide import model as model_mod

    with open(STATE, "rb") as fh:
        cutoffs = pickle.load(fh)["cutoffs"]
    if which == "all":
        first = "2024-09-01"
    elif which in cutoffs:
        first = which
    else:
        print(f"unknown cutoff {which!r} (have {cutoffs[0]}..{cutoffs[-1]})")
        return 1
    out_dir = ROOT / "out"
    model_mod.reset_usage()
    try:
        table = decide_cutoff_model(first)
    except RuntimeError as exc:
        print(f"model decisions stopped: {exc}")
        return 1
    usage = model_mod.get_usage()
    cost = model_cost(usage)
    n_analysed = len(table[table["pattern"] != "not_monitored"])
    if usage["calls"]:
        # Sample-based: honest for fully fresh, partially cached, and
        # straggler-only runs alike (assets times votes per asset).
        per_cutoff = cost / usage["calls"] * n_analysed * model_mod.K_VOTES
        basis = f"{usage['calls']} fresh samples"
    else:
        per_cutoff = cached_cutoff_cost(first)
        basis = "cached usage (cutoff already on disk)"
    table.to_csv(out_dir / f"model_decisions_{first}.csv", index=False)
    print(f"cutoff {first}: {len(table)} rows "
          f"({usage['calls']} calls, {usage['cached']} cached, "
          f"{usage['prompt_tokens']} in / {usage['completion_tokens']} out tokens)")
    print(f"cost this cutoff: ${cost:.4f} "
          f"({basis}; per-cutoff estimate ${per_cutoff:.4f})")
    proj33 = per_cutoff * 33
    print(f"projection for all 33 cutoffs: ${proj33:.2f}")
    if which != "all":
        print_model_table(table)
        return 0
    if proj33 > 8:
        print(f"projection for 33 cutoffs (${proj33:.2f}) exceeds the $8.00 "
              "phase cap: stopping, no further model calls")
        return 1
    selected = cutoffs
    print("projection within $8: running all 33 cutoffs")
    agree_rows = [agreement_row(first, table)]
    dis_rows = disagreement_rows(first, table)
    for cutoff in selected:
        if cutoff == first:
            continue
        try:
            table = decide_cutoff_model(cutoff)
        except RuntimeError as exc:
            print(f"model decisions stopped at {cutoff}: {exc}")
            return 1
        table.to_csv(out_dir / f"model_decisions_{cutoff}.csv", index=False)
        agree_rows.append(agreement_row(cutoff, table))
        dis_rows.extend(disagreement_rows(cutoff, table))
        usage = model_mod.get_usage()
        print(f"{cutoff}: ${model_cost(usage):.4f} cumulative "
              f"({usage['calls']} calls, {usage['cached']} cached)")
        if model_cost(usage) > 8:
            print(f"cumulative spend ${model_cost(usage):.4f} passes $8.00: "
                  f"stopping at {cutoff} "
                  f"({len(agree_rows)}/33 cutoffs done)")
            break
    agree_df = pd.DataFrame(agree_rows).sort_values("cutoff").reset_index(drop=True)
    agree_df.to_csv(out_dir / "model_agreement.csv", index=False)
    dis_df = pd.DataFrame(dis_rows, columns=["cutoff", "asset", "rubric_risk", "model_risk", "p_risk"])
    dis_df.to_csv(out_dir / "model_disagreements.csv", index=False)
    print(agree_df.to_string(index=False))
    usage = model_mod.get_usage()
    print(f"total model cost: ${model_cost(usage):.4f} "
          f"({usage['calls']} calls, {usage['cached']} cached)")
    return 0


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Rubric decisions per cutoff.")
    parser.add_argument("which", help="cutoff or 'all'")
    parser.add_argument("--model", action="store_true", help="also run Muse Spark")
    parser.add_argument("--state", default=None, help="state pickle (default out/dresden_state.pkl)")
    parser.add_argument("--outdir", default=None, help="output directory (default out/)")
    parser.add_argument("--use-egms", action="store_true",
                        help="whole-period EGMS velocity, only for the baseline "
                             "reproduction")
    parser.add_argument("--leakfree", action="store_true",
                        help="no-op alias; leak-free is the default")
    args = parser.parse_args()
    if args.model:
        if args.state is not None or args.outdir is not None or args.use_egms:
            print("--model does not accept --state/--outdir/--use-egms")
            raise SystemExit(2)
        raise SystemExit(main_model(args.which))
    raise SystemExit(main(args.which, state_path=args.state, out_dir=args.outdir,
                          use_egms_columns=args.use_egms))
