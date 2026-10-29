Phase 4d: remove whole-period EGMS values from every per-cutoff quantity. Read SPEC.md section 3.5 (the new "Whole-period columns are banned" and "Truncation invariance" paragraphs, and the note under Validation) and 3.6, and docs/gotchas.md ("A precomputed velocity is a whole-period number"), before writing code.

The problem, in numbers already measured: `long_term_velocity_mm_yr` is the mean of the EGMS `mean_velocity` column, so it is identical at all 33 cutoffs (Carolabrücke −0.22 mm/yr) and contains epochs up to 2024-12-30. `span_meta` uses the EGMS `temporal_coherence` column for `n_eff`, which sets the shrinkage weight of every span at every cutoff. Setting all coherence to 1 as a rough probe moved Carolabrücke's z at 2023-10-01 from 2.47 to 3.43 and added Budapester Straße as a second escalation at 2024-08-01. The fix must use each cutoff's own past, not a constant.

This phase makes no Meta API calls. It does not change any file under out/ that exists today; all new outputs go to out/leakfree/.

1. Per-cutoff coherence and velocity per SPEC 3.5: for each point and cutoff, from that point's own-track epochs with date < cutoff (at least 24, else NaN and weight 0), compute the cutoff coherence γ from the `seasonal_fit` residuals with λ = 55.465 mm, and the long-term velocity with `linear_velocity` on the deseasoned series. Reuse radartwin/analytics/trends.py; do not write a second fitting routine. `span_meta` takes the cutoff and uses the cutoff coherence, so `n_eff` and the shrink weights can differ between cutoffs. `long_term_velocity_mm_yr` in the features becomes the mean of the per-point cutoff velocities. Keep an explicit switch that restores the EGMS columns, used only to reproduce the baseline in step 3.

2. Rebuild the rolling retrospective and features with the leak-free values, and run the deterministic rubric (no model) for all 33 cutoffs. Write out/leakfree/dresden_state.pkl, out/leakfree/decisions_<cutoff>.csv and out/leakfree/escalation_counts.csv.

3. Prove nothing else changed: with the switch set to the EGMS columns, the rebuild must reproduce the current out/dresden_state.pkl scores, z, wmax and wspread exactly (max abs difference 0) and the current out/decisions_<cutoff>.csv risk levels for every bridge and cutoff. Report the max difference.

4. scripts/check_truncation.py: the leak test from SPEC 3.5. For at least the cutoffs 2022-06-01, 2023-10-01, 2024-08-01 and 2024-09-01, delete every epoch column on or after the cutoff from the points, rerun the pipeline up to that cutoff, and assert every per-cutoff value for that cutoff (roll, score, z, wmax, wspread, velocity, coherence, flags, risk) is identical to the full run. It also asserts that no per-cutoff code path reads `mean_velocity`, `acceleration`, `seasonality`, `temporal_coherence`, `rmse_ts` or any `_std` column. Add `--self-test`: run once with the EGMS-column switch on and assert the check fails for both velocity and coherence, then once with a planted read of a post-cutoff epoch and assert it fails.

5. scripts/compare_leakfree.py prints and writes out/leakfree/comparison.md:
   - Carolabrücke rank and z at 2023-10-01, 2024-06-01, 2024-08-01 and 2024-09-01, whole-period baseline vs leak-free;
   - every bridge whose rubric risk changes at any cutoff (cutoff, old, new), and the count of changed bridge-months out of 627;
   - escalation counts per bridge, old vs new; which bridges escalate at 2024-08-01 and 2024-09-01, old vs new;
   - how many bridge-months have `moving` true, old vs new;
   - Pearson correlation between the cutoff coherence at the last epoch and the EGMS `temporal_coherence` column, over all bridge points.

6. Cost projection for the model rerun (phase 4e, not this phase): count how many model decisions (bridge × cutoff × question × vote) would miss the existing out/cache because their whitelisted model input changes, and multiply by the measured cost per call from phase 4's results. Show the input hash change count, the calls and the dollar estimate. Do not call the model.

Standing rules (every phase):
- Self-review before finishing, and report each item with how you verified it: (a) nothing shown or used for a cutoff comes from data after that cutoff; (b) no model input carries rubric verdicts, owner inputs or identifying names; (c) owner inputs appear only in their labelled place; (d) every check you add catches a planted failure.
- Run long jobs in the foreground and finish them before ending your turn. Never end your turn with a background job or a server still running; stop any server you started. Do not use `&` in shell commands.
- Report, do not tune: if Carolabrücke's result weakens or another bridge joins it, say so with the numbers. Do not change thresholds, windows, SHRINK_K or the ladder.
- No spend this phase: no Meta API or SAM calls. No network needed. Do not install packages. Do not create git commits. Call the build steps "phases".

Finish with: files created or changed; the step 3 reproduction result; the check_truncation.py result and its self-test result; the full contents of out/leakfree/comparison.md; the phase 4e cost projection; and your self-review answers (a)–(d).
