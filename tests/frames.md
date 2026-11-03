# Frames for review by eye

Every phase was built by Muse Code from the prompt files in `muse/prompts/`, in order, with the design contract in `docs/design-spec.md` and the story contract in `docs/story-spec.md`. This file is the frame-by-frame review checklist the owner used.

Reviewer: open `web/index.html` over HTTP at 1920×1080 and 1280×800, play the story, and compare each scene against its frame (every number below is a value in the shipped CSS/JS). Content, timing, data and captions are unchanged from 7d; 8b composes the landing and scenes 1–4; 8c-1 composes scenes 5–6 on the vector city; 8c-2 composes scenes 7–8 in the glass side panel with the evidence card; 8c-3 composes scene 9 (pull-back, date roll, Europe labels) and the ending sheet, and takes the SAM outline and radar chip off the story map.

Reference: 8vh is ~86px at 1080p and 64px at 800p. Colours: `--bg`
`#070b14`, `--bg-2` glass `rgba(11,18,32,.72)`, `--line`
`rgba(143,184,255,.28)`, `--line-strong` `rgba(191,214,255,.6)`,
`--text` `#e6eefc`, `--text-dim` `#8ea3c7`, `--accent` `#ff3b3b`.
Type: Rajdhani (display), JetBrains Mono (data), Inter (reading).

## Every story frame (landing + scenes 1–9)

- Map fills the viewport (100vw × 100vh). No header, footer, side
  panel, slider row, toggle rows or MapLibre controls are visible.
- Letterbox bars top and bottom, each 8% of the map height, `--bg`.
- Vignette over the map: transparent centre → `--bg` at 0.65 at the
  corners. Grain over the map at 3% opacity, animated in 4 steps
  (both `pointer-events: none`; grain off under reduced motion).
- Story bar along the bottom edge (fixed, height 8vh, min 56px):
  `CC` and `EXPLORE` mono words left (JetBrains Mono 500 12px,
  tracking 0.14em, uppercase, hairline underline); the scrub line
  centre (1px `--line` track, playhead a 2×14px bright segment, nine
  2×6px ticks with the active tick 2×10px bright, chapter name in
  mono 12px on hover above the line, 33 month ticks 1×6px below the
  line during scene 4); month readout right (mono 500 14px tabular,
  e.g. `2024-09-01`).
- Scene index right-aligned above the lower third (right 24px, bottom
  8vh+108px, mono 500 12px dim): `01 / 09` … `09 / 09`.
- Captions (scenes with captions): full-width lower-third band,
  bottom 8vh+16px, gradient `--bg` 0.85 → transparent with a 1px
  `--line` hairline above, Rajdhani 500 32px/1.15 centred, 2-line
  max, side padding 15%. Fades 300ms in / 240ms out (120ms reduced).
