#!/usr/bin/env python3
"""City-wide rolling retrospective + ranking (SPEC §8).

Loads the clipped EGMS CSVs, binds scatterers to OSM bridge footprints, runs
the leak-free rolling retrospective at monthly cutoffs and writes scores,
ranking figure and reusable state. Usage::

    uv run python scripts/rank_city.py [site]

Reads only ``data/<site>/clip_*.csv`` and the cached Overpass JSON — never the
raw zips, and no network when the cache is present.
"""
from __future__ import annotations

import argparse
import pickle
import sys
from pathlib import Path

import geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.analytics.bind import bind_points  # noqa: E402
from radartwin.analytics.geometry import along_cross, assign_spans, bridge_axis  # noqa: E402
from radartwin.analytics.retro import (  # noqa: E402
    MIN_KEEP_EPOCHS,
    cutoff_coherence_velocity,
    rolling_span_anomaly,
    score_history,
    span_meta,
)
from radartwin.config import SITES  # noqa: E402
from radartwin.ingest.egms import date_columns, load_egms, time_series  # noqa: E402
from radartwin.segment.osm import dissolve_bridges, load_bridges  # noqa: E402

DRESDEN_CENTRE = (13.700, 51.030, 13.790, 51.080)  # minlon, minlat, maxlon, maxlat
FIRST_CUTOFF = "2022-01-01"
OUT_STEM = "dresden"
MIN_SCATTERERS = 10
MIN_TRACKS = 2


def monthly_cutoffs(start: str, event_date: str | None) -> list[str]:
    """First-of-month cutoffs from ``start`` while ``<= event_date``."""
    end = pd.Timestamp(event_date) if event_date else pd.Timestamp.today().normalize()
    dates = pd.date_range(start=pd.Timestamp(start), end=end, freq="MS")
    return [d.strftime("%Y-%m-%d") for d in dates]


def track_tag(path: Path) -> str:
    """``clip_asc_044.csv`` -> ``asc_044``."""
    return path.stem.removeprefix("clip_").removeprefix("_")


def load_city_points(data_dir: Path) -> tuple[gpd.GeoDataFrame, dict[str, list]]:
    """Concat the clipped EGMS CSVs with track tags (never the raw zips).

    Also returns each track's OWN epoch columns: concatenation unions the
    tracks' epochs, but every track's series must use only its own passes.
    """
    clips = sorted(data_dir.glob("clip_*.csv"))
    if not clips:
        raise FileNotFoundError(f"no clip_*.csv in {data_dir}")
    parts = []
    track_cols: dict[str, list] = {}
    for p in clips:
        tag = track_tag(p)
        df = load_egms(p, bbox=DRESDEN_CENTRE, track=tag)
        track_cols[tag] = date_columns(df)
        parts.append(df)
    pts = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs="EPSG:4326")
    return pts, track_cols


def analyse_bridge(bp: gpd.GeoDataFrame, cutoffs: list[str],
                   event_date: str | None, track_cols: dict[str, list],
                   use_egms_columns: bool = False,
                   plant_future_read: bool = False,
                   ) -> tuple:
    """Axis -> spans -> rolling anomaly -> scores for one bridge's points.

    Leak-free (the default): per-cutoff coherence and velocity from each
    cutoff's own past; returns ``(roll, scores, meta, vel, coh,
    meta_by_cutoff)`` where ``vel``/``coh`` are Series over cutoffs of the
    per-point means and ``meta_by_cutoff`` maps cutoff -> span meta.
    Baseline (``use_egms_columns=True``, only for the baseline
    reproduction): whole-period EGMS ``temporal_coherence`` for ``n_eff``;
    returns ``(roll, scores, meta)`` exactly as before phase 4d.
    ``plant_future_read`` (test hook for check_truncation --self-test only)
    includes the first post-cutoff epoch in the last cutoff's fits.
    """
    if use_egms_columns:
        return _analyse_bridge_baseline(bp, cutoffs, event_date, track_cols)
    return analyse_bridge_leakfree(bp, cutoffs, event_date, track_cols,
                                   plant_future_read=plant_future_read)


