# Gotchas and insights

Things that cost time on this project, why they happened, and what fixed them. Add to it whenever something surprises you. The short checklist version lives in SPEC.md section 11.

Each entry: **what you see**, **why**, **fix or workaround**.

## Radar and remote sensing

### A real bridge can look like "not a bridge" to radar
- **What you see:** the backscatter guardrail (bright fraction above −8 dB) scores Augustusbrücke at 0.07 and 0.06, against 0.64 for Carolabrücke. A fixed threshold would reject it as a segmentation error.
- **Why:** radar brightness depends on material, shape and orientation to the satellite. Sandstone arches seen side-on return little energy. The EGMS point count agrees: 4 scatterers per hectare on Augustus against 54 on Carola and 124 across the whole image. The segmentation was correct; radar just sees little of that structure.
- **Fix:** split the guardrail into two questions (SPEC section 7).
  - "Is the polygon the right object?" is answered by agreement between SAM and OpenStreetMap (IoU), or SAM's confidence when there is no OSM outline.
  - "Can radar monitor it?" is answered by scatterer density relative to the city's bridges, plus bright fraction where a radar chip exists.
  - Low coverage is reported, caps risk at "watch", and is never excluded.
- **Insight:** any brightness test, absolute or relative to the surroundings, measures radar visibility, not bridge-ness. Comparing against nearby water also fails wherever there is no water (overpasses, rail bridges, one-sided dams). "Radar can't watch this structure well, inspect it another way" is a useful finding in its own right.

### EGMS data is about a year old
- **What you see:** the 2020–2024 release was published in Aug–Sep 2025.
- **Why:** EGMS is a processed, validated product released yearly.
- **Fix:** state the latency in every memo. The method is the point. Live monitoring would run the same pipeline on fresh Sentinel-1 interferometry.

## Analytics

### Two correct implementations disagreed by up to 1 mm/yr
- **What you see:** a fresh build missed the reference numbers.
- **Why:** the reference came from a prototype with two hidden artefacts. Its one-year window ended at the union of all tracks' dates instead of each track's own last epoch. Its span-merge ties were broken by insertion order instead of the lower id.
- **Fix:** each track uses only its own epochs, and ties go to the lower span id. Both rules are now pinned in SPEC 3.5, and the reference was regenerated.
- **Insight:** when a rebuild disagrees with a reference, check the reference before changing correct code. Stale targets pushed the build agent to "fix" correct code and to restore old reference files.

### Leakage in the retrospective
- Never include epochs on or after the event date in any retrospective statistic.
- Refit the seasonal model inside every rolling cutoff. One fit on all the data leaks the future.
- Tiny spans with 1–2 scatterers dominate an unweighted max. Shrink by effective sample size and merge spans with fewer than 3 points.

### Bridges with too few radar points vanish silently
- **What you see:** Augustusbrücke is missing from the 19 analysed bridges, so the low-coverage rule never fires on anything.
- **Why:** the city ranking keeps only bridges with enough scatterers and tracks. Everything below the minimum is dropped before any later step sees it.
- **Fix (planned):** carry dropped bridges through as "not monitored: too few radar points" in the decisions, memo and hazard layer. A bridge radar cannot see is a finding, not a gap to hide.

### A rule that only one asset can trigger looks like hindsight
- **What you see:** "immediate" = escalate and condition "poor", but only Carolabrücke has a condition grade in the site config. No other bridge can ever reach "immediate".
- **Why:** the condition register was filled in for the event bridge only.
- **Fix:** either give every bridge a condition grade from a public source, or lead with "high" (escalate), which every bridge can reach, and treat condition as a clearly labelled external input. A sceptical judge will check this first.

