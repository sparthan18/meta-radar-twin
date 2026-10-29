Phase 5e fix 2: one alignment defect seen at the collapse moment at 1280×800. Change only web/index.html; touch only the desktop branch of the side-panel scroll in `selectBridge`.

Measured: after selecting Carolabrücke at the last cutoff, `#side.scrollTop` is 1014 and the panel shows the detail from "long-term vel." downward; the heading, rank and score are above the top edge. The current rule scrolls just enough to bring the detail's bottom into view, which, for a detail taller than the panel, hides its top.

Fix: when the detail is taller than the side panel, or its top is above the panel's top, align the detail's top to the panel's top (minus the panel's padding); only when the detail fits entirely and is below the fold scroll by the bottom overflow. The phone branch (`scrollIntoView` at ≤ 700 px) stays as it is.

Prove it from the arithmetic: for a detail of height H in a panel of height P with the detail starting at offset D, give the resulting scrollTop for H > P and for H ≤ P. The reviewer will measure `#side.scrollTop` and the heading's position after the collapse moment.

Standing rules: no spend, no network, no installs, no commits, no background jobs, no `&`. Do not change wording, thresholds or data. Call the build steps "phases". Finish with the diff and the arithmetic.
