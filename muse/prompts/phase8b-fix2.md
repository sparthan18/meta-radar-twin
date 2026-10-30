Phase 8b fix 2: one defect measured in a real browser at 1280×800 after the first 8b fix. Change only web/story.js, web/story.css, web/fui.css, web/annotate.js and tests/. No change to web/data/, scripts/ or out/.

Measured in scene 4: the history strip now fills the width (cells 33 px wide, right edge at x = 1255) and is 160 px tall, but its row labels are 11 px JetBrains Mono (15 px line box) on an 8 px row pitch, so twenty labels overprint each other into an unreadable column. Also the lowest bridge marker sits at y = 508 while the strip's top is at y = 506, so the two touch.

Fix: rows 9 px tall with 1 px gaps (20 rows = 200 px); row labels 9 px JetBrains Mono 500, uppercase, tracking 0.04 em, vertically centred on their row, truncated with an ellipsis at 22 characters, in a label column of 150 px; the cells fill the remaining width as now. Move the scene-4 camera centre north so that the lowest marker (the southernmost bridge centroid projected at the scene's zoom and pitch) sits at least 24 px above the strip's top edge; report the new centre latitude and the computed lowest-marker y. Update tests/frames.md and the strip geometry test (row pitch, label font size, label column width, no two labels overlapping) with a planted failure.

Also: the design spec says the strip is "about 160 px for 20 rows"; update that line in docs/design-spec.md to 200 px with 9 px rows, since 7–8 px rows cannot carry legible labels.

Prove it from the code and the test; you have no browser. The reviewer will measure the label font, the row pitch, the overlap of consecutive labels and the lowest marker's distance from the strip.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only the page's own CDN, font and tile hosts; no installs, no commits, no background jobs, no `&`. Do not change caption text, data or thresholds. Call the build steps "phases". Finish with the diff summary, the test result and a sentence on how you verified it.