- Markers (city zoom): 2px risk-coloured dot + 14px risk-coloured
  hairline ring (both read the bound cutoff's risk); `high` adds a
  22px dashed red ring rotating at 6°/s plus the widened glow (r28,
  blur 1, opacity .25). Span dots r6 on the ±4 scale (zero `#f3f0ea`)
  with a 1px `--line-strong` edge, no white rim.
- Bridge fills carry 0.12 opacity at city zoom (zoom ≤ 13) over the
  vector base so the reticle, not a pale pill, carries the colour;
  they brighten to 0.38 only in the close-up (zoom 15); hidden
  entirely in scenes 5–9, where the slab (5–8) or the reticles (9)
  carry the geometry.
- Basemap: `--bg` background, water `#0a1a33`, parks `#0d1a1f`,
  major roads hairlines in `--line` at .35/.18 by class, rail
  dashed, place labels 11px uppercase (`Noto Sans Regular` only, mono
  look from uppercase + tracking) in dim with a `--bg` halo.
  Imagery scenes use the Esri raster; the Esri dark canvas is
  removed.
- 3D buildings: `fill-extrusion` from `render_height` /
  `render_min_height`, heights true (clamped to 4–60 m, no multiplier),
  walls graded `#223355` (0 m) → `#4d6a9e` (40 m) with the vertical
  gradient on, over flat `#101a2e` footprints; opacity fading in across
  zoom 13.3–13.9 (0 → 0.95, never popping, full by 13.9); the style
  light is a hard, low, near-white light anchored to the map
  (intensity 0.9, `#ffffff`, position `[1.5, 100, 25]`), so one face of
  every block is lit and the next is in shadow. MapLibre sky/fog is on
  in story mode and in Explore (`sky-color #070b14`,
  `horizon-color #0d1a33`, `fog-color #0a1326`, `fog-ground-blend 0.6`,
  `horizon-fog-blend 0.9`, `sky-horizon-blend 0.5`,
  `atmosphere-blend 0.8`; the fog stays on under reduced motion), so the
  far city pales into haze. Extrusions only over the vector base, never
  over imagery.
- Place labels keep only `city`/`suburb` with rank ≤ 2 at zoom ≤
  12.5, density-capped by rank sort key + 250px spacing (~15 on
  screen); hidden entirely in scenes 1, 3 and 4, below zoom 6 in
  story mode (the Europe outro), and over imagery. No street names
  anywhere.
- Every scene start restarts a 2s scan-line sweep (1px line-strong
  line, 2% opacity, top to bottom; none under reduced motion).
- Scene changes crossfade the shown overlays over 600ms (120ms
  reduced). Scenes 2 and 8 open with a dip to `--bg` (500ms down,
  500ms back; none while scrubbing or under reduced motion), and
  scene 9's Europe beat at 10 s dips the same way (the third dip):
  500ms down, the jump behind the dip, 500ms back on the finished
  Europe view.
- Camera moves ease on `cubic-bezier(0.22, 1, 0.36, 1)` over
  1800–2400ms (scene 1 cranes over its full 9 s; scene 5 flies over
  2.4 s); orbits are linear (0.5°/s behind the landing; scene 6:
  20° over its 12 s).

## Landing

- Preloader first: opaque `--bg`, the `RADARTWIN` wordmark (72px
  Rajdhani 700, tracked 0.08em) drawing in as a hairline
  `--line-strong` outline over the first 60% of 1.2s, then filling to
  `--text` (shown filled under reduced motion). It lifts after at
  least 1.2s AND `document.fonts.ready` AND the landing view's tiles
  idle (4s ceiling), then fades 300ms into the landing (instant if
  reduced).
- Letterboxed night city at zoom 15.2, pitch 66, bearing −30 over
  Carolabrücke (13.7468, 51.0535), the lit 3D city in fog, slow orbit
  0.5°/s (still under reduced motion); no place labels.
- Wordmark `RADARTWIN` (Rajdhani 700 120px, tracked 0.08em) in the
  lower third (baseline at ~72% viewport height; ~68% at 800px height
  where the stack steps to the 0.75x scale) with
  `DRESDEN · 2022 – 2024` in mono 14px tracked 0.3em dim 10px
  beneath. The bridge at the frame's centre stays clear of text. The
  Play control sits below the sub: a 72px hairline ring
  (`--line-strong`, outlined triangle) with the word `PLAY` in mono
  12px tracked 0.3em dim 10px beneath; hover brightens the ring.
  Dimmed until the preloader lifts.
- One-line mono tagline `The data flagged it first.` (14px dim,
  0.06em) centred at bottom 8vh+36px. Four 18px corner brackets in
  `--line` at the frame's edges (24px sides, 8vh+16px top/bottom).
- Story bar visible; scene index hidden until Play. The old white
  rectangular Play button is gone; the old
  `RadarTwin Dresden — bridge watchlist hindcast` text stays only in
  Explore's header (and the document `<title>`).

## Scene 1 — title (`01 / 09`)

- A crane move about the subject, not a hold: from high (zoom 14.0,
  pitch 42, bearing −30, the whole inner city, the walls already
  reading in the first frame) down to the landing's framing (15.2, 66,
  −30 over Carolabrücke) over the scene's 9 s on the ease-out curve,
  the city rising around the bridge as the camera comes down. Seeks
  land on the interpolated pose (one camera path); reduced motion
  holds the end framing.
- Because the landing already holds the move's end framing, Play dips
  to `--bg` for 500 ms, the camera jumps to the high start pose behind
  the dip, and the crane descends as the dip lifts.
- The city is seen first: the wordmark enters at 2 s in the lower
  third at 120 px and holds (no shrink; shown at once under reduced
  motion), with the same mono sub beneath.
- Two captions in the lower third. The scan line sweeps once. No
  place labels.

