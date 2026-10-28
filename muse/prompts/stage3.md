Stage 3: deterministic rubric with escalation, per-asset features, and the Muse Spark audit agent that writes the engineering memo and hazard layer. Read SPEC.md sections 3.6, 4, 6.2, 7 and 8, docs/idea.md and docs/gotchas.md before writing code. SPEC section 7 changed since stage 2: the fidelity guardrail is now two questions and never excludes an asset. Stages 1 and 2 are validated; do not modify their modules except to fix a bug you can demonstrate with a failing command.

Change from the spec: the TypeSafe decision model is dropped. Do NOT implement decide/jev.py and do not add typesafe dependencies. Until an open-weight decision model replaces it, risk decisions come from the deterministic rubric below. Keep the decision schema (pattern, risk_level, needs_inspection) so a model can be slotted in later behind the same function.

0. radartwin/agents/fidelity.py: keep `backscatter_fidelity` and add, per SPEC 7, `outline_check(sam_polys, osm_polys)` (outline_iou, outline_mismatch) and `radar_visibility(state, s1_rtc_vv=None)` returning points_per_ha, bright_fraction (null for assets outside the radar chip) and radar_coverage for every analysed bridge. Print the table for all bridges with the city median points_per_ha and which bridges are "low". Augustusbrücke is expected to be low and Carolabrücke ok; if not, report it, do not tune the rule.

1. radartwin/decide/features.py: `asset_features(state, cutoff) -> pd.DataFrame` producing exactly the fields in SPEC 3.6 for every analysed bridge at a cutoff, reading out/dresden_state.pkl. `condition` comes from `SITES[site].condition`, default "unknown". City p80 values are computed across the bridges at that cutoff. Include points_per_ha, bright_fraction and radar_coverage from step 0.

2. radartwin/decide/rubric.py per SPEC 4: `flags(features) -> dict[str, bool]` (moving, accelerating, differential, outlier, low_quality, low_coverage) plus `escalate` and `immediate`. Then an interim deterministic decision `decide(features, flags) -> dict` with:
   - pattern: "unreliable" if low_quality; else "differential" if differential; else "accelerating" if accelerating; else "uniform_settlement" if moving; else "stable".
   - risk_level: "immediate" if immediate; "high" if escalate; "elevated" if (accelerating and differential) or outlier; "watch" if any of moving, accelerating, differential; else "none". If low_quality or low_coverage, cap at "watch".
   - needs_inspection: risk_level in {"high", "immediate"}.
   - source: "rubric" (so a future model decision can be distinguished).
   Write the rules in the module docstring as general engineering principles, not tuned to any bridge.

3. scripts/decisions.py <cutoff|all>: features + flags + decision for every bridge, print the table, write out/decisions_<cutoff>.csv. With "all", run every cutoff and also write out/escalation_counts.csv (cutoff, n_bridges, n_escalate, n_immediate, carola_risk). Run it with "all" and print the counts table. Report how many bridges escalate at each cutoff; if escalate fires on more than a quarter of bridges at most cutoffs, say so plainly.

4. radartwin/agents/llm.py: Muse Spark adapter using the openai SDK, base_url https://api.meta.ai/v1, MODEL_API_KEY from .env, model from env RADARTWIN_LLM defaulting to "muse-spark-1.3". Use standard tool calling (Chat Completions `tools`), not a framework.

5. radartwin/agents/audit.py: a tool-calling audit agent over the deterministic functions only: list_assets(cutoff), get_asset_features(asset, cutoff), get_span_series(asset), get_decision(asset, cutoff), radar_visibility(asset) (points_per_ha, bright_fraction, radar_coverage from step 0), write_hazard_layer(assets). System prompt: the agent narrates and never computes or invents numbers; every number in the memo must come from a tool result; it must state the EGMS latency caveat (SPEC 2.1) and data-quality limits; it must say decisions currently come from a deterministic rubric; and for every low_coverage bridge it must say radar sees little of that structure, so it needs another inspection method, and that this is not a sign the bridge is safe. Cap the loop at 25 tool calls.

6. radartwin/agents/sitrep.py + scripts/audit.py <cutoff>: run the agent and write out/memo_<cutoff>.md and out/hazards_<cutoff>.geojson (bridge polygons with features, flags and decision as properties). Run it for 2024-09-01 and 2023-10-01 only.

7. Verify the memo: write a small check that extracts every number from each memo and confirms it appears in the tool results the agent received (log them to out/audit_<cutoff>_tools.json). Print any number that does not trace back. Fix the prompt if there are untraceable numbers and re-run once.

Rules:
- Total Muse Spark spend for this stage should stay under $3: at most two audit runs per cutoff.
- If MODEL_API_KEY is missing or the API returns 401, stop and print what is missing.
- Do not create git commits.
- Update README.md: add run instructions for scripts/decisions.py and scripts/audit.py, and a short "Decisions" section saying the rubric is interim and model-backed decisions are planned.
- Finish with: files created, the escalation counts table, Carola's decision at 2023-10-01, 2024-08-01 and 2024-09-01, the untraceable-number check result, and the first 40 lines of the 2024-09-01 memo.