def _analyse_bridge_baseline(bp: gpd.GeoDataFrame, cutoffs: list[str],
                             event_date: str | None, track_cols: dict[str, list]
                             ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Pre-4d path, bit-identical: static EGMS coherence for ``n_eff``."""
    bp = bp.copy()
    origin, axis, crs = bridge_axis(bp)
    along, cross = along_cross(bp, origin, axis, crs)
    bp["along"] = along
    bp["cross"] = cross
    bp["span"] = assign_spans(bp)
    track_data: dict[str, dict] = {}
    for name, tp in bp.groupby("track"):
        t, y, dates = time_series(tp, track_cols[name])
        track_data[name] = {
            "t": t, "Y": y, "dates": dates,
            "span": tp["span"].to_numpy(),
            "los": tp[["los_east", "los_north", "los_up"]].to_numpy(),
        }
    roll = rolling_span_anomaly(track_data, cutoffs, event_date=event_date)
    meta = span_meta(bp[["span", "track", "temporal_coherence"]],
                     use_egms_columns=True)
    return roll, score_history(roll, meta), meta


def analyse_bridge_leakfree(bp: gpd.GeoDataFrame, cutoffs: list[str],
                            event_date: str | None, track_cols: dict[str, list],
                            plant_future_read: bool = False,
                            ) -> tuple:
    """Leak-free path (SPEC 3.5): per-cutoff coherence, velocity and shrink.

    Rolls use the same truncated refits as the baseline; only ``n_eff`` (via
    the cutoff coherence) and the per-point velocities change. Returns
    ``(roll, scores, meta_last, vel, coh, meta_by_cutoff)``.
    ``plant_future_read`` is a self-test hook only: at the last cutoff it
    includes the first post-cutoff epoch in the coherence/velocity fits.
    """
    import numpy as np

    bp = bp.copy()
    origin, axis, crs = bridge_axis(bp)
    along, cross = along_cross(bp, origin, axis, crs)
    bp["along"] = along
    bp["cross"] = cross
    bp["span"] = assign_spans(bp)
    track_data: dict[str, dict] = {}
    for name, tp in bp.groupby("track"):
        t, y, dates = time_series(tp, track_cols[name])
        track_data[name] = {
            "t": t, "Y": y, "dates": dates,
            "span": tp["span"].to_numpy(),
            "los": tp[["los_east", "los_north", "los_up"]].to_numpy(),
            "index": tp.index.to_numpy(),
        }
    roll = rolling_span_anomaly(track_data, cutoffs, event_date=event_date)
    limit_event = pd.Timestamp(event_date) if event_date else None
    meta_by_cutoff: dict[str, pd.DataFrame] = {}
    vel_vals: dict[str, float] = {}
    coh_vals: dict[str, float] = {}
    # Leak-free: no whole-period columns (temporal_coherence banned here).
    span_frame = bp[["span", "track"]]
    for cutoff in cutoffs:
        limit = pd.Timestamp(cutoff)
        if limit_event is not None:
            limit = min(limit, limit_event)
        point_coh = pd.Series(np.nan, index=bp.index, dtype=float)
        point_vel = pd.Series(np.nan, index=bp.index, dtype=float)
        for name, td in track_data.items():
            keep = np.asarray(td["dates"] < limit)
            if plant_future_read and cutoff == cutoffs[-1]:
                after = np.flatnonzero(np.asarray(td["dates"] >= limit))
                if len(after):
                    keep[after[0]] = True
            idx = td["index"]
            if int(keep.sum()) < MIN_KEEP_EPOCHS:
                continue
            coh, vel = cutoff_coherence_velocity(td["t"][keep], td["Y"][:, keep])
            point_coh.loc[idx] = coh
            point_vel.loc[idx] = vel
        meta_by_cutoff[cutoff] = span_meta(
            span_frame, cutoff=cutoff, point_coherence=point_coh)
        vel_vals[cutoff] = float(point_vel.mean())
        coh_vals[cutoff] = float(point_coh.mean())
    sc = score_history(roll, meta_by_cutoff=meta_by_cutoff)
    meta_last = meta_by_cutoff[cutoffs[-1]]
    return (roll, sc, meta_last,
            pd.Series(vel_vals), pd.Series(coh_vals), meta_by_cutoff)


def write_ranking_png(scores: pd.DataFrame, path: Path, event_date: str | None) -> None:
    """Horizontal bar ranking at the final cutoff; Carolabrücke highlighted."""
    final = scores.index[-1]
    ranked = scores.loc[final].sort_values(ascending=True)
    colors = ["#b91c1c" if n == "Carolabrücke" else "#1f77b4" for n in ranked.index]
    fig, ax = plt.subplots(figsize=(8, 0.45 * len(ranked) + 1.5))
    ax.barh(ranked.index, ranked.to_numpy(), color=colors)
    ax.set_xlabel("anomaly score (mm/yr)")
    ax.set_title(f"RadarTwin Dresden ranking at {final} (event {event_date})")
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def main(site_slug: str = "carola", out_dir: str | Path | None = None,
         use_egms_columns: bool = False) -> dict:
    site = SITES[site_slug]
    data_dir = ROOT / "data" / site.slug
    out_dir = Path(out_dir) if out_dir is not None else ROOT / "out"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[rank_city] site={site_slug} event={site.event_date}", flush=True)
    pts, track_cols = load_city_points(data_dir)
    print(f"[rank_city] loaded {len(pts)} scatterers from {data_dir}", flush=True)

    ways = load_bridges(DRESDEN_CENTRE, site, data_dir=data_dir)
    print(f"[rank_city] {len(ways)} OSM ways after rail dedupe", flush=True)
    dissolved = dissolve_bridges(ways)
    print(f"[rank_city] {len(dissolved)} named bridges >= 80 m", flush=True)

    bound = bind_points(pts, dissolved)
    on = bound.dropna(subset=["asset_id"]).copy()
    on["asset_id"] = on["asset_id"].astype(int)
    counts = on.groupby("asset_id").agg(n=("track", "size"), tracks=("track", "nunique"))
    keep = counts[(counts["n"] >= MIN_SCATTERERS) & (counts["tracks"] >= MIN_TRACKS)]
    bridges = dissolved[dissolved["asset_id"].isin(keep.index)].copy()
    on = on[on["asset_id"].isin(keep.index)].copy()
    print(f"[rank_city] {len(bridges)} analysed bridges, {len(on)} scatterers on bridges",
          flush=True)

    cutoffs = monthly_cutoffs(FIRST_CUTOFF, site.event_date)
    print(f"[rank_city] {len(cutoffs)} cutoffs {cutoffs[0]}..{cutoffs[-1]}", flush=True)

    rolls: dict[str, pd.DataFrame] = {}
    metas: dict[str, pd.DataFrame] = {}
    per: dict[str, pd.DataFrame] = {}
    vels: dict[str, pd.Series] = {}
    cohs: dict[str, pd.Series] = {}
    metas_by_cutoff: dict[str, dict] = {}
    for _, b in bridges.sort_values("name").iterrows():
        bp = on[on["asset_id"] == b["asset_id"]]
        res = analyse_bridge(bp, cutoffs, site.event_date, track_cols,
                             use_egms_columns=use_egms_columns)
        if use_egms_columns:
            roll, sc, meta = res
        else:
            roll, sc, meta, vel, coh, meta_by_cutoff = res
            vels[b["name"]] = vel
            cohs[b["name"]] = coh
            metas_by_cutoff[b["name"]] = meta_by_cutoff
        rolls[b["name"]] = roll
        metas[b["name"]] = meta
        per[b["name"]] = sc
        print(f"[rank_city] {b['name']}: n={len(bp)} spans={roll.shape[1]}", flush=True)

    names = sorted(per)
    scores = pd.DataFrame({n: per[n]["score"] for n in names}, index=cutoffs)
    z_scores = pd.DataFrame({n: per[n]["z"] for n in names}, index=cutoffs)
    wmax = pd.DataFrame({n: per[n]["wmax"] for n in names}, index=cutoffs)
    wspread = pd.DataFrame({n: per[n]["wspread"] for n in names}, index=cutoffs)

    bridges_out = bridges.merge(counts, left_on="asset_id", right_index=True)
    bridges_out = bridges_out.sort_values("asset_id")[["asset_id", "name", "len_m", "n", "tracks"]]
    scores.to_csv(out_dir / f"{OUT_STEM}_scores.csv")
    z_scores.to_csv(out_dir / f"{OUT_STEM}_z_scores.csv")
    wmax.to_csv(out_dir / f"{OUT_STEM}_wmax.csv")
    wspread.to_csv(out_dir / f"{OUT_STEM}_wspread.csv")
    bridges_out.to_csv(out_dir / f"{OUT_STEM}_bridges.csv", index=False)
    write_ranking_png(scores, out_dir / f"{OUT_STEM}_ranking.png", site.event_date)
    state = {"rolls": rolls, "scores": scores, "z": z_scores, "wmax": wmax,
             "wspread": wspread, "pts": on, "bridges": bridges,
             "cutoffs": cutoffs, "meta": metas,
             "use_egms_columns": bool(use_egms_columns)}
    if not use_egms_columns:
        state["velocity"] = pd.DataFrame(vels, index=cutoffs)
        state["coherence"] = pd.DataFrame(cohs, index=cutoffs)
        state["meta_by_cutoff"] = metas_by_cutoff
    with open(out_dir / f"{OUT_STEM}_state.pkl", "wb") as fh:
        pickle.dump(state, fh)

    n_spans = sum(r.shape[1] for r in rolls.values())
    print(f"[rank_city] wrote {OUT_STEM}_*.csv/png/pkl to {out_dir}; {n_spans} spans total",
          flush=True)
    if "Carolabrücke" in scores.columns:
        for c in ("2023-10-01", "2024-06-01", "2024-08-01", "2024-09-01"):
            rank = int(scores.loc[c].rank(ascending=False)["Carolabrücke"])
            print(f"[rank_city] Carolabrücke score rank at {c}: {rank}", flush=True)
        for c in ("2024-08-01", "2024-09-01"):
            zrank = int(z_scores.loc[c].rank(ascending=False)["Carolabrücke"])
            print(f"[rank_city] Carolabrücke z rank at {c}: {zrank} "
                  f"(z={z_scores.loc[c]['Carolabrücke']:.2f})", flush=True)
    return state


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rank a city's bridges (SPEC §8).")
    parser.add_argument("site", nargs="?", default="carola", help="site slug")
    parser.add_argument("--outdir", default=None, help="output directory (default out/)")
    parser.add_argument("--leakfree", action="store_true",
                        help="no-op alias; leak-free is the default")
    parser.add_argument("--use-egms", action="store_true",
                        help="whole-period EGMS columns, only for the baseline "
                             "reproduction")
    args = parser.parse_args()
    use_egms = False
    if args.leakfree:
        use_egms = False  # no-op alias; leak-free is the default
    if args.use_egms:
        use_egms = True
    main(args.site, out_dir=args.outdir, use_egms_columns=use_egms)
