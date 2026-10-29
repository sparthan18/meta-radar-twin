#!/usr/bin/env python3
"""Export web map data from out/ only (SPEC section 8, phase 5a).

Reads ``out/`` only (no API calls, no ``data/`` reads) and writes ``web/data/``:
``bridges.geojson``, ``spans.json``, ``decisions.json``, ``scatterers.geojson``,
``sam.geojson`` and ``memos/<cutoff>.md``. Simplifies polygons and rounds
numbers so the total stays under 3 MB. Prints each file size.

Usage::

    uv run python scripts/export_web.py
    .venv/bin/python scripts/export_web.py
"""
from __future__ import annotations

import json
import math
import pickle
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import geopandas as gpd  # noqa: E402
import pandas as pd  # noqa: E402

from radartwin.analytics.geometry import (  # noqa: E402  pure math, no I/O
    along_cross,
    assign_spans,
    bridge_axis,
)
from radartwin.config import SITES  # noqa: E402  site metadata only, not data

OUT = ROOT / "out"
WEB_DATA = ROOT / "web" / "data"
SITE_SLUG = "carola"
EVENT_ASSET = "Carolabrücke"
SIMPLIFY_TOL = 0.00002  # degrees, ~2 m; 2710 -> ~350 coords city-wide
COORD_ND = 5
MAX_TOTAL = 3 * 1024 * 1024


def _round3(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 3) if math.isfinite(f) else None


def _round2(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 2) if math.isfinite(f) else None


def _round_coords(obj, nd=COORD_ND):
    if isinstance(obj, float):
        return round(obj, nd)
    if isinstance(obj, list):
        return [_round_coords(v, nd) for v in obj]
    return obj


def _bool(v) -> bool:
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    return s in ("true", "1", "yes", "t")


