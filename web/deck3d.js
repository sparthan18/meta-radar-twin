"use strict";
// RadarTwin 3D deck (phase 7d): Carolabrücke's spans as a MapLibre custom
// layer (three.js), plus the HUD helpers for the close-up.
//
// Pure part (no DOM, no map, no THREE) runs in node and is tested by
// tests/test_deck3d.js: span colours, exaggeration, the box layout
// (deckMeshSpec), Web-Mercator helpers, the polygon long-axis bearing,
// the HUD lines and the ring-radius scale. The browser part (below the
// banner) implements CustomLayerInterface (renderingMode "3d") with a
// three.js scene whose camera takes the projection matrix MapLibre hands
// to render() each frame.
//
// Scene data rule: every height and every HUD line reads only the bound
// month's anomaly/decisions. The exaggeration denominator (maxAbs) is the
// whole-series largest absolute anomaly, like the SVG side view's
// "vertical ×factor" label; it is a fixed visual scale, not month data.

// ---------- Pure part ----------

const DECK_WIDTH_M = 12;
const DECK_THICKNESS_M = 1.5;
const DECK_MAX_HEIGHT_M = 20;
const DECK_PILLAR_FOOT_M = -8;
const DECK_RING_RADII_M = [250, 300];
const DECK_TWEEN_MS = 600;
// Phase 8c-1 seated mode (story close-up; spec section 4): one continuous
// slab on piers at true height. Deck top 12 m above the water, 2 m thick;
// piers 3 m x 3 m from 0 m to the deck's underside (10 m); per-span pitch
// scaled so the worst span of the shown month tilts 2.5 degrees, never
// more. Quiet (none/unknown) spans carry the prism tone; watch/elevated/
// high carry the ladder tokens; high adds a faint red emissive bloom.
const DECK_SEATED_TOP_M = 12;
const DECK_SEATED_THICK_M = 2;
const DECK_SEATED_TILT_DEG = 2.5;
const DECK_SEATED_PIER_M = 3;
const DECK_SEATED_QUIET = "#4d6a9e";
const DECK_SEATED_EMISSIVE = 0.15;

// Span scale (±4 mm/yr, same stops as the map's span dots and
// web/annotate.js spanColor). Duplicated here so the custom layer has no
// script-order dependency on annotate.js.
function deckSpanColor(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "#8ea3c7";
  const stops = [
    [-4, [33, 102, 172]], [-2, [171, 217, 233]], [0, [243, 240, 234]],
    [2, [253, 174, 97]], [4, [178, 24, 43]]
  ];
  const x = Math.max(-4, Math.min(4, Number(v)));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (x >= a[0] && x <= b[0]) {
      const f = (b[0] === a[0]) ? 0 : (x - a[0]) / (b[0] - a[0]);
      const c = [0, 1, 2].map((k) => Math.round(a[1][k] + (b[1][k] - a[1][k]) * f));
      return "#" + c.map((v2) => v2.toString(16).padStart(2, "0")).join("");
    }
  }
  return "#f3f0ea";
}

// Largest absolute anomaly over the whole series (all spans, all months).
// Nulls are skipped. The SVG side view (deckGeometry) uses the same
// denominator so its "vertical ×factor" label and this layer agree on
// what "largest" means.
function deckMaxAbs(spans) {
  let maxAbs = 0;
  for (const s of (spans || [])) {
    if (!s || !Array.isArray(s.anomaly)) continue;
    for (const v of s.anomaly) {
      if (v === null || v === undefined || Number.isNaN(Number(v))) continue;
      const a = Math.abs(Number(v));
      if (a > maxAbs) maxAbs = a;
    }
  }
  return maxAbs;
}

// Exaggeration: metres of deck height per mm/yr, so the largest absolute
// anomaly in the series maps to maxHeightM (default DECK_MAX_HEIGHT_M).
function deckExaggeration(spans, maxHeightM) {
  const mh = (maxHeightM === undefined || maxHeightM === null)
    ? DECK_MAX_HEIGHT_M : Number(maxHeightM);
  const maxAbs = deckMaxAbs(spans);
  return { maxAbs, mPerUnit: maxAbs > 0 ? mh / maxAbs : 0, maxHeightM: mh };
}

// Seated-mode span style (phase 8c-1): colour by the bound month's bridge
// class, not by per-span value. Null spans are dim at 60 % opacity;
// quiet (none/unknown) is the prism tone; watch/elevated/high carry the
// ladder tokens; high adds the faint red emissive bloom.
function deckSeatedStyle(risk, isNull) {
  if (isNull) {
    return { color: "#8ea3c7", emissive: "#000000",
      emissiveIntensity: 0, opacity: 0.6 };
  }
  let color = DECK_SEATED_QUIET;
  if (risk === "watch") color = "#f2b84b";
  else if (risk === "elevated") color = "#ff7a2f";
  else if (risk === "high") color = "#ff3b3b";
  const hot = risk === "high";
  return { color, emissive: hot ? "#ff3b3b" : "#000000",
    emissiveIntensity: hot ? DECK_SEATED_EMISSIVE : 0, opacity: 1 };
}

