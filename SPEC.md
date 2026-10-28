# RadarTwin — build specification

A city-scale radar watchlist for infrastructure. This document is complete enough to rebuild the
system from nothing. Every formula, threshold, API call shape and expected number is here. Build
it in this order; validate against `reference/` as you go.

Read `docs/idea.md` first for what the product is and what it must not claim.

---

## 0. Targets

- **Deadline:** Meta Global AI Developer Hackathon, submission due Nov 4 2026, 9 PM ET
  (Nov 5, 7:30 AM IST). Indie track.
- **Rubric:** Impact 30 % · Use of Meta AI tooling 25 % · Technical depth & execution 20 % · Demo 25 %.
- **Meta models (required to be central):** SAM 3.1 (segmentation), Muse Spark 1.3 (audit agent +
  memo), Muse Image (optional illustration), Muse Code (build agent). Muse Glimmer open weights on
  Baseten/Modal is a stretch.
- **Non-Meta runtime component, declared:** TypeSafe Jev for typed risk decisions with
  probabilities. Fallback if rules require Meta-only: Muse Spark structured output with the same
  schema (§9).

## 1. Repository layout

```
meta-radar-twin/
  SPEC.md                      this file
  docs/idea.md                 product description, claims and non-claims
  pyproject.toml               uv project, Python 3.12 (3.14 lacks wheels for rasterio/geopandas)
  radartwin/
    config.py                  Site dataclass + SITES
    ingest/egms.py             EGMS CSV clip + load
    ingest/imagery.py          Sentinel-2 visual + Sentinel-1 RTC chips (Planetary Computer)
    segment/osm.py             OpenStreetMap bridge footprints (Overpass)
    segment/sam.py             SAM 3.1 via Meta Model API
    analytics/trends.py        velocity, acceleration, seasonal fit
    analytics/geometry.py      deck axis, along/cross, span bins
    analytics/decompose.py     asc+desc LOS -> vertical/east
    analytics/bind.py          points -> polygons
    analytics/retro.py         rolling retrospective + scoring
    decide/rubric.py           deterministic flags + escalation
    decide/jev.py              Jev decision schema + call
    agents/llm.py              Muse Spark adapter
    agents/fidelity.py         SAR backscatter guardrail
    agents/audit.py            Muse Spark tool-calling audit agent
    agents/sitrep.py           memo.md + hazards.geojson
  scripts/
    clip_egms.py  rank_city.py  jev_decisions.py  export_web.py  sam_vs_osm.py
  web/index.html + web/data/   MapLibre page, static, Cloudflare Pages
  data/carola/                 EGMS tiles (gitignored; already present)
  reference/                   expected outputs from the validated prototype
```

Dependencies: numpy, pandas, geopandas, shapely, pyproj, pystac-client, planetary-computer,
rasterio, httpx, pydantic, `pydantic-ai-slim[typesafe,openai]`, `typesafe-sdk==0.6.0` (pin;
Pydantic AI expects 0.6.x), python-dotenv, matplotlib, openai (for the Meta API), modal (optional).

Environment: `.env` with `MODEL_API_KEY` (Meta) and `TYPESAFE_API_KEY`.

## 2. Data

### 2.1 EGMS (European Ground Motion Service) — Sentinel-1 derived displacement

Product: **Calibrated L2b, release 2020–2024**, one CSV per Sentinel-1 track/burst. Three tiles
over Dresden are in `data/carola/*.zip` and already clipped to `data/carola/clip_<asc|desc>_<orbit>.csv`:

| file | track | points (clip) | epochs | first / last |
|---|---|---|---|---|
| clip_asc_044.csv | ascending 044 | 138,377 | 209 | 2020-01-04 / 2024-12-26 |
| clip_asc_146.csv | ascending 146 | 115,326 | 205 | 2020-01-05 / 2024-12-21 |
| clip_desc_095.csv | descending 095 | 124,315 | 203 | 2020-01-02 / 2024-12-30 |

