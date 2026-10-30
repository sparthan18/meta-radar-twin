"use strict";
// RadarTwin explainer (phases 7c-8b, scene 2): how radar sees a 1 mm kerb
// move. The 8b pass redraws the SVG as a FUI diagram; the pure timing
// below is untouched, so the chart-to-dot morph keeps its beats.
//
// Pure part (no DOM) runs in node and is tested by tests/test_explainer.js:
// explainerFrame(t) returns the element positions for a time t in seconds
// over the 16 s scene. The browser part (below the banner) renders those
// positions into an SVG over #sceneCover and syncs from the story playhead.
//
// Beats follow the scene-2 captions: 0-6 s first pass (satellite, pulses,
// echo), 6-11.5 s second pass a month later (kerb 1 mm higher, echo a hair
// later, counter to +1.0 mm), 11.5-16 s monthly positions as a line chart
// that turns into one of the map's span dots.

// ---------- Pure part ----------

const EXPLAINER_DURATION = 16.0;
const EXPLAINER_BEAT1_END = 6.0;
const EXPLAINER_BEAT2_END = 11.5;
const EXPLAINER_SAT_Y = 60;
const EXPLAINER_SAT_X0 = 80;
const EXPLAINER_SAT_X1 = 720;
const EXPLAINER_KERB_LIFT_PX = 14; // exaggerated 1 mm
const EXPLAINER_PULSE_PERIOD = 1.5;

function explainerClampT(t) {
  const v = Number(t);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(EXPLAINER_DURATION, v));
}

// Beat index 1, 2 or 3 for a scene-local time.
function explainerBeat(t) {
  const c = explainerClampT(t);
  if (c < EXPLAINER_BEAT1_END) return 1;
  if (c < EXPLAINER_BEAT2_END) return 2;
  return 3;
}

// Satellite x crossing the top; beat 2 repeats the pass. Parked at the
// end in beat 3 (hidden; the chart owns the frame).
function explainerSatX(t) {
  const c = explainerClampT(t);
  const b = explainerBeat(c);
  const span = EXPLAINER_SAT_X1 - EXPLAINER_SAT_X0;
  if (b === 1) return EXPLAINER_SAT_X0 + span * (c / EXPLAINER_BEAT1_END);
  if (b === 2) {
    return EXPLAINER_SAT_X0 + span *
      ((c - EXPLAINER_BEAT1_END) / (EXPLAINER_BEAT2_END - EXPLAINER_BEAT1_END));
  }
  return EXPLAINER_SAT_X1;
}

function explainerSatVisible(t) {
  return explainerBeat(t) < 3;
}

// Outgoing pulse: expanding arc radius + fading opacity, one cycle per
// EXPLAINER_PULSE_PERIOD within the beat. Silent in beat 3.
function explainerPulse(t) {
  const c = explainerClampT(t);
  const b = explainerBeat(c);
  if (b === 3) return { r: 0, opacity: 0 };
  const start = (b === 1) ? 0 : EXPLAINER_BEAT1_END;
  const phase = ((c - start) % EXPLAINER_PULSE_PERIOD) / EXPLAINER_PULSE_PERIOD;
  return { r: 20 + phase * 180, opacity: 0.9 * (1 - phase) };
}

// Returning echo from the kerb. Beat 2 arrives a hair later (longer delay)
// because the kerb sits 1 mm higher.
function explainerEcho(t) {
  const c = explainerClampT(t);
  const b = explainerBeat(c);
  if (b === 3) return { r: 0, opacity: 0 };
  const start = (b === 1) ? 0 : EXPLAINER_BEAT1_END;
  const delay = (b === 1) ? 0.4 : 0.65;
  const eff = c - start - delay;
  if (eff < 0) return { r: 10, opacity: 0 };
  const phase = (eff % EXPLAINER_PULSE_PERIOD) / EXPLAINER_PULSE_PERIOD;
  return { r: 10 + phase * 160, opacity: 0.9 * (1 - phase) };
}

