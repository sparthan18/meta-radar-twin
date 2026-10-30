Phase 8c-3 fix 2: the Europe beat, judged by eye on frames of natural playback after a cache-clean load. Measured: the warmer is a 2 × 2 px map, so it loads one tile; 0.4 s into the Europe move the frame is dark, and 1.3 s in the left third is still dark while tiles for the intermediate zooms stream. The ending and the note are right. Read the updated docs/design-spec.md §8 ("Scene 9, Europe") and §6 (scene transitions) first. Change only web/story.js, web/story.css and tests/. No change to web/data/, scripts/, out/, captions, data or thresholds.

1. The warmer is the size of the map container (same width and height, positioned off-screen or `visibility: hidden`, `pointer-events: none`, aria-hidden), at the Europe pose, created on scene 8 entry and removed on scene 9 exit as now, so every tile of the Europe view is cached before the beat. Test: the warmer container's size equals the map container's (mocked), and a 2 × 2 px warmer is a planted failure.

2. The Europe beat is a cut: at STORY_EUROPE_AT the map dips to `--bg` over 500 ms (the existing dip element and curve from scenes 2 and 8), the camera jumps to the Europe pose (zoom 3.8, centre [12, 52], pitch 0, bearing 0) behind the dip, the Europe dots and labels start lighting as the dip lifts; seeks into the beat land on the Europe pose directly with no dip (one camera path). Replace the continuous zoom. Test: the dual-path check at Europe local times (10, 10.6, 12 s) and the dip timing.

3. tests/frames.md: the Europe entry (dip, then the finished view with all coastlines).

Prove it from the code and tests; you have no browser. The reviewer will play from the landing untouched on a cache-clean load and capture the frame right after the dip lifts.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only the page's own CDN, font and tile hosts; no installs, no commits, no background jobs, no `&`. Call the build steps "phases". Finish with the diff summary per item, the test results and a sentence per item on how you verified it.
