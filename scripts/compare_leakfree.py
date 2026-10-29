#!/usr/bin/env python3
"""Compare whole-period baseline vs leak-free rebuild (phase 4d step 5+6).

Prints and writes out/leakfree/comparison.md:
- Carolabrücke rank and z at four cutoffs, old vs new;
- every bridge whose rubric risk changes at any cutoff + count/627;
- escalation counts per bridge old vs new; who escalates at Aug/Sep 2024;
- bridge-months with moving true, old vs new;
- Pearson correlation of cutoff coherence vs EGMS temporal_coherence.

Also prints the phase-4e model-rerun cost projection (step 6): how many
whitelisted model inputs change, how many cache keys/calls miss, dollars.
No model calls; cache reads only.
"""
from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import rank_city  # noqa: E402
from radartwin.analytics.retro import cutoff_coherence_velocity  # noqa: E402
from radartwin.config import SITES  # noqa: E402
from radartwin.decide import model as model_mod  # noqa: E402
from radartwin.ingest.egms import time_series  # noqa: E402

OLD_STATE = ROOT / "out" / "dresden_state.pkl"
NEW_STATE = ROOT / "out" / "leakfree" / "dresden_state.pkl"
OUT_MD = ROOT / "out" / "leakfree" / "comparison.md"
FOCUS = ["2023-10-01", "2024-06-01", "2024-08-01", "2024-09-01"]
PRICE_IN = 1.25 / 1e6
PRICE_OUT = 4.25 / 1e6


def _load_decisions(base: Path, cutoff: str) -> pd.DataFrame:
    return pd.read_csv(base / f"decisions_{cutoff}.csv")


