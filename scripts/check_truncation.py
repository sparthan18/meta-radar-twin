#!/usr/bin/env python3
"""Leak test from SPEC 3.5: truncation invariance + banned-column check.

Usage::

    uv run python scripts/check_truncation.py [cutoff ...]
    uv run python scripts/check_truncation.py --self-test

For each cutoff (default: 2022-06-01, 2023-10-01, 2024-08-01, 2024-09-01):
deletes every epoch column on or after the cutoff from the points, reruns the
leak-free pipeline up to that cutoff, and asserts every per-cutoff value for
that cutoff (roll, score, z, wmax, wspread, velocity, coherence, flags, risk)
is identical to the full run in out/leakfree/. Also asserts no per-cutoff code
path reads the whole-period EGMS columns (mean_velocity, acceleration,
seasonality, temporal_coherence, rmse_ts or any _std) by rerunning with those
columns dropped and asserting identical values.

``--self-test`` proves the check catches planted failures: with the
EGMS-column switch on it must fail for both velocity (mean_velocity read) and
coherence (temporal_coherence read), and with a planted post-cutoff epoch read
it must fail truncation.
"""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import rank_city  # noqa: E402
from radartwin.analytics.retro import BANNED_WHOLE_PERIOD_COLUMNS  # noqa: E402
from radartwin.config import SITES  # noqa: E402
from radartwin.decide.features import asset_features  # noqa: E402
from radartwin.decide.rubric import decide, flags  # noqa: E402
from radartwin.ingest.egms import time_series  # noqa: E402

DEFAULT_CUTOFFS = ["2022-06-01", "2023-10-01", "2024-08-01", "2024-09-01"]
LEAKFREE_STATE = ROOT / "out" / "leakfree" / "dresden_state.pkl"
CHIP = ROOT / "data" / "carola" / "s1_rtc_vv.tif"

_CITY_CACHE: dict = {}


def _is_epoch_col(col: object) -> bool:
    s = str(col)
    return len(s) == 8 and s.isdigit()


def _banned_cols(df: pd.DataFrame) -> list:
    out = []
    for c in df.columns:
        s = str(c)
        if s in BANNED_WHOLE_PERIOD_COLUMNS or s.endswith("_std"):
            out.append(c)
    return out


def load_city_once():
    """Load and bind city points once; reuse across test cutoffs."""
    if "pts" in _CITY_CACHE:
        return _CITY_CACHE["pts"], _CITY_CACHE["track_cols"], _CITY_CACHE["on"], \
            _CITY_CACHE["bridges"], _CITY_CACHE["site"]
    site = SITES["carola"]
    data_dir = ROOT / "data" / site.slug
    pts, track_cols = rank_city.load_city_points(data_dir)
    from radartwin.analytics.bind import bind_points
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
    bridges = dissolved[dissolved["asset_id"].isin(keep.index)].copy()
    on = on[on["asset_id"].isin(keep.index)].copy()
    _CITY_CACHE.update({"pts": pts, "track_cols": track_cols, "on": on,
                        "bridges": bridges, "site": site})
    return pts, track_cols, on, bridges, site