// deckMeshSpec(spans, cutoffIdx, lenM, axisBearing, opts): box layout for
// one bridge at one month. One box per span, sorted by along_m, centred
// on the deck (local X = along minus lenM/2, Y up, Z across). Segment
// boundaries fall midway between adjacent along_m positions (deck ends at
// 0 and lenM), so each box length covers its span's share of the deck.
// Mode "bars" (the default; Explore keeps this): box centre Y is that
// month's anomaly times the exaggeration (nulls sit at 0, grey and flat);
// the box top at zero anomaly is half a thickness above the map (centre
// at ground level) so the deck reads above the faded fill without
// z-fighting. Each box tilts about Z by the slope to its neighbours (atan
// of dh/dx) so adjacent tops meet. Pillars stand under the interior
// joints from the joint underside down to DECK_PILLAR_FOOT_M. Colours
// follow the span scale; opts.risk === "high" adds a red glow emissive.
// Returns {boxes, pillars, maxAbs, mPerUnit, axisBearing, lenM, cutoffIdx}.
// Mode "seated" (phase 8c-1 story close-up; spec section 4): one
// continuous slab on piers at true height. Every box centre sits at
// DECK_SEATED_TOP_M minus half the 2 m thickness (11 m); box ends meet at
// the pier lines (the same midway boundaries); each span pitches about
// its centre by the month's anomaly scaled so the worst span of the shown
// month tilts DECK_SEATED_TILT_DEG, never more (nulls flat); piers are
// 3 m x 3 m columns from 0 m to the deck's underside (10 m) at each span
// joint. Colours follow deckSeatedStyle. Returns the same shape plus
// {mode, monthMaxAbs, tiltCapDeg}; mPerUnit is 0 (no exaggeration).
function deckMeshSpec(spans, cutoffIdx, lenM, axisBearing, opts) {
  const o = opts || {};
  const mode = (o.mode === "seated") ? "seated" : "bars";
  const widthM = (o.widthM === undefined || o.widthM === null)
    ? DECK_WIDTH_M : Number(o.widthM);
  const thickM = (o.thickM === undefined || o.thickM === null)
    ? DECK_THICKNESS_M : Number(o.thickM);
  const maxHeightM = (o.maxHeightM === undefined || o.maxHeightM === null)
    ? DECK_MAX_HEIGHT_M : Number(o.maxHeightM);
  const footM = (o.footM === undefined || o.footM === null)
    ? DECK_PILLAR_FOOT_M : Number(o.footM);
  const risk = o.risk || null;
  const L = Number(lenM);
  const len = (Number.isFinite(L) && L > 0) ? L : 0;
  const arr = (spans || []).slice().sort((a, b) =>
    Number(a.along_m) - Number(b.along_m));
  const ex = deckExaggeration(arr, maxHeightM);
  const bearing = Number(axisBearing);
  if (mode === "seated") {
    return deckSeatedSpec(arr, cutoffIdx, len, bearing, widthM, risk, ex);
  }
  const boxes = arr.map((s, i) => {
    const along = Number(s.along_m);
    const a = Number.isFinite(along) ? along : 0;
    let prevB, nextB;
    if (arr.length <= 1 || !(len > 0)) {
      prevB = len > 0 ? 0 : a - 10;
      nextB = len > 0 ? len : a + 10;
    } else {
      const pa = (i > 0) ? Number(arr[i - 1].along_m) : null;
      const na = (i + 1 < arr.length) ? Number(arr[i + 1].along_m) : null;
      prevB = (i === 0) ? 0 : (a + pa) / 2;
      nextB = (i === arr.length - 1) ? len : (a + na) / 2;
    }
    const blen = Math.max(1, nextB - prevB);
    const centreAlong = (prevB + nextB) / 2;
    const x = (len > 0) ? centreAlong - len / 2 : 0;
    const raw = (s && Array.isArray(s.anomaly)) ? s.anomaly[cutoffIdx] : null;
    const isNull = (raw === null || raw === undefined || Number.isNaN(Number(raw)));
    const value = isNull ? null : Number(raw);
    const y = isNull ? 0 : value * ex.mPerUnit;
    return {
      span: s.span, alongM: a, x, y, z: 0,
      len: blen, thick: thickM, width: widthM,
      rotZ: 0, value, isNull,
      color: isNull ? "#8ea3c7" : deckSpanColor(value),
      emissive: risk === "high" ? "#ff3b3b" : "#000000",
      emissiveIntensity: risk === "high" ? 0.55 : 0
    };
  });
  // Tilt each box to meet its neighbours: slope from the adjacent
  // centres (single neighbour at the ends), rotation about Z.
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const p = (i > 0) ? boxes[i - 1] : null;
    const n = (i + 1 < boxes.length) ? boxes[i + 1] : null;
    let slope = 0;
    if (p && n && (n.x !== p.x)) slope = (n.y - p.y) / (n.x - p.x);
    else if (p && (b.x !== p.x)) slope = (b.y - p.y) / (b.x - p.x);
    else if (n && (n.x !== b.x)) slope = (n.y - b.y) / (n.x - b.x);
    b.rotZ = Math.atan(slope);
  }
  // Pillars under the interior joints: x at the boundary, from the
  // joints' underside down to the foot. Nulls sit at the baseline so
  // joints beside them still get pillars.
  const pillars = [];
  for (let i = 0; i + 1 < boxes.length; i++) {
    const b0 = boxes[i], b1 = boxes[i + 1];
    const jx = (b0.x + b1.x) / 2;
    const underside = (b0.y + b1.y) / 2 - thickM / 2;
    const h = Math.max(0.5, underside - footM);
    pillars.push({
      x: jx, y: footM + h / 2, z: 0,
      w: 2, h, d: Math.min(widthM - 2, 8)
    });
  }
  return {
    boxes, pillars,
    maxAbs: ex.maxAbs, mPerUnit: ex.mPerUnit, maxHeightM,
    axisBearing: Number.isFinite(bearing) ? bearing : 0,
    lenM: len, cutoffIdx
  };
}

