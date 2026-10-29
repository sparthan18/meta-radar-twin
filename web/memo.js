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

if (typeof module !== "undefined") module.exports = { renderMemo };
