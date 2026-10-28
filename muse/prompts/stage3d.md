Stage 3d: keep owner inputs out of the memo's actions, and two small wording fixes. Read docs/gotchas.md entry "The agent can borrow conclusions from external inputs" first. Change only radartwin/agents/audit.py (system prompt and, if needed, how the condition source is presented), scripts/check_memo.py and README.md. The 19-bridge ranking and the decisions files must not change.

1. Actions cite radar evidence only. The 2024-09-01 memo says "inspect now and prioritise the tram section" for Carolabrücke. The only mention of a tram section in the tool results is the owner-condition source text, so the agent turned an external input into an action. Change the system prompt so the Verdict, the Action list (both "why" and "what to do") and the Evidence section use only radar-derived tool results. "What to do" may point inspectors at a part of the bridge only from span evidence, for example "focus on the span at the end moving up 3.99 mm/yr against its neighbours". Owner inputs appear only in the Owner condition section, labelled as external, with their source. Do not name sections, materials or components that appear only in owner-supplied text anywhere outside that section.

2. Add a check for it in scripts/check_memo.py: words that appear in any condition_source in the tool results but nowhere else in them (for example "tram", "renovation", "section") must not appear in the memo outside the Owner condition section. Report violations like untraceable numbers, and add a case to `--self-test` that plants "prioritise the tram section" in the Action list and asserts it is caught.

3. Whole numbers trace exactly. In traces(), a memo number without a decimal point must equal a tool-log number token or the integer part of an integer-valued tool number (61 matches 61 or 61.0); it may not match by rounding. Rounding tolerance applies only to memo numbers with decimals. Extend `--self-test` with an integer that is within 0.5 of a tool value but not equal to any, and assert it is caught.

4. Wording: when months since the last escalation is 0, the memo says "escalated this month", not "0.0 months ago". Format month counts as whole numbers.

Then re-run scripts/audit.py for 2024-09-01 and 2023-10-01 (at most two runs per cutoff) and scripts/check_memo.py --self-test and scripts/check_memo.py on both cutoffs.

Rules:
- Muse Spark spend under $1. No SAM calls. Only network host: api.meta.ai.
- If MODEL_API_KEY is missing or the API returns 401, stop and print what is missing.
- Do not create git commits. Do not install packages.
- Mention the owner-input rule in README.md's Decisions section in one sentence.
- Finish with: files changed, the self-test result, the traceability and owner-input check results for both memos, and the Verdict, Action list and Owner condition sections of both memos.
