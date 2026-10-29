"use strict";
// RadarTwin annotation layer (phase 7b): an SVG overlay the size of the map.
//
// Pure part (no DOM, no map, no GSAP) runs in node and is tested by
// tests/test_annotate.js: counter formatting, lon/lat projection,
// label placement, span/risk colours, fastest-span selection and the
// bridge side-view geometry. The browser part (below the banner) draws
// leader lines, name labels and counters, reprojected every frame while
// the camera moves (map "move" events plus the GSAP ticker during tweens).

// ---------- Pure part ----------

function formatCounter(value, opts) {
  const o = opts || {};
  const decimals = (o.decimals === undefined || o.decimals === null) ? 0 : o.decimals;
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  let s = Number(value).toFixed(decimals);
  if (o.sign && Number(value) >= 0) s = "+" + s;
  return (o.prefix || "") + s + (o.suffix || "");
}

// Span callout value: sign and one decimal ("+3.2 mm/yr" style).
function formatSpanValue(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "no data";
  return formatCounter(v, { decimals: 1, sign: true, suffix: " mm/yr" });
}

// Scene-6 counter text.
function formatRankCounter(rank, n, z) {
  const r = (rank === null || rank === undefined) ? "—" : String(rank);
  const nn = (n === null || n === undefined) ? "—" : String(n);
  const zz = (z === null || z === undefined || Number.isNaN(Number(z)))
    ? "—" : Number(z).toFixed(2);
  return `rank ${r} of ${nn} · z ${zz}`;
}

// Scene-7 SAM label from sam.geojson ("SAM 3.1 · score {score} · IoU {iou}").
function formatSamLabel(score, iou) {
  const s = (score === null || score === undefined || Number.isNaN(Number(score)))
    ? "—" : Number(score).toFixed(2);
  const v = (iou === null || iou === undefined || Number.isNaN(Number(iou)))
    ? "—" : Number(iou).toFixed(2);
  return `SAM 3.1 · score ${s} · IoU ${v}`;
}

// projectPath(points, project): apply a screen projection to lon/lat
// points. Accepts [lon,lat] pairs or {lon,lat}/{lng,lat} objects;
// project(lon,lat) returns {x,y} or [x,y]. Invalid entries map to null.
function projectPath(points, project) {
  const out = [];
  for (const p of (points || [])) {
    let lon = null, lat = null;
    if (Array.isArray(p)) {
      lon = p[0]; lat = p[1];
    } else if (p && typeof p === "object") {
      lon = (p.lon !== undefined) ? p.lon : p.lng;
      lat = p.lat;
    }
    if (lon === null || lon === undefined || lat === null || lat === undefined ||
        Number.isNaN(Number(lon)) || Number.isNaN(Number(lat))) {
      out.push(null);
      continue;
    }
    try {
      const r = project(Number(lon), Number(lat));
      if (Array.isArray(r)) out.push({ x: r[0], y: r[1] });
      else if (r && typeof r === "object") out.push({ x: r.x, y: r.y });
      else out.push(null);
    } catch (e) {
      out.push(null);
    }
  }
  return out;
}

// placeLabel(point, labelW, labelH, mapW, mapH): top-left corner for a
// label box that stays inside the map (margin 8) and away from the point
// (gap 12). Tries right-top, right-bottom, left-top, left-bottom, then
// top-centre and bottom-centre; clamps when nothing fits. opts.placed
// lists already-drawn boxes ({x, y, w, h}): a colliding candidate is
// skipped for the next one, so a collision moves a label, never drops
// it. When every preferred spot collides, a bounded scan finds a free
// in-bounds slot; the last resort is the clamped preferred spot.
function placeLabel(point, labelW, labelH, mapW, mapH, opts) {
  const o = opts || {};
  const gap = (o.gap === undefined) ? 12 : o.gap;
  const margin = (o.margin === undefined) ? 8 : o.margin;
  const pad = (o.collisionPad === undefined) ? 4 : o.collisionPad;
  const placed = (o.placed || []).filter(Boolean);
  const px = point.x, py = point.y;
  const maxX = Math.max(margin, mapW - labelW - margin);
  const maxY = Math.max(margin, mapH - labelH - margin);
  const overlaps = (x, y) => {
    for (const p of placed) {
      const pw = (p.w === undefined || p.w === null) ? labelW : p.w;
      const ph = (p.h === undefined || p.h === null) ? labelH : p.h;
      if (x < p.x + pw + pad && p.x < x + labelW + pad &&
          y < p.y + ph + pad && p.y < y + labelH + pad) return true;
    }
    return false;
  };
  const cands = [
    { x: px + gap, y: py - labelH - gap },
    { x: px + gap, y: py + gap },
    { x: px - labelW - gap, y: py - labelH - gap },
    { x: px - labelW - gap, y: py + gap },
    { x: px - labelW / 2, y: py - labelH - gap },
    { x: px - labelW / 2, y: py + gap }
  ];
  for (const c of cands) {
    if (c.x >= margin && c.x <= maxX && c.y >= margin && c.y <= maxY &&
        !overlaps(c.x, c.y)) return c;
  }
  const sx = Math.max(margin, Math.min(maxX, cands[0].x));
  const stepH = Math.max(1, labelH + gap);
  const stepW = Math.max(1, labelW + gap);
  for (let y = margin; y <= maxY + 1e-9; y += stepH) {
    if (!overlaps(sx, y)) return { x: sx, y };
  }
  for (let x = margin; x <= maxX + 1e-9; x += stepW) {
    if (x === sx) continue;
    for (let y = margin; y <= maxY + 1e-9; y += stepH) {
      if (!overlaps(x, y)) return { x, y };
    }
  }
  const fallback = cands[0];
  return {
    x: sx,
    y: Math.max(margin, Math.min(maxY, fallback.y))
  };
}

