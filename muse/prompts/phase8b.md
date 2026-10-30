Phase 8b: the landing and scenes 1–4 composed to the design spec. Read docs/design-spec.md in full (it changed: §4 now has craft rules for the 3D buildings, label density, footprint opacity, and the close-up base), docs/story-spec.md rows 1–4 and §8 Landing, web/basemap.js, web/story.js, web/story.css, web/fui.css and web/annotate.js as built in 8a, and tests/frames.md. The reviewer's frames of 8a found: the landing still shows the old white Play button and a 40 px title; every suburb is labelled; bridge footprints read as pale pills at city zoom; the history strip sits as a block bottom-left; and the 3D buildings are not on screen in scenes 1, 3 and 4. This phase fixes those and composes the first four scenes. Scenes 5–9 are 8c; Explore and phone are 8d.

Files you may change: web/index.html, web/story.js, web/story.css, web/fui.css, web/basemap.js, web/annotate.js, web/explainer.js, tests/. No change to web/data/, scripts/ or out/. No new libraries.

1. The 3D city, per spec §4 craft rules. `fill-extrusion` opacity fades in across zoom 11.5–12.5 and is full by 12.5; colour graded by height (base `#0d1526`, top `#1b2740`) with the vertical gradient on; heights clamped to 4–60 m; the style's `light` anchored to the map, low elevation, soft intensity. Scenes 1, 3 and 4 run at zoom 12.3 (not 12) so the city has volume under the 55°/40° pitch, and the director's tile wait precedes the first tilt. Extrusions never over imagery. Measure in the browser is the reviewer's job; you report the expressions.

2. Labels, per §4: only `place` features of class `city` or `suburb` with rank ≤ 2 at zoom ≤ 12.5, capped at about 15 on screen by `symbol-sort-key` and spacing; hidden in scenes 1 and 4 (pitch ≥ 50) and shown in scene 3 where the bridge callouts replace them anyway, so hidden there too; no street names anywhere.

3. Footprints and markers at city zoom: bridge polygon fills at 0.12 opacity over the vector base; the reticle marker carries the risk colour (dot, hairline ring; dashed rotating ring and glow for `high`). The pale pill look must be gone in scenes 1, 3 and 4.

4. Landing, per spec §8: a 1.2 s preloader on `--bg` where the "RADARTWIN" wordmark draws in as a hairline outline then fills, while fonts (`document.fonts.ready`) and the first tiles load; then the letterboxed night city at pitch 55 with the slow orbit, "RADARTWIN" at 160 px Rajdhani 700 tracked 0.08 em, "DRESDEN · 2022 – 2024" in mono beneath, the Play control as a 72 px hairline ring with a triangle and the word PLAY in mono beneath, a one-line mono tagline ("The data flagged it first."), corner brackets at the frame's edges. Remove the old white rectangular Play button. The old "RadarTwin Dresden — bridge watchlist hindcast" title text stays only in Explore's header.

5. Scene 1: the title block becomes the landing wordmark shrinking to 72 px over the first 2 s as the captions begin (one continuous move, no cut); orbit as before; the scan line sweeps once.

6. Scene 2: the explainer restyled as a drawn FUI diagram: hairline strokes in `--line-strong`, the satellite and kerb as outlined shapes with corner brackets, dashed pulse arcs, the echo path dashed, the counter in 72 px mono, labels in 11 px tracked mono; the chart→dot morph keeps its timing. No filled grey blocks.

7. Scene 3: the pull-back lands at zoom 12.3; bridges light up as reticles in rank order with bracketed mono labels (already built; verify they do not overlap by using `placeLabel` collisions) and leader lines of 1 px; labels clear before scene 4.

8. Scene 4: the month wordmark top-right at 112 px Rajdhani 600 uppercase, month name over the year, crossfading 150 ms per month; the headline card top-left on a bracket frame, 24 px display line and 14 px mono reason; the history strip along the bottom edge, full width between the letterbox and the caption band: 10 px cells with 2 px gaps, row labels 11 px mono uppercase on the left, the hairline playhead, filling left to right; the first-yellow/orange/red callouts as bracketed labels with leader lines; markers as reticles.

9. Motion: all camera moves on the ease-out curve over 1.6–2.4 s; the month wordmark and headline changes crossfade; nothing pops. Reduced motion as the spec says.

10. Write tests/frames.md for the landing and scenes 1–4 (positions, sizes, fonts, colours) and update tests where layouts or expressions are asserted. Checks: `node --check` on every script, every `node tests/*.js`, `scripts/check_web_data.py`, `scripts/check_truncation.py`, and the grep that no stylesheet references `system-ui` or `Helvetica`.

Standing rules (every phase):
- Do not use jg/jevgrep or any tool that sends code to an external service; use grep and read the files.
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure.
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running. Do not use `&` in shell commands.
- Report, do not tune: do not change thresholds, windows, SHRINK_K, the ladder, the model questions, the badge wording, any caption text or any file under out/ or web/data/.
- No spend this phase: no Meta API or SAM calls. Network: the page's own CDN, font and tile hosts only. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files changed; for each of items 1 to 9 what you built and how you checked it; the extrusion expressions; the contents of tests/frames.md; the test and check results; and your self-review answers (a) to (d).
