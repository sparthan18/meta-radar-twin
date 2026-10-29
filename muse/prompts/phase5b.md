Phase 5b: fix the defects found when the phase 5a web map was tested by clicking every control. Read SPEC.md section 9 (Phase 5a and the new Phase 5b list) and the "## Web map" section of docs/gotchas.md before writing code. Change only web/index.html, scripts/export_web.py and scripts/check_web_data.py. The SAM layer, the scatterer layer on the map, the radar toggle, the memo panel, the phone layout and the accessibility pass are phase 5c, not this phase.

1. Basemap. Replace the CARTO dark source with Esri Canvas World_Dark_Gray_Base: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, attribution "Esri, HERE, Garmin, © OpenStreetMap contributors". Rename the source and layer ids so that nothing says carto. The footer credits Esri only. Afterwards, `grep -i carto web/` must find nothing.

2. Bridges must be visible at city zoom. Thin bridge polygons vanish at zoom 12. Add a centroid point per bridge (computed in the page from bridges.geojson, or exported, your choice) as a circle layer visible below zoom 15. It is coloured from the same feature-state `risk` as the polygons, uses the same not-monitored styling, and clicking it selects the bridge exactly as clicking the polygon does. The slider must update the markers' colour too.

3. Ranking order. Sort by model risk first (high, elevated, watch, none, then not monitored), then by rank, then by name. Keep the rank number shown on each row.

4. Event badge. The last cutoff is 2024-09-01 and the collapse is 2024-09-11, so the current text implies the data already contains the collapse. Show the badge only on the cutoff whose month contains the event date, with the text "Carolabrücke collapsed 10 days after this cutoff (11 Sep 2024)". Compute the 10 from the dates rather than hard-coding it. Fix the chart's collapse marker label the same way, so it never sits inside the data window.

5. Stable layout. Showing the badge must not change the slider's width. Reserve its space, for example with `visibility` instead of `display`, or a fixed-width slot. Check this by measuring the slider's width at the first and the last cutoff.

6. Selection. Clicking a bridge (polygon, marker or ranking row) must bring its detail panel into view without manual scrolling at a 1280×800 window. Either scroll the detail into view or reorder the side panel so the detail sits above the ranking. Say which you chose.

7. Span dots. Clicking a span dot opens a small popup with the bridge name, the span number and that span's anomaly at the selected month (mm/yr, or "no data"). It also selects the bridge. The popup's value must follow the slider while it is open, or the popup must close when the month changes.

8. Vote labels. The model probabilities are vote shares from 5 samples. Label the bars "votes for this risk", "votes for high" and "votes for inspect", and show them as "k of 5" next to the bar. Do not change decisions.json.

9. Scatterers. scatterers.geojson currently carries `v` and `c`, which are the whole-period EGMS mean_velocity and temporal_coherence, banned by SPEC 3.5. Drop both. Keep only the id, the track and the geometry. Phase 5c adds per-cutoff values. Add a check to check_web_data.py that fails if any web/data file carries a whole-period column, by name or by these short keys, and add a matching planted failure to its --self-test.

10. Not-monitored length. Augustusbrücke's `len_m` is half the polygon perimeter, which overstates a long thin shape's length. Use the long side of the polygon's minimum rotated rectangle in UTM instead, and show it in the detail panel as "≈ N m". Report the old and new values.

11. Re-export the web data with scripts/export_web.py, then run scripts/check_web_data.py and its --self-test. To test the page, you may serve web/ locally with `python3 -m http.server` in the foreground, but stop it before ending your turn. You have no browser, so do not claim to have clicked anything. Instead report which items need a visual check, and how each one should look.

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure.
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running; stop any server you started. Do not use `&` in shell commands.
- Report, do not tune: do not change thresholds, windows, SHRINK_K, the ladder, the model questions or any file under out/.
- No spend this phase: no Meta API or SAM calls. No network needed beyond the basemap URLs the page itself loads. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files changed; for each of items 1 to 10, what you changed and how you checked it; the old and new Augustusbrücke length; the slider widths from item 5; the check_web_data result and its self-test result; the list of things that need a visual check in a browser; and your self-review answers (a) to (d).