## Scene 2 — how-radar-sees (`02 / 09`)

- After the 500ms dip, the map is covered `--bg` with the explainer
  SVG (800×450) redrawn as a FUI diagram: hairline
  `--line-strong` outlines throughout, the satellite (body 44×20,
  side panels 26×12, top panel 30×10) and the kerb (10×12 outline)
  as outlined shapes with 8px / 5px corner brackets, dashed pulse
  arcs (`#5ee7ff`, 6/4) and echo arcs (`#f2b84b`, 6/4), the echo path
  as a dashed amber line (4/3, 0.5 opacity) from the satellite to the
  kerb, the counter in 72px mono at top-centre-right, labels in 11px
  tracked (0.12em) uppercase mono. Deck and pillars are outlines;
  the span dot keeps the map's data colour (`#fdae61`) with a
  `--line-strong` hairline edge and no white rim. No filled blocks.
- Beats and the chart→dot morph keep their 7c timing (passes at
  0–6s and 6–11.5s, kerb +1mm, counter to `+1.0 mm`, chart draws
  11.5–14s, dot morphs 14–16s). Three captions in the lower third.

## Scene 3 — twenty-bridges (`03 / 09`)

- Camera pulls back from the crane's end framing (15.2/66/−30 over
  Carolabrücke) to zoom 12.3, pitch 40, bearing 0 (ease-out, 2.4s).
  Bridges light up as reticles in rank order at the first cutoff (one label
  per 0.25s from 2.4s, once the move has landed) with bracketed mono labels (12px uppercase,
  0.12em tracking, 168×26 glass + 8px corners) and 1px
  `--line-strong` leader lines that draw over 600ms, each ending in
  a 3px dot; labels de-cluster through `placeLabel` collisions (a
  20-label pile-up separates with zero overlaps at both review
  sizes) and clear in the last second, before scene 4. One caption.
  No place labels.

## Scene 4 — three-years (`04 / 09`)

- Slow drift at zoom 12.3, pitch 40, centre `[13.745, 51.039]`
  drifting +0.004 lon / +0.002 lat over the scene. No place labels.
  Lowest marker (southernmost centroid, lat 51.038075) projects to
  y ≈ 408 (start) / 426 (end) at 1280×800, at least 24 px above the
  strip top (466).
- Month wordmark top-right (top 8vh+12px, right 24px): 112px
  Rajdhani 600 uppercase (0.06em, tabular), the month name over the
  year (e.g. `SEPTEMBER` / `2024`), crossfading 150ms out / 150ms in
  per month (instant while scrubbing or reduced).
- Headline card top-left under the letterbox (top 8vh+12px, left
  16px, width min(430px, 40%), glass with corner brackets): month
  line in Rajdhani 600 24px sentence case, reason in mono 14px dim,
  stepping monthly with a 150ms fade per change.
- History strip along the bottom edge: the band spans the full width
  (left/right 24px, bottom 8vh+70px), cells filling the width
  (`(width − 150 px) / 33` per month: ~31.8 px cells at 1280,
  ~51.2 px cells at 1920),
  9 px tall with 1 px gaps (10 px pitch, 20 rows = 200 px); 150 px
  label column with 9 px JetBrains Mono 500 uppercase dim labels
  (0.04 em tracking, vertically centred on their row via
  `dominant-baseline: central`, truncated with an ellipsis at 22
  characters); 1 px `--line-strong` playhead line, filling left to
  right. No two labels overlap (9 px type on a 10 px pitch).
- First yellow/orange/red callouts appear as bracketed labels with
  leader lines (1.2s hold each). Markers as reticles. Month ticks
  under the scrub line; the readout ticks `2022-01-01` →
  `2024-09-01`. No captions (unchanged).

## Scene 5 — august (`05 / 09`)

