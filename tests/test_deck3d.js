"use strict";
// Phase 7d: fixture-driven test for the pure parts of web/deck3d.js
// (span colours, exaggeration, deckMeshSpec box layout, Mercator helpers,
// long-axis bearing, HUD lines, ring-radius scale). Run with:
//   node tests/test_deck3d.js
const deck = require("../web/deck3d.js");
const {
  deckSpanColor, deckMaxAbs, deckExaggeration, deckMeshSpec,
  deckSeatedStyle,
  deckMercatorXY, deckMeterScale, deckAxisBearing,
  deckLonLatBearing, deckOrientBearing,
  deckRotYRad, deckModelDirToMap, deckSeatedLight,
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
check("span 0 is warmed white", deckSpanColor(0) === "#f3f0ea");
check("span null is dim blue-grey", deckSpanColor(null) === "#8ea3c7");
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
check("null span is dim blue-grey and flat at the baseline",
  spec.boxes[2].isNull === true && spec.boxes[2].y === 0 &&
  spec.boxes[2].color === "#8ea3c7");
check("planted: flat deck with non-zero anomalies is caught",
  spec.boxes.some((b) => b.y !== 0));
check("span colours follow the span scale",
  spec.boxes[0].color === deckSpanColor(1.0) &&
  spec.boxes[1].color === "#abd9e9");
check("planted: colour mismatch is caught",
  spec.boxes[0].color !== "#b2182b" &&
  spec.boxes[1].color !== deckSpanColor(1.0));
check("high bridge gets the red glow emissive",
  spec.boxes.every((b) => b.emissive === "#ff3b3b") &&
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

// --- phase 8c-1: seated mode (story close-up) ---
const SEATED = deckMeshSpec(SPANS, MIDX, LEN, 5,
  { mode: "seated", risk: "high" });
const SEATED_CAP = deck.DECK_SEATED_TILT_DEG * Math.PI / 180;
check("8c-1 seated constants",
  deck.DECK_SEATED_TOP_M === 12 && deck.DECK_SEATED_THICK_M === 2 &&
  deck.DECK_SEATED_TILT_DEG === 2.5 && deck.DECK_SEATED_PIER_M === 3);
check("8c-1 seated spec carries its mode",
  SEATED.mode === "seated");
check("8c-1 omitted mode keeps the exaggerated bars",
  deckMeshSpec(SPANS, MIDX, LEN, 5, { risk: "high" }).mode === undefined &&
  Math.abs(deckMeshSpec(SPANS, MIDX, LEN, 5, {}).boxes[1].y + 20) < 1e-9);
check("8c-1 seated deck top is 12 m, 2 m thick",
  SEATED.boxes.every((b) => b.y === 11 && b.thick === 2));
check("8c-1 seated segments tile the deck",
  Math.abs(SEATED.boxes.reduce((a, b) => a + b.len, 0) - LEN) < 1e-9);
check("8c-1 seated piers stand at each span joint, 3x3 from 0 to 10 m",
  SEATED.pillars.length === SPANS.length - 1 &&
  SEATED.pillars.every((p) => p.w === 3 && p.d === 3 &&
    p.h === 10 && p.y === 5) &&
  SEATED.pillars.every((p, i) =>
    Math.abs(p.x - (SEATED.boxes[i].x + SEATED.boxes[i].len / 2)) < 1e-9));
check("8c-1 seated tilt scales to the shown month (worst span 2.5 deg)",
  SEATED.monthMaxAbs === 2.0 && SEATED.tiltCapDeg === 2.5 &&
  Math.abs(SEATED.boxes[1].rotZ + SEATED_CAP) < 1e-9 &&
  Math.abs(SEATED.boxes[0].rotZ - SEATED_CAP / 2) < 1e-9 &&
  SEATED.boxes[2].rotZ === 0);
check("8c-1 seated tilt never exceeds the cap",
  SEATED.boxes.every((b) => Math.abs(b.rotZ) <= SEATED_CAP + 1e-12));
check("planted: a span tilted 10 deg is caught",
  (10 * Math.PI / 180) > SEATED_CAP &&
  SEATED.boxes.every((b) => Math.abs(b.rotZ) < 10 * Math.PI / 180));
check("8c-1 seated colours follow the month's class, high blooms faintly",
  SEATED.boxes[0].color === "#ff3b3b" &&
  SEATED.boxes[0].emissive === "#ff3b3b" &&
  SEATED.boxes[0].emissiveIntensity === deck.DECK_SEATED_EMISSIVE &&
  deckMeshSpec(SPANS, MIDX, LEN, 5,
    { mode: "seated", risk: "watch" }).boxes[0].color === "#f2b84b" &&
  deckMeshSpec(SPANS, MIDX, LEN, 5,
    { mode: "seated", risk: "none" }).boxes[0].color === "#4d6a9e");
check("8c-1 seated null spans are dim at 60 %",
  SEATED.boxes[2].isNull === true &&
  SEATED.boxes[2].color === "#8ea3c7" &&
  SEATED.boxes[2].opacity === 0.6 &&
  SEATED.boxes[0].opacity === 1);
check("planted: per-span seated colours are caught",
  SEATED.boxes[0].color === SEATED.boxes[1].color &&
  SEATED.boxes[0].color !== deckSpanColor(1.0));
check("8c-1 real Carolabrücke September deck seats 5 boxes on 4 piers",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const js = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
        "web", "data", "spans.json"), "utf8"));
      const s = deckMeshSpec(js.spans["4"], 32, 432, 0,
        { mode: "seated", risk: "high" });
      const top = Math.max(...s.boxes.map((b) => Math.abs(b.rotZ)));
      console.log(`  info: seated September monthMax ${s.monthMaxAbs} mm/yr, ` +
        `worst tilt ${(top * 180 / Math.PI).toFixed(2)} deg`);
      return s.boxes.length === 5 && s.pillars.length === 4 &&
        s.boxes.every((b) => b.y === 11 && b.thick === 2) &&
        Math.abs(top - SEATED_CAP) < 1e-12;
    } catch (e) { return false; }
  })());

