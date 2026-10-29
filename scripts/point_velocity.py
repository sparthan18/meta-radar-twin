#!/usr/bin/env python3
"""Per-point cutoff velocity for every scatterer (phase 5c, step 2).

For every scatterer row in ``out/dresden_state.pkl`` and every cutoff,
computes the cutoff velocity with
:func:`radartwin.analytics.retro.cutoff_coherence_velocity` on that point's
own-track epochs with ``date < cutoff`` (NaN below 24 epochs), exactly as
``scripts/rank_city.py`` does for the bridge means. Writes
``out/scatterer_velocity.csv`` (rows = point id, columns = cutoffs) and
checks that, for every bridge and cutoff, the mean over the bridge's bound
points equals the bridge's ``state["velocity"]`` value.

Point id is ``"<pid>|<track>|<asset_id>"``: ``pid`` alone is not unique
(3,336 unique pids for 3,694 rows) because points in overlapping bridge
footprints are bound to two bridges, and the pickle index is duplicated the
same way. The composite is unique for all 3,694 rows.

Reads ``out/dresden_state.pkl`` plus the ``data/carola/clip_*.csv`` headers
(only the header row, to recover each track's own epoch columns exactly as
the pipeline does). Writes only ``out/scatterer_velocity.csv``; never
modifies ``out/dresden_state.pkl`` or any other existing file under ``out/``.

Usage::

    .venv/bin/python scripts/point_velocity.py
"""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.analytics.retro import cutoff_coherence_velocity  # noqa: E402
from radartwin.config import SITES  # noqa: E402
from radartwin.ingest.egms import date_columns, time_series  # noqa: E402

OUT = ROOT / "out"
DATA_DIR = ROOT / "data" / "carola"
SITE_SLUG = "carola"


def point_id(pid: object, track: object, asset_id: object) -> str:
    """Unique id for one bound scatterer row."""
    return f"{pid}|{track}|{int(asset_id)}"


def track_columns_from_headers() -> dict[str, list]:
    """Each track's own epoch columns, exactly as ``rank_city`` sees them.

    Reads only the header row of each clipped CSV (no data rows).
    """
    track_cols: dict[str, list] = {}
    for path in sorted(DATA_DIR.glob("clip_*.csv")):
        tag = path.stem.removeprefix("clip_").removeprefix("_")
        header = pd.read_csv(path, nrows=0)
        track_cols[tag] = date_columns(header)
    if not track_cols:
        raise FileNotFoundError(f"no clip_*.csv in {DATA_DIR}")
    return track_cols


def main() -> int:
    with open(OUT / "dresden_state.pkl", "rb") as fh:
        state = pickle.load(fh)
    pts: pd.DataFrame = state["pts"]
    cutoffs: list[str] = list(state["cutoffs"])
    velocity: pd.DataFrame = state["velocity"]
    bridges = state["bridges"]
    event_date = SITES[SITE_SLUG].event_date
    limit_event = pd.Timestamp(event_date) if event_date else None

    track_cols = track_columns_from_headers()
    missing_tracks = set(pts["track"].unique()) - set(track_cols)
    if missing_tracks:
        raise KeyError(f"tracks in pickle without clip headers: {missing_tracks}")

    ids = [
        point_id(p, t, a)
        for p, t, a in zip(
            pts["pid"].tolist(), pts["track"].tolist(), pts["asset_id"].tolist()
        )
    ]
    if len(set(ids)) != len(ids):
        raise ValueError("point ids are not unique")
    pos = pd.Series(np.arange(len(pts)), index=ids)

    result = pd.DataFrame(np.nan, index=ids, columns=cutoffs)
    for track in sorted(pts["track"].unique()):
        mask = pts["track"] == track
        tp = pts.loc[mask]
        cols = [c for c in track_cols[track] if c in pts.columns]
        if len(cols) != len(track_cols[track]):
            raise KeyError(f"track {track}: {len(track_cols[track]) - len(cols)} "
                           f"epoch columns missing from the pickle")
        t, y, dates = time_series(tp, cols)
        rows = pos.loc[
            [point_id(p, tr, a) for p, tr, a in
             zip(tp["pid"].tolist(), tp["track"].tolist(), tp["asset_id"].tolist())]
        ].to_numpy()
        for cutoff in cutoffs:
            limit = pd.Timestamp(cutoff)
            if limit_event is not None:
                limit = min(limit, limit_event)
            keep = np.asarray(dates < limit)
            if int(keep.sum()) < 24:
                continue  # all NaN, same as the pipeline's track-level skip
            _, vel = cutoff_coherence_velocity(t[keep], y[:, keep])
            result.loc[result.index[rows], cutoff] = vel

    out_path = OUT / "scatterer_velocity.csv"
    out = result.copy()
    out.index.name = "point_id"
    out.to_csv(out_path)

    # Check: per-bridge means must equal state["velocity"].
    asset_of = pd.Series(pts["asset_id"].to_numpy(), index=ids)
    name_of_asset = {int(r["asset_id"]): r["name"] for _, r in bridges.iterrows()}
    max_diff = 0.0
    worst: tuple = ("", "")
    for asset_id, name in sorted(name_of_asset.items()):
        members = asset_of[asset_of == asset_id].index
        for cutoff in cutoffs:
            got = float(result.loc[members, cutoff].to_numpy(dtype=float).mean())
            exp = float(velocity.loc[cutoff, name])
            if np.isnan(got) and np.isnan(exp):
                continue
            diff = abs(got - exp)
            if diff > max_diff:
                max_diff = diff
                worst = (name, cutoff)
    print(f"wrote {out_path} ({len(result)} points x {len(cutoffs)} cutoffs)")
    print(f"max abs difference vs state velocity: {max_diff!r} at {worst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
