#!/usr/bin/env python3
"""Validate web/data against SPEC section 8 (phase 5c).

Checks: every bridge in decisions.json exists in bridges.geojson; every
cutoff has a decision for every bridge; risk values are within the ladder;
probabilities are between 0 and 1; for every cutoff no value comes from a
later month (compared against out/model_decisions_<cutoff>.csv and the
rolls in out/dresden_state.pkl); owner fields appear only under the "owner"
key and the per-bridge owner_condition_alert; not-monitored bridges carry
their reason; no whole-period EGMS values (also in the phase-5c files);
scatterer ids match between scatterer_velocity.json and scatterers.geojson
with 33 entries each; per-bridge means of the exported values match
decisions.json vel to 0.1; the s1 corners lie inside the Dresden bbox.
Exits non-zero on any failure.

Usage::

    .venv/bin/python scripts/check_web_data.py [--data-dir web/data]
    .venv/bin/python scripts/check_web_data.py --self-test
"""
from __future__ import annotations

import copy
import json
import math
import pickle
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MODEL_RISKS = {"none", "watch", "elevated", "high"}
RUBRIC_RISKS = {"none", "watch", "elevated", "high", "unknown"}
MODEL_PATTERNS = {"stable", "uniform_settlement", "differential",
                  "accelerating", "unreliable"}
RUBRIC_PATTERNS = MODEL_PATTERNS | {"not_monitored"}
COVERAGES = {"ok", "low", "none"}
WHOLE_PERIOD_KEYS = {
    "mean_velocity", "mean_velocity_std",
    "acceleration", "acceleration_std",
    "seasonality", "seasonality_std",
    "temporal_coherence", "temporal_coherence_std",
    "rmse_ts", "rmse_ts_std",
    "v", "c",  # short keys used by scatterers.geojson for velocity/coherence
}
NUM_TOL = 0.002  # 3-decimal rounding
SPAN_TOL = 0.011  # 2-decimal rounding
DRESDEN_BBOX = (13.700, 51.030, 13.790, 51.080)  # minlon, minlat, maxlon, maxlat
N_CUTOFFS = 33
VEL_MEAN_TOL = 0.1  # per-point values are rounded to 0.1 in the export


def _load_json(path: Path):
    return json.loads(path.read_text())


def _num_close(a, b, tol=NUM_TOL) -> bool:
    a_null = a is None or (isinstance(a, float) and math.isnan(a))
    b_null = b is None or (isinstance(b, float) and math.isnan(b))
    if a_null and b_null:
        return True
    if a_null or b_null:
        return False
    try:
        fa, fb = float(a), float(b)
    except (TypeError, ValueError):
        return False
    if math.isnan(fa) and math.isnan(fb):
        return True
    if math.isnan(fa) or math.isnan(fb):
        return False
    return abs(fa - fb) <= tol


def _is_nan(v) -> bool:
    try:
        return v is None or (isinstance(v, float) and math.isnan(v))
    except TypeError:
        return False