Columns: `pid, mp_type, latitude, longitude, easting, northing, height_ortho, height_ellipse,
line, pixel, rmse_ts, temporal_coherence, amplitude_dispersion, incidence_angle, track_angle,
los_east, los_north, los_up, mean_velocity, mean_velocity_std, acceleration, acceleration_std,
seasonality, seasonality_std, gnss_velocity`, then one column per epoch named `YYYYMMDD` holding
LOS displacement in mm relative to the first epoch. Positive LOS = toward the satellite.

The clip bbox (lon/lat) is `DRESDEN_CENTRE = (13.700, 51.030, 13.790, 51.080)`. Raw tiles are
~1 GB each; clip with `pandas.read_csv(chunksize=200_000)` filtering on lat/lon. Never load a raw
tile whole.

**Latency caveat (state it everywhere):** this release was published Aug–Sep 2025. EGMS updates
annually with ~1 year latency. A user in Aug 2024 would have had data to Dec 2023 only.

### 2.2 Imagery — Microsoft Planetary Computer STAC (no account)

STAC `https://planetarycomputer.microsoft.com/api/v1`, sign with `planetary_computer.sign_inplace`.
- Sentinel-2: collection `sentinel-2-l2a`, asset `visual`, filter `eo:cloud_cover < 10`, pick lowest cloud in
  `2023-05-01/2023-09-30`.
- Sentinel-1 RTC amplitude: collection `sentinel-1-rtc`, asset `vv` (linear power).
Clip to the site bbox with a rasterio window (transform bbox to the asset CRS first) and write a
GeoTIFF under `data/<site>/`.

### 2.3 OpenStreetMap bridge footprints — Overpass

Query (bbox order is south, west, north, east):
```
[out:json][timeout:60];
( way["bridge"]["highway"](S,W,N,E); way["bridge"]["railway"](S,W,N,E);
  way["man_made"="bridge"](S,W,N,E); way["waterway"="dam"](S,W,N,E); way["man_made"="dam"](S,W,N,E); );
out geom;
```
Rules learned the hard way:
- Send a custom `User-Agent` (e.g. `radartwin/0.1`). Without it Overpass returns **406**.
- Mirrors in order: `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee`. Fall
  through on any HTTP error or non-JSON body (502s and HTML rate-limit pages happen).
- **Cache** the raw JSON per bbox under `data/<site>/osm_raw_<bbox>.json`; already present for
  the site bbox and for DRESDEN_CENTRE.
- Geometry: closed way with >3 nodes → Polygon, else LineString. Buffer in the UTM CRS
  (`gdf.estimate_utm_crs()`) by **12 m, flat caps**, back to EPSG:4326.
- Name: `site.osm_names[id]` override, else `name`, else `bridge:name`, else `osm-<id>`.
- A way with `railway` and no `highway` is **rail-only**; drop it if it intersects the union of
  road ways (tram rails duplicate the deck), keep it if it stands alone (the Carola carriageways are
  tagged tram-only since the demolition, ids **1422377883** and **1422377884** → "Carolabrücke").
- For a city run: `dissolve(by="name")`, drop `osm-*` names and bridges shorter than 80 m
  (length ≈ buffered-outline length / 2). Dresden gives **289 ways → 20 named bridges → 19 analysed**
  (≥10 scatterers on ≥2 tracks). See `reference/dresden_bridges.csv`.

### 2.4 Site config

```python
@dataclass(frozen=True)
class Site:
    slug: str; name: str
    bbox: tuple[float, float, float, float]    # minlon, minlat, maxlon, maxlat
    event_date: str | None = None               # ISO; retrospectives use epochs strictly before it
    notes: str = ""
    osm_names: dict[int, str] | None = None
    condition: dict[str, str] | None = None     # asset name -> "good" | "fair" | "poor" (owner register)
SITES["carola"] = Site("carola", "Carola Bridge, Dresden", (13.735, 51.050, 13.748, 51.058),
    event_date="2024-09-11", osm_names={1422377883: "Carolabrücke", 1422377884: "Carolabrücke"},
    condition={"Carolabrücke": "poor"})   # strand C chloride damage was known and renovation planned
```