// deckSeatedSpec: the "seated" half of deckMeshSpec (sorted spans in, spec
// out). Segmentation mirrors the bars rule (midway boundaries, deck ends
// at 0 and lenM) so box ends meet at the pier lines; pier x positions are
// the exact shared boundaries (box centre plus half the box length), not
// midpoints of adjacent centres.
function deckSeatedSpec(arr, cutoffIdx, len, bearing, widthM, risk, ex) {
  const thick = DECK_SEATED_THICK_M;
  const y0 = DECK_SEATED_TOP_M - thick / 2;
  const under = DECK_SEATED_TOP_M - thick;
  const capRad = DECK_SEATED_TILT_DEG * Math.PI / 180;
  let monthMax = 0;
  for (const s of (arr || [])) {
    const raw = (s && Array.isArray(s.anomaly)) ? s.anomaly[cutoffIdx] : null;
    if (raw === null || raw === undefined || Number.isNaN(Number(raw))) continue;
    const a = Math.abs(Number(raw));
    if (a > monthMax) monthMax = a;
  }
  const boxes = (arr || []).map((s, i) => {
    const along = Number(s.along_m);
    const a = Number.isFinite(along) ? along : 0;
    let prevB, nextB;
    if (arr.length <= 1 || !(len > 0)) {
      prevB = len > 0 ? 0 : a - 10;
      nextB = len > 0 ? len : a + 10;
    } else {
      const pa = (i > 0) ? Number(arr[i - 1].along_m) : null;
      const na = (i + 1 < arr.length) ? Number(arr[i + 1].along_m) : null;
      prevB = (i === 0) ? 0 : (a + pa) / 2;
      nextB = (i === arr.length - 1) ? len : (a + na) / 2;
    }
    const blen = Math.max(1, nextB - prevB);
    const centreAlong = (prevB + nextB) / 2;
    const x = (len > 0) ? centreAlong - len / 2 : 0;
    const raw = (s && Array.isArray(s.anomaly)) ? s.anomaly[cutoffIdx] : null;
    const isNull = (raw === null || raw === undefined || Number.isNaN(Number(raw)));
    const value = isNull ? null : Number(raw);
    let rotZ = 0;
    if (!isNull && monthMax > 0) {
      rotZ = (value / monthMax) * capRad;
      if (rotZ > capRad) rotZ = capRad;
      if (rotZ < -capRad) rotZ = -capRad;
    }
    const st = deckSeatedStyle(risk, isNull);
    return {
      span: s.span, alongM: a, x, y: y0, z: 0,
      len: blen, thick, width: widthM,
      rotZ, value, isNull,
      color: st.color, emissive: st.emissive,
      emissiveIntensity: st.emissiveIntensity, opacity: st.opacity
    };
  });
  const pillars = [];
  for (let i = 0; i + 1 < boxes.length; i++) {
    const jx = boxes[i].x + boxes[i].len / 2;
    pillars.push({
      x: jx, y: under / 2, z: 0,
      w: DECK_SEATED_PIER_M, h: under, d: DECK_SEATED_PIER_M
    });
  }
  return {
    boxes, pillars, mode: "seated",
    maxAbs: ex ? ex.maxAbs : 0, mPerUnit: 0,
    monthMaxAbs: monthMax, tiltCapDeg: DECK_SEATED_TILT_DEG,
    axisBearing: Number.isFinite(bearing) ? bearing : 0,
    lenM: len, cutoffIdx
  };
}

