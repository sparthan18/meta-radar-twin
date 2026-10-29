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
uv run python scripts/decisions.py --model 2024-09-01  # + Muse Spark decision per bridge (one cutoff)
uv run python scripts/decisions.py --model all         # + model decisions at every cutoff in budget
uv run python scripts/audit.py 2024-09-01       # Muse Spark audit agent: memo + hazard layer
```

`scripts/decisions.py` reads `out/dresden_state.pkl` and writes `out/decisions_<cutoff>.csv` per cutoff (plus `out/escalation_counts.csv` with `all`). With `--model`, every analysed bridge also gets a Muse Spark decision (SPEC §5.0: three single-letter questions, five votes each, vote shares as probabilities); the rubric table is reused unchanged and the side-by-side result goes to `out/model_decisions_<cutoff>.csv`. With `--model all`, the script first measures one cutoff (2024-09-01) and projects the cost at $1.25/$4.25 per million input/output tokens: all 33 cutoffs if the projection is within $5, else only the 21 cutoffs 2023-01-01 to 2024-09-01, else it stops. It then writes `out/model_agreement.csv` (per-cutoff model-vs-rubric risk agreement) and `out/model_disagreements.csv`. Model responses are cached under `out/cache/` keyed by request hash plus sample index, so re-runs reproduce the same votes at zero cost. Not-monitored bridges keep their deterministic row. `scripts/audit.py` needs `MODEL_API_KEY` in `.env` (model from `RADARTWIN_LLM`, default `muse-spark-1.3`) and writes `out/memo_<cutoff>.md`, `out/audit_<cutoff>_tools.json` and `out/hazards_<cutoff>.geojson`. `uv run python scripts/check_memo.py <cutoff>` verifies every number in a memo traces back to the logged tool results.

## Decisions

Risk decisions come from the Muse Spark model (`radartwin/decide/model.py`, SPEC §5.0) with probabilities, checked against the deterministic rubric (`radartwin/decide/rubric.py`, SPEC §4) at every cutoff. The model sees the pre-computed per-asset features (SPEC §3.6) and the deterministic flags — motion, acceleration, differential movement, own-history outlier, quality/coverage, escalation, persistence — and answers three single-letter multiple-choice questions (pattern, risk, inspection) five times each; per-field vote shares are the probabilities. The rubric's verdict and the owner condition are never in the model input. The rubric stays as the independent check: flags feed the escalation rule (outlier + differential), persistence is leak-free (`months_since_esc` keeps an asset elevated for 3 months after an escalation, `escalations_12m` is evidence only), and the risk ladder is high (escalating now) / elevated / watch / none, capped at watch for thinly measured or radar-blind assets. The owner-register condition stays an external overlay (`owner_condition_alert = high and condition == "poor"`, with `condition_source`); headline numbers use the model and ladder only. Named bridges radar cannot see are carried as not monitored (`pattern = "not_monitored"`, `risk_level = "unknown"`, `radar_coverage = "none"`, with the reason) in decisions, the hazard layer and the memo. The audit memo's Action and Watch lists follow the model decision, with a Model and rubric section listing disagreements with the model's probability; owner inputs stay in the Owner condition section only.

Status: model decisions exist for all 33 cutoffs (2022-01-01 to 2024-09-01); the 2024-03-01 to 2024-08-01 gap was filled in phase 4b. The memos on disk follow the model decision with a Model and rubric section. Clean-versus-leaked result for the four alert rows (Carolabrücke): 2022-08-01, 2023-10-01 and 2024-09-01 were high at p_high 1.0 before (leaked input) and are high at p_high 1.0 after (clean whitelisted input); 2024-08-01 had no votes before (cutoff never run) and is high at p_high 1.0 clean. The leak made no difference to the verdict at these rows: 5-0 high both ways.

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
| `model_decisions_<cutoff>.csv` | Rubric table plus Muse Spark decision per bridge (all 33 cutoffs) |
| `model_agreement.csv` | Per-cutoff model-vs-rubric risk agreement (cutoff, n_bridges, agree_risk, n_model_high, n_rubric_high, carola_model_risk, carola_p_high) |
| `model_disagreements.csv` | Bridges where model and rubric risk differ (cutoff, asset, rubric_risk, model_risk, p_risk) |
| `cache/*.json` | Cached model responses keyed by request hash + sample index (re-runs cost nothing) |
| `memo_<cutoff>.md` | Muse Spark engineering memo for a cutoff |
| `audit_<cutoff>_tools.json` | Logged tool calls/results behind a memo |
| `hazards_<cutoff>.geojson` | Bridge polygons with features, flags and decision as properties |

Validation: the pipeline reproduces an independent implementation of SPEC.md to < 0.05 mm/yr (max |score difference| over every bridge and cutoff versus `reference/dresden_scores.csv`).

## Web map (`web/`)

Phases 5a to 5d. Export once, then serve the static page locally:

```sh
.venv/bin/python scripts/export_web.py      # out/ -> web/data/ (no API calls)
.venv/bin/python scripts/check_web_data.py  # validate web/data against SPEC 8
cd web && python -m http.server 8137        # then open http://localhost:8137/
```

Use an unused port (8765 was taken on this machine). `export_web.py` reads `out/` only and writes `web/data/bridges.geojson` (simplified footprints), `spans.json` (per-span vertical-change series), `decisions.json` (model + rubric side by side for all 33 cutoffs), `scatterers.geojson` (3,694 points, position and track only), `scatterer_velocity.json` (each point's leak-free velocity at all 33 cutoffs, from `scripts/point_velocity.py` via `out/scatterer_velocity.csv`), `s1_amplitude.png` + `.json` (the radar chip and its corners), `sam.geojson` (SAM polygons with IoU; `bright_fraction` is null because the radar chip lives under `data/`, which the exporter must not read) and `memos/<cutoff>.md` (verbatim copies of any audit memos in `out/`, listed in `decisions.json` as `memo_cutoffs`; none until the audit is rerun on the leak-free data). Total 1.77 MB (limit 3 MB).

The page (`web/index.html`, MapLibre GL 4.7.1 from unpkg, no build step) shows bridges coloured by the model risk at the selected month via feature-state, a month slider with one step per cutoff, an event badge on the Sep-2024 step ("Carolabrücke collapsed 10 days after this cutoff"), a legend, a ranking list sorted by model risk, then rank (rank, name, score, model risk pill, inspect flag) and a detail panel (scatterers, tracks, rank, score, wmax, wspread, z, velocity, escalation history, flag chips, model vote shares out of 5 beside the rubric verdict, and a per-span SVG chart showing only months up to the selected cutoff with the collapse marker only on the event month). Span dots use a blue-white-red scale over ±4 mm/yr and open a popup with that span's value at the selected month. Below zoom 15 each bridge also gets a risk-coloured marker, drawn above the span dots. Three layers are off by default: Scatterers (3,694 points coloured by their own cutoff velocity at the selected month, from `scatterer_velocity.json`; never a whole-period value), SAM (SAM 3.1 outlines near Carolabrücke with score and IoU) and Radar (the Sentinel-1 amplitude chip rendered by `scripts/render_s1_chip.py`). Augustusbrücke is grey with a dashed outline and "not monitored by radar" plus its reason; its length (≈ 354 m) is the long side of the minimum rotated rectangle. Owner condition appears only in its own labelled block. A Memo button opens the audit memo for the selected month, rendered by the dependency-free `web/memo.js` (tested with `node tests/test_memo_render.js`), or says there is none. The page works at phone width (map on top, panel below) and by keyboard alone: a skip link, focusable ranking rows, `aria-pressed` toggles, a slider that announces the month, and risk pills at 4.5:1 contrast or better. No external calls other than the MapLibre script/CSS and the Esri basemap tiles (World Imagery and Canvas World Dark Gray).

## SAM 3.1 notes

Phase 2 segments the Sentinel-2 `visual` chip (`data/carola/s2_visual.tif`, 93×91 px at 10 m) with SAM 3.1 via `POST /v1/responses` (model `sam-3.1`, `metadata={"include_confidence":"true"}`). Run:

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

## Muse Spark notes

Phase 4 probed Chat Completions on `muse-spark-1.3` (6 calls, trivial one-letter question) before writing `radartwin/decide/model.py`. Findings, with response fragments:

- `logprobs`/`top_logprobs` are rejected. Request `{model, messages, temperature: 0, max_tokens: 5, logprobs: true, top_logprobs: 5}` → 400. Fragment: `{"error":{"code":null,"message":"`logprobs` is not supported with reasoning.","param":"logprobs","type":"invalid_request_error"}}`.
- `n > 1` is rejected. Request `{temperature: 1, max_tokens: 5, n: 3}` → 400. Fragment: `{"error":{"code":null,"message":"`n` must be 1, got 3","param":"n","type":"invalid_request_error"}}`. Vote sampling must be sequential `n: 1` calls.
- `temperature` is accepted: 0 and 1 both succeed. That it is honoured (not just accepted) shows in production: the five temp-1 votes per asset split (e.g. 0.6/0.8 shares on 2024-09-01), not 5-0 throughout.
- `reasoning_effort` exists and accepts `"low"` and `"minimal"`, but `"minimal"` still reasons: the trivial question used 109 reasoning tokens of 119 completion tokens (`completion_tokens_details: {reasoning_tokens: 109}`). The real three-question prompt averages ~360 completion tokens per call. `"none"` is handled inconsistently: some processes get a 400, others get an accepted call that reasons anyway (~370 completion tokens, same as `"minimal"`).
- `max_tokens` smaller than the reasoning demand ends the turn with `finish_reason: "length"` and `content: null` — nothing to parse. Seen at `max_tokens: 5` (3 reasoning tokens) and 50 (48 reasoning tokens).

Probability method is therefore **votes**: one request carries the three single-letter questions (pattern, risk, inspection), answered as three letters; it is sampled 5 times at temperature 1 with `n: 1`, and the per-field vote shares are the probabilities (majority wins, ties go to the first-appearing option). `reasoning_effort: "minimal"` is hardcoded throughout: it is the lowest setting the API reliably offers, and the effort is a constant because a lazily resolved value made cache keys unstable across processes (fresh processes hashed `"none"` while entries were stored under `"minimal"`). Responses are cached under `out/cache/` keyed by a hash of the request plus the sample index, so re-runs reproduce the same votes at zero cost. One joint questionnaire per sample instead of three separate calls keeps the per-cutoff cost near $0.23.

Cost and budget (measured, not estimated): the Sep-2024 pilot measured $0.226 per cutoff, projecting $4.75 for the 21 cutoffs — within the $5 rule. But the `all` run selected 33 cutoffs anyway: its freshness probe evidently ran before the effort fallback resolved, counted 19 fresh assets while the bulk hit cache after resolving, and projected about $0.02 per cutoff (its stdout was lost on termination, but the 2022 output files prove the 33-branch was taken). It was stopped after 27 cutoffs; with a later 95-call verification accident (audit path hashing without the asset name, since fixed) the recorded total is $6.31 in cache usage, about $6.50 including unfiled empty/cut-off responses — over the $6 phase budget. The 2022 cutoffs (~$2.70) were the waste: out of scope for the intended 21-cutoff run. The remaining 2024-03-01 to 2024-08-01 cutoffs and the memo re-runs were skipped rather than deepen the overrun. The projection is now sample-based (fresh cost per sample times samples per cutoff), honest for fully fresh, partially cached, and straggler-only runs alike.

Input provenance note: the first runs built the model input with a blacklist, so decisions-table rows carried non-spec fields into the prompt (duplicated flags, `reason`, `source`, and `owner_condition_alert`). The builder now whitelists exactly the 19 SPEC feature keys plus the nested flags (`tests/test_decide_model.py` pins this). Already-drawn votes were migrated onto the fixed cache keys by key match; each migrated text provably belongs to its slot (same prompt version, same asset and cutoff, same sample index). The extra context was redundant or constant for all rows except the four with `owner_condition_alert=true` (Carolabrücke at 2022-08-01, 2023-10-01, 2024-08-01, 2024-09-01), where it encoded the rubric verdict. In phase 4b those leaked votes were deleted (15 cached responses; 2024-08-01 had none) and redrawn with the whitelisted input at $0.044 for the 15 fresh samples: all four rows are high at p_high 1.0 clean, matching the leaked verdict, and the leak warnings are gone. Phase 4b also ran the 6 gap cutoffs ($1.296) and re-ran both memos ($0.295); phase spend $1.63 of the $2.50 cap, measured from token usage. Phase 4c tested whether bridge names and cutoff dates sway the model: `build_model_input` gained an anonymised mode ("bridge 01"–"bridge 19" by OSM asset-id order, no cutoff date) with distinct cache keys, and all 19 bridges were re-run anonymised at 2023-10-01, 2024-08-01 and 2024-09-01 (`out/name_sensitivity.csv`). Anonymisation flipped 3 of 57 risk levels, all between none/watch/elevated with p_high 0.0 both ways, against a 0-of-19 noise baseline from a second named draw at 2024-09-01; Carolabrücke stayed high at p_high 1.0 named and anonymised in all three months, and no bridge gained or lost high. Phase spend $0.87 of the $1.20 cap (projected $1.17 from fresh samples), measured from token usage.
