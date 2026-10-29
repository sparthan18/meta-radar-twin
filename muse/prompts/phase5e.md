Phase 5e: make the month replay the centrepiece of the web map, for the demo. Read SPEC.md section 9 (Phase 5e) and the "## Web map" section of docs/gotchas.md before writing code. Change only web/index.html. No change to web/data/, scripts/ or out/. No new libraries: MapLibre 4.7.1 and CSS only.

Everything below must keep three things true: the replay never shows data after the selected cutoff (phase 5a rule); every control from phases 5b to 5d keeps working, including keyboard use, `aria-pressed`, the skip link and the phone layout; and all motion is off under `prefers-reduced-motion: reduce`.

1. Play. A "Play" button next to the slider (becomes "Pause" while playing, `aria-pressed`). It advances the slider one cutoff every 700 ms from the current position to the last cutoff and stops there; the space bar toggles it when the button has focus. Playing calls the same `applyCutoff` path as dragging, so colours, ranking, detail, popups and memo state all follow. Moving the slider by hand pauses playback.

2. Transitions. Give the bridge fill, line and marker colours a 400 ms `*-color-transition`, and the span and scatterer circles 300 ms, so recolouring eases instead of flicking. Under reduced motion, duration 0.

3. Ranking motion. When the order changes, rows move to their new position with a 350 ms FLIP animation (measure positions before and after the re-render, then animate the transform). No animation under reduced motion. The `aria-current` row and keyboard focus must survive the re-render.

4. Ticker. One line under the slider, `aria-live="polite"`: "<Month YYYY> · <n> high · <names of the high bridges, or 'none high'>", computed from the selected cutoff's decisions only. Example: "August 2024 · 2 high · Carolabrücke, Budapester Straße".

5. Framing. Dark basemap by default (Imagery stays one click away; remember the choice in `localStorage` with try/catch). A glow under each high marker: a second circle layer below `bridges-markers`, radius 18, the high colour at 0.25 opacity, blurred with `circle-blur: 1`, drawn only for features whose feature-state risk is high. No pulse animation (it would need a timer for every frame).

6. Camera. Selecting a bridge from the ranking or the map calls `flyTo` to its centroid at zoom 15 over 1.2 s (`jumpTo` under reduced motion). Clicking the already-selected bridge does not move the camera. The initial view stays the city at zoom 12, with a 2 s ease from zoom 11 on first load (none under reduced motion).

7. The collapse moment. When playback (not manual dragging) reaches the last cutoff: pause, fly to Carolabrücke at zoom 15.5 over 1.5 s, select it, and switch on the Radar and SAM layers. The badge text and chart marker stay exactly as phase 5b worded them. Nothing new is shown: the data for that cutoff is already on screen; only the camera and layers change. Under reduced motion, select Carolabrücke and turn the layers on without flying.

8. Desktop slider width. At widths above 700 px the slider has shrunk to about 245 px because the layer buttons share its row. Put the controls on two rows: slider row (label, slider, month, badge, Play) and buttons row (basemap group, layers group). The slider must be at least 480 px wide at 1280 px; report the arithmetic. The phone layout from phase 5d must not change.

9. Checks. Run `node --check` on the inline script (extract it as before) and `node tests/test_memo_render.js`; run `scripts/check_web_data.py` to confirm the data is untouched. You have no browser: do not serve or screenshot the page. Prove what you can from the code, and list what needs a visual check and how it should look (the reviewer will play the replay end to end, at desktop width, at phone width, with reduced motion on, and by keyboard).

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure (none expected this phase; say so).
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running. Do not use `&` in shell commands.
- Report, do not tune: do not change thresholds, windows, SHRINK_K, the ladder, the model questions, the badge wording or any file under out/ or web/data/.
- No spend this phase: no Meta API or SAM calls. No network needed. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files changed; for each of items 1 to 8 what you changed and how you checked it; the slider width arithmetic; the check results; the visual-check list; and your self-review answers (a) to (d).