8c-1: the close-up on the vector city (never imagery). The camera
flies from scene 4's end pose (12.3/40/0 over `[13.749, 51.041]`) to
zoom 15.5, pitch 62, bearing −30 on Carolabrücke's centroid
(`[13.74675, 51.05454]`) over 2.4 s on the ease-out curve, then
holds; the bridge sits diagonal across the frame, the old town
behind it. One continuous slab seated on piers at true height (deck
top 12 m, 2 m thick, true width; piers 3×3 m at each span joint),
its local X at the span chain's bearing (350.8°, never mirrored),
so the slab lies exactly along the footprint; spans in August red
with the faint emissive bloom (0.15, worst span pitched 2.5°), lit
low from the south-east plus 0.45 ambient so the Lambert top face
reads lighter than the sides, shading like the prisms around it.
The footprint polygon drops to a 1 px hairline with no fill; span
dots stay on as the viewer's rulers; the two dashed rings rotate
±6°/s. HUD card top-left under the letterbox (bracket-framed glass,
300 px): `Carolabrücke` in 22 px display, then `CUTOFF 2024-08-01`,
`RANK 2 of 19`, `Z 3.07`, `RISK send an inspector` (display face
16 px, red, on one line) in a 2×2 grid.
Side-view card top-right (glass, 320 px, no full border): `SIDE
VIEW` on a hairline rule with `VERTICAL ×7` at its right, five
1 px-outlined prisms at 35 % fill on a hairline baseline with 6 px
pier ticks (worst span solid), one mono caption line beneath. Span
callout: a leader line from the fastest span's centre (drawn over
600 ms, 1 px line-strong over the map) to a bracketed label
(`CAROLABRÜCKE SPAN 5` mono uppercase, `+3.2 mm/yr` in 18 px mono
beneath), no filled box. Two captions (unchanged).

- At 3 s: the fly has landed (2.4 s); the slab sits on its piers;
  the HUD values have counted up (600 ms); the side view has slid
  in; the callout leader is drawn; the first caption
  (`August 2024. 2 bridges flagged.`) is up.
- At the end (10 s): identical framing (the camera holds after the
  fly); the second caption (`This one is moving at both ends.`).

## Scene 6 — september (`06 / 09`)

8c-1: one step to zoom 16.0, pitch 65, bearing −30 on the same
centroid, then a linear 20° orbit over the scene's 12 s (bearing
−30 → −10; scene 7 holds the end pose with its 0.3 push-in). Same
dark vector base, rings, HUD card, side-view card and span callout
as scene 5, rebound to September: `CUTOFF 2024-09-01`, `RANK 1 of
19`, `Z 4.43`, `RISK send an inspector`; the slab stays aligned
with the footprint with its lit top face; the footprint stays a
1 px hairline with no fill; the deck retargets with a 600 ms tilt
tween (worst span: span 5 `+4.0 mm/yr`, pitched 2.5°); the HUD
crossfades on the month change with RANK and Z counting up; the
glow pulses once (r28 → r40 → r28); no floating counter over the
map (the HUD is the counter); the callout leader line stays drawn
over the map through the orbit. Two captions (unchanged).

- At 3 s: bearing −25 (a quarter of the orbit); the tilt tween
  and the HUD crossfade/count are complete; the first caption
  (`September 2024. The only red bridge in the city.`).
- At the end (12 s): bearing −10; the second caption (`Faster
  than anything in its own record. One end rising, the next span
  sinking.`).

## Scene 7 — the-report (`07 / 09`)

8c-2: the dark close-up holds scene 6's end pose (16.0/65/−10 on
Carolabrücke's centroid) with the 0.3 push-in over 2 s; the seated slab
stays (September red, 2.5° worst pitch, faint 0.15 bloom), the footprint
(`bridges-fill`, `bridges-line`, `bridges-dashed`) hides, span dots stay
on, and (8c-3 carry-over) `sam-lines` and the radar chip stay off in
story mode: the evidence card carries the SAM result, and both remain
Explore layers. No imagery and no blur touch the map. One glass side
panel on the right (440 px, top
8vh to bottom 8vh, `rgba(11,18,32,.78)` with `blur(12px)`,
bracket-framed); the city and the slab stay in the left two-thirds. The
memo fills it: title `INSPECTION MEMO — 2024-09-01` (mono 12px uppercase
dim on a hairline rule with 6 px end ticks), the verdict typing in Inter
16px/1.5 at 40 chars/s, the key sentence
(`Carolabrücke is the only bridge that needs prompt inspection at this
cutoff.`) on an `--amber` 18 % band with a 1 px `--amber` underline once
fully typed (83 chars); `ACTION LIST` as a mono 12px uppercase section
title on a rule; the one action as a hairline row (bridge name Rajdhani
600 16px, `send an inspector` in Rajdhani 600 16px red, reason mono 12px
dim, what-to-do Inter 13px). No table borders anywhere. Evidence card
top-left under the letterbox (bracket-framed glass, 280 px): title
`EVIDENCE — SENTINEL-2 · 10 m` on a rule, the 93×91 chip
(`data/s2_visual.png`) scaled with `image-rendering: pixelated`, the
Carolabrücke SAM polygon projected into the chip corners
(`data/s2_visual.json` TL/TR/BR/BL, EPSG:4326) and drawn as a 1 px
`--sam` outline over 600 ms, footer `SAM 3.1 · score 0.77 · IoU 0.33`
from the feature's properties. It enters with the second caption
(`SAM 3.1 found the bridge in the satellite photo.`, at 5 s) and exits
with the scene. Captions and the scene index (z 30) sit above the dim
(z 9) and the side panel (z 13). Three captions (unchanged).

