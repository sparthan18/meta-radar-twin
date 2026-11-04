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
const storyJs = read("web/story.js");
const explainerJs = read("web/explainer.js");
const annotateJs = read("web/annotate.js");
const deck3dJs = read("web/deck3d.js");

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
    "--fs-32", "--fs-48", "--fs-72", "--fs-112", "--fs-120", "--fs-160",
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

// --- phase 8b: landing ---
check("preloader exists with the drawing wordmark",
  indexHtml.indexOf('id="storyPreloader"') !== -1 &&
  indexHtml.indexOf('class="preloader-text"') !== -1 &&
  indexHtml.indexOf(">RADARTWIN</text>") !== -1);
check("preloader is 1.2 s on --bg, outline then fill",
  storyCss.indexOf("#storyPreloader") !== -1 &&
  storyCss.indexOf("background: var(--bg)") !== -1 &&
  storyCss.indexOf("fui-pre-draw 1.2s") !== -1 &&
  storyCss.indexOf("stroke-dashoffset: 320") !== -1 &&
  storyCss.indexOf("fill: rgba(230, 238, 252, 0)") !== -1);
check("landing wordmark is 120 px Rajdhani 700 tracked 0.08 em in the lower third",
  indexHtml.indexOf('class="landing-word">RADARTWIN<') !== -1 &&
  storyCss.indexOf(".landing-word") !== -1 &&
  storyCss.indexOf("font-size: var(--fs-120)") !== -1 &&
  storyCss.indexOf("font-weight: 700") !== -1 &&
  storyCss.indexOf("letter-spacing: 0.08em") !== -1 &&
  storyCss.indexOf("padding-top: calc(72vh - 108px)") !== -1);
check("planted: centred 160 px landing title is caught",
  storyCss.indexOf(".landing-word") !== -1 &&
  storyCss.indexOf("font-size: var(--fs-160)") === -1);
check("planted: 40 px landing title is caught",
  storyCss.indexOf("#storyLanding h2") === -1 &&
  indexHtml.indexOf(">RadarTwin Dresden</h2>") === -1);
check("landing sub and tagline are mono",
  indexHtml.indexOf('class="landing-sub">DRESDEN') !== -1 &&
  indexHtml.indexOf('class="landing-tag">The data flagged it first.<') !== -1 &&
  storyCss.indexOf(".landing-sub") !== -1 &&
  storyCss.indexOf(".landing-tag") !== -1);
check("Play is a 72 px hairline ring with PLAY beneath",
  indexHtml.indexOf('id="storyPlay"') !== -1 &&
  indexHtml.indexOf('class="play-ring"') !== -1 &&
  indexHtml.indexOf('class="play-word"') !== -1 &&
  indexHtml.indexOf(">PLAY</span>") !== -1 &&
  storyCss.indexOf(".play-ring") !== -1 &&
  storyCss.indexOf("width: 72px") !== -1 &&
  storyCss.indexOf("border: 1px solid var(--line-strong)") !== -1);
check("planted: white rectangular Play button is caught",
  storyCss.indexOf("background: #fff") === -1 &&
  storyCss.indexOf("border-radius: 8px") === -1);