### Monthly decisions flicker, and the first persistence fix flooded the list
- **What you see:** Carolabrücke escalates in Aug 2022, Oct 2023, Aug 2024 and Sep 2024, but drops back to "none" in the months between.
- **Why:** each cutoff is judged independently, and z-scores near the threshold cross it back and forth.
- **First fix, which failed:** "high if escalated at least twice in 12 months". Bridges with a long episode stayed high for a year after going quiet. 5–8 of 19 bridges were high in most months. Pieschener Mole escalated six months running in 2024 and was still "high" in Sep 2024 with z = −1.7.
- **Fix:** "high" only when escalating now. "Elevated" for 3 months after an escalation. The 12-month count is reported as evidence, not used to raise the level. Result: 1–4 high bridges a month, median 1, and Carola is the only high bridge in Aug and Sep 2024.
- **Insight:** simulate a rule against every month of real data before adopting it. A rule that sounds sensible can turn the alert list into noise.

### A precomputed velocity is a whole-period number
- **What you see:** `long_term_velocity_mm_yr` is identical at every cutoff (Carolabrücke −0.22 mm/yr from Jan 2022 to Sep 2024).
- **Why:** it is the mean of EGMS `mean_velocity`, which EGMS fits over the whole release period. At an early cutoff that number already contains later months.
- **Fix:** compute any velocity used for a cutoff from the displacement series up to that cutoff, or leave it out. Check every input for "does this value change with the cutoff?" Today no bridge passes the 1.5 mm/yr `moving` threshold, so no decision changes, but the value still reaches the model input.
- **Same trap, bigger effect:** EGMS `temporal_coherence` is also whole-period, and it set the span weights behind every score. Recomputing it per cutoff changed 45 of 627 bridge-months of rubric risk. Test it with truncation: delete every epoch on or after the cutoff and require identical outputs (`scripts/check_truncation.py`).

### Retrospective tools must not return the future
- **What you see:** the audit tool that returns a bridge's span history returned every month to Sep 2024, even for the Oct 2023 memo.
- **Why:** the tool read the full rolling table instead of the rows up to its run's cutoff.
- **Fix:** every tool filters to dates at or before the run's cutoff. After each retrospective run, check the latest date in its tool log.

## SAM 3.1 on the Meta Model API

### Mask payloads are not standard base85
- **What you see:** `base64.b85decode` gives the wrong byte count. Hours of guessing codecs (deflate, run-length, Golomb, XOR) found nothing.
- **Fix:** use Meta's official parser, `meta-sam-parser` on PyPI, imported as `meta_sam_parser`.
  - `image_segmentation_format().create_parser()` parses records.
  - `decode_mask_to_raster` decodes masks.
  - `build_object_prompt` builds box prompts.
  - The docs are at dev.meta.ai/docs/sam/client-libraries.
- **Insight:** look for an official SDK before reverse-engineering a wire format. Meta's SAM licence also forbids reverse engineering the SAM materials.

### Mask rasters are box-local
- **What you see:** stretching the mask to the full image smears it everywhere, and IoU is about 0.
- **Why:** a `data=H,W,...` raster covers only its record's box. For example, a 17×35 px box carries a 35×17 raster.
- **Fix:** resize the raster to the box size and paste it at the box offset, then vectorise with the chip transform.

### Text prompts don't find bridges at 10 m
- **What you see:** "bridge", "river bridge" and "road bridge" return empty output on the Sentinel-2 chip. Upsampling the chip 4x doesn't help. Large concepts such as "water" and "road" do return masks.
- **Fix:** use OSM footprint bounding boxes as box prompts. Many boxes go in one request: one `<0f>` header with comma-separated ids. Result: IoU 0.54 for Augustus and 0.33 for Carola.
- **Insight:** an empty response means "concept absent", not an error.

## Muse Spark audit agent

### Reasoning tokens eat the output budget
- **What you see:** the memo turn ends mid-sentence. On single-letter decision calls the symptom is sharper: `finish_reason: "length"` with `content: null` — nothing to parse.
- **Why:** reasoning tokens count against `max_tokens`.
- **Fix:** set `max_tokens` generously (32000 worked for memos, 1000 for three-letter answers) and check the finish reason.

### Muse Spark rejects logprobs and n > 1
- **What you see:** `logprobs: true` returns 400 `` `logprobs` is not supported with reasoning. ``, and `n: 3` returns 400 `` `n` must be 1, got 3 ``.
- **Why:** this model always reasons, and the API only serves one completion per request.
- **Fix:** probabilities come from votes: sample the same question five times at temperature 1 with `n: 1` and use vote shares. Budget five sequential calls per question, not one call with five completions.