// --- phase 8c-1 fix item 1: local X renders at the axis bearing ---
// Builds the same matrix as render() (translate · scale(s,−s,s) ·
// rotX(π/2) · rotY): direction only, so unit scale and no translation.
// Mercator Y-south convention: east = +x, north = −y (south = +y).
function matMul3(a, b) {
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      c[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return c;
}
function matVec3(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}
function rotY3(th) {
  const c = Math.cos(th), s = Math.sin(th);
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}
function rotX3(th) {
  const c = Math.cos(th), s = Math.sin(th);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}
// Unit-X through S·Rx·Ry with the shipped rotation angle.
function shippedUnitX(axisDeg) {
  const ry = rotY3(deckRotYRad(axisDeg));
  const rx = rotX3(Math.PI / 2);
  const sc = [[1, 0, 0], [0, -1, 0], [0, 0, 1]];
  const m = matMul3(sc, matMul3(rx, ry));
  const v = matVec3(m, [1, 0, 0]);
  return { east: v[0], north: -v[1], up: v[2] };
}
// Planted old formula: rotY(axis−90°) mirrors about north.
function oldUnitX(axisDeg) {
  const ry = rotY3((Number(axisDeg) - 90) * Math.PI / 180);
  const rx = rotX3(Math.PI / 2);
  const sc = [[1, 0, 0], [0, -1, 0], [0, 0, 1]];
  const m = matMul3(sc, matMul3(rx, ry));
  const v = matVec3(m, [1, 0, 0]);
  return { east: v[0], north: -v[1], up: v[2] };
}
function axisBearingOf(east, north) {
  let b = Math.atan2(east, north) * 180 / Math.PI;
  if (b < 0) b += 360;
  return b;
}
for (const axis of [350.8, 45]) {
  const v = shippedUnitX(axis);
  const wantE = Math.sin(axis * Math.PI / 180);
  const wantN = Math.cos(axis * Math.PI / 180);
  check(`8c-1-fix unit X renders at ${axis}° (east≈sin, north≈cos)`,
    Math.abs(v.east - wantE) < 1e-9 &&
    Math.abs(v.north - wantN) < 1e-9 &&
    Math.abs(v.up) < 1e-9);
  console.log(`  info: axis ${axis}° renders at ` +
    `${axisBearingOf(v.east, v.north).toFixed(2)}°`);
  const h = deckModelDirToMap(axis, 1, 0, 0);
  check(`8c-1-fix helper agrees with the matrix at ${axis}°`,
    Math.abs(h.east - wantE) < 1e-9 &&
    Math.abs(h.north - wantN) < 1e-9 &&
    Math.abs(h.up) < 1e-9);
  const o = oldUnitX(axis);
  const wantOld = (180 - axis + 360) % 360;
  check(`planted: old rotY(axis−90°) mirrors to ${(wantOld).toFixed(1)}°, not ${axis}°`,
    Math.abs(axisBearingOf(o.east, o.north) - wantOld) < 1e-6 &&
    Math.abs(o.north - wantN) > 0.1);
}
check("8c-1-fix render() uses the corrected rotation",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const src = fs.readFileSync(path.join(__dirname, "..",
        "web", "deck3d.js"), "utf8");
      return src.indexOf("deckRotYRad(deckAxisDeg)") !== -1 &&
        src.indexOf("(deckAxisDeg - 90)") === -1;
    } catch (e) { return false; }
  })());

