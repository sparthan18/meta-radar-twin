// Chapter 1's callout grammar, built once and meant to be reused: a bracket in world space on the
// subject's real extent (it tracks the camera), a leader drawn from its corner with one kink, the
// subject's name parented to the structure (it rides the bridge's axis, floats a little, and breaks
// with it when the span falls), and a screen-space stack with no plate: meta, headline, clock, notes.
// Also the lock-on brackets over the globe's reticle at the start, and the point the bracket closes
// to at the end, which travels into the next chapter. Everything that moves is a GSAP tween the
// director owns; this module only draws and offers the tweens.
import { footprintAxis } from "../wide/layers.js";

const NS = "http://www.w3.org/2000/svg";
const el = (t, a = {}, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt !== undefined) e.textContent = txt; return e; };
const EASE = "power3.out";
const DEG_M_LAT = 110574;
const NAME = ["CAROLA", "BRÜCKE"];
const M_PER_PX_REF = 2.62; // metres per pixel at the crane's end (zoom 15.2, 51 N): the name is 1:1 there

export function createAcquire(wide, { svg, stack, subjectFeature, subjectLngLat, stackX = 0.67 }) {
  // ---- the subject's frame: metres along from the south (Altstadt) end, metres across, west positive
  const axis = footprintAxis(subjectFeature);
  const [s, e] = axis.start[1] <= axis.end[1] ? [axis.start, axis.end] : [axis.end, axis.start];
  const kx = DEG_M_LAT * Math.cos(s[1] * Math.PI / 180), ky = DEG_M_LAT;
  const dx = (e[0] - s[0]) * kx, dy = (e[1] - s[1]) * ky, L = Math.hypot(dx, dy);
  const u = [dx / L, dy / L], v = [-u[1], u[0]];
  const HALF_W = 16;
  const lnglatAt = (a, p) => [s[0] + (a * u[0] + p * v[0]) / kx, s[1] + (a * u[1] + p * v[1]) / ky];
  const proj = (a, p) => wide.project(lnglatAt(a, p));

  // ---- nodes
  svg.innerHTML = "";
  const gBr = el("g", { class: "aq-bracket" });
  const arms = [0, 1, 2, 3].map(() => { const p = el("path", { d: "" }); gBr.appendChild(p); return p; });
  const gLead = el("g", { class: "aq-leader" });
  const lead = el("path", { d: "" }), leadTick = el("line", {}), leadDot = el("circle", { r: 1.8 });
  gLead.appendChild(lead); gLead.appendChild(leadTick); gLead.appendChild(leadDot);
  const gName = el("g", { class: "aq-name" });
  const gFloat = el("g", {});
  const gA = el("g", { class: "aq-fall" }), gB = el("g", { class: "aq-hold" });
  const tA = el("text", { class: "aq-nametext", x: 0, y: 0, "text-anchor": "start" }, NAME[0]);
  const tB = el("text", { class: "aq-nametext", x: 2, y: 0, "text-anchor": "start" }, NAME[1]);
  const lineA = el("line", { class: "aq-track", y1: 7, y2: 7 }), lineB = el("line", { class: "aq-track", y1: 7, y2: 7 });
  const hinge = el("circle", { class: "aq-hinge", cx: 0, cy: 7, r: 2.4, opacity: 0 });
  gA.appendChild(lineA); gA.appendChild(tA); gB.appendChild(lineB); gB.appendChild(tB);
  gFloat.appendChild(gA); gFloat.appendChild(gB); gFloat.appendChild(hinge); gName.appendChild(gFloat);
  const gGlobe = el("g", { class: "aq-globe" });
  const garms = [0, 1, 2, 3].map(() => { const p = el("path", { d: "" }); gGlobe.appendChild(p); return p; });
  const gPoint = el("g", { class: "aq-point" });
  const pointDot = el("circle", { r: 2.2 });
  const parms = [0, 1, 2, 3].map(() => { const p = el("path", { d: "" }); gPoint.appendChild(p); return p; });
  gPoint.appendChild(pointDot);
  for (const g of [gGlobe, gBr, gLead, gName, gPoint]) svg.appendChild(g);

  // the stack: plain DOM so the type stays real type
  stack.innerHTML = "";
  const line = (cls, txt) => { const d = document.createElement("div"); d.className = `aq-line ${cls}`; d.textContent = txt; stack.appendChild(d); return d; };
  const meta = line("aq-meta", "DRESDEN");
  const rule = document.createElement("div"); rule.className = "aq-rule"; stack.appendChild(rule);
  const head = line("aq-head", "COLLAPSED");
  const clock = line("aq-clock", "11 SEP 2024 · 00:00");
  const note1 = line("aq-note", "NO ONE WAS ON IT");
  const note2 = line("aq-note", "LAST RADAR PASS · 10 DAYS EARLIER");
  const meta_ = meta, clockEl = clock, note1El = note1, note2El = note2;

  // ---- state the tweens drive
  const S = { on: false, event: false, leadDefer: 0, brScale: 1, brOp: 0, leadT: 0, nameN: 0, nameOp: 0, breakK: 0, floatT: 0, globeOp: 0, globeSize: 240, pointOp: 0, pointSize: 0, pointXY: null, leadY: null, follow: null, travelP: 0, travelFrom: null };
  const nameChars = NAME[0].length + NAME[1].length;
  let wA = 0, measured = false;
  // the two halves meet at the hinge with no visible gap: one word until the span breaks it
  const measure = () => { try { tA.textContent = NAME[0]; wA = tA.getComputedTextLength(); const x0 = -wA + 3; tA.setAttribute("x", x0); lineA.setAttribute("x1", x0); lineA.setAttribute("x2", 0); lineB.setAttribute("x1", 0); tB.setAttribute("x", 0); tB.textContent = NAME[1]; lineB.setAttribute("x2", tB.getComputedTextLength() - 3); measured = wA > 0; } catch (_) { measured = false; } };

  const arm = (p, c, d1, d2, len) => { // an L at corner c with arms toward d1 and d2 (unit screen vectors)
    p.setAttribute("d", `M${c[0] + d1[0] * len},${c[1] + d1[1] * len} L${c[0]},${c[1]} L${c[0] + d2[0] * len},${c[1] + d2[1] * len}`);
  };
  const unit = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(d[0], d[1]) || 1; return [d[0] / n, d[1] / n]; };
  const corners = (sc) => { // the four corners of the subject's extent, scaled about its centre, projected
    const c = L / 2;
    return [[c - sc * c, sc * HALF_W], [c + sc * c, sc * HALF_W], [c + sc * c, -sc * HALF_W], [c - sc * c, -sc * HALF_W]].map(([a, p]) => proj(a, p));
  };

  function update() {
    if (!S.on) return;
    // bracket on the structure
    const cs = corners(S.brScale);
    gBr.setAttribute("opacity", S.event ? 0 : S.brOp);
    const armLen = Math.max(8, Math.min(14, 0.3 * Math.hypot(cs[1][0] - cs[0][0], cs[1][1] - cs[0][1])));
    cs.forEach((c, i) => arm(arms[i], c, unit(c, cs[(i + 1) % 4]), unit(c, cs[(i + 3) % 4]), armLen));
    // leader from the rightmost corner, one kink, then flat to the stack's edge
    const right = cs.reduce((m, c) => c[0] > m[0] ? c : m, cs[0]);
    const W = svg.clientWidth || innerWidth, H = svg.clientHeight || innerHeight;
    const sx = Math.round(W * stackX);
    if (S.leadDefer > 0) S.leadDefer--; // after a seek, give the map a frame or two before measuring
    else if (S.event && S.leadY === null) { stack.style.left = `${sx}px`; stack.style.top = `${Math.round(H * 0.36) - 13}px`; } // the close shot has no corner to measure from: the usual row
    else if (S.leadY === null && S.leadT > 0) { S.leadY = Math.max(H * 0.14 + 70, Math.min(H * 0.86 - 260, right[1] - 34)); stack.style.left = `${sx}px`; stack.style.top = `${S.leadY - 13}px`; }
    const ly = S.leadY ?? right[1] - 34;
    const p0 = right, p1 = [right[0] + 44, ly], p2 = [sx - 12, ly];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + (p2[0] - p1[0]);
    lead.setAttribute("d", `M${p0[0]},${p0[1]} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`);
    gLead.setAttribute("opacity", S.event ? 0 : 1);
    lead.style.strokeDasharray = len; lead.style.strokeDashoffset = len * (1 - S.leadT);
    leadTick.setAttribute("x1", p2[0]); leadTick.setAttribute("x2", p2[0]); leadTick.setAttribute("y1", ly - 5); leadTick.setAttribute("y2", ly + 5);
    leadTick.setAttribute("opacity", S.leadT >= 0.99 ? 1 : 0); leadDot.setAttribute("cx", p0[0]); leadDot.setAttribute("cy", p0[1]); leadDot.setAttribute("opacity", S.leadT > 0 ? 1 : 0);
    // the name: a plane on the axis, west of the deck, rotated to the axis on screen, scaled with the camera
    if (!measured) measure();
    const o = proj(L / 2, -58), oa = proj(L / 2 + 1, -58); // east of the deck: the fallen strand is on the west
    const ua = [oa[0] - o[0], oa[1] - o[1]], mag = Math.hypot(ua[0], ua[1]) || 1e-6;
    const ang = Math.atan2(ua[1], ua[0]) * 180 / Math.PI, k = Math.max(0.2, Math.min(3, mag * M_PER_PX_REF));
    gName.setAttribute("transform", `translate(${o[0]},${o[1]}) rotate(${ang}) skewX(-9) scale(${k})`);
    gName.setAttribute("opacity", S.event ? 0 : S.nameOp);
    const fy = 2 * Math.sin(S.floatT * 2 * Math.PI / 1.2), fr = 0.3 * Math.sin(S.floatT * 2 * Math.PI / 1.7);
    gFloat.setAttribute("transform", `translate(0,${fy}) rotate(${fr})`);
    const n = Math.round(S.nameN * nameChars);
    tA.textContent = NAME[0].slice(0, Math.min(NAME[0].length, n)); tB.textContent = NAME[1].slice(0, Math.max(0, n - NAME[0].length));
    const bk = S.breakK;
    gA.setAttribute("transform", `translate(${-3 * bk},${8 * bk}) rotate(${-17 * bk})`);
    hinge.setAttribute("opacity", bk); lineA.setAttribute("class", bk > 0.5 ? "aq-track fallen" : "aq-track");
    // the globe lock-on
    if (S.globeOp > 0 && wide.projectGlobe) {
      const g = wide.projectGlobe(subjectLngLat);
      if (g) { const h = S.globeSize / 2, al = Math.max(6, h * 0.3); gGlobe.setAttribute("opacity", S.globeOp);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx2, sy], i) => arm(garms[i], [g[0] + sx2 * h, g[1] + sy * h], [-sx2, 0], [0, -sy], al)); }
      else gGlobe.setAttribute("opacity", 0);
    } else gGlobe.setAttribute("opacity", 0);
    // the point: on the structure, or travelling to (and then riding) the element it was sent to
    if (S.pointOp > 0) {
      let c = S.pointXY || proj(L / 2, 0);
      if (S.follow) { const r = S.follow.getBoundingClientRect(); if (r.width) { const tgt = [r.left + r.width / 2, r.top + r.height / 2]; const q = S.travelP; c = [S.travelFrom[0] + (tgt[0] - S.travelFrom[0]) * q, S.travelFrom[1] + (tgt[1] - S.travelFrom[1]) * q]; } }
      gPoint.setAttribute("opacity", S.pointOp); pointDot.setAttribute("cx", c[0]); pointDot.setAttribute("cy", c[1]);
      const h = S.pointSize / 2;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx2, sy], i) => arm(parms[i], [c[0] + sx2 * h, c[1] + sy * h], [-sx2, 0], [0, -sy], Math.max(0, h * 0.4)));
      parms.forEach(p => p.setAttribute("opacity", h > 1 ? 1 : 0));
    } else gPoint.setAttribute("opacity", 0);
  }
  let raf = null;
  const loop = () => { update(); raf = requestAnimationFrame(loop); };

  const setLine = (d, op) => { d.style.opacity = op; };
  const api = {
    show(on) { S.on = on; svg.style.display = on ? "block" : "none"; stack.style.display = on ? "block" : "none"; if (on && !raf) loop(); if (!on && raf) { cancelAnimationFrame(raf); raf = null; } },
    reset() {
      Object.assign(S, { event: false, brScale: 1, brOp: 0, leadT: 0, nameN: 0, nameOp: 0, breakK: 0, globeOp: 0, globeSize: 240, pointOp: 0, pointSize: 0, pointXY: null, leadY: null, follow: null, travelP: 0 });
      for (const d of [meta, head, clock, note1, note2]) setLine(d, 0); rule.style.opacity = 0; head.classList.remove("stamp"); clock.textContent = "11 SEP 2024 · 00:00";
      update();
    },
    // the globe lock-on: four corners collapse from 240 px to 44 px onto the reticle
    globeLock() { const tl = gsap.timeline(); tl.set(S, { globeOp: 1, globeSize: 240 }); tl.to(S, { globeSize: 44, duration: 0.6, ease: "expo.out" }); return tl; },
    globeOff() { S.globeOp = 0; },
    // the bracket finds the structure: from twice its extent to its extent
    bracket() { const tl = gsap.timeline(); tl.set(S, { brOp: 1, brScale: 2 }); tl.to(S, { brScale: 1, duration: 0.5, ease: "expo.out" }); return tl; },
    leader() { S.leadY = null; return gsap.to(S, { leadT: 1, duration: 0.3, ease: "none" }); },
    name() { const tl = gsap.timeline(); tl.set(S, { nameOp: 1, nameN: 0 }); tl.to(S, { nameN: 1, duration: 0.25, ease: "none" }); return tl; },
    meta() { const tl = gsap.timeline(); tl.to(meta, { opacity: 1, duration: 0.2 }, 0); tl.to(rule, { opacity: 1, duration: 0.2 }, 0.05); return tl; },
    // the headline stamps in on one frame with a two-frame flash; the clock counts to 03:00
    stamp() {
      const tl = gsap.timeline();
      tl.set(head, { opacity: 1 }, 0); tl.call(() => head.classList.add("stamp"), null, 0); tl.call(() => head.classList.remove("stamp"), null, 0.08);
      tl.set(clock, { opacity: 1 }, 0.05);
      const o = { m: 0 };
      tl.to(o, { m: 180, duration: 0.6, ease: "none", onUpdate: () => { const mm = Math.round(o.m); clock.textContent = `11 SEP 2024 · ${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`; } }, 0.05);
      return tl;
    },
    note(i) { return gsap.to(i === 1 ? note1 : note2, { opacity: 1, duration: 0.3 }); },
    setBreak(k) { S.breakK = k; },
    // the whole layer's state at a moment, with no animation (a seek): progress values 0..1 per element
    instant({ globe = 0, bracket = 0, leader = 0, name = 0, meta = false, head: headOn = false, clock = 0, note1 = false, note2 = false, breakK = 0, event = false, exited = false, point = false } = {}) {
      S.globeOp = globe > 0 ? 1 : 0; S.globeSize = 240 - 196 * Math.min(1, globe);
      S.brOp = 0; S.brScale = 1; // the structure lights instead of wearing corners; the leader's anchor stays the deck's far corner
      S.leadT = exited ? 0 : Math.min(1, leader); S.leadY = null;
      S.nameOp = name > 0 && !exited ? 1 : 0; S.nameN = Math.min(1, name);
      S.breakK = breakK; S.event = !!event; S.follow = null;
      S.pointOp = point ? 1 : 0; S.pointSize = 0; S.pointXY = null;
      const on = (d, v) => { d.style.opacity = v && !exited ? 1 : 0; };
      on(meta_, meta); rule.style.opacity = meta && !exited ? 1 : 0; on(head, headOn); on(clockEl, headOn);
      const mm = Math.round(Math.min(180, Math.max(0, clock))); clockEl.textContent = `11 SEP 2024 · ${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
      on(note1El, note1); on(note2El, note2); head.classList.remove("stamp");
      update(); S.leadY = null; S.leadDefer = 2; // the stack's row is measured two frames on, once the map has settled
    },
    // the event camera: while the fall plays close, the bracket, leader and name step aside; the stack stays
    eventMode(on) { S.event = !!on; update(); },
    lnglatAt, length: L,
    setFloat(t) { S.floatT = t; },
    // exits in reverse order at 60 % of the entrance times; the bracket closes to a point last
    exit() {
      const tl = gsap.timeline();
      tl.to(note2, { opacity: 0, duration: 0.18 }, 0); tl.to(note1, { opacity: 0, duration: 0.18 }, 0.06);
      tl.to([head, clock], { opacity: 0, duration: 0.12 }, 0.14); tl.to([meta, rule], { opacity: 0, duration: 0.12 }, 0.22);
      tl.to(S, { nameN: 0, duration: 0.15, ease: "none" }, 0.28); tl.set(S, { nameOp: 0 }, 0.44);
      tl.to(S, { leadT: 0, duration: 0.18, ease: "none" }, 0.3);
      tl.to(S, { brScale: 0.02, duration: 0.3, ease: "power2.in" }, 0.44);
      tl.set(S, { pointOp: 1, pointSize: 0 }, 0.72); tl.set(S, { brOp: 0 }, 0.74);
      return tl;
    },
    // the point travels to an element (a moving target: it is re-read every frame) and opens as a
    // small bracket on it, rides it a moment, then fades
    travel(target, { dur = 0.5 } = {}) {
      S.travelFrom = (S.pointXY || proj(L / 2, 0)).slice(); S.travelP = 0; S.follow = target; S.pointOp = 1;
      const tl = gsap.timeline({ onComplete: () => { S.follow = null; } });
      tl.to(S, { travelP: 1, duration: dur, ease: "power2.inOut" }, 0);
      tl.to(S, { pointSize: 26, duration: 0.25, ease: "expo.out" }, dur);
      tl.to(S, { pointOp: 0, duration: 0.4 }, dur + 0.5);
      return tl;
    },
    state: S, update,
  };
  api.show(false);
  return api;
}
