Phase 5d fix: one layout defect found when the phase 5d page was tested in a 375 px wide browser. Change only web/index.html. Do not run export_web.py and do not touch web/data/ or out/.

The defect, measured: at 375 px the `.slider-wrap` row is 343 px wide and stays `flex-wrap: nowrap`. The "Month" label, the 10 px gaps, `#cutoffLabel` (min-width 7em = 98 px) and `#eventBadge` (170 px, space reserved even while hidden) use the whole row, so the range input computes to 0 px wide and the slider has no track.

Fix, inside the existing `@media (max-width: 700px)` block: let `.slider-wrap` wrap; give `#eventBadge` its own full-width line (`flex: 0 0 100%`) so its reserved space never competes with the slider, and so showing it changes nothing but its visibility; give the range input `flex: 1 1 150px` so it always has a track. The row must still not change size between a cutoff with the badge hidden and the Sep 2024 cutoff where it shows. Desktop widths (above 700 px) must be unchanged.

Prove it without a browser: show the final CSS of the 700 px block and explain why the input can no longer reach 0 px at 320, 375 and 700 px widths (sum the fixed widths). The reviewer will measure the slider in a real browser.

Standing rules: no spend, no network, no installs, no commits, no background jobs, no `&`. Call the build steps "phases". Finish with the CSS diff and the width arithmetic.
