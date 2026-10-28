Phase 4b: finish phase 4 cleanly. Read muse/prompts/stage4.md, SPEC.md section 5.0, the README "Muse Spark notes" and the docs/gotchas.md entries added in phase 4 first. From now on, call the build steps "phases", not "stages".

1. Clean votes for the leaked rows. The four rows whose first-run input carried owner_condition_alert (Carolabrücke at 2022-08-01, 2023-10-01, 2024-08-01 and 2024-09-01) must not keep votes drawn from that input. Delete those cached responses and draw fresh votes with the whitelisted input. Print Carolabrücke's model risk and p_high at each of those cutoffs before (leaked) and after (clean), side by side. Do not change the prompt.

2. Fill the gap: run the model for the 6 cutoffs 2024-03-01 to 2024-08-01, then rewrite out/model_agreement.csv and out/model_disagreements.csv for all 33 cutoffs. Before spending, print the projected cost from the measured per-cutoff cost of fresh calls, never from cached ones.

3. Does the model add anything at the top? The model's number of high bridges matched the rubric's in every cutoff run so far. Report, over all 33 cutoffs: how often model risk "high" coincides with the escalate flag, any cutoff where they differ, and whether any asset reaches "high" from the model without escalate or misses it with escalate. State the result plainly; do not change the prompt to create disagreements.

4. Re-run scripts/audit.py for 2024-09-01 and 2023-10-01 (at most two runs per cutoff) so the memos carry the "Model and rubric" section, then scripts/check_memo.py --self-test and scripts/check_memo.py on both.

5. Wording: replace "stage" with "phase" in README.md, docs/gotchas.md, tests/ and code docstrings and comments (for example "(stage 3)" becomes "(phase 3)"). Leave the existing files in muse/prompts/ unchanged; they are the record of what was asked. Do not rename them.

Rules:
- Muse Spark spend under $2.50 for this phase, measured from token usage. Stop and report if the measured total would pass it. No SAM calls. Only network host: api.meta.ai.
- Never tune the prompt, options or thresholds on a named bridge or on the hindcast result.
- If MODEL_API_KEY is missing or the API returns 401, stop and print what is missing.
- Do not create git commits. Do not install packages. Rubric outputs must stay byte-identical.
- Update README.md: remove the "not run" status note once the gap is filled, and record the clean-versus-leaked result for the four rows.
- Finish with: files changed, the before/after table for the four rows, the projected and measured cost, the full 33-cutoff agreement table, the high-versus-escalate analysis, the self-test and traceability results, and the Verdict, Action list and Model and rubric sections of both memos.