def rerun_up_to(test_cutoff: str, use_egms_columns: bool = False,
                drop_banned: bool | list = False,
                plant_future: bool = False) -> dict:
    """Rerun the pipeline up to ``test_cutoff`` with future epochs deleted.

    ``drop_banned``: False (keep), True (drop all banned), or a list of
    column names to drop. ``plant_future``: keep the first epoch on/after the
    cutoff per track (simulates a future leak; must fail the check).
    Returns a truncated state dict plus per-bridge rolls/metas.
    """
    _, track_cols_full, on_full, bridges, site = load_city_once()
    with open(LEAKFREE_STATE, "rb") as fh:
        full = pickle.load(fh)
    cutoffs_up_to = [c for c in full["cutoffs"] if c <= test_cutoff]
    assert cutoffs_up_to and cutoffs_up_to[-1] == test_cutoff, test_cutoff
    limit = pd.Timestamp(test_cutoff)

    track_cols: dict[str, list] = {}
    for track, cols in track_cols_full.items():
        past = [c for c in cols if pd.Timestamp(str(c)) < limit]
        if plant_future:
            future = sorted((c for c in cols if pd.Timestamp(str(c)) >= limit),
                            key=str)
            if future:
                past = past + [future[0]]
        track_cols[track] = past

    on = on_full.copy()
    # Delete future epoch columns (keep planted one if requested).
    drop_epochs = []
    keep_planted = set()
    if plant_future:
        for cols in track_cols.values():
            if cols:
                last = cols[-1]
                if pd.Timestamp(str(last)) >= limit:
                    keep_planted.add(str(last))
    for c in list(on.columns):
        if _is_epoch_col(c) and pd.Timestamp(str(c)) >= limit \
                and str(c) not in keep_planted:
            drop_epochs.append(c)
    if drop_epochs:
        on = on.drop(columns=drop_epochs)
    if drop_banned is True:
        banned = _banned_cols(on)
        if banned:
            on = on.drop(columns=banned)
    elif isinstance(drop_banned, list):
        on = on.drop(columns=[c for c in drop_banned if c in on.columns])

    rolls: dict[str, pd.DataFrame] = {}
    metas: dict[str, pd.DataFrame] = {}
    per: dict[str, pd.DataFrame] = {}
    vels: dict[str, pd.Series] = {}
    cohs: dict[str, pd.Series] = {}
    metas_by_cutoff: dict[str, dict] = {}
    for _, b in bridges.sort_values("name").iterrows():
        bp = on[on["asset_id"] == b["asset_id"]]
        res = rank_city.analyse_bridge(bp, cutoffs_up_to, site.event_date,
                                       track_cols,
                                       use_egms_columns=use_egms_columns,
                                       plant_future_read=plant_future)
        if use_egms_columns:
            roll, sc, meta = res
            rolls[b["name"]] = roll
            metas[b["name"]] = meta
            per[b["name"]] = sc
        else:
            roll, sc, meta, vel, coh, mbc = res
            rolls[b["name"]] = roll
            metas[b["name"]] = meta
            per[b["name"]] = sc
            vels[b["name"]] = vel
            cohs[b["name"]] = coh
            metas_by_cutoff[b["name"]] = mbc
    names = sorted(per)
    state = {
        "rolls": rolls,
        "scores": pd.DataFrame({n: per[n]["score"] for n in names},
                               index=cutoffs_up_to),
        "z": pd.DataFrame({n: per[n]["z"] for n in names},
                          index=cutoffs_up_to),
        "wmax": pd.DataFrame({n: per[n]["wmax"] for n in names},
                             index=cutoffs_up_to),
        "wspread": pd.DataFrame({n: per[n]["wspread"] for n in names},
                                index=cutoffs_up_to),
        "pts": on,
        "bridges": bridges,
        "cutoffs": cutoffs_up_to,
        "meta": metas,
        "use_egms_columns": bool(use_egms_columns),
    }
    if not use_egms_columns:
        state["velocity"] = pd.DataFrame(vels, index=cutoffs_up_to)
        state["coherence"] = pd.DataFrame(cohs, index=cutoffs_up_to)
        state["meta_by_cutoff"] = metas_by_cutoff
    return state


def trunc_decisions(trunc_state: dict, test_cutoff: str,
                    use_egms_columns: bool = False) -> pd.DataFrame:
    """Features + flags + rubric risk at ``test_cutoff`` from a rerun state."""
    feats = asset_features(trunc_state, test_cutoff,
                           s1_rtc_vv=CHIP if CHIP.exists() else None,
                           use_egms_columns=use_egms_columns)
    rows = []
    for _, row in feats.iterrows():
        fl = flags(row)
        dec = decide(row, fl)
        rows.append({**row.to_dict(), **fl, **dec})
    return pd.DataFrame(rows)


