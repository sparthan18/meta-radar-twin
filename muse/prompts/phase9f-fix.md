Phase 9f-fix: the high-risk pill reaches 4.5:1. Phase 9f found that the README's claim "risk pills at 4.5:1 contrast or better" was false for the high pill (white on the risk red, 3.53:1) and lowered the claim to 3.5:1. This phase fixes the pill instead and restores the claim. Only `web/index.html`, README.md and docs/history.md change.

## Change, in the inline CSS of `web/index.html`
The rule `.pill.high { background: var(--risk-high); color: #fff; }` becomes `.pill.high { background: var(--risk-high); color: #0b1220; }`. That is the page's `--bg-2` navy, the same family as the `.pill.unknown` text, and it measures 5.3:1 on the risk red (the watch and elevated pills already use dark text on their colours). Nothing else in the page changes; in particular the red "inspect" flag beside the pill, the headline and the brand link stay as they are.

## README.md
In the web paragraph, "risk pills at 3.5:1 contrast or better" goes back to "risk pills at 4.5:1 contrast or better".

## docs/history.md
Append one sentence to the Phase 9f entry (no new heading): "The high-risk pill's text is now the page's navy instead of white, 5.3:1 on the risk red, so the pills' 4.5:1 claim holds again."

## Verify
Serve `web/` with `python3 -m http.server 8137`, load `http://localhost:8137/` in Chrome at 1280 × 720 hard-reloaded with the cache disabled, read the computed `color` and `background-color` of the first `.pill.high` in the ranking, compute the WCAG contrast ratio from those values and report it (expected about 5.3). Capture the ranking's first rows so the HIGH pill reads clearly as dark text on red. Confirm the lowest ratio across the five pill classes is now at least 4.5. All `node tests/test_*.js` pass. Finish with `git status --short`: only the three files above may change.

Standing rules: do not use jg/jevgrep or any tool that sends code to an external service; no spend; network only for the page's own script hosts and tiles when you open it; no installs, no commits, no git commands that change anything, no background jobs, no `&`. Call the build steps "phases". Do not mention any build tool other than Muse Code anywhere in the repository.
