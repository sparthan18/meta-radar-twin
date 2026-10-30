Phase 8c-3 fix: three items judged by eye on frames of natural playback at 1280×800 after a cache-clean load; the scene itself passed (date roll in the upper third, red reticle pulse, collision-free Europe labels, the ending sheet). Read the updated docs/design-spec.md §8 ("Scene 9, Europe" and "Ending") first. Change only web/story.js, web/story.css, web/index.html (ending markup only) and tests/. No change to web/data/, scripts/, out/, caption text, data or thresholds.

1. The ending's first line "10 days later, Carolabrücke collapsed." wraps onto three lines at 48 px inside the 40 em column. Per spec: the column is 960 px max; "10 days later," becomes its own 16 px mono dim line above "Carolabrücke collapsed." in 48 px display on one line (`white-space: nowrap`). The two strings come from the same shipped wording split at the comma (keep `storyEndLine1` carrying the full sentence for screen readers if that is simplest, with the visual split in markup). Test: the split and the nowrap rule.

2. The EGMS note sits in the bottom letterbox bar 13 px above the month readout and crowds the scrub line's right end. Per spec it moves to the top letterbox bar at the right, mono 11 px dim. Test: the CSS places it with `top: 0` inside the 8vh bar and not `bottom`.

3. The Europe coastlines arrive a second after the pull-out starts because nothing has loaded zoom-4 tiles. Per spec: when scene 8 enters, create a hidden MapLibre instance (a 2 × 2 px container, `visibility: hidden`, the same style, centre [12, 52], zoom 3.8, no controls, `interactive: false`) so the browser cache holds the Europe tiles; remove it when scene 9 ends or on any seek out of scenes 8–9; never create more than one; skip it under reduced motion is not required. Guard every call so a MapLibre failure leaves the story untouched. Test: the warmer is created once on scene 8 entry and removed on scene 9 exit (mock `maplibregl.Map`).

4. tests/frames.md: update the ending entry and the Europe entry (coastlines visible from the first frame of the move; note in the top bar).

Prove it from the code and tests; you have no browser. The reviewer will play from the landing untouched on a cache-clean load and capture the Europe move's first frame and the ending.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only the page's own CDN, font and tile hosts; no installs, no commits, no background jobs, no `&`. Call the build steps "phases". Finish with the diff summary per item, the test results and a sentence per item on how you verified it.
