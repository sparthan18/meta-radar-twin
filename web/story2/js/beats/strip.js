// Scene 4, three years: the month wordmark, the headline card, and the history strip
// (19 monitored bridges × 33 months, one cell per decision), driven by the director's month index.
import { RISK_COLOR, monthWord, headline } from "./data.js";

const $ = id => document.getElementById(id);

export function createStrip(story) {
  const root = $("strip");
  const ids = Object.keys(story.names).filter(id => story.monitored[id]).sort((a, b) => story.names[a].localeCompare(story.names[b]));
  const subject = "4";
  // build the grid once
  root.innerHTML = "";
  const label = document.createElement("div"); label.className = "strip-labels";
  const grid = document.createElement("div"); grid.className = "strip-grid";
  grid.style.gridTemplateColumns = `repeat(${story.cutoffs.length}, 1fr)`;
  const cells = {};
  for (const id of ids) {
    const l = document.createElement("div"); l.className = "strip-label" + (id === subject ? " subject" : ""); l.textContent = story.names[id].toUpperCase(); label.appendChild(l);
    for (const c of story.cutoffs) {
      const d = document.createElement("div"); d.className = "cell"; d.dataset.risk = story.risk[c][id]; grid.appendChild(d); cells[id + "|" + c] = d;
    }
  }
  const head = document.createElement("div"); head.className = "strip-playhead";
  grid.appendChild(head);
  root.appendChild(label); root.appendChild(grid);
  // axis: year ticks
  const axis = document.createElement("div"); axis.className = "strip-axis";
  story.cutoffs.forEach((c, i) => { if (c.endsWith("-01-01") || i === 0) { const t = document.createElement("span"); t.style.left = `${(i / story.cutoffs.length) * 100}%`; t.textContent = c.slice(0, 4); axis.appendChild(t); } });
  root.appendChild(axis);

  let shown = -1;
  return {
    show(on) { root.classList.toggle("on", on); $("monthWord").classList.toggle("on", on); $("headline").classList.toggle("on", on); if (!on) shown = -1; },
    // reveal months up to index i (cells after i stay dark), move the playhead, set the wordmark and the headline
    setMonth(i) {
      if (i === shown) return; shown = i;
      const c = story.cutoffs[i];
      for (const id of ids) for (let j = 0; j < story.cutoffs.length; j++) {
        const d = cells[id + "|" + story.cutoffs[j]];
        d.style.background = j <= i ? RISK_COLOR[d.dataset.risk] : "";
        d.style.opacity = j <= i ? (d.dataset.risk === "none" ? 0.28 : 1) : 0.08;
      }
      head.style.left = `${((i + 1) / story.cutoffs.length) * 100}%`;
      const mw = monthWord(c);
      $("monthWord").innerHTML = `<span class="mw-month">${mw.month.toUpperCase()}</span><span class="mw-year">${mw.year}</span>`;
      const h = headline(story, c);
      const n = story.counts[c];
      $("headline").innerHTML = `<div class="hl-line ${h.cls}">${h.text}</div><div class="hl-sub">${n.high} HIGH · ${n.elevated} ELEVATED · ${n.watch} WATCH · 19 MONITORED</div>`;
      $("fxCutoff").textContent = c;
    },
  };
}