// Web-Mercator normalised x/y for lon/lat (the transform MapLibre's
// MercatorCoordinate applies to the bridge origin before scaling metres).
function deckMercatorXY(lon, lat) {
  const x = (Number(lon) + 180) / 360;
  const phi = Number(lat) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
  return { x, y };
}

// Metres to Mercator units at a latitude (local isotropic scale:
// 1 m = 1 / (earthCircumference * cos(lat))). Matches the scale
// meterInMercatorCoordinateUnits() returns for the bridge origin.
function deckMeterScale(lat) {
  const c = 40075016.686 * Math.cos(Number(lat) * Math.PI / 180);
  if (!(c > 0)) return 0;
  return 1 / c;
}

// Long-axis bearing (degrees clockwise from north) of a polygon ring
// ([[lon,lat]...]): the bearing between the two farthest points
// (equirectangular distance, great-circle bearing). Deck boxes rotate by
// 90° minus this bearing about the model's up axis (see the render() note
// below), so the deck's local X runs along the polygon's long axis.
function deckAxisBearing(ring) {
  const pts = (ring || []).filter((p) =>
    Array.isArray(p) && Number.isFinite(Number(p[0])) &&
    Number.isFinite(Number(p[1])));
  if (pts.length < 2) return 0;
  let meanLat = 0;
  for (const p of pts) meanLat += Number(p[1]);
  meanLat /= pts.length;
  const kx = Math.cos(meanLat * Math.PI / 180);
  let best = 0, bi = 0, bj = 1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = (Number(pts[j][0]) - Number(pts[i][0])) * kx;
      const dy = Number(pts[j][1]) - Number(pts[i][1]);
      const d2 = dx * dx + dy * dy;
      if (d2 > best) { best = d2; bi = i; bj = j; }
    }
  }
  const lon1 = Number(pts[bi][0]) * Math.PI / 180;
  const lat1 = Number(pts[bi][1]) * Math.PI / 180;
  const lon2 = Number(pts[bj][0]) * Math.PI / 180;
  const lat2 = Number(pts[bj][1]) * Math.PI / 180;
  const dl = lon2 - lon1;
  const y = Math.sin(dl) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dl);
  let brg = Math.atan2(y, x) * 180 / Math.PI;
  if (brg < 0) brg += 360;
  return brg;
}

// Great-circle bearing (degrees clockwise from north) from one lon/lat
// to another.
function deckLonLatBearing(lon1, lat1, lon2, lat2) {
  const p1 = Number(lon1) * Math.PI / 180;
  const f1 = Number(lat1) * Math.PI / 180;
  const p2 = Number(lon2) * Math.PI / 180;
  const f2 = Number(lat2) * Math.PI / 180;
  const y = Math.sin(p2 - p1) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) -
    Math.sin(f1) * Math.cos(f2) * Math.cos(p2 - p1);
  let brg = Math.atan2(y, x) * 180 / Math.PI;
  if (brg < 0) brg += 360;
  return brg;
}

// Orient an undirected polygon axis so the deck's local +X (increasing
// along_m) runs from the first span toward the last span's position.
// Without this a ring whose farthest pair happens to order north-first
// would mirror the deck end for end. Returns the bearing unchanged when
// the spans carry no positions.
function deckOrientBearing(axisBearing, spans) {
  const arr = (spans || []).slice().sort((a, b) =>
    Number(a.along_m) - Number(b.along_m));
  if (arr.length < 2) return Number(axisBearing) || 0;
  const f = arr[0], l = arr[arr.length - 1];
  if (f.lon === null || f.lon === undefined || f.lat === null ||
      f.lat === undefined || l.lon === null || l.lon === undefined ||
      l.lat === null || l.lat === undefined) {
    return Number(axisBearing) || 0;
  }
  const sb = deckLonLatBearing(f.lon, f.lat, l.lon, l.lat);
  let a = ((Number(axisBearing) % 360) + 360) % 360;
  const d = (((a - sb) % 360) + 540) % 360 - 180;
  if (Math.abs(d) > 90) a = (a + 180) % 360;
  return a;
}

// Model rotation for an axis bearing (degrees clockwise from north).
// render()'s model matrix is translate · scale(s,−s,s) · rotX(π/2) ·
// rotY(angle): local X must render at the axis bearing. The −Y scale
// flips handedness, so rotY(axis−90°) maps X to 180°−axis (mirrored
// about north); rotY(90°−axis) maps X to the axis bearing. Returns
// radians for THREE's makeRotationAxis(Y, ...). render() calls this,
// so the unit-X test below guards the shipped matrix.
function deckRotYRad(axisDeg) {
  return (90 - Number(axisDeg)) * Math.PI / 180;
}