### reasoning_effort minimal still reasons
- **What you see:** `reasoning_effort: "minimal"` on a trivial one-letter question still spends 109 reasoning tokens of 119 completion tokens; the real decision prompt averages ~360.
- **Why:** "minimal" lowers the effort, it does not switch reasoning off. `"none"` is handled inconsistently: some processes get a 400, others get an accepted call that reasons anyway.
- **Fix:** hardcode `"minimal"` (the lowest reliably offered setting), keep prompts short since output tokens dominate, and set `max_tokens` above the reasoning demand plus the answer. Reasoning is demand-driven, not budget-filling: a trivial question at `max_tokens: 500` used 109 tokens, not ~490 — so lowering `max_tokens` never saves money, it only cuts answers off.

### A lazily resolved cache key silently re-draws samples
- **What you see:** a fresh process makes 96 API calls for a cutoff that is fully cached, and a cost probe counts 19 fresh assets while the run itself hits cache.
- **Why:** the cache key hashed a runtime-resolved `reasoning_effort` (`"none"` until the first 400 fell back to `"minimal"`). Fresh processes hash `"none"`; stored entries sit under `"minimal"`. Every process re-resolves, so keys never match across processes.
- **Fix:** every element of a cache key must be a constant. Never hash a value that is resolved at runtime. Cost projections must be computed from fresh samples actually drawn, never from a pre-resolution freshness probe.

### A blacklist input builder leaks verdict fields and splits the cache
- **What you see:** the model input for decisions-table rows carries `owner_condition_alert`, `source`, `reason` and duplicated flags — fields that are neither SPEC features nor flags — while audit-path rows for the same asset hash differently, so the two callers never share cache entries.
- **Why:** the builder excluded two keys instead of including the spec'd ones. Any caller passing a richer row silently smuggles the extras into the prompt; `owner_condition_alert=true` encodes the rubric verdict for poor-condition bridges.
- **Fix:** whitelist exactly the SPEC feature keys plus the nested flags, and pin it with a test that enriched and pure rows for one asset build byte-identical inputs (`tests/test_decide_model.py`). Already-drawn votes were re-keyed by hash match; only the four alert rows needed a leak warning.

### Pandas dtype drift splits identical-looking cache keys
- **What you see:** two code paths build "equal" model inputs for one asset, yet hash to different cache keys — and the audit silently re-draws 95 cached samples ($0.22).
- **Why:** `1.0 == 1` in Python but they serialize differently. The decisions table upcasts `rank_in_city` to float (NaN for not-monitored rows); the feature table keeps it int. A dict-equality check on the inputs misses this completely. (A second instance of the same bug class: `set_index("asset")` drops the name column, so audit rows hashed without `asset` until it was restored.)
- **Fix:** canonicalize scalars at the input builder: integral floats become ints, numpy types become builtins. Pin it with a test that float-spelled and int-spelled rows build identical inputs.

### One-asset-per-call tools burn the call cap
- **What you see:** the agent spends 19 of its 25 calls on `get_decision`, one bridge at a time, and has to stop exactly at the cap.
- **Fix (planned):** add a batch tool that returns every bridge's decision in one call, so the budget goes to the bridges that matter.

### Traceable is not the same as readable
- **What you see:** every number in the memo traces back to a tool result (64 of 64), but the prose reads like a data dump ("needs inspection absent", "flag differential present").
- **Fix (planned):** keep the traceability check and give the agent an engineer-facing structure: verdict first, evidence second, caveats last.

### A loose traceability check passes almost anything
- **What you see:** the check reported every memo number as traced, but planted numbers like 42, 0.9 and 7 also passed.
- **Why:** it matched raw substrings, so "42" counted as found inside "0.42" or "1428".
- **Fix:** match whole number tokens, and accept a rounded value only within half a unit of its last decimal place. Test any checker with planted numbers before trusting its pass rate.