check("landing has four corner brackets at the frame edges",
  (indexHtml.match(/class="landing-corner /g) || []).length === 4 &&
  storyCss.indexOf(".landing-corner") !== -1 &&
  storyCss.indexOf("width: 18px") !== -1);
check("old title text stays only in Explore's header (and <title>)",
  (indexHtml.match(/RadarTwin Dresden — bridge watchlist hindcast/g) || []).length === 2 &&
  indexHtml.indexOf("<title>RadarTwin Dresden") !== -1 &&
  indexHtml.indexOf("<h1>RadarTwin Dresden") !== -1);
check("planted: old scene-title text is caught",
  indexHtml.indexOf("RadarTwin Dresden</strong>") === -1 &&
  indexHtml.indexOf("A bridge watchlist hindcast") === -1);
check("preloader waits 1.2 s for fonts and first tiles",
  storyJs.indexOf("setTimeout(resolve, 1200)") !== -1 &&
  storyJs.indexOf("document.fonts.ready") !== -1 &&
  storyJs.indexOf("storyRunPreloader") !== -1);
check("landing orbits behind the title at 0.5 deg/s over the crane end framing",
  storyJs.indexOf("storyLandingBearing") !== -1 &&
  storyJs.indexOf("storyStartLandingOrbit") !== -1 &&
  storyJs.indexOf("0.5 * dt / 1000") !== -1 &&
  storyJs.indexOf("STORY_TITLE_ZOOM, pitch: STORY_TITLE_PITCH") !== -1);
check("Play dips behind the cut to the crane start (sequence in a code comment)",
  storyJs.indexOf("behind the dip") !== -1 &&
  storyJs.indexOf("storyCameraAt(storyScenes[0], 0, 0)") !== -1 &&
  storyJs.indexOf("STORY_CRANE_START_ZOOM") !== -1 &&
  storyJs.indexOf("STORY_TITLE_BEARING") !== -1);
check("sky/fog applies on style load in story and Explore, guarded without setSky",
  storyJs.indexOf("storyApplySky") !== -1 &&
  storyJs.indexOf("map.setSky") !== -1 &&
  storyJs.indexOf("typeof map.setSky") !== -1 &&
  storyJs.indexOf("applyFuiSky") !== -1);

// --- phase 8b: scene 1 title + scene 4 wordmark ---
check("scene-1 title holds the landing 120 px in the lower third",
  indexHtml.indexOf('<strong>RADARTWIN</strong>') !== -1 &&
  storyCss.indexOf("#sceneTitle strong") !== -1 &&
  storyCss.indexOf("font-size: var(--fs-120)") !== -1 &&
  storyCss.indexOf("#sceneTitle[hidden]") !== -1);
check("wordmark enter at 2 s is wired to the playhead",
  storyJs.indexOf("storyTitleShown") !== -1 &&
  storyJs.indexOf("STORY_TITLE_AT") !== -1 &&
  storyJs.indexOf("storyTitleShown(localT, storyReduced())") !== -1);
check("planted: title shrink is gone",
  storyJs.indexOf("storyTitleSize") === -1 &&
  storyJs.indexOf("storySyncTitleSize") === -1);
check("month wordmark is 112 px display caps top-right",
  indexHtml.indexOf('id="sceneMonthWord"') !== -1 &&
  indexHtml.indexOf('class="mw-month"') !== -1 &&
  indexHtml.indexOf('class="mw-year"') !== -1 &&
  storyCss.indexOf("#sceneMonthWord") !== -1 &&
  storyCss.indexOf("font-size: var(--fs-112)") !== -1 &&
  storyCss.indexOf("font-weight: 600") !== -1 &&
  storyCss.indexOf("text-transform: uppercase") !== -1 &&
  storyCss.indexOf("top: calc(8vh + 12px); right: 24px") !== -1);
check("month wordmark crossfades 150 ms per month",
  storyJs.indexOf("storySyncMonthWord") !== -1 &&
  storyJs.indexOf("storyMonthWordParts(cutoff)") !== -1 &&
  storyJs.indexOf("duration: 0.15") !== -1);
check("planted: popping headline is caught",
  storyJs.indexOf("storyFade150(storyEl(\"headline\"))") !== -1);

// --- phase 8b: scene 2 explainer as a drawn diagram ---
check("explainer shapes are hairline outlines",
  storyCss.indexOf(".explainer-body { fill: none; stroke: var(--line-strong)") !== -1 &&
  storyCss.indexOf(".explainer-panel { fill: none; stroke: var(--line-strong)") !== -1 &&
  storyCss.indexOf(".explainer-kerb { fill: none; stroke: var(--line-strong)") !== -1 &&
  storyCss.indexOf(".explainer-deck { fill: none; stroke: var(--line-strong)") !== -1 &&
  storyCss.indexOf(".explainer-bracket") !== -1 &&
  explainerJs.indexOf("explainerCorners") !== -1 &&
  explainerJs.indexOf('id: "expKerbG"') !== -1);
check("explainer pulse arcs and echo path are dashed",
  storyCss.indexOf(".explainer-pulse { fill: none; stroke: #5ee7ff; stroke-width: 1; stroke-dasharray: 6 4") !== -1 &&
  storyCss.indexOf(".explainer-echo { fill: none; stroke: #f2b84b; stroke-width: 1; stroke-dasharray: 6 4") !== -1 &&
  storyCss.indexOf(".explainer-echo-path") !== -1 &&
  explainerJs.indexOf('id: "expEchoPath"') !== -1);
check("explainer counter is 72 px mono, labels 11 px tracked mono",
  storyCss.indexOf(".explainer-counter") !== -1 &&
  storyCss.indexOf("font-family: var(--font-data); font-size: 72px") !== -1 &&
  storyCss.indexOf("font-family: var(--font-data); font-size: 11px") !== -1 &&
  storyCss.indexOf("letter-spacing: 0.12em; text-transform: uppercase") !== -1);
check("planted: filled explainer blocks are caught",
  storyCss.indexOf("#5b6b7c") === -1 &&
  storyCss.indexOf("#1d4ed8") === -1 &&
  storyCss.indexOf("#7cb3ff") === -1 &&
  storyCss.indexOf("stroke: #fff") === -1 &&
  storyCss.indexOf("font-size: 34px") === -1);

// --- phase 8b: footprints, markers, labels, strip ---
check("bridge fills are 0.12 at city zoom, 0.38 in close-up",
  indexHtml.indexOf('"fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.12, 15, 0.38]') !== -1);
check("planted: pale-pill constant fills are caught",
  indexHtml.indexOf('"fill-opacity": 0.38') === -1);
check("reticle ring carries the risk colour",
  indexHtml.indexOf('"circle-stroke-color": riskExpr') !== -1);
check("planted: fixed-colour reticle ring is caught",
  indexHtml.indexOf('"circle-stroke-color": "rgba(143, 184, 255, 0.28)"') === -1);
check("boot settles on zoom 12.3 with the FUI ease",
  (indexHtml.match(/12\.3/g) || []).length >= 2 &&
  indexHtml.indexOf("zoom: REDUCED ? 12.3 : 11") !== -1 &&
  indexHtml.indexOf("easeOpts.easing = storyEaseOut") !== -1);
check("place labels hide in scenes 1/3/4, never over imagery",
  storyJs.indexOf("storyApplyLabelVisibility") !== -1 &&
  storyJs.indexOf('sc.id === "title" || sc.id === "twenty-bridges" || sc.id === "three-years"') !== -1 &&
  storyJs.indexOf('"fui-places"') !== -1);
check("landing backdrop waits for tiles before the first tilt",
  storyJs.indexOf("storyApplySceneState(0, true)") !== -1 &&
  storyJs.indexOf("forceWait") !== -1);
check("history band spans the full width with filling cells above the caption",
  storyCss.indexOf('body[data-mode="story"] #historyStrip') !== -1 &&
  storyCss.indexOf("bottom: calc(8vh + 70px)") !== -1 &&
  storyCss.indexOf("display: block") !== -1 &&
  storyCss.indexOf('body[data-mode="story"] #historyStrip .history-svg') !== -1 &&
  storyCss.indexOf("width: 100%") !== -1);
check("planted: bottom-left strip block is caught",
  storyCss.indexOf("right: 170px") === -1);
check("planted: centred narrow strip is caught",
  storyCss.indexOf("bottom: calc(8vh + 16px);\n  z-index: 29;\n  flex: none;\n  display: flex;\n  justify-content: center") === -1);

// --- phase 8b fix: spans, fills, strip renderer, wordmark, explainer ---
check("story hides span dots below 13.5 via a 13.2-13.6 ramp",
  storyJs.indexOf("storySpansOpacityExpr") !== -1 &&
  storyJs.indexOf("storyApplySpansVisibility") !== -1 &&
  storyJs.indexOf("13.2") !== -1 &&
  storyJs.indexOf("13.6") !== -1);
check("story restores zoom-dependent fills in both deck paths",
  storyJs.indexOf("storyFillOpacityExpr") !== -1 &&
  storyJs.indexOf("storyRestoreFill") !== -1 &&
  storyJs.indexOf("storyWrapDeckHide") !== -1 &&
  storyJs.indexOf("_storyWrapped") !== -1);
check("story renders the filling history strip in scene 4",
  storyJs.indexOf("storyHistoryGeometry") !== -1 &&
  storyJs.indexOf("storyRenderHistoryStrip") !== -1 &&
  storyJs.indexOf("storyRenderHistoryStrip(m, m)") !== -1);
check("wordmark sets in the same tick as the headline (no lagging timeline)",
  storyJs.indexOf("storySyncMonthWord") !== -1 &&
  storyJs.indexOf("gsap.fromTo(el, { opacity: 0 }") !== -1 &&
  storyJs.indexOf(".add(set)") === -1);
check("explainer cover reserves the caption band plus 40 px",
  storyCss.indexOf("#sceneCover") !== -1 &&
  storyCss.indexOf("padding: 0 0 calc(8vh + 166px)") !== -1);
check("planted: full-bleed explainer cover is caught",
  storyCss.indexOf("padding: 0; text-align: center") === -1);

// --- phase 8b fix 2: story strip rows are 9 px (200 px), labels 9 px centred ---
check("story strip labels are 9 px JetBrains Mono 500 uppercase tracked 0.04 em",
  (() => {
    const sel = 'body[data-mode="story"] #historyStrip .history-label';
    const i = storyCss.indexOf(sel);
    if (i === -1) return false;
    const snippet = storyCss.slice(i, i + 400);
    return snippet.indexOf("font-family: var(--font-data)") !== -1 &&
      snippet.indexOf("font-size: 9px") !== -1 &&
      snippet.indexOf("font-weight: 500") !== -1 &&
      snippet.indexOf("text-transform: uppercase") !== -1 &&
      snippet.indexOf("letter-spacing: 0.04em") !== -1;
  })());
check("story strip renderer centres 9 px labels in a 150 px column, 22-char truncation",
  storyJs.indexOf('"font-size": "9"') !== -1 &&
  storyJs.indexOf('"dominant-baseline": "central"') !== -1 &&
  storyJs.indexOf("y + cellH / 2") !== -1 &&
  storyJs.indexOf("name.length > 22") !== -1 &&
  storyJs.indexOf('name.slice(0, 21) + "…"') !== -1 &&
  storyJs.indexOf("storyHistoryGeometry(bandW, cuts.length, order.length, 150)") !== -1);
check("planted: 11 px story strip labels on an 8 px pitch are caught",
  storyJs.indexOf('"font-size": "11"') === -1 &&
  storyJs.indexOf("name.length > 24") === -1 &&
  storyJs.indexOf('name.slice(0, 23) + "…"') === -1);

// --- phase 8b fix 5: lower-third halo + subtitle colour ---
const HALO5 = "text-shadow: 0 0 24px rgba(7,11,20,.85), 0 1px 2px rgba(7,11,20,.9)";
function cssBlock5(sel) {
  const i = storyCss.indexOf(sel);
  if (i === -1) return "";
  const end = storyCss.indexOf("}", i);
  if (end === -1) return "";
  return storyCss.slice(i, end);
}
function hasFg85(block) {
  return block.indexOf("rgba(230, 238, 252, 0.85)") !== -1 ||
    block.indexOf("rgba(230,238,252,0.85)") !== -1 ||
    block.indexOf("rgba(230,238,252,.85)") !== -1;
}
function hasMuted(block) {
  return block.indexOf("var(--text-dim)") !== -1 ||
    block.indexOf("var(--muted)") !== -1;
}
check("8b-fix5 lower-third halo is the spec shadow",
  storyCss.indexOf(HALO5) !== -1);
for (const sel of [".landing-word", ".landing-sub", ".landing-tag",
    "#sceneTitle strong", "#sceneTitle span", "#caption"]) {
  check(`8b-fix5 halo on ${sel}`, cssBlock5(sel).indexOf(HALO5) !== -1);
}
check("8b-fix5 landing subtitle is --fg at 85%, not the muted token",
  hasFg85(cssBlock5(".landing-sub")) && !hasMuted(cssBlock5(".landing-sub")));
check("8b-fix5 scene-1 subtitle is --fg at 85%, not the muted token",
  hasFg85(cssBlock5("#sceneTitle span")) && !hasMuted(cssBlock5("#sceneTitle span")));
check("planted: a muted subtitle is caught",
  (() => {
    const mutedSample = ".landing-sub { color: var(--text-dim); }";
    return hasMuted(mutedSample) === true &&
      hasFg85(mutedSample) === false &&
      !hasMuted(cssBlock5(".landing-sub")) &&
      !hasMuted(cssBlock5("#sceneTitle span"));
  })());
check("8b-fix5 lower-third type has no box, scrim or gradient band",
  (() => {
    for (const sel of [".landing-word", ".landing-sub", ".landing-tag",
        "#sceneTitle strong", "#sceneTitle span"]) {
      const block = cssBlock5(sel);
      if (!block) return false;
      if (block.indexOf("background") !== -1) return false;
      if (block.indexOf("box-shadow") !== -1) return false;
      if (block.indexOf("linear-gradient") !== -1) return false;
    }
    return true;
  })());

// --- phase 8c-1: HUD card, side-view card, span callout ---
function cssBlock8(sel) {
  const i = storyCss.indexOf(sel);
  if (i === -1) return "";
  const end = storyCss.indexOf("}", i);
  if (end === -1) return "";
  return storyCss.slice(i, end);
}
function hasFullBorder(block) {
  // A real border declaration: "border:" followed by anything but 0,
  // or any border-width/color/style longhand. Hairline rules
  // (border-top on .sv-rule etc.) are not full borders.
  const decls = block.match(/border\s*:\s*[^;}{]+/g) || [];
  for (const d of decls) {
    const v = d.replace(/border\s*:\s*/, "").trim();
    if (v !== "0") return true;
  }
  return /(border-width|border-color|border-style)\s*:/.test(block);
}
function hasGlass10(block) {
  return block.indexOf("background-color: var(--bg-2-glass)") !== -1 &&
    block.indexOf("backdrop-filter: blur(10px)") !== -1;
}
check("8c-1 HUD card is 300 px glass with blur(10px)",
  cssBlock8("#deckHud").indexOf("width: 300px") !== -1 &&
  hasGlass10(cssBlock8("#deckHud")));
check("8c-1 HUD name is 22 px display",
  cssBlock8("#deckHud .hud-name").indexOf("font-family: var(--font-display)") !== -1 &&
  cssBlock8("#deckHud .hud-name").indexOf("font-size: 22px") !== -1);
check("8c-1 HUD readouts are a 2 x 2 grid of label-over-value pairs",
  cssBlock8("#deckHud .hud-grid").indexOf("display: grid") !== -1 &&
  cssBlock8("#deckHud .hud-grid").indexOf("grid-template-columns: 1fr 1fr") !== -1 &&
  annotateJs.indexOf("hud-ro--cutoff") !== -1 &&
  annotateJs.indexOf("hud-ro--rank") !== -1 &&
  annotateJs.indexOf("hud-ro--z") !== -1 &&
  annotateJs.indexOf("hud-ro--risk") !== -1 &&
  annotateJs.indexOf(">CUTOFF<") !== -1 &&
  annotateJs.indexOf(">RANK<") !== -1 &&
  annotateJs.indexOf(">Z<") !== -1 &&
  annotateJs.indexOf(">RISK<") !== -1);
check("8c-1 HUD worry word is display face coloured by class",
  cssBlock8("#deckHud .hud-worry").indexOf("font-family: var(--font-display)") !== -1 &&
  storyCss.indexOf("#deckHud .hud-worry.risk-high { color: var(--risk-high); }") !== -1 &&
  storyCss.indexOf("#deckHud .hud-worry.risk-elevated { color: var(--risk-elevated); }") !== -1 &&
  storyCss.indexOf("#deckHud .hud-worry.risk-watch { color: var(--risk-watch); }") !== -1);
check("8c-1 HUD counts up on scene entry, crossfades on the month change",
  storyJs.indexOf('{ transition: isSeptember ? "xfade" : "count" }') !== -1 &&
  annotateJs.indexOf("opts.transition") !== -1 &&
  annotateJs.indexOf("fuiCountUp(sp, Number(sp.getAttribute") !== -1 &&
  annotateJs.indexOf("gsap.fromTo(box, { opacity: 0 }") !== -1);
check("8c-1 side-view card is 320 px glass with blur(10px)",
  cssBlock8("#sceneSideView").indexOf("width: 320px") !== -1 &&
  hasGlass10(cssBlock8("#sceneSideView")));
check("8c-1 side-view title sits on a hairline rule with the factor right",
  cssBlock8("#sceneSideView h3").indexOf("display: flex") !== -1 &&
  cssBlock8("#sceneSideView h3 .sv-rule").indexOf("border-top: 1px solid var(--line)") !== -1 &&
  storyJs.indexOf('"SIDE VIEW"') !== -1 &&
  storyJs.indexOf("VERTICAL ×") !== -1);
check("8c-1 cards are bracket-framed with no full border",
  indexHtml.indexOf('id="deckHud" class="fui-panel') !== -1 &&
  indexHtml.indexOf('id="sceneSideView" class="fui-panel') !== -1 &&
  cssBlock8("#deckHud").indexOf("border: 0") !== -1 &&
  cssBlock8("#sceneSideView").indexOf("border: 0") !== -1 &&
  !hasFullBorder(cssBlock8("#deckHud")) &&
  !hasFullBorder(cssBlock8("#sceneSideView")));
check("planted: a bordered HUD is caught",
  hasFullBorder("#deckHud { border: 1px solid #fff; }") === true &&
  hasFullBorder("#deckHud { border: 0; }") === false &&
  !hasFullBorder(cssBlock8("#deckHud")));
check("8c-1 span callout value is 18 px mono",
  fui.indexOf(".annotate-span-value") !== -1 &&
  fui.indexOf("font-size: var(--fs-18)") !== -1 &&
  annotateJs.indexOf("annotate-span-value") !== -1);
check("8c-1 span callout is a bracketed label with no filled box",
  storyJs.indexOf("spanCallout: true") !== -1 &&
  annotateJs.indexOf("co.spanCallout") !== -1 &&
  annotateJs.indexOf("if (!spanStyle)") !== -1);
check("8c-1 side-view prisms at 35 %, worst solid, 6 px pier ticks",
  annotateJs.indexOf('"0.35"') !== -1 &&
  annotateJs.indexOf("is-worst") !== -1 &&
  annotateJs.indexOf('"deck-tick"') !== -1 &&
  annotateJs.indexOf("baseY + 6") !== -1 &&
  storyCss.indexOf(".deck-tick") !== -1 &&
  storyCss.indexOf(".deck-pillar") === -1 &&
  storyCss.indexOf(".deck-ground") === -1 &&
  storyCss.indexOf(".deck-factor") === -1);
check("8c-1 story shows the seated deck, Explore keeps the bars default",
  storyJs.indexOf('mode: "seated"') !== -1 &&
  deck3dJs.indexOf("deckSeatedSpec") !== -1 &&
  deck3dJs.indexOf("DECK_SEATED_TILT_DEG") !== -1 &&
  deck3dJs.indexOf('(o.mode === "seated") ? "seated" : "bars"') !== -1);

// --- phase 8c-1 fix item 3: footprint drops to a hairline, no fill ---
check("8c-1-fix seated close-up drops the fill to 0, bars keeps 0.15",
  deck3dJs.indexOf("deckSetFillDim(map, true, (o.mode") !== -1 &&
  deck3dJs.indexOf("(seated ? 0 : 0.15)") !== -1);
check("8c-1-fix seated outline is a 1 px hairline, restored to 2.5",
  deck3dJs.indexOf('"bridges-line", "line-width"') !== -1 &&
  deck3dJs.indexOf("? 2.5 : 1") !== -1 &&
  storyJs.indexOf('"bridges-line", "line-width", 2.5') !== -1);
check("planted: seated fill left at the 0.15 dim is caught",
  deck3dJs.indexOf("(seated ? 0 : 0.15)") !== -1 &&
  deck3dJs.indexOf("dim ? 0.15 : 0.38") === -1);

// --- phase 8c-1 fix item 4: no floating counter, HUD counts, leader draws ---
check("8c-1-fix scene 6 has no floating rank/z counter over the map",
  storyJs.indexOf("co.counter") === -1 &&
  storyJs.indexOf("AnnotateTweenCounter(") === -1);
check("planted: re-added floating counter is caught",
  storyJs.indexOf("AnnotateSetCallouts([co])") !== -1 &&
  storyJs.indexOf("co.counter = formatRankCounter") === -1);
check("8c-1-fix HUD RANK and Z count up via countable spans",
  storyJs.indexOf("AnnotateSetHud({ name: cname") !== -1 &&
  annotateJs.indexOf("numSpan(d.rank, 0)") !== -1 &&
  annotateJs.indexOf("numSpan(d.z, 2)") !== -1 &&
  annotateJs.indexOf("data-fui-count") !== -1 &&
  annotateJs.indexOf("fuiCountUp(sp, Number(sp.getAttribute") !== -1);
check("8c-1-fix leader line carries stroke and opacity over the map",
  annotateJs.indexOf('"class": "annotate-line"') !== -1 &&
  annotateJs.indexOf('"stroke": "#bfd6ff"') !== -1 &&
  annotateJs.indexOf('"stroke-opacity": "0.6"') !== -1 &&
  annotateJs.indexOf('"opacity": "0.95"') !== -1 &&
  annotateJs.indexOf("calloutLineEnds(pt, pos, labelW, labelH)") !== -1);
check("8c-1-fix callout SVG sits above the deck canvas",
  storyCss.indexOf(".annotate-svg") !== -1 &&
  storyCss.indexOf("z-index: 12") !== -1);
check("8c-1-fix span callout still wires the fastest span with brackets",
  storyJs.indexOf("storySpanCallout(bid, midx") !== -1 &&
  storyJs.indexOf("fastestSpan(arr, monthIdx)") !== -1 &&
  storyJs.indexOf("spanCallout: true") !== -1 &&
  annotateJs.indexOf("annotate-corner") !== -1);

// --- phase 8c-1 fix item 5: 300 px HUD, worry on one line ---
check("8c-1-fix HUD worry phrase never wraps, shrunk to 16 px",
  cssBlock8("#deckHud .hud-worry").indexOf("white-space: nowrap") !== -1 &&
  cssBlock8("#deckHud .hud-worry").indexOf("font-size: 16px") !== -1);
check("planted: wrapped 18 px worry is caught",
  cssBlock8("#deckHud .hud-worry").indexOf("white-space: nowrap") !== -1 &&
  cssBlock8("#deckHud .hud-worry").indexOf("font-size: 16px") !== -1 &&
  cssBlock8("#deckHud").indexOf("width: 260px") === -1);

// --- phase 8c-2 item 1: scene 7 on the dark close-up, deck kept ---
check("8c-3 scene 7 is dark with no SAM, scenes 7-8 keep the seated deck",
  storyJs.indexOf('layers: { basemap: "dark" }, overlay: "memo"') !== -1 &&
  storyJs.indexOf('layers: { basemap: "dark", sam: true }, overlay: "memo"') === -1 &&
  storyJs.indexOf("storyDeckKeepForScene(sc)") !== -1 &&
  storyJs.indexOf('mode: "seated"') !== -1 &&
  storyJs.indexOf("AnnotateClearHud()") !== -1);
check("8c-3 SAM stays off in every story scene, restored on exit",
  storyJs.indexOf("storyApplySamHairline") !== -1 &&
  storyJs.indexOf('"sam-lines", "line-width", on ? 1 : 2.5') !== -1 &&
  storyJs.indexOf('"sam-lines", "line-color", "#5ee7ff"') !== -1 &&
  storyJs.indexOf("storyApplySamHairline(false)") !== -1 &&
  storyJs.indexOf('storyApplySamHairline(sc.id === "the-report")') === -1);
check("8c-2 no S2 raster or annotation SAM is added to the map in scene 7",
  storyJs.indexOf("storyFetchEvidence(my)") !== -1 &&
  storyJs.indexOf("storyAddS2(my)") === -1 &&
  storyJs.indexOf("storyAddSam(my)") === -1);
check("planted: scene-7 imagery base is caught",
  storyJs.indexOf('layers: { basemap: "imagery", sam: true }') === -1);

// --- phase 8c-2 item 2: the glass side panel with a 600 ms crossfade ---
check("8c-2 side panel is 440 px glass, letterbox to letterbox",
  indexHtml.indexOf('id="storySidePanel" class="fui-panel"') !== -1 &&
  cssBlock8("#storySidePanel").indexOf("width: 440px") !== -1 &&
  cssBlock8("#storySidePanel").indexOf("top: 8vh") !== -1 &&
  cssBlock8("#storySidePanel").indexOf("bottom: 8vh") !== -1 &&
  cssBlock8("#storySidePanel").indexOf("background-color: rgba(11, 18, 32, 0.78)") !== -1 &&
  cssBlock8("#storySidePanel").indexOf("backdrop-filter: blur(12px)") !== -1);
check("8c-2 memo and proof live inside the side panel",
  (() => {
    const p = indexHtml.indexOf('id="storySidePanel"');
    const m = indexHtml.indexOf('id="sceneMemo"');
    const q = indexHtml.indexOf('id="sceneProof"');
    const e = indexHtml.indexOf('id="sceneEvidence"');
    return p !== -1 && m > p && q > m && e > q;
  })());
check("8c-2 memo/proof crossfade 600 ms between them",
  storyJs.indexOf("storySwapSidePanel") !== -1 &&
  storyJs.indexOf('storySwapSidePanel("proof")') !== -1 &&
  storyJs.indexOf("gsap.fromTo(showEl, { opacity: 0 }") !== -1 &&
  storyJs.indexOf("gsap.to(hideEl, { opacity: 0, duration: 0.6") !== -1);
check("planted: centred proof card is caught",
  cssBlock8("#sceneProof").indexOf("inset: 0") === -1 &&
  storyCss.indexOf("max-width: 520px") === -1);

// --- phase 8c-2 item 3: the memo panel with hairline action rows ---
check("8c-2 memo title is uppercase on a rule",
  storyJs.indexOf("INSPECTION MEMO — ${cutoff}") !== -1 &&
  storyCss.indexOf("#sceneMemo > h3") !== -1 &&
  storyCss.indexOf("border-bottom: 1px solid var(--line)") !== -1);
check("8c-2 verdict is Inter 16/1.5 with the amber band + underline",
  cssBlock8("#sceneMemoBody").indexOf("font-size: 16px") !== -1 &&
  cssBlock8("#sceneMemoBody").indexOf("line-height: 1.5") !== -1 &&
  cssBlock8("#sceneMemoBody").indexOf("font-family: var(--font-reading)") !== -1 &&
  storyCss.indexOf("background: rgba(242, 184, 75, 0.18)") !== -1 &&
  storyCss.indexOf("border-bottom: 1px solid var(--amber)") !== -1);
check("8c-2 actions are hairline rows from the memo table",
  storyJs.indexOf("parseActionRows(md)") !== -1 &&
  storyJs.indexOf("renderActionRows(rows)") !== -1 &&
  storyCss.indexOf(".memo-action-name") !== -1 &&
  cssBlock8(".memo-action-name").indexOf("font-family: var(--font-display)") !== -1 &&
  cssBlock8(".memo-action-name").indexOf("font-size: 16px") !== -1 &&
  storyCss.indexOf(".memo-action-worry.risk-high { color: var(--risk-high); }") !== -1 &&
  cssBlock8(".memo-action-reason").indexOf("font-family: var(--font-data)") !== -1 &&
  cssBlock8(".memo-action-reason").indexOf("font-size: var(--fs-12)") !== -1 &&
  cssBlock8(".memo-action-do").indexOf("font-family: var(--font-reading)") !== -1 &&
  cssBlock8(".memo-action-do").indexOf("font-size: 13px") !== -1 &&
  storyCss.indexOf(".memo-action {\n  border-top: 1px solid var(--line)") !== -1);
check("planted: bordered memo table is caught",
  storyCss.indexOf("#sceneMemoBody table") === -1 &&
  storyCss.indexOf("#sceneMemoBody th") === -1);

// --- phase 8c-2 item 4: the evidence card ---
check("8c-2 evidence card is 280 px top-left with a pixelated chip",
  indexHtml.indexOf('id="sceneEvidence" class="fui-panel"') !== -1 &&
  indexHtml.indexOf('id="sceneEvidenceImg" src="data/s2_visual.png"') !== -1 &&
  indexHtml.indexOf('id="sceneEvidenceSvg" viewBox="0 0 1 1"') !== -1 &&
  indexHtml.indexOf("EVIDENCE — SENTINEL-2 · 10 m") !== -1 &&
  cssBlock8("#sceneEvidence {").indexOf("width: 280px") !== -1 &&
  cssBlock8("#sceneEvidence {").indexOf("top: calc(8vh + 12px)") !== -1 &&
  cssBlock8("#sceneEvidence {").indexOf("left: 16px") !== -1 &&
  cssBlock8("#sceneEvidenceImg").indexOf("image-rendering: pixelated") !== -1);
check("8c-2 SAM polygon draws as a 1 px cyan outline over 600 ms",
  storyCss.indexOf(".evidence-sam") !== -1 &&
  cssBlock8(".evidence-sam").indexOf("stroke: var(--sam)") !== -1 &&
  cssBlock8(".evidence-sam").indexOf("stroke-width: 1") !== -1 &&
  storyJs.indexOf("storyEvidencePathD") !== -1 &&
  storyJs.indexOf("s2ChipProject(lon, lat, corners, 1, 1)") !== -1 &&
  storyJs.indexOf("gsap.to(path.style, { strokeDashoffset: 0, duration: 0.6") !== -1);
check("8c-2 evidence enters with the SAM caption and exits with the scene",
  storyJs.indexOf("STORY_EVIDENCE_AT = 5.0") !== -1 &&
  storyJs.indexOf("storySyncEvidence(localT)") !== -1 &&
  storyJs.indexOf("storyEvidenceShown(localT)") !== -1 &&
  storyJs.indexOf("storyHideEvidence()") !== -1 &&
  storyJs.indexOf('formatSamLabel(') !== -1);
check("planted: map-covering S2 raster is caught",
  storyJs.indexOf('map.addLayer({ id: "s2-raster"') !== -1 &&
  storyJs.indexOf("storyAddS2(my)") === -1);

// --- phase 8c-2 item 5: the proof panel in the side panel ---
check("8c-2 proof counts 600 ms, settles identical, draws the check",
  storyJs.indexOf("STORY_PROOF_COUNT = 0.6") !== -1 &&
  storyJs.indexOf("STORY_PROOF_GAP = 0.09") !== -1 &&
  storyJs.indexOf("proof-eq-check") !== -1 &&
  storyJs.indexOf("M 4 13 L 10 19 L 20 6") !== -1 &&
  storyJs.indexOf("THE PROOF — ${cutoff}") !== -1);
check("8c-2 proof quantities are hairline rows with staggered checks",
  cssBlock8(".proof-list").indexOf("flex-direction: column") !== -1 &&
  storyCss.indexOf(".proof-list li {") !== -1 &&
  storyCss.indexOf("border-top: 1px solid var(--line)") !== -1 &&
  storyJs.indexOf("proofChecksShown(localT, STORY_PROOF_QUANTITIES.length") !== -1);
check("8c-2 scene 8 dims the city to 45 % with the dip kept",
  cssBlock8("#sceneDim").indexOf("background: rgba(7, 11, 20, 0.55)") !== -1 &&
  storyJs.indexOf('sc.id !== "how-radar-sees" && sc.id !== "the-proof"') !== -1);
check("planted: 2 s proof count-in is caught",
  storyJs.indexOf("STORY_PROOF_COUNT = 2.0") === -1 &&
  cssBlock8(".proof-list").indexOf("1fr 1fr") === -1);

// --- phase 8c-2 item 6: captions above every dim, blur and sheet ---
check("8c-2 caption and index sit above the dim and the side panel",
  (() => {
    const z = (sel) => {
      const i = storyCss.indexOf("\n" + sel);
      if (i === -1) return null;
      const snippet = storyCss.slice(i, i + 400);
      const m = /z-index:\s*(\d+)/.exec(snippet);
      return m ? Number(m[1]) : null;
    };
    const cap = z("#caption {");
    const idx = z("#sceneIndex {");
    const dim = z("#sceneDim {");
    const side = z("#storySidePanel {");
    console.log(`  info: z caption=${cap} index=${idx} dim=${dim} side=${side}`);
    return Number.isFinite(cap) && Number.isFinite(idx) &&
      Number.isFinite(dim) && Number.isFinite(side) &&
      cap > dim && cap > side && idx > dim && idx > side;
  })());
check("planted: caption under the dim is caught",
  (() => {
    const i = storyCss.indexOf("#caption {");
    const snippet = storyCss.slice(i, i + 400);
    const m = /z-index:\s*(\d+)/.exec(snippet);
    return m && Number(m[1]) !== 9;
  })());

// --- phase 8c-2 item 7: leader line + footprint leftovers ---
check("8c-2 span callout places with the 60 px gap and 12 px brackets",
  annotateJs.indexOf("ANNOTATE_SPAN_GAP = 60") !== -1 &&
  annotateJs.indexOf("placeOpts.gap = ANNOTATE_SPAN_GAP") !== -1 &&
  annotateJs.indexOf("const cs = spanStyle ? 12 : 8;") !== -1 &&
  annotateJs.indexOf('r: "3", "class": "annotate-dot"') !== -1);
check("planted: 8 px span brackets are caught",
  annotateJs.indexOf("const cs = spanStyle ? 12 : 8;") !== -1 &&
  annotateJs.indexOf("const cs = 8;") === -1);
check("8c-3 footprint hides in scenes 5-9 and restores on exit",
  storyJs.indexOf("storyHideFootprint") !== -1 &&
  storyJs.indexOf('"bridges-fill", "bridges-line", "bridges-dashed"') !== -1 &&
  storyJs.indexOf('"visibility", "none"') !== -1 &&
  storyJs.indexOf('"visibility", "visible"') !== -1 &&
  storyJs.indexOf("storyHidesFootprint") !== -1 &&
  storyJs.indexOf("storyDeckKeepForScene(sc); } catch") !== -1 &&
  storyJs.indexOf('} else if (sc.id === "ten-days-later") {') !== -1);
check("planted: visible footprint in the close-up is caught",
  storyJs.indexOf("storyHideFootprint(); } catch") !== -1);

// --- phase 8c-3 item 1: SAM and radar off the story map, kept in Explore ---
check("8c-3 scene-9 layer spec carries no sam or radar",
  storyJs.indexOf('layers: { basemap: "dark" }, overlay: "outro"') !== -1 &&
  storyJs.indexOf("sam: true") === -1 &&
  storyJs.indexOf("radar: true") === -1);
check("planted: scene-9 sam/radar flags are caught",
  storyJs.indexOf('sam: true, radar: true }, overlay: "outro"') === -1 &&
  storyJs.indexOf('layers: { basemap: "dark", sam: true }') === -1);
check("8c-3 Explore keeps the SAM and radar layers with their toggles",
  indexHtml.indexOf('id="btnSam"') !== -1 &&
  indexHtml.indexOf('id="btnRadar"') !== -1 &&
  indexHtml.indexOf('id: "sam-lines"') !== -1 &&
  indexHtml.indexOf('id: "s1-raster"') !== -1 &&
  indexHtml.indexOf('layerToggle("btnSam", "sam-lines")') !== -1 &&
  indexHtml.indexOf('layerToggle("btnRadar", "s1-raster")') !== -1);

// --- phase 8c-3 item 2: pull-back, date roll, pulse ---
check("8c-3 pull-back runs on the one camera path over 2.4 s",
  storyJs.indexOf("STORY_S9_FLY = 2.4") !== -1 &&
  storyJs.indexOf("STORY_S9_START_ZOOM = 16.3") !== -1 &&
  storyJs.indexOf('if (sc.id === "ten-days-later") {') !== -1 &&
  storyJs.indexOf('sc.id === "september" || sc.id === "ten-days-later"') !== -1 &&
  storyJs.indexOf("if (reduced && sc.id === \"ten-days-later\") at = STORY_S9_FLY;") !== -1);
check("8c-3 date roll is 112 px mono tabular in the upper third, no box",
  cssBlock8("#dateRoll").indexOf("font-size: var(--fs-112)") !== -1 &&
  cssBlock8("#dateRoll").indexOf("font-family: var(--font-data)") !== -1 &&
  cssBlock8("#dateRoll").indexOf("font-variant-numeric: tabular-nums") !== -1 &&
  cssBlock8("#dateRoll").indexOf("top: 22%") !== -1 &&
  cssBlock8("#dateRoll").indexOf("text-align: center") !== -1 &&
  cssBlock8("#dateRoll").indexOf("background") === -1);
check("planted: boxed 64 px date roll is caught",
  cssBlock8("#dateRoll").indexOf("font-size: 64px") === -1 &&
  cssBlock8("#dateRoll").indexOf("top: 38%") === -1 &&
  cssBlock8("#dateRoll").indexOf("background: rgba(7, 11, 20, 0.72)") === -1);
check("8c-3 roll runs 2.5 s and pulses the reticle once at its end",
  storyJs.indexOf("STORY_DATE_ROLL = 2.5") !== -1 &&
  storyJs.indexOf("STORY_DATE_ROLL_AT + STORY_DATE_ROLL") !== -1 &&
  storyJs.indexOf("storyGlowPulseOnce(`s9-") !== -1 &&
  storyJs.indexOf("storyShow(storyEl(\"dateRoll\"), localT < STORY_EUROPE_AT)") !== -1);

// --- phase 8c-3 item 3: Europe labels, collision rule, EGMS note ---
check("8c-3 basemap labels hide below zoom 6 in story mode",
  storyJs.indexOf("Number(z) < 6") !== -1 &&
  storyJs.indexOf("storyMode() === \"story\"") !== -1 &&
  storyJs.indexOf("storySyncEurope") !== -1);
check("8c-3 every lit city carries an annotation label, Dresden with reticle",
  storyJs.indexOf("AnnotateSetEurope(STORY_EUROPE_CITIES.slice(0, n)") !== -1 &&
  storyJs.indexOf('dresden: c.name === "Dresden"') !== -1 &&
  storyJs.indexOf("AnnotateClearEurope()") !== -1 &&
  annotateJs.indexOf("function AnnotateSetEurope(list)") !== -1 &&
  annotateJs.indexOf("function annotateDrawEurope(mapW, mapH)") !== -1 &&
  annotateJs.indexOf("europeKeptLabels(dots, mapW, mapH, band)") !== -1 &&
  annotateJs.indexOf("dresdenPt") !== -1);
check("8c-3 europe labels are mono 11 px uppercase in --fg at 70 %",
  fui.indexOf(".annotate-europe-label") !== -1 &&
  (() => {
    const i = fui.indexOf(".annotate-europe-label");
    const snippet = fui.slice(i, i + 400);
    return snippet.indexOf("font-size: var(--fs-11)") !== -1 &&
      snippet.indexOf("font-family: var(--font-data)") !== -1 &&
      snippet.indexOf("text-transform: uppercase") !== -1 &&
      snippet.indexOf("rgba(230, 238, 252, 0.7)") !== -1;
  })());
check("8c-3 europe label path is wired (not Dresden-only)",
  storyJs.indexOf("AnnotateSetEurope") !== -1 &&
  annotateJs.indexOf("annotate-europe-label") !== -1);
check("8c-3 EGMS note sits in the top letterbox bar at the right",
  cssBlock8("#sceneEuropeNote").indexOf("right: 24px") !== -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("top: 0") !== -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("height: 8vh") !== -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("font-size: 11px") !== -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("color: var(--text-dim)") !== -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("font-family: var(--font-data)") !== -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("background") === -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("bottom") === -1);
check("planted: bottom-bar EGMS note crowding the scrub line is caught",
  cssBlock8("#sceneEuropeNote").indexOf("bottom: 0") === -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("bottom: calc(8vh + 12px)") === -1 &&
  cssBlock8("#sceneEuropeNote").indexOf("font-size: 11.5px") === -1);

// --- phase 8c-3 fix 2 item 1: Europe tile warmer is map-size ---
check("8c-3-fix2 warmer is one map-size hidden Map at the Europe pose, guarded",
  storyJs.indexOf("function storyEnsureEuropeWarmer()") !== -1 &&
  storyJs.indexOf("function storyRemoveEuropeWarmer()") !== -1 &&
  storyJs.indexOf("function storyEuropeWarmerSize()") !== -1 &&
  storyJs.indexOf("if (storyEuropeWarmer) return true") !== -1 &&
  storyJs.indexOf("map.getContainer") !== -1 &&
  storyJs.indexOf("clientWidth") !== -1 &&
  storyJs.indexOf("clientHeight") !== -1 &&
  storyJs.indexOf("el.style.width = `${size.w}px`") !== -1 &&
  storyJs.indexOf("el.style.height = `${size.h}px`") !== -1 &&
  storyJs.indexOf('el.style.visibility = "hidden"') !== -1 &&
  storyJs.indexOf('el.style.pointerEvents = "none"') !== -1 &&
  storyJs.indexOf('aria-hidden", "true"') !== -1 &&
  storyJs.indexOf("map.getStyle()") !== -1 &&
  storyJs.indexOf("buildFuiStyle({ dark: true })") !== -1 &&
  storyJs.indexOf("center: STORY_EUROPE_CENTER.slice()") !== -1 &&
  storyJs.indexOf("zoom: STORY_EUROPE_ZOOM") !== -1 &&
  storyJs.indexOf("pitch: 0") !== -1 &&
  storyJs.indexOf("bearing: 0") !== -1 &&
  storyJs.indexOf("interactive: false") !== -1 &&
  storyJs.indexOf("attributionControl: false") !== -1 &&
  storyJs.indexOf("new ML.Map({") !== -1);
check("8c-3-fix2 warmer runs on scene 8 entry, out on scene 9 end and seeks away",
  storyJs.indexOf('if (sc.id === "the-proof") {\n    try { storyFetchProof(my); } catch') !== -1 &&
  storyJs.indexOf("storyEnsureEuropeWarmer(); } catch") !== -1 &&
  storyJs.indexOf('} else if (sc.id !== "ten-days-later") {') !== -1 &&
  storyJs.indexOf("function storyOnComplete() {\n  storyState = \"ended\";\n  try { storyRemoveEuropeWarmer(); } catch") !== -1 &&
  storyJs.indexOf("storyRemoveEurope();\n  try { storyRemoveEuropeWarmer(); } catch") !== -1);
check("planted: 2 x 2 px warmer is caught",
  storyJs.indexOf('el.style.width = "2px"') === -1 &&
  storyJs.indexOf('el.style.height = "2px"') === -1 &&
  storyJs.indexOf("storyEuropeWarmerSize") !== -1);
check("planted: unguarded or duplicated warmer is caught",
  storyJs.indexOf("storyEuropeWarmer = new maplibregl.Map") === -1 &&
  storyJs.indexOf("storyEnsureEuropeWarmer") !== -1 &&
  storyJs.indexOf("storyRemoveEuropeWarmer") !== -1);
// --- phase 8c-3 fix 2 item 2: the Europe beat is a cut ---
check("8c-3-fix2 Europe cut dips behind the jump (same element and curve)",
  storyJs.indexOf("function storyDipEurope()") !== -1 &&
  storyJs.indexOf("storyEl(\"sceneDip\")") !== -1 &&
  storyJs.indexOf("duration: STORY_EUROPE_DIP") !== -1 &&
  storyJs.indexOf('ease: "power1.in"') !== -1 &&
  storyJs.indexOf('ease: "power1.out"') !== -1 &&
  storyJs.indexOf("STORY_EUROPE_CUT_AT") !== -1 &&
  storyJs.indexOf("if (t >= STORY_EUROPE_CUT_AT)") !== -1 &&
  storyJs.indexOf("zoom: STORY_EUROPE_ZOOM, pitch: 0, bearing: 0") !== -1 &&
  storyJs.indexOf("storyDipEurope(); } catch") !== -1);
check("planted: continuous Europe zoom is caught",
  storyJs.indexOf("map.easeTo({ center: STORY_EUROPE_CENTER.slice()") === -1);

// --- phase 8c-3 item 4: the ending sheet ---
check("8c-3 ending markup is a column with date, lines and kept ids",
  indexHtml.indexOf('id="storyEndDate"') !== -1 &&
  indexHtml.indexOf('id="storyEndLine1"') !== -1 &&
  indexHtml.indexOf('id="storyEndLine2"') !== -1 &&
  indexHtml.indexOf('id="storyEndKicker"') !== -1 &&
  indexHtml.indexOf('id="storyEndMain"') !== -1 &&
  indexHtml.indexOf('id="btnReplay"') !== -1 &&
  indexHtml.indexOf('id="btnExploreEnd"') !== -1 &&
  indexHtml.indexOf('class="story-end-col"') !== -1 &&
  indexHtml.indexOf("story-end-card") === -1 &&
  storyJs.indexOf('storyEl("btnReplay")') !== -1 &&
  storyJs.indexOf('storyEl("btnExploreEnd")') !== -1);
check("8c-3 ending sheet is full-bleed 0.94 with the 112/48/16 column",
  cssBlock8("#storyEnd {").indexOf("background: rgba(7, 11, 20, 0.94)") !== -1 &&
  cssBlock8("#storyEndDate").indexOf("font-size: var(--fs-112)") !== -1 &&
  cssBlock8("#storyEndDate").indexOf("font-variant-numeric: tabular-nums") !== -1 &&
  cssBlock8("#storyEndDate").indexOf("text-transform: uppercase") !== -1 &&
  cssBlock8("#storyEndMain").indexOf("font-size: var(--fs-48)") !== -1 &&
  cssBlock8("#storyEndMain").indexOf("font-family: var(--font-display)") !== -1 &&
  cssBlock8("#storyEndMain").indexOf("white-space: nowrap") !== -1 &&
  cssBlock8("#storyEndKicker").indexOf("font-size: 16px") !== -1 &&
  cssBlock8("#storyEndKicker").indexOf("font-family: var(--font-data)") !== -1 &&
  cssBlock8("#storyEndKicker").indexOf("color: var(--text-dim)") !== -1 &&
  cssBlock8(".story-end-col").indexOf("max-width: 960px") !== -1 &&
  cssBlock8("#storyEndLine2").indexOf("font-size: 16px") !== -1 &&
  cssBlock8("#storyEndLine2").indexOf("font-family: var(--font-data)") !== -1 &&
  cssBlock8(".story-end-actions").indexOf("gap: 32px") !== -1);
check("8c-3-fix ending splits the shipped line at the comma (kicker + nowrap main)",
  storyJs.indexOf('storyEl("storyEndKicker")') !== -1 &&
  storyJs.indexOf('storyEl("storyEndMain")') !== -1 &&
  storyJs.indexOf('captionText("{days} days later, {event_asset} collapsed.", data)') !== -1 &&
  storyJs.indexOf('full.indexOf(",")') !== -1 &&
  storyJs.indexOf("full.slice(0, ci + 1)") !== -1 &&
  storyJs.indexOf("full.slice(ci + 1).trim()") !== -1 &&
  storyJs.indexOf("l1.textContent = full") !== -1);
check("planted: unsplit 48 px collapse line is caught",
  cssBlock8("#storyEndMain").indexOf("white-space: nowrap") !== -1 &&
  cssBlock8(".story-end-col").indexOf("max-width: 40em") === -1 &&
  cssBlock8("#storyEndLine1").indexOf("font-size: var(--fs-48)") === -1);
check("planted: small centred ending card is caught",
  storyCss.indexOf(".story-end-card") === -1 &&
  cssBlock8("#storyEnd {").indexOf("background: rgba(7, 11, 20, 0.78)") === -1 &&
  cssBlock8(".story-end-actions").indexOf("gap: 12px") === -1);
check("8c-3 ending re-sets the shipped strings and fades 800 ms",
  storyJs.indexOf('storyEl("storyEndDate")') !== -1 &&
  storyJs.indexOf('captionText("{days} days later, {event_asset} collapsed.", data)') !== -1 &&
  storyJs.indexOf('"The data flagged it first."') !== -1 &&
  storyJs.indexOf("STORY_END_AT = 13.0") !== -1 &&
  storyJs.indexOf("duration: storyReduced() ? 0.12 : 0.8") !== -1);
check("8c-3 scrub line stays above the ending sheet",
  cssBlock8("#storyEnd {").indexOf("z-index: 20") !== -1 &&
  storyCss.indexOf("#storyBar") !== -1);

// --- phase 9a item 7: CDN/tile watchdog ---
check("9a watchdog shows the offline line in the preloader",
  indexHtml.indexOf("Could not reach the map or script hosts. Check the connection and reload.") !== -1 &&
  indexHtml.indexOf("6000") !== -1 &&
  indexHtml.indexOf('typeof maplibregl === "undefined"') !== -1 &&
  indexHtml.indexOf('typeof gsap === "undefined"') !== -1 &&
  indexHtml.indexOf('typeof THREE === "undefined"') !== -1 &&
  indexHtml.indexOf('getElementById("storyPreloader")') !== -1 &&
  indexHtml.indexOf("font-family:monospace") !== -1);
check("planted: removed watchdog text is caught",
  indexHtml.indexOf("Could not reach the map or script hosts. Check the connection and reload.") !== -1 &&
  indexHtml.replace("Could not reach the map or script hosts. Check the connection and reload.", "").indexOf("Could not reach the map or script hosts. Check the connection and reload.") === -1);

// --- phase 9b: Story II port ---
const story2Path = path.join(ROOT, "web/story2/index.html");
const story2Html = fs.existsSync(story2Path)
  ? fs.readFileSync(story2Path, "utf8") : null;
const story2HrefCount = (indexHtml.match(/href="story2\/"/g) || []).length;
const story2Urls = [];
if (story2Html) {
  for (const m of story2Html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^https?:\/\//.test(m[1])) story2Urls.push(m[1]);
  }
  const im = story2Html.match(/<script type="importmap">[\s\S]*?<\/script>/);
  if (im) {
    for (const m of im[0].matchAll(/https?:\/\/[A-Za-z0-9./@_~-]+/g)) story2Urls.push(m[0]);
  }
}
const story2Hosts = story2Urls.map((u) => u.match(/^https?:\/\/([A-Za-z0-9.-]+)/)[1]);
const story2HostsPinned = story2Hosts.length > 0 && story2Hosts.every((h) =>
  ["unpkg.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"].indexOf(h) !== -1);
function story2BareData(root) {
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".js")) {
        const rest = fs.readFileSync(p, "utf8").split("../data/").join("");
        if (rest.indexOf("data/") !== -1) bad.push(p);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  else bad.push(root);
  return bad;
}
const story2Bare = story2BareData(path.join(ROOT, "web/story2/js"));
check("9b story II is ported and wired (page exists, two entry links, pinned hosts, shared data paths)",
  story2Html !== null &&
  story2HrefCount === 2 &&
  story2HostsPinned &&
  story2Bare.length === 0);

if (failures) {
  console.log(`test_fui: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_fui: PASS");