## 3. Analytics (deterministic; no model does arithmetic)

Units: displacement mm, time decimal years from first epoch, velocity mm/yr, acceleration mm/yr².

### 3.1 trends.py
- `linear_velocity(t, Y)` → per row least-squares slope and RMS residual; rows with < 6 valid
  epochs → NaN. (`np.polyfit(t[ok], y[ok], 1)`.)
- `windowed_velocity(t, Y, window_years=1.0)` → slope on epochs with `t >= t[-1] - window`.
- `acceleration(t, Y)` = `sign(recent) * (|recent| - |long|)`; more robust than a quadratic fit.
- `seasonal_fit(t, Y)` → fit `a + b·t + c·sin(2πt) + d·cos(2πt)` per row (≥ 12 valid epochs);
  return params (n,4) and the deseasoned series `y - (c·sin + d·cos)`. Seasonal amplitude =
  `hypot(c, d)`. **The thermal cycle on a deck (±4 mm) is ~10× the trend; always deseason first.**

### 3.2 geometry.py
- `bridge_axis(points)` → SVD of UTM coordinates; first right-singular vector; flip so it points
  north (`axis[1] >= 0`). Returns (origin, axis, crs).
- `along_cross(points, origin, axis, crs)` → `along = xy·axis`, `cross = xy·(-axis_y, axis_x)`.
- `assign_spans(pts, span_m=60, min_pts=3)` → `span = floor((along - min)/60)`; merge any span
  with < 3 points into the nearest span that has ≥ 3.

### 3.3 decompose.py
`decompose(L, v)` with `L` rows `(los_east, los_north, los_up)` and `v` LOS values: require both
signs of `los_east` present (asc + desc), solve least squares on columns `[east, up]` only
(Sentinel-1 is blind to north). Return `(east, up, n_used)`; NaN otherwise.

### 3.4 bind.py
`gpd.sjoin(points, polygons[["asset_id","geometry"]], how="left", predicate="within")`.

### 3.5 retro.py — the leak-free rolling retrospective
```
for cutoff in monthly cutoffs (2022-01-01 … event month):
  for span:
    for track:
      keep epochs with date < cutoff; require ≥ 24
      params, yd = seasonal_fit(t[keep], y_raw[span pts][:, keep])   # refit on truncated RAW data
      lt = linear_velocity(t[keep], yd);  rc = windowed_velocity(t[keep], yd, 1.0)
      dv_track = nanmean(rc - lt)                                     # mm/yr, LOS
      L_track = mean LOS vector of that track's points in the span
    (_, up, _) = decompose(stack(L_track), stack(dv_track))           # vertical mm/yr
    roll[cutoff, span] = up
```
`span_meta`: per span `n`, `tracks`, `coherence` (mean temporal_coherence), `n_eff = n·coherence`.

`score_history(roll, meta)` per cutoff:
- `w_span = n_eff / (n_eff + 8)` (SHRINK_K = 8); `shr = roll * w`
- `wmax = max |shr|`, `wspread = max(shr) - min(shr)`, **`score = wmax + wspread`**
- `z` = `(score - median(score at earlier cutoffs)) / (1.4826·MAD)`, needs ≥ 6 earlier cutoffs.

**Validation (reference/dresden_scores.csv etc.): Carola score rank among 19 must be 3 at
2023-10-01, 10 at 2024-06-01, 3 at 2024-08-01, 2 at 2024-09-01; z rank 1 at 2024-08-01 and
2024-09-01 (z ≈ 2.57).** Per-track long-term velocities on Carola (pre-collapse, raw) must match the
EGMS `mean_velocity` column within 0.1 mm/yr: asc_044 −0.47 vs −0.51, asc_146 −0.59 vs −0.62,
desc_095 0.24 vs 0.18.

