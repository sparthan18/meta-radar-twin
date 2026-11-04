# RadarTwin

RadarTwin turns Europe's free Sentinel-1 ground-motion feed (EGMS) into a ranked inspection list for every bridge in a city, with typed risk decisions and stated probabilities. It binds radar scatterers to bridge footprints, splits each deck into spans along its axis, deseasons every series, combines ascending and descending passes into vertical motion per span, and scores each bridge on reliability-weighted differential motion in a leak-free rolling retrospective — against its own history and against every other bridge in the city. Validated on Dresden (20 bridges in the data, 19 monitored, EGMS 2020–2024), it would have flagged the Carola Bridge twice before its September 2024 collapse. It ranks assets for inspection; it does not predict failure or its timing.

## Quick start

Three honest paths from a cold clone (`data/` and `out/` are gitignored and absent until you run the pipeline).

(a) Tests and the web story run from the clone with no data and no keys:

```sh
node tests/test_annotate.js
node tests/test_basemap.js
node tests/test_deck3d.js
node tests/test_explainer.js
node tests/test_fui.js
node tests/test_memo_render.js
node tests/test_story.js
uv sync
.venv/bin/python tests/test_decide_model.py
.venv/bin/python tests/test_leakfree.py
cd web && python3 -m http.server 8137   # then open http://localhost:8137/
```

The seven `node tests/test_*.js` checks need only Node. The two Python test scripts need `uv sync` first but no data and no keys. The web story plays from the shipped `web/data/` (see (c)) over any static server; use an unused port (8765 was taken on this machine).

(b) The pipeline needs the EGMS Level 2a clips for the Dresden tile and the Meta Model API key. Fetch the clips from the EGMS download service; the tile ids are in `scripts/` (`scripts/rank_city.py` expects `clip_asc_044.csv`, `clip_asc_146.csv`, `clip_desc_095.csv`). Place them as `data/<site>/clip_*.csv` (for Dresden: `data/carola/clip_*.csv`). Each clip is an EGMS CSV: one row per scatterer with `pid, latitude, longitude, los_east, los_north, los_up` and the other SPEC §2.1 columns, plus one `YYYYMMDD` epoch column per pass holding LOS displacement in mm relative to the first epoch. Then, in order:

```sh
uv sync
# .env with MODEL_API_KEY=<meta-model-api-key>
uv run python scripts/rank_city.py carola
uv run python scripts/decisions.py all
uv run python scripts/decisions.py --model all
uv run python scripts/audit.py 2024-09-01
uv run python scripts/check_memo.py 2024-09-01
.venv/bin/python scripts/point_velocity.py
.venv/bin/python scripts/render_s1_chip.py
.venv/bin/python scripts/render_s2_chip.py
uv run python scripts/sam_vs_osm.py
.venv/bin/python scripts/export_web.py
.venv/bin/python scripts/check_web_data.py
```

`scripts/check_web_data.py` needs `out/` and therefore runs only after a pipeline run.

(c) The shipped `web/data/` is the pipeline's output as of the last run and is what the story plays. It is committed so the page works from the clone; re-running the pipeline and `export_web.py` refreshes it.

