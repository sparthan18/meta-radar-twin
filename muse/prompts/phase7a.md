Phase 7a: story mode, the director and the first two real scenes. Read docs/story-spec.md in full (modes, director rules, the scene table, Explore additions, libraries, phases), SPEC.md section 9 (Phase 7), and the "## Web map" section of docs/gotchas.md before writing code. This phase builds the frame the later phases fill: a working, scrubbable, captioned story from Play to the ending, with scenes 4 (three-years) and 9 (ten-days-later) complete and the other seven as placeholders that show their captions over the correct camera and month.

Files you may change: web/index.html, new web/story.js (the director and scenes), new web/story.css, scripts/export_web.py and scripts/check_web_data.py (for the two small data additions below), tests/ (a node test for the director's pure parts). Do not change out/ or any analytics code. Keep web/memo.js as it is.

Libraries: add GSAP 3.12.5 from cdnjs (`gsap.min.js`), pinned, loaded before web/story.js. three.js is phase 7d; do not add it now.

1. Modes and landing. The page opens in Story mode: dark basemap, pitch 55, side panel hidden, the title and a centred Play button over the map. A "Watch the story" button in Explore returns to Story; "Explore this month" (and Escape) leaves Story for the dashboard at the scene's cutoff. Everything built in phases 5a–5e must keep working in Explore, including keyboard use, reduced motion, the memo panel and the phone layout. The old Play button becomes the story's Play; the replay-only behaviour from phase 5e (collapse moment) moves into scene 9.

2. Director. In web/story.js: scenes are plain objects `{id, cutoff, camera, layers, overlay, captions, duration, waitFor}` exactly as the spec describes. One GSAP timeline per run; scenes are sequenced, each with its own sub-timeline; the scrub bar scrubs the master timeline. `waitFor` entries ("tiles", "memo", "fonts") resolve against real readiness (`map.areTilesLoaded()` / the `idle` event, the memo fetch, `document.fonts.ready`) with a 4 s timeout that degrades to a cut. The director binds the dashboard to the scene's cutoff through the existing `applyCutoff` path so Explore is always in step. It refuses to bind a scene to a cutoff later than the replay position during scene 4 (assert and skip, never show).

3. Scrub bar with chapters. While Story is active the month slider's row shows the scrub bar: a track with nine chapter marks and labels on hover, a playhead, and during scene 4 the month ticks beneath. Space pauses/resumes, Left/Right step scenes, Home/End jump to the first/last scene. Clicking a chapter seeks there. The scrub bar is a `range` input under the hood so it stays keyboard-accessible and announces the chapter name through `aria-valuetext`.

4. Captions. One caption component: lower-third, 32–36 px, at most two lines, fade in and slide 8 px, with `at` and `hold` per caption. A visually hidden `aria-live="polite"` region announces each caption once. Captions can be hidden with a "CC" toggle (on by default; remembered in localStorage with try/catch). All text in braces in the spec is computed at run time from the bound cutoff's data; write a pure function `captionText(template, data)` and test it in tests/test_story.js with node, including the "nothing unusual" month and the pluralisation of counts.

5. Headline card. Add the headline card to Explore and to scene 4: "{Month YYYY} — {bridge} needs an inspector." with the plain-language reason taken from the rubric's `reason` field for the top high bridge, or "{Month YYYY} — nothing unusual." when no bridge is high. It replaces the phase 5e ticker.

6. Scene 4 (three-years), complete: from the first cutoff to the last at 0.7 s per month, pitch 40 with a slow drift, markers and glow on, the headline card changing each month, a brief callout (name + level, 1.2 s) the first time any bridge reaches yellow, orange and red. The history strip is phase 7b; leave a placeholder row.

7. Scene 9 (ten-days-later), complete: pull the camera back, roll the date from the last cutoff to `event_date` over 2 s, show the badge wording from phase 5b unchanged, then the ending panel with "{days} days later, {event_asset} collapsed." / "The data flagged it first." and the Replay and Explore buttons. The Europe map is phase 7c; show the third caption without it.

8. Placeholders for scenes 1, 2, 3, 5, 6, 7, 8: the right cutoff, camera target, layer state and captions, over the map, with a small "scene n of 9" tag. They must play and scrub correctly so the story has its full length and chapter marks now.

9. Data additions. `export_web.py` adds `n_monitored` and `n_not_monitored` to decisions.json (scene 3 needs them later) and `check_web_data.py` checks they sum to `n_bridges`, with a planted failure in `--self-test`. No other data change; do not touch out/.

10. Reduced motion: cuts instead of flights, no caption slide, scene 4 still steps months (it is content, not decoration), durations shortened to the caption holds. Phone (≤ 700 px): the story plays full-width with captions above the map's bottom edge; the scrub bar keeps 40 px targets.

11. Checks. `node --check` on web/story.js and the inline script, `node tests/test_story.js`, `node tests/test_memo_render.js`, `scripts/export_web.py`, `scripts/check_web_data.py` and its `--self-test`, `scripts/check_truncation.py`. You have no browser: do not serve or screenshot. Prove what you can from the code and the tests, and list what needs a visual check and how each scene should look and sound (captions) when played.

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff, including every caption; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure.
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running. Do not use `&` in shell commands.
- Report, do not tune: do not change thresholds, windows, SHRINK_K, the ladder, the model questions, the badge wording or any file under out/.
- No spend this phase: no Meta API or SAM calls. The only network use is the page's own CDN and tile hosts. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files created and changed; the scene list as implemented with each scene's cutoff and duration; the test results and check results; the visual-check list per scene; and your self-review answers (a) to (d).
