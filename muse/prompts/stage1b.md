Stage 1b: finish stage 1. The analytics modules and scripts/rank_city.py already exist and have been corrected to the current SPEC.md (re-read SPEC.md section 3 now; the validation targets and two pinned behaviours were updated since your first run). The reference/ folder was regenerated from an independent implementation and must not be modified.

Do exactly this:

1. Run `uv run python scripts/rank_city.py carola`.
2. Validate against reference/ and print a comparison table: analysed bridges (19), scatterers on bridges (3,700), Carolabrücke scatterers (61) and tracks (3); Carolabrücke score rank at 2023-10-01, 2024-06-01, 2024-08-01, 2024-09-01 must be 1, 10, 3, 1; its z at those cutoffs must be within 0.05 of 2.47, 0.50, 2.83, 4.24; max |score difference| versus reference/dresden_scores.csv over every bridge and cutoff must be below 0.05.
3. If any check fails, diagnose the cause in the implementation and fix it. Do not edit reference/ and do not loosen a target. Do not change the tie-break in assign_spans (ties go to the lower span id) or the per-track epoch handling (each track's own epochs only).
4. Write README.md: one paragraph on what RadarTwin is (take it from docs/idea.md), setup (uv sync, .env with MODEL_API_KEY and TYPESAFE_API_KEY), how to run scripts/rank_city.py, and what the out/ files contain. Mention that the pipeline reproduces an independent implementation to < 0.05 mm/yr.
5. Remove __pycache__ directories from the tree and make sure .gitignore covers them.
6. Do not create git commits. Finish with the validation table and a list of files changed.
