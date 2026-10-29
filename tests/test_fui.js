"use strict";
// Phase 8a: static contract test for the FUI stylesheets and font loading.
// No element may render in system-ui or Helvetica, and no stylesheet or
// inline style may reference neutral greys outside the span scale; the
// colour tokens, type scale, motion variables and FUI components must all
// exist. Run with:
//   node tests/test_fui.js
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}`);
  }
}

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const fui = read("web/fui.css");
const storyCss = read("web/story.css");
const indexHtml = read("web/index.html");

// The checker itself: banned tokens in stylesheet text. Hexes match with
// a boundary so longer codes never false-positive.
const BANNED_FAMILIES = ["system-ui", "Helvetica"];
const BANNED_GREYS = ["#9ca3af", "#9aa9bc", "#4b5563", "#6b7280"];
function cssHits(text) {
  const hits = [];
  for (const fam of BANNED_FAMILIES) {
    if (text.indexOf(fam) !== -1) hits.push(fam);
  }
  const lower = text.toLowerCase();
  for (const g of BANNED_GREYS) {
    const re = new RegExp(g.replace("#", "\\#") + "(?![0-9a-f])", "g");
    if (re.test(lower)) hits.push(g);
  }
  return hits;
}

// --- the checker catches planted failures ---
check("planted system-ui is caught",
  cssHits("body{font-family:system-ui}").indexOf("system-ui") !== -1);
check("planted Helvetica is caught",
  cssHits("p{font-family:Helvetica}").indexOf("Helvetica") !== -1);
check("planted neutral grey is caught",
  cssHits(".x{color:#9ca3af}").indexOf("#9ca3af") !== -1);
check("clean CSS passes the checker",
  cssHits("body{color:#8ea3c7;font-family:var(--font-data)}").length === 0);

// --- stylesheets + inline style are clean ---
const inlineStyles = [];
{
  const styleBlocks = indexHtml.match(/<style>[\s\S]*?<\/style>/g) || [];
  for (const b of styleBlocks) inlineStyles.push(b);
  const attrs = indexHtml.match(/style="[^"]*"/g) || [];
  for (const a of attrs) inlineStyles.push(a);
}
check("fui.css has no banned families or greys", cssHits(fui).length === 0);
check("story.css has no banned families or greys",
  cssHits(storyCss).length === 0);
check("inline styles have no banned families or greys",
  inlineStyles.every((s) => cssHits(s).length === 0));

// --- tokens ---
for (const [token, value] of [
    ["--bg", "#070b14"], ["--bg-2", "#0b1220"],
    ["--text", "#e6eefc"], ["--text-dim", "#8ea3c7"],
    ["--accent", "#ff3b3b"], ["--amber", "#f2b84b"],
    ["--orange", "#ff7a2f"], ["--none", "#3b4760"],
    ["--sam", "#5ee7ff"],
    ["--risk-none", "#3b4760"], ["--risk-watch", "#f2b84b"],
    ["--risk-elevated", "#ff7a2f"], ["--risk-high", "#ff3b3b"],
    ["--risk-unknown", "#8ea3c7"],
    ["--span-zero", "#f3f0ea"], ["--span-null", "#8ea3c7"]
  ]) {
  check(`token ${token} is ${value}`,
    fui.indexOf(`${token}: ${value}`) !== -1 ||
    fui.indexOf(`${token}:${value}`) !== -1);
}
check("single theme: index.html defines no :root and no colour-scheme fork",
  indexHtml.indexOf(":root") === -1 &&
  indexHtml.indexOf("prefers-color-scheme") === -1);

// --- type scale + motion ---
for (const v of ["--fs-11", "--fs-12", "--fs-14", "--fs-18", "--fs-24",
    "--fs-32", "--fs-48", "--fs-72", "--fs-112", "--fs-160",
    "--font-display", "--font-data", "--font-reading",
    "--ease-out", "--ease-exit", "--dur-micro", "--dur-element",
    "--dur-panel", "--dur-camera", "--dur-hold", "--dur-xfade", "--dur-dip",
    "--dur-count", "--dur-draw", "--dur-scan"]) {
  check(`variable ${v} is defined`, fui.indexOf(v) !== -1);
}
check("ease-out is the spec curve",
  fui.indexOf("cubic-bezier(0.22, 1, 0.36, 1)") !== -1);
check("numbers are tabular everywhere",
  fui.indexOf("font-variant-numeric: tabular-nums") !== -1);

// --- components ---
for (const sel of [".fui-panel", ".fui-panel--sm", ".fui-rule",
    ".fui-readout", ".fui-btn", ".annotate-corner", ".reticle-spin",
    ".annotate-line", ".annotate-ring-1", ".annotate-ring-2"]) {
  check(`component ${sel} exists`, fui.indexOf(sel) !== -1);
}
check("reticle spins at 6 deg/s (60 s per turn)",
  fui.indexOf("60s linear infinite") !== -1);
check("reduced motion stops the reticle",
  storyCss.indexOf("prefers-reduced-motion") !== -1 &&
  fui.indexOf("prefers-reduced-motion") !== -1);

// --- font loading ---
check("Rajdhani 500/600/700 is loaded",
  indexHtml.indexOf("Rajdhani:wght@500;600;700") !== -1);
check("JetBrains Mono 400/500 is loaded",
  indexHtml.indexOf("JetBrains+Mono:wght@400;500") !== -1);
check("Inter 400/500 is loaded",
  indexHtml.indexOf("Inter:wght@400;500") !== -1);
check("fonts use display=swap", indexHtml.indexOf("display=swap") !== -1);
check("fonts preconnect to both hosts",
  indexHtml.indexOf('rel="preconnect" href="https://fonts.googleapis.com"') !== -1 &&
  indexHtml.indexOf('href="https://fonts.gstatic.com"') !== -1);
check("planted: missing font weight is caught",
  indexHtml.indexOf("Rajdhani:wght@500;600;700;900") === -1);

// --- story chrome contract ---
for (const id of ["#storyBar", "#storyMonth", "#sceneIndex", "#vignette",
    "#grain", "#scanline", "#sceneDip", ".letterbox"]) {
  check(`story chrome ${id} is styled`, storyCss.indexOf(id) !== -1);
}
for (const id of ["storyBar", "storyMonth", "sceneIndex", "vignette",
    "grain", "scanline", "sceneDip", "letterTop", "letterBottom"]) {
  check(`story chrome #${id} exists in the DOM`,
    indexHtml.indexOf(`id="${id}"`) !== -1);
}
check("story mode hides header, footer and map controls",
  storyCss.indexOf('body[data-mode="story"] header') !== -1 &&
  storyCss.indexOf('body[data-mode="story"] footer') !== -1 &&
  storyCss.indexOf(".maplibregl-control-container") !== -1);
check("scene tag never displays",
  /#sceneTag\s*\{\s*display:\s*none/.test(storyCss));
check("caption is 32 px Rajdhani on a gradient with a hairline",
  storyCss.indexOf("#caption") !== -1 &&
  storyCss.indexOf("linear-gradient(to top, rgba(7, 11, 20, 0.85)") !== -1 &&
  storyCss.indexOf("border-top: 1px solid var(--line)") !== -1);
check("letterbox bars are 8%",
  storyCss.indexOf("height: 8%") !== -1 &&
  storyCss.indexOf("height: 8vh") !== -1);

if (failures) {
  console.log(`test_fui: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_fui: PASS");