- At 3 s: the push-in is mid-flight; ~120 memo chars are typed (the
  `Verdict` heading plus the key sentence partially revealed, not yet
  highlighted); the evidence card is still hidden (it enters at 5 s);
  the first caption (`Muse Spark read the numbers and wrote the
  inspection memo.`) is up.
- At the end (14 s): the full memo is typed with the key sentence
  highlighted; the action row is shown; the evidence card is up with the
  SAM outline drawn and the `0.77 / 0.33` footer; the third caption
  (`Built with Muse Code.`) has just cleared (10.0 + 3.5 = 13.5 s).

## Scene 8 — the-proof (`08 / 09`)

8c-2: after the 500 ms dip down and back, the same dark close-up holds
with the city dimmed to 45 % (`rgba(7,11,20,.55)` veil) and the slab
still visible; the footprint stays hidden. The side panel stays up and
the proof replaces the memo with a 600 ms crossfade: title
`THE PROOF — 2024-09-01` on a rule; two readout columns `FULL RUN` /
`FUTURE DELETED` (mono 12px uppercase dim) with SCORE and Z as
label-over-value readouts (mono 22px tabular) counting up over 600 ms
and settling identical (5.03 / 4.43 from `data/proof.json`), then a
check mark drawing between the columns over 600 ms; the ten quantities
as hairline rows (mono 13px dim, text-coloured checks appearing one per
row at 90 ms stagger from 0.6 s); the footer `Same high bridges in 33
of 33 months` in Rajdhani 600 16px. Captions and the scene index stay
above the veil and the sheet. Two captions (unchanged).

- At 3 s: the count-in settled at 0.6 s (both columns read 5.03 / 4.43
  identically); the between-columns check has drawn; all ten quantity
  checks are up (0.6 + 10 × 0.09 = 1.5 s); the footer is shown; the
  first caption (`The future was deleted and everything re-run. Nothing
  changed.`) is up.
- At the end (10 s): identical panel state (everything settled since
  1.5 s); the second caption (`An engineering checklist and the model
  agree on every red bridge.`) has just cleared (5.5 + 4.0 = 9.5 s).

## Scene 9 — ten-days-later (`09 / 09`)

8c-3: the camera pulls back from scene 8's pose (the close-up
centroid `[13.74675, 51.05454]` at 16.3/65/−10) to the city shot
(12.3, pitch 40, bearing 0 on `[13.745, 51.057]`) over 2.4 s on the
ease-out curve — one camera path for playback and seeks — then holds
the city until 10 s (reduced motion: the city at once). The date roll
sits centred in the upper third (top 22%): 112 px JetBrains Mono 500
tabular with the dark halo and no box, rolling from the cutoff date
to the event date over 2.5 s (0.5–3.0 s); at its end Carolabrücke's
reticle (already high red at this cutoff) fires one 1.2 s bloom pulse
(r28 → r40 → r28). No SAM outline, no radar chip, no footprint fills:
the city, the reticles and the date only. Three captions (unchanged:
2.5 s, 7.0 s, 11.0 s).