def _frames_equal(a: pd.DataFrame | pd.Series, b) -> tuple[bool, float]:
    """Exact equality incl. NaN positions; returns (ok, max abs diff)."""
    import numpy as np

    av = pd.DataFrame(a).to_numpy(dtype=float)
    bv = pd.DataFrame(b).to_numpy(dtype=float)
    if av.shape != bv.shape:
        return False, float("inf")
    nan_match = bool((np.isnan(av) == np.isnan(bv)).all())
    if not nan_match:
        return False, float("inf")
    mask = ~np.isnan(av)
    if not mask.any():
        return True, 0.0
    diff = float(np.abs(av[mask] - bv[mask]).max())
    return diff == 0.0, diff


def check_cutoff(test_cutoff: str, use_egms_columns: bool = False,
                 drop_banned: bool | list = False,
                 plant_future: bool = False) -> tuple[bool, dict]:
    """Compare a truncated rerun to the full leakfree run at ``test_cutoff``.

    Returns (passed, details). ``details`` maps quantity -> (ok, info).
    """
    with open(LEAKFREE_STATE, "rb") as fh:
        full = pickle.load(fh)
    full_dec = pd.read_csv(ROOT / "out" / "leakfree"
                           / f"decisions_{test_cutoff}.csv")
    try:
        trunc = rerun_up_to(test_cutoff, use_egms_columns=use_egms_columns,
                            drop_banned=drop_banned,
                            plant_future=plant_future)
    except KeyError as exc:
        return False, {"rerun": (False, f"KeyError (banned read?): {exc}")}
    trunc_dec = trunc_decisions(trunc, test_cutoff,
                                use_egms_columns=use_egms_columns)
    details: dict = {}
    ok_all = True

    # Rolls per bridge.
    roll_ok = True
    roll_diff = 0.0
    for bridge, froll in full["rolls"].items():
        trow = trunc["rolls"][bridge].loc[test_cutoff]
        frow = froll.loc[test_cutoff]
        ok, diff = _frames_equal(frow, trow)
        roll_diff = max(roll_diff, diff if diff != float("inf") else 1e18)
        if not ok:
            roll_ok = False
    details["roll"] = (roll_ok, f"max abs diff {roll_diff!r}")
    ok_all &= roll_ok

    for key in ("scores", "z", "wmax", "wspread", "velocity", "coherence"):
        if key not in full or key not in trunc:
            details[key] = (False, "missing table")
            ok_all = False
            continue
        f = full[key].loc[test_cutoff].sort_index()
        t = trunc[key].loc[test_cutoff].sort_index()
        ok, diff = _frames_equal(f, t)
        details[{"scores": "score"}.get(key, key)] = (
            ok, f"max abs diff {diff!r}")
        ok_all &= ok

    # Per-span coherence/n_eff at the cutoff.
    span_ok = True
    for bridge in full["meta_by_cutoff"]:
        fmeta = full["meta_by_cutoff"][bridge][test_cutoff].sort_index()
        tmeta = trunc["meta_by_cutoff"][bridge][test_cutoff].sort_index()
        ok1, d1 = _frames_equal(fmeta[["coherence"]], tmeta[["coherence"]])
        ok2, d2 = _frames_equal(fmeta[["n_eff"]], tmeta[["n_eff"]])
        if not (ok1 and ok2):
            span_ok = False
    details["span_meta"] = (span_ok, "per-span coherence/n_eff")
    ok_all &= span_ok

    # Flags + risk per analysed bridge.
    fmap = full_dec[full_dec["pattern"] != "not_monitored"].set_index("asset")
    tmap = trunc_dec.set_index("asset")
    flag_names = ["moving", "accelerating", "differential", "outlier",
                  "low_quality", "low_coverage", "escalate"]
    flags_ok = True
    for asset in fmap.index:
        for fln in flag_names:
            if bool(fmap.loc[asset, fln]) != bool(tmap.loc[asset, fln]):
                flags_ok = False
    details["flags"] = (flags_ok, "all 7 flags, all bridges")
    ok_all &= flags_ok
    risk_ok = bool((fmap["risk_level"] == tmap.loc[fmap.index, "risk_level"]).all())
    details["risk"] = (risk_ok, "risk_level, all bridges")
    ok_all &= risk_ok
    return ok_all, details