// Explore callout list: one entry per bridge whose model risk is high in
// the given decisions table with a known centroid, rank order (ties by
// name). Pure; mirrors the refresh path's contract (every high bridge,
// never just the first).
function exploreCalloutsFor(table, id2name, centroids) {
  const t = table || {};
  const names = id2name || {};
  const cents = centroids || {};
  const list = [];
  for (const bid of Object.keys(names)) {
    const d = t[bid];
    if (!d || !d.model || d.model.risk !== "high") continue;
    const c = cents[bid];
    if (!c) continue;
    list.push({ id: `explore-${bid}`, lon: c[0], lat: c[1],
      title: names[bid] || bid, sub: "inspect" });
  }
  list.sort((a, b) => {
    const da = t[a.id.slice(8)], db = t[b.id.slice(8)];
    const ra = (!da || da.rank === null || da.rank === undefined) ? 999 : da.rank;
    const rb = (!db || db.rank === null || db.rank === undefined) ? 999 : db.rank;
    return ra - rb || String(a.title).localeCompare(String(b.title));
  });
  return list;
}

// Span scale (±4 mm/yr, same stops as the map's span dots).
function spanColor(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "#9ca3af";
  const stops = [
    [-4, [33, 102, 172]], [-2, [171, 217, 233]], [0, [245, 245, 245]],
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
  return "#f5f5f5";
}

function riskColor(risk) {
  if (risk === "high") return "#ef4444";
  if (risk === "elevated") return "#f97316";
  if (risk === "watch") return "#eab308";
  if (risk === "none") return "#4b5563";
  return "#9ca3af";
}

// Fastest span at a cutoff: largest absolute anomaly, lower span id wins
// ties (the SPEC tie rule). Returns null when empty or all null.
function fastestSpan(spans, cutoffIdx) {
  let best = null;
  for (const s of (spans || [])) {
    if (!s || !Array.isArray(s.anomaly)) continue;
    const v = s.anomaly[cutoffIdx];
    if (v === null || v === undefined || Number.isNaN(Number(v))) continue;
    const a = Math.abs(Number(v));
    if (!best || a > best.abs || (a === best.abs && Number(s.span) < Number(best.span))) {
      best = { span: s.span, value: Number(v), abs: a,
        lat: s.lat, lon: s.lon, along_m: s.along_m, n: s.n };
    }
  }
  return best;
}

// deckGeometry(spans, cutoffIdx, lenM): side-view block layout. Blocks sit
// along a baseline with x scaled from along_m/lenM; each block is displaced
// vertically by that month's anomaly, exaggerated so the largest absolute
// anomaly in the whole series maps to maxPx (28). Nulls are grey and flat.
// factor is px per mm/yr (28/maxAbs), printed as "vertical ×{factor}".
function deckGeometry(spans, cutoffIdx, lenM, opts) {
  const o = opts || {};
  const width = o.width || 320;
  const baselineY = (o.baselineY === undefined) ? 45 : o.baselineY;
  const blockW = o.blockW || 36;
  const blockH = o.blockH || 10;
  const maxPx = o.maxPx || 28;
  const arr = (spans || []).slice().sort((a, b) =>
    Number(a.along_m) - Number(b.along_m));
  let maxAbs = 0;
  for (const s of arr) {
    if (!s || !Array.isArray(s.anomaly)) continue;
    for (const v of s.anomaly) {
      if (v === null || v === undefined || Number.isNaN(Number(v))) continue;
      const a = Math.abs(Number(v));
      if (a > maxAbs) maxAbs = a;
    }
  }
  const pxPerUnit = maxAbs > 0 ? maxPx / maxAbs : 0;
  const blocks = arr.map((s, i) => {
    let x;
    if (lenM && Number(lenM) > 0 && s.along_m !== null && s.along_m !== undefined) {
      x = (Number(s.along_m) / Number(lenM)) * width;
    } else {
      x = (arr.length <= 1) ? width / 2 : (i / (arr.length - 1)) * width;
    }
    x = Math.max(blockW / 2, Math.min(width - blockW / 2, x));
    const raw = (s && Array.isArray(s.anomaly)) ? s.anomaly[cutoffIdx] : null;
    const isNull = (raw === null || raw === undefined || Number.isNaN(Number(raw)));
    const value = isNull ? null : Number(raw);
    return {
      span: s.span, x, w: blockW, h: blockH,
      dy: isNull ? 0 : -value * pxPerUnit,
      value, color: isNull ? "#9ca3af" : spanColor(value),
      isNull, along_m: s.along_m
    };
  });
  return { blocks, maxAbs, factor: pxPerUnit, width, baselineY,
    pxPerUnit, blockH };
}

// ---------- Browser part: the SVG annotation overlay ----------
// Everything below runs only in the page. Annotate.init(map, container)
// creates one SVG the size of the map; setCallouts draws leader lines and
// name labels; tweenCounter animates a rank/z counter; renderSideView
// draws the deck into a host SVG. Nothing here runs under node.

let annotateMap = null;
let annotateSvg = null;
let annotateBox = null;
let annotateCallouts = [];
let annotateWired = false;
let annotateSeq = 0;
let annotateDrawn = {};
let annotateLastView = "";
let annotateSam = null; // {ring: [[lon,lat]...], label: string} or null
let annotateSamDrawn = false;
let annotateRings = null; // {lon, lat, radii:[m...]} or null (phase 7d HUD)
let annotateRingAngles = [0, 0];
let annotateRingCenter = null; // {x, y} of the last ring draw
let annotateRingTicking = false;
let annotateRingTimer = null;

function annotatePhone() {
  try {
    return !!(typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(max-width: 700px)").matches);
  } catch (e) { return false; }
}

function annotateReduced() {
  try {
    if (typeof REDUCED !== "undefined") return !!REDUCED;
  } catch (e) { /* fall through */ }
  try {
    return !!(typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) { return false; }
}

function annotateHasGsap() {
  return (typeof gsap !== "undefined") && gsap !== null;
}

function annotateSvgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k of Object.keys(attrs || {})) el.setAttribute(k, attrs[k]);
  return el;
}

function annotateSize() {
  if (!annotateBox || !annotateSvg) return { w: 0, h: 0 };
  const w = annotateBox.clientWidth || 0;
  const h = annotateBox.clientHeight || 0;
  try {
    annotateSvg.setAttribute("width", String(w));
    annotateSvg.setAttribute("height", String(h));
    annotateSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  } catch (e) { /* ignore */ }
  return { w, h };
}

function annotateProject(lon, lat) {
  if (!annotateMap || lon === null || lon === undefined ||
      lat === null || lat === undefined) return null;
  try {
    const p = annotateMap.project([Number(lon), Number(lat)]);
    return { x: p.x, y: p.y };
  } catch (e) { return null; }
}

// Draw one callout group: leader line from the map point to the label box
// edge, a rect, and up to two text lines. A new callout's line draws
// itself with stroke-dashoffset over 0.6 s; reprojections of an already
// drawn callout appear drawn (no restarted animation). Under reduced
// motion everything appears drawn.
function annotateDrawOne(co, pt, mapW, mapH, isNew, placed) {
  const g = annotateSvgEl("g", { "class": "annotate-callout", "data-id": co.id });
  const labelW = co.w || 148;
  const labelH = co.sub ? 40 : 26;
  const pos = placeLabel(pt, labelW, labelH, mapW, mapH, { placed: placed || [] });
  if (Array.isArray(placed)) placed.push({ x: pos.x, y: pos.y, w: labelW, h: labelH });
  const boxCx = pos.x + labelW / 2;
  const boxCy = pos.y + labelH / 2;
  // Leader endpoint: the box edge nearest the point.
  const ex = Math.max(pos.x, Math.min(pos.x + labelW, pt.x));
  const ey = Math.max(pos.y, Math.min(pos.y + labelH, pt.y));
  const line = annotateSvgEl("line", {
    x1: String(pt.x), y1: String(pt.y), x2: String(ex), y2: String(ey),
    "class": "annotate-line"
  });
  const len = Math.max(1, Math.hypot(ex - pt.x, ey - pt.y));
  const reduced = annotateReduced();
  const animate = isNew && !reduced;
  if (animate) {
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len);
  }
  g.appendChild(line);
  const dot = annotateSvgEl("circle", {
    cx: String(pt.x), cy: String(pt.y), r: "3.5", "class": "annotate-dot"
  });
  g.appendChild(dot);
  const rect = annotateSvgEl("rect", {
    x: String(pos.x), y: String(pos.y), width: String(labelW),
    height: String(labelH), rx: "5", "class": "annotate-box"
  });
  g.appendChild(rect);
  const t1 = annotateSvgEl("text", {
    x: String(pos.x + 8), y: String(pos.y + (co.sub ? 17 : 18)),
    "class": "annotate-title"
  });
  t1.textContent = co.title;
  g.appendChild(t1);
  if (co.sub) {
    const t2 = annotateSvgEl("text", {
      x: String(pos.x + 8), y: String(pos.y + 32), "class": "annotate-sub"
    });
    t2.textContent = co.sub;
    g.appendChild(t2);
  }
  if (co.counter) {
    const t3 = annotateSvgEl("text", {
      x: String(boxCx), y: String(pos.y - 6),
      "class": "annotate-counter", "text-anchor": "middle"
    });
    t3.textContent = co.counter;
    t3.dataset.counterId = co.id;
    g.appendChild(t3);
  }
  if (animate && annotateHasGsap()) {
    try {
      gsap.to(line.style, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" });
      gsap.from(rect, { opacity: 0, duration: 0.3 });
      gsap.from(t1, { opacity: 0, duration: 0.3 });
    } catch (e) {
      line.style.strokeDashoffset = "0";
    }
  } else {
    try { line.style.strokeDashoffset = "0"; } catch (e) { /* ignore */ }
  }
  void boxCy;
  return g;
}

function annotateViewKey(w, h) {
  try {
    const c = annotateMap.getCenter ? annotateMap.getCenter() : { lng: 0, lat: 0 };
    const z = annotateMap.getZoom ? annotateMap.getZoom() : 0;
    const b = annotateMap.getBearing ? annotateMap.getBearing() : 0;
    const p = annotateMap.getPitch ? annotateMap.getPitch() : 0;
    const lng = (c && c.lng !== undefined) ? c.lng : c[0];
    const lat = (c && c.lat !== undefined) ? c.lat : c[1];
    return `${annotateSeq}|${w}x${h}|${lng},${lat}|${z}|${b}|${p}`;
  } catch (e) {
    return `${annotateSeq}|${w}x${h}|${Date.now()}`;
  }
}

// Reproject every callout. Called on map "move" and on the GSAP ticker;
// redraws only when the viewport, the size or the callout list changed,
// so idle ticker frames are no-ops.
function AnnotateUpdate() {
  if (!annotateSvg || !annotateMap || !annotateBox) return;
  const { w, h } = annotateSize();
  if (w <= 0 || h <= 0) return;
  const key = annotateViewKey(w, h);
  if (key === annotateLastView) return;
  annotateLastView = key;
  while (annotateSvg.firstChild) annotateSvg.removeChild(annotateSvg.firstChild);
  // Labels place in list order against the boxes already drawn this
  // frame, so collisions move later labels instead of stacking them.
  const placedBoxes = [];
  for (const co of annotateCallouts) {
    const pt = annotateProject(co.lon, co.lat);
    if (!pt) continue;
    if (pt.x < -50 || pt.y < -50 || pt.x > w + 50 || pt.y > h + 50) continue;
    const isNew = !annotateDrawn[co.id];
    try { annotateSvg.appendChild(annotateDrawOne(co, pt, w, h, isNew, placedBoxes)); } catch (e) { /* ignore */ }
    annotateDrawn[co.id] = true;
  }
  if (annotateSam) {
    try { annotateDrawSam(w, h); } catch (e) { /* ignore */ }
  }
  if (annotateRings) {
    try { annotateDrawRings(w, h); } catch (e) { /* ignore */ }
  }
}

// Phase 7d HUD rings: two thin circles about the bridge centroid at fixed
// metre radii (so they scale with zoom). The metre-to-pixel scale comes
// from the map projection itself (an eastward offset of radii metres),
// so pitch and bearing are honoured the same way the leader lines are.
// Dashed strokes make the slow counter-rotation visible; under reduced
// motion the angles stay at 0.
function annotateMetresToPx(lon, lat, metres) {
  const p0 = annotateProject(lon, lat);
  if (!p0) return null;
  const cosLat = Math.cos(Number(lat) * Math.PI / 180);
  if (!(cosLat > 0.01)) return null;
  const p1 = annotateProject(Number(lon) + Number(metres) / (111320 * cosLat),
    Number(lat));
  if (!p1) return null;
  return Math.hypot(p1.x - p0.x, p1.y - p0.y);
}

function annotateDrawRings(mapW, mapH) {
  if (!annotateRings || !annotateSvg) return;
  const c = annotateProject(annotateRings.lon, annotateRings.lat);
  if (!c) return;
  if (c.x < -400 || c.y < -400 || c.x > mapW + 400 || c.y > mapH + 400) return;
  annotateRingCenter = { x: c.x, y: c.y };
  const radii = annotateRings.radii || [];
  for (let i = 0; i < radii.length && i < 2; i++) {
    const rp = annotateMetresToPx(annotateRings.lon, annotateRings.lat,
      radii[i]);
    if (!(rp > 2)) continue;
    const g = annotateSvgEl("g", { "class": "annotate-ring",
      "data-ring": String(i),
      transform: `rotate(${annotateRingAngles[i] || 0} ${c.x.toFixed(1)} ${c.y.toFixed(1)})` });
    const circle = annotateSvgEl("circle", {
      cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: rp.toFixed(1),
      "class": i === 0 ? "annotate-ring-1" : "annotate-ring-2"
    });
    g.appendChild(circle);
    annotateSvg.appendChild(g);
  }
}

// Slow counter-rotation (about 8°/s and −6°/s). Updates the drawn groups'
// transforms in place, so idle rotation never triggers a full redraw;
// the next AnnotateUpdate (pan, zoom, tilt) redraws at the new centre
// with the current angles. Never started under reduced motion.
function annotateTickRings(dtMs) {
  if (!annotateRings || !annotateSvg) return;
  if (annotateReduced()) return;
  const dt = (Number(dtMs) > 0) ? Number(dtMs) : 50;
  annotateRingAngles[0] = (annotateRingAngles[0] + 8 * dt / 1000) % 360;
  annotateRingAngles[1] = (annotateRingAngles[1] - 6 * dt / 1000) % 360;
  const cc = annotateRingCenter;
  if (!cc) return;
  let groups = null;
  try {
    groups = annotateSvg.querySelectorAll(".annotate-ring");
  } catch (e) { groups = null; }
  if (!groups) return;
  for (const g of Array.from(groups)) {
    const i = Number(g.getAttribute("data-ring")) || 0;
    try {
      g.setAttribute("transform",
        `rotate(${annotateRingAngles[i] || 0} ${cc.x.toFixed(1)} ${cc.y.toFixed(1)})`);
    } catch (e) { /* ignore */ }
  }
}

function annotateStartRingTicker() {
  if (annotateRingTicking) return;
  if (annotateReduced()) return;
  annotateRingTicking = true;
  try {
    if (annotateHasGsap() && gsap.ticker) {
      let last = null;
      const cb = (time) => {
        if (!annotateRings) { last = null; return; }
        const now = Number(time) * 1000;
        const dt = (last === null) ? 50 : Math.min(250, now - last);
        last = now;
        annotateTickRings(dt);
      };
      cb._annotateRings = true;
      annotateRingTimer = cb;
      gsap.ticker.add(cb);
      return;
    }
  } catch (e) { /* fall through to setInterval */ }
  try {
    annotateRingTimer = setInterval(() => annotateTickRings(50), 50);
  } catch (e) { annotateRingTimer = null; }
}

function annotateStopRingTicker() {
  annotateRingTicking = false;
  try {
    if (annotateRingTimer) {
      if (annotateHasGsap() && gsap.ticker &&
          typeof annotateRingTimer === "function") {
        gsap.ticker.remove(annotateRingTimer);
      } else {
        clearInterval(annotateRingTimer);
      }
    }
  } catch (e) { /* ignore */ }
  annotateRingTimer = null;
}

// Scene-7 SAM outline: the polygon ring projected to screen, drawn with a
// 1.2 s stroke-dashoffset on first show (instant under reduced motion),
// plus the "SAM 3.1 · score · IoU" label above its centroid.
function annotateDrawSam(mapW, mapH) {
  const ring = (annotateSam && annotateSam.ring) || [];
  const pts = [];
  for (const c of ring) {
    const lon = Array.isArray(c) ? c[0] : (c && (c.lon !== undefined ? c.lon : c.lng));
    const lat = Array.isArray(c) ? c[1] : (c && c.lat);
    const pt = annotateProject(lon, lat);
    if (pt) pts.push(pt);
  }
  if (pts.length < 3) return;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  d += " Z";
  const path = annotateSvgEl("path", { d, "class": "annotate-sam" });
  annotateSvg.appendChild(path);
  const isNew = !annotateSamDrawn;
  annotateSamDrawn = true;
  const reduced = annotateReduced();
  if (isNew && !reduced && annotateHasGsap()) {
    let len = 0;
    try { len = path.getTotalLength(); } catch (e) { len = 0; }
    if (!(len > 0)) {
      len = 1;
      for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
    }
    try {
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      gsap.to(path.style, { strokeDashoffset: 0, duration: 1.2, ease: "power2.out" });
    } catch (e) {
      try { path.style.strokeDashoffset = "0"; } catch (e2) { /* ignore */ }
    }
  } else {
    try { path.style.strokeDashoffset = "0"; } catch (e) { /* ignore */ }
  }
  if (annotateSam.label) {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    const lx = Math.max(8, Math.min(mapW - 8, cx));
    const ly = Math.max(16, Math.min(mapH - 8, cy - 12));
    const t = annotateSvgEl("text", { x: String(lx.toFixed(1)), y: String(ly.toFixed(1)),
      "class": "annotate-sam-label", "text-anchor": "middle" });
    t.textContent = annotateSam.label;
    annotateSvg.appendChild(t);
  }
}

function AnnotateInit(mapInstance, container) {
  annotateMap = mapInstance || null;
  annotateBox = container || null;
  if (!annotateBox || typeof document === "undefined") return null;
  try {
    let svg = annotateBox.querySelector(":scope > svg.annotate-svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "annotate-svg");
      svg.setAttribute("aria-hidden", "true");
      annotateBox.appendChild(svg);
    }
    annotateSvg = svg;
    annotateSize();
  } catch (e) { return null; }
  if (!annotateWired && annotateMap) {
    annotateWired = true;
    try { annotateMap.on("move", AnnotateUpdate); } catch (e) { /* ignore */ }
    try {
      if (annotateHasGsap() && gsap.ticker) gsap.ticker.add(AnnotateUpdate);
    } catch (e) { /* ignore */ }
    try { window.addEventListener("resize", AnnotateUpdate); } catch (e) { /* ignore */ }
  }
  // Draw any list set before init (e.g. the first Explore refresh).
  try { AnnotateUpdate(); } catch (e) { /* ignore */ }
  return annotateSvg;
}

// Replace the callout list (each: {id, lon, lat, title, sub?, counter?}).
function AnnotateSetCallouts(list) {
  annotateCallouts = (list || []).slice();
  annotateSeq++;
  AnnotateUpdate();
}

function AnnotateClear(prefix) {
  if (!prefix) {
    annotateCallouts = [];
    annotateDrawn = {};
    annotateSam = null;
    annotateSamDrawn = false;
    annotateRings = null;
    annotateRingAngles = [0, 0];
    annotateRingCenter = null;
    annotateStopRingTicker();
    try {
      const hud = (typeof document !== "undefined")
        ? document.getElementById("deckHud") : null;
      if (hud) hud.setAttribute("hidden", "");
    } catch (e) { /* ignore */ }
  } else {
    annotateCallouts = annotateCallouts.filter((c) => String(c.id).indexOf(prefix) !== 0);
    for (const k of Object.keys(annotateDrawn)) {
      if (k.indexOf(prefix) === 0) delete annotateDrawn[k];
    }
    if (prefix === "sam-") {
      annotateSam = null;
      annotateSamDrawn = false;
    }
  }
  annotateSeq++;
  annotateLastView = "";
  AnnotateUpdate();
}

// Scene-7 SAM outline (ring: [[lon,lat]...] exterior ring, label: text).
function AnnotateSetSamOutline(ring, label) {
  annotateSam = { ring: (ring || []).slice(), label: label || "" };
  annotateSamDrawn = false;
  annotateSeq++;
  AnnotateUpdate();
}

function AnnotateClearSam() {
  annotateSam = null;
  annotateSamDrawn = false;
  annotateSeq++;
  annotateLastView = "";
  AnnotateUpdate();
}

// Phase 7d HUD rings (close-up: story scenes 5-6, Explore at zoom ≥ 14).
// Off on the phone layout. Rotation starts unless reduced motion is set.
function AnnotateSetRings(lon, lat, radiiM) {
  if (annotatePhone()) {
    AnnotateClearRings();
    return;
  }
  const radii = (radiiM || []).slice(0, 2).map(Number).filter((r) => r > 0);
  if (!radii.length || lon === null || lon === undefined ||
      lat === null || lat === undefined) {
    AnnotateClearRings();
    return;
  }
  annotateRings = { lon: Number(lon), lat: Number(lat), radii };
  annotateSeq++;
  annotateLastView = "";
  annotateStartRingTicker();
  AnnotateUpdate();
}

function AnnotateClearRings() {
  annotateRings = null;
  annotateRingAngles = [0, 0];
  annotateRingCenter = null;
  annotateStopRingTicker();
  annotateSeq++;
  annotateLastView = "";
  AnnotateUpdate();
}

// Phase 7d HUD data block: four sparse lines from the bound month's data
// only (name, cutoff, rank/z, worry word with the technical term in small
// print). aria-live="polite", updated once per call — callers set it once
// per month change so it announces once. Nothing inside is focusable.
function AnnotateSetHud(data) {
  if (typeof document === "undefined") return;
  const d = data || {};
  let box = null;
  try { box = document.getElementById("deckHud"); } catch (e) { box = null; }
  if (!box) {
    try {
      const host = annotateBox ||
        document.getElementById("map") || document.body;
      if (!host) return;
      box = document.createElement("div");
      box.id = "deckHud";
      box.setAttribute("aria-live", "polite");
      host.appendChild(box);
    } catch (e) { return; }
  }
  let lines = null;
  try {
    if (typeof hudLinesFor === "function") {
      lines = hudLinesFor(d.name, d.cutoff, d.rank, d.n, d.z, d.risk);
    }
  } catch (e) { lines = null; }
  if (!lines) {
    // Fallback when deck3d.js failed to load: same four lines, same
    // worry words, computed locally.
    const worry = (r) => r === "high" ? "send an inspector"
      : r === "elevated" ? "look closer"
      : r === "watch" ? "keep watching"
      : r === "none" ? "fine" : "not monitored";
    const tech = (d.risk === "high" || d.risk === "elevated" ||
      d.risk === "watch" || d.risk === "none") ? d.risk : "unknown";
    const r = (d.rank === null || d.rank === undefined) ? "—" : String(d.rank);
    const nn = (d.n === null || d.n === undefined) ? "—" : String(d.n);
    const zz = (d.z === null || d.z === undefined || Number.isNaN(Number(d.z)))
      ? "—" : Number(d.z).toFixed(2);
    lines = { lines: [String(d.name), String(d.cutoff),
      `rank ${r} of ${nn} · z ${zz}`, worry(d.risk)], tech };
  }
  const escHud = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  try {
    const L = lines.lines || [];
    box.innerHTML =
      `<div class="hud-name">${escHud(L[0] || "")}</div>` +
      `<div class="hud-cutoff">${escHud(L[1] || "")}</div>` +
      `<div class="hud-rank">${escHud(L[2] || "")}</div>` +
      `<div class="hud-risk">${escHud(L[3] || "")} ` +
      `<small>${escHud(lines.tech || "")}</small></div>`;
    box.removeAttribute("hidden");
  } catch (e) { /* ignore */ }
}

function AnnotateClearHud() {
  try {
    const box = (typeof document !== "undefined")
      ? document.getElementById("deckHud") : null;
    if (box) box.setAttribute("hidden", "");
  } catch (e) { /* ignore */ }
}

// Tween a counter's text from one rank/z to another. Under reduced motion
// (or without GSAP) the final value is shown immediately.
function AnnotateTweenCounter(calloutId, fromRank, toRank, n, fromZ, toZ, dur) {
  const finalText = formatRankCounter(toRank, n, toZ);
  const reduced = annotateReduced();
  const apply = (txt) => {
    for (const co of annotateCallouts) {
      if (co.id === calloutId) co.counter = txt;
    }
    try {
      const node = annotateSvg && annotateSvg.querySelector(`[data-counter-id="${calloutId}"]`);
      if (node) node.textContent = txt;
    } catch (e) { /* ignore */ }
  };
  if (reduced || !annotateHasGsap()) {
    apply(finalText);
    AnnotateUpdate();
    return;
  }
  const r0 = Number(fromRank), r1 = Number(toRank);
  const z0 = Number(fromZ), z1 = Number(toZ);
  const bothNum = !Number.isNaN(r0) && !Number.isNaN(r1) &&
    !Number.isNaN(z0) && !Number.isNaN(z1);
  if (!bothNum) {
    apply(finalText);
    AnnotateUpdate();
    return;
  }
  try {
    const state = { r: r0, z: z0 };
    gsap.to(state, {
      r: r1, z: z1, duration: dur || 1.2, ease: "power1.out",
      onUpdate: () => apply(formatRankCounter(Math.round(state.r), n, state.z)),
      onComplete: () => apply(finalText)
    });
  } catch (e) {
    apply(finalText);
    AnnotateUpdate();
  }
}

// Render the bridge side view into a host SVG element: baseline, pillars
// between blocks, deck blocks displaced by the month's anomaly, and the
// exaggeration label. Animates displacement over 300 ms (0 reduced).
function AnnotateRenderSideView(svg, spans, cutoffIdx, lenM, opts) {
  if (!svg) return null;
  const o = opts || {};
  const geo = deckGeometry(spans, cutoffIdx, lenM, o);
  const W = geo.width, baseY = geo.baselineY;
  const H = o.height || 110;
  const NS = "http://www.w3.org/2000/svg";
  // Previous block positions so re-renders (slider, story steps) tween
  // from the current displacement instead of jumping from flat.
  let prevY = null;
  try {
    const old = svg.querySelectorAll("rect.deck-block");
    if (old && old.length === geo.blocks.length) {
      prevY = [];
      old.forEach((r) => prevY.push(Number(r.getAttribute("y"))));
    }
  } catch (e) { prevY = null; }
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  const mk = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs || {})) el.setAttribute(k, attrs[k]);
    svg.appendChild(el);
    return el;
  };
  mk("line", { x1: "6", y1: String(baseY + 26), x2: String(W - 6),
    y2: String(baseY + 26), "class": "deck-ground" });
  // Pillars between blocks, from the baseline down to the ground.
  const xs = geo.blocks.map((b) => b.x).sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const px = (xs[i] + xs[i + 1]) / 2;
    mk("rect", { x: String(px - 2), y: String(baseY + 6), width: "4",
      height: "20", "class": "deck-pillar" });
  }
  mk("line", { x1: "6", y1: String(baseY), x2: String(W - 6),
    y2: String(baseY), "class": "deck-baseline" });
  const reduced = annotateReduced();
  for (const b of geo.blocks) {
    const y = baseY - geo.blockH / 2 + b.dy;
    const r = mk("rect", { x: String(b.x - b.w / 2), y: String(y),
      width: String(b.w), height: String(geo.blockH), rx: "2",
      "class": "deck-block" + (b.isNull ? " is-null" : "") });
    r.setAttribute("fill", b.color);
    const tip = (b.value === null) ? `span ${b.span}: no data`
      : `span ${b.span}: ${formatSpanValue(b.value)}`;
    const title = document.createElementNS(NS, "title");
    title.textContent = tip;
    r.appendChild(title);
  }
  const lab = mk("text", { x: String(W - 6), y: String(H - 6),
    "class": "deck-factor", "text-anchor": "end" });
  lab.textContent = `vertical ×${geo.factor.toFixed(1)}`;
  // Animate displacement over 300 ms (static under reduced motion):
  // first render rises from flat, re-renders tween from the previous
  // displacement to the new one.
  if (!reduced && annotateHasGsap()) {
    try {
      const rects = svg.querySelectorAll("rect.deck-block");
      rects.forEach((rect, i) => {
        const b = geo.blocks[i];
        if (!b || b.isNull) return;
        const target = baseY - geo.blockH / 2 + b.dy;
        const flat = baseY - geo.blockH / 2;
        const from = (prevY && Number.isFinite(prevY[i])) ? prevY[i] : flat;
        if (Math.abs(from - target) < 0.05) return;
        gsap.fromTo(rect, { attr: { y: from } },
          { attr: { y: target }, duration: 0.3, ease: "power2.out" });
      });
    } catch (e) { /* static fallback is already drawn */ }
  }
  return geo;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    formatCounter, formatSpanValue, formatRankCounter, formatSamLabel,
    projectPath, placeLabel, spanColor, riskColor, fastestSpan,
    deckGeometry, exploreCalloutsFor
  };
}