// Model-space direction (x,y,z) to map-space (east,north,up) through the
// same rotation as render()'s model matrix (rotY, then rotX(π/2), then
// the Mercator Y-south flip; translation and metre scale omitted —
// direction only). East is +x, north is −y (Mercator Y runs south).
function deckModelDirToMap(axisDeg, x, y, z) {
  const th = deckRotYRad(axisDeg);
  const ct = Math.cos(th), st = Math.sin(th);
  const rx = Number(x) * ct + Number(z) * st;
  const ry = Number(y);
  const rz = -Number(x) * st + Number(z) * ct;
  const qx = rx, qy = -rz, qz = ry;
  return { east: qx, north: qy, up: qz };
}

// Seated-mode directional light position in model space for an axis
// bearing: low from the south-east in map space (bearing 135°, elevation
// atan(42/150) ≈ 15.6°), matching the basemap's hard low light. The
// light lives in model space, so it inverse-rotates with the axis: fixed
// model coordinates would drift off south-east for any other bridge.
// Returns [x,y,z] (metres about the bridge origin, Y up).
function deckSeatedLight(axisDeg) {
  const phi = (Number(axisDeg) - 90) * Math.PI / 180;
  const c = Math.cos(phi), s = Math.sin(phi);
  const H = 150, U = 42, k = Math.SQRT1_2;
  return [H * (c + s) * k, U, H * (c - s) * k];
}

// Worry-scale wording for a model risk (Explore legend words, technical
// term kept for the small print). Unknown/not-monitored has no worry
// word of its own.
function hudWorryFor(risk) {
  if (risk === "high") return { worry: "send an inspector", tech: "high" };
  if (risk === "elevated") return { worry: "look closer", tech: "elevated" };
  if (risk === "watch") return { worry: "keep watching", tech: "watch" };
  if (risk === "none") return { worry: "fine", tech: "none" };
  return { worry: "not monitored", tech: "unknown" };
}

// Four HUD lines from the bound month's data only: name, cutoff, the
// rank/z counter, the worry word. No other fields.
function hudLinesFor(name, cutoff, rank, n, z, risk) {
  const w = hudWorryFor(risk);
  const r = (rank === null || rank === undefined) ? "—" : String(rank);
  const nn = (n === null || n === undefined) ? "—" : String(n);
  const zz = (z === null || z === undefined || Number.isNaN(Number(z)))
    ? "—" : Number(z).toFixed(2);
  return {
    lines: [String(name), String(cutoff), `rank ${r} of ${nn} · z ${zz}`, w.worry],
    worry: w.worry, tech: w.tech
  };
}

// Screen radius (px) of a fixed metre ring at a zoom/latitude (256 px
// tiles): metres divided by the ground resolution. The annotation layer
// uses map.project for the real value; this pure form is the tested scale
// law behind it (doubling every zoom).
function deckRingRadiusPx(metres, zoom, lat) {
  const res = 156543.03392 * Math.cos(Number(lat) * Math.PI / 180) /
    Math.pow(2, Number(zoom));
  if (!(res > 0)) return 0;
  return Number(metres) / res;
}

// ---------- Browser part: the MapLibre custom layer ----------
// Everything below runs only in the page. Deck3DShow(map, opts) adds one
// custom layer ("bridge-deck-3d") for a bridge; Deck3DUpdate retargets
// its span heights (600 ms tween in story scene 6, instant under reduced
// motion and in Explore); Deck3DHide removes it and restores the polygon
// fill. Nothing here runs under node.

let deckMap = null;
let deckLayerOn = false;
let deckBid = null;
let deckThree = null;
let deckSpec = null;
let deckOrigin = null;
let deckAxisDeg = 0;

