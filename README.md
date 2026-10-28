# RadarTwin

RadarTwin turns Europe's free Sentinel-1 ground-motion feed (EGMS) into a ranked inspection list for every bridge in a city, with typed risk decisions and stated probabilities. It binds radar scatterers to bridge footprints, splits each deck into spans along its axis, deseasons every series, combines ascending and descending passes into vertical motion per span, and scores each bridge on reliability-weighted differential motion in a leak-free rolling retrospective — against its own history and against every other bridge in the city. Validated on Dresden (19 bridges, EGMS 2020–2024), it would have flagged the Carola Bridge twice before its September 2024 collapse. It ranks assets for inspection; it does not predict failure or its timing.

## Setup

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
```

Create a `.env` file with API keys:

```
MODEL_API_KEY=<meta-model-api-key>
TYPESAFE_API_KEY=<typesafe-key>
```

EGMS clips and the cached Overpass JSON live under `data/carola/` (gitignored, already present); no network is needed for a city run when the cache is present.

## Run

```sh
uv run python scripts/rank_city.py carola
```

This loads the clipped EGMS CSVs, binds scatterers to OSM bridge footprints, runs the rolling retrospective at monthly cutoffs (2022-01-01 to the event month), and writes scores, the ranking figure and reusable state.

```sh
uv run python scripts/decisions.py all          # features + flags + rubric decision at every cutoff
uv run python scripts/decisions.py 2024-09-01   # ... or a single cutoff
uv run python scripts/audit.py 2024-09-01       # Muse Spark audit agent: memo + hazard layer
```

`scripts/decisions.py` reads `out/dresden_state.pkl` and writes `out/decisions_<cutoff>.csv` per cutoff (plus `out/escalation_counts.csv` with `all`). `scripts/audit.py` needs `MODEL_API_KEY` in `.env` (model from `RADARTWIN_LLM`, default `muse-spark-1.3`) and writes `out/memo_<cutoff>.md`, `out/audit_<cutoff>_tools.json` and `out/hazards_<cutoff>.geojson`. `uv run python scripts/check_memo.py <cutoff>` verifies every number in a memo traces back to the logged tool results.

## Decisions

Risk decisions currently come from an interim deterministic rubric (`radartwin/decide/rubric.py`) over pre-computed per-asset features (SPEC §3.6). Flags for motion, acceleration, differential movement and own-history outlier feed an escalation rule (outlier + differential). Persistence is leak-free: `months_since_esc` keeps an asset elevated for 3 months after an escalation, while `escalations_12m` is reported as evidence only and never raises the level. The risk ladder is high (escalating now) / elevated (escalated within 3 months, or accelerating + differential, or outlier) / watch (any motion flag) / none, capped at watch for thinly measured or radar-blind assets. The owner-register condition is a separate overlay (`owner_condition_alert = high and condition == "poor"`, with `condition_source`); headline numbers use the ladder only. Named bridges radar cannot see are carried as not monitored (`pattern = "not_monitored"`, `risk_level = "unknown"`, `radar_coverage = "none"`, with the reason) in decisions, the hazard layer and the memo. Model-backed decisions with probabilities are planned behind the same schema (pattern, risk_level, needs_inspection). The audit memo keeps owner inputs in its Owner condition section only, with the Verdict, Action list and Evidence sections citing radar evidence alone.

## Outputs (`out/`)

| File | Contents |
|---|---|
| `dresden_scores.csv` | Anomaly score per bridge per cutoff (rows = cutoffs, columns = bridges) |
| `dresden_z_scores.csv` | Score deviation from each bridge's own history (z) |
| `dresden_wmax.csv` | Max reliability-weighted span velocity change (wmax) |
| `dresden_wspread.csv` | Span-to-span spread (wspread); score = wmax + wspread |
| `dresden_bridges.csv` | Analysed bridges: asset_id, name, length, scatterer count, track count |
| `dresden_ranking.png` | Horizontal bar ranking at the final cutoff (Carolabrücke highlighted) |
| `dresden_state.pkl` | Pickled state (rolls, scores, points, bridges, cutoffs, span meta) for downstream scripts |
| `sam_smoke.png` | S2 chip with text-prompt SAM masks (none found at 10 m) |
| `sam_vs_osm.png` | OSM outlines vs SAM box-prompt masks side by side |
| `sam_polygons.geojson` | SAM box-prompt polygons (bridge, score) for reuse without new API calls |
| `decisions_<cutoff>.csv` | Per-bridge features, flags and rubric decision at a cutoff |
| `escalation_counts.csv` | Per-cutoff counts (n_bridges, n_not_monitored, n_high, n_elevated, n_watch, carola_risk, carola_escalations_12m, owner_condition_alerts) |
| `memo_<cutoff>.md` | Muse Spark engineering memo for a cutoff |
| `audit_<cutoff>_tools.json` | Logged tool calls/results behind a memo |
| `hazards_<cutoff>.geojson` | Bridge polygons with features, flags and decision as properties |

Validation: the pipeline reproduces an independent implementation of SPEC.md to < 0.05 mm/yr (max |score difference| over every bridge and cutoff versus `reference/dresden_scores.csv`).

## SAM 3.1 notes

Stage 2 segments the Sentinel-2 `visual` chip (`data/carola/s2_visual.tif`, 93×91 px at 10 m) with SAM 3.1 via `POST /v1/responses` (model `sam-3.1`, `metadata={"include_confidence":"true"}`). Run:

```sh
uv run python scripts/sam_smoke.py    # text prompts: "bridge", "river bridge", "road bridge"
uv run python scripts/sam_vs_osm.py   # OSM box prompts (one request) + text variant, IoU table
```

`radartwin/agents/fidelity.py:backscatter_fidelity` adds `bright_fraction = mean(dB > -8)` per polygon from `data/carola/s1_rtc_vv.tif` (linear power → dB). OSM footprints: Augustusbrücke 0.072, Carolabrücke 0.643. SAM box-prompt polygons: Augustusbrücke 0.061, Carolabrücke 0.443.

- Masks are decoded with Meta's official `meta_sam_parser` package (`radartwin/segment/sam.py`): response text is parsed with `image_segmentation_format`, each mask with `decode_mask_to_raster`, and box prompts are built with `build_object_prompt` (`box_prompt` is a thin wrapper converting caller-inclusive `x2,y2` to the builder's half-open edges). No hand base85 decoding remains.
- Deviation from SPEC §6.1: mask rasters are **box-local**, not frame-sized. Each mask maps onto its record's box bounds (the parser exposes them as `SegmentationMaskBounds`), so we resize the raster to the box and paste it at the box offset. Resizing to the full frame, as the spec sentence reads, smears a box-sized raster over the whole chip (first run gave 138,100 m² / 288,700 m² polygons with IoU ≈ 0). The fragment that shows it — box `x1=26..x2=42, y1=11..y2=45` (17×35 px) with mask `data=35,17,...` (35 rows × 17 cols):

  `<0f>1<|box;x1=26;y1=11;x2=42;y2=45;w=93;h=91;c=0.75390625|><|mask;x=0;y=0;c=0.75390625;data=35,17,!!!!!3Fc.X5YbYM*O6#%*-=Bk1|>`