def run_checks(data_dir: Path, out_dir: Path) -> list[str]:
    errors: list[str] = []
    data_dir = Path(data_dir)
    out_dir = Path(out_dir)
    try:
        decisions = _load_json(data_dir / "decisions.json")
        bridges = _load_json(data_dir / "bridges.geojson")
        spans = _load_json(data_dir / "spans.json")
    except FileNotFoundError as exc:
        return [f"missing file: {exc.filename}"]
    except json.JSONDecodeError as exc:
        return [f"invalid JSON: {exc}"]

    bridge_ids = {f["properties"]["id"] for f in bridges.get("features", [])}
    id_to_name = {f["properties"]["id"]: f["properties"].get("name")
                  for f in bridges.get("features", [])}
    name_to_id = {v: k for k, v in id_to_name.items()}
    cutoffs = decisions.get("cutoffs", [])
    per_cutoff = decisions.get("decisions", {})

    # 1. every bridge in decisions.json exists in bridges.geojson.
    for cutoff, table in per_cutoff.items():
        for bid in table:
            if bid not in bridge_ids:
                errors.append(f"[{cutoff}] bridge {bid!r} has a decision "
                              f"but no feature in bridges.geojson")
    for bid in spans.get("spans", {}):
        if bid not in bridge_ids:
            errors.append(f"spans.json bridge {bid!r} missing from bridges.geojson")

    # 2. every cutoff has a decision for every bridge.
    if set(per_cutoff) != set(cutoffs):
        errors.append("decisions cutoffs != top-level cutoffs list")
    for cutoff in cutoffs:
        table = per_cutoff.get(cutoff, {})
        missing = bridge_ids - set(table)
        extra = set(table) - bridge_ids
        if missing:
            errors.append(f"[{cutoff}] missing decisions for bridges "
                          f"{sorted(missing)}")
        if extra:
            errors.append(f"[{cutoff}] extra decisions for unknown bridges "
                          f"{sorted(extra)}")
    if spans.get("cutoffs") != cutoffs:
        errors.append("spans.json cutoffs differ from decisions.json cutoffs")
    for bid in bridge_ids:
        if bid not in spans.get("spans", {}):
            errors.append(f"spans.json missing bridge {bid!r}")

    # 3. risk values within the ladder.
    for cutoff, table in per_cutoff.items():
        for bid, d in table.items():
            model = d.get("model")
            rubric = d.get("rubric", {})
            if model is None:
                if rubric.get("risk") != "unknown" or \
                        rubric.get("pattern") != "not_monitored":
                    errors.append(f"[{cutoff} {bid}] null model must pair with "
                                  f"not_monitored/unknown rubric")
            else:
                if model.get("risk") not in MODEL_RISKS:
                    errors.append(f"[{cutoff} {bid}] model risk "
                                  f"{model.get('risk')!r} outside ladder")
                if model.get("pattern") not in MODEL_PATTERNS:
                    errors.append(f"[{cutoff} {bid}] model pattern "
                                  f"{model.get('pattern')!r} outside enum")
                if rubric.get("risk") not in RUBRIC_RISKS:
                    errors.append(f"[{cutoff} {bid}] rubric risk "
                                  f"{rubric.get('risk')!r} outside ladder")
                if rubric.get("pattern") not in RUBRIC_PATTERNS:
                    errors.append(f"[{cutoff} {bid}] rubric pattern "
                                  f"{rubric.get('pattern')!r} outside enum")
                if rubric.get("risk") == "unknown":
                    errors.append(f"[{cutoff} {bid}] monitored bridge with "
                                  f"rubric risk unknown")
            if d.get("radar_coverage") not in COVERAGES:
                errors.append(f"[{cutoff} {bid}] radar_coverage "
                              f"{d.get('radar_coverage')!r} invalid")

    # 4. probabilities between 0 and 1.
    for cutoff, table in per_cutoff.items():
        for bid, d in table.items():
            model = d.get("model")
            if model is None:
                continue
            for key in ("p_risk", "p_high", "p_inspect"):
                v = model.get(key)
                if v is None or not isinstance(v, (int, float)) or \
                        isinstance(v, bool) or math.isnan(float(v)) or \
                        not (0.0 <= float(v) <= 1.0):
                    errors.append(f"[{cutoff} {bid}] model {key}={v!r} "
                                  f"not in [0, 1]")

    # 5. no value from a later month: compare against out/ for that cutoff.
    try:
        import pandas as pd  # noqa: PLC0415
    except ImportError:
        errors.append("pandas unavailable for out/ comparison")
        pd = None
    if pd is not None:
        for cutoff in cutoffs:
            csv_path = out_dir / f"model_decisions_{cutoff}.csv"
            if not csv_path.exists():
                errors.append(f"out/ file missing: {csv_path.name}")
                continue
            table = pd.read_csv(csv_path)
            web = per_cutoff.get(cutoff, {})
            for _, r in table.iterrows():
                name = r["asset"]
                bid = name_to_id.get(name)
                if bid is None or bid not in web:
                    continue  # already reported under (1)/(2)
                d = web[bid]
                not_mon = r["pattern"] == "not_monitored"
                exp_rank = None if _is_nan(r["rank_in_city"]) else int(r["rank_in_city"])
                if d.get("rank") != exp_rank:
                    errors.append(f"[{cutoff} {name}] rank {d.get('rank')} != "
                                  f"out/ {exp_rank} (later-month leak?)")
                for key, col in (("score", "anomaly_score"),
                                 ("wmax", "max_span_velocity_change_mm_yr"),
                                 ("wspread", "span_to_span_spread_mm_yr"),
                                 ("z", "score_vs_own_history_z"),
                                 ("vel", "long_term_velocity_mm_yr")):
                    exp = None if _is_nan(r[col]) else float(r[col])
                    if not _num_close(d.get(key), exp):
                        errors.append(f"[{cutoff} {name}] {key} {d.get(key)} "
                                      f"!= out/ {exp} (later-month leak?)")
                for flag in ("moving", "accelerating", "differential",
                             "outlier", "low_quality", "low_coverage",
                             "escalate"):
                    exp = str(r[flag]).lower() in ("true", "1")
                    if d.get("flags", {}).get(flag) is not exp:
                        errors.append(f"[{cutoff} {name}] flag {flag} differs "
                                      f"from out/")
                if d.get("escalations_12m") != int(r["escalations_12m"]):
                    errors.append(f"[{cutoff} {name}] escalations_12m differs")
                exp_mse = None if _is_nan(r["months_since_esc"]) \
                    else int(float(r["months_since_esc"]))
                if d.get("months_since_esc") != exp_mse:
                    errors.append(f"[{cutoff} {name}] months_since_esc differs")
                if d.get("radar_coverage") != str(r["radar_coverage"]):
                    errors.append(f"[{cutoff} {name}] radar_coverage differs")
                if not_mon:
                    if d.get("model") is not None:
                        errors.append(f"[{cutoff} {name}] not-monitored model "
                                      f"must be null")
                else:
                    m = d.get("model", {})
                    if m.get("pattern") != str(r["model_pattern"]) or \
                            m.get("risk") != str(r["model_risk_level"]):
                        errors.append(f"[{cutoff} {name}] model verdict differs "
                                      f"from out/")
                    exp_insp = str(r["model_needs_inspection"]).lower() in ("true", "1")
                    if m.get("inspect") is not exp_insp:
                        errors.append(f"[{cutoff} {name}] model inspect differs")
                    for key, col in (("p_risk", "model_p_risk"),
                                     ("p_high", "model_p_high"),
                                     ("p_inspect", "model_p_inspect")):
                        if not _num_close(m.get(key), float(r[col])):
                            errors.append(f"[{cutoff} {name}] {key} differs")
                rb = d.get("rubric", {})
                if rb.get("pattern") != str(r["pattern"]) or \
                        rb.get("risk") != str(r["risk_level"]):
                    errors.append(f"[{cutoff} {name}] rubric verdict differs "
                                  f"from out/")
                exp_alert = str(r["owner_condition_alert"]).lower() in ("true", "1")
                if d.get("owner_condition_alert") is not exp_alert:
                    errors.append(f"[{cutoff} {name}] owner_condition_alert "
                                  f"differs from out/")
        # Spans anomalies against the pickle rolls.
        state_path = out_dir / "dresden_state.pkl"
        if state_path.exists():
            with open(state_path, "rb") as fh:
                rolls = pickle.load(fh)["rolls"]
            for bid, entries in spans.get("spans", {}).items():
                name = id_to_name.get(bid)
                if name in (None,) or name not in rolls:
                    if entries:
                        errors.append(f"spans.json: unknown bridge {bid} "
                                      f"has non-empty spans")
                    continue
                roll = rolls[name]
                for e in entries:
                    col = e.get("span")
                    if col not in roll.columns:
                        errors.append(f"spans.json {name}: span {col} not in "
                                      f"out/ rolls")
                        continue
                    for i, cutoff in enumerate(cutoffs):
                        exp = roll.loc[cutoff, col]
                        got = (e.get("anomaly") or [None] * len(cutoffs))[i] \
                            if i < len(e.get("anomaly", [])) else None
                        if not _num_close(got, float(exp), SPAN_TOL):
                            errors.append(
                                f"spans.json {name} span {col} {cutoff}: "
                                f"{got} != out/ {float(exp):.3f}")
                            break

    # 6. owner fields only under "owner" and owner_condition_alert.
    def walk(node, path: list, src: str):
        if isinstance(node, dict):
            for key, val in node.items():
                if key in ("condition", "condition_source"):
                    if not (len(path) >= 1 and path[0] == "owner"):
                        errors.append(f"{src}: owner key {key!r} outside "
                                      f'"owner" at {path}')
                elif key == "owner":
                    if not (src == "decisions.json" and path == []):
                        errors.append(f"{src}: 'owner' key outside top-level "
                                      f"decisions.json at {path}")
                elif key == "owner_condition_alert":
                    if not (src == "decisions.json" and len(path) == 3
                            and path[0] == "decisions"):
                        errors.append(f"{src}: owner_condition_alert outside "
                                      f"a per-bridge decision at {path}")
                walk(val, path + [key], src)
        elif isinstance(node, list):
            for i, val in enumerate(node):
                walk(val, path + [i], src)

    walk(decisions, [], "decisions.json")
    for fname in ("bridges.geojson", "spans.json", "scatterers.geojson",
                  "sam.geojson"):
        fpath = data_dir / fname
        if fpath.exists():
            walk(_load_json(fpath), [], fname)

    # 7. not-monitored bridges carry their reason.
    for f in bridges.get("features", []):
        props = f.get("properties", {})
        if props.get("monitored") is False and not props.get("reason"):
            errors.append(f"bridges.geojson {props.get('name')}: not-monitored "
                          f"bridge without a reason")
    for cutoff, table in per_cutoff.items():
        for bid, d in table.items():
            if d.get("radar_coverage") == "none" or \
                    d.get("rubric", {}).get("risk") == "unknown":
                if not d.get("reason"):
                    errors.append(f"[{cutoff} {bid}] not-monitored decision "
                                  f"without a reason")

    # 8. no whole-period EGMS values (SPEC 3.5). Fail if any web/data file
    # carries a whole-period column by name or by short key (v/c). The one
    # exception is the top-level "v" map in scatterer_velocity.json, which
    # holds per-cutoff (not whole-period) velocities; "v" stays banned in
    # scatterers.geojson, which keeps id + track + geometry only.
    def walk_keys(node, path: list, src: str):
        if isinstance(node, dict):
            for key, val in node.items():
                if key in WHOLE_PERIOD_KEYS:
                    if not (src == "scatterer_velocity.json" and path == []
                            and key == "v"):
                        errors.append(f"{src}: whole-period key {key!r} banned "
                                      f"by SPEC 3.5 at {path + [key]}")
                walk_keys(val, path + [key], src)
        elif isinstance(node, list):
            for i, val in enumerate(node):
                walk_keys(val, path + [i], src)

    walk_keys(decisions, [], "decisions.json")
    walk_keys(bridges, [], "bridges.geojson")
    walk_keys(spans, [], "spans.json")
    for fname in ("scatterers.geojson", "sam.geojson",
                  "scatterer_velocity.json", "s1_amplitude.json"):
        fpath = data_dir / fname
        if fpath.exists():
            try:
                walk_keys(_load_json(fpath), [], fname)
            except json.JSONDecodeError as exc:
                errors.append(f"invalid JSON in {fname}: {exc}")

    # 9. scatterer ids match both ways; every array has 33 entries.
    vel_data: dict = {}
    vel_ids: set = set()
    svel_path = data_dir / "scatterer_velocity.json"
    if not svel_path.exists():
        errors.append("missing file: scatterer_velocity.json")
    else:
        try:
            svel = _load_json(svel_path)
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON in scatterer_velocity.json: {exc}")
            svel = None
        if svel is not None:
            if svel.get("cutoffs") != cutoffs:
                errors.append("scatterer_velocity.json cutoffs differ from "
                              "decisions.json cutoffs")
            vel_data = svel.get("v", {}) or {}
            vel_ids = set(vel_data)
            for pid, arr in vel_data.items():
                if not isinstance(arr, list) or len(arr) != N_CUTOFFS:
                    got = len(arr) if isinstance(arr, list) else type(arr).__name__
                    errors.append(f"scatterer_velocity.json {pid!r}: expected "
                                  f"{N_CUTOFFS} entries, got {got}")
    scat_path = data_dir / "scatterers.geojson"
    if not scat_path.exists():
        errors.append("missing file: scatterers.geojson")
    else:
        try:
            scat = _load_json(scat_path)
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON in scatterers.geojson: {exc}")
            scat = None
        if scat is not None:
            geo_ids = {f.get("properties", {}).get("id")
                       for f in scat.get("features", [])}
            only_vel = vel_ids - geo_ids
            only_geo = geo_ids - vel_ids
            if only_vel:
                errors.append(f"{len(only_vel)} scatterer_velocity.json ids "
                              f"missing from scatterers.geojson "
                              f"(e.g. {sorted(only_vel)[:3]})")
            if only_geo:
                errors.append(f"{len(only_geo)} scatterers.geojson ids "
                              f"missing from scatterer_velocity.json "
                              f"(e.g. {sorted(only_geo)[:3]})")

    # 10. per-bridge means of the exported per-point values match
    # decisions.json vel to 0.1. Point ids end in "|<asset_id>", and for
    # monitored bridges the web id equals the asset id.
    if vel_data and cutoffs:
        by_bridge: dict[str, list] = {}
        for pid in vel_data:
            tail = str(pid).rsplit("|", 1)
            bid = None
            if len(tail) == 2:
                try:
                    bid = str(int(tail[1]))
                except ValueError:
                    bid = None
            if bid is None or bid not in bridge_ids:
                errors.append(f"scatterer_velocity.json id {pid!r} does not "
                              f"map to a known bridge")
                continue
            by_bridge.setdefault(bid, []).append(pid)
        for bid, members in sorted(by_bridge.items()):
            for i, cutoff in enumerate(cutoffs):
                vals = [vel_data[m][i] for m in members
                        if i < len(vel_data[m]) and vel_data[m][i] is not None]
                mean = sum(vals) / len(vals) if vals else None
                exp = per_cutoff.get(cutoff, {}).get(bid, {}).get("vel")
                if mean is None and exp is None:
                    continue
                if mean is None or exp is None or \
                        abs(float(mean) - float(exp)) > VEL_MEAN_TOL:
                    errors.append(
                        f"[{cutoff} {id_to_name.get(bid, bid)}] exported "
                        f"per-point mean {mean} != decisions vel {exp} "
                        f"(tol {VEL_MEAN_TOL})")

    # 11. the s1 corners lie inside the Dresden bounding box.
    s1_path = data_dir / "s1_amplitude.json"
    if not s1_path.exists():
        errors.append("missing file: s1_amplitude.json")
    else:
        try:
            s1 = _load_json(s1_path)
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON in s1_amplitude.json: {exc}")
            s1 = None
        if s1 is not None:
            minlon, minlat, maxlon, maxlat = DRESDEN_BBOX
            coords = s1.get("coordinates", [])
            if len(coords) != 4:
                errors.append(f"s1_amplitude.json: expected 4 corners, "
                              f"got {len(coords)}")
            for corner in coords:
                try:
                    lon, lat = float(corner[0]), float(corner[1])
                except (TypeError, ValueError, IndexError):
                    errors.append(f"s1_amplitude.json: bad corner "
                                  f"{corner!r}")
                    continue
                if not (minlon <= lon <= maxlon and minlat <= lat <= maxlat):
                    errors.append(f"s1_amplitude.json corner {corner!r} "
                                  f"outside the Dresden bbox")
    return errors