// --- phase 8c-1 fix item 2: faint emissive, Lambert, low SE light ---
check("8c-1-fix seated emissive is faint (0 < e <= 0.15)",
  deck.DECK_SEATED_EMISSIVE > 0 &&
  deck.DECK_SEATED_EMISSIVE <= 0.15);
check("planted: old 0.25 emissive is caught",
  deck.DECK_SEATED_EMISSIVE !== 0.25 &&
  deck.DECK_SEATED_EMISSIVE < 0.25);
check("8c-1-fix high spans carry the faint emissive",
  deckSeatedStyle("high", false).emissiveIntensity ===
    deck.DECK_SEATED_EMISSIVE &&
  deckSeatedStyle("high", false).emissiveIntensity <= 0.15 &&
  SEATED.boxes[0].emissiveIntensity <= 0.15);
for (const axis of [350.8, 45]) {
  const lp = deckSeatedLight(axis);
  const md = deckModelDirToMap(axis, lp[0], lp[1], lp[2]);
  const b = axisBearingOf(md.east, md.north);
  const horiz = Math.hypot(md.east, md.north);
  const elev = Math.atan2(md.up, horiz) * 180 / Math.PI;
  check(`8c-1-fix seated light is low from the south-east at axis ${axis}°`,
    Math.abs(b - 135) < 2 && md.east > 0 && md.north < 0 &&
    md.up > 0 && elev > 10 && elev < 22);
  console.log(`  info: axis ${axis}° light maps to bearing ` +
    `${b.toFixed(1)}°, elevation ${elev.toFixed(1)}°`);
}
check("planted: fixed model light drifts off south-east at axis 45°",
  (() => {
    const md = deckModelDirToMap(45, -120, 42, 90);
    const b = axisBearingOf(md.east, md.north);
    return Math.abs(b - 135) > 10;
  })());
check("8c-1-fix scene uses MeshLambert with 0.45 ambient + 0.9 directional",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const src = fs.readFileSync(path.join(__dirname, "..",
        "web", "deck3d.js"), "utf8");
      return src.indexOf("MeshLambertMaterial") !== -1 &&
        src.indexOf("MeshBasicMaterial") === -1 &&
        src.indexOf("deckSeatedLight(") !== -1 &&
        src.indexOf("deckBuildScene(spec, orientedAxis)") !== -1 &&
        src.indexOf("AmbientLight(0xffffff, seated ? 0.45") !== -1 &&
        src.indexOf("DirectionalLight(0xffffff, 0.9)") !== -1 &&
        src.indexOf("dir.position.set(-120, 42, 90)") === -1;
    } catch (e) { return false; }
  })());

if (failures) {
  console.log(`test_deck3d: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_deck3d: PASS");
