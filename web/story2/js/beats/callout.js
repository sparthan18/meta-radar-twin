// Map callouts, staged like motion graphics. Each callout is a persistent SVG group whose
// anchor follows the live map projection every frame; its entrance is a GSAP sequence:
// target lock (reticle snaps in from large, brackets converge) → leader draws on → plate wipes
// open from the leader end → lines stagger in, with optional rolling counters → exit retracts
// everything in reverse, fast. `set(list, { instant })` lays out with no animation (seeks).
const NS = "http://www.w3.org/2000/svg";
const el = (t, a, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt !== undefined) e.textContent = txt; return e; };
const EASE = "power3.out";

export function createCallouts(wide, svg) {
  let items = [];
  let raf = null;

  function buildBare(it) {
    const g = el("g", { class: `co bare ${it.dim ? "dim" : ""}` });
    const t = el("text", { class: `co-text ${it.cls || ""}`, x: it.dx ?? 0, y: it.dy ?? 0, "text-anchor": it.anchor || "middle", opacity: 0 }, it.text);
    g.appendChild(t); svg.appendChild(g);
    it._n = { g, t, bare: true }; it._s = {};
    return it;
  }
  function build(it) {
    if (it.bare) return buildBare(it);
    const cls = it.accent ? "accent" : it.dim ? "dim" : "";
    const g = el("g", { class: `co ${cls}` });
    const anchor = el("g", { class: "co-anchor" });
    if (it.pulse) { anchor.appendChild(el("circle", { class: `co-pulse ${cls}`, r: 10 })); anchor.appendChild(el("circle", { class: `co-pulse ${cls} two`, r: 10 })); }
    anchor.appendChild(el("circle", { class: `co-ring ${cls}`, r: 7 }));
    anchor.appendChild(el("circle", { class: `co-dot ${cls}`, r: 1.6 }));
    const lock = el("g", { class: "co-lock" });
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lock.appendChild(el("path", { class: `co-bracket ${cls}`, d: `M${sx * 14 - sx * 6},${sy * 14} L${sx * 14},${sy * 14} L${sx * 14},${sy * 14 - sy * 6}` }));
    anchor.appendChild(lock);
    g.appendChild(anchor);
    const leader = el("path", { class: `co-leader ${cls}` });
    const leadDot = el("circle", { class: `co-dot ${cls}`, r: 1.6 });
    g.appendChild(leader); g.appendChild(leadDot);
    const block = el("g", { class: "co-blockg" });
    const clipId = `coclip${Math.random().toString(36).slice(2, 8)}`;
    const clip = el("clipPath", { id: clipId }); const clipRect = el("rect", { x: 0, y: 0, width: 0, height: 0 }); clip.appendChild(clipRect);
    block.appendChild(clip);
    const plate = el("rect", { class: "co-plate", "clip-path": `url(#${clipId})` });
    block.appendChild(plate);
    const rule = el("line", { class: "co-rule" });
    block.appendChild(rule);
    const texts = it.lines.map(ln => { const t = el("text", { class: `co-text ${ln.cls || ""}`, opacity: 0 }, ln.counter ? "" : ln.text); block.appendChild(t); return { ln, t }; });
    const brackets = [0, 1, 2, 3].map(() => { const b = el("path", { class: `co-bracket ${cls}`, opacity: 0 }); block.appendChild(b); return b; });
    g.appendChild(block);
    svg.appendChild(g);
    it._n = { g, anchor, lock, leader, leadDot, block, plate, clipRect, rule, texts, brackets, dx: it.dx ?? 90, dy: it.dy ?? -70 };
    it._s = { lockScale: 3, lockOp: 0, leadT: 0, wipe: 0 };
    layoutBlock(it);
    return it;
  }

  function layoutBlock(it) {
    const n = it._n, dx = n.dx, dy = n.dy;
    const anchorX = dx >= 0 ? "start" : "end";
    const bxx = Math.sign(dx) * 46;
    let yy = dy - 10;
    for (const { ln, t } of n.texts) { t.setAttribute("x", dx + bxx); t.setAttribute("y", yy); t.setAttribute("text-anchor", anchorX); if (ln.counter) t.textContent = ln.text; yy += ln.cls === "big" ? 30 : 20; }
    for (const { t } of n.texts) t.setAttribute("opacity", 1);
    let bb = null;
    for (const { t } of n.texts) { const b = t.getBBox(); if (!bb) bb = { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height }; else { bb.x = Math.min(bb.x, b.x); bb.y = Math.min(bb.y, b.y); bb.r = Math.max(bb.r, b.x + b.width); bb.b = Math.max(bb.b, b.y + b.height); } }
    bb = bb ? { x: bb.x, y: bb.y, width: bb.r - bb.x, height: bb.b - bb.y } : { x: 0, y: 0, width: 0, height: 0 };
    for (const { ln, t } of n.texts) { t.setAttribute("opacity", 0); if (ln.counter) t.textContent = ""; }
    const pad = 14, L = 10;
    const x0 = bb.x - pad, x1 = bb.x + bb.width + pad, y0 = bb.y - pad, y1 = bb.y + bb.height + pad;
    n.plate.setAttribute("x", x0); n.plate.setAttribute("y", y0); n.plate.setAttribute("width", x1 - x0); n.plate.setAttribute("height", y1 - y0);
    n.clipRect.setAttribute("y", y0); n.clipRect.setAttribute("height", y1 - y0);
    n.rule.setAttribute("x1", bb.x); n.rule.setAttribute("x2", bb.x + bb.width); n.rule.setAttribute("y1", bb.y + 18); n.rule.setAttribute("y2", bb.y + 18);
    const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]];
    n.brackets.forEach((b, i) => { const [sx, sy, px, py] = corners[i]; b.setAttribute("d", `M${sx + px * L},${sy} L${sx},${sy} L${sx},${sy + py * L}`); });
    n.box = { x0, x1, y0, y1, w: x1 - x0 };
  }

  function apply(it) {
    const n = it._n, s = it._s;
    const [x, y] = wide.project(it.lnglat);
    n.g.setAttribute("transform", `translate(${x},${y})`);
    if (n.bare) return;
    n.anchor.setAttribute("opacity", s.lockOp);
    n.lock.setAttribute("transform", `scale(${s.lockScale})`);
    const dx = n.dx, dy = n.dy;
    const sx = Math.sign(dx), p0 = [sx * 9, -9 * Math.sign(-dy)], p1 = [dx, dy], p2 = [dx + sx * 26, dy];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 26;
    n.leader.setAttribute("d", `M${p0[0]},${p0[1]} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`);
    n.leader.style.strokeDasharray = len; n.leader.style.strokeDashoffset = len * (1 - s.leadT);
    n.leadDot.setAttribute("cx", p2[0]); n.leadDot.setAttribute("cy", p2[1]); n.leadDot.setAttribute("opacity", s.leadT >= 0.99 ? 1 : 0);
    const b = n.box; if (b) { const w = b.w * s.wipe; n.clipRect.setAttribute("x", sx >= 0 ? b.x0 : b.x1 - w); n.clipRect.setAttribute("width", w); }
    n.rule.setAttribute("opacity", s.wipe >= 0.95 ? 1 : 0);
    n.brackets.forEach(bk => bk.setAttribute("opacity", s.wipe >= 0.95 ? 1 : 0));
  }

  function frame() { for (const it of items) apply(it); raf = requestAnimationFrame(frame); }

  function enterTl(it, instant) {
    const s = it._s, n = it._n;
    const tl = gsap.timeline();
    if (n.bare) { if (instant) n.t.setAttribute("opacity", 1); else tl.fromTo(n.t, { opacity: 0, attr: { dy: 6 } }, { opacity: 1, attr: { dy: 0 }, duration: 0.5, ease: EASE }, it.delay || 0); return tl; }
    if (instant) { s.lockOp = 1; s.lockScale = 1; s.leadT = 1; s.wipe = 1; n.texts.forEach(({ ln, t }) => { t.setAttribute("opacity", 1); if (ln.counter) t.textContent = ln.text; }); return tl; }
    tl.set(s, { lockOp: 1 }, 0);
    tl.to(s, { lockScale: 1, duration: 0.5, ease: EASE }, 0);
    tl.to(s, { leadT: 1, duration: 0.35, ease: "power2.inOut" }, 0.45);
    tl.to(s, { wipe: 1, duration: 0.38, ease: "power2.out" }, 0.8);
    n.texts.forEach(({ ln, t }, i) => {
      const at = 1.0 + i * 0.12;
      tl.fromTo(t, { opacity: 0, attr: { dx: Math.sign(n.dx) * -8 } }, { opacity: 1, attr: { dx: 0 }, duration: 0.3, ease: EASE }, at);
      if (ln.counter) { const o = { v: ln.counter.from }; tl.to(o, { v: ln.counter.to, duration: ln.counter.duration ?? 0.9, ease: "power2.out", onUpdate: () => { t.textContent = ln.counter.fmt(o.v); }, onComplete: () => { t.textContent = ln.text; } }, at + 0.1); }
    });
    return tl;
  }
  function exitTl(it) {
    const s = it._s, n = it._n;
    const tl = gsap.timeline();
    if (n.bare) { tl.to(n.t, { opacity: 0, duration: 0.35 }, 0); return tl; }
    n.texts.forEach(({ t }, i) => tl.to(t, { opacity: 0, duration: 0.15 }, i * 0.03));
    tl.to(s, { wipe: 0, duration: 0.25, ease: "power2.in" }, 0.1);
    tl.to(s, { leadT: 0, duration: 0.2, ease: "power2.in" }, 0.3);
    tl.to(s, { lockScale: 3, lockOp: 0, duration: 0.3, ease: "power2.in" }, 0.4);
    return tl;
  }

  const api = {
    set(list, { instant = false } = {}) {
      api.clear();
      svg.style.display = "block"; // must be displayed before build(): getBBox() measures nothing in a display:none tree
      items = list.map(build);
      for (const it of items) { apply(it); it._tl = enterTl(it, instant); }
      svg.style.display = "block"; if (!raf) frame();
    },
    exit() { const tls = items.map(exitTl); return gsap.timeline({ onComplete: () => api.clear() }).add(tls, 0); },
    clear() { for (const it of items) { if (it._tl) it._tl.kill(); it._n.g.remove(); } items = []; },
    items() { return items; },
    show(on) { if (on) { svg.style.display = "block"; if (!raf) frame(); } else { api.clear(); if (raf) { cancelAnimationFrame(raf); raf = null; } svg.style.display = "none"; } },
  };
  return api;
}
