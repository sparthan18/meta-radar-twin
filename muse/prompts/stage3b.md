Stage 3b: fix three design issues from stage 3 and make the memo readable. Read SPEC.md sections 3.6, 4, 6.2 and 7 (section 4 changed: risk ladder, persistence, condition overlay, not-monitored bridges) and docs/gotchas.md ("Radar and remote sensing", "Analytics" and "Muse Spark audit agent") before writing code. Stage 3 code exists in radartwin/decide/, radartwin/agents/ and scripts/; change it in place. Do not change the stage 1 ranking: the 19 analysed bridges, scores and z must stay identical (check against out/dresden_*.csv before and after).

1. Risk ladder and persistence (SPEC 4). In radartwin/decide/rubric.py replace the decision logic with the ladder: high / elevated / watch / none, capped at watch for low_quality or low_coverage. Add escalations_12m and months_since_esc to the features, computed only from cutoffs at or before the current one. Write the rules in the module docstring as general principles, not tuned to any bridge.

2. Condition overlay. `immediate` is no longer a risk level. It becomes a separate column, `owner_condition_alert = high and condition == "poor"`, with a `condition_source` column. In radartwin/config.py give Carolabrücke `condition_source = "Pre-event public record: sections A and B renovated 2019-2024, section C (tram) renovation scheduled for 2025 (City of Dresden). Grade 'poor' is this project's reading of that schedule."` Every other bridge has condition "unknown" and source "none". Headline numbers use the ladder only.

3. Not-monitored bridges. Add radartwin/decide/coverage.py: list the named bridges >= 80 m that the ranking dropped for too few scatterers or tracks, using the same OSM loading, dissolving and binding functions as scripts/rank_city.py (import them; do not copy them). For each, give scatterers, tracks, footprint area and points_per_ha. Include them in decisions (pattern "not_monitored", risk_level "unknown", radar_coverage "none", with the reason), in the hazard layer and in the memo. Print the list. Augustusbrücke is expected to appear; if it does not, find out why and report it.

4. Re-run scripts/decisions.py all. Rewrite out/escalation_counts.csv with columns: cutoff, n_bridges, n_not_monitored, n_high, n_elevated, n_watch, carola_risk, carola_escalations_12m, owner_condition_alerts. Print the full table. Report how many bridges reach "high" at each cutoff. If "high" fires on more than a quarter of bridges at most cutoffs, say so plainly and do not tune thresholds.

5. Audit agent (radartwin/agents/audit.py):
   - Add a batch tool `get_decisions(cutoff)` returning every bridge's decision in one call, including the not-monitored ones. Keep `get_decision` for single lookups. Keep the 25-call cap.
   - Set max_tokens to at least 32000 and check the finish reason. If the memo is cut off, fail loudly and do not write a partial memo.
   - Replace the memo instructions with this structure, in plain engineer-facing English. No phrasing like "flag X present" or "needs inspection absent":
     1. Verdict: two or three sentences naming the bridges that need action now and why.
     2. Action list: a Markdown table (bridge, risk, why in a few words, what to do).
     3. Watch list: one line per bridge at elevated or watch.
     4. Not monitored by radar: one line per bridge, with its point count, saying it needs another inspection method and that this is not a sign it is safe.
     5. Evidence for each high bridge: the key numbers with units, and the escalation history (escalations_12m, months_since_esc).
     6. Owner condition: the overlay result and its source, labelled as an external input.
     7. Caveats: EGMS latency (about a year), interim rubric, data-quality limits.
   - Every number must still come from a tool result.

6. Re-run scripts/audit.py for 2024-09-01 and 2023-10-01 (at most two runs per cutoff) and run scripts/check_memo.py on both. Fix the prompt and re-run once if any number does not trace back.

Rules:
- Muse Spark spend under $2 for this stage. No SAM calls.
- Only network host needed: api.meta.ai.
- If MODEL_API_KEY is missing or the API returns 401, stop and print what is missing.
- Do not create git commits. Do not install packages.
- Update README.md: the Decisions section (ladder, persistence, condition overlay, not monitored) and the escalation_counts.csv columns.
- Finish with: files changed, confirmation that the 19-bridge ranking is unchanged, the not-monitored list, the escalation counts table, Carola's risk and escalations_12m at 2023-10-01, 2024-06-01, 2024-08-01 and 2024-09-01, the traceability result, the tool calls used per audit run, and the full 2024-09-01 memo.