def main() -> int:
    with open(OLD_STATE, "rb") as fh:
        old = pickle.load(fh)
    with open(NEW_STATE, "rb") as fh:
        new = pickle.load(fh)
    cutoffs: list[str] = old["cutoffs"]
    assert cutoffs == new["cutoffs"], "cutoff lists differ"
    assert len(cutoffs) == 33, len(cutoffs)

    lines: list[str] = []
    lines.append("# Leak-free vs whole-period baseline (phase 4d)")
    lines.append("")

    # 1. Carolabrücke rank and z at four cutoffs.
    lines.append("## Carolabrücke rank and z")
    lines.append("")
    lines.append("| cutoff | baseline rank | leak-free rank | baseline z | leak-free z |")
    lines.append("|---|---|---|---|---|")
    print("Carolabrücke rank and z (baseline vs leak-free):")
    for c in FOCUS:
        o = _load_decisions(ROOT / "out", c)
        n = _load_decisions(ROOT / "out" / "leakfree", c)
        orow = o[o["asset"] == "Carolabrücke"].iloc[0]
        nrow = n[n["asset"] == "Carolabrücke"].iloc[0]
        oz = float(orow["score_vs_own_history_z"])
        nz = float(nrow["score_vs_own_history_z"])
        print(f"  {c}: rank {int(orow['rank_in_city'])} -> "
              f"{int(nrow['rank_in_city'])}, z {oz:.2f} -> {nz:.2f}")
        lines.append(f"| {c} | {int(orow['rank_in_city'])} | "
                     f"{int(nrow['rank_in_city'])} | {oz:.2f} | {nz:.2f} |")
    lines.append("")

    # 2. Risk changes.
    changes: list[tuple[str, str, str, str]] = []
    for c in cutoffs:
        o = _load_decisions(ROOT / "out", c).set_index("asset")
        n = _load_decisions(ROOT / "out" / "leakfree", c).set_index("asset")
        for asset in o.index:
            if o.loc[asset, "risk_level"] != n.loc[asset, "risk_level"]:
                changes.append((c, asset, str(o.loc[asset, "risk_level"]),
                                str(n.loc[asset, "risk_level"])))
    analysed_months = 19 * 33
    lines.append("## Rubric risk changes")
    lines.append("")
    lines.append(f"Changed bridge-months: {len(changes)} / {analysed_months} "
                 "(19 analysed bridges x 33 cutoffs).")
    lines.append("")
    print(f"Changed bridge-months: {len(changes)}/{analysed_months}")
    if changes:
        lines.append("| cutoff | bridge | baseline | leak-free |")
        lines.append("|---|---|---|---|")
        for c, asset, o_r, n_r in sorted(changes):
            lines.append(f"| {c} | {asset} | {o_r} | {n_r} |")
            print(f"  {c} {asset}: {o_r} -> {n_r}")
    else:
        lines.append("No changes.")
    lines.append("")

    # 3. Escalation counts per bridge + who escalates at Aug/Sep 2024.
    old_esc: dict[str, int] = {}
    new_esc: dict[str, int] = {}
    for c in cutoffs:
        o = _load_decisions(ROOT / "out", c)
        n = _load_decisions(ROOT / "out" / "leakfree", c)
        for _, r in o[o["pattern"] != "not_monitored"].iterrows():
            old_esc[r["asset"]] = old_esc.get(r["asset"], 0) + int(bool(r["escalate"]))
        for _, r in n[n["pattern"] != "not_monitored"].iterrows():
            new_esc[r["asset"]] = new_esc.get(r["asset"], 0) + int(bool(r["escalate"]))
    lines.append("## Escalation counts per bridge (escalate flag, 33 cutoffs)")
    lines.append("")
    lines.append("| bridge | baseline | leak-free |")
    lines.append("|---|---|---|")
    print("Escalation counts per bridge (baseline -> leak-free):")
    for asset in sorted(set(old_esc) | set(new_esc)):
        lines.append(f"| {asset} | {old_esc.get(asset, 0)} | {new_esc.get(asset, 0)} |")
        print(f"  {asset}: {old_esc.get(asset, 0)} -> {new_esc.get(asset, 0)}")
    lines.append("")
    for c in ("2024-08-01", "2024-09-01"):
        o = _load_decisions(ROOT / "out", c)
        n = _load_decisions(ROOT / "out" / "leakfree", c)
        o_e = sorted(o[o["escalate"] == True]["asset"].tolist())  # noqa: E712
        n_e = sorted(n[n["escalate"] == True]["asset"].tolist())  # noqa: E712
        lines.append(f"Escalating at {c}: baseline [{', '.join(o_e) or 'none'}]; "
                     f"leak-free [{', '.join(n_e) or 'none'}].")
        lines.append("")
        print(f"Escalating at {c}: baseline {o_e}; leak-free {n_e}")

    # 4. Moving flag counts.
    old_moving = 0
    new_moving = 0
    for c in cutoffs:
        o = _load_decisions(ROOT / "out", c)
        n = _load_decisions(ROOT / "out" / "leakfree", c)
        old_moving += int((o["moving"] == True).sum())  # noqa: E712
        new_moving += int((n["moving"] == True).sum())  # noqa: E712
    lines.append("## Moving flag")
    lines.append("")
    lines.append(f"Bridge-months with moving true: baseline {old_moving} / "
                 f"{analysed_months}; leak-free {new_moving} / {analysed_months}.")
    lines.append("")
    print(f"Moving true: baseline {old_moving}, leak-free {new_moving} "
          f"(/{analysed_months})")

    # 5. Coherence correlation at the last cutoff over all bridge points.
    last = cutoffs[-1]
    site = SITES["carola"]
    data_dir = ROOT / "data" / site.slug
    pts, track_cols = rank_city.load_city_points(data_dir)
    from radartwin.analytics.bind import bind_points
    from radartwin.analytics.geometry import along_cross, assign_spans, bridge_axis
    from radartwin.segment.osm import dissolve_bridges, load_bridges

    ways = load_bridges(rank_city.DRESDEN_CENTRE, site, data_dir=data_dir)
    dissolved = dissolve_bridges(ways)
    bound = bind_points(pts, dissolved)
    on = bound.dropna(subset=["asset_id"]).copy()
    on["asset_id"] = on["asset_id"].astype(int)
    counts = on.groupby("asset_id").agg(n=("track", "size"),
                                        tracks=("track", "nunique"))
    keep = counts[(counts["n"] >= rank_city.MIN_SCATTERERS)
                  & (counts["tracks"] >= rank_city.MIN_TRACKS)]
    on = on[on["asset_id"].isin(keep.index)].copy()
    limit = pd.Timestamp(last)
    if site.event_date:
        limit = min(limit, pd.Timestamp(site.event_date))
    coh_all: list[float] = []
    egms_all: list[float] = []
    for _, b in dissolved[dissolved["asset_id"].isin(keep.index)].iterrows():
        bp = on[on["asset_id"] == b["asset_id"]].copy()
        origin, axis, crs = bridge_axis(bp)
        along, _ = along_cross(bp, origin, axis, crs)
        bp["along"] = along
        bp["span"] = assign_spans(bp)
        for _, tp in bp.groupby("track"):
            cols = track_cols[tp["track"].iloc[0]]
            t, y, dates = time_series(tp, cols)
            keep_mask = np.asarray(dates < limit)
            if int(keep_mask.sum()) < 24:
                coh = np.full(len(tp), np.nan)
            else:
                coh, _ = cutoff_coherence_velocity(t[keep_mask], y[:, keep_mask])
            coh_all.extend(coh.tolist())
            egms_all.extend(tp["temporal_coherence"].to_numpy(dtype=float).tolist())
    coh_arr = np.asarray(coh_all, dtype=float)
    egms_arr = np.asarray(egms_all, dtype=float)
    ok = np.isfinite(coh_arr) & np.isfinite(egms_arr)
    r = float(np.corrcoef(coh_arr[ok], egms_arr[ok])[0, 1]) if int(ok.sum()) >= 3 else float("nan")
    lines.append("## Cutoff coherence vs EGMS temporal_coherence")
    lines.append("")
    lines.append(f"Pearson r at {last} over all bridge points: {r:.3f} "
                 f"(n={int(ok.sum())} valid of {len(coh_arr)}).")
    lines.append("")
    print(f"Coherence correlation at {last}: r={r:.3f} (n={int(ok.sum())})")

    # 6. Phase-4e cost projection (no model calls; cache reads only).
    changed_inputs = 0
    total_inputs = 0
    for c in cutoffs:
        o = _load_decisions(ROOT / "out", c)
        n = _load_decisions(ROOT / "out" / "leakfree", c)
        o = o[o["pattern"] != "not_monitored"].set_index("asset")
        n = n[n["pattern"] != "not_monitored"].set_index("asset")
        for asset in o.index:
            total_inputs += 1
            orow = o.loc[asset]
            nrow = n.loc[asset]
            oflags = {k: bool(orow.get(k, False)) for k in (
                "moving", "accelerating", "differential", "outlier",
                "low_quality", "low_coverage", "escalate")}
            nflags = {k: bool(nrow.get(k, False)) for k in oflags}
            oi = model_mod.build_model_input(orow.to_dict(), oflags)
            ni = model_mod.build_model_input(nrow.to_dict(), nflags)
            if oi != ni:
                changed_inputs += 1
    votes = model_mod.K_VOTES
    calls = changed_inputs * votes
    qvotes = changed_inputs * 3 * votes  # noqa: F841 (reported below as qvotes)
    # Measured cost per call from phase-4 cache entries for the old inputs.
    prompt = comp = found = 0
    for c in cutoffs:
        o = _load_decisions(ROOT / "out", c)
        o = o[o["pattern"] != "not_monitored"]
        for _, r in o.iterrows():
            fl = {k: bool(r.get(k, False)) for k in (
                "moving", "accelerating", "differential", "outlier",
                "low_quality", "low_coverage", "escalate")}
            mi = model_mod.build_model_input(r.to_dict(), fl)
            for s in range(votes):
                p = model_mod._cache_path(model_mod._cache_key(mi, s))
                if p.exists():
                    e = json.loads(p.read_text())
                    prompt += e.get("usage", {}).get("prompt_tokens", 0)
                    comp += e.get("usage", {}).get("completion_tokens", 0)
                    found += 1
    if found:
        per_call = (prompt * PRICE_IN + comp * PRICE_OUT) / found
    else:
        per_call = 0.0
    dollars = calls * per_call
    lines.append("## Phase-4e model-rerun cost projection (no calls made)")
    lines.append("")
    lines.append(f"Whitelisted model inputs changed: {changed_inputs} / {total_inputs} "
                 f"bridge-months.")
    lines.append(f"Cache keys that would miss: {changed_inputs * votes} / "
                 f"{total_inputs * votes} (5 votes each).")
    lines.append(f"Question-votes that would miss: {qvotes} "
                 f"(3 questions x 5 votes).")
    lines.append(f"API calls that would miss: {calls} (1 call per vote, "
                 f"3 questions bundled).")
    lines.append(f"Measured cost per call from phase-4 cache: ${per_call:.5f} "
                 f"({found} entries, {prompt} in / {comp} out tokens).")
    lines.append(f"Projected rerun cost: ${dollars:.2f}.")
    lines.append("")
    print(f"Cost projection: {changed_inputs}/{total_inputs} inputs changed; "
          f"{calls} calls x ${per_call:.5f} = ${dollars:.2f}")

    OUT_MD.write_text("\n".join(lines))
    print(f"wrote {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
