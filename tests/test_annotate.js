"use strict";
// Phase 7b: fixture-driven test for the pure parts of web/annotate.js
// (counter formatting, projection, label placement, colours, fastest
// span, side-view geometry). Run with:
//   node tests/test_annotate.js
const ann = require("../web/annotate.js");
const {
  formatCounter, formatSpanValue, formatRankCounter, formatSamLabel,
  projectPath, placeLabel, spanColor, riskColor, fastestSpan, deckGeometry,
  exploreCalloutsFor
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

if (failures) {
  console.log(`test_annotate: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_annotate: PASS");
