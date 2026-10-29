Phase 7a fix: three defects seen when the story was played in a real browser at 1280×800 (fronted tab, so the GSAP ticker ran). Change only web/story.js, web/story.css and web/index.html. Do not touch web/data/, scripts/ or out/.

1. The scene tag lags. Measured: during scene 4 (months ticking, headline changing) `#sceneTag` still read "scene 3 of 9"; after seeking with End to scene 9 (ending panel visible) it read "scene 3 of 9". The tag must reflect the scene that owns the master timeline's current time, on every seek, step, chapter click and natural transition. Derive it from the playhead (the same lookup the scrub bar's `aria-valuetext` uses, which was correct: "Scene 5 of 9: August" after a chapter click) rather than from a per-scene start callback, or make the callback fire on seeks too (GSAP `onStart` does not fire when seeking into a scene; use `onUpdate` on the master or a labelled position lookup).

2. No orbit in scene 1. Measured: `map.getBearing()` was 0 at 6 s into scene 1; the spec asks for a slow orbit at 0.5°/s. Drive the bearing from the scene's sub-timeline (a tween on a plain object with `onUpdate` → `map.jumpTo({bearing})`, or `map.easeTo` with duration 0 per tick) so it scrubs with the playhead and is skipped under reduced motion. The same mechanism should give scene 4 its "slow drift". Report the bearing you expect at 4 s and 8 s into scene 1.

3. The scene-1 title block and the "scene 1 of 9" tag are visible under the landing overlay before Play is pressed. Hide `#sceneTitle` and `#sceneTag` until the story starts; the landing shows only its own title, tagline and Play.

Prove what you can from the code; you have no browser. The reviewer will measure the tag during scene 4 and after an End seek, the bearing at 6 s into scene 1, and the landing DOM.

Standing rules: no spend, no network, no installs, no commits, no background jobs, no `&`. Do not change wording, data or thresholds. Call the build steps "phases". Finish with the diff and a sentence per item on how you verified it.
