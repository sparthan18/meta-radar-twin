#!/usr/bin/env python3
"""Name sensitivity check (phase 4c): do bridge names and dates sway the model?

Compares named vs anonymised Muse Spark decisions at 2023-10-01, 2024-08-01
and 2024-09-01 (all analysed bridges, 5 votes each), plus a noise baseline
(second independent named draw at 2024-09-01). Reads named verdicts from the
existing out/model_decisions_<cutoff>.csv files; never rewrites them. Writes
out/name_sensitivity.csv and out/name_noise_baseline.csv. New votes are cached
under out/cache/ with keys that differ from the named ones.
"""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.decide import model as model_mod  # noqa: E402

CUTOFFS = ["2023-10-01", "2024-08-01", "2024-09-01"]
NOISE_CUTOFF = "2024-09-01"
NOISE_START = 100
PRICE_IN = 1.25 / 1e6
PRICE_OUT = 4.25 / 1e6
BUDGET = 1.20
WORKERS = 5


def model_cost(usage: dict) -> float:
    return usage["prompt_tokens"] * PRICE_IN + usage["completion_tokens"] * PRICE_OUT


def _row_input(row: pd.Series) -> tuple[dict, dict]:
    feats = row.to_dict()
    flag_values = {name: bool(row.get(name, False)) for name in (
        "moving", "accelerating", "differential", "outlier",
        "low_quality", "low_coverage", "escalate",
    )}
    return feats, flag_values


def _anon_for_row(row: pd.Series) -> dict:
    feats, flag_values = _row_input(row)
    dec = model_mod.decide_with_model(feats, flag_values, anonymous=True)
    shares = model_mod.vote_shares(feats, flag_values, anonymous=True)
    return {
        "risk": dec["risk_level"],
        "p_risk": dec["p_risk"],
        "p_high": shares["risk"].get("high"),
        "error": dec["error"] or "",
    }


def _noise_for_row(row: pd.Series) -> dict:
    feats, flag_values = _row_input(row)
    dec = model_mod.decide_with_model(feats, flag_values, start_sample=NOISE_START)
    shares = model_mod.vote_shares(feats, flag_values, start_sample=NOISE_START)
    return {
        "risk": dec["risk_level"],
        "p_risk": dec["p_risk"],
        "p_high": shares["risk"].get("high"),
        "error": dec["error"] or "",
    }


def _run_parallel(rows: list[pd.Series], func) -> list[dict]:
    out: dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        pending = {pool.submit(func, row): i for i, row in enumerate(rows)}
        try:
            for fut in as_completed(pending):
                out[pending[fut]] = fut.result()
        except RuntimeError:
            pool.shutdown(wait=False, cancel_futures=True)
            raise
    return [out[i] for i in range(len(rows))]