// Kerb lift in px (0 in beat 1, ramps over the first second of beat 2,
// holds through beat 3). Up is negative y.
function explainerKerbDy(t) {
  const c = explainerClampT(t);
  if (c < EXPLAINER_BEAT1_END) return 0;
  if (c < EXPLAINER_BEAT1_END + 1) {
    return -EXPLAINER_KERB_LIFT_PX * (c - EXPLAINER_BEAT1_END);
  }
  return -EXPLAINER_KERB_LIFT_PX;
}

// Counter value in mm: 0 through beat 1, 0 -> 1 over beat 2, holds at 1.
function explainerCounter(t) {
  const c = explainerClampT(t);
  if (c < EXPLAINER_BEAT1_END) return 0;
  if (c < EXPLAINER_BEAT2_END) {
    return Math.min(1, (c - EXPLAINER_BEAT1_END) / 4.0);
  }
  return 1.0;
}

function explainerCounterText(t) {
  return `+${explainerCounter(t).toFixed(1)} mm`;
}

// Beat 3: the line chart draws over 11.5-14 s, then morphs into a span dot.
function explainerChartProgress(t) {
  const c = explainerClampT(t);
  if (c < EXPLAINER_BEAT2_END) return 0;
  return Math.max(0, Math.min(1, (c - EXPLAINER_BEAT2_END) / 2.5));
}

function explainerDotMorph(t) {
  const c = explainerClampT(t);
  if (c < 14.0) return 0;
  return Math.max(0, Math.min(1, (c - 14.0) / 2.0));
}

// Twelve monthly kerb positions in mm, 0 -> 1. Deterministic fixture.
function explainerChartPoints() {
  return [0, 0.1, 0.05, 0.2, 0.3, 0.35, 0.5, 0.6, 0.55, 0.7, 0.85, 1.0];
}

// Composite frame: every animated element's position at time t.
function explainerFrame(t) {
  const c = explainerClampT(t);
  return {
    t: c,
    beat: explainerBeat(c),
    sat: { x: explainerSatX(c), y: EXPLAINER_SAT_Y,
      visible: explainerSatVisible(c) },
    pulse: explainerPulse(c),
    echo: explainerEcho(c),
    kerbDy: explainerKerbDy(c),
    counter: explainerCounter(c),
    chartProgress: explainerChartProgress(c),
    dotMorph: explainerDotMorph(c)
  };
}

// Reduced motion: one still frame per beat, switched at the caption times.
function explainerReducedT(t) {
  const b = explainerBeat(t);
  if (b === 1) return 5.0;
  if (b === 2) return 10.5;
  return 15.0;
}

// Phase 8b fix: scene-2 geometry. The lowest diagram element is the
// "bridge" label at deck y + 62 (SVG units); the cover reserves
// 8vh + 166 px below the SVG (104 px two-line caption + 40 px gap +
// 22 px slack) so the diagram sits above the caption band at both
// review sizes. Pure; mirrors web/story.css #sceneCover / #caption.
const EXPLAINER_LOWEST_Y = 412;
const EXPLAINER_COVER_BELOW_VH = 0.08;
const EXPLAINER_COVER_BELOW_PX = 166;
const EXPLAINER_CAPTION_BELOW_VH = 0.08;
const EXPLAINER_CAPTION_BELOW_PX = 16;
const EXPLAINER_CAPTION_PAD = 30;
const EXPLAINER_CAPTION_LINE = 36.8;

function explainerDiagramBottom(viewportW, viewportH) {
  const vw = Number(viewportW), vh = Number(viewportH);
  if (!(vw > 0) || !(vh > 0)) return 0;
  const pad = EXPLAINER_COVER_BELOW_VH * vh + EXPLAINER_COVER_BELOW_PX;
  const contentH = Math.max(1, vh - pad);
  const scale = Math.min(vw / 800, contentH / 450);
  const renderedH = 450 * scale;
  const offY = (contentH - renderedH) / 2;
  return offY + EXPLAINER_LOWEST_Y * scale;
}

function explainerCaptionTop(viewportH, lines) {
  const vh = Number(viewportH);
  if (!(vh > 0)) return 0;
  const n = (lines === undefined || lines === null) ? 2 : Number(lines);
  const bottom = vh - (EXPLAINER_CAPTION_BELOW_VH * vh +
    EXPLAINER_CAPTION_BELOW_PX);
  const h = EXPLAINER_CAPTION_PAD + Math.max(0, n) * EXPLAINER_CAPTION_LINE;
  return bottom - h;
}

