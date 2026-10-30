"use strict";
// renderMemo: dependency-free renderer covering exactly what the audit-memo
// format uses: H1/H2/H3, paragraphs, bullet and numbered lists, pipe tables
// with a header row, **bold** and *italic*. Pure function: string in,
// HTML string out. Source text is HTML-escaped first, so memo markup such
// as <script> renders as text.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function inlineMemo(s) {
  let h = escapeHtml(s);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  return h;
}

function splitRow(line) {
  const cells = line.trim().split("|");
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function isSeparatorRow(line) {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function renderMemo(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  let html = "";
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    const hm = /^(#{1,3})\s+(.*)$/.exec(line);
    if (hm) {
      const level = hm[1].length;
      html += `<h${level}>${inlineMemo(hm[2].trim())}</h${level}>\n`;
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      html += "<ul>\n";
      while (i < n && /^\s*[-*]\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*[-*]\s+/, "");
        html += `<li>${inlineMemo(text.trim())}</li>\n`;
        i++;
      }
      html += "</ul>\n";
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      html += "<ol>\n";
      while (i < n && /^\s*\d+\.\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*\d+\.\s+/, "");
        html += `<li>${inlineMemo(text.trim())}</li>\n`;
        i++;
      }
      html += "</ol>\n";
      continue;
    }
    if (line.indexOf("|") !== -1) {
      const rows = [];
      while (i < n && lines[i].indexOf("|") !== -1 && !/^\s*$/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      const head = splitRow(rows[0]);
      const body = (rows.length > 1 && isSeparatorRow(rows[1]))
        ? rows.slice(2) : rows.slice(1);
      html += "<table>\n<thead>\n<tr>";
      for (const c of head) html += `<th>${inlineMemo(c)}</th>`;
      html += "</tr>\n</thead>\n<tbody>\n";
      for (const r of body) {
        html += "<tr>";
        for (const c of splitRow(r)) html += `<td>${inlineMemo(c)}</td>`;
        html += "</tr>\n";
      }
      html += "</tbody>\n</table>\n";
      continue;
    }
    const para = [];
    while (i < n && !/^\s*$/.test(lines[i])
        && !/^(#{1,3})\s+/.test(lines[i])
        && !/^\s*[-*]\s+/.test(lines[i])
        && !/^\s*\d+\.\s+/.test(lines[i])
        && lines[i].indexOf("|") === -1) {
      para.push(lines[i].trim());
      i++;
    }
    html += `<p>${inlineMemo(para.join("\n"))}</p>\n`;
  }
  return html;
}

// Phase 8c-2 memo panel (spec section 5): the Action list table renders
// as hairline-separated rows, not a bordered grid. Each row carries the
// bridge name (display), the worry phrase (display, coloured by class),
// the reason (mono dim) and what to do (reading). The markdown itself is
// unchanged; the story panel replaces its rendered <table> with this.
function memoWorryPhrase(risk) {
  const r = String(risk || "").trim().toLowerCase();
  if (r === "high") return "send an inspector";
  if (r === "elevated") return "look closer";
  if (r === "watch") return "keep watching";
  if (r === "none") return "fine";
  return String(risk || "").trim() || "not monitored";
}

function memoRiskClass(risk) {
  const r = String(risk || "").trim().toLowerCase();
  if (r === "high" || r === "elevated" || r === "watch" || r === "none") return r;
  return "unknown";
}

// Parse the Action list pipe table into [{bridge, risk, why, action}].
// Finds the first pipe-table block after the "Action list" heading;
// falls back to the first pipe-table block in the file.
function parseActionRows(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,3}\s+Action list\s*$/i.test(lines[i].trim())) {
      start = i + 1;
      break;
    }
  }
  const scanFrom = (from) => {
    for (let i = from; i < lines.length; i++) {
      if (lines[i].indexOf("|") === -1 || /^\s*$/.test(lines[i])) continue;
      const rows = [];
      let j = i;
      while (j < lines.length && lines[j].indexOf("|") !== -1 &&
          !/^\s*$/.test(lines[j])) {
        rows.push(lines[j]);
        j++;
      }
      if (rows.length >= 1) return rows;
    }
    return null;
  };
  let block = start === -1 ? null : scanFrom(start);
  if (!block) block = scanFrom(0);
  if (!block) return [];
  const body = (block.length > 1 && isSeparatorRow(block[1]))
    ? block.slice(2) : block.slice(1);
  const out = [];
  for (const r of body) {
    const cells = splitRow(r);
    if (!cells.length) continue;
    out.push({
      bridge: cells[0] || "",
      risk: cells[1] || "",
      why: cells[2] || "",
      action: cells[3] || ""
    });
  }
  return out;
}

function renderActionRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let html = '<div class="memo-actions">\n';
  for (const r of list) {
    const bridge = (r && r.bridge) || "";
    const risk = (r && r.risk) || "";
    const why = (r && r.why) || "";
    const action = (r && r.action) || "";
    const cls = memoRiskClass(risk);
    const worry = memoWorryPhrase(risk);
    html += '<div class="memo-action">\n' +
      `<div class="memo-action-name">${inlineMemo(String(bridge))}</div>\n` +
      `<div class="memo-action-worry risk-${cls}">${escapeHtml(worry)}</div>\n` +
      `<div class="memo-action-reason">${inlineMemo(String(why))}</div>\n` +
      `<div class="memo-action-do">${inlineMemo(String(action))}</div>\n` +
      "</div>\n";
  }
  html += "</div>\n";
  return html;
}

if (typeof module !== "undefined") module.exports = { renderMemo, memoWorryPhrase, memoRiskClass, parseActionRows, renderActionRows };