def check_banned(test_cutoff: str, drop: bool | list,
                 use_egms_columns: bool = False) -> tuple[bool, dict]:
    """Rerun with banned columns dropped; pass = identical (no reads)."""
    return check_cutoff(test_cutoff, use_egms_columns=use_egms_columns,
                        drop_banned=drop)


def main(cutoffs: list[str]) -> int:
    print(f"full run: {LEAKFREE_STATE}", flush=True)
    if not LEAKFREE_STATE.exists():
        print("missing leakfree state; run rank_city --leakfree first")
        return 1
    rc = 0
    for cutoff in cutoffs:
        ok, details = check_cutoff(cutoff)
        print(f"{cutoff} truncation: {'PASS' if ok else 'FAIL'}", flush=True)
        for key, (qok, info) in details.items():
            print(f"  {key}: {'ok' if qok else 'MISMATCH'} ({info})")
        if not ok:
            rc = 1
        ok_b, details_b = check_banned(cutoff, drop=True)
        print(f"{cutoff} banned-columns: {'PASS' if ok_b else 'FAIL'}", flush=True)
        if not ok_b:
            for key, (qok, info) in details_b.items():
                if not qok:
                    print(f"  {key}: MISMATCH ({info})")
            rc = 1
    return rc


def _egms_drop_fails(cutoff: str, drop_col: str) -> tuple[bool, str]:
    """True when dropping ``drop_col`` breaks the EGMS pipeline (KeyError).

    Runs the EGMS (whole-period) pipeline up to ``cutoff`` with the column
    dropped, including the features/decisions step that reads mean_velocity.
    A KeyError proves the per-cutoff path reads the banned column.
    """
    try:
        trunc = rerun_up_to(cutoff, use_egms_columns=True,
                            drop_banned=[drop_col])
        trunc_decisions(trunc, cutoff, use_egms_columns=True)
    except KeyError as exc:
        return True, f"KeyError {exc}"
    return False, "no KeyError (column not read?)"


def self_test() -> int:
    """Assert the check fails when it should (planted velocity, coherence,
    and future-epoch leaks). Returns 0 iff all planted failures are caught."""
    cutoff = "2024-09-01"
    ok = True
    # 1a. EGMS switch on + drop mean_velocity: velocity path must fail.
    failed, info = _egms_drop_fails(cutoff, "mean_velocity")
    if not failed:
        print("SELF-TEST FAIL: EGMS velocity leak not caught "
              f"(drop mean_velocity still passed: {info})")
        ok = False
    else:
        print(f"SELF-TEST ok: EGMS velocity leak caught ({info})")
    # 1b. EGMS switch on + drop temporal_coherence: coherence path must fail.
    failed, info = _egms_drop_fails(cutoff, "temporal_coherence")
    if not failed:
        print("SELF-TEST FAIL: EGMS coherence leak not caught "
              f"(drop temporal_coherence still passed: {info})")
        ok = False
    else:
        print(f"SELF-TEST ok: EGMS coherence leak caught ({info})")
    # 2. Planted future-epoch read must fail truncation.
    passed, details = check_cutoff(cutoff, plant_future=True)
    if passed:
        print("SELF-TEST FAIL: planted future-epoch read not caught")
        ok = False
    else:
        bad = [k for k, (qok, _) in details.items() if not qok]
        print(f"SELF-TEST ok: planted future read caught (mismatch: {bad})")
    # Sanity: the clean check must pass at this cutoff.
    passed, _ = check_cutoff(cutoff)
    if not passed:
        print("SELF-TEST PREMISE BROKEN: clean leakfree check fails at "
              f"{cutoff}")
        return 1
    print("self-test:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--self-test" in args:
        raise SystemExit(self_test())
    raise SystemExit(main(args or DEFAULT_CUTOFFS))