### 3.6 features per asset per cutoff (what Jev sees)
```
asset, cutoff, scatterers, tracks, spans,
long_term_velocity_mm_yr (mean EGMS mean_velocity over the asset's points),
max_span_velocity_change_mm_yr (= wmax), span_to_span_spread_mm_yr (= wspread),
anomaly_score, score_vs_own_history_z, rank_in_city, bridges_in_city,
city_p80_velocity_change_mm_yr, city_p80_spread_mm_yr,
condition ("good"|"fair"|"poor"|"unknown")
```
Keep it small and literal; Jev reads questions literally and is weak at arithmetic.

## 4. Deterministic rubric (decide/rubric.py)

Flags (plain bools, shown to Jev as facts and printed in the memo):
```
moving        = |long_term_velocity| > 1.5            # EGMS noise floor ~1–2 mm/yr
accelerating  = wmax    > city_p80_velocity_change     # relative to the city at the same cutoff
differential  = wspread > city_p80_spread
outlier       = z > 2.0
low_quality   = scatterers < 20 or tracks < 2
```
**Escalation (new; state it as a general principle, never tune it on Carola):**
```
escalate = outlier and differential            # "exceeds anything in this asset's record, concentrated at one end"
immediate = escalate and condition == "poor"
```
These two produce an explicit sentence in the facts passed to Jev. Validate that `escalate` fires
on few bridges city-wide at each cutoff (report the count); if it fires on most, it is useless.

## 5. Jev decisions (decide/jev.py) — Pydantic AI, model `typesafe:jev-latest`

Docstrings ARE the questions. Integer rubrics are **not** supported by this SDK version; use enums.
```python
class MotionPattern(str, Enum):
    STABLE = "stable"                      """No meaningful motion. Velocities within the noise floor."""
    UNIFORM_SETTLEMENT = "uniform_settlement"  """The whole asset moves together at a steady rate. Low strain."""
    DIFFERENTIAL = "differential"          """Parts of the asset move at clearly different rates. Induces strain."""
    ACCELERATING = "accelerating"          """Motion is speeding up in the most recent year compared with the long-term trend."""
    UNRELIABLE = "unreliable"              """Too few points or residuals too high to judge."""

class RiskLevel(str, Enum):
    NONE = "none"            """No engineering attention needed. Routine monitoring only."""
    WATCH = "watch"          """Keep on the watchlist and re-evaluate at the next data update."""
    ELEVATED = "elevated"    """Schedule a targeted review of the flagged spans within the year."""
    HIGH = "high"            """Schedule a field inspection within the quarter."""
    IMMEDIATE = "immediate"  """Inspect now and consider load or traffic restrictions."""

class AssetDecision(BaseModel):
    """Classify the structural motion state of one infrastructure asset from pre-computed InSAR
    trend features and deterministic flags. Motion values are in mm per year."""
    pattern: MotionPattern          """Which motion pattern best describes this asset?"""
    risk_level: RiskLevel           """How urgent is engineering attention for this asset?"""
    needs_inspection: bool          """Should a field inspection be scheduled for this asset within the next quarter?"""
```
Call: `Agent("typesafe:jev-latest", output_type=AssetDecision).run_sync(json.dumps({"asset_features": f, "deterministic_flags": flags}))`.
Per-field confidence: `result.response.provider_details["confidence"]`.
Auth: `TYPESAFE_API_KEY`, SDK sends `Authorization: Bearer` to `https://api.typesafe.ai`. A 401
means the key is bad; regenerate at console.typesafe.ai.

**Reference (prototype, before escalation rule), cutoff 2024-09-01:** Carola → differential (p 1.00),
elevated (0.44), inspect yes (0.62). Cutoff 2024-08-01: differential (1.00), elevated (0.42),
inspect yes (0.60). Cutoff 2024-06-01: uniform_settlement, none, no. See `reference/jev_decisions_*.csv`.
With the escalation rule and `condition="poor"`, Aug/Sep 2024 should reach *high* or *immediate*.

