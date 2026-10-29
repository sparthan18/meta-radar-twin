"use strict";
// Phase 5d: fixture-driven test for web/memo.js. Run with:
//   node tests/test_memo_render.js
const { renderMemo } = require("../web/memo.js");

const FIXTURE = [
  "# Audit memo \u2014 2024-09-01",
  "",
  "## Verdict",
  "",
  "Carolabr\u00fccke needs action with **bold** text and *italic* text.",
  "",
  "### Evidence",
  "",
  "- first item \u2014 with dash",
  "- second item with **bold**",
  "",
  "1. step one",
  "2. step two with *italic*",
  "",
  "| bridge | risk | why |",
  "|---|---|---|",
  "| Carolabr\u00fccke | high | uneven movement |",
  "| Albertbr\u00fccke | watch | stable motion |",
  "",
  "A line with <script>alert(1)</script> renders as text.",
  ""
].join("\n");

const EXPECTED = [
  "<h1>Audit memo \u2014 2024-09-01</h1>",
  "<h2>Verdict</h2>",
  "<p>Carolabr\u00fccke needs action with <strong>bold</strong> text and <em>italic</em> text.</p>",
  "<h3>Evidence</h3>",
  "<ul>",
  "<li>first item \u2014 with dash</li>",
  "<li>second item with <strong>bold</strong></li>",
  "</ul>",
  "<ol>",
  "<li>step one</li>",
  "<li>step two with <em>italic</em></li>",
  "</ol>",
  "<table>",
  "<thead>",
  "<tr><th>bridge</th><th>risk</th><th>why</th></tr>",
  "</thead>",
  "<tbody>",
  "<tr><td>Carolabr\u00fccke</td><td>high</td><td>uneven movement</td></tr>",
  "<tr><td>Albertbr\u00fccke</td><td>watch</td><td>stable motion</td></tr>",
  "</tbody>",
  "</table>",
  "<p>A line with &lt;script&gt;alert(1)&lt;/script&gt; renders as text.</p>",
  ""
].join("\n");

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}`);
  }
}

const out = renderMemo(FIXTURE);

// Every construct the memo format uses, plus the escaping case.
check("H1", out.includes("<h1>Audit memo"));
check("H2", out.includes("<h2>Verdict</h2>"));
check("H3", out.includes("<h3>Evidence</h3>"));
check("paragraph", out.includes("<p>Carolabr\u00fccke needs action"));
check("bullet list", out.includes("<ul>") && out.includes("<li>first item"));
check("numbered list", out.includes("<ol>") && out.includes("<li>step one</li>"));
check("table header", out.includes("<th>bridge</th>"));
check("table body", out.includes("<td>Albertbr\u00fccke</td>"));
check("bold", out.includes("<strong>bold</strong>"));
check("italic", out.includes("<em>italic</em>"));
check("script tag escaped", out.includes("&lt;script&gt;") && !out.includes("<script>"));
check("exact output", out === EXPECTED);
if (out !== EXPECTED) {
  console.log("--- expected ---");
  console.log(JSON.stringify(EXPECTED));
  console.log("--- got ---");
  console.log(JSON.stringify(out));
}

// Negative control: the exact-output check must fail on a planted bad
// render, proving the test can catch a regression.
const plantedBad = EXPECTED.replace("<h1>", "<h2>").replace("</h1>", "</h2>");
let caught = false;
try {
  if (plantedBad !== EXPECTED) throw new Error("output differs from expected");
} catch {
  caught = true;
}
check("planted bad render is caught", caught && renderMemo(FIXTURE) !== plantedBad);

if (failures) {
  console.log(`test_memo_render: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_memo_render: PASS");