- Text prompts find no bridges at 10 m. `"bridge"`, `"river bridge"` and `"road bridge"` each returned empty output (0 records) on the 93×91 chip — the absent-concept empty response SPEC §6.1 describes, not an error. Fragment: `''` (empty `output_text`).
- Upsampling 4× did not help. A bilinear 4× chip (372×364, 2.5 m effective pixels, transform scaled accordingly) with the same three texts also returned 0 records each. Fragment: `''`.
- Box prompts work in one request. Prompt `<0f>1<|box;x1=24;y1=12;x2=43;y2=46;w=93;h=91|>,2<|box;x1=78;y1=20;x2=88;y2=60;w=93;h=91|>` (single `<0f>` header, comma-separated ids — the multi-box form `build_object_prompt` emits) returned 2 records echoing ids 1 and 2 with confidences 0.75390625 and 0.76953125. IoU vs OSM: Augustusbrücke 0.537 (SAM 9,800 m² vs OSM 16,617 m²), Carolabrücke 0.326 (SAM 12,200 m² vs OSM 11,360 m²); text-variant IoU 0.000 for both. Full response:

  `<0f>1<|box;x1=26;y1=11;x2=42;y2=45;w=93;h=91;c=0.75390625|><|mask;x=0;y=0;c=0.75390625;data=35,17,!!!!!3Fc.X5YbYM*O6#%*-=Bk1|>,2<|box;x1=80;y1=20;x2=88;y2=59;w=93;h=91;c=0.76953125|><|mask;x=0;y=0;c=0.76953125;data=40,9,!!!!!4L_R6Z`*&v+XvP_:o_awaKY|>`

- Encodings observed: `!` (one-bit) on the small box-prompt masks above; `~` (lossless) on text-prompt masks. Large-area concepts do match at 10 m: `"water"`/`"river"` returned a half-chip mask with id 0 and record head `<0f>0<|box;x1=0;y1=0;x2=92;y2=49;w=93;h=91;c=0.6559139490127563|><|mask;x=0;y=0;c=0.6559139490127563;data=50,93,~!!!@M#5tUh…|>` (payload truncated here; 50×93 raster, 974/4650 px), `"road"` returned one 39×19 mask, and `"building"` returned empty (`''`). Confidence `c` appears on both box and mask tokens.