At 10 s the Europe beat is a cut, not a zoom: the map dips to
`--bg` over 0.5 s (the existing dip element and curve, 500ms down and
500ms back), the camera jumps to zoom 3.8 on `[12, 52]` (pitch 0,
bearing 0) behind the dip at 10.5 s, and the dip lifts on the finished
view with all coastlines (a hidden MapLibre instance the size of the
map container at the Europe pose warms every tile from scene 8 entry,
removed at scene 9 end; never 2×2, which loads one tile). Seeks into
the beat land on the Europe pose directly with no dip (one camera
path). The basemap's place labels hide (below zoom 6 in story mode)
and the 15 cities light one by one from 10.5 s to 14 s (all at once
under reduced motion), Dresden last. Every lit city carries its own
annotation label (11 px mono uppercase, `--fg` at 70 %, 8 px right of
the dot, no box, no leader); Dresden gets the red reticle and `DRESDEN`.
A label whose box would touch the lower-third band (at 1280×800: at or
below y 596 = 800 − 64 − 140) or another label is dropped, never
overlapped. The EGMS note (`cities shown as examples of EGMS coverage`)
sits inside the top letterbox bar at the right (mono 11 px dim, no box),
clear of the city labels and the scrub line.

At 13 s the ending sheet fades up over 800 ms: full-bleed
`rgba(7,11,20,.94)` with a centred column (max-width 960 px) of the
event date (`11 SEP 2024`, 112 px mono tabular uppercase),
`10 days later,` (16 px mono dim) over `Carolabrücke collapsed.`
(48 px Rajdhani 600 on one line, nowrap), `The data flagged it first.`
(16 px mono dim), then `REPLAY` and `EXPLORE THIS MONTH` as mono words
with hairline underlines 32 px apart. No card box, no brackets around
the whole; the strings are the shipped `storyEndLine1/2` wording
(`storyEndLine1` keeps the full sentence for screen readers, the
kicker/main split is visual only), only re-set. Captions hide under
the sheet; the scrub line stays (z 30 above the sheet's z 20). The
Replay and Explore buttons keep their ids (`#btnReplay`,
`#btnExploreEnd`) and handlers.

- At 2 s: the pull-back is nearly landed (2.4 s, front-loaded);
  the date reads mid-roll (`7 Sep 2024`); no caption yet (the first
  starts at 2.5 s).
- At 5 s: the city hold; the date settled (`11 Sep 2024`, roll ended
  3.0 s); the pulse complete (4.2 s); the first caption
  (`10 days later, Carolabrücke collapsed.`) is up.
- At 10.2 s: the dip is going down (city fading to `--bg`, date
  hidden, no dots); the camera still holds the city.
- At 10.6 s: the dip is lifting on the finished Europe view with all
  coastlines (full-size warmer); 1 of 15 dots lit with its label;
  the EGMS note is in the top letterbox bar.
- At 12 s: the Europe cut landed (dip lifted at 11 s, coastlines
  present from the lift via the full-size warmer); 7 of 15 dots lit
  with their labels (Berlin…Paris in lit order); Dresden still dark;
  the third caption (`Every bridge in Europe already has this data.`)
  is up; the EGMS note is in the top letterbox bar; no ending sheet
  yet.
- The ending (13 s on, settled by 13.8 s): the sheet fully up with
  the date/lines/buttons column; captions cleared; the scrub line
  visible along the bottom edge.

## Final map layer order (bottom to top)

1. `fui-background` (background `#070b14`)
2. `esri-layer` (imagery raster; hidden in dark mode)
3. `fui-water`, `fui-waterway`
4. `fui-park`, `fui-landuse-park`
5. `fui-building` (flat, `#101a2e`)
6. `fui-roads-minor`, `fui-roads-major`, `fui-rail`
7. `fui-buildings-3d` (fill-extrusion, no minzoom; opacity gated
   0 at ≤13.3 → 0.95 at 13.9; colour graded `#223355`–`#4d6a9e` by height)
8. `fui-places` (labels: city/suburb rank ≤ 2, zoom ≤ 12.5; hidden
   in scenes 1/3/4, below zoom 6 in story mode, and over imagery)
9. `s1-raster` (hidden unless toggled; off in every story scene)
10. `bridges-fill` (0.12 at city zoom → 0.38 at zoom 15),
    `bridges-line`, `bridges-dashed` (all three hidden in scenes 5–9,
    where the slab (5–8) or the reticles (9) carry the geometry;
    restored on exit)
11. `sam-lines` (hidden unless toggled; off in every story scene —
    the evidence card carries the SAM result)
12. `spans-circles`
13. `scatterers-circles` (hidden unless toggled)
14. `bridges-glow`, `bridges-markers`, `bridges-reticle`
    (risk-coloured ring), `bridges-markers-hit` (transparent click
    disc)
15. `europe-dots` (scene 9 outro only, with the 8c-3 annotation
    labels + Dresden reticle; the scene-7 `s2-raster` map layer is gone
    in 8c-2 — the chip lives only in the evidence card)
16. `bridge-deck-3d` (three.js custom layer; appended last, so it
    renders above the extrusions; kept up through scenes 7–8)

## What could not be verified (no browser)

- That the Google Fonts load and that Rajdhani / JetBrains Mono /
  Inter render as specified (fallbacks: Arial Narrow/sans-serif,
  Courier New/monospace, Verdana/sans-serif).
- That the vector tiles and glyphs serve from tiles.openfreemap.org,
  and that `fonts/Noto%20Sans%20Regular/0-255.pbf` serves with 200
  (single-face stack only; a two-face stack 404s the combined glyph
  file and aborts the tile parse, leaving the map black behind the
  markers).
- That the embedded source-layers (`water`, `waterway`, `park`,
  `landuse`, `building`, `transportation`, `place`) and the
  `class` / `rank` / `render_height` / `render_min_height` /
  `name:latin` fields match the served tiles; a mismatch would
  silently drop that layer (parks, rails, the rank ≤ 2 labels and
  extrusions are the exposed ones). In particular the `rank` field
  on `place` and the ~15-label density at zoom 12.3 are the
  reviewer's to confirm.
- That the extrusion reads as 3D volume under pitch along the crane
  (opacity ramping 13.3–13.9, full 0.95 at the 15.2 landing), the fade
  shows no pop, the hard low light reads as lit/shadow faces, the fog
  pales the far city, the deck draws above the prisms, and labels sit
  legibly under the data.
- That the 8c-1 close-up reads as composed: the slab seated on its
  piers (not floating), aligned with the footprint, its top face lit
  under the low south-east light; the HUD card's 2×2 grid fitting
  300 px (`2024-08-01` at 18 px mono is ~108 px in a ~130 px column,
  `send an inspector` at 16 px on one line); the side-view prisms,
  ticks and `VERTICAL ×7` title; the span callout's leader line (now
  ≥ 60 px with 12 px brackets) and label legible with no box and no
  floating counter; the 15.5/16.0 framings holding the whole 432 m
  deck diagonal at 1280×800.