Cost: ~400 decisions (19 bridges × 21 cutoffs) cost cents.

## 6. Meta Model API

Base URL `https://api.meta.ai/v1`, `Authorization: Bearer $MODEL_API_KEY`, OpenAI SDK compatible
(`OpenAI(base_url=..., api_key=...)`). Docs: https://dev.meta.ai/docs.

### 6.1 SAM 3.1 (`sam-3.1`) — segment/sam.py
`POST /v1/responses`, body `input=[{"type":"message","role":"user","content":[
  {"type":"input_text","text": PROMPT}, {"type":"input_image","image_url": "data:image/png;base64,..."}]}]`,
`metadata={"include_confidence":"true"}`, stream or not (same format).
- Text prompt: ONE noun phrase, e.g. `"bridge"`. Absent concept → empty output, not an error.
- Box prompt grammar in the same `input_text`: `<0f>1<|box;x1=..;y1=..;x2=..;y2=..;w=W;h=H|>`
  (pixels; `x2,y2` inclusive; `w,h` must equal the image size or you get 400; ids unique).
- Output is **text** on `output_text`: `<0f>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..;c=..|><|mask;x=0;y=0;data=H,W,~<base85>|>`
  records separated by commas. Mask raster is H×W (smaller than the frame), encoding char after
  `H,W,` is `~` (lossless, default) or `!` (one-bit); payload is **base85**. Decode to a row-major
  0/1 array, resize to the frame, then `rasterio.features.shapes` with the chip transform → polygons.
- Price $2.50 / 1,000 images.

Plan: run on the Sentinel-2 `visual` chip (10 m). Pass OSM footprint bounding boxes (in chip pixel
coordinates) as box prompts; also try text `"bridge"`. Compare SAM polygons to OSM polygons by IoU
(`scripts/sam_vs_osm.py` → `out/sam_vs_osm.png` + a table). Expect SAM to refine OSM outlines,
not to find bridges zero-shot at 10 m; say so.

### 6.2 Muse Spark 1.3 (`muse-spark-1.3`) — agents/llm.py, agents/audit.py
Chat Completions / Responses, 1M context, tool calling, vision. $1.25 in / $4.25 out per M tokens.
Adapter: Pydantic AI `OpenAIChatModel("muse-spark-1.3", provider=OpenAIProvider(base_url, api_key))`.

Audit agent tools (all deterministic, all already computed):
`list_assets(cutoff)`, `get_asset_features(asset, cutoff)`, `get_span_series(asset)`,
`get_decision(asset, cutoff)` (Jev result + confidences), `backscatter_fidelity(asset)` (§7),
`write_hazard_layer(assets)`. System prompt: narrate, never compute, never invent numbers, cite the
feature values, include the data-quality and latency caveats. Output `memo.md` + `hazards.geojson`.

### 6.3 Muse Image (`muse-image-1.0`) — optional
`POST /v1/images/edits`, JSON `{"model":"muse-image-1.0","prompt":..., "images":[{"image_url":"data:..."}], "n":1}`. $0.01/image.
Ten-minute test on the SAR chip: if the edit is an honest "optical-style rendering", use it as a
labelled illustration in the memo. Otherwise drop it. It never feeds the pipeline.

## 7. Fidelity guardrail (agents/fidelity.py)
For each asset polygon, mask the Sentinel-1 RTC VV chip, convert linear power to dB
(`10·log10`), `bright_fraction = mean(dB > -8)`. Bridges/dams are metal/concrete → bright. A
polygon with a low bright fraction is a segmentation error (water, grass) → flag it, exclude from
ranking, report in the memo.