def _copy_data(src: Path) -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="webdata_"))
    shutil.copytree(src, tmp / "data", dirs_exist_ok=True)
    return tmp / "data"


def self_test() -> int:
    data_src = ROOT / "web" / "data"
    out_dir = ROOT / "out"
    base = run_checks(data_src, out_dir)
    if base:
        print(f"self-test refused: clean tree already fails ({len(base)} errors)")
        for e in base[:10]:
            print(f"  clean-tree error: {e}")
        return 1

    def mutate(kind: str, data_dir: Path):
        if kind == "whole-period":
            # Mirror the pre-fix scatterer bug: a short whole-period key.
            scat_path = data_dir / "scatterers.geojson"
            scat = json.loads(scat_path.read_text())
            scat["features"][0]["properties"]["v"] = 0.0
            scat_path.write_text(json.dumps(scat))
            return
        if kind == "whole-period-name":
            dec_path = data_dir / "decisions.json"
            dec = json.loads(dec_path.read_text())
            c0 = dec["cutoffs"][0]
            bid = sorted(dec["decisions"][c0])[0]
            dec["decisions"][c0][bid]["mean_velocity"] = 0.0
            dec_path.write_text(json.dumps(dec))
            return
        if kind == "scatterer-id-mismatch":
            sv_path = data_dir / "scatterer_velocity.json"
            sv = json.loads(sv_path.read_text())
            sv["v"].pop(sorted(sv["v"])[0])
            sv_path.write_text(json.dumps(sv))
            return
        if kind == "scatterer-mean-mismatch":
            # Shift one bridge's cutoff-0 values by +5 mm/yr so its
            # exported mean leaves the 0.1 tolerance around decisions vel.
            sv_path = data_dir / "scatterer_velocity.json"
            sv = json.loads(sv_path.read_text())
            asset = sorted(sv["v"])[0].rsplit("|", 1)[1]
            for pid, arr in sv["v"].items():
                if pid.rsplit("|", 1)[1] == asset and arr[0] is not None:
                    arr[0] = round(arr[0] + 5.0, 1)
            sv_path.write_text(json.dumps(sv))
            return
        if kind == "scatterer-array-len":
            sv_path = data_dir / "scatterer_velocity.json"
            sv = json.loads(sv_path.read_text())
            pid = sorted(sv["v"])[0]
            sv["v"][pid] = sv["v"][pid][:32]
            sv_path.write_text(json.dumps(sv))
            return
        if kind == "s1-corner-outside":
            s1_path = data_dir / "s1_amplitude.json"
            s1 = json.loads(s1_path.read_text())
            s1["coordinates"][0] = [0.0, 0.0]
            s1_path.write_text(json.dumps(s1))
            return
        if kind == "whole-period-newfile":
            sv_path = data_dir / "scatterer_velocity.json"
            sv = json.loads(sv_path.read_text())
            sv["mean_velocity"] = 0.0
            sv_path.write_text(json.dumps(sv))
            return
        dec_path = data_dir / "decisions.json"
        dec = json.loads(dec_path.read_text())
        cutoffs = dec["cutoffs"]
        c0, c1 = cutoffs[0], cutoffs[1]
        bids = sorted(dec["decisions"][c0])
        mon = [b for b in bids
               if dec["decisions"][c0][b].get("model") is not None][0]
        unmon = [b for b in bids
                 if dec["decisions"][c0][b].get("model") is None][0]
        if kind == "extra-bridge":
            dec["decisions"][c0]["999"] = copy.deepcopy(
                dec["decisions"][c0][mon])
        elif kind == "missing-decision":
            del dec["decisions"][c0][mon]
        elif kind == "bad-risk":
            dec["decisions"][c0][mon]["model"]["risk"] = "critical"
        elif kind == "bad-prob":
            dec["decisions"][c0][mon]["model"]["p_high"] = 1.5
        elif kind == "future-leak":
            # Copy a later cutoff's score into the current one; walk forward
            # until the rounded values differ so the plant is real.
            planted = False
            for i in range(len(cutoffs) - 1):
                a, b = cutoffs[i], cutoffs[i + 1]
                va = dec["decisions"][a][mon]["score"]
                vb = dec["decisions"][b][mon]["score"]
                if va != vb:
                    dec["decisions"][a][mon]["score"] = vb
                    planted = True
                    break
            if not planted:
                raise AssertionError("no differing score to plant a leak with")
        elif kind == "owner-leak":
            dec["decisions"][c0][mon]["condition"] = "poor"
        elif kind == "missing-reason":
            dec["decisions"][c0][unmon]["reason"] = ""
        else:
            raise AssertionError(kind)
        dec_path.write_text(json.dumps(dec))

    kinds = ["extra-bridge", "missing-decision", "bad-risk", "bad-prob",
             "future-leak", "owner-leak", "missing-reason",
             "whole-period", "whole-period-name",
             "scatterer-id-mismatch", "scatterer-mean-mismatch",
             "scatterer-array-len", "s1-corner-outside",
             "whole-period-newfile"]
    failed = False
    for kind in kinds:
        tmp_data = _copy_data(data_src)
        try:
            mutate(kind, tmp_data)
            errs = run_checks(tmp_data, out_dir)
        finally:
            shutil.rmtree(tmp_data.parent, ignore_errors=True)
        if errs:
            print(f"self-test {kind}: PASS (caught: {errs[0][:110]})")
        else:
            print(f"self-test {kind}: FAIL (planted failure not caught)")
            failed = True
    return 1 if failed else 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    data_dir = ROOT / "web" / "data"
    if "--data-dir" in argv:
        data_dir = Path(argv[argv.index("--data-dir") + 1])
    errors = run_checks(data_dir, ROOT / "out")
    if errors:
        print(f"check_web_data: {len(errors)} failure(s)")
        for e in errors[:40]:
            print(f"  FAIL: {e}")
        if len(errors) > 40:
            print(f"  ... and {len(errors) - 40} more")
        return 1
    dec = _load_json(data_dir / "decisions.json")
    print(f"check_web_data: OK ({len(dec['cutoffs'])} cutoffs, "
          f"{len(dec['decisions'][dec['cutoffs'][0]])} bridges each, "
          f"{len(dec['owner'])} owner entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