function Deck3DReduced() {
  try {
    if (typeof REDUCED !== "undefined") return !!REDUCED;
  } catch (e) { /* fall through */ }
  try {
    return !!(typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) { return false; }
}

function Deck3DPhone() {
  try {
    return !!(typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(max-width: 700px)").matches);
  } catch (e) { return false; }
}

// No 3D without the UMD global, and never on the phone layout (the SVG
// side view carries the deck there).
function Deck3DSupported() {
  try {
    if (typeof THREE === "undefined" || !THREE) return false;
  } catch (e) { return false; }
  if (Deck3DPhone()) return false;
  return true;
}

function Deck3DIsShowing() {
  return deckLayerOn ? deckBid : null;
}

function deckHasGsap() {
  return (typeof gsap !== "undefined") && gsap !== null;
}

function deckSetFillDim(map, dim, seated) {
  try {
    if (!map || !map.getLayer || !map.setPaintProperty) return;
    if (map.getLayer("bridges-fill")) {
      map.setPaintProperty("bridges-fill", "fill-opacity",
        !dim ? 0.38 : (seated ? 0 : 0.15));
    }
    // Seated close-up (story scenes 5-6): the footprint drops to a 1 px
    // hairline with no fill, so the slab is the bridge. Bars mode leaves
    // the outline alone; restoring always returns it to 2.5.
    if (map.getLayer("bridges-line") && (seated || !dim)) {
      map.setPaintProperty("bridges-line", "line-width",
        (!dim || !seated) ? 2.5 : 1);
    }
  } catch (e) { /* fill is decoration, never fatal */ }
}

function deckDisposeThree() {
  try {
    if (!deckThree) return;
    const th = deckThree;
    deckThree = null;
    for (const m of (th.meshes || [])) {
      try { if (th.scene && m.mesh) th.scene.remove(m.mesh); } catch (e) {}
      try { if (m.mesh && m.mesh.geometry && m.mesh.geometry.dispose) m.mesh.geometry.dispose(); } catch (e) {}
      try { if (m.mesh && m.mesh.material && m.mesh.material.dispose) m.mesh.material.dispose(); } catch (e) {}
    }
    for (const m of (th.pillarMeshes || [])) {
      try { if (th.scene && m) th.scene.remove(m); } catch (e) {}
      try { if (m.geometry && m.geometry.dispose) m.geometry.dispose(); } catch (e) {}
      try { if (m.material && m.material.dispose) m.material.dispose(); } catch (e) {}
    }
    try { if (th.renderer && th.renderer.dispose) th.renderer.dispose(); } catch (e) {}
  } catch (e) { /* ignore */ }
}

// Build the three.js scene from a deckMeshSpec: one BoxGeometry per span
// (X along the deck, Y up, Z across), pillars under the joints, one
// directional light plus ambient. Bars mode colours are the spec's span
// colours and a high bridge gets a red glow emissive; seated mode colours
// follow the bound month's class (deckSeatedStyle) with null spans at
// 60 % opacity, lit to match the basemap (low directional from the
// south-east plus 0.45 ambient, axis-aware via deckSeatedLight so the
// corrected rotation keeps it south-east) so the slab shades like the
// prisms around it: MeshLambert, so the top face reads lighter than the
// sides under the directional light. lightAxisDeg overrides the spec's
// axis for the light (Deck3DShow passes the oriented axis).
function deckBuildScene(spec, lightAxisDeg) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const seated = !!(spec && spec.mode === "seated");
  try {
    const amb = new THREE.AmbientLight(0xffffff, seated ? 0.45 : 0.65);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    if (seated) {
      const ax = (lightAxisDeg !== undefined && lightAxisDeg !== null)
        ? lightAxisDeg : (spec && spec.axisBearing) || 0;
      const lp = deckSeatedLight(ax);
      dir.position.set(lp[0], lp[1], lp[2]);
    } else dir.position.set(120, 220, 80);
    scene.add(dir);
  } catch (e) { /* lights are nice, never fatal */ }
  const meshes = [];
  for (const b of (spec.boxes || [])) {
    let mesh = null;
    try {
      const geo = new THREE.BoxGeometry(b.len, b.thick, b.width);
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(b.color),
        emissive: new THREE.Color(b.emissive || "#000000"),
        emissiveIntensity: b.emissiveIntensity || 0
      });
      if (b.opacity !== undefined && b.opacity !== null &&
          Number(b.opacity) < 1) {
        mat.transparent = true;
        mat.opacity = Number(b.opacity);
      }
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y, b.z || 0);
      mesh.rotation.z = b.rotZ || 0;
      scene.add(mesh);
    } catch (e) { mesh = null; }
    meshes.push({ mesh, box: b });
  }
  const pillarMeshes = [];
  for (const p of (spec.pillars || [])) {
    try {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color("#3b4760") });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, p.y, p.z || 0);
      scene.add(mesh);
      pillarMeshes.push(mesh);
    } catch (e) { /* ignore */ }
  }
  return { scene, camera, renderer: null, meshes, pillarMeshes };
}

// Mercator origin + metre scale for the bridge centroid. Prefers
// MapLibre's own MercatorCoordinate; falls back to the pure helpers.
function deckOriginFor(lon, lat) {
  try {
    if (typeof maplibregl !== "undefined" && maplibregl &&
        maplibregl.MercatorCoordinate &&
        maplibregl.MercatorCoordinate.fromLngLat) {
      const mc = maplibregl.MercatorCoordinate.fromLngLat(
        [Number(lon), Number(lat)], 0);
      return { x: mc.x, y: mc.y, z: mc.z || 0,
        scale: (typeof mc.meterInMercatorCoordinateUnits === "function")
          ? mc.meterInMercatorCoordinateUnits() : deckMeterScale(lat) };
    }
  } catch (e) { /* fall through to the pure helpers */ }
  const xy = deckMercatorXY(lon, lat);
  return { x: xy.x, y: xy.y, z: 0, scale: deckMeterScale(lat) };
}

