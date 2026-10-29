# RadarTwin design specification — cinematic FUI

The web app is a film's on-screen interface: the kind of diegetic display a big-budget film shows when a character looks at a city from orbit. Everything on screen is drawn as if a system were rendering it live: hairlines, brackets, reticles, monospaced readouts, light that falls off, a little grain. Nothing looks like a web page. This spec is the visual contract for every phase from 8a on; `docs/story-spec.md` remains the content contract. Where the two conflict, the story spec wins on *what* is shown and this spec wins on *how*.

Acceptance for every phase is a set of full-size frames (1920×1080 and 1280×800) sent to the owner for a verdict by eye. DOM probes confirm behaviour; they never sign off a look.

## 1. Direction in one paragraph

Near-black blue frame. A city seen from above at night, graded cold, with buildings standing up in 3D under a tilted camera. Thin luminous lines: hairline rules, corner brackets, dashed reticle rings that rotate slowly, leader lines that draw themselves. Text in two voices: a tall condensed display face for titles and the month wordmark, and a monospaced face for every number and label, set in uppercase with wide tracking. One accent: the project's red for `high`; everything else cool, desaturated, quiet. Film qualities on top of the map: vignette, fine grain, a soft bloom on light sources, letterbox bars in story mode. Motion is slow and deliberate; nothing pops, everything eases.

## 2. Typography

Fonts from Google Fonts (keyless), with system fallbacks, preloaded before the title shows (the director already waits on `document.fonts.ready`):

- **Display:** Rajdhani 500/600/700. Titles, the month wordmark, scene headlines, the worry words. Uppercase for anything under 24 px, tracking 0.08–0.14 em; sentence case for the headline card and captions.
- **Data:** JetBrains Mono 400/500. Every number, label, unit, readout, the HUD block, chapter names, the scrub readout. Tabular numerals always. Labels uppercase, tracking 0.12 em, 11–12 px.
- **Reading:** Inter 400/500 for memo text and Explore paragraphs only.

Scale (desktop; phone at 0.75×): 11 · 12 · 14 · 18 · 24 · 32 · 48 · 72 · 112 · 160 px. The month wordmark in scene 4 is 112 px (Rajdhani 600, uppercase); the landing title is 160 px; captions are 32 px Rajdhani 500 sentence case; the headline card 24/14; HUD 12 px mono.

Line height 1.1 for display, 1.4 for mono blocks, 1.55 for reading. No text is ever default `system-ui`.

## 3. Colour

Tokens (dark-first; this interface is single-theme, by design):

| token | value | use |
|---|---|---|
| `--bg` | `#070b14` | frame, letterbox bars, page |
| `--bg-2` | `#0b1220` | panels (at 0.72 alpha with 12 px backdrop blur) |
| `--line` | `#8fb8ff` at 0.28 | hairlines, brackets, rings, grid |
| `--line-strong` | `#bfd6ff` at 0.6 | active hairlines, leader lines |
| `--text` | `#e6eefc` | primary text |
| `--text-dim` | `#8ea3c7` | labels, secondary |
| `--accent` | `#ff3b3b` | high risk, the collapse badge, the one warm note |
| `--amber` | `#f2b84b` | watch |
| `--orange` | `#ff7a2f` | elevated |
| `--none` | `#3b4760` | none |
| `--sam` | `#5ee7ff` | SAM outline only |
| `--glow` | `#ff3b3b` at 0.35 | emissive halos |

No pure grey anywhere; every neutral carries the blue bias. The span scale stays blue → white → red (`#2166ac` → `#f7f7f7` → `#b2182b`) because it is the data's own scale; the white is warmed slightly to `#f3f0ea` so it doesn't glare.

## 4. The map

