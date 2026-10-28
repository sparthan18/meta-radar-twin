Stage 3c: fix three defects found in review of stage 3b, and make the memo prose plain. Read SPEC.md section 4 (the risk ladder changed again) and docs/gotchas.md entries "Monthly decisions flicker, and the first persistence fix flooded the list", "Retrospective tools must not return the future" and "A loose traceability check passes almost anything" before writing code. Change only what these four items need. The 19-bridge ranking files in out/dresden_*.csv must stay byte-identical.

1. Persistence rule floods "high" (radartwin/decide/rubric.py). Stage 3b correctly implemented "high = escalate now, or escalations_12m >= 2", and that kept 5-8 of 19 bridges high in most months. Pieschener Mole had a six-month episode in 2024 and was still "high" in Sep 2024 with z = -1.7. New rule from SPEC 4: high only when escalate fires at this cutoff; elevated when months_since_esc <= 3 (make 3 a named module constant), or accelerating and differential, or outlier. escalations_12m stays in the features and the memo as evidence but never raises the level. Update the module docstring principle to say why. Expected after re-running decisions: 1-4 high bridges per cutoff, median 1, and Carolabrücke the only high bridge at 2024-08-01 and 2024-09-01. If that is not what you get, report the numbers and do not tune.

2. Future data in a retrospective tool (radartwin/agents/audit.py). get_span_series returns every cutoff up to 2024-09-01 even when the run's cutoff is 2023-10-01, so the Oct 2023 memo was shown 11 months of the future. Every tool must return only dates at or before the run's cutoff. Fix get_span_series and its tool description, and check the other tools for the same problem. After re-running, print the latest date that appears anywhere in each out/audit_<cutoff>_tools.json; it must not be later than that cutoff.

3. Loose traceability check (scripts/check_memo.py). It matches memo numbers as raw substrings of the tool log, so planted numbers 42, 0.9 and 7 all "trace back" to the 2024-09-01 log. A memo number must equal a whole number token in the tool results, or be a correct rounding of one (within half a unit of the memo number's last decimal place). Add a `--self-test` option that plants numbers that are not in the tool log (at least 42, 8.88 and 12.5) plus numbers that are (for example 4.241 and its rounding 4.24) into a copy of the memo text, and asserts the planted ones are caught and the real ones pass. Run it.

4. Plain memo prose (radartwin/agents/audit.py system prompt). The memo still uses raw field names such as points_per_ha, escalations_12m, months_since_esc and score_vs_own_history_z. Tell the agent to write them as plain words with units, for example "3.6 radar points per hectare", "escalated 3 times in the past 12 months, most recently this month", "4.24 times its own usual variation". Numbers must still come from tool results unchanged or correctly rounded.

Then re-run scripts/decisions.py all, scripts/audit.py for 2024-09-01 and 2023-10-01 (at most two runs per cutoff), and scripts/check_memo.py on both.

Rules:
- Muse Spark spend under $1 for this stage. No SAM calls.
- Only network host needed: api.meta.ai.
- If MODEL_API_KEY is missing or the API returns 401, stop and print what is missing.
- Do not create git commits. Do not install packages.
- Update README.md's Decisions section to match the new ladder.
- Finish with: files changed, confirmation that out/dresden_*.csv are unchanged, the escalation counts table, Carola's risk and escalations_12m at 2023-10-01, 2023-11-01, 2024-06-01, 2024-08-01 and 2024-09-01, the self-test result, the traceability result, the latest date in each tool log, and the full 2024-09-01 memo.
