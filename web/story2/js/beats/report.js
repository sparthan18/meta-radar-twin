// Scene 7, the report: the real Muse Spark audit memo in a glass side panel (verdict typed in,
// action list as hairline rows, the model-versus-rubric count), and the evidence card: the
// Sentinel-2 chip with the SAM 3.1 polygon projected into its frame.
import { parseMemo, RISK_COLOR } from "./data.js";

const $ = id => document.getElementById(id);

export function createReport(story) {
  const panel = $("report"), card = $("evidence");
  const cutoff = "2024-09-01";
  const memo = parseMemo(story.memos[cutoff] || "");
  // panel skeleton
  panel.innerHTML = `
    <div class="pt">INSPECTION MEMO — ${cutoff}<span class="by">MUSE SPARK 1.3 · AUDIT AGENT</span></div>
    <div class="ps">VERDICT</div>
    <div class="verdict" id="memoVerdict"></div>
    <div class="ps">ACTION LIST</div>
    <div class="rows" id="memoRows"></div>
    <div class="ps">WATCH LIST · ${memo.watch.length} BRIDGES</div>
    <div class="watch">${memo.watch.map(w => w.split(" — ")[0]).join(" · ")}</div>
    <div class="foot">${memo.disagreements} MODEL-VERSUS-CHECKLIST DISAGREEMENTS, ALL AT WATCH OR BELOW · EVERY NUMBER TRACES TO A LOGGED TOOL CALL</div>`;
  const rows = $("memoRows");
  for (const a of memo.actions) {
    const r = document.createElement("div"); r.className = "row";
    r.innerHTML = `<div class="name">${a.bridge}</div><div class="worry" style="color:${RISK_COLOR[a.risk] || RISK_COLOR.none}">${a.risk === "high" ? "SEND AN INSPECTOR" : a.risk.toUpperCase()}</div><div class="why">${a.why}</div><div class="todo">${a.todo}</div>`;
    rows.appendChild(r);
  }
  // evidence card: chip + SAM polygon in chip frame
  const feat = story.sam.features.find(f => f.properties.bridge === "Carolabrücke") || story.sam.features[0];
  const corners = story.chip.coordinates; // tl, tr, br, bl in lon/lat
  const W = story.chip.width, H = story.chip.height;
  const toChip = ([lon, lat]) => {
    // bilinear inverse on the (near-rectangular) frame: u along top edge, v down the left edge
    const [tl, tr, br, bl] = corners;
    const u = ((lon - tl[0]) * (tr[0] - tl[0]) + (lat - tl[1]) * (tr[1] - tl[1])) / ((tr[0] - tl[0]) ** 2 + (tr[1] - tl[1]) ** 2);
    const v = ((lon - tl[0]) * (bl[0] - tl[0]) + (lat - tl[1]) * (bl[1] - tl[1])) / ((bl[0] - tl[0]) ** 2 + (bl[1] - tl[1]) ** 2);
    return [u * W, v * H];
  };
  const ring = feat.geometry.coordinates[0].map(toChip);
  const d = ring.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ") + " Z";
  card.innerHTML = `
    <div class="pt">EVIDENCE — SENTINEL-2 · 10 M</div>
    <div class="chip"><img src="../data/s2_visual.png" alt=""><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path id="samPath" d="${d}"/></svg></div>
    <div class="foot">SAM 3.1 · BOX PROMPT ON THE OSM FOOTPRINT · SCORE ${feat.properties.score.toFixed(2)} · IOU ${feat.properties.iou.toFixed(2)}</div>`;
  const verdictEl = $("memoVerdict");
  let typing = null;
  return {
    show(on) { panel.classList.toggle("on", on); if (!on) { card.classList.remove("on"); verdictEl.textContent = ""; rows.classList.remove("on"); if (typing) typing.kill(); } },
    type(seconds) {
      const text = memo.verdict; const o = { n: 0 };
      verdictEl.textContent = "";
      typing = gsap.to(o, { n: text.length, duration: seconds, ease: "none", onUpdate: () => { verdictEl.textContent = text.slice(0, Math.floor(o.n)); } });
    },
    rows() { rows.classList.add("on"); },
    evidence(on) { card.classList.toggle("on", on); if (on) { const p = card.querySelector("#samPath"); const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; gsap.to(p.style, { strokeDashoffset: 0, duration: 0.9, ease: "power2.out" }); } },
    memo,
  };
}