// ---------- Browser part ----------
// ExplainerShow(container) builds the SVG; ExplainerSync(container, t)
// moves every element to explainerFrame(t) (snapped per-beat under reduced
// motion); ExplainerDestroy(container) clears it. Nothing here runs in node.

const EXPLAINER_NS = "http://www.w3.org/2000/svg";
const EXPLAINER_W = 800;
const EXPLAINER_H = 450;
const EXPLAINER_KERB_X = 400;
const EXPLAINER_DECK_Y = 350;

function explainerReducedMotion() {
  try {
    if (typeof REDUCED !== "undefined") return !!REDUCED;
  } catch (e) { /* fall through */ }
  try {
    return !!(typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) { return false; }
}

function explainerMk(tag, attrs, parent) {
  const el = document.createElementNS(EXPLAINER_NS, tag);
  for (const k of Object.keys(attrs || {})) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

function explainerChartXY(i, v) {
  // Chart area x 300-600, y for 0..1.2 mm mapped to 250->150.
  const pts = explainerChartPoints();
  const n = pts.length;
  const x = 300 + (i / (n - 1)) * 300;
  const y = 250 - (Math.max(0, Math.min(1.2, v)) / 1.2) * 100;
  return [x, y];
}

// Corner brackets for a box (x0, y0, x1, y1) with corner size s: four
// open corners as one path, the FUI bracket frame in miniature.
function explainerCorners(x0, y0, x1, y1, s) {
  return `M ${x0} ${y0 + s} L ${x0} ${y0} L ${x0 + s} ${y0} ` +
    `M ${x1 - s} ${y0} L ${x1} ${y0} L ${x1} ${y0 + s} ` +
    `M ${x1} ${y1 - s} L ${x1} ${y1} L ${x1 - s} ${y1} ` +
    `M ${x0 + s} ${y1} L ${x0} ${y1} L ${x0} ${y1 - s}`;
}

// Build the scene-2 SVG inside container (clears it first). Returns the
// svg element, or null when there is no DOM.
function ExplainerShow(container) {
  if (!container || typeof document === "undefined") return null;
  while (container.firstChild) container.removeChild(container.firstChild);
  const svg = explainerMk("svg", {
    viewBox: `0 0 ${EXPLAINER_W} ${EXPLAINER_H}`,
    class: "explainer-svg", role: "img",
    "aria-label": "Satellite radar pulses bounce off a bridge kerb; a month later the kerb is 1 millimetre higher and the echo arrives later."
  }, container);
  explainerMk("rect", { x: "0", y: "0", width: String(EXPLAINER_W),
    height: String(EXPLAINER_H), class: "explainer-bg" }, svg);
  // Satellite group (moved per frame).
  const sat = explainerMk("g", { class: "explainer-sat", id: "expSat" }, svg);
  explainerMk("rect", { x: "-15", y: "-18", width: "30", height: "10",
    class: "explainer-panel" }, sat);
  explainerMk("rect", { x: "-22", y: "-8", width: "44", height: "20",
    rx: "3", class: "explainer-body" }, sat);
  explainerMk("rect", { x: "-52", y: "-4", width: "26", height: "12",
    class: "explainer-panel" }, sat);
  explainerMk("rect", { x: "26", y: "-4", width: "26", height: "12",
    class: "explainer-panel" }, sat);
  explainerMk("path", { d: explainerCorners(-58, -24, 58, 18, 8),
    class: "explainer-bracket", fill: "none" }, sat);
  const satLab = explainerMk("text", { x: "0", y: "32",
    class: "explainer-label", "text-anchor": "middle" }, sat);
  satLab.textContent = "satellite";
  // Pulse + echo arcs (paths updated per frame).
  explainerMk("path", { id: "expPulse", class: "explainer-pulse",
    d: "M 0 0", fill: "none" }, svg);
  explainerMk("path", { id: "expEcho", class: "explainer-echo",
    d: "M 0 0", fill: "none" }, svg);
  // The dashed echo path from the satellite to the kerb (also per frame).
  explainerMk("path", { id: "expEchoPath", class: "explainer-echo-path",
    d: "M 0 0", fill: "none" }, svg);
  // Bridge deck, pillars, kerb.
  explainerMk("rect", { x: "150", y: String(EXPLAINER_DECK_Y),
    width: "500", height: "8", class: "explainer-deck" }, svg);
  for (const px of [250, 400, 550]) {
    explainerMk("rect", { x: String(px - 3), y: String(EXPLAINER_DECK_Y + 8),
      width: "6", height: "42", class: "explainer-pillar" }, svg);
  }
  const deckLab = explainerMk("text", { x: "150", y: String(EXPLAINER_DECK_Y + 62),
    class: "explainer-label" }, svg);
  deckLab.textContent = "bridge";
  const kerbG = explainerMk("g", { id: "expKerbG" }, svg);
  explainerMk("rect", { id: "expKerb", x: String(EXPLAINER_KERB_X - 5),
    y: String(EXPLAINER_DECK_Y - 12), width: "10", height: "12",
    class: "explainer-kerb" }, kerbG);
  explainerMk("path", {
    d: explainerCorners(EXPLAINER_KERB_X - 9, EXPLAINER_DECK_Y - 16,
      EXPLAINER_KERB_X + 9, EXPLAINER_DECK_Y + 4, 5),
    class: "explainer-bracket", fill: "none" }, kerbG);
  const kerbLab = explainerMk("text", { id: "expKerbLab",
    x: String(EXPLAINER_KERB_X + 14), y: String(EXPLAINER_DECK_Y - 2),
    class: "explainer-label" }, svg);
  kerbLab.textContent = "kerb";
  // Counter.
  const counter = explainerMk("text", { id: "expCounter", x: "620", y: "120",
    class: "explainer-counter", "text-anchor": "middle" }, svg);
  counter.textContent = "+0.0 mm";
  // Beat-3 chart group.
  const chart = explainerMk("g", { id: "expChart", class: "explainer-chart",
    opacity: "0" }, svg);
  explainerMk("line", { x1: "300", y1: "250", x2: "600", y2: "250",
    class: "explainer-axis" }, chart);
  explainerMk("line", { x1: "300", y1: "250", x2: "300", y2: "140",
    class: "explainer-axis" }, chart);
  explainerMk("polyline", { id: "expLine", class: "explainer-line",
    points: "", fill: "none" }, chart);
  const chartLab = explainerMk("text", { x: "300", y: "275",
    class: "explainer-label" }, chart);
  chartLab.textContent = "kerb height, 12 months";
  // Final span dot.
  explainerMk("circle", { id: "expDot", cx: "600", cy: "167", r: "3",
    class: "explainer-dot", opacity: "0" }, svg);
  const dotLab = explainerMk("text", { id: "expDotLab", x: "600", y: "200",
    class: "explainer-label", "text-anchor": "middle", opacity: "0" }, svg);
  dotLab.textContent = "one span dot on the map";
  return svg;
}

function explainerArcDown(cx, cy, r) {
  // Half-circle below (cx, cy).
  return `M ${cx - r} ${cy + 12} A ${r} ${r} 0 0 0 ${cx + r} ${cy + 12}`;
}

function explainerArcUp(cx, cy, r) {
  // Half-circle above (cx, cy).
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
}

// Move every element to the frame for scene-local time t.
function ExplainerSync(container, t) {
  if (!container || typeof document === "undefined") return;
  const tt = explainerReducedMotion() ? explainerReducedT(t) : explainerClampT(t);
  const f = explainerFrame(tt);
  const q = (id) => container.querySelector(`#${id}`);
  const sat = q("expSat"), pulse = q("expPulse"), echo = q("expEcho");
  const echoPath = q("expEchoPath");
  const kerb = q("expKerb"), kerbG = q("expKerbG"), kerbLab = q("expKerbLab");
  const counter = q("expCounter");
  const chart = q("expChart"), line = q("expLine");
  const dot = q("expDot"), dotLab = q("expDotLab");
  if (sat) {
    sat.setAttribute("transform", `translate(${f.sat.x} ${f.sat.y})`);
    sat.setAttribute("opacity", f.sat.visible ? "1" : "0");
  }
  if (pulse) {
    if (f.pulse.opacity > 0.01) {
      pulse.setAttribute("d", explainerArcDown(f.sat.x, f.sat.y, f.pulse.r));
      pulse.setAttribute("opacity", String(f.pulse.opacity));
    } else {
      pulse.setAttribute("opacity", "0");
    }
  }
  if (echo) {
    const ky = EXPLAINER_DECK_Y - 12 + f.kerbDy;
    if (f.echo.opacity > 0.01) {
      echo.setAttribute("d", explainerArcUp(EXPLAINER_KERB_X, ky, f.echo.r));
      echo.setAttribute("opacity", String(f.echo.opacity));
    } else {
      echo.setAttribute("opacity", "0");
    }
  }
  if (echoPath) {
    if (f.sat.visible) {
      const ky = EXPLAINER_DECK_Y - 12 + f.kerbDy;
      echoPath.setAttribute("d",
        `M ${f.sat.x.toFixed(1)} ${EXPLAINER_SAT_Y + 12} L ${EXPLAINER_KERB_X} ${ky.toFixed(1)}`);
      echoPath.setAttribute("opacity", "0.5");
    } else {
      echoPath.setAttribute("opacity", "0");
    }
  }
  // The kerb group (outline + brackets) lifts as one; the label tracks it.
  if (kerbG) kerbG.setAttribute("transform", `translate(0 ${f.kerbDy.toFixed(1)})`);
  else if (kerb) kerb.setAttribute("y", String(EXPLAINER_DECK_Y - 12 + f.kerbDy));
  if (kerbLab) {
    kerbLab.setAttribute("y", String(EXPLAINER_DECK_Y - 2 + f.kerbDy));
    kerbLab.textContent = (f.beat >= 2) ? "kerb +1 mm" : "kerb";
  }
  if (counter) {
    counter.textContent = `+${f.counter.toFixed(1)} mm`;
    counter.setAttribute("opacity", (f.beat >= 2) ? "1" : "0.45");
  }
  // Beat 3: chart draws, then fades as the span dot appears.
  const pts = explainerChartPoints();
  if (chart) chart.setAttribute("opacity", f.beat === 3 ? "1" : "0");
  if (line && f.beat === 3) {
    const n = Math.max(2, Math.round(f.chartProgress * pts.length));
    const shown = pts.slice(0, Math.min(pts.length, n));
    line.setAttribute("points", shown.map((v, i) =>
      explainerChartXY(i, v).map((c) => c.toFixed(1)).join(",")).join(" "));
    line.setAttribute("opacity", String(1 - f.dotMorph * 0.85));
  }
  if (dot) {
    const last = explainerChartXY(pts.length - 1, pts[pts.length - 1]);
    dot.setAttribute("cx", String(last[0]));
    dot.setAttribute("cy", String(last[1]));
    dot.setAttribute("r", String(3 + f.dotMorph * 5));
    dot.setAttribute("opacity", f.beat === 3 ? String(f.dotMorph) : "0");
  }
  if (dotLab) dotLab.setAttribute("opacity",
    (f.beat === 3 && f.dotMorph > 0.5) ? "1" : "0");
}

function ExplainerDestroy(container) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    explainerBeat, explainerSatX, explainerSatVisible, explainerPulse,
    explainerEcho, explainerKerbDy, explainerCounter, explainerCounterText,
    explainerChartProgress, explainerDotMorph, explainerChartPoints,
    explainerFrame, explainerReducedT, explainerClampT,
    explainerDiagramBottom, explainerCaptionTop,
    EXPLAINER_DURATION, EXPLAINER_BEAT1_END, EXPLAINER_BEAT2_END,
    EXPLAINER_SAT_Y, EXPLAINER_SAT_X0, EXPLAINER_SAT_X1,
    EXPLAINER_KERB_LIFT_PX, EXPLAINER_PULSE_PERIOD,
    EXPLAINER_LOWEST_Y
  };
}