### The agent can borrow conclusions from external inputs
- **What you see:** the Sep 2024 memo says "inspect now and prioritise the tram section" for Carolabrücke. Section C, the tram section, is the part that later collapsed.
- **Why:** the only mention of the tram section in the tool results is the owner-condition source text, the pre-event renovation schedule. The agent turned that external input into an action, not the radar evidence.
- **Fix:** the verdict, actions and evidence cite radar results only, for example "focus on the end span moving up at 3.99 mm/yr against its neighbours". Owner inputs appear only in their own labelled section with the source quoted. The memo check flags any word found only in owner-supplied text that appears outside that section, and its self-test plants "prioritise the tram section" to prove it.
- **Insight:** a sceptical judge will read a correct-sounding reference to the part that later failed as hindsight, unless its source is obvious.

### A cost projection from cached results comes out near zero
- **What you see:** the pilot month measured about $0.23 and projected $7–8 for all 33 months, over the $5 limit. The full run then decided all 33 months fit the budget anyway and started at January 2022.
- **Why:** the full run re-estimated its cost from the pilot month, which was already cached, so it saw almost no fresh spend.
- **Fix:** project only from fresh, uncached calls, or carry the pilot's measured cost forward. Print the projection the run actually used before it spends anything. (This run was allowed to finish all 33 months, about $2–3 over the phase cap.)

### A famous name is a hindsight leak
- **What you see:** the model's input for each bridge includes its name and the cutoff date, for example "Carolabrücke" and "2024-08-01".
- **Why:** a model trained after September 2024 may know that Carolabrücke collapsed then. Seeing the name could push it towards "high" from memory rather than from the radar features.
- **Evidence so far:** over all 33 months, the model's "high" matches the escalate flag exactly, including months where Carolabrücke is quiet and rated "none" or "watch". So the name has not visibly driven the top level.
- **Evidence (phase 4c):** anonymised re-runs ("bridge 01"–"bridge 19" by OSM asset-id order, no cutoff date) at 2023-10-01, 2024-08-01 and 2024-09-01 flipped 3 of 57 risk levels — Budapester Straße elevated→watch (Aug 2024), Waldschlößchenbrücke none→watch (Aug 2024) and watch→elevated (Sep 2024) — all between low levels with p_high 0.0 both ways, against a 0-of-19 noise baseline from a second named draw at 2024-09-01. Carolabrücke stayed high at p_high 1.0 named and anonymised in all three months, and no bridge gained or lost "high".
- **Fix:** `build_model_input` has an anonymised mode (`anonymous=True`); named stays the default and hashes to different cache keys. The check lives in `out/name_sensitivity.csv`, drawn by `scripts/name_sensitivity.py`. A judge asking whether the model simply knows the answer gets this table.

## Working with Muse Code

### The sandbox can't reach package registries
- **What you see:** `pip install` times out inside a Muse run. The agent then tries npm, CDNs and foreign PyPI mirrors, which also time out.
- **Fix:** install dependencies outside Muse with `uv add <package>` in the repo. Then tell Muse the package is installed, that it must not install anything or contact registries, and to read the installed source rather than guess the API.

### Approvals can stall a run for hours
- **What you see:** the run sits idle while the auto-review judge escalates a network request to a human.
- **Fix:** anything watching a run should also watch for pending approvals, not just for the run's end. List the allowed network hosts in the phase prompt (api.meta.ai and dev.meta.ai), so out-of-scope requests stand out.

### Headless mode shows nothing until the end
- **Fix:** run the interactive TUI in a visible terminal, `muse --trust-workspace "<prompt>"`, so progress can be watched. Sessions are saved under `~/.local/share/muse/sessions/` and can be exported with `muse export --redacted`.

### An approval can be refused after you approve it
- **What you see:** you approve a shell command and it still fails with "unmanaged shell backgrounding is not allowed".
- **Why:** Muse's own sandbox policy runs after the human approval, and it rejects `&` background jobs on macOS.
- **Fix:** ask for foreground commands or Muse's managed shell sessions in the prompt, and expect a second approval prompt for the managed version. A watcher should count every request that has no decision, not only those the auto-review escalated.

