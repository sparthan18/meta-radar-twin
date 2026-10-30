Phase 8c-1 fix: judged by eye on frames of natural playback at 1280×800 after a cache-clean load. The HUD card, the side-view card, the vector base and the slab at true height are in. Read the updated docs/design-spec.md §4 ("The deck in the close-up") and §5 (HUD card) and docs/story-spec.md scene 6 first. Change only web/deck3d.js, web/story.js, web/story.css, web/annotate.js and tests/. No change to web/data/, scripts/, out/, captions, data or thresholds.

1. The slab is mirrored about north. Measured: the span chain of Carolabrücke bears 350.8° and `deckAxisDeg` holds 350.8, yet the rendered slab crosses the footprint at about +9°. The layer's model matrix (translate · scale(s, −s, s) · rotX(π/2) · rotY(axis − 90°)) maps local X to compass bearing 180° − axis because the −Y scale flips handedness. Fix the rotation so local X renders at the axis bearing (rotY(90° − axis) is the direct correction; verify, do not assume). Add a test to test_deck3d that builds the same matrix as render() for axis 350.8 and 45°, pushes the unit X vector through it (with the Mercator Y-south convention) and asserts the east and north components match sin/cos of the axis bearing; planted failure: the old formula.

2. The red slab is a flat red stick: colour `#ff3b3b` with a red emissive reads unlit. Per spec §4: emissive intensity ≤ 0.15, MeshLambert (or Standard) so the top face is visibly lighter than the sides under the directional light; the light direction must match the basemap's (low, from the south-east) after item 1's rotation fix (the light is in model space, so account for the axis rotation or place it in map space). Test: the scene's directional light position and emissive intensity.

3. The footprint polygon under the slab: in scenes 5 and 6 `bridges-fill` drops to fill-opacity 0 and its outline to a 1 px hairline, restoring on exit (scene 7 keeps imagery and the SAM outline as now). Span dots stay.

4. The floating "rank N of 19 · z 4.43" counter over the map in scene 6 duplicates the HUD; remove it. The HUD's RANK and Z readouts count up on the month change into scene 6 (already wired per 8c-1; confirm by test). The span callout keeps its leader line and bracketed label; the frames show the label but no visible leader line, so check the line draws over the map (stroke, opacity, z-order above the deck canvas) and test that the callout SVG contains a drawn line for the fastest span.

5. HUD card: 300 px wide; the worry phrase ("send an inspector") on one line in the RISK cell, never wrapped (shrink to 16 px if needed).

6. tests/frames.md: update scenes 5 and 6 (slab aligned with the footprint, lit top face, no floating counter, leader line visible).

Prove it from the code and tests; you have no browser. The reviewer will play from the landing untouched on a cache-clean load and capture frames of scenes 5 and 6.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only the page's own CDN, font and tile hosts; no installs, no commits, no background jobs, no `&`. Call the build steps "phases". Finish with the diff summary per item, the test results and a sentence per item on how you verified it.