def main() -> int:
    try:
        from radartwin.agents.llm import get_client

        get_client()
    except RuntimeError as exc:
        print(f"name sensitivity stopped: {exc}")
        return 1

    tables: dict[str, pd.DataFrame] = {}
    for cutoff in CUTOFFS:
        path = ROOT / "out" / f"model_decisions_{cutoff}.csv"
        if not path.exists():
            print(f"name sensitivity stopped: missing {path}")
            return 1
        tables[cutoff] = pd.read_csv(path)
    analysed = {c: t[t["pattern"] != "not_monitored"].reset_index(drop=True)
                for c, t in tables.items()}
    n_bridges = sum(len(t) for t in analysed.values())
    total_samples = n_bridges * model_mod.K_VOTES + len(analysed[NOISE_CUTOFF]) * model_mod.K_VOTES
    print(f"bridges: {n_bridges} anonymised rows over {len(CUTOFFS)} cutoffs + "
          f"{len(analysed[NOISE_CUTOFF])} noise rows; "
          f"{total_samples} fresh samples planned (5 votes each)")

    # Projection from fresh calls only: pilot one anonymised bridge, then scale.
    model_mod.reset_usage()
    pilot_row = analysed[CUTOFFS[0]].iloc[0]
    try:
        _anon_for_row(pilot_row)
    except RuntimeError as exc:
        print(f"name sensitivity stopped: {exc}")
        return 1
    usage = model_mod.get_usage()
    pilot_cost = model_cost(usage)
    if not usage["calls"]:
        print("name sensitivity stopped: pilot drew 0 fresh samples, cannot project")
        return 1
    per_sample = pilot_cost / usage["calls"]
    projected = per_sample * total_samples
    print(f"pilot: {usage['calls']} fresh samples cost ${pilot_cost:.4f} "
          f"(${per_sample:.5f}/sample from fresh calls only)")
    print(f"projected total for {total_samples} fresh samples: ${projected:.2f} "
          f"(budget ${BUDGET:.2f})")
    if projected > BUDGET:
        print("projection exceeds budget: stopping, no further model calls")
        return 1

    # Anonymised draws for the three months.
    anon_results: dict[str, list[dict]] = {}
    try:
        for cutoff in CUTOFFS:
            rows = [analysed[cutoff].iloc[i] for i in range(len(analysed[cutoff]))]
            anon_results[cutoff] = _run_parallel(rows, _anon_for_row)
            usage = model_mod.get_usage()
            print(f"{cutoff}: anonymised done, ${model_cost(usage):.4f} cumulative "
                  f"({usage['calls']} calls, {usage['cached']} cached)")
            if model_cost(usage) > BUDGET:
                print("budget passed: stopping before the noise baseline")
                return 1
    except RuntimeError as exc:
        print(f"name sensitivity stopped: {exc}")
        return 1

    sens_rows = []
    for cutoff in CUTOFFS:
        table = analysed[cutoff]
        for i in range(len(table)):
            row = table.iloc[i]
            anon = anon_results[cutoff][i]
            sens_rows.append({
                "cutoff": cutoff,
                "asset": row["asset"],
                "anon_id": model_mod.anonymised_asset(str(row["asset"])),
                "named_risk": row["model_risk_level"],
                "anon_risk": anon["risk"],
                "named_p_high": row["model_p_high"],
                "anon_p_high": anon["p_high"],
                "named_p_risk": row["model_p_risk"],
                "anon_p_risk": anon["p_risk"],
                "changed": bool(row["model_risk_level"] != anon["risk"]),
                "anon_error": anon["error"],
            })
    sens = pd.DataFrame(sens_rows)
    sens.to_csv(ROOT / "out" / "name_sensitivity.csv", index=False)

    # Noise baseline: second independent named draw at 2024-09-01.
    noise_table = analysed[NOISE_CUTOFF]
    noise_rows = [noise_table.iloc[i] for i in range(len(noise_table))]
    try:
        noise_results = _run_parallel(noise_rows, _noise_for_row)
    except RuntimeError as exc:
        print(f"noise baseline stopped: {exc}")
        return 1
    usage = model_mod.get_usage()
    print(f"noise baseline done, ${model_cost(usage):.4f} cumulative "
          f"({usage['calls']} calls, {usage['cached']} cached)")

    base_rows = []
    for i in range(len(noise_table)):
        row = noise_table.iloc[i]
        second = noise_results[i]
        base_rows.append({
            "cutoff": NOISE_CUTOFF,
            "asset": row["asset"],
            "named_risk_first": row["model_risk_level"],
            "named_risk_second": second["risk"],
            "named_p_high_first": row["model_p_high"],
            "named_p_high_second": second["p_high"],
            "named_p_risk_first": row["model_p_risk"],
            "named_p_risk_second": second["p_risk"],
            "changed": bool(row["model_risk_level"] != second["risk"]),
            "error_second": second["error"],
        })
    base = pd.DataFrame(base_rows)
    base.to_csv(ROOT / "out" / "name_noise_baseline.csv", index=False)

    n_changed = int(sens["changed"].sum())
    n_noise = int(base["changed"].sum())
    print(f"anonymised changes: {n_changed}/{len(sens)} "
          f"({n_changed / len(sens):.1%}); "
          f"noise changes at {NOISE_CUTOFF}: {n_noise}/{len(base)} "
          f"({n_noise / len(base):.1%})")
    changed = sens[sens["changed"]]
    if len(changed):
        print(changed[["cutoff", "asset", "named_risk", "anon_risk",
                       "named_p_high", "anon_p_high"]].to_string(index=False))
    else:
        print("no risk-level changes with anonymisation")
    carola = sens[sens["asset"] == "Carolabrücke"]
    print("Carolabrücke named vs anonymised:")
    print(carola[["cutoff", "named_risk", "anon_risk", "named_p_high",
                  "anon_p_high"]].to_string(index=False))
    usage = model_mod.get_usage()
    print(f"total measured cost: ${model_cost(usage):.4f} "
          f"({usage['calls']} calls, {usage['cached']} cached, "
          f"{usage['prompt_tokens']} in / {usage['completion_tokens']} out tokens)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
