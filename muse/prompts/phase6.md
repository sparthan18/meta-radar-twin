Phase 6: rerun the Muse Spark audit memos on the leak-free pipeline. Read SPEC.md 6.2 and 7, the `scripts/audit.py` docstring, and docs/gotchas.md ("## Muse Spark audit agent") before running anything. Do not change radartwin/agents/*, the agent's prompts, tools or budget, or any analytics code.

Why: out/ now holds the leak-free state and decisions (phase 4e). The two memos in out/baseline_whole_period/ quote the old whole-period numbers, so the web map has no memo yet.

1. Confirm before spending that `scripts/audit.py` reads only out/dresden_state.pkl and the leak-free decisions: grep radartwin/agents/ for `mean_velocity`, `temporal_coherence`, `acceleration`, `seasonality`, `rmse_ts` and `_std`; report the result. If any per-cutoff path reads one of them, stop and report; do not run the agent.

2. Run `uv run python scripts/audit.py 2023-10-01`, then `uv run python scripts/audit.py 2024-09-01`, in the foreground. After each, print the prompt and completion tokens from out/audit_<cutoff>_tools.json and the cost at $1.25 per million input and $4.25 per million output tokens. Hard cap $1.00 for the phase: if the first run costs more than $0.50, stop before the second and report.

3. Run `scripts/export_web.py`, then `scripts/check_web_data.py` and its `--self-test`, and `scripts/check_truncation.py`. `decisions.json` must now list both cutoffs in `memo_cutoffs`, and web/data/memos/ must hold exactly those two files.

4. Report, do not tune: for each memo, list the bridges in its action list with their risk, and the watch list, and whether the memo names Carolabrücke for 2024-09-01. Quote the verdict paragraph of each memo. Compare with the archived memo for the same cutoff in one or two sentences (what changed). Check that neither memo mentions token counts, prices or the tool budget (SPEC rule) and that the owner condition appears only where the SPEC allows.

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names beyond what SPEC 6.2 allows the audit agent; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure (none expected this phase; say so).
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running. Do not use `&` in shell commands.
- Spend: Meta API Muse Spark calls only, hard cap $1.00; no SAM calls. Allowed network host: the Meta Model API only. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files created and changed; the step 1 grep result; the token counts and cost per memo and in total; the step 4 lists and quotes; the results of every check in step 3; and your self-review answers (a) to (d).
