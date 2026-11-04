# RadarTwin story mode — scene specification

**Status (5 Nov):** the story specified here was built in phases 7 and 8 and retired from the page in phase 9d: the page now opens in Explore, and the one story entry on it is the documentary at `web/story2/`, which has its own nine chapters. The code of this story is still in `web/story.js`. The layer labels named below were renamed in phases 9d and 9e (Tracked points, SAM outline, Radar chip S-1, Memo), and the proof scene's captions and column headings changed in phase 9g (all data / later months deleted). This file is kept as the record of what was built, not as a description of the page.

The web map opens in **Story mode**: a dark city, one Play button, and a nine-scene piece that plays out on the page itself. **Explore mode** is the dashboard built in phases 5a–5e, one click away from any scene, bound to the same month. Voice is neutral ("the system", "the data"), never "we".

Every scene is bound to one cutoff and reads only that cutoff's decisions, spans and memo. The director refuses to bind a scene to a cutoff later than the replay's current position. Only the camera, the overlays and the captions move; the data on screen is the month's data. This is the phase 5a rule and it is not negotiable.

## Modes

- **Story** (landing view): map at pitch 55, dark basemap, side panel hidden, a centred Play button and the title. Pressing Play runs scenes 1–9. Space pauses and resumes, arrow keys step scenes, Escape opens Explore at the current month. A scrub bar replaces the month slider while a scene plays: chapter marks for the nine scenes, the months ticking under it during scene 4.
- **Explore** (the dashboard): everything from phases 5a–5e, plus the history strip and the headline card from story mode. A "Watch the story" button returns to Story at scene 1, or resumes if the story was paused.
- **Engineers' details**: wmax, wspread, z, the vote bars and the chart live under a disclosure in the detail panel, closed by default. The memo text and the plain-language reason are the panel's main text.

## Director rules

- A scene is `{id, cutoff, camera, layers, overlay, captions[], duration, waitFor[]}`. `waitFor` lists what must be ready before the scene starts: tiles idle, memo fetched, fonts loaded, three.js model built. Each wait has a 4 s timeout; on timeout the scene cuts instead of flying and continues.
- Captions are lower-thirds, 32–36 px, one or two lines, each with `at` (seconds into the scene) and `hold`. A live region announces each caption once.
- Under `prefers-reduced-motion`: cuts instead of flights and orbits, no stroke-draw or counter animations, captions and content identical, durations shortened to the caption holds.
- Any data in a caption (counts, ranks, z, dates, bridge names) is computed from the bound cutoff at run time. The only authored facts are the sentences and the collapse date, which comes from `decisions.json` (`event_date`, `event_asset`).
- Interaction while playing: hovering or tapping a bridge shows a name label with its level; clicking it pauses and opens Explore on that bridge at the current month.

## Scenes