def main() -> int:
    site = SITES[SITE_SLUG]
    event_date = site.event_date or ""
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "memos").mkdir(parents=True, exist_ok=True)

    with open(OUT / "dresden_state.pkl", "rb") as fh:
        state = pickle.load(fh)
    cutoffs: list[str] = list(state["cutoffs"])
    bridges_state: gpd.GeoDataFrame = state["bridges"]
    pts: pd.DataFrame = state["pts"]
    rolls: dict = state["rolls"]

    analysed_ids = pd.read_csv(OUT / "dresden_bridges.csv")
    name_to_id: dict[str, str] = {
        r["name"]: str(int(r["asset_id"])) for _, r in analysed_ids.iterrows()
    }
    # Not-monitored names come from the decisions tables (out/ only). Their ids
    # are the missing slots in 0..N-1, which reproduces the dissolve ids
    # (Augustusbruecke -> "1" for the current 20-bridge city).
    probe = pd.read_csv(OUT / f"model_decisions_{cutoffs[-1]}.csv")
    dropped_names = sorted(
        probe.loc[probe["pattern"] == "not_monitored", "asset"].tolist()
    )
    n_total = len(name_to_id) + len(dropped_names)
    used = {int(v) for v in name_to_id.values()}
    missing = [i for i in range(n_total) if i not in used]
    for name, aid in zip(dropped_names, missing):
        name_to_id[name] = str(aid)
    id_to_name = {v: k for k, v in name_to_id.items()}

    # --- bridges.geojson: geometries from the latest hazard layer (out/ only),
    # which carries every bridge including the not-monitored ones.
    hazards = gpd.read_file(OUT / f"hazards_{cutoffs[-1]}.geojson")
    last_table = probe.set_index("asset")
    feats = []
    for _, h in hazards.iterrows():
        name = h["name"]
        bid = name_to_id[name]
        row = last_table.loc[name]
        monitored = row["pattern"] != "not_monitored"
        geom = h["geometry"].simplify(SIMPLIFY_TOL, preserve_topology=True)
        if monitored:
            crow = analysed_ids.loc[analysed_ids["name"] == name].iloc[0]
            props = {
                "id": bid,
                "name": name,
                "len_m": float(crow["len_m"]),
                "n": int(row["scatterers"]),
                "tracks": int(row["tracks"]),
                "monitored": True,
            }
        else:
            utm = hazards.estimate_utm_crs()
            o_utm = gpd.GeoSeries([h["geometry"]], crs="EPSG:4326").to_crs(utm).iloc[0]
            rect = o_utm.minimum_rotated_rectangle
            rc = list(rect.exterior.coords)
            long_side = max(
                math.hypot(rc[i + 1][0] - rc[i][0], rc[i + 1][1] - rc[i][1])
                for i in range(4)
            )
            props = {
                "id": bid,
                "name": name,
                "len_m": float(round(long_side)),
                "n": int(row["scatterers"]),
                "scatterers": int(row["scatterers"]),
                "tracks": int(row["tracks"]),
                "monitored": False,
                "points_per_ha": _round3(row["points_per_ha"]),
                "reason": str(row["reason"]),
            }
        feats.append({"type": "Feature", "properties": props, "geometry": geom.__geo_interface__})
    bridges_gj = {"type": "FeatureCollection", "features": feats}
    bridges_gj = json.loads(json.dumps(bridges_gj))
    for f in bridges_gj["features"]:
        f["geometry"]["coordinates"] = _round_coords(f["geometry"]["coordinates"])
    (WEB_DATA / "bridges.geojson").write_text(json.dumps(bridges_gj))

    # --- spans.json: span layout recomputed from the bound points in the
    # pickle (same functions as rank_city; verified to reproduce the roll
    # columns exactly), anomalies from the leak-free rolls.
    spans_out: dict[str, list] = {}
    for _, b in bridges_state.sort_values("name").iterrows():
        name = b["name"]
        bid = name_to_id[name]
        bp = pts[pts["asset_id"] == b["asset_id"]].copy()
        origin, axis, crs = bridge_axis(bp)
        along, _ = along_cross(bp, origin, axis, crs)
        bp["along"] = along
        bp["span"] = assign_spans(bp)
        lo = float(bp["along"].min())
        roll = rolls[name]
        entries = []
        for sp in sorted(roll.columns.tolist()):
            sub = bp[bp["span"] == sp]
            entries.append({
                "span": int(sp),
                "along_m": round(float(sub["along"].mean() - lo), 1),
                "n": int(len(sub)),
                "lat": round(float(sub["latitude"].mean()), 5),
                "lon": round(float(sub["longitude"].mean()), 5),
                "anomaly": [_round2(roll.loc[c, sp]) for c in cutoffs],
            })
        spans_out[bid] = entries
    for name in dropped_names:
        spans_out[name_to_id[name]] = []
    (WEB_DATA / "spans.json").write_text(json.dumps(
        {"cutoffs": cutoffs, "spans": spans_out}))

    # --- decisions.json: verbatim from out/model_decisions_<cutoff>.csv.
    decisions: dict[str, dict] = {}
    owner: dict[str, dict] = {}
    for cutoff in cutoffs:
        table = pd.read_csv(OUT / f"model_decisions_{cutoff}.csv")
        per: dict[str, dict] = {}
        for _, r in table.iterrows():
            name = r["asset"]
            bid = name_to_id[name]
            not_mon = r["pattern"] == "not_monitored"
            if not_mon:
                per[bid] = {
                    "rank": None,
                    "score": None,
                    "wmax": None,
                    "wspread": None,
                    "z": None,
                    "vel": None,
                    "flags": {
                        "moving": False, "accelerating": False,
                        "differential": False, "outlier": False,
                        "low_quality": False, "low_coverage": False,
                        "escalate": False,
                    },
                    "escalations_12m": 0,
                    "months_since_esc": None,
                    "radar_coverage": "none",
                    "model": None,
                    "rubric": {"pattern": "not_monitored", "risk": "unknown",
                               "inspect": False},
                    "owner_condition_alert": False,
                    "reason": str(r["reason"]),
                }
                continue
            mse = r["months_since_esc"]
            per[bid] = {
                "rank": int(r["rank_in_city"]),
                "score": _round3(r["anomaly_score"]),
                "wmax": _round3(r["max_span_velocity_change_mm_yr"]),
                "wspread": _round3(r["span_to_span_spread_mm_yr"]),
                "z": _round3(r["score_vs_own_history_z"]),
                "vel": _round3(r["long_term_velocity_mm_yr"]),
                "flags": {
                    "moving": _bool(r["moving"]),
                    "accelerating": _bool(r["accelerating"]),
                    "differential": _bool(r["differential"]),
                    "outlier": _bool(r["outlier"]),
                    "low_quality": _bool(r["low_quality"]),
                    "low_coverage": _bool(r["low_coverage"]),
                    "escalate": _bool(r["escalate"]),
                },
                "escalations_12m": int(r["escalations_12m"]),
                "months_since_esc": (None if pd.isna(mse) else int(float(mse))),
                "radar_coverage": str(r["radar_coverage"]),
                "model": {
                    "pattern": str(r["model_pattern"]),
                    "risk": str(r["model_risk_level"]),
                    "inspect": _bool(r["model_needs_inspection"]),
                    "p_risk": _round3(r["model_p_risk"]),
                    "p_high": _round3(r["model_p_high"]),
                    "p_inspect": _round3(r["model_p_inspect"]),
                },
                "rubric": {
                    "pattern": str(r["pattern"]),
                    "risk": str(r["risk_level"]),
                    "inspect": _bool(r["needs_inspection"]),
                },
                "owner_condition_alert": _bool(r["owner_condition_alert"]),
            }
            cond = str(r["condition"])
            if cond != "unknown" and name not in owner:
                owner[name] = {"condition": cond,
                               "source": str(r["condition_source"])}
        decisions[cutoff] = per
    (WEB_DATA / "decisions.json").write_text(json.dumps({
        "site": SITE_SLUG,
        "event_date": event_date,
        "event_asset": EVENT_ASSET,
        "n_bridges": int(len(bridges_state)),
        "n_not_monitored": int(len(dropped_names)),
        "cutoffs": cutoffs,
        "decisions": decisions,
        "owner": owner,
    }))

    # --- scatterers.geojson: one point per bound scatterer. Whole-period
    # EGMS values (mean_velocity/temporal_coherence, short keys v/c) are
    # banned by SPEC 3.5, so keep only the id, the track and the geometry.
    # Phase 5c adds per-cutoff values.
    sfeats = []
    for _, p in pts.sort_values(["asset_id", "pid"]).iterrows():
        sfeats.append({
            "type": "Feature",
            "properties": {
                "id": str(int(p["asset_id"])),
                "track": str(p["track"]),
            },
            "geometry": {"type": "Point", "coordinates": [
                round(float(p["longitude"]), 5), round(float(p["latitude"]), 5)]},
        })
    (WEB_DATA / "scatterers.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": sfeats}))

    # --- sam.geojson: SAM polygons with IoU vs the OSM footprints in hazards.
    # Bright fraction needs the radar chip under data/, which this exporter
    # must not read, so it stays null here (Phase 5b recomputes it if needed).
    sam = gpd.read_file(OUT / "sam_polygons.geojson")
    utm = hazards.estimate_utm_crs()
    sam_feats = []
    for _, r in sam.iterrows():
        name = r["bridge"]
        ogeom = hazards.loc[hazards["name"] == name].iloc[0]["geometry"]
        s_utm = gpd.GeoSeries([r["geometry"]], crs="EPSG:4326").to_crs(utm).iloc[0]
        o_utm = gpd.GeoSeries([ogeom], crs="EPSG:4326").to_crs(utm).iloc[0]
        union = s_utm.union(o_utm).area
        iou = s_utm.intersection(o_utm).area / union if union > 0 else float("nan")
        simp = r["geometry"].simplify(SIMPLIFY_TOL, preserve_topology=True)
        sam_feats.append({
            "type": "Feature",
            "properties": {
                "bridge": name,
                "id": name_to_id.get(name),
                "score": _round3(r["score"]),
                "iou": _round3(iou),
                "bright_fraction": None,
            },
            "geometry": json.loads(json.dumps(simp.__geo_interface__)),
        })
    for f in sam_feats:
        f["geometry"]["coordinates"] = _round_coords(f["geometry"]["coordinates"])
    (WEB_DATA / "sam.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": sam_feats}))

    # --- memos: verbatim copies for the cutoffs that have one. Clear
    # stale copies first so no memos in out/ means no memos in web/data.
    for stale in (WEB_DATA / "memos").glob("*.md"):
        stale.unlink()
    for memo in sorted(OUT.glob("memo_*.md")):
        shutil.copyfile(memo, WEB_DATA / "memos" / memo.name)

    files = ["bridges.geojson", "spans.json", "decisions.json",
             "scatterers.geojson", "sam.geojson"]
    total = 0
    for name in files:
        size = (WEB_DATA / name).stat().st_size
        total += size
        print(f"web/data/{name}: {size / 1024:.1f} KB ({size} bytes)")
    memos = sorted((WEB_DATA / "memos").glob("*.md"))
    for m in memos:
        size = m.stat().st_size
        total += size
        print(f"web/data/memos/{m.name}: {size / 1024:.1f} KB ({size} bytes)")
    print(f"total: {total / 1024:.1f} KB ({total} bytes)")
    if total >= MAX_TOTAL:
        print(f"FAIL: total {total} bytes exceeds 3 MB")
        return 1
    print(f"cutoffs: {len(cutoffs)} ({cutoffs[0]}..{cutoffs[-1]}), "
          f"bridges: {len(name_to_id)} ({len(bridges_state)} monitored + "
          f"{len(dropped_names)} not monitored), scatterers: {len(sfeats)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
