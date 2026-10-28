Phase 4c: test whether bridge names and dates influence the model. Read docs/gotchas.md entry "A famous name is a hindsight leak" and SPEC.md section 5.0 first.

The model input built by radartwin/decide/model.py contains the bridge name (for example "Carolabrücke") and the cutoff date. A model trained after September 2024 may know that Carolabrücke collapsed then, so its answers could come from memory rather than from the radar features.

1. Add an anonymised input mode to build_model_input. In it, `asset` is replaced by a stable id that reveals nothing ("bridge 01" ... "bridge 19", assigned by a fixed order that does not depend on risk, for example sorted by OSM asset id), and the `cutoff` date is removed. Everything else stays identical. Anonymised and named inputs must hash to different cache keys. Keep the named mode as the default for now; do not change existing results or files. Add a test that the anonymised input contains no bridge name, no date and no other field that differs from the named input apart from those two.

2. Sensitivity check on the three months that matter for the hindcast: 2023-10-01, 2024-08-01 and 2024-09-01. Run all analysed bridges in anonymised mode with the same 5 votes per question. Write out/name_sensitivity.csv with, per bridge and month: named risk, anonymised risk, named p_high, anonymised p_high, named p_risk, anonymised p_risk, and whether the risk level changed.

3. Noise baseline. With 5 votes at temperature 1, some differences are chance. For 2024-09-01 only, draw a second, independent set of 5 named votes per bridge (use different sample indices so the cache does not return the old ones) and report how often the named risk level changes between the two named draws. Compare that rate with the named-versus-anonymised change rate.

4. Report plainly: how many risk levels changed with anonymisation, which bridges, whether Carolabrücke's risk or p_high changed in any of the three months, and whether the change rate exceeds the noise baseline. Do not tune anything to make the results agree.

5. Add `.DS_Store` to .gitignore.

Rules:
- Muse Spark spend under $1.20, measured from token usage; print the projected cost from fresh calls before spending. No SAM calls. Only network host: api.meta.ai.
- Call the build steps "phases", not "stages".
- If MODEL_API_KEY is missing or the API returns 401, stop and print what is missing.
- Do not create git commits. Do not install packages. Rubric outputs and existing model decision files must stay byte-identical.
- Add the result to README.md's "Muse Spark notes" in two or three sentences, and update the gotchas entry with what was found.
- Finish with: files changed, the projected and measured cost, the full name_sensitivity table, the noise baseline, Carolabrücke's named versus anonymised risk and p_high in the three months, and your plain conclusion.