// The custom layer. Model space is metres about the bridge origin (X
// along the deck, Y up, Z across). render() takes MapLibre's projection
// matrix and multiplies the model transform: translate to the Mercator
// origin, scale metres to Mercator units (Y negated: Mercator Y runs
// south), rotateX(π/2) to map model Y-up onto Mercator Z-up, and rotateY
// by (90° − axisBearing) so local X runs along the deck's compass
// bearing. Because the origin and matrix are re-read every frame, the
// deck stays attached through pan, zoom, pitch and bearing.
function deckMakeLayer() {
  return {
    id: "bridge-deck-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd: function (map, gl) {
      try {
        if (!deckThree) return;
        deckThree.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(), context: gl, antialias: true
        });
        deckThree.renderer.autoClear = false;
      } catch (e) { /* renderer failure leaves the side view */ }
    },
    render: function (gl, matrix) {
      try {
        if (!deckThree || !deckThree.renderer || !deckOrigin) return;
        const rotX = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(1, 0, 0), Math.PI / 2);
        const rotY = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 1, 0),
          deckRotYRad(deckAxisDeg));
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(deckOrigin.x, deckOrigin.y, deckOrigin.z || 0)
          .scale(new THREE.Vector3(deckOrigin.scale,
            -deckOrigin.scale, deckOrigin.scale))
          .multiply(rotX)
          .multiply(rotY);
        deckThree.camera.projectionMatrix = m.multiply(l);
        deckThree.renderer.state.reset();
        deckThree.renderer.render(deckThree.scene, deckThree.camera);
      } catch (e) { /* a dropped frame is never fatal */ }
    }
  };
}

// Show the deck for one bridge at one month. opts: {bid, spans,
// cutoffIdx, lenM, centroid:[lon,lat], risk, axisBearing, tweenMs, mode}.
// mode "seated" (phase 8c-1 story close-up) seats the slab on piers;
// any other mode (including omitted: Explore) keeps the exaggerated
// bars. Same-bridge re-shows retarget the heights (Explore slider, story
// scene 6); bridge changes rebuild the layer. Returns true when the layer
// is on, false when unsupported (no THREE, phone layout) so callers fall
// back to the side view.
function Deck3DShow(map, opts) {
  const o = opts || {};
  if (!map || !o.bid || !o.centroid) return false;
  if (!Deck3DSupported()) return false;
  const midx = Number(o.cutoffIdx);
  if (deckLayerOn && deckBid === String(o.bid) && deckThree) {
    Deck3DUpdate(map, midx, { tweenMs: o.tweenMs });
    return true;
  }
  Deck3DHide(map);
  const orientedAxis = deckOrientBearing(Number(o.axisBearing) || 0,
    o.spans || []);
  let spec = null;
  try {
    spec = deckMeshSpec(o.spans || [], midx, o.lenM, o.axisBearing,
      { risk: o.risk, mode: o.mode });
  } catch (e) { return false; }
  if (!spec || !spec.boxes.length) return false;
  try {
    deckThree = deckBuildScene(spec, orientedAxis);
  } catch (e) { deckThree = null; return false; }
  deckSpec = spec;
  deckBid = String(o.bid);
  deckAxisDeg = orientedAxis;
  deckOrigin = deckOriginFor(o.centroid[0], o.centroid[1]);
  deckMap = map;
  try {
    map.addLayer(deckMakeLayer());
    deckLayerOn = true;
  } catch (e) {
    deckLayerOn = false;
    deckDisposeThree();
    deckBid = null;
    deckSpec = null;
    return false;
  }
  deckSetFillDim(map, true, (o.mode === "seated"));
  try { if (map.triggerRepaint) map.triggerRepaint(); } catch (e) {}
  return true;
}

