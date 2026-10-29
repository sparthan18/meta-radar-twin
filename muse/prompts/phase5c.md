Phase 5c: the remaining map layers. Read SPEC.md section 9 (Phase 5c), the `scripts/export_web.py` entry in section 8, section 3.5 (whole-period columns banned), and the "## Web map" section of docs/gotchas.md, before writing code. Phase 5d (memo panel, phone layout, accessibility) comes later; do not start it.

Facts you need: `out/dresden_state.pkl` holds `pts` (3,694 scatterers × epoch columns) and per-bridge `velocity` and `coherence` tables, but no per-point table. `radartwin/analytics/retro.py` has `cutoff_coherence_velocity(t, y)` for one point's truncated series. `data/carola/s1_rtc_vv.tif` is a 91×93 px Sentinel-1 RTC VV chip in EPSG:32633 around Carolabrücke; `scripts/export_web.py` must keep reading `out/` only. `out/sam_polygons.geojson` has two SAM polygons (Augustusbrücke, Carolabrücke) already exported to `web/data/sam.geojson`.

1. Markers above the span dots. In web/index.html, add `bridges-markers` after `spans-circles` (or use `beforeId`) so the risk markers sit on top at city zoom. Keep the zoom-15 cut-off. Report the final layer order.

2. Per-point cutoff velocity. New script `scripts/point_velocity.py`: for every scatterer and every one of the 33 cutoffs, compute the cutoff velocity with `cutoff_coherence_velocity` on that point's own-track epochs with date < cutoff (NaN below 24 epochs), exactly as the pipeline does for the bridge means. Write `out/scatterer_velocity.csv` (rows = point id, columns = cutoffs). Check: for every bridge and cutoff, the mean over the bridge's bound points must equal the bridge's `state["velocity"]` value (report the max abs difference; it should be 0 or rounding only). Do not modify `out/dresden_state.pkl` or any other existing file under `out/`.

3. Export. `export_web.py` writes `web/data/scatterer_velocity.json` from that CSV: `{"cutoffs":[...], "v":{"<id>":[33 values rounded to 0.1, null for NaN]}}`. `scatterers.geojson` stays id + track + geometry. Total `web/data/` must stay under 3 MB; report the size.

4. Scatterer layer. A "Scatterers" toggle (off by default) shows the 3,694 points coloured by their cutoff velocity at the selected month on the same ±4 mm/yr blue–white–red scale as the span dots, grey for null. The colour must follow the slider; either `setFeatureState` per point or a paint expression over the array index (`["at", idx, ["get", "v"]]`) is fine, but say which and why. Clicking a point shows a popup with its id, track and velocity at that month.

5. SAM layer. A "SAM" toggle (off by default) draws the `sam.geojson` polygons as outlines in a colour distinct from the risk colours; clicking one opens a popup with the bridge name, the SAM score and the IoU against the OSM footprint (for example "Carolabrücke · SAM 3.1 score 0.77 · IoU 0.33"). These polygons come from one Sentinel-2 chip, so they exist only near Carolabrücke; say so in the legend.

6. Sentinel-1 amplitude. New script `scripts/render_s1_chip.py` reads `data/carola/s1_rtc_vv.tif`, renders it as a greyscale PNG (dB, stretched between the 2nd and 98th percentile) to `out/s1_amplitude.png`, and writes `out/s1_amplitude.json` with the four corner coordinates in lon/lat (transform the four UTM corners exactly; do not assume the chip is axis-aligned in lon/lat). `export_web.py` copies both into `web/data/`. The page gets a "Radar" toggle (off by default) that adds a MapLibre `image` source with those corners under the bridge layers at 0.8 opacity.

7. Checks. Extend `scripts/check_web_data.py`: every id in `scatterer_velocity.json` exists in `scatterers.geojson` and vice versa; every array has 33 entries; the per-bridge means of the exported values match `decisions.json`'s `vel` to 0.1; the s1 corners lie inside the Dresden bounding box; the whole-period check still passes with the new files. Add planted failures to `--self-test` for the id mismatch and the mean mismatch.

8. Run `export_web.py`, `check_web_data.py`, its `--self-test`, and `scripts/check_truncation.py`. You have no browser: do not try to serve or screenshot the page. Prove what you can from the code and the data, and list what needs a visual check and how it should look.

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure.
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running. Do not use `&` in shell commands.
- Report, do not tune: do not change thresholds, windows, SHRINK_K, the ladder, the model questions or any existing file under out/.
- No spend this phase: no Meta API or SAM calls. No network needed. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files created and changed; the layer order; the step 2 max abs difference; the web/data size; which colouring method you chose for the scatterers and why; the check_web_data result, its self-test result and the check_truncation result; the visual-check list; and your self-review answers (a) to (d).
