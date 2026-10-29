"use strict";
// Phase 7d: fixture-driven test for the pure parts of web/deck3d.js
// (span colours, exaggeration, deckMeshSpec box layout, Mercator helpers,
// long-axis bearing, HUD lines, ring-radius scale). Run with:
//   node tests/test_deck3d.js
const deck = require("../web/deck3d.js");
const {
  deckSpanColor, deckMaxAbs, deckExaggeration, deckMeshSpec,
  deckMercatorXY, deckMeterScale, deckAxisBearing,
  deckLonLatBearing, deckOrientBearing,
  hudWorryFor, hudLinesFor, deckRingRadiusPx
} = deck;

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}`);
  }
}

// Three-span fixture: mixed signs plus one all-null span, like the
// merged Carolabrücke spans (ids need not be consecutive).
const SPANS = [
  { span: 0, along_m: 20, lon: 13.7472, lat: 51.053,
    anomaly: [0.5, 1.0, -0.5] },
  { span: 1, along_m: 100, lon: 13.7471, lat: 51.054,
    anomaly: [-1.0, -2.0, 1.5] },
  { span: 5, along_m: 200, lon: 13.7468, lat: 51.055,
    anomaly: [null, null, null] }
];
const LEN = 432;
const MIDX = 1; // [1.0, -2.0, null]

// --- span colours (same stops as annotate.js spanColor) ---
check("span -2 is blue-grey", deckSpanColor(-2) === "#abd9e9");
check("span +2 is orange", deckSpanColor(2) === "#fdae61");
check("span 0 is light", deckSpanColor(0) === "#f5f5f5");
check("span null is grey", deckSpanColor(null) === "#9ca3af");
check("span clamps beyond range", deckSpanColor(10) === deckSpanColor(4) &&
  deckSpanColor(-10) === deckSpanColor(-4));
check("planted: swapped span colours are caught",
  deckSpanColor(-4) !== "#b2182b");

// --- exaggeration: largest absolute anomaly -> fixed visual height ---
check("maxAbs over the whole series", deckMaxAbs(SPANS) === 2.0);
check("maxAbs skips nulls", deckMaxAbs([{ span: 0, anomaly: [null] }]) === 0);
const ex = deckExaggeration(SPANS, 20);
check("mPerUnit is maxHeight/maxAbs",
  Math.abs(ex.mPerUnit - 10) < 1e-9);
check("default max height is 20 m",
  deckExaggeration(SPANS).maxHeightM === 20);
check("zero series gives zero exaggeration",
  deckExaggeration([{ span: 0, anomaly: [null, 0] }]).mPerUnit === 0);
check("planted: unexaggerated metres are caught",
  Math.abs(ex.mPerUnit - 1) > 1e-9);

// --- deckMeshSpec ---
const spec = deckMeshSpec(SPANS, MIDX, LEN, 5, { risk: "high" });
check("box count equals the span count",
  spec.boxes.length === SPANS.length);
check("planted: wrong span count is caught", spec.boxes.length !== 5);
check("boxes sorted by along_m",
  spec.boxes.map((b) => b.span).join(",") === "0,1,5");
check("boxes centred on the deck",
  spec.boxes[0].x < spec.boxes[1].x && spec.boxes[1].x < spec.boxes[2].x &&
  spec.boxes[0].x < 0 && spec.boxes[2].x > 0);
check("box sizes: width 12 m, thickness 1.5 m",
  spec.boxes.every((b) => b.width === 12 && b.thick === 1.5));
check("segment lengths tile the deck",
  Math.abs(spec.boxes.reduce((a, b) => a + b.len, 0) - LEN) < 1e-9);
check("largest anomaly maps to the fixed height",
  Math.abs(Math.abs(spec.boxes[1].y) - 20) < 1e-9);
check("heights follow the bound month (10 m per mm/yr)",
  Math.abs(spec.boxes[0].y - 10) < 1e-9 &&
  Math.abs(spec.boxes[1].y + 20) < 1e-9);
check("null span is grey and flat at the baseline",
  spec.boxes[2].isNull === true && spec.boxes[2].y === 0 &&
  spec.boxes[2].color === "#9ca3af");
check("planted: flat deck with non-zero anomalies is caught",
  spec.boxes.some((b) => b.y !== 0));
check("span colours follow the span scale",
  spec.boxes[0].color === deckSpanColor(1.0) &&
  spec.boxes[1].color === "#abd9e9");
check("planted: colour mismatch is caught",
  spec.boxes[0].color !== "#b2182b" &&
  spec.boxes[1].color !== deckSpanColor(1.0));
check("high bridge gets the red glow emissive",
  spec.boxes.every((b) => b.emissive === "#ef4444") &&
  spec.boxes.every((b) => b.emissiveIntensity === 0.55));
check("quiet bridge gets no emissive",
  deckMeshSpec(SPANS, MIDX, LEN, 5, { risk: "watch" }).boxes
    .every((b) => b.emissive === "#000000" && b.emissiveIntensity === 0));
check("end boxes tilt to meet their neighbour",
  spec.boxes[0].rotZ !== 0 && spec.boxes[1].rotZ !== 0);
check("tilt sign follows the slope (downhill eastward)",
  spec.boxes[0].rotZ < 0);
check("planted: untilted deck is caught",
  !(spec.boxes[0].rotZ === 0 && spec.boxes[1].rotZ === 0));
check("pillars stand under the interior joints",
  spec.pillars.length === SPANS.length - 1 &&
  spec.pillars.every((p) => p.h > 0));
check("axis bearing is carried through", spec.axisBearing === 5);
check("spec carries the scale",
  spec.maxAbs === 2.0 && Math.abs(spec.mPerUnit - 10) < 1e-9);

// --- Mercator helpers ---
const carolaXY = deckMercatorXY(13.7472, 51.053);
check("Carolabrücke Mercator x",
  Math.abs(carolaXY.x - 0.53819) < 1e-4);
check("Carolabrücke Mercator y",
  Math.abs(carolaXY.y - 0.33454) < 1e-4);
check("planted: swapped Mercator axes are caught",
  Math.abs(carolaXY.x - 0.33454) > 1e-3);
check("metre scale at 51N is ~3.97e-8",
  Math.abs(deckMeterScale(51.053) - 3.965e-8) < 1e-10);
check("metre scale grows with latitude",
  deckMeterScale(51) > deckMeterScale(0));
check("planted: unit metre scale is caught",
  Math.abs(deckMeterScale(51) - 1) > 1e-9);

// --- long-axis bearing ---
const NS_RING = [[13.747, 51.052], [13.7472, 51.052], [13.7472, 51.056],
  [13.747, 51.056], [13.747, 51.052]];
const nsBrg = deckAxisBearing(NS_RING);
check("north-south polygon bears ~0/180",
  Math.min(nsBrg, Math.abs(nsBrg - 180), Math.abs(nsBrg - 360)) < 5);
const EW_RING = [[13.74, 51.054], [13.75, 51.054], [13.75, 51.0543],
  [13.74, 51.0543], [13.74, 51.054]];
const ewBrg = deckAxisBearing(EW_RING);
check("east-west polygon bears ~90/270",
  Math.min(Math.abs(ewBrg - 90), Math.abs(ewBrg - 270)) < 5);
check("planted: cross-axis bearing is caught",
  Math.min(nsBrg, Math.abs(nsBrg - 180), Math.abs(nsBrg - 360)) < 5 &&
  Math.min(Math.abs(nsBrg - 90), Math.abs(nsBrg - 270)) > 5);
check("degenerate ring bears 0", deckAxisBearing([]) === 0);
check("lon/lat bearing runs north and east",
  Math.abs(deckLonLatBearing(13.7, 51.05, 13.7, 51.06) - 0) < 1e-9 &&
  Math.abs(deckLonLatBearing(13.7, 51.05, 13.71, 51.05) - 90) < 0.5);
// The fixture spans run south-to-north with along_m: a north-pointing
// axis stays, a south-pointing one flips so +X follows along_m.
check("oriented bearing keeps the span direction",
  Math.abs(deckOrientBearing(5, SPANS) - 5) < 1e-9);
check("oriented bearing flips a mirrored axis",
  Math.abs(deckOrientBearing(185, SPANS) - 5) < 1e-9);
check("planted: mirrored deck is caught",
  Math.abs(deckOrientBearing(185, SPANS) - 185) > 90);
check("orientation without positions returns the axis",
  deckOrientBearing(42, [{ span: 0, along_m: 1, anomaly: [1] }]) === 42);

// Carolabrücke's real polygon runs near north-south.
check("real Carolabrücke polygon bears near north-south",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const gj = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
        "web", "data", "bridges.geojson"), "utf8"));
      const f = gj.features.find((x) => x.properties &&
        x.properties.name === "Carolabrücke");
      if (!f) return false;
      const ring = f.geometry.coordinates[0];
      const b = deckAxisBearing(ring);
      console.log(`  info: Carolabrücke axis bearing ${b.toFixed(1)}°`);
      return Math.min(b, Math.abs(b - 180), Math.abs(b - 360)) < 25;
    } catch (e) { return false; }
  })());

// --- HUD lines ---
check("worry words",
  hudWorryFor("high").worry === "send an inspector" &&
  hudWorryFor("elevated").worry === "look closer" &&
  hudWorryFor("watch").worry === "keep watching" &&
  hudWorryFor("none").worry === "fine");
check("worry keeps the technical term",
  hudWorryFor("high").tech === "high" &&
  hudWorryFor("watch").tech === "watch");
const hud = hudLinesFor("Carolabrücke", "2024-09-01", 1, 19, 4.43, "high");
check("HUD is four sparse lines",
  hud.lines.length === 4 &&
  hud.lines[0] === "Carolabrücke" &&
  hud.lines[1] === "2024-09-01" &&
  hud.lines[2] === "rank 1 of 19 · z 4.43" &&
  hud.lines[3] === "send an inspector");
check("planted: invented HUD field is caught",
  hud.lines.join("\n").indexOf("mm/yr") === -1);
check("HUD nulls render dashes",
  hudLinesFor("X", "2024-09-01", null, 19, null, "watch").lines[2] ===
  "rank — of 19 · z —");

// --- ring-radius scale law ---
const r14 = deckRingRadiusPx(250, 14, 51.053);
const r15 = deckRingRadiusPx(250, 15, 51.053);
check("ring radius doubles every zoom",
  Math.abs(r15 / r14 - 2) < 1e-9);
check("250 m at zoom 15 is ~80 px",
  r15 > 60 && r15 < 110);
check("planted: zoom-blind rings are caught", r15 !== r14);

// --- real Carolabrücke exaggeration ---
check("real Carolabrücke maxAbs is 4.01 mm/yr",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const js = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
        "web", "data", "spans.json"), "utf8"));
      const m = deckMaxAbs(js.spans["4"]);
      console.log(`  info: Carolabrücke maxAbs ${m} mm/yr, ` +
        `mPerUnit ${(20 / m).toFixed(3)} m per mm/yr`);
      return Math.abs(m - 4.01) < 1e-9;
    } catch (e) { return false; }
  })());
check("real Carolabrücke deck has 5 boxes",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const js = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
        "web", "data", "spans.json"), "utf8"));
      const s = deckMeshSpec(js.spans["4"], 32, 432, 0, {});
      // September's largest span (3.99) sits just under the fixed 20 m
      // height, which belongs to the series max (4.01, month 21).
      const top = Math.max(...s.boxes.map((b) => Math.abs(b.y)));
      const sMax = deckMeshSpec(js.spans["4"], 21, 432, 0, {});
      const topMax = Math.max(...sMax.boxes.map((b) => Math.abs(b.y)));
      return s.boxes.length === 5 &&
        s.pillars.length === 4 &&
        Math.abs(top - 3.99 * s.mPerUnit) < 1e-6 &&
        Math.abs(topMax - 20) < 1e-6;
    } catch (e) { return false; }
  })());

if (failures) {
  console.log(`test_deck3d: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_deck3d: PASS");
