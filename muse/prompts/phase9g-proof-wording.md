Phase 9g: the proof scene states the objection and answers it. The first story's proof scene (scene "the-proof" in `web/story.js`, the `#sceneProof` panel in `web/index.html`) captions the leak-free test as "The future was deleted and everything re-run. Nothing changed.", which viewers read as a riddle. Story II now puts the objection on screen in a judge's words and answers it with the result named; this phase gives the first story the same wording so the two stories and the page do not contradict each other. Only `web/story.js`, `web/index.html` and docs/history.md change; no behaviour changes.

## Captions (`web/story.js`, the `the-proof` scene)
Replace the two captions with:
- `{ text: "Built after the collapse. Did the model peek at what came later?", at: 0.5, hold: 4.6 }`
- `{ text: "No. Every month was re-run with the later months deleted. Carolabrücke still comes out first.", at: 5.4, hold: 5.0 }`
The scene's `duration: D(10, 9.5)` becomes `D(11, 10.5)` so the second caption ends before the scene does (0.5 + 4.6 and 5.4 + 5.0 under the reading-time rule). Check that the scene's `waitFor` and the next scene's start follow the duration automatically (they are computed from the scene list) and that the story's chapter ticks on the scrub line still place correctly.

## Panel wording
- `web/index.html`, `#sceneProof`: the two column headings `<h4>full run</h4>` and `<h4>future deleted</h4>` become `<h4>all data</h4>` and `<h4>later months deleted</h4>` (keep the lower case the stylesheet uppercases).
- `web/story.js`: the foot line `Same high bridges in ${n} of ${m} months` becomes `Checklist and model: same high bridges, ${n} of ${m} months`. If the panel's generated title (`sceneProofTitle`) or any other label in the proof scene uses "leak-free" or "future deleted", reword to "scored without hindsight" and "later months deleted"; report what you found.
- The Explore memo panel renders the audit memos from `web/data/memos/`, which are model output; do not edit them.

## Documentation
docs/history.md: append a "Phase 9g" entry in the style of the others: what the captions said, what they say now and why (the objection first, then the test and the named result), the panel headings, and what was verified.

## Verify
Serve `web/` with `python3 -m http.server 8137`. In Chrome at 1280 × 720 hard-reloaded with the cache disabled, load `http://localhost:8137/?story=1`, press Play, and capture the proof scene at about 2 s and 8 s into it (use the story's seek if it exposes one; otherwise let it play): the panel shows ALL DATA and LATER MONTHS DELETED with the numbers, the foot line names the checklist, and the two captions read as above with the second one fully on screen before the scene ends. Confirm the story still plays to its ending and the scrub ticks are unchanged in count. All `node tests/test_*.js` pass (update any test that pins the old caption text, and say so). Finish with `git status --short`: only the three files above may change.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only for the page's own script hosts and tiles when you open it; no installs, no commits, no git commands that change anything, no background jobs, no `&`. Call the build steps "phases". Do not mention any build tool other than Muse Code anywhere in the repository.
