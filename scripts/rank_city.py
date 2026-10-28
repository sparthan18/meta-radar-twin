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
from radartwin.analytics.retro import rolling_span_anomaly, score_history, span_meta  # noqa: E402
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
                   event_date: str | None, track_cols: dict[str, list]
                   ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Axis -> spans -> rolling anomaly -> scores for one bridge's points."""
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
    meta = span_meta(bp[["span", "track", "temporal_coherence"]])
    return roll, score_history(roll, meta), meta


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


def main(site_slug: str = "carola") -> dict:
    site = SITES[site_slug]
    data_dir = ROOT / "data" / site.slug
    out_dir = ROOT / "out"
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
    for _, b in bridges.sort_values("name").iterrows():
        bp = on[on["asset_id"] == b["asset_id"]]
        roll, sc, meta = analyse_bridge(bp, cutoffs, site.event_date, track_cols)
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
             "cutoffs": cutoffs, "meta": metas}
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
    args = parser.parse_args()
    main(args.site)
