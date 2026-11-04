// Chapter "The satellite": the instrument explainer with an isometric Sentinel-1 in place of the
// flat glyph. Copied from explainer.js; only the satellite glyph differs.
import { SAT_MARKUP, SAT_W, SAT_H } from "../../chapter2sat/satellite.mjs";
// Scene 2, how radar sees: an instrument, not a diagram. Left: a gridded scope field with a
// slow sweep, the satellite on its orbit path, side-looking chirps down to a target on a terrain
// profile, the echo returning. Right: the return-phase panel — the two echoes as waveforms, the
// second shifted by the extra travel, a phase dial, and the readouts in real C-band numbers.
// 1 mm of ground motion = 2 mm of two-way path = 13° of phase at a 5.55 cm wavelength.
const NS = "http://www.w3.org/2000/svg";
const el = (t, a, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt !== undefined) e.textContent = txt; return e; };
const W = 1280, H = 672;

export function createExplainerIso(rootId = "explainer2") {
  const root = document.getElementById(rootId);
  const svg = root.querySelector("svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.innerHTML = "";
  const defs = el("defs", {});
  defs.innerHTML = `
    <clipPath id="exScene-${rootId}"><rect x="0" y="0" width="860" height="${H}"/></clipPath>
    <clipPath id="exWave-${rootId}"><rect x="900" y="150" width="320" height="120"/></clipPath>
    <linearGradient id="exSweep-${rootId}" x1="0" x2="1"><stop offset="0" stop-color="#8fd3ff" stop-opacity="0"/><stop offset="1" stop-color="#8fd3ff" stop-opacity="0.35"/></linearGradient>`;
  svg.appendChild(defs);

  // ---- scope field ----
  const field = el("g", { "clip-path": `url(#exScene-${rootId})` });
  const grid = el("g", { class: "ex-grid" });
  for (let x = 0; x <= 860; x += 40) grid.appendChild(el("line", { x1: x, y1: 0, x2: x, y2: H }));
  for (let y = 0; y <= H; y += 40) grid.appendChild(el("line", { x1: 0, y1: y, x2: 860, y2: y }));
  field.appendChild(grid);
  const sweep = el("rect", { class: "ex-sweep", x: -120, y: 0, width: 120, height: H, fill: `url(#exSweep-${rootId})` });
  field.appendChild(sweep);
  // orbit path and look vector
  const orbit = el("path", { class: "ex-orbit", d: "M40,120 Q430,30 820,120" });
  field.appendChild(orbit);
  // ground: terrain profile with a kerb at the target
  const gy = 440;
  const groundD = `M20,${gy + 14} L120,${gy + 6} L220,${gy + 10} L330,${gy} L430,${gy} L430,${gy - 14} L520,${gy - 14} L520,${gy} L640,${gy + 4} L760,${gy - 2} L860,${gy + 8}`;
  const ground = el("path", { class: "ex-ground", d: groundD });
  const kerbTop = el("path", { class: "ex-kerb", d: `M430,${gy - 14} L520,${gy - 14}` });
  const groundFill = el("path", { class: "ex-groundfill", d: groundD + ` L860,${H} L20,${H} Z` });
  field.appendChild(groundFill); field.appendChild(ground); field.appendChild(kerbTop);
  // target reticle on the kerb
  const tx = 475, ty = gy - 14;
  const ret = el("g", { class: "ex-ret" });
  ret.appendChild(el("circle", { cx: tx, cy: ty, r: 14 }));
  ret.appendChild(el("circle", { cx: tx, cy: ty, r: 2.2, class: "fill" }));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ret.appendChild(el("line", { x1: tx + dx * 17, y1: ty + dy * 17, x2: tx + dx * 24, y2: ty + dy * 24 }));
  field.appendChild(ret);
  field.appendChild(el("text", { class: "ex-label", x: tx + 34, y: ty - 28 }, "TARGET · A KERB"));
  field.appendChild(el("text", { class: "ex-label dim", x: tx + 34, y: ty - 12 }, "ONE OF 3,694 RADAR POINTS IN DRESDEN"));
  const dropTag = el("text", { class: "ex-label accent", x: tx + 34, y: ty + 40, opacity: 0 }, "DROPS 1 MM BETWEEN PASSES");
  field.appendChild(dropTag);
  // chirps and echoes live here
  const chirps = el("g", {}); field.appendChild(chirps);
  const look = el("line", { class: "ex-look", x1: 0, y1: 0, x2: tx, y2: ty, opacity: 0 }); field.appendChild(look);
  // satellite: isometric Sentinel-1, centred on its origin, about 170 wide; the
  // antenna underside sits near local y = 29, where the look vector starts.
  const sat = el("g", { class: "ex-sat", "data-w": SAT_W, "data-h": SAT_H });
  sat.innerHTML = SAT_MARKUP;
  field.appendChild(sat);
  const satTag = el("g", { class: "ex-sattag" });
  satTag.appendChild(el("text", { class: "ex-label", x: 0, y: 0 }, "SENTINEL-1"));
  satTag.appendChild(el("text", { class: "ex-label dim", x: 0, y: 16 }, "C-BAND · 5.405 GHZ · 693 KM · REVISIT 6 DAYS"));
  field.appendChild(satTag);
  svg.appendChild(field);
  // frame brackets of the scope field
  for (const [x, y, px, py] of [[24, 56, 1, 1], [844, 56, -1, 1], [24, 572, 1, -1], [844, 572, -1, -1]]) svg.appendChild(el("path", { class: "ex-bracket", d: `M${x + px * 14},${y} L${x},${y} L${x},${y + py * 14}` }));
  svg.appendChild(el("text", { class: "ex-label dim", x: 44, y: 556 }, "SYNTHETIC APERTURE RADAR · SIDE-LOOKING · 10 M PIXELS"));

  // ---- return-phase panel ----
  const P = el("g", { class: "ex-panel" });
  P.appendChild(el("rect", { x: 884, y: 24, width: 372, height: 548, class: "ex-panelbg" }));
  for (const [x, y, px, py] of [[884, 24, 1, 1], [1256, 24, -1, 1], [884, 572, 1, -1], [1256, 572, -1, -1]]) P.appendChild(el("path", { class: "ex-bracket", d: `M${x + px * 12},${y} L${x},${y} L${x},${y + py * 12}` }));
  P.appendChild(el("text", { class: "ex-label", x: 900, y: 52 }, "RETURN PHASE"));
  P.appendChild(el("line", { class: "ex-rule", x1: 900, y1: 62, x2: 1240, y2: 62 }));
  P.appendChild(el("text", { class: "ex-label dim", x: 900, y: 92 }, "ECHO · PASS 1 · DAY 0"));
  P.appendChild(el("text", { class: "ex-label dim", x: 900, y: 112, id: "exP2" }, "ECHO · PASS 2 · DAY +6"));
  // waveforms
  const wave = (phase) => { let d = ""; for (let i = 0; i <= 320; i += 2) { const x = 900 + i; const y = 210 + 38 * Math.sin((i / 320) * Math.PI * 6 + phase); d += (i ? "L" : "M") + x + "," + y.toFixed(1); } return d; };
  const w1 = el("path", { class: "ex-wave", d: wave(0), "clip-path": `url(#exWave-${rootId})` });
  const w2 = el("path", { class: "ex-wave accent", d: wave(0), "clip-path": `url(#exWave-${rootId})`, opacity: 0 });
  P.appendChild(el("line", { class: "ex-rule", x1: 900, y1: 210, x2: 1220, y2: 210 }));
  P.appendChild(w1); P.appendChild(w2);
  const shiftTag = el("text", { class: "ex-label accent", x: 1220, y: 150, "text-anchor": "end", opacity: 0 }, "SHIFT 13°");
  P.appendChild(shiftTag);
  // phase dial
  const cx = 960, cy = 370;
  P.appendChild(el("circle", { class: "ex-dial", cx, cy, r: 44 }));
  for (let a = 0; a < 360; a += 30) { const r0 = a % 90 ? 38 : 34; const rad = a * Math.PI / 180; P.appendChild(el("line", { class: "ex-tick", x1: cx + r0 * Math.cos(rad), y1: cy + r0 * Math.sin(rad), x2: cx + 44 * Math.cos(rad), y2: cy + 44 * Math.sin(rad) })); }
  const needle = el("line", { class: "ex-needle", x1: cx, y1: cy, x2: cx + 40, y2: cy });
  P.appendChild(needle); P.appendChild(el("circle", { class: "ex-dot", cx, cy, r: 2 }));
  P.appendChild(el("text", { class: "ex-label dim", x: 1030, y: 352 }, "PHASE"));
  const phaseVal = el("text", { class: "ex-value", x: 1030, y: 390 }, "0°"); P.appendChild(phaseVal);
  // readouts
  const ro = (y, k, v, id) => { P.appendChild(el("text", { class: "ex-label dim", x: 900, y }, k)); P.appendChild(el("text", { class: "ex-label", x: 1240, y, "text-anchor": "end", id }, v)); P.appendChild(el("line", { class: "ex-rule", x1: 900, y1: y + 10, x2: 1240, y2: y + 10 })); };
  ro(432, "WAVELENGTH", "5.55 CM");
  ro(462, "TWO-WAY PATH CHANGE", "0.0 MM", "exPath");
  ro(492, "GROUND MOTION", "0.0 MM", "exMotion");
  const big = el("text", { class: "ex-value big", x: 900, y: 546 }, "0.0 mm"); P.appendChild(big);
  P.appendChild(el("text", { class: "ex-label dim", x: 900, y: 564 }, "FROM 693 KM · EVERY SIX DAYS"));
  svg.appendChild(P);

  // ---- motion ----
  const satAt = (t) => { const x = 40 + t * 780; const y = 120 - 90 * 4 * t * (1 - t) * 0.5; return [x, y]; };
  let tl = null, sweepTl = null;
  const g = (id) => svg.querySelector("#" + id);
  function chirp(accent) {
    const [sx, sy] = satAt(s.t);
    const c = el("path", { class: "ex-chirp" + (accent ? " accent" : ""), d: "" });
    chirps.appendChild(c);
    const o = { r: 0 };
    gsap.to(o, { r: Math.hypot(tx - sx, ty - sy), duration: 0.9, ease: "none", onUpdate: () => { const a = Math.atan2(ty - sy, tx - sx); const d = []; for (let k = -0.35; k <= 0.35; k += 0.05) { const x = sx + o.r * Math.cos(a + k), y = sy + o.r * Math.sin(a + k); d.push((d.length ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1)); } c.setAttribute("d", d.join(" ")); }, onComplete: () => { gsap.to(c, { opacity: 0, duration: 0.3 }); const e = el("circle", { class: "ex-echo" + (accent ? " accent" : ""), cx: tx, cy: ty, r: 2 }); chirps.appendChild(e); gsap.to(e, { attr: { r: 90 }, opacity: 0, duration: 0.9, ease: "power1.out", onComplete: () => e.remove() }); } });
  }
  const s = { t: 0.08 };
  const moveSat = () => { const [x, y] = satAt(s.t); sat.setAttribute("transform", `translate(${x},${y})`); satTag.setAttribute("transform", `translate(${x > 520 ? x - 400 : x + 100},${y + 46})`); look.setAttribute("x1", x); look.setAttribute("y1", y + 30); };
  return {
    show(on) { root.classList.toggle("on", on); if (!on) { if (tl) tl.kill(); if (sweepTl) sweepTl.kill(); tl = null; } },
    play() {
      if (tl) tl.kill(); chirps.innerHTML = "";
      w2.setAttribute("opacity", 0); shiftTag.setAttribute("opacity", 0); dropTag.setAttribute("opacity", 0);
      needle.setAttribute("transform", `rotate(0 ${cx} ${cy})`); phaseVal.textContent = "0°"; big.textContent = "0.0 mm"; big.classList.remove("accent");
      g("exPath").textContent = "0.0 MM"; g("exMotion").textContent = "0.0 MM"; kerbTop.setAttribute("d", `M430,${gy - 14} L520,${gy - 14}`);
      sweepTl = gsap.fromTo(sweep, { attr: { x: -120 } }, { attr: { x: 860 }, duration: 5, ease: "none", repeat: -1 });
      tl = gsap.timeline();
      s.t = 0.08; moveSat();
      // pass 1
      tl.to(look, { opacity: 0.5, duration: 0.4 }, 0.2);
      tl.to(s, { t: 0.5, duration: 3.6, ease: "none", onUpdate: moveSat }, 0);
      for (let i = 0; i < 3; i++) tl.call(() => chirp(false), null, 0.8 + i * 0.9);
      tl.to(w1, { opacity: 1, duration: 0.6 }, 2.2);
      // between passes: the kerb drops
      tl.call(() => { dropTag.setAttribute("opacity", 1); }, null, 4.4);
      tl.to(kerbTop, { attr: { d: `M430,${gy - 4} L520,${gy - 4}` }, duration: 0.8, ease: "power2.inOut" }, 4.4);
      tl.to(ret, { attr: { transform: "translate(0,10)" }, duration: 0.8, ease: "power2.inOut" }, 4.4);
      // pass 2
      tl.to(s, { t: 0.92, duration: 3.6, ease: "none", onUpdate: moveSat }, 5.4);
      for (let i = 0; i < 3; i++) tl.call(() => chirp(true), null, 6.2 + i * 0.9);
      const o = { ph: 0, mm: 0 };
      tl.to(w2, { opacity: 1, duration: 0.4 }, 7.6);
      tl.to(o, { ph: 13, mm: 1.0, duration: 1.6, ease: "power2.out", onUpdate: () => {
        w2.setAttribute("d", wave(o.ph * Math.PI / 180 * 6)); // exaggerated ×6 so the shift is visible
        needle.setAttribute("transform", `rotate(${-o.ph} ${cx} ${cy})`); phaseVal.textContent = `${o.ph.toFixed(0)}°`;
        g("exPath").textContent = `${(o.mm * 2).toFixed(1)} MM`; g("exMotion").textContent = `${o.mm.toFixed(1)} MM`;
        big.textContent = `+${o.mm.toFixed(1)} mm`; } }, 7.8);
      tl.call(() => { shiftTag.setAttribute("opacity", 1); big.classList.add("accent"); }, null, 9.2);
      tl.to(look, { opacity: 0, duration: 0.6 }, 9.6);
      return tl;
    },
    // land the instrument at a moment inside the chapter: tweens land, calls between are skipped, the
    // satellite is placed; a second, event-enabled render lets active tweens push their readouts
    seek(local, paused) {
      if (!tl) this.play();
      tl.seek(Math.max(0, local), true); tl.seek(Math.max(0, local) + 1e-4, false); moveSat();
      if (local >= 4.4) dropTag.setAttribute("opacity", 1); else dropTag.setAttribute("opacity", 0);
      if (local >= 9.2) { shiftTag.setAttribute("opacity", 1); big.classList.add("accent"); } else { shiftTag.setAttribute("opacity", 0); big.classList.remove("accent"); }
      tl.paused(!!paused); if (sweepTl) sweepTl.paused(!!paused);
    },
    pause(on) { if (tl) tl.paused(!!on); if (sweepTl) sweepTl.paused(!!on); },
  };
}
