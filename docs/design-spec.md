# RadarTwin design specification — cinematic FUI

**Status (5 Nov):** the design contract for phases 8a to 8c, kept as built. Since then: the Explore header became an instrument bar (phase 9e), the proof panel's columns read "ALL DATA" and "LATER MONTHS DELETED" and its title line "SCORED WITHOUT HINDSIGHT" (phase 9g), the story of phases 7 and 8 is retired from the page (phase 9d) and the documentary at `web/story2/` carries the cinematic work. README.md and `docs/history.md` describe the page as it is.

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
- **Buildings in 3D:** a `fill-extrusion` layer from the `building` source-layer (`render_height`, `render_min_height`), so the tilted city has volume. Craft rules, because depth is inferred from cues, not from geometry: **light against shadow**: the style's `light` is a hard, low, near-white light (`anchor: map`, colour `#ffffff`, intensity 0.9, position `[1.5, 100, 25]`) so one face of every block is lit and the next is in shadow; walls graded by height from `#223355` to `#4d6a9e` with `fill-extrusion-vertical-gradient` on (the old `#0d1526` walls were one step above the background and read flat); **atmosphere**: MapLibre's sky/fog is on in every story scene (`sky-color #070b14`, `horizon-color #0d1a33`, `fog-color #0a1326`, `fog-ground-blend 0.6`, `horizon-fog-blend 0.9`, `sky-horizon-blend 0.5`, `atmosphere-blend 0.8`) so the far city pales into haze; **parallax**: the title is a crane move, not a hold, because motion is the strongest depth cue; **edges**: a three.js wireframe edge pass over the extrusions is the fallback if faces alone are not enough (not built yet); **scale**: the span dots and the deck are the viewer's rulers and stay visible in the title; opacity fading in across zoom 13.3–13.9 (never popping), full by 13.9. The tile source carries no building features below tile zoom 13 and only a handful at 13 (19 in frame at 13.2 over the old town); the city reads as 3D from about zoom 14 (1,596 buildings in frame at 14.1). So the landing holds at zoom 15.2, pitch 66, bearing −30 over Carolabrücke (13.7468, 51.0535) with the slow orbit, and scene 1 is a **crane move about the subject**: it starts high (zoom 14.0, pitch 42, bearing −30: high enough to show the whole inner city, low enough that the walls already read in the first frame; 13.5/35 was a flat map for the first second) and descends to the landing's framing over the scene's nine seconds on the ease-out curve, the city rising around the bridge as the camera comes down; scene 3 pulls back from there to 12.3 as a real camera move; the city-wide shots (scenes 3 and 4, all twenty bridges in frame) are flat by design; the close-ups return to the volume. Every camera target applies on natural playback and on seeks alike (one camera path); a minimum height of 4 m and a cap at 60 m so unmapped buildings look plausible without inventing landmarks; the director's tile wait runs before any tilt so a scene never starts with half the city missing. Extrusions only over the vector base, never over imagery.
- **The close-up base:** scenes 5, 6, 7 and 8 use the vector style with the extruded city, fog and the hard light, never the satellite photo on the map; a drawn deck over a photograph looks pasted on and a blurred photo under a panel looks broken. In story mode the satellite photo appears only inside scene 7's evidence card (the Sentinel-2 chip SAM looked at); Explore keeps its Imagery option.
- **The deck in the close-up (story mode):** one continuous slab seated on piers, not a row of floating bars. Deck top at 12 m above the water, 2 m thick, the bridge's true width; one box per span, their ends meeting at the pier lines; piers as 3 m × 3 m columns from the water (0 m) to the deck's underside at each span joint. Span colour by the bound month's class (quiet `#4d6a9e`, watch `--amber`, high `--red` with a faint emissive bloom); null spans `#8ea3c7` at 60 % opacity. Tilt: each span pitches about its centre by the month's anomaly scaled so the worst span in the shown month tilts 2.5°, never more; the mm/yr exaggeration (×7 bars) lives only in the side-view card. Lit by one directional light matching the basemap's light (from the south-east, low) plus 0.45 ambient, so the slab shades like the prisms around it: the top face reads lighter than the sides, and the high-class emissive stays faint (intensity ≤ 0.15) so a red span still shows its edges and is never a flat red stick; no wireframe. The slab must lie exactly along the bridge: its local X axis renders at the span chain's compass bearing (checked by a test that pushes the unit X vector through the layer's model matrix and reads back east and north components), never its mirror about north, which is what made the 7d deck look pasted on. In scenes 5 to 8 the bridge footprint polygon is hidden (no fill, no outline: the slab is the bridge and the span dots carry the geometry; a hairline beside the straight slab read as misregistration where the polygon curves). Explore keeps the 7d exaggerated bars as its own mode.
- **The close-up camera:** scene 5 flies from the city shot to zoom 15.5, pitch 62, bearing −30 on Carolabrücke's centroid over 2.4 s (the bridge sits diagonal across the frame, the old town behind it); scene 6 steps to zoom 16.0, pitch 65 and orbits 20° over its length; scene 7 holds scene 6's end pose with a 0.3 push-in. Span dots stay on as the viewer's rulers.
- **Light and film:** a radial vignette (transparent centre → `--bg` at 0.65 at the corners) and a 3 % animated grain overlay on the map container, both `pointer-events: none`; a soft bloom under high markers (the 7b glow, widened); the water gets a faint specular gradient. Letterbox bars (8 % top and bottom) in story mode; none in Explore.
- **Span dots at city zoom:** hidden below zoom 13.5 in story mode; at zoom 12 the five dots per bridge overlap into a pale pill and hide the reticle. They return in the close-ups and in Explore.
- **History strip geometry:** full width between 24 px margins, cells sized to fill (`(width − label column) / 33` wide, 9 px tall, 1 px gaps, 20 rows = 200 px), anchored just above the caption band; the scene-4 camera centre sits north of the city centre so every marker stays above the strip.
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
- **Month wordmark:** scene 4 only, 112 px Rajdhani uppercase, top-right, the month name over the year, tabular; changes with a 150 ms crossfade per month and must show the same month as the headline card and the readout at every tick.
- **Headline card:** bracket frame, 24 px display sentence-case line, 14 px mono reason; top-left under the letterbox.
- **HUD card (scenes 5–6):** bracket-framed glass (`--bg-2` at 0.72 with `backdrop-filter: blur(10px)`), top-left under the letterbox, 300 px wide: the bridge name in 22 px display, then four readouts in a 2 × 2 grid (CUTOFF, RANK, Z, RISK) as label-over-value pairs, the worry phrase in display face coloured by class on one line (never wrapped); the rank and z readouts are the scene's counter, so no floating counter is drawn over the map; values count up over 600 ms when the scene enters and crossfade on the month change into scene 6. No full border, no table.
- **Side-view card (scenes 5–6):** same glass and bracket frame, top-right, 320 px wide; the title "SIDE VIEW" on a hairline rule with the mono note "VERTICAL ×7" at its right; the spans as 1 px-outlined prisms (fill at 35 %) on a hairline baseline with 6 px pier ticks, the worst span filled solid; one mono caption line beneath. Replaces the bordered panel.
- **Span callout (scenes 5–6):** a leader line from the fastest span's centre to a bracketed label (span name in mono uppercase, the mm/yr value beneath in 18 px mono), drawn per the leader-line rule; the line is at least 60 px long (the label sits up and to the right, clear of the slab), ends in the 3 px dot, and the label carries the 12 px corner brackets; no filled box.
- **Side panel (scenes 7–8):** one glass sheet on the right, 440 px wide, from the letterbox top to the letterbox bottom, bracket-framed, `--bg-2` at 0.78 with `backdrop-filter: blur(12px)`; the city and the slab stay in the left two-thirds. The memo fills it in scene 7 and the proof replaces it in scene 8 with a 600 ms crossfade. Its title sits on a hairline rule in mono uppercase ("INSPECTION MEMO — 2024-09-01", "THE PROOF — 2024-09-01").
- **Memo panel (scene 7):** the verdict in Inter 16 px / 1.5 typed in as now, the key sentence on an `--amber` 18 % band with a 1 px `--amber` underline; "ACTION LIST" as a section title on a rule; the actions as hairline-separated rows, each: bridge name in 16 px display, the worry phrase in display face coloured by class, the reason in 12 px mono dim, what to do in 13 px Inter. No table borders, no cell grid.
- **Evidence card (scene 7):** bracket-framed glass, top-left under the letterbox, 280 px square: the Sentinel-2 chip `data/s2_visual.png` (93 × 91 px, 10 m pixels) scaled with `image-rendering: pixelated` so the resolution is honest, the SAM polygon for the bridge projected into the chip's corner frame (`data/s2_visual.json`) and drawn as a 1 px `--cyan` outline over 600 ms, title "EVIDENCE — SENTINEL-2 · 10 m" on a rule, footer "SAM 3.1 · score {score} · IoU {iou}" in mono. It enters at the "SAM 3.1 found the bridge" caption. The map's SAM outline (`sam-lines`) and the radar chip raster stay off in story mode: the 10 m staircase polygon sits beside the slab and reads as misregistration, and the grey chip at city zoom reads as a pasted patch. Both remain Explore layers.
- **Proof panel (scene 8):** in the side panel: two readout columns "FULL RUN" and "FUTURE DELETED" (SCORE and Z as label-over-value, counting up 600 ms, settling on identical values, then a check mark draws between the columns), the ten quantities as hairline rows with a check appearing per row at 90 ms stagger, the footer "Same high bridges in 33 of 33 months" in display 16 px. The city dims to 45 % behind, the slab still visible; the dip into scene 8 stays.
- **Caption stacking:** captions and the scene index always sit above every dim, blur or sheet layer (never faded by them).
- **History strip:** cells 10 × 10 px with 2 px gaps, no card, no scrollbar; row labels 11 px mono uppercase; a 1 px `--line-strong` playhead; sits along the bottom edge above the caption in scene 4, full width.
- **Buttons:** mono uppercase 12 px, tracking 0.14 em, a 1 px hairline underline that brightens on hover; the landing Play is a 72 px ring with a triangle and the word PLAY beneath; no filled rectangles.
- **Scrub line:** story mode's only chrome: a 1 px line across the bottom edge with nine 6 px ticks, the playhead as a 2 px bright segment, chapter name in mono on hover; the month readout (mono 14 px) at the right end; CC and Explore as mono words at the left end. Nothing else from the dashboard is visible in story mode: no header, blurb, toggles, slider row or map controls.

## 6. Motion

- One easing family: `cubic-bezier(0.22, 1, 0.36, 1)` for reveals and camera, linear for orbits and counters, `cubic-bezier(0.4, 0, 1, 1)` only for exits.
- Durations: 240 ms (micro), 400 ms (element), 800 ms (panel), 1600–2400 ms (camera), 4000 ms (hold).
- Scene transitions: a 600 ms crossfade of overlays plus the camera move; the map never cuts to black between scenes except into scene 2, into scene 8 and at scene 9's Europe beat, which dip to `--bg` over 500 ms and back.
- Reveals are staggered 60–90 ms per element in reading order; lines draw before their labels appear.
- Reduced motion: no grain, no scan line, no ring rotation, crossfades of 120 ms, counters at final values; content identical.

## 7. Explore

Same language, denser: the side panel becomes a column of bracket-framed cards on `--bg-2` glass; the ranking rows are hairline-separated with the worry word in display face and the score in mono; the detail opens with the bridge name at 32 px display, the readouts as label-over-value pairs, the side view and the engineers' disclosure beneath; the memo panel is a glass sheet with Inter text. The toggles become mono words with underline states. The month slider keeps its 40 px thumb but is drawn as a hairline track with month ticks.

## 8. Landing and ending

- **Landing:** letterboxed night city at zoom 15.2, pitch 66 over Carolabrücke with the lit 3D city and fog, slow orbit; the wordmark "RADARTWIN" at 120 px display in the **lower third** (never over the city's centre) with "DRESDEN · 2022 – 2024" in mono beneath (set in `--fg` at 85 % opacity, not the muted token: it sits over lit rooftops), every piece of lower-third type (wordmark, subtitle, tagline, scene captions) carrying a dark halo `text-shadow: 0 0 24px rgba(7,11,20,.85), 0 1px 2px rgba(7,11,20,.9)` so it stays legible over the light building tops without a box or a scrim, the Play ring to its right or below, a one-line mono tagline. In scene 1 the city is seen first: the wordmark enters at 2 s, after the crane has begun. A 1.2 s preloader on `--bg` with the title drawing in as a hairline outline, so fonts and tiles are ready before the first frame.
- **Scene 9, the pull-back and the date:** the camera pulls back from the close-up to the city shot (12.3, pitch 40, bearing 0) over 2.4 s; the date roll sits in the upper third (112 px mono, tabular, centred, never over the city's centre), counting from the cutoff date to the event date over 2.5 s with rolling digits; at its end Carolabrücke's reticle turns `--red` with one 1.2 s bloom pulse, and the caption "10 days later, Carolabrücke collapsed." follows. No SAM outline, no radar chip, no footprint fills: the city, the reticles and the date only.
- **Scene 9, Europe:** the pull-out to zoom 3.8 on [12, 52] over 2.4 s; the basemap's place labels are hidden below zoom 6 in story mode; the lit cities carry their own labels drawn by the annotation layer (mono 11 px uppercase, `--fg` at 70 %, 8 px right of the dot), Dresden last with the red reticle and "DRESDEN"; a label whose box would touch the lower-third band (caption or scene index) or another label is dropped, never overlapped; the EGMS note ("cities shown as examples of EGMS coverage") sits inside the top letterbox bar at the right, mono 11 px dim, so it never meets a label or the scrub line. The Europe view is a cut, not a zoom: a continuous zoom from 12 to 3.8 passes through zoom levels nothing has loaded and shows dark frames, so at the Europe beat the map dips to `--bg` for 500 ms, the camera jumps to the Europe pose behind the dip, and the dip lifts on the finished view (the third dip in the story, with scenes 2 and 8). The Europe tiles are warmed before that: a hidden MapLibre instance the size of the map container (never a few pixels, which loads one tile) at the Europe pose is created when scene 8 enters and removed when scene 9 ends, so every coastline is on screen the moment the dip lifts.
- **Ending:** a full-bleed `--bg` sheet at 0.94 fades up over 800 ms over the Europe pull-out when scene 9 ends: a centred column (max-width 960 px) of the event date in 112 px mono tabular ("11 SEP 2024"), "10 days later," in 16 px mono dim, "Carolabrücke collapsed." in 48 px display on one line, "The data flagged it first." in 16 px mono, then REPLAY and EXPLORE THIS MONTH as mono words with hairline underlines, 32 px apart; no card box, no brackets around the whole; the scrub line stays.

## 9. Phases

- **8a Foundations:** fonts and tokens; story mode hides all dashboard chrome and adds letterbox, scrub line, lower-third and scene index; the vector basemap with 3D buildings, vignette, grain, reticle markers; the shared FUI components (brackets, rules, readout, leader line, ring) as CSS/SVG primitives. Scenes keep their content; they inherit the new primitives.
- **8b Scenes 1–4 composition:** landing with preloader, title, scene 2 explainer restyled as a drawn FUI diagram, scene 3 labels as bracketed callouts, scene 4 month wordmark, headline card and strip along the bottom.
- **8c-1 Scenes 5–6 composition:** the close-up on the vector city with the deck seated on its piers, the HUD card, the side-view card and the span callout.
- **8c-2 Scenes 7–8 composition:** memo and proof in the glass side panel with the city still in frame; the evidence card; the leader line and footprint leftovers from 8c-1.
- **8c-3 Scene 9 and the ending:** the pull-back, the date roll, the Europe outro with labels that never collide with the lower third, the ending sheet; the SAM outline and radar chip off the story map.
- **8d Explore:** the dashboard in the same language. Phone layouts are deferred until the owner is satisfied with the desktop web app.

Each phase ends with full-size frames of every affected scene for review by eye.
