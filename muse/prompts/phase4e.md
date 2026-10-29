Phase 4e: make the leak-free pipeline the only default, rerun the Muse Spark decisions on it, and promote it to out/. Read SPEC.md 3.5 (whole-period columns banned, truncation invariance), 5.0, and out/leakfree/comparison.md, and docs/gotchas.md ("A precomputed velocity is a whole-period number"), before writing code.

1. Leak-free by default; the whole-period path only on explicit request.
   - scripts/rank_city.py and scripts/decisions.py default to leak-free. `--use-egms` remains, only for the baseline reproduction; `--leakfree` may stay as a no-op alias.
   - radartwin/decide/features.py must raise a clear error when the state has no per-cutoff velocity table, unless `use_egms_columns=True` is passed explicitly. Remove the silent fallback to `mean_velocity`.
   - radartwin/analytics/retro.py `span_meta` must raise when `point_coherence` is missing, unless `use_egms_columns=True` is passed explicitly.
   - Add tests in tests/test_leakfree.py that each of these raises, and that the explicit baseline switch still reproduces the old numbers.

2. Archive the whole-period results.
   - Move every out/ file derived from the old state into out/baseline_whole_period/, keeping file names: dresden_state.pkl, the dresden_*.csv files and the ranking png, decisions_*.csv, model_decisions_*.csv, escalation_counts.csv, model_agreement.csv, model_disagreements.csv, hazards_*.geojson, memo_*.md, audit_*_tools.json, name_sensitivity.csv and name_noise_baseline.csv.
   - Leave out/cache, out/leakfree and the sam_* files where they are.
   - Print the list of moved files.

3. Rebuild in out/ with the leak-free defaults.
   - Run rank_city.py, then decisions.py all (rubric only).
   - Confirm the rubric decisions equal out/leakfree/decisions_<cutoff>.csv for all 33 cutoffs.

4. Model rerun with a hard spend cap of $8.00.
   - Run decisions.py --model 2024-09-01 first and print its actual cost. If 33 times that cost would exceed $8.00, stop and report; do not run the rest.
   - Otherwise run decisions.py --model all. Stop at once if cumulative spend passes $8.00, and report how far it got.
   - Model inputs stay whitelisted exactly as in phase 4 (no rubric verdicts, owner fields or names). Do not change prompts, votes, temperature or questions.

5. Regenerate the hazard layers for 2023-10-01 and 2024-09-01 with `write_hazard_layer_file`, which needs no API call. Do not run the audit agent: the memos stay archived, and the audit is rerun in a later phase.

6. Re-export the web data with scripts/export_web.py; it must cope with no memos in out/. Then run scripts/check_web_data.py and its --self-test, scripts/check_truncation.py and its --self-test, and the tests in tests/ (run them directly if pytest is not available).

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure.
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running; stop any server you started. Do not use `&` in shell commands.
- Report, do not tune: if the model disagrees with the rubric or Carolabrücke's result weakens, say so with the numbers. Do not change thresholds, windows, SHRINK_K, the ladder or the model questions.
- Spend: Meta API Muse Spark calls only, hard cap $8.00 for this phase; no SAM calls. Allowed network host: the Meta Model API only. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with:
- files created, changed and moved;
- the step 3 equality result;
- the actual model cost, with the 2024-09-01 smoke cost and the total;
- model vs rubric agreement on risk level across all bridge-months, and every disagreement at 2023-10-01, 2024-08-01 and 2024-09-01;
- for every cutoff, the bridges the model rates high;
- for Carolabrücke and Budapester Straße at 2023-10-01, 2024-08-01 and 2024-09-01: rank, z, model risk and p_high, and rubric risk;
- the results of every check and self-test in step 6;
- your self-review answers (a) to (d).