## 8. Scripts and expected outputs
- `scripts/clip_egms.py` — already-clipped files exist; keep for reproducibility.
- `scripts/rank_city.py carola` — bridges, binding, rolling retrospective, scoring, ranking;
  writes `out/dresden_scores.csv`, `_z_scores.csv`, `_wmax.csv`, `_wspread.csv`, `_bridges.csv`,
  `out/dresden_ranking.png`, and a pickle of state for the next scripts. Must reproduce
  `reference/` numbers (19 bridges, 3,700 scatterers on bridges, 61 on Carola, 98 spans in total).
- `scripts/jev_decisions.py <cutoff>` — features + flags + Jev for every bridge at a cutoff; prints
  the table; writes `out/jev_decisions_<cutoff>.csv` and `out/features_<cutoff>.csv`. Run at all
  21 cutoffs 2023-01-01 … 2024-09-01.
- `scripts/export_web.py` — writes `web/data/bridges.geojson` (simplified polygons; id, name, n,
  tracks, len_m), `spans.json` (`{cutoffs:[...], spans:{id:[{span, along_m, n, lat, lon, anomaly:[per cutoff]}]}}`),
  `decisions.json` (`{site, event_date, event_asset, n_bridges, decisions:{cutoff:{id:{rank, wmax,
  wspread, z, score, vel, flags, pattern, risk, inspect, p:{pattern,risk,inspect}}}}}`),
  `scatterers.geojson` (points with v, t, c, id).
- `scripts/sam_vs_osm.py` — §6.1.

## 9. Web map (web/index.html, no build step)
MapLibre GL 4.x from unpkg. Basemaps: Esri World Imagery raster tiles (default, desaturated) and
CARTO dark. Sources: `bridges` (promoteId `id`, fill + line coloured by **feature-state** `color`
so the scrubber is instant), `spans` (circles, diverging blue→white→red over ±4 mm/yr), `pts`
(scatterers, hidden by default). UI: header card with title, cutoff slider (one step per cutoff)
and an event badge once cutoff ≥ event date; legend; right panel = ranking list (rank, name, score,
risk pill, inspect flag) → click → detail (counts, city rank, score, wmax, wspread, z, long-term
velocity, flag chips, Jev rows with probability bars, SVG chart of per-span anomaly vs cutoff with
cutoff and collapse markers). Risk colours: none #4b5563, watch #eab308, elevated #f97316,
high #ef4444, immediate #7f1d1d. Add: SAM polygons + fidelity layer, SAR amplitude toggle, and a
"Run audit" button that streams the Spark memo from a small Modal FastAPI service.
Deploy: `wrangler pages deploy web --project-name radartwin`.

## 10. Event-week order (rubric-weighted)
1. SAM 3.1 on the Dresden chip + IoU vs OSM; Muse Image 10-min test.
2. Muse Spark audit agent → memo + hazard layer at 2024-09-01.
3. Escalation rule + condition input; re-run Jev at the 21 cutoffs; report how many bridges escalate.
4. Second EGMS site (Genoa / Morandi; precursor contested, say so) through the unchanged pipeline.
5. Web: SAM/fidelity layers, SAR toggle, Run-audit button; deploy.
6. README, architecture diagram, limitations; office hours.
7. Demo video 2–3 min, opening on the Carola hindcast and the Albert Bridge false positive.
8. Submit the evening of Nov 4 IST.

## 11. Pitfalls already paid for
- Python 3.14 has no wheels for rasterio/geopandas → pin 3.12.
- Overpass: 406 without a User-Agent; frequent 502/HTML → mirrors + cache.
- Never include epochs on/after `event_date` in any retrospective statistic (post-collapse epochs
  flip the "recent velocity").
- Refit the seasonal model inside each rolling cutoff; fitting once on all pre-collapse data leaks.
- Small spans (1–2 scatterers) dominate an unweighted max; shrink by n_eff and merge < 3-point spans.
- Jev rejects `int` fields → enums; Jev is sent only the compact feature dict + flags.
- TypeSafe 401 = bad key (SDK uses Bearer); regenerate.
- Local static server: use an unused port (8765 was taken on this machine).
- Synthetic-data sign bug: don't multiply an already-signed acceleration by sign(vel).
