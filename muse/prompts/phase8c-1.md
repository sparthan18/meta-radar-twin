Phase 8c-1: scenes 5 and 6 composed on the vector city. Read docs/design-spec.md §4 ("The close-up base", "The deck in the close-up", "The close-up camera"), §5 (HUD card, Side-view card, Span callout) and §9 first; every value below is already there. Frames of the current scenes 5–6 show the satellite photo washed grey, the deck as pink bars floating over it, bordered boxes for the HUD and side view, and a filled callout box. Change only web/story.js, web/story.css, web/fui.css, web/deck3d.js, web/annotate.js and tests/. No change to web/data/, scripts/, out/ or the memo/proof/outro code (8c-2). Do not change caption text, data, thresholds, the basemap light, the fog or scenes 1–4.

1. Base: scenes 5 and 6 use `basemap: "dark"` (the vector city with extrusions, fog and light), never imagery. Scene 7 keeps imagery as it is.

2. Camera (spec §4): scene 5 flies from scene 4's city pose to zoom 15.5, pitch 62, bearing −30 on Carolabrücke's centroid over 2.4 s on the ease-out curve; scene 6 steps to zoom 16.0, pitch 65 and orbits 20° over its length; scene 7 holds scene 6's end pose (its 0.3 push-in as now). One camera path for playback and seeks, as scenes 1–4 already do; extend the dual-path test to scenes 5 and 6 (poses at 0, half and end).

3. The deck (spec §4, story mode only): one continuous slab on piers at true height: deck top 12 m above the water, 2 m thick, true width; one box per span with ends meeting at the pier lines; piers 3 m × 3 m from 0 m to the deck's underside at each span joint; span colours by the bound month's class with the faint emissive bloom on high; tilt per span scaled so the worst span of the shown month tilts 2.5°, never more; one directional light matching the basemap's (low, from the south-east) plus 0.45 ambient. Add this as a `mode: "seated"` option in deck3d.js so Explore's exaggerated bars (`mode: "bars"`, the current behaviour) are untouched; test_deck3d gets the seated geometry (heights, pier count = span joints, tilt cap) with a planted failure (a span tilted 10°).

4. HUD card (spec §5): `#deckHud` becomes the bracket-framed glass card, 260 px, name in 22 px display, 2 × 2 readouts CUTOFF / RANK / Z / RISK with the worry word in display face coloured by class; values count up 600 ms on scene entry and crossfade on the month change into scene 6. Same bound-month data as now.

5. Side-view card (spec §5): `#sceneSideView` becomes the glass card, 320 px, title "SIDE VIEW" on a hairline rule with "VERTICAL ×7" at its right, spans as 1 px-outlined prisms at 35 % fill on a hairline baseline with 6 px pier ticks, the worst span solid, one mono caption line. Remove the full border.

6. Span callout (spec §5): the leader line from the fastest span's centre to a bracketed label (span name mono uppercase, mm/yr in 18 px mono beneath), drawn over 600 ms; no filled box.

7. tests/frames.md: entries for scenes 5 and 6 (what the reviewer should see at 3 s and at the end); test_story checks the basemap and camera values; test_fui checks the card CSS (glass, brackets, no border) with a planted bordered HUD.

Prove it from the code and tests; you have no browser. The reviewer will play from the landing untouched and capture frames of scenes 5 and 6 at 1280×800.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only the page's own CDN, font and tile hosts; no installs, no commits, no background jobs, no `&`. Call the build steps "phases". Finish with the diff summary per item, the test results and a sentence per item on how you verified it.