- That the 8c-2 scenes read as composed: the side panel's 440 px glass
  sheet sitting right with the city and slab clear on the left at both
  review sizes; the memo's 16 px Inter verdict and amber-band highlight
  legible over the glass; the action row's four voices distinct; the
  evidence chip reading as honest 10 m pixels with the cyan polygon on
  the bridge; the proof columns settling identically with the check
  drawn; captions and the index crisp above the veil and the sheet.
- That the 8c-3 scene reads as composed: the pull-back landing on the
  12.3 city hold with the 112 px date centred in the upper third (top
  22%) clear of the city's centre; the bloom pulse firing once at the
  roll end; the Europe labels (11 px mono, 8 px right of the dots)
  legible with none touching the caption band or each other and none
  meeting the basemap's own labels (hidden below zoom 6); the EGMS
  note sitting in the top letterbox bar clear of the labels and the
  scrub line; the dip, then the finished Europe view with all
  coastlines the moment the dip lifts (full-size warmer); the ending
  column (112/16-kicker/48-nowrap/16)
  centred on the 0.94 sheet with the scrub line still visible.
- Animation feel: preloader draw smoothness and lift timing, the Play
  dip into the crane descent, the wordmark enter at 2 s, the lower-third
  stack spacing (wordmark/Play/tagline, ~72% baseline) at both review
  sizes, wordmark/headline 150ms crossfades, month-tick alignment
  with the wordmark, crossfade/dip/scan/count-up/ring timing,
  grain visibility at 3%, scan visibility at 2%, caption/index/
  strip spacing at both review sizes, chapter hover labels, and
  the centred strip band in scene 4.
- Phone widths (8d owns the phone layouts) and reduced-motion
  behaviour beyond the gated code paths.
- The MapLibre `easing` option on `easeTo` (used for the camera
  curve) and CSS rotation of the SVG reticle rings.