- **Basemap:** OpenFreeMap vector tiles (keyless; `https://tiles.openfreemap.org/styles/dark` as the starting style, `openmaptiles` source, glyphs from the same host), restyled to this palette: background `--bg`, water `#0a1a33`, land `#0b1220`, roads as hairlines in `--line` at 0.15–0.35 by class, rail dashed, place labels in JetBrains Mono uppercase 11 px `--text-dim`, parks `#0d1a1f`. Keep only the layers that read at night: water, buildings, major roads, rail, labels. Esri imagery stays as Explore's "Imagery" option and for the Sentinel chip close-ups; the Esri dark canvas goes.
- **Buildings in 3D:** a `fill-extrusion` layer from the `building` source-layer (`render_height`, `render_min_height`), so the tilted city has volume. Craft rules, because flat grey prisms read as cheap: the style's `light` anchored to the map at a low elevation with soft intensity; colour graded by height (base `#0d1526`, top `#1b2740`), `fill-extrusion-vertical-gradient` on; opacity fading in across zoom 11.5–12.5 (never popping), full by 12.5; a minimum height of 4 m and a cap at 60 m so unmapped buildings look plausible without inventing landmarks; the director's tile wait runs before any tilt so a scene never starts with half the city missing. Extrusions only over the vector base, never over imagery.
- **The close-up base:** scenes 5 and 6 use the vector style with the extruded city, not the satellite photo; a drawn deck over a photograph looks pasted on. The bridge deck (7d) sits on its piers at true height with its tilt, lit like the prisms; the span exaggeration lives in the labelled side-view panel. The satellite photo appears in scene 7 only, as the evidence SAM looked at, and in Explore's Imagery option.
- **Light and film:** a radial vignette (transparent centre → `--bg` at 0.65 at the corners) and a 3 % animated grain overlay on the map container, both `pointer-events: none`; a soft bloom under high markers (the 7b glow, widened); the water gets a faint specular gradient. Letterbox bars (8 % top and bottom) in story mode; none in Explore.
- **Bridge footprints at city zoom:** the polygon fills drop to 0.12 opacity over the vector base so the reticle marker, not a pale pill, carries the colour; the fill brightens only in the close-up.
- **Labels:** at zoom ≤ 12.5 only district names (`place` class `suburb` and `city`, rank ≤ 2), at most ~15 on screen, hidden entirely at pitch ≥ 50 in story scenes 1 and 4 where they compete with callouts; street names never.
- **Markers:** replace the white-rimmed circles with a reticle: a 2 px dot, a 14 px hairline ring, and for `high` a second dashed ring rotating at 6°/s plus the glow. Span dots stay but lose the white rim: a 1 px `--line-strong` edge.
- **Camera:** every move eases with `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-expo feel) over 1.6–2.4 s; orbits are linear; no `jumpTo` while a scene plays except for seeks.

## 5. FUI components

All drawn in CSS/SVG, shared by story and Explore:

- **Bracket frame:** four 12 px corner brackets in `--line`, 1 px, on every panel, card and the HUD block; no full borders, no border-radius above 2 px.
- **Hairline rules** with a 6 px tick at each end; section titles sit on a rule.
- **Readout:** a label (mono, uppercase, dim) over a value (mono, 18–32 px, tabular); values count up when they first appear (600 ms).
- **Reticle ring:** dashed circle, 1 px, slow rotation; two concentric for the selected bridge (7d rings restyled to this).
- **Leader line:** 1 px `--line-strong`, draws over 600 ms, ends in a 3 px dot and a bracketed label.
- **Scan line:** a single faint horizontal line sweeping the map once per scene start (2 s), 2 % opacity; never continuous.
- **Lower-third caption:** text on a bottom gradient (`--bg` 0.85 → 0) with a hairline above, 32 px Rajdhani, 2-line max, fades 300 ms in, 240 ms out; a small mono scene index right-aligned above it ("04 / 09").
- **Month wordmark:** scene 4 only, 112 px Rajdhani uppercase, top-right, the month name over the year, tabular; changes with a 150 ms crossfade per month.
- **Headline card:** bracket frame, 24 px display sentence-case line, 14 px mono reason; top-left under the letterbox.
- **History strip:** cells 10 × 10 px with 2 px gaps, no card, no scrollbar; row labels 11 px mono uppercase; a 1 px `--line-strong` playhead; sits along the bottom edge above the caption in scene 4, full width.
- **Buttons:** mono uppercase 12 px, tracking 0.14 em, a 1 px hairline underline that brightens on hover; the landing Play is a 72 px ring with a triangle and the word PLAY beneath; no filled rectangles.
- **Scrub line:** story mode's only chrome: a 1 px line across the bottom edge with nine 6 px ticks, the playhead as a 2 px bright segment, chapter name in mono on hover; the month readout (mono 14 px) at the right end; CC and Explore as mono words at the left end. Nothing else from the dashboard is visible in story mode: no header, blurb, toggles, slider row or map controls.

## 6. Motion

- One easing family: `cubic-bezier(0.22, 1, 0.36, 1)` for reveals and camera, linear for orbits and counters, `cubic-bezier(0.4, 0, 1, 1)` only for exits.
- Durations: 240 ms (micro), 400 ms (element), 800 ms (panel), 1600–2400 ms (camera), 4000 ms (hold).
- Scene transitions: a 600 ms crossfade of overlays plus the camera move; the map never cuts to black between scenes except into scene 2 and scene 8, which dip to `--bg` over 500 ms and back.
- Reveals are staggered 60–90 ms per element in reading order; lines draw before their labels appear.
- Reduced motion: no grain, no scan line, no ring rotation, crossfades of 120 ms, counters at final values; content identical.

## 7. Explore

Same language, denser: the side panel becomes a column of bracket-framed cards on `--bg-2` glass; the ranking rows are hairline-separated with the worry word in display face and the score in mono; the detail opens with the bridge name at 32 px display, the readouts as label-over-value pairs, the side view and the engineers' disclosure beneath; the memo panel is a glass sheet with Inter text. The toggles become mono words with underline states. The month slider keeps its 40 px thumb but is drawn as a hairline track with month ticks.

## 8. Landing and ending

- **Landing:** letterboxed night city at pitch 55 with 3D buildings, slow orbit; the title "RADARTWIN" at 160 px display with "DRESDEN · 2022 – 2024" in mono beneath, the Play ring centred low, a one-line mono tagline. A 1.2 s preloader on `--bg` with the title drawing in as a hairline outline, so fonts and tiles are ready before the first frame.
- **Ending:** full-bleed `--bg` card over the Europe pull-out: the date rolling in 112 px mono, "Carolabrücke collapsed." in display, "The data flagged it first." beneath, REPLAY and EXPLORE as mono words.

## 9. Phases

- **8a Foundations:** fonts and tokens; story mode hides all dashboard chrome and adds letterbox, scrub line, lower-third and scene index; the vector basemap with 3D buildings, vignette, grain, reticle markers; the shared FUI components (brackets, rules, readout, leader line, ring) as CSS/SVG primitives. Scenes keep their content; they inherit the new primitives.
- **8b Scenes 1–4 composition:** landing with preloader, title, scene 2 explainer restyled as a drawn FUI diagram, scene 3 labels as bracketed callouts, scene 4 month wordmark, headline card and strip along the bottom.
- **8c Scenes 5–9 composition:** the close-up with the restyled rings, HUD and deck; report and proof panels as glass cards; the ending card; the Europe outro.
- **8d Explore and phone:** the dashboard in the same language; phone layouts for story and Explore.

Each phase ends with full-size frames of every affected scene for review by eye.