| # | id | cutoff | camera | layers | overlay | captions (data in braces computed) | duration |
|---|---|---|---|---|---|---|---|
| 1 | title | last | city, pitch 55, slow orbit 0.5°/s | dark, markers | title block | "Dresden, {event_date formatted}. A bridge fell into the Elbe." / "The warning had been visible from orbit for a year." | 9 s |
| 2 | how-radar-sees | first | hold | none (overlay covers map) | SVG explainer: satellite, pulses, a kerb, echo delay, counter "+1.0 mm" | "Satellites bounce radio waves off the ground every few days." / "Compare the echoes and a kerb that moved one millimetre shows up." / "Europe publishes this for every bridge. RadarTwin looks every month." | 16 s |
| 3 | twenty-bridges | first | pull back to zoom 12, pitch 40 | dark, markers | name labels fade in one by one, then out | "{n_bridges} bridges in Dresden. {n_monitored} the satellite can see; {n_not} it cannot." | 10 s |
| 4 | three-years | first → last | pitch 40, slow drift | dark, markers, glow, callouts | headline card per month; history strip filling; callout on first yellow, first orange, first red | headline card text per month: "{Month YYYY} — {sentence from rubric reason or 'nothing unusual'}" | 33 × 0.7 s + holds ≈ 30 s |
| 5 | august | 2024-08-01 | fly to Carolabrücke, zoom 15, pitch 60 | imagery, spans, 3D deck | deck rises; span callout | "{Month YYYY}. {n_high} bridges flagged." / "This one is moving at both ends." | 10 s |
| 6 | september | last | one step; orbit 20° | imagery, spans, 3D deck, glow once | rank and z count up in the HUD card (no floating counter); leader line to the fastest span "{v} mm/yr" | "{Month YYYY}. The only red bridge in the city." / "Faster than anything in its own record. One end rising, the next span sinking." | 12 s |
| 7 | the-report | last | hold, slight push-in | dark city, deck, SAM outline | memo in the right side panel types in; one sentence highlighted; evidence card (Sentinel-2 chip + SAM outline) top-left | "Muse Spark read the numbers and wrote the inspection memo." / "SAM 3.1 found the bridge in the satellite photo." / "Built with Muse Code." | 14 s |
| 8 | the-proof | last | hold, city dimmed to 45 % | dark city, deck | proof in the right side panel: full run vs future-deleted run; values settle identical; check mark | "The future was deleted and everything re-run. Nothing changed." / "An engineering checklist and the model agree on every red bridge." | 10 s |
| 9 | ten-days-later | last | pull back to 12.3/40; then Europe 3.8 | dark city, reticles (no SAM, no radar chip) | date rolls {cutoff} → {event_date} in the upper third; Carolabrücke's reticle turns red with one pulse; Europe EGMS coverage lights up with collision-free labels; then the full-bleed ending sheet with REPLAY and EXPLORE THIS MONTH | "{days} days later, {event_asset} collapsed." / "The data flagged it first." / "Every bridge in Europe already has this data." | 14 s |

Scene 8's numbers come from a small JSON the truncation check writes (`web/data/proof.json`: per quantity, full vs truncated value at the last cutoff, and the agreement count); the exporter copies it. Scene 9's Europe map is a static simplified GeoJSON of EGMS coverage (country outlines), no new data download.

## Explore additions (permanent, not story-only)

- **Headline card** at the top: "{Month YYYY} — {bridge} needs an inspector." with the plain-language reason; "nothing unusual" months say so.
- **Worry scale** replaces the legend: fine · keep watching · look closer · send an inspector, technical names in small print.
- **History strip** under the slider: one row per bridge, one cell per month, risk-coloured; click a cell to jump.
- **Callouts** on the map for red bridges: name and "inspect", with a leader line.
- **Bridge view** in the detail panel: the 3D deck (three.js) or, until it exists, an SVG side view of the spans displaced by the month's anomaly, exaggeration labelled.
- **Plain labels** with the technical term as a tooltip: wmax → "biggest section movement", wspread → "how unevenly the sections move", z → "compared with this bridge's own past", scatterers → "points the satellite can track", spans → "sections", escalations → "times it set off the alarm this year".
- **Layer buttons renamed:** Tracked points, AI outline (SAM), Satellite view (radar), Report (memo).

## Libraries

GSAP 3 (timeline, scrubbing, easing) and three.js (bridge deck as a MapLibre custom layer), both pinned exact versions from cdnjs. MapLibre stays at 4.7.1. Fonts from Google Fonts with system fallbacks. No build step.

## Phases

- **7a** director, modes, scrub bar with chapters, captions, headline card, Explore handoff; scenes 4 and 9 real, the others placeholders that show their captions.
- **7b** camera choreography, annotations layer, history strip, callouts, worry scale, plain labels, SVG bridge side view; scenes 3, 5, 6 real.
- **7c** scenes 2, 7, 8 (explainer, report, proof) and the Europe outro.
- **7d** three.js bridge deck in map coordinates, used by scenes 5–6 and by Explore.

Each phase leaves the page working end to end. If 7d slips, the SVG side view stands in and the story is still complete.
