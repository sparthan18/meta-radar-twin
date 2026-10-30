Phase 8c-2: scenes 7 and 8 composed, plus two leftovers from 8c-1. Read docs/design-spec.md §4 ("The close-up base", the footprint sentence in "The deck in the close-up"), §5 (Span callout, Side panel, Memo panel, Evidence card, Proof panel, Caption stacking) and docs/story-spec.md rows 7–8 first; every value is there. Frames of the current scenes 7–8 show the whole map switched to a blurred satellite photo under a flat memo sheet with a bordered table, the caption faded under the blur, and the proof as a centred card. Change only web/story.js, web/story.css, web/fui.css, web/annotate.js, web/memo.js, web/index.html (markup for the side panel and evidence card only) and tests/. No change to web/data/, scripts/, out/, caption text, memo text, data or thresholds. Scene 9 and the ending are 8c-3; do not touch them.

1. Scene 7 base: `basemap: "dark"` with the seated deck still showing (same as scene 6's end pose with the 0.3 push-in), the `sam-lines` outline on in cyan hairline, no imagery and no blur on the map in story mode. Explore keeps Imagery.

2. Side panel (spec §5): one glass sheet on the right, 440 px, letterbox to letterbox, bracket frame; `#sceneMemo` moves into it for scene 7 and `#sceneProof` for scene 8 with a 600 ms crossfade between them; the city and slab stay visible on the left.

3. Memo panel (spec §5): title "INSPECTION MEMO — {cutoff}" on a rule; the verdict typed in Inter 16/1.5 as now with the key sentence on the amber band and underline; "ACTION LIST" section title on a rule; actions as hairline rows (name in display, worry phrase coloured by class, reason mono dim, what-to-do Inter). memo.js may gain a renderer for the action rows from the memo's table; the memo markdown itself is unchanged.

4. Evidence card (spec §5): 280 px square top-left: `data/s2_visual.png` scaled with `image-rendering: pixelated`, the bridge's SAM polygon from `data/sam.geojson` projected into the chip frame from `data/s2_visual.json` corners (top-left, top-right, bottom-right, bottom-left; EPSG:4326) and drawn as a 1 px cyan outline over 600 ms; title "EVIDENCE — SENTINEL-2 · 10 m"; footer "SAM 3.1 · score {score} · IoU {iou}" from the feature's properties; enters with the "SAM 3.1 found the bridge" caption, exits with the scene. Test the projection with the chip corners against a known polygon vertex (planted failure: swapped corner order).

5. Proof panel (spec §5): the two readout columns counting up 600 ms and settling identical, the check mark drawing between them, the ten quantity rows with staggered checks, the footer line; the city dims to 45 % behind with the slab visible; the dip into scene 8 stays. Values from `data/proof.json` as now.

6. Caption stacking: `#caption` and `#sceneIndex` above every dim, blur and sheet (test: their z-index exceeds `#sceneDim`'s and the side panel's).

7. Leftovers: the span callout's leader line is 12 px in the shipped page and invisible; make it at least 60 px with the label up and to the right, the 3 px end dot and corner brackets on the label (test the geometry for the real September fastest span). The bridge footprint (`bridges-fill` and its outline layer) is hidden in scenes 5–8 and restored on exit (test).

8. tests/frames.md: entries for scenes 7 and 8 at 3 s and at the end.

Prove it from the code and tests; you have no browser. The reviewer will play from the landing untouched on a cache-clean load and capture frames of scenes 7 and 8 at 1280×800.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only the page's own CDN, font and tile hosts; no installs, no commits, no background jobs, no `&`. Call the build steps "phases". Finish with the diff summary per item, the test results and a sentence per item on how you verified it.
