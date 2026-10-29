# Phase 8a frames for review by eye

No browser was available in the build environment, so these frames are
specified by construction (every number below is a value in the shipped
CSS/JS). Reviewer: open `web/index.html` over HTTP at 1920×1080 and
1280×800, play the story, and compare each scene against its frame.
Content, timing, data and captions are unchanged from 7d; only the look
and the story chrome are new.

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
  8vh+108px, mono 500 12px dim): `01 / 09` … `09 / 09`. The old
  `scene 1 of 9` tag is gone.
- Captions (scenes with captions): full-width lower-third band,
  bottom 8vh+16px, gradient `--bg` 0.85 → transparent with a 1px
  `--line` hairline above, Rajdhani 500 32px/1.15 centred, 2-line
  max, side padding 15%. Fades 300ms in / 240ms out (120ms reduced).
- Markers (city zoom): 2px risk-coloured dot + 14px hairline ring
  (`rgba(143,184,255,.28)`); `high` adds a 22px dashed red ring
  rotating at 6°/s plus the widened glow (r28, blur 1, opacity
  .25). Span dots r6 on the ±4 scale (zero `#f3f0ea`) with a 1px
  `--line-strong` edge, no white rim.
- Basemap: `--bg` background, water `#0a1a33`, parks `#0d1a1f`,
  buildings flat `#0d1526` / extruded `#111a2c` (zoom ≥ 13, opacity
  .9), major roads hairlines in `--line` at .35/.18 by class, rail
  dashed, place labels 11px uppercase (`Noto Sans Regular` only, mono
  look from uppercase + tracking) in dim with a `--bg` halo.
  Imagery scenes use the Esri raster; the Esri dark canvas is
  removed.
- Every scene start restarts a 2s scan-line sweep (1px line-strong
  line, 2% opacity, top to bottom; none under reduced motion).
- Scene changes crossfade the shown overlays over 600ms (120ms
  reduced). Scenes 2 and 8 open with a dip to `--bg` (500ms down,
  500ms back; none while scrubbing or under reduced motion).
- Camera moves ease on `cubic-bezier(0.22, 1, 0.36, 1)` over
  1800–2000ms; orbits are linear (scene 1: 0.5°/s; scene 6: 20°/6s).

## Landing

Letterboxed night city, pitch 55, zoom 12, slow orbit. Centred dim
overlay: `RADARTWIN DRESDEN`-style title (Rajdhani 700 40px,
uppercase), one-line tagline (Inter 16px dim), white Play button
(kept from 7d; the 72px Play ring lands in 8b). Story bar visible;
scene index hidden until Play.

## Scene 1 — title (`01 / 09`)

Title block centred: `RadarTwin Dresden` (Rajdhani 700 40px,
uppercase, letterspaced) over the subtitle (mono 14px dim). Two
captions in the lower third. City orbit continues.

## Scene 2 — how-radar-sees (`02 / 09`)

After the 500ms dip, the map is covered `--bg` with the radar
explainer SVG (palette-token-tinted only; the drawn FUI diagram
lands in 8b). Three captions in the lower third.

## Scene 3 — twenty-bridges (`03 / 09`)

Camera pulls back to zoom 12, pitch 40 (ease-out, 2s). Bridge name
labels fade in one by one in rank order as bracketed mono labels
(12px uppercase, 0.12em tracking) with 1px `--line-strong` leader
lines that draw over 600ms, each ending in a 3px dot; labels clear
at the scene end. One caption.

## Scene 4 — three-years (`04 / 09`)

Slow drift. Headline card top-left under the letterbox (glass with
corner brackets, width min(430px, 40%)): month line in Rajdhani 600
24px sentence case, reason in mono 14px dim, stepping monthly.
History strip along the bottom (left 24px, above the bottom bar, a
546px block: 150px labels + 33 × 12px): 20 rows × 33 months of 10px
cells with 2px gaps, 150px row labels (mono 11px uppercase dim), 1px
`--line-strong` playhead line. First yellow/orange/red callouts appear as bracketed labels
with leader lines. Month ticks under the scrub line; the readout
ticks `2022-01-01` → `2024-09-01`. No captions (unchanged).

