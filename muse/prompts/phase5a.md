Phase 5a: web map core. Read SPEC.md sections 8 (scripts/export_web.py) and 9 (web map, "Phase 5a" only), and docs/gotchas.md, before writing code. Do not change anything under radartwin/ or the existing scripts; this phase only adds an exporter and a static page.

1. scripts/export_web.py per SPEC 8. It reads out/ only and makes no API calls. It writes web/data/bridges.geojson, spans.json, decisions.json, scatterers.geojson, sam.geojson and memos/<cutoff>.md. Decisions cover all 33 cutoffs, with the model decision and the rubric decision side by side, plus the not-monitored bridges. Simplify polygons and round numbers so web/data stays small; print the size of each file and keep the total under 3 MB.

2. scripts/check_web_data.py: validates web/data against SPEC 8 and exits non-zero on any failure. It must check at least: every bridge in decisions.json exists in bridges.geojson; every cutoff has a decision for every bridge; risk values are within the ladder; probabilities are between 0 and 1; for every cutoff, no value comes from a later month (compare against the out/ files for that cutoff); owner fields appear only under the "owner" key and the per-bridge owner_condition_alert; the not-monitored bridges carry their reason. Add a `--self-test` that plants one failure of each kind in a temporary copy and asserts each is caught.

3. web/index.html per SPEC 9 "Phase 5a": MapLibre GL 4.x from unpkg at an exact pinned version, no build step, all other code inline or in web/ files. Bridges coloured by the model's risk through feature-state, a month slider with one step per cutoff, the event badge from the event date on, the legend, the ranking list and the detail panel. The per-span chart shows only months up to the selected cutoff, and the collapse marker appears only once the slider reaches the event date. Not-monitored bridges are grey with a dashed outline and say "not monitored by radar" with the reason. Owner condition appears only in its own labelled block. Light and dark readable. No external calls other than the MapLibre script and the basemap tiles.

4. README.md: how to export and view the map locally (python -m http.server from web/), and what the map shows.

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure.
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running; stop any server you started.
- Report, do not tune: if a result looks wrong, say so with the numbers.
- No spend this phase: no Meta API or SAM calls. No network needed. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files created or changed, the size of each web/data file, the check_web_data.py result and its self-test result, your self-review answers (a)–(d), and for Carolabrücke at 2023-10-01, 2024-08-01 and 2024-09-01 the values the detail panel will show (rank, model risk and p_high, rubric risk).