## Setup

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
```

Create a `.env` file with the API key:

```
MODEL_API_KEY=<meta-model-api-key>
```

`data/<site>/` holds the EGMS clips and cached Overpass JSON (gitignored, absent on a clone; see Quick start (b)). No network is needed for a city run when the cache is present.

## Run

```sh
uv run python scripts/rank_city.py carola
```

This loads the clipped EGMS CSVs, binds scatterers to OSM bridge footprints, runs the rolling retrospective at monthly cutoffs (2022-01-01 to the event month), and writes scores, the ranking figure and reusable state.

```sh
uv run python scripts/decisions.py all          # features + flags + rubric decision at every cutoff
uv run python scripts/decisions.py 2024-09-01   # ... or a single cutoff
uv run python scripts/decisions.py --model 2024-09-01  # + Muse Spark decision per bridge (one cutoff)
uv run python scripts/decisions.py --model all         # + model decisions at every cutoff in budget
uv run python scripts/audit.py 2024-09-01       # Muse Spark audit agent: memo + hazard layer
```

`scripts/decisions.py` reads `out/dresden_state.pkl` and writes `out/decisions_<cutoff>.csv` per cutoff (plus `out/escalation_counts.csv` with `all`). With `--model`, every analysed bridge also gets a Muse Spark decision (SPEC §5.0: three single-letter questions, five votes each, vote shares as probabilities); the rubric table is reused unchanged and the side-by-side result goes to `out/model_decisions_<cutoff>.csv`. With `--model all`, the script first measures one cutoff (2024-09-01) and projects the cost at $1.25/$4.25 per million input/output tokens: all 33 cutoffs if the projection is within budget, else only the 21 cutoffs 2023-01-01 to 2024-09-01, else it stops. It then writes `out/model_agreement.csv` (per-cutoff model-vs-rubric risk agreement) and `out/model_disagreements.csv`. Model responses are cached under `out/cache/` keyed by request hash plus sample index, so re-runs reproduce the same votes at zero cost. Not-monitored bridges keep their deterministic row. `scripts/audit.py` needs `MODEL_API_KEY` in `.env` (model from `RADARTWIN_LLM`, default `muse-spark-1.3`) and writes `out/memo_<cutoff>.md`, `out/audit_<cutoff>_tools.json` and `out/hazards_<cutoff>.geojson`. `uv run python scripts/check_memo.py <cutoff>` verifies every number in a memo traces back to the logged tool results.

## Decisions

Risk decisions come from the Muse Spark model (`radartwin/decide/model.py`, SPEC §5.0) with probabilities, checked against the deterministic rubric (`radartwin/decide/rubric.py`, SPEC §4) at every cutoff. The model sees the pre-computed per-asset features (SPEC §3.6) and the deterministic flags — motion, acceleration, differential movement, own-history outlier, quality/coverage, escalation, persistence — and answers three single-letter multiple-choice questions (pattern, risk, inspection) five times each; per-field vote shares are the probabilities. The rubric's verdict and the owner condition are never in the model input. The rubric stays as the independent check: flags feed the escalation rule (outlier + differential), persistence is leak-free (`months_since_esc` keeps an asset elevated for 3 months after an escalation, `escalations_12m` is evidence only), and the risk ladder is high (escalating now) / elevated / watch / none, capped at watch for thinly measured or radar-blind assets. The owner-register condition stays an external overlay (`owner_condition_alert = high and condition == "poor"`, with `condition_source`); headline numbers use the model and ladder only. Named bridges radar cannot see are carried as not monitored (`pattern = "not_monitored"`, `risk_level = "unknown"`, `radar_coverage = "none"`, with the reason) in decisions, the hazard layer and the memo. The audit memo's Action and Watch lists follow the model decision, with a Model and rubric section listing disagreements with the model's probability; owner inputs stay in the Owner condition section only.

Status: model decisions exist for all 33 cutoffs (2022-01-01 to 2024-09-01). See `docs/history.md` for the phase-by-phase decisions history.

## Outputs (`out/`)

| File | Contents |
|---|---|
| `dresden_scores.csv` | Anomaly score per bridge per cutoff (rows = cutoffs, columns = bridges) |
| `dresden_z_scores.csv` | Score deviation from each bridge's own history (z) |
| `dresden_wmax.csv` | Max reliability-weighted span velocity change (wmax) |
| `dresden_wspread.csv` | Span-to-span spread (wspread); score = wmax + wspread |
| `dresden_bridges.csv` | Analysed bridges (19 of 20): asset_id, name, length, scatterer count, track count |
| `dresden_ranking.png` | Horizontal bar ranking at the final cutoff (Carolabrücke highlighted) |
| `dresden_state.pkl` | Pickled state (rolls, scores, points, bridges, cutoffs, span meta) for downstream scripts |
| `sam_smoke.png` | S2 chip with text-prompt SAM masks (none found at 10 m) |
| `sam_vs_osm.png` | OSM outlines vs SAM box-prompt masks side by side |
| `sam_polygons.geojson` | SAM box-prompt polygons (bridge, score) for reuse without new API calls |
| `decisions_<cutoff>.csv` | Per-bridge features, flags and rubric decision at a cutoff |
| `escalation_counts.csv` | Per-cutoff counts (n_bridges, n_not_monitored, n_high, n_elevated, n_watch, carola_risk, carola_escalations_12m, owner_condition_alerts) |
| `model_decisions_<cutoff>.csv` | Rubric table plus Muse Spark decision per bridge (all 33 cutoffs) |
| `model_agreement.csv` | Per-cutoff model-vs-rubric risk agreement (cutoff, n_bridges, agree_risk, n_model_high, n_rubric_high, carola_model_risk, carola_p_high) |
| `model_disagreements.csv` | Bridges where model and rubric risk differ (cutoff, asset, rubric_risk, model_risk, p_risk) |
| `cache/*.json` | Cached model responses keyed by request hash + sample index (re-runs cost nothing) |
| `memo_<cutoff>.md` | Muse Spark engineering memo for a cutoff |
| `audit_<cutoff>_tools.json` | Logged tool calls/results behind a memo |
| `hazards_<cutoff>.geojson` | Bridge polygons with features, flags and decision as properties |

`reference/jev_decisions_*.csv` are an earlier engine's results kept for comparison.

Validation: the pipeline reproduces an independent implementation of SPEC.md to < 0.05 mm/yr (max |score difference| over every bridge and cutoff versus `reference/dresden_scores.csv`).

## Web map (`web/`)

Since phase 9d the page opens in Explore and the Mode group offers only Story II; this first story is still in the code and plays at `/?story=1`. **Explore mode** is the dashboard, opening with satellite imagery on (the Dark option switches to the vector basemap). The first story is a nine-scene piece that plays on the page itself (camera, captions, a headline card per month, the ending), directed by `web/story.js` on a GSAP timeline, scrubbable by chapter, keyboard-operable (Space, arrows, Home/End, Escape) and captioned by default. Every scene reads only its bound month; the scene specification is `docs/story-spec.md`. The story has no placeholders: the satellite explainer (`web/explainer.js`), the report scene (the real memo typed in from its rendered form, the SAM outline drawn on the Sentinel-2 chip rendered by `scripts/render_s2_chip.py`), the proof scene from `proof.json` (written by `scripts/check_truncation.py --json`: every per-cutoff quantity identical with the future deleted, and the months where model and checklist pick the same high bridges), the Europe outro, and the bridge deck in 3D (`web/deck3d.js`, a MapLibre custom layer rendered with three.js 0.160.0: one box per span raised or lowered by the month's movement, pillars, span colours, a red glow while the bridge is high) for scenes 5–6 and for the selected bridge in Explore at zoom 14 and above, plus the close-up HUD: two thin rings and a four-line data block (name, month, rank and z, worry word) from the bound month only. The SVG side view remains the phone and fallback view.

Export once, then serve the static page locally:

```sh
.venv/bin/python scripts/export_web.py      # out/ -> web/data/ (no API calls)
.venv/bin/python scripts/check_web_data.py  # validate web/data against SPEC 8 (needs out/)
cd web && python -m http.server 8137        # then open http://localhost:8137/
```

`export_web.py` reads `out/` only and writes `web/data/bridges.geojson` (simplified footprints for all 20 bridges, 19 monitored), `spans.json` (per-span vertical-change series), `decisions.json` (model + rubric side by side for all 33 cutoffs), `scatterers.geojson` (3,694 points, position and track only), `scatterer_velocity.json` (each point's leak-free velocity at all 33 cutoffs, from `scripts/point_velocity.py` via `out/scatterer_velocity.csv`), `s1_amplitude.png` + `.json` (the radar chip and its corners), `sam.geojson` (SAM polygons with IoU; `bright_fraction` is null because the radar chip lives under `data/`, which the exporter must not read) and `memos/<cutoff>.md` (verbatim copies of any audit memos in `out/`, listed in `decisions.json` as `memo_cutoffs`; Oct 2023 and Sep 2024 today). Total 1.77 MB (limit 3 MB).

The page (`web/index.html`, MapLibre GL 4.7.1 from unpkg, no build step) shows the 20 bridges (19 monitored) coloured by the model risk at the selected month via feature-state, a month slider with one step per cutoff, an event badge on the Sep-2024 step ("Carolabrücke collapsed 10 days after this cutoff"), a legend, a ranking list sorted by model risk, then rank (rank, name, score, model risk pill, inspect flag) and a detail panel (scatterers, tracks, rank, score, wmax, wspread, z, velocity, escalation history, flag chips, model vote shares out of 5 beside the rubric verdict, and a per-span SVG chart showing only months up to the selected cutoff with the collapse marker only on the event month). The page opens with the Satellite imagery basemap on (Esri World Imagery, optical); the Dark option switches to the OpenFreeMap vector basemap. Span dots use a blue-white-red scale over ±4 mm/yr and open a popup with that span's value at the selected month. Below zoom 15 each bridge also gets a risk-coloured marker, drawn above the span dots. Three layers are off by default: Scatterers (3,694 points coloured by their own cutoff velocity at the selected month, from `scatterer_velocity.json`; never a whole-period value), SAM (SAM 3.1 outlines near Carolabrücke with score and IoU) and Radar (the Sentinel-1 amplitude chip rendered by `scripts/render_s1_chip.py`). Augustusbrücke is grey with a dashed outline and "not monitored by radar" plus its reason; its length (≈ 354 m) is the long side of the minimum rotated rectangle. Owner condition appears only in its own labelled block. A Memo button opens the audit memo for the selected month, rendered by the dependency-free `web/memo.js` (tested with `node tests/test_memo_render.js`), or says there is none. A Play button replays the 33 months at 0.7 s per step (pressed at the last month, it starts again from January 2022), with eased recolouring, rows that slide to their new rank and a one-line ticker of the high bridges; when playback reaches Sep 2024 it stops, flies to Carolabrücke and switches the Radar and SAM layers on (nothing beyond that cutoff is shown; only the camera and layers change). The history strip sits on the map at bottom-left and can be hidden with the History button. All motion is off under `prefers-reduced-motion`. The page works at phone width (map on top, panel below) and by keyboard alone: a skip link, focusable ranking rows, `aria-pressed` toggles, a slider that announces the month, and risk pills at 4.5:1 contrast or better. External calls: the page loads Google Fonts, GSAP and three.js from cdnjs, MapLibre from unpkg, vector tiles and a style from tiles.openfreemap.org, and Esri imagery, which is on by default.

## How it was built

Every phase was built by Muse Code from the prompt files in `muse/prompts/`, in order — except Story II, see below — with the design contract in `docs/design-spec.md` and the story contract in `docs/story-spec.md`. `tests/frames.md` is the frame-by-frame review checklist the owner used. See `docs/history.md` for the phase-by-phase build history.

### Story II

Open it with `cd web && python3 -m http.server 8137`, then visit `/story2/`. Story II is a second, separate cinematic story beside the first one: nine chapters that open on the globe and crane down to the Carolabrücke with the collapse played on the structure, then how radar sees, twenty bridges, three years of monthly cutoffs, the close-up, the report, the proof, Europe, and the ending. Story II was designed and built during the Hackathon in a separate working folder and is not a Muse Code build; Muse Code ported it into this repository in phase 9b.

## Data and attribution

- EGMS (European Ground Motion Service, Copernicus) for the InSAR data.
- OpenStreetMap contributors via OpenFreeMap (ODbL) for the basemap.
- Esri for the optional imagery.
- Sentinel-2 (Copernicus) for the evidence chip.
- The photograph in chapter 1 of Story II (`web/story2/img/carola-20240911.jpg`) is from Wikimedia Commons, by Scalaran, released CC0, taken 11 September 2024.
- The globe's land and borders in Story II are Natural Earth via world-atlas.
- The Elbe centreline in Story II is OpenStreetMap data via OpenFreeMap (ODbL).

License: MIT, see LICENSE.
