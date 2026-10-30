"use strict";
// Phase 7b: fixture-driven test for the pure parts of web/annotate.js
// (counter formatting, projection, label placement, colours, fastest
// span, side-view geometry). Run with:
//   node tests/test_annotate.js
const ann = require("../web/annotate.js");
const {
  formatCounter, formatSpanValue, formatRankCounter, formatSamLabel,
  projectPath, placeLabel, spanColor, riskColor, fastestSpan, deckGeometry,
  exploreCalloutsFor, calloutLineEnds, s2ChipProject,
  europeLabelBox, europeBandTop, europeKeptLabels
} = ann;

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}`);
  }
}

// --- formatCounter ---
check("counter integer", formatCounter(9, { decimals: 0 }) === "9");
check("counter decimals", formatCounter(4.43, { decimals: 2 }) === "4.43");
check("counter sign", formatCounter(2.6, { decimals: 1, sign: true }) === "+2.6");
check("counter negative keeps minus",
  formatCounter(-1.5, { decimals: 1, sign: true }) === "-1.5");
check("counter null renders dash", formatCounter(null, {}) === "—");
check("counter suffix", formatCounter(3, { suffix: " mm/yr" }) === "3 mm/yr");
check("planted: missing plus is caught (counter)",
  formatCounter(2.6, { decimals: 1, sign: true }) !== "2.6");

// --- formatSpanValue ---
check("span value style", formatSpanValue(3.18) === "+3.2 mm/yr");
check("span value negative", formatSpanValue(-2.94) === "-2.9 mm/yr");
check("span value null", formatSpanValue(null) === "no data");
check("planted: unsigned span value is caught",
  formatSpanValue(2.6) !== "2.6 mm/yr");

// --- formatRankCounter ---
check("rank counter",
  formatRankCounter(1, 19, 4.43) === "rank 1 of 19 · z 4.43");
check("rank counter nulls",
  formatRankCounter(null, 19, null) === "rank — of 19 · z —");
check("planted: unformatted z is caught",
  formatRankCounter(1, 19, 4.43) !== "rank 1 of 19 · z 4.4");

// --- formatSamLabel (phase 7c) ---
check("sam label",
  formatSamLabel(0.77, 0.326) === "SAM 3.1 · score 0.77 · IoU 0.33");
check("sam label nulls",
  formatSamLabel(null, null) === "SAM 3.1 · score — · IoU —");
check("planted: unformatted sam label is caught",
  formatSamLabel(0.77, 0.326) !== "SAM 3.1 · score 0.77 · IoU 0.326");

// --- projectPath ---
const mock = (lon, lat) => ({ x: lon * 10, y: lat * 10 });
const proj = projectPath([[13.7, 51.0], { lon: 1, lat: 2 }, { lng: 3, lat: 4 }], mock);
check("projectPath arrays", proj[0] && proj[0].x === 137 && proj[0].y === 510);
check("projectPath lon/lat object", proj[1] && proj[1].x === 10 && proj[1].y === 20);
check("projectPath lng/lat object", proj[2] && proj[2].x === 30 && proj[2].y === 40);
const bad = projectPath([[null, 1], "nope", [NaN, 0]], mock);
check("projectPath invalid maps to null",
  bad.length === 3 && bad[0] === null && bad[1] === null && bad[2] === null);
check("planted: unprojected input is caught",
  JSON.stringify(proj[0]) !== JSON.stringify({ x: 13.7, y: 51.0 }));

// --- placeLabel ---
function inside(pos, w, h, mw, mh, margin) {
  const m = margin === undefined ? 8 : margin;
  return pos.x >= m && pos.y >= m &&
    pos.x + w <= mw - m + 1e-9 && pos.y + h <= mh - m + 1e-9;
}
const centre = placeLabel({ x: 400, y: 300 }, 148, 40, 800, 600);
check("label near centre goes right and up",
  centre.x === 412 && centre.y === 248);
check("label box stays inside", inside(centre, 148, 40, 800, 600));
const right = placeLabel({ x: 790, y: 300 }, 148, 40, 800, 600);
check("label near right edge flips left", right.x < 790 - 148);
check("label flipped box stays inside", inside(right, 148, 40, 800, 600));
const corner = placeLabel({ x: 5, y: 5 }, 148, 40, 800, 600);
check("label near corner stays inside", inside(corner, 148, 40, 800, 600));
const tiny = placeLabel({ x: 10, y: 10 }, 148, 40, 100, 60);
check("label in tiny map clamps inside",
  tiny.x >= 8 && tiny.y >= 8);
check("planted: label covering the point is caught",
  !(centre.x <= 400 && 400 <= centre.x + 148 &&
    centre.y <= 300 && 300 <= centre.y + 40));

// --- spanColor / riskColor (phase 8a FUI palette: warmed zero, spec
// risk tokens, blue-biased null/unknown) ---
check("span null is dim blue-grey", spanColor(null) === "#8ea3c7");
check("span -4 is blue", spanColor(-4) === "#2166ac");
check("span +4 is red", spanColor(4) === "#b2182b");
check("span 0 is warmed white", spanColor(0) === "#f3f0ea");
check("span clamps beyond range", spanColor(10) === spanColor(4) &&
  spanColor(-10) === spanColor(-4));
check("risk colours",
  riskColor("high") === "#ff3b3b" && riskColor("elevated") === "#ff7a2f" &&
  riskColor("watch") === "#f2b84b" && riskColor("none") === "#3b4760" &&
  riskColor("unknown") === "#8ea3c7" && riskColor(null) === "#8ea3c7");
check("planted: swapped risk colours are caught",
  riskColor("high") !== "#3b4760");

// --- fastestSpan ---
const SPANS = [
  { span: 0, along_m: 21.3, n: 21, lat: 51.05, lon: 13.74,
    anomaly: [0.1, 3.18, -0.14] },
  { span: 1, along_m: 93.0, n: 19, lat: 51.05, lon: 13.74,
    anomaly: [-0.9, -0.91, -1.89] },
  { span: 5, along_m: 330.7, n: 10, lat: 51.05, lon: 13.74,
    anomaly: [null, 3.18, 3.99] }
];
const fast = fastestSpan(SPANS, 1);
check("fastest span picks largest abs", fast && fast.span === 0);
check("fastest span tie goes to lower id", fast && fast.span === 0);
check("fastest span value", fast && fast.value === 3.18);
check("fastest span ignores null", fastestSpan(SPANS, 0).span === 1);
check("fastest span all null returns null",
  fastestSpan([{ span: 0, anomaly: [null] }], 0) === null);
check("fastest span empty returns null", fastestSpan([], 0) === null);
check("planted: wrong span is caught",
  fastestSpan(SPANS, 2).span !== 0);

// --- deckGeometry ---
const DECK = [
  { span: 0, along_m: 21.3, anomaly: [0.1, 1.0, -0.14] },
  { span: 1, along_m: 93.0, anomaly: [-0.9, -2.0, -1.89] },
  { span: 2, along_m: 200.0, anomaly: [null, null, null] }
];
const geo = deckGeometry(DECK, 1, 432);
check("deck maxAbs", Math.abs(geo.maxAbs - 2.0) < 1e-9);
check("deck factor is 28/maxAbs", Math.abs(geo.factor - 14) < 1e-9);
check("deck largest maps to 28 px",
  Math.abs(Math.abs(geo.blocks[1].dy) - 28) < 1e-9);
check("deck x scales with along_m/lenM",
  geo.blocks[0].x < geo.blocks[1].x && geo.blocks[1].x < geo.blocks[2].x);
check("deck null is dim blue-grey and flat",
  geo.blocks[2].isNull === true && geo.blocks[2].dy === 0 &&
  geo.blocks[2].color === "#8ea3c7");
check("deck positive value displaces up", geo.blocks[0].dy < 0);
check("deck blocks sorted by along_m",
  geo.blocks.map((b) => b.span).join(",") === "0,1,2");
check("planted: unexaggerated deck is caught",
  Math.abs(Math.abs(geo.blocks[1].dy) - 2.0) > 1e-9);
check("planted: wrong factor is caught",
  Math.abs(geo.factor - (28 / 4.01)) > 1e-9 || geo.maxAbs !== 4.01);

// Negative control across the module: a planted bad geometry (flat deck)
// must differ from the real one, proving the checks discriminate.
const plantedFlat = geo.blocks.every((b) => b.dy === 0);
check("planted flat deck is caught", plantedFlat === false);

// --- phase 7b fix: Explore high-bridge list builder ---
function mkExploreDecision(rank, risk) {
  return { rank, model: { risk, inspect: risk === "high" } };
}
// August 2024 decisions fixture: two model-high bridges.
const AUG_TABLE = {
  4: mkExploreDecision(2, "high"), // Carolabrücke
  3: mkExploreDecision(5, "high"), // Budapester Straße
  0: mkExploreDecision(11, "watch")
};
const AUG_NAMES = { 4: "Carolabrücke", 3: "Budapester Straße", 0: "Albertbrücke" };
const AUG_CENTS = { 4: [13.747, 51.053], 3: [13.726, 51.0436], 0: [13.74, 51.05] };
const exList = exploreCalloutsFor(AUG_TABLE, AUG_NAMES, AUG_CENTS);
check("explore list holds every high bridge",
  exList.length === 2);
check("explore list names both bridges in rank order",
  exList.map((c) => c.title).join(",") === "Carolabrücke,Budapester Straße");
check("explore list carries inspect + leader points",
  exList.every((c) => c.sub === "inspect" &&
    typeof c.lon === "number" && typeof c.lat === "number"));
check("planted: single-name list is caught",
  exList.map((c) => c.title).join(",") !== "Carolabrücke");
check("explore list empty when nothing is high",
  exploreCalloutsFor({ 4: mkExploreDecision(2, "watch") },
    AUG_NAMES, AUG_CENTS).length === 0);
check("explore list skips bridges without a centroid",
  exploreCalloutsFor(AUG_TABLE, AUG_NAMES, {}).length === 0);

// --- phase 7b fix: label collisions move, never drop ---
const colFirst = placeLabel({ x: 400, y: 300 }, 148, 40, 800, 600);
const colSecond = placeLabel({ x: 400, y: 300 }, 148, 40, 800, 600,
  { placed: [{ x: colFirst.x, y: colFirst.y, w: 148, h: 40 }] });
function overlap(a, aw, ah, b, bw, bh, pad) {
  const p = pad === undefined ? 4 : pad;
  return a.x < b.x + bw + p && b.x < a.x + aw + p &&
    a.y < b.y + bh + p && b.y < a.y + ah + p;
}
check("colliding label moves off the taken box",
  !(colSecond.x === colFirst.x && colSecond.y === colFirst.y));
check("moved label does not overlap the taken box",
  !overlap(colSecond, 148, 40, colFirst, 148, 40));
check("moved label stays inside",
  inside(colSecond, 148, 40, 800, 600));
check("planted: stacked labels are caught",
  colSecond.x !== colFirst.x || colSecond.y !== colFirst.y);
const saturated = placeLabel({ x: 400, y: 300 }, 148, 40, 800, 600,
  { placed: [{ x: 0, y: 0, w: 800, h: 600 }] });
check("saturated map still places a label inside (never dropped)",
  inside(saturated, 148, 40, 800, 600));

// --- phase 8b: scene-3 light-up never stacks ---
// Twenty title-only labels (168x26, the s3 callout box) placed in rank
// order against the boxes already drawn, from a total pile-up (every
// bridge at the frame centre): no pair overlaps at either review size.
function pileUpPairs(mapW, mapH) {
  const placed = [];
  const pts = [];
  for (let k = 0; k < 20; k++) {
    const pos = placeLabel({ x: mapW / 2, y: mapH / 2 }, 168, 26,
      mapW, mapH, { placed });
    pts.push(pos);
    placed.push({ x: pos.x, y: pos.y, w: 168, h: 26 });
  }
  let ov = 0;
  for (let i = 0; i < 20; i++) {
    for (let j = i + 1; j < 20; j++) {
      if (overlap(pts[i], 168, 26, pts[j], 168, 26)) ov++;
    }
  }
  const inb = pts.filter((p) => inside(p, 168, 26, mapW, mapH)).length;
  return { ov, inb };
}
const pile1080 = pileUpPairs(1920, 1080);
const pile800 = pileUpPairs(1280, 800);
check("8b twenty piled-up labels do not overlap at 1920x1080",
  pile1080.ov === 0 && pile1080.inb === 20);
check("8b twenty piled-up labels do not overlap at 1280x800",
  pile800.ov === 0 && pile800.inb === 20);
check("planted: overlap-blind placement is caught",
  (() => {
    // Without the placed list every label takes the same preferred spot,
    // so the same pair scan must report overlaps (the positive checks
    // above are not vacuous, and collisions do the de-clustering).
    const pts = [];
    for (let k = 0; k < 20; k++) {
      pts.push(placeLabel({ x: 960, y: 540 }, 168, 26, 1920, 1080));
    }
    for (let i = 0; i < 20; i++) {
      for (let j = i + 1; j < 20; j++) {
        if (overlap(pts[i], 168, 26, pts[j], 168, 26)) return true;
      }
    }
    return false;
  })());

// --- phase 8c-1 fix item 4: the span callout draws a leader line ---
// Span callout box is 168x48 (annotateDrawOne spanStyle); the point is a
// representative fastest-span projection near the frame centre at 1280x800.
const SPAN_PT = { x: 640, y: 400 };
const SPAN_POS = placeLabel(SPAN_PT, 168, 48, 1280, 800);
const SPAN_ENDS = calloutLineEnds(SPAN_PT, SPAN_POS, 168, 48);
check("8c-1-fix span callout leader line has non-zero length",
  SPAN_ENDS.len >= 12 &&
  (SPAN_ENDS.x1 !== SPAN_ENDS.x2 || SPAN_ENDS.y1 !== SPAN_ENDS.y2));
check("8c-1-fix leader line runs from the point to the box edge",
  SPAN_ENDS.x1 === SPAN_PT.x && SPAN_ENDS.y1 === SPAN_PT.y &&
  SPAN_ENDS.x2 >= SPAN_POS.x && SPAN_ENDS.x2 <= SPAN_POS.x + 168 &&
  SPAN_ENDS.y2 >= SPAN_POS.y && SPAN_ENDS.y2 <= SPAN_POS.y + 48);
check("planted: zero-length leader line is caught",
  calloutLineEnds({ x: 0, y: 0 }, { x: 0, y: 0 }, 0, 0).len === 0 &&
  SPAN_ENDS.len > 0);
check("8c-1-fix real September fastest span exists with a map position",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const js = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
        "web", "data", "spans.json"), "utf8"));
      const best = fastestSpan(js.spans["4"], 32);
      console.log(`  info: September fastest is span ${best.span}, ` +
        `${formatSpanValue(best.value)} at ${best.lon},${best.lat}`);
      return best && best.span === 5 && best.value === 3.99 &&
        Number.isFinite(best.lon) && Number.isFinite(best.lat);
    } catch (e) { return false; }
  })());

// --- phase 8c-2 leftover: the span callout leader is at least 60 px ---
// The 12 px default gap drew a ~17 px line; span callouts place with the
// 60 px gap up and to the right (168x48 label, 3 px dot + 12 px brackets
// in annotateDrawOne). Geometry is checked for a central projection at
// the 1280x800 review size, the same shape the real September fastest
// span's callout takes.
check("8c-2 span gap is 60 px on a 168x48 label",
  ann.ANNOTATE_SPAN_GAP === 60 &&
  ann.ANNOTATE_SPAN_LABEL_W === 168 &&
  ann.ANNOTATE_SPAN_LABEL_H === 48);
check("8c-2 span callout leader is at least 60 px, up and to the right",
  (() => {
    const pt = { x: 640, y: 400 };
    const pos = placeLabel(pt, 168, 48, 1280, 800,
      { gap: ann.ANNOTATE_SPAN_GAP });
    const ends = calloutLineEnds(pt, pos, 168, 48);
    console.log(`  info: span leader ${ends.len.toFixed(1)} px ` +
      `to (${ends.x2.toFixed(0)},${ends.y2.toFixed(0)})`);
    return ends.len >= 60 &&
      pos.x > pt.x && (pos.y + 48) < pt.y &&
      ends.x1 === pt.x && ends.y1 === pt.y;
  })());
check("planted: the 12 px default gap stays short (the shipped bug)",
  (() => {
    const pt = { x: 640, y: 400 };
    const pos = placeLabel(pt, 168, 48, 1280, 800);
    return calloutLineEnds(pt, pos, 168, 48).len < 60;
  })());
check("8c-2 real September fastest span keeps its map position",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const js = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
        "web", "data", "spans.json"), "utf8"));
      const best = fastestSpan(js.spans["4"], 32);
      if (!best || best.span !== 5) return false;
      const pt = { x: 640, y: 400 };
      const pos = placeLabel(pt, ann.ANNOTATE_SPAN_LABEL_W,
        ann.ANNOTATE_SPAN_LABEL_H, 1280, 800, { gap: ann.ANNOTATE_SPAN_GAP });
      const ends = calloutLineEnds(pt, pos,
        ann.ANNOTATE_SPAN_LABEL_W, ann.ANNOTATE_SPAN_LABEL_H);
      return ends.len >= 60 && Number.isFinite(best.lon) &&
        Number.isFinite(best.lat);
    } catch (e) { return false; }
  })());

// --- phase 8c-2 evidence card: chip projection from s2_visual.json ---
// Corners are [TL, TR, BR, BL] in EPSG:4326; the chip is 93x91. Corners
// map exactly; a known Carolabrücke SAM vertex lands inside the chip.
function loadChip8c2() {
  const fs = require("fs");
  const path = require("path");
  const chip = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
    "web", "data", "s2_visual.json"), "utf8"));
  const sam = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
    "web", "data", "sam.geojson"), "utf8"));
  const carola = (sam.features || []).find((f) =>
    f && f.properties && f.properties.bridge === "Carolabrücke");
  return { chip, carola };
}
check("8c-2 chip corners map to the chip edges",
  (() => {
    try {
      const { chip } = loadChip8c2();
      const c = chip.coordinates;
      const W = chip.width, H = chip.height;
      if (W !== 93 || H !== 91) return false;
      const tl = s2ChipProject(c[0][0], c[0][1], c, W, H);
      const tr = s2ChipProject(c[1][0], c[1][1], c, W, H);
      const br = s2ChipProject(c[2][0], c[2][1], c, W, H);
      const bl = s2ChipProject(c[3][0], c[3][1], c, W, H);
      const near = (p, x, y) => p &&
        Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;
      return near(tl, 0, 0) && near(tr, W, 0) &&
        near(br, W, H) && near(bl, 0, H);
    } catch (e) { return false; }
  })());
check("8c-2 known SAM vertex projects inside the chip",
  (() => {
    try {
      const { chip, carola } = loadChip8c2();
      if (!carola) return false;
      const ring = carola.geometry.coordinates[0];
      const v = ring[0];
      const p = s2ChipProject(v[0], v[1], chip.coordinates,
        chip.width, chip.height);
      console.log(`  info: SAM vertex ${v} -> chip ` +
        `(${(p && p.x.toFixed(1))},${(p && p.y.toFixed(1))})`);
      return p && p.u > 0.8 && p.u < 0.95 && p.v > 0.15 && p.v < 0.25 &&
        p.x > 0 && p.x < chip.width && p.y > 0 && p.y < chip.height;
    } catch (e) { return false; }
  })());
check("planted: swapped corner order misses the chip",
  (() => {
    try {
      const { chip, carola } = loadChip8c2();
      if (!carola) return false;
      const c = chip.coordinates;
      const swapped = [c[1], c[0], c[3], c[2]];
      const ring = carola.geometry.coordinates[0];
      const v = ring[0];
      const good = s2ChipProject(v[0], v[1], c, chip.width, chip.height);
      const bad = s2ChipProject(v[0], v[1], swapped, chip.width, chip.height);
      if (!good || !bad) return false;
      const drift = Math.hypot(bad.x - good.x, bad.y - good.y);
      console.log(`  info: swapped-order drift ${drift.toFixed(1)} px`);
      return drift > 1 &&
        !(bad.u > 0.8 && bad.u < 0.95 && bad.v > 0.15 && bad.v < 0.25);
    } catch (e) { return false; }
  })());
check("8c-2 chip projection rejects bad input",
  s2ChipProject(null, 51, [[[0, 0]]], 93, 91) === null &&
  s2ChipProject(13.7, 51.05, null, 93, 91) === null &&
  s2ChipProject(13.7, 51.05,
    [[13.73, 51.05], [13.74, 51.05], [13.74, 51.04], [13.73, 51.04]],
    0, 91) === null);

// --- phase 8c-3 item 3: Europe labels drop on collision, never overlap ---
check("8c-3 europe label geometry is 8 px right on a 14 px box",
  ann.EUROPE_LABEL_GAP === 8 && ann.EUROPE_LABEL_H === 14 &&
  ann.EUROPE_LABEL_CHAR_W === 7 &&
  europeLabelBox("DRESDEN").w === 7 * 7 + 4 &&
  europeLabelBox("DRESDEN").h === 14 &&
  europeLabelBox("COPENHAGEN").w === 10 * 7 + 4);
check("8c-3 europe band top clears the letterbox plus ~140 px",
  Math.abs(europeBandTop(800) - (800 - (800 * 0.08 + 140))) < 1e-9 &&
  Math.abs(europeBandTop(1080) - (1080 - (1080 * 0.08 + 140))) < 1e-9 &&
  europeBandTop(800) === 596);
check("8c-3 planted overlapping labels: the second drops, never stacks",
  (() => {
    const kept = europeKeptLabels([
      { name: "Rome", x: 640, y: 300 },
      { name: "Milan", x: 640, y: 300 }
    ], 1280, 800, 596);
    return kept.length === 1 && kept[0].name === "Rome" &&
      kept[0].lx === 648 && kept[0].ly === 293;
  })());
check("8c-3 edge touch counts as a collision (second drops)",
  (() => {
    // Rome at x 640: box lx 648, w 32 ("Rome" 4 chars: 4*7+4), so the box
    // spans 648-680. Milan's dot at 672 puts its box at 680: touching.
    const kept = europeKeptLabels([
      { name: "Rome", x: 640, y: 300 },
      { name: "Milan", x: 672, y: 300 }
    ], 1280, 800, 596);
    return kept.length === 1 && kept[0].name === "Rome";
  })());
check("8c-3 label inside the caption band drops (planted ROMA case)",
  (() => {
    const kept = europeKeptLabels([
      { name: "Roma", x: 640, y: 595 }
    ], 1280, 800, 596);
    // Label box ly 588, h 14: 588 + 14 = 602 >= 596 touches the band.
    return kept.length === 0;
  })());
check("8c-3 label touching the band edge drops, clear label keeps",
  (() => {
    const touch = europeKeptLabels([
      { name: "Roma", x: 640, y: 589 }
    ], 1280, 800, 596);
    // ly 582 + 14 = 596: exactly touching, still dropped.
    const clear = europeKeptLabels([
      { name: "Roma", x: 640, y: 580 }
    ], 1280, 800, 596);
    // ly 573 + 14 = 587 < 596: kept.
    return touch.length === 0 && clear.length === 1;
  })());
check("8c-3 spread labels all keep, 8 px right, never overlapping",
  (() => {
    const dots = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        dots.push({ name: `C${r}${c}`, x: 100 + c * 200, y: 100 + r * 100 });
      }
    }
    const kept = europeKeptLabels(dots, 1280, 800, 596);
    if (kept.length !== 15) return false;
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].lx !== kept[i].x + 8) return false;
      for (let j = i + 1; j < kept.length; j++) {
        const a = kept[i], b = kept[j];
        const touch = (a.lx <= b.lx + b.w && b.lx <= a.lx + a.w &&
          a.ly <= b.ly + b.h && b.ly <= a.ly + a.h);
        if (touch) return false;
      }
    }
    return true;
  })());
check("planted: overlap-blind europe placement is caught",
  (() => {
    // Without the filter both piled labels would draw; the rule keeps one.
    const kept = europeKeptLabels([
      { name: "Rome", x: 640, y: 300 },
      { name: "Milan", x: 640, y: 300 }
    ], 1280, 800, 596);
    return kept.length !== 2;
  })());

if (failures) {
  console.log(`test_annotate: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_annotate: PASS");