## Scene 5 — august (`05 / 09`)

Flies to Carolabrücke (zoom 15, pitch 60, ease-out 2s) on imagery.
3D deck (three.js, above the extrusions), two dashed concentric
rings (line-strong + `#5ee7ff`) rotating ±6°/s, HUD block top-left
(glass, mono 12px: name, dim cutoff, `rank … of … · z …` tabular,
worry word + tech term; rank/z count up over 600ms on first show),
span callout with leader line, side-view panel top-right (glass,
mono 12px uppercase title, deck blocks, mono 11px dim note). Two
captions.

## Scene 6 — september (`06 / 09`)

One step to the same centroid (zoom 15.7, pitch 65), 20° linear
orbit over 6s. Deck retargets with a 600ms height tween, glow
pulses once (r28 → r40 → r28), the rank/z counter tweens from
August over 1.5s. Same HUD/rings/side-view arrangement as scene 5.
Two captions.

## Scene 7 — the-report (`07 / 09`)

Hold with a 0.3-zoom push-in (2s). Memo panel right (glass, from
8vh+12px to 8vh+16px, width min(400px, 44%)): mono 12px uppercase
title, Inter 13px/1.55 body typing at 40 chars/s, one sentence
highlighted amber-tint. S2 chip under the fills; SAM outline draws
in `#5ee7ff` with a mono label. Three captions.

## Scene 8 — the-proof (`08 / 09`)

After the dip, map dimmed, proof card centred (glass, max 520px):
two columns headed `FULL RUN` / `FUTURE DELETED` (mono 12px
uppercase dim), score/z as label-over-value readouts (mono 22px
tabular, counting over 2s as before), 10 check rows (mono 13px
dim, text-coloured checks), foot line (Rajdhani 600 16px). Two
captions.

## Scene 9 — ten-days-later (`09 / 09`)

Pull back to zoom 12, pitch 40 (ease-out 2s) on the dark basemap.
Date rolls in mono 64px centred (112px in 8c), ending card centred
(glass: Rajdhani 600 22px line 1, mono 14px dim line 2,
`REPLAY` / `EXPLORE THIS MONTH` mono buttons), then the Europe
pullout (zoom 3.8, ease-out 2s) with city dots lighting one by one
and the mono 11.5px footnote bottom-right above the letterbox.
Three captions.

## Final map layer order (bottom to top)

1. `fui-background` (background `#070b14`)
2. `esri-layer` (imagery raster; hidden in dark mode)
3. `fui-water`, `fui-waterway`
4. `fui-park`, `fui-landuse-park`
5. `fui-building` (flat)
6. `fui-roads-minor`, `fui-roads-major`, `fui-rail`
7. `fui-buildings-3d` (fill-extrusion, zoom ≥ 13)
8. `fui-places` (labels)
9. `s1-raster` (hidden unless toggled)
10. `bridges-fill`, `bridges-line`, `bridges-dashed`
11. `sam-lines` (hidden unless toggled)
12. `spans-circles`
13. `scatterers-circles` (hidden unless toggled)
14. `bridges-glow`, `bridges-markers`, `bridges-reticle`,
    `bridges-markers-hit` (transparent click disc)
15. `s2-raster` (scene 7 only, inserted before `bridges-fill`)
16. `europe-dots` (scene 9 outro only)
17. `bridge-deck-3d` (three.js custom layer; appended last, so it
    renders above the extrusions)

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
  `class` / `render_height` / `render_min_height` / `name:latin`
  fields match the served tiles; a mismatch would silently drop
  that layer (parks, rails, labels and extrusions are the exposed
  ones).
- That the extrusion reads as 3D volume under pitch, that the deck
  draws above it, and that labels sit legibly under the data.
- Animation feel: crossfade/dip/scan/count-up/ring timing,
  grain visibility at 3%, scan visibility at 2%, caption/index/
  strip spacing at both review sizes, chapter hover labels, and
  the moved headline/strip layout in both modes.
- Phone widths (8d owns the phone layouts) and reduced-motion
  behaviour beyond the gated code paths.
- The MapLibre `easing` option on `easeTo` (used for the camera
  curve) and CSS rotation of the SVG reticle rings.