### Give the agent a budget and an exit
- Every phase prompt caps paid API calls (SAM requests, Muse Spark spend) and says what to do on a 401: stop and report, never stub results.
- Every phase prompt says "do not create git commits", so commits stay a human decision.

### Muse cannot see the page, so leave visual checks to a person
- **What you see:** asked to measure the slider width, Muse tried a local server (the sandbox refused to bind a port) and twice ran headless Brave, which produced no output. Each attempt needed a manual approval and took minutes.
- **Fix:** have Muse prove layout by construction and list what needs a visual check; the reviewer clicks through the page in a real browser.
### Muse may reach for tools the prompt never mentioned
- **What you see:** mid-fix, Muse asks to run `jg` (the jevgrep code-search CLI installed on the machine). `jg` answers "how does this behave" questions by sending the question and repository excerpts to api.typesafe.ai. Muse's own reviewer flagged it: egress driven by a tool hint, not by the task.
- **Fix:** decline, and say "use grep and read the files". Put "no jg/jevgrep or any tool that sends code to an external service" in the standing rules; a plain grep was enough every time.


## Web map

### Thin bridges vanish at city zoom
- **What you see:** at zoom 12 the risk-coloured bridge polygons are a few pixels wide; only the span dots show, so the risk colour is effectively invisible.
- **Fix:** below about zoom 14, draw each bridge as a coloured marker or a thick line along its axis, and switch to the polygon when zoomed in.

### CARTO basemap tiles now need an API key
- **What you see:** the "Dark" basemap shows grey tiles stamped "API KEY REQUIRED, carto.com/basemaps/apikey". Every CARTO URL form returns the same 2.5 KB watermark tile, with or without a Referer.
- **Fix:** use a keyless dark basemap instead, such as Esri `Canvas/World_Dark_Gray_Base` (same server and `{z}/{y}/{x}` order as World Imagery), and credit it.

### The event marker on a first-of-month cutoff
- **What you see:** cutoffs are the first of each month, so the 2024-09-01 cutoff is ten days before the 11 Sep collapse. A "collapse" badge on that step can read as if the data already knew.
- **Fix:** word the badge as "collapse 10 days after this cutoff", so the timeline stays honest.

### Layer order can bury the markers you added
- **What you see:** the city-zoom risk markers exist (20 rendered, with the right feature-state), but the span dots are added after them, so they are drawn on top. Up to 98 mostly white dots cover the coloured markers, and Carolabrücke's red is hard to see at zoom 12.
- **Fix:** add the marker layer after the span layer (or pass `beforeId`), or hide the span dots below the marker cut-off zoom. To verify, count rendered features with `queryRenderedFeatures` and take a screenshot.

### A reserved badge can squeeze the slider to nothing at phone width
- **What you see:** at 375 px the month slider shows a thumb but no track. The row is `nowrap`, and the "Month" label, the fixed-width date and the always-reserved collapse badge (170 px, hidden with `visibility`, so still in layout) add up to the whole row; the range input computes to 0 px.
- **Fix:** below 700 px let the row wrap, put the badge on its own full-width line (`flex: 0 0 100%`, so its space is still reserved and showing it changes nothing but visibility), and give the input a basis (`flex: 1 1 150px`). Check by reading the input's width in the browser, not by looking: the thumb still draws at 0 px.

### Esri's dark canvas runs out at zoom 16 over Dresden, and MapLibre asks one level deeper
- **What you see:** flying to zoom 15.5 on `Canvas/World_Dark_Gray_Base` fills half the view with "Map data not yet available" tiles. Probed: every zoom-17 tile around Carolabrücke is the same 2,521-byte placeholder, while zoom 16 has real 7–13 KB tiles. MapLibre requests zoom z+1 for a 256 px raster source, so map zoom 15.5 asks for zoom 17.
- **Fix:** `maxzoom: 16` on the raster source; MapLibre then overzooms the zoom-16 tiles. World Imagery has real zoom-17 tiles and needs no cap.