// Retarget the showing deck to a new month. The span heights (and tilts;
// seated mode retargets the pitch, which is the month's signal there)
// tween over tweenMs (story scene 6: 600); under reduced motion, without
// GSAP, or at tweenMs 0 they jump to the final heights. The showing mode
// is preserved from Deck3DShow.
function Deck3DUpdate(map, cutoffIdx, opts) {
  if (!deckLayerOn || !deckThree || !deckSpec) return false;
  const o = opts || {};
  const midx = Number(cutoffIdx);
  let next = null;
  try {
    next = deckMeshSpec(deckSpec && deckThree ? Deck3DSpans() : [],
      midx, deckSpec.lenM, deckAxisDeg,
      { risk: Deck3DRisk(), mode: Deck3DMode() });
  } catch (e) { return false; }
  if (!next || next.boxes.length !== deckThree.meshes.length) return false;
  deckSpec = next;
  const reduced = Deck3DReduced();
  const ms = reduced ? 0 : (Number(o.tweenMs) || 0);
  const repaint = () => {
    try {
      const mm = map || deckMap;
      if (mm && mm.triggerRepaint) mm.triggerRepaint();
    } catch (e) {}
  };
  const apply = (i, y, rotZ) => {
    const entry = deckThree.meshes[i];
    if (!entry || !entry.mesh) return;
    entry.mesh.position.y = y;
    entry.mesh.rotation.z = rotZ;
    entry.box.y = y;
    entry.box.rotZ = rotZ;
  };
  // Colours follow the month (bars: the span scale, red glow stays while
  // the bridge is high; seated: the month's class, nulls at 60 %).
  // Materials update instantly even when heights tween: the data month
  // has changed.
  for (let i = 0; i < next.boxes.length; i++) {
    const entry = deckThree.meshes[i];
    const b = next.boxes[i];
    if (!entry || !entry.mesh || !entry.mesh.material) continue;
    try { entry.mesh.material.color.set(b.color); } catch (e) {}
    try {
      if (entry.mesh.material.emissive) {
        entry.mesh.material.emissive.set(b.emissive || "#000000");
        entry.mesh.material.emissiveIntensity = b.emissiveIntensity || 0;
      }
    } catch (e) {}
    try {
      const op = (b.opacity === undefined || b.opacity === null)
        ? 1 : Number(b.opacity);
      entry.mesh.material.transparent = op < 1;
      entry.mesh.material.opacity = op;
      entry.mesh.material.needsUpdate = true;
    } catch (e) {}
    entry.box.color = b.color;
    entry.box.value = b.value;
    entry.box.isNull = b.isNull;
    entry.box.opacity = b.opacity;
  }
  // Pillars follow their joints instantly (they are supports, not data).
  for (let p = 0; p < deckThree.pillarMeshes.length; p++) {
    const specP = next.pillars[p];
    const mesh = deckThree.pillarMeshes[p];
    if (!specP || !mesh) continue;
    try {
      mesh.position.y = specP.y;
      mesh.scale.y = 1;
      const gh = mesh.geometry && mesh.geometry.parameters
        ? mesh.geometry.parameters.height : 0;
      if (gh && gh > 0) mesh.scale.y = specP.h / gh;
    } catch (e) {}
  }
  if (!(ms > 0) || reduced || !deckHasGsap()) {
    for (let i = 0; i < next.boxes.length; i++) {
      apply(i, next.boxes[i].y, next.boxes[i].rotZ || 0);
    }
    repaint();
    return true;
  }
  try {
    for (let i = 0; i < next.boxes.length; i++) {
      const b = next.boxes[i];
      const entry = deckThree.meshes[i];
      if (!entry || !entry.mesh) continue;
      const mesh = entry.mesh;
      gsap.to(mesh.position, { y: b.y, duration: ms / 1000,
        ease: "power2.out", onUpdate: repaint, onComplete: repaint });
      gsap.to(mesh.rotation, { z: b.rotZ || 0, duration: ms / 1000,
        ease: "power2.out", onUpdate: repaint });
      entry.box.y = b.y;
      entry.box.rotZ = b.rotZ || 0;
    }
  } catch (e) {
    for (let i = 0; i < next.boxes.length; i++) {
      apply(i, next.boxes[i].y, next.boxes[i].rotZ || 0);
    }
    repaint();
  }
  return true;
}

// Stashed inputs for retargeting (set by Deck3DShow, read by Deck3DUpdate).
let deckStashSpans = [];
let deckStashRisk = null;
let deckStashMode = "bars";

function Deck3DSpans() {
  return deckStashSpans;
}

function Deck3DRisk() {
  return deckStashRisk;
}

function Deck3DMode() {
  return deckStashMode;
}

const deckShowInner = Deck3DShow;
Deck3DShow = function (map, opts) {
  const o = opts || {};
  if (o.spans) deckStashSpans = o.spans;
  deckStashRisk = o.risk || null;
  deckStashMode = (o.mode === "seated") ? "seated" : "bars";
  return deckShowInner(map, o);
};

function Deck3DHide(map) {
  const mm = map || deckMap;
  try {
    if (mm && mm.getLayer && mm.getLayer("bridge-deck-3d")) {
      mm.removeLayer("bridge-deck-3d");
    }
  } catch (e) { /* ignore */ }
  deckLayerOn = false;
  deckBid = null;
  deckSpec = null;
  deckOrigin = null;
  deckDisposeThree();
  if (mm) deckSetFillDim(mm, false);
  try { if (mm && mm.triggerRepaint) mm.triggerRepaint(); } catch (e) {}
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    deckSpanColor, deckMaxAbs, deckExaggeration, deckMeshSpec,
    deckSeatedStyle,
    deckMercatorXY, deckMeterScale, deckAxisBearing,
    deckLonLatBearing, deckOrientBearing,
    deckRotYRad, deckModelDirToMap, deckSeatedLight,
    hudWorryFor, hudLinesFor, deckRingRadiusPx,
    DECK_WIDTH_M, DECK_THICKNESS_M, DECK_MAX_HEIGHT_M,
    DECK_PILLAR_FOOT_M, DECK_RING_RADII_M, DECK_TWEEN_MS,
    DECK_SEATED_TOP_M, DECK_SEATED_THICK_M, DECK_SEATED_TILT_DEG,
    DECK_SEATED_PIER_M, DECK_SEATED_QUIET, DECK_SEATED_EMISSIVE
  };
}
