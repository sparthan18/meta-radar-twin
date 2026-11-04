// Scanner layer: SVG drawn over the 3D canvas from projected world points.
import * as THREE from "three";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, text) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
};

function project(v, camera, w, h) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, behind: p.z > 1 };
}

const fmtV = (v) => (v === null || v === undefined) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} mm/yr`;

export function clearHud() {
  const svg = document.getElementById("hud");
  if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
}

export function drawHud({ camera, deck, width: w, height: h }) {
  const svg = document.getElementById("hud");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const hot = deck.boxes.find(b => b.hot) || deck.boxes[0];
  const P = project(hot.center.clone().add(new THREE.Vector3(0, 1.5, 0)), camera, w, h);

  // the chain of span readings along the deck: tiny dots + hairline + small labels
  const pts = deck.boxes.map(b => ({ b, p: project(b.center.clone().add(new THREE.Vector3(0, 1.2, 0)), camera, w, h) }));
  for (let i = 1; i < pts.length; i++) {
    svg.appendChild(el("line", { class: "hair", x1: pts[i - 1].p.x, y1: pts[i - 1].p.y, x2: pts[i].p.x, y2: pts[i].p.y }));
  }
  const lx = P.x + 150, ly = P.y + 44, ex = lx + 40;
  const bx = ex + 10, by = ly - 30;
  const inBlock = (p) => p.x > bx - 30 && p.x < bx + 280 && p.y > by - 24 && p.y < by + 100;
  for (const { b, p } of pts) {
    if (b.hot) continue;
    if (inBlock(p) || inBlock({ x: p.x + 110, y: p.y - 6 }) || Math.hypot(p.x - P.x, p.y - P.y) < 48) continue; // label would collide with the block or the reticle
    svg.appendChild(el("circle", { class: "dot", cx: p.x, cy: p.y, r: 1.6, opacity: 0.8 }));
    svg.appendChild(el("text", { class: "spanlabel", x: p.x + 7, y: p.y - 6 }, `S${String(b.span + 1).padStart(2, "0")} ${fmtV(b.value)}`));
  }

  // reticle on the worst span
  svg.appendChild(el("circle", { class: "ring accent dash", cx: P.x, cy: P.y, r: 17 }));
  svg.appendChild(el("circle", { class: "ring", cx: P.x, cy: P.y, r: 30, opacity: 0.55 }));
  svg.appendChild(el("circle", { class: "dot", cx: P.x, cy: P.y, r: 2 }));
  // corner brackets around the ring
  const B = 40, L = 10;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of corners) {
    const x = P.x + sx * B, y = P.y + sy * B;
    svg.appendChild(el("path", { class: "bracket", d: `M${x - sx * L},${y} L${x},${y} L${x},${y - sy * L}` }));
  }
  // leader: 45° up-right, then flat
  svg.appendChild(el("path", { class: "leader", d: `M${P.x + 26},${P.y + 26} L${lx},${ly} L${ex},${ly}` }));
  svg.appendChild(el("circle", { class: "dot", cx: ex, cy: ly, r: 2 }));

  // data block
  const g = el("g", {});
  const row = (dy, cls, txt) => g.appendChild(el("text", { class: cls, x: bx, y: by + dy }, txt));
  row(0, "label dim", "CAROLABRÜCKE · SPAN " + String(hot.span + 1).padStart(2, "0"));
  row(30, "value accent", fmtV(hot.value));
  row(52, "label dim", "RANK 01 / 19  ·  Z 4.43  ·  33 EPOCHS");
  row(68, "label dim", "WORST IN ITS OWN RECORD · ONE END RISING");
  row(92, "worry", "SEND AN INSPECTOR");
  // hairline under the block title
  g.appendChild(el("line", { class: "hair", x1: bx, y1: by + 6, x2: bx + 232, y2: by + 6 }));
  // ticks at the block's left edge
  for (let i = 0; i < 5; i++) g.appendChild(el("line", { class: "tick", x1: bx - 8, y1: by - 10 + i * 24, x2: bx - 4, y2: by - 10 + i * 24 }));
  svg.appendChild(g);

  // deck-end ticks with the deck length
  const e1 = project(deck.world(deck.minA, 0, 12.5), camera, w, h), e2 = project(deck.world(deck.maxA, 0, 12.5), camera, w, h);
  svg.appendChild(el("line", { class: "hair", x1: e1.x, y1: e1.y - 14, x2: e1.x, y2: e1.y - 6 }));
  svg.appendChild(el("line", { class: "hair", x1: e2.x, y1: e2.y - 14, x2: e2.x, y2: e2.y - 6 }));
  svg.appendChild(el("text", { class: "spanlabel", x: (e1.x + e2.x) / 2, y: Math.min(e1.y, e2.y) - 18, "text-anchor": "middle" }, `${Math.round(deck.lenM)} M · ${deck.boxes.length} SPANS · DECK +12 M`));
}