### scrollIntoView scrolls the window as well as the panel
- **What you see:** selecting a bridge calls `scrollIntoView` on the detail; at desktop width the page itself scrolls 28 px and the title is clipped, because every scrollable ancestor moves. Scrolling "just enough" to show the detail's bottom then hides its heading when the detail is taller than the panel.
- **Fix:** at desktop width set `#side.scrollTop` yourself; align the detail's top when it is taller than the panel. Keep `scrollIntoView` only for the phone layout, where the page is meant to scroll.

### A background tab stops the story's clock
- **What you see:** reviewing the story in a browser tab that is not in front, nothing advances: no orbit, captions late, the same scene for a minute, while seeking works. GSAP's ticker runs on `requestAnimationFrame`, which browsers pause for hidden tabs; `setInterval` (the old replay) only slows down.
- **Fix:** test the story in the fronted tab with the window visible, and read state from the DOM. The page is fine; the test was not.

### `getStyle()` does not list custom layers
- **What you see:** a three.js custom layer added with `map.addLayer` is missing from `map.getStyle().layers`, so a check that counts `type === "custom"` reports nothing and the deck looks absent.
- **Fix:** ask the style's layer table (`map.getLayer(id)` or `map.style._layers`), which has it; `getStyle()` serialises only style-spec layers.

### Pitch above 60 needs `maxPitch`
- **What you see:** a scene asks for pitch 65 and the map reads 60; no error. MapLibre clamps to the map's `maxPitch`, default 60.
- **Fix:** set `maxPitch` in the map options (75 here). Also: a camera mode that "keeps the centre" must still set it for seeks, or a chapter click lands with the subject at the frame's edge.

### One bad font stack blanks the whole vector basemap
- **What you see:** vector tiles download and are marked loaded, but every layer on the source renders nothing: no water, roads or buildings, zero buckets in each tile, no error event. Bisecting the style finds the symbol layer: its `text-font` stack named a face the glyph host does not have, MapLibre requested the combined stack as one glyph file, got 404, and the failed glyph fetch aborted the tile parse for the entire source.
- **Fix:** use only faces the glyph host serves, one per stack (OpenFreeMap: `Noto Sans Regular`; no mono face). Test a style by loading it in a hidden MapLibre instance and counting `querySourceFeatures` for water; bisect layers when it is zero.

## Environment

- Python 3.14 has no wheels for rasterio or geopandas, so the project pins 3.12.
- Overpass returns 406 without a User-Agent and often returns 502 or HTML. Fix: send a User-Agent, use mirrors, and cache the JSON in `data/<site>/`.
- Modal must always target workspace **geo-sar**. The machine default profile is a different workspace, and a plain `uv run modal ...` ignores `.env`, so `MODAL_PROFILE=geo-sar` there has no effect. Fix: run `MODAL_PROFILE=geo-sar uv run modal ...` or `uv run --env-file .env modal ...`, and check `modal profile current` prints `geo-sar` before any deploy.
- The 3D deck custom layer rendered its slab mirrored about north: the model matrix scales Mercator Y by −1 (Y runs south), which flips handedness, so `rotY(axis − 90°)` puts local X at bearing 180° − axis. The deck looked "pasted on" through 7d for this reason. Fix: rotate so local X lands on the axis bearing and keep a test that pushes the unit X vector through the layer matrix and reads back east and north.
- `python -m http.server` sends only `Last-Modified`, so Chrome applies heuristic freshness and keeps old `web/*.js` for hours; a `?r=` query busts only `index.html`. A review of a new phase ran against a stale `deck3d.js` and judged it broken. Fix: clear the browser cache (or disable it in devtools) before reviewing, and prove the new code is running by checking a global the phase introduced.
- A hidden MapLibre "warmer" meant to pre-cache tiles for a later view must be the size of the real map container. A 2 × 2 px warmer loads exactly one tile, so the Europe pull-out still showed dark frames. Also, a continuous zoom across several levels (12 → 3.8) always passes through tiles nothing has loaded; a dip-to-background cut onto the warmed view is the cinematic answer.
- Intermittent internet drops on the review machine (ERR_INTERNET_DISCONNECTED on tile fetches) looked like code regressions twice. Attach `map.on("error")` and request-failure listeners to a review run before blaming a phase for missing tiles.
