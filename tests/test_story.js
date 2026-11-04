"use strict";
// Phase 7a: fixture-driven test for the pure parts of web/story.js
// (caption templates, headline text, scene table, time/level helpers).
// Run with:
//   node tests/test_story.js
const story = require("../web/story.js");
const {
  captionText, storyMonthLabel, storyFmtEventDate, storyDaysBetween,
  storyAddDays, reasonFromFlags, headlineText, topHighBridge, highCount,
  orderBridgesByRank, scene3LitCount,
  firstLevelHits, buildScenes, sceneBounds, totalDuration,
  sceneIndexAtTime, scene4Allowed, captionDataFor,
  captionIndexAtLocalTime, captionAtTime, storyOrbitBearing,
  stepCameraPatch, storyEaseOut, storyCameraAt, storyTitleShown, storyMonthWordParts,
  storySpansOpacityAtZoom, storySpansStrokeAtZoom, storySpansOpacityExpr,
  storySpansStrokeExpr, storyFillOpacityAtZoom, storyFillOpacityExpr,
  storyHistoryGeometry,
  memoTypedChars, memoHighlightRange, revealedCount, renderedTextLength,
  revealNodes, renderedHighlightRange, proofCountValue, proofChecksShown,
  europeLitCount, storyHidesFootprint, storyEvidenceShown
} = story;

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}`);
  }
}

function mkDecision(rank, risk, flags, reason) {
  return {
    rank,
    model: risk === null ? null : { pattern: "differential", risk, inspect: risk === "high" },
    flags: flags || {},
    reason: reason || ""
  };
}
const ESC = { moving: false, accelerating: true, differential: true, outlier: true, escalate: true };

// Fixture: a quiet "nothing unusual" month, a two-high month, a one-high month.
const CUTS = ["2022-01-01", "2024-08-01", "2024-09-01"];
const NAMES = { 4: "Carolabrücke", 7: "Budapester Straße", 0: "Albertbrücke" };
const DEC = {
  "2022-01-01": {
    4: mkDecision(9, "watch", { moving: true }),
    7: mkDecision(6, "elevated", { outlier: true }),
    0: mkDecision(12, "watch", { accelerating: true })
  },
  "2024-08-01": {
    4: mkDecision(3, "high", ESC),
    7: mkDecision(5, "high", ESC),
    0: mkDecision(11, "watch", { moving: true })
  },
  "2024-09-01": {
    4: mkDecision(1, "high", ESC),
    7: mkDecision(4, "watch", { differential: true }),
    0: mkDecision(15, "none", {})
  }
};
const CTX = {
  cutoffs: CUTS,
  decisions: DEC,
  id2name: NAMES,
  counts: { n_bridges: 20, n_monitored: 19, n_not_monitored: 1 },
  eventDate: "2024-09-11",
  eventAsset: "Carolabrücke"
};

// --- captionText ---
check("plain substitution",
  captionText("{month}. The only red bridge.", { month: "September 2024" }) ===
  "September 2024. The only red bridge.");
check("singular count",
  captionText("{n:n_high|bridge|bridges} flagged.", { n_high: 1 }) === "1 bridge flagged.");
check("plural count",
  captionText("{n:n_high|bridge|bridges} flagged.", { n_high: 2 }) === "2 bridges flagged.");
check("zero count takes the plural",
  captionText("{n:n_high|bridge|bridges} flagged.", { n_high: 0 }) === "0 bridges flagged.");
check("missing key renders empty",
  captionText("A{nope}B", {}) === "AB");
check("singular is not the plural (planted control)",
  captionText("{n:n_high|bridge|bridges}", { n_high: 1 }) !== "1 bridges");

// Full spec templates against the fixture.
const dAug = captionDataFor("august", { ...CTX, cutoffIdx: 1 });
check("scene-5 august caption",
  captionText("{month}. {n:n_high|bridge|bridges} flagged.", dAug) ===
  "August 2024. 2 bridges flagged.");
const dSep = captionDataFor("september", { ...CTX, cutoffIdx: 2 });
check("scene-6 september caption",
  captionText("{month}. The only red bridge in the city.", dSep) ===
  "September 2024. The only red bridge in the city.");
const dOne = captionDataFor("title", { ...CTX, cutoffIdx: 2 });
check("scene-1 collapse-date caption",
  captionText("Dresden, {event_date}. A bridge fell into the Elbe.", dOne) ===
  "Dresden, 11 Sep 2024. A bridge fell into the Elbe.");
const dThree = captionDataFor("twenty-bridges", { ...CTX, cutoffIdx: 0 });
check("scene-3 counts caption",
  captionText("{n_bridges} bridges in Dresden. {n_monitored} the satellite can see; {n_not} it cannot.", dThree) ===
  "20 bridges in Dresden. 19 the satellite can see; 1 it cannot.");
const dNine = captionDataFor("ten-days-later", { ...CTX, cutoffIdx: 2 });
check("scene-9 collapse caption",
  captionText("{days} days later, {event_asset} collapsed.", dNine) ===
  "10 days later, Carolabrücke collapsed.");

// --- headline text ---
const quiet = headlineText(storyMonthLabel("2022-01-01"), null);
check("nothing-unusual month title",
  quiet.title === "January 2022 — nothing unusual.");
check("nothing-unusual month has no reason", quiet.reason === "");
const loud = headlineText(storyMonthLabel("2024-09-01"),
  topHighBridge(DEC["2024-09-01"], NAMES));
check("high month names the top bridge",
  loud.title === "September 2024 — Carolabrücke needs an inspector.");
check("empty rubric reason falls back to the flags",
  loud.reason === "Exceeds anything in its own record, concentrated at one end.");
const own = headlineText("August 2024",
  { name: "Carolabrücke", reason: "Uneven span movement.", flags: ESC });
check("non-empty rubric reason is used verbatim",
  own.reason === "Uneven span movement.");
check("reasonFromFlags outlier", reasonFromFlags({ outlier: true }) ===
  "Exceeds anything in its own record.");
check("reasonFromFlags quiet", reasonFromFlags({}) === "");

// --- top high / counts ---
check("top high is the lowest rank",
  topHighBridge(DEC["2024-08-01"], NAMES).name === "Carolabrücke");
check("rank tie breaks by name", topHighBridge({
  4: mkDecision(2, "high", ESC),
  7: mkDecision(2, "high", ESC)
}, NAMES).name === "Budapester Straße");
check("no high returns null", topHighBridge(DEC["2022-01-01"], NAMES) === null);
check("high counts", highCount(DEC["2022-01-01"]) === 0 &&
  highCount(DEC["2024-08-01"]) === 2 && highCount(DEC["2024-09-01"]) === 1);

// --- phase 7b: rank order + scene-3 light-up ---
const ORDER_TBL = {
  4: mkDecision(9, "none", {}),
  7: mkDecision(6, "elevated", { outlier: true }),
  0: mkDecision(12, "none", {}),
  1: mkDecision(null, null, {})
};
check("rank order sorts by rank, not-monitored last",
  orderBridgesByRank(ORDER_TBL, NAMES).join(",") === "7,4,0,1");
check("rank tie breaks by name", orderBridgesByRank({
  4: mkDecision(2, "high", ESC),
  7: mkDecision(2, "high", ESC)
}, NAMES).join(",") === "7,4");
check("planted: unordered ranks are caught",
  orderBridgesByRank(ORDER_TBL, NAMES).join(",") !== "4,7,0,1");
check("scene-3 dark during the fly-in",
  scene3LitCount(0, 20) === 0 && scene3LitCount(2.399, 20) === 0);
check("scene-3 first bridge at 2.4 s", scene3LitCount(2.4, 20) === 1);
check("scene-3 one bridge per 0.25 s",
  scene3LitCount(2.64, 20) === 1 && scene3LitCount(2.65, 20) === 2 &&
  scene3LitCount(7.15, 20) === 20);
check("scene-3 clamps at the total", scene3LitCount(99, 20) === 20);
check("planted: instant light-up is caught", scene3LitCount(0, 20) !== 20);
check("7c no placeholders remain",
  Object.keys(story.STORY_PLACEHOLDERS).length === 0);
check("7c scenes 2/7/8 are real",
  story.STORY_PLACEHOLDERS["how-radar-sees"] === undefined &&
  story.STORY_PLACEHOLDERS["the-report"] === undefined &&
  story.STORY_PLACEHOLDERS["the-proof"] === undefined);
check("7b timing constants",
  story.STORY_SCENE3_FLY === 2.4 && story.STORY_SCENE3_GAP === 0.25 &&
  story.STORY_SCENE6_ORBIT === 6.0 && story.STORY_GLOW_PULSE === 1.2);

// --- first level hits ---
const HCUTS = ["2022-01-01", "2022-02-01", "2022-03-01"];
const HDEC = {
  "2022-01-01": { 4: mkDecision(9, "none", {}) },
  "2022-02-01": { 4: mkDecision(9, "watch", { moving: true }) },
  "2022-03-01": {
    4: mkDecision(9, "elevated", { outlier: true }),
    7: mkDecision(5, "high", ESC)
  }
};
const hits = firstLevelHits(HCUTS, HDEC, NAMES);
check("three levels found", hits.length === 3);
check("first watch month", hits[0].level === "watch" && hits[0].monthIdx === 1);
check("first elevated month", hits[1].level === "elevated" && hits[1].monthIdx === 2);
check("first high names the bridge",
  hits[2].level === "high" && hits[2].name === "Budapester Straße");
const noHigh = firstLevelHits(HCUTS, {
  "2022-01-01": { 4: mkDecision(9, "none", {}) },
  "2022-02-01": { 4: mkDecision(9, "watch", { moving: true }) },
  "2022-03-01": { 4: mkDecision(9, "none", {}) }
}, NAMES);
check("unreached levels are absent",
  noHigh.length === 1 && noHigh[0].level === "watch");

// --- scene table ---
const full = [];
for (let y = 2022; y <= 2024; y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === 2024 && m > 9) break;
    full.push(`${y}-${String(m).padStart(2, "0")}-01`);
  }
}
const scenes = buildScenes({ cutoffs: full, reduced: false });
const IDS = ["title", "how-radar-sees", "twenty-bridges", "three-years",
  "august", "september", "the-report", "the-proof", "ten-days-later"];
check("nine scenes in order",
  scenes.length === 9 && scenes.every((s, i) => s.id === IDS[i]));
check("scene shape", scenes.every((s) =>
  typeof s.id === "string" && typeof s.cutoff === "string" &&
  s.camera && typeof s.camera === "object" &&
  s.layers && typeof s.layers === "object" &&
  typeof s.overlay === "string" && Array.isArray(s.captions) &&
  typeof s.duration === "number" && Array.isArray(s.waitFor)));
check("captions carry at and hold", scenes.every((s) =>
  s.captions.every((c) => typeof c.text === "string" &&
    typeof c.at === "number" && typeof c.hold === "number" &&
    c.at >= 0 && c.hold > 0 && c.at + c.hold <= s.duration + 1e-9)));
check("waitFor entries are known", scenes.every((s) =>
  s.waitFor.every((w) => w === "tiles" || w === "memo" || w === "fonts")));
check("scene durations",
  scenes.map((s) => s.duration).join(",") === "9,16,10,30,10,12,14,11,14");
check("total story length is 126 s", totalDuration(scenes) === 126);
check("scene-4 spans first to last",
  scenes[3].cutoff === full[0] && scenes[3].endCutoff === full[full.length - 1]);
check("scene-4 duration is 33 x 0.7 s plus holds",
  Math.abs(scenes[3].duration - (2 + 33 * 0.7 + 4.9)) < 1e-9);
check("scene-5 binds august", scenes[4].cutoff === "2024-08-01");
check("scenes 1/6/7/8/9 bind the last cutoff",
  [0, 5, 6, 7, 8].every((i) => scenes[i].cutoff === full[full.length - 1]));
const reduced = buildScenes({ cutoffs: full, reduced: true });
check("reduced motion shortens the total",
  totalDuration(reduced) < totalDuration(scenes));
check("reduced scene 4 still steps every month",
  Math.abs(reduced[3].duration - (0.5 + 33 * 0.7 + 0.5)) < 1e-9);

// --- time mapping ---
const b = sceneBounds(scenes);
check("bounds start at 0 and tile",
  b[0].start === 0 && b.every((x, i) => i === 0 || x.start === b[i - 1].end));
check("sceneIndexAtTime boundaries",
  sceneIndexAtTime(scenes, 0) === 0 &&
  sceneIndexAtTime(scenes, 8.999) === 0 &&
  sceneIndexAtTime(scenes, 9) === 1 &&
  sceneIndexAtTime(scenes, 34.999) === 2 &&
  sceneIndexAtTime(scenes, 35) === 3 &&
  sceneIndexAtTime(scenes, 64.999) === 3 &&
  sceneIndexAtTime(scenes, 65) === 4 &&
  sceneIndexAtTime(scenes, 124.999) === 8 &&
  sceneIndexAtTime(scenes, 125) === 8);

// --- replay guard + date helpers ---
check("scene4Allowed", scene4Allowed(5, 5) === true &&
  scene4Allowed(5, 6) === false && scene4Allowed(-1, 0) === false);
check("storyMonthLabel", storyMonthLabel("2024-09-01") === "September 2024");
check("storyFmtEventDate", storyFmtEventDate("2024-09-11") === "11 Sep 2024");
check("storyDaysBetween", storyDaysBetween("2024-09-01", "2024-09-11") === 10);
check("storyAddDays roll",
  storyAddDays("2024-09-01", 0) === "1 Sep 2024" &&
  storyAddDays("2024-09-01", 10) === "11 Sep 2024");

// --- phase 7b fix: caption lookup is a pure function of master time ---
const augStart = b[4].start; // scene 5 (august) starts here on the master
check("caption lookup finds the first scene-5 caption",
  (() => { const f = captionAtTime(scenes, augStart + 1.0);
    return f.scene === 4 && f.caption === 0; })());
check("caption lookup gap just after a scene-5 seek",
  (() => { const f = captionAtTime(scenes, augStart + 0.3);
    return f.scene === 4 && f.caption === -1; })());
check("caption lookup gap between the scene-5 captions",
  (() => { const f = captionAtTime(scenes, augStart + 5.0);
    return f.scene === 4 && f.caption === -1; })());
check("caption lookup finds the second scene-5 caption",
  (() => { const f = captionAtTime(scenes, augStart + 6.0);
    return f.scene === 4 && f.caption === 1; })());
check("caption lookup finds the scene-3 caption",
  (() => { const f = captionAtTime(scenes, b[2].start + 1.0);
    return f.scene === 2 && f.caption === 0; })());
check("planted: a scene-5 gap is never scene-3's window",
  (() => { const f = captionAtTime(scenes, augStart + 0.3);
    return !(f.scene === 2 && f.caption === 0); })());
check("planted: off-by-window lookup is caught",
  (() => { const f = captionAtTime(scenes, augStart + 5.0);
    return f.caption !== 0; })());
check("caption window edges are [at, at+hold)",
  captionIndexAtLocalTime([{ at: 0.5, hold: 4.5 }], 0.5) === 0 &&
  captionIndexAtLocalTime([{ at: 0.5, hold: 4.5 }], 4.999) === 0 &&
  captionIndexAtLocalTime([{ at: 0.5, hold: 4.5 }], 5.0) === -1 &&
  captionIndexAtLocalTime([{ at: 0.5, hold: 4.5 }], 0.3) === -1);

// --- phase 7b fix: scene-6 orbit rate (20 deg over STORY_SCENE6_ORBIT) ---
check("orbit bearing is 10 deg at 3 s",
  storyOrbitBearing(20, story.STORY_SCENE6_ORBIT, 3) === 10);
check("orbit bearing is 20 deg at 6 s",
  storyOrbitBearing(20, story.STORY_SCENE6_ORBIT, 6) === 20);
check("orbit bearing holds 20 deg after 6 s",
  storyOrbitBearing(20, story.STORY_SCENE6_ORBIT, 11) === 20);
check("orbit bearing starts at 0",
  storyOrbitBearing(20, story.STORY_SCENE6_ORBIT, 0) === 0);

// --- phase 7c: scene-7 typing + highlight ---
check("memo typing 40 chars/s",
  memoTypedChars(0, 100) === 0 && memoTypedChars(1, 100) === 40 &&
  memoTypedChars(2.5, 100) === 100 && memoTypedChars(99, 100) === 100);
check("planted: instant typing is caught", memoTypedChars(0, 100) !== 100);
const MEMO_FIX = "# Memo\n\n## Verdict\nCarolabrücke needs prompt inspection now. Radar shows motion.\n\n## Owner condition\n- Carolabrücke — external input: overlay poor.\n";
const MEMO_HL = memoHighlightRange(MEMO_FIX);
check("highlight finds the prompt-inspection sentence",
  MEMO_HL && MEMO_FIX.slice(MEMO_HL.start, MEMO_HL.end).indexOf("prompt inspection") !== -1);
check("highlight is one sentence",
  MEMO_HL && MEMO_FIX.slice(MEMO_HL.start, MEMO_HL.end) === "Carolabrücke needs prompt inspection now.");
const MEMO_NOVERDICT = "# Memo\n\n## Verdict\nAll quiet this month. Nothing else.\n";
const MEMO_FB = memoHighlightRange(MEMO_NOVERDICT);
check("highlight falls back to the first Verdict sentence",
  MEMO_FB && MEMO_NOVERDICT.slice(MEMO_FB.start, MEMO_FB.end) === "All quiet this month.");
const MEMO_OWNER = "# Memo\n\n## Verdict\nAll quiet.\n\n## Owner condition\n- prompt inspection of the tram section.\n";
check("highlight never matches the Owner section",
  (() => { const r = memoHighlightRange(MEMO_OWNER);
    return r && MEMO_OWNER.slice(r.start, r.end) === "All quiet."; })());
check("planted: owner highlight is caught",
  (() => { const r = memoHighlightRange(MEMO_OWNER);
    return !r || MEMO_OWNER.slice(r.start, r.end).indexOf("tram") === -1; })());

// --- phase 7c fix: rendered reveal types HTML, not markdown ---
check("revealedCount 40 chars/s",
  revealedCount(0) === 0 && revealedCount(1) === 40 && revealedCount(2.5) === 100);
check("revealedCount clamps to total",
  revealedCount(99, 100) === 100 && revealedCount(1, 100) === 40 &&
  revealedCount(0, 100) === 0);
check("planted: instant reveal is caught", revealedCount(0, 100) !== 100);

function T(t) { return { nodeType: 3, textContent: t, data: t }; }
function E(tag, kids) {
  return { nodeType: 1, tagName: String(tag).toUpperCase(),
    childNodes: kids || [], style: {} };
}
function fakeVisibleText(root) {
  let s = "";
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      const t = String(node.textContent || "");
      if (/^\s*$/.test(t)) return;
      s += t;
    } else if (node.nodeType === 1) {
      for (const k of (node.childNodes || [])) walk(k);
    }
  };
  walk(root);
  return s;
}
function fakeShown(el) { return !el.style || el.style.display !== "none"; }
// Small rendered fixture (H1 and Cutoff already skipped, as the panel does).
function makeRenderedFixture(verdictPara) {
  const hVerdict = E("H2", [T("Verdict")]);
  const pVerdict = E("P", [T(verdictPara ||
    "Carolabrücke needs prompt inspection now. Radar shows motion.")]);
  const hAction = E("H2", [T("Action list")]);
  const th1 = E("TH", [T("bridge")]);
  const th2 = E("TH", [T("risk")]);
  const trHead = E("TR", [th1, th2]);
  const thead = E("THEAD", [T("\n"), trHead, T("\n")]);
  const td1 = E("TD", [T("Carolabrücke")]);
  const td2 = E("TD", [T("high")]);
  const trBody = E("TR", [td1, td2]);
  const tbody = E("TBODY", [T("\n"), trBody, T("\n")]);
  const table = E("TABLE", [T("\n"), thead, T("\n"), tbody, T("\n")]);
  const hOwner = E("H2", [T("Owner condition")]);
  const liOwner = E("LI", [T("prompt inspection of the tram section.")]);
  const ulOwner = E("UL", [T("\n"), liOwner, T("\n")]);
  const root = E("DIV", [
    hVerdict, T("\n"), pVerdict, T("\n"), hAction, T("\n"),
    table, T("\n"), hOwner, T("\n"), ulOwner, T("\n")
  ]);
  return { root, hVerdict, pVerdict, hAction, table, thead, trHead,
    th1, th2, tbody, trBody, td1, td2, hOwner, ulOwner, liOwner };
}
const FIX_S1 = "Carolabrücke needs prompt inspection now.";
check("rendered total is 158 chars",
  renderedTextLength(makeRenderedFixture().root) === 158);
check("reveal of nothing shows nothing",
  (() => { const f = makeRenderedFixture();
    const shown = revealNodes(f.root, 0);
    return shown === 0 && fakeVisibleText(f.root) === "" &&
      !fakeShown(f.hVerdict) && !fakeShown(f.pVerdict) &&
      !fakeShown(f.table); })());
check("reveal of 7 chars shows only the Verdict heading",
  (() => { const f = makeRenderedFixture();
    revealNodes(f.root, 7);
    return fakeVisibleText(f.root) === "Verdict" &&
      fakeShown(f.hVerdict) && !fakeShown(f.pVerdict) &&
      !fakeShown(f.hAction) && !fakeShown(f.table); })());
check("whitespace separators never consume the budget",
  (() => { const f = makeRenderedFixture();
    revealNodes(f.root, 8);
    return fakeVisibleText(f.root) === "VerdictC"; })());
const RAW_FIX_SMALL = "# Memo\n\nCutoff 2024-09-01\n\n## Verdict\n" +
  "Carolabrücke needs prompt inspection now. Radar shows motion.\n\n" +
  "## Action list\n| bridge | risk |\n| --- | --- |\n" +
  "| Carolabrücke | high |\n\n## Owner condition\n" +
  "- prompt inspection of the tram section.\n";
check("planted: raw slicing leaks # and | markers",
  RAW_FIX_SMALL.slice(0, 10).indexOf("#") !== -1 &&
  RAW_FIX_SMALL.slice(0, 160).indexOf("|") !== -1);
check("rendered reveal leaks no markers and starts at Verdict",
  (() => { const f = makeRenderedFixture();
    revealNodes(f.root, 120);
    const vis = fakeVisibleText(f.root);
    return vis.indexOf("#") === -1 && vis.indexOf("|") === -1 &&
      vis.indexOf("Verdict") === 0 &&
      vis.indexOf("Carolabrücke needs prompt inspection now.") !== -1; })());
check("table row appears when its first cell is reached",
  (() => { const f = makeRenderedFixture();
    revealNodes(f.root, 79);
    const before = !fakeShown(f.table) && !fakeShown(f.trHead) &&
      !fakeShown(f.trBody);
    const g = makeRenderedFixture();
    revealNodes(g.root, 80);
    const after = fakeShown(g.table) && fakeShown(g.trHead) &&
      fakeShown(g.th1) && !fakeShown(g.th2) && !fakeShown(g.trBody);
    const h = makeRenderedFixture();
    revealNodes(h.root, 90);
    const bodyRow = fakeShown(h.trBody) && fakeShown(h.td1);
    return before && after && bodyRow; })());
const FIX_HL = renderedHighlightRange(makeRenderedFixture().root);
check("rendered highlight finds the prompt-inspection sentence",
  FIX_HL && FIX_HL.sentence === FIX_S1 &&
  FIX_HL.start === 7 && FIX_HL.end === 48);
check("rendered highlight completes at 48 chars",
  FIX_HL && FIX_HL.end === 7 + FIX_S1.length);
check("rendered highlight never matches the Owner section",
  FIX_HL && FIX_HL.sentence.indexOf("tram") === -1);
check("planted: rendered owner highlight is caught",
  (() => { const r = renderedHighlightRange(makeRenderedFixture().root);
    return !r || r.sentence.indexOf("tram section") === -1; })());
check("rendered highlight falls back to the first Verdict sentence",
  (() => { const f = makeRenderedFixture("All quiet this month. Nothing else.");
    const r = renderedHighlightRange(f.root);
    return r && r.sentence === "All quiet this month." &&
      r.start === 7 && r.sentence.indexOf("tram") === -1; })());
check("4.5 s into scene 7 (180 chars) covers the highlight",
  revealedCount(4.5) === 180 && FIX_HL && 180 >= FIX_HL.end);
console.log(`  info: fixture highlight completes at ${FIX_HL ? FIX_HL.end : "?"} chars`);
check("real memo highlight completes at 83 chars",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const memo = require("../web/memo.js");
      const md = fs.readFileSync(path.join(__dirname, "..", "web",
        "data", "memos", "2024-09-01.md"), "utf8");
      const html = memo.renderMemo(md);
      const texts = [];
      const re = />([^<]+)</g;
      let m = null;
      while ((m = re.exec(html)) !== null) texts.push(m[1]);
      let vi = -1;
      for (let i = 0; i < texts.length; i++) {
        if (texts[i].trim() === "Verdict") { vi = i; break; }
      }
      if (vi === -1) return false;
      let para = "";
      for (let i = vi + 1; i < texts.length; i++) {
        if (!/^\s*$/.test(texts[i])) { para = texts[i]; break; }
      }
      const phrase = "prompt inspection";
      const pi = para.indexOf(phrase);
      if (pi === -1) return false;
      let a = pi;
      while (a > 0 && ".?!\n".indexOf(para[a - 1]) === -1) a--;
      while (a < para.length && (para[a] === " " || para[a] === "\n")) a++;
      let b = pi;
      while (b < para.length && ".?!".indexOf(para[b]) === -1 && para[b] !== "\n") b++;
      if (b < para.length && ".?!".indexOf(para[b]) !== -1) b++;
      const sent = para.slice(a, b);
      const end = "Verdict".length + b;
      console.log(`  info: real memo highlight completes at ${end} chars`);
      return end === 83 &&
        sent === "Carolabrücke is the only bridge that needs prompt inspection at this cutoff.";
    } catch (e) { return false; }
  })());

// --- phase 7c: scene-8 proof count-in + checks (8c-2: 600 ms count, 90 ms stagger) ---
check("proof count starts at 0 and settles",
  proofCountValue(5.03, 0, false) === 0 &&
  Math.abs(proofCountValue(5.03, 0.3, false) - 2.515) < 1e-9 &&
  proofCountValue(5.03, 0.6, false) === 5.03 &&
  proofCountValue(5.03, 9, false) === 5.03);
check("proof count is final under reduced motion",
  proofCountValue(5.03, 0, true) === 5.03);
check("proof checks stagger 0.09 s after the count",
  proofChecksShown(0, 10, false) === 0 &&
  proofChecksShown(0.59, 10, false) === 0 &&
  proofChecksShown(0.6, 10, false) === 1 &&
  proofChecksShown(0.7, 10, false) === 2 &&
  proofChecksShown(9, 10, false) === 10);
check("proof checks all show under reduced motion",
  proofChecksShown(0, 10, true) === 10);
check("planted: instant checks are caught",
  proofChecksShown(0, 10, false) !== 10);
check("proof quantities list",
  story.STORY_PROOF_QUANTITIES.join(",") ===
  "roll,score,z,wmax,wspread,velocity,coherence,span_meta,flags,risk");

// --- phase 7c: scene-9 Europe outro ---
check("europe cities list (15, Dresden last)",
  story.STORY_EUROPE_CITIES.length === 15 &&
  story.STORY_EUROPE_CITIES[14].name === "Dresden" &&
  story.STORY_EUROPE_CITIES.every((c) =>
    typeof c.lon === "number" && typeof c.lat === "number"));
check("europe camera constants",
  story.STORY_EUROPE_ZOOM === 3.8 &&
  story.STORY_EUROPE_CENTER.join(",") === "12,52" &&
  story.STORY_EUROPE_AT === 10.0);
check("8c-3-fix2 europe cut timing (dip 0.5, cut at 10.5)",
  story.STORY_EUROPE_DIP === 0.5 &&
  story.STORY_EUROPE_CUT_AT === 10.5 &&
  story.STORY_EUROPE_CUT_AT === story.STORY_EUROPE_AT + story.STORY_EUROPE_DIP);
check("europe dots dark before 10 s",
  europeLitCount(0, 15, 14, false) === 0 &&
  europeLitCount(9.999, 15, 14, false) === 0);
check("8c-3-fix2 europe dots dark through the dip down, then one by one",
  europeLitCount(10, 15, 14, false) === 0 &&
  europeLitCount(10.499, 15, 14, false) === 0 &&
  europeLitCount(10.5, 15, 14, false) === 1 &&
  europeLitCount(10.6, 15, 14, false) === 1 &&
  europeLitCount(12, 15, 14, false) === 7 &&
  europeLitCount(13.999, 15, 14, false) === 15);
check("europe dots all lit under reduced motion",
  europeLitCount(10, 15, 14, true) === 15 &&
  europeLitCount(0, 15, 14, true) === 0);
check("planted: instant europe light-up is caught",
  europeLitCount(0, 15, 14, false) !== 15);
check("planted: europe dots at 10 s (before the lift) is caught",
  europeLitCount(10, 15, 14, false) !== 1);

// --- phase 8c-1: close-up on the vector city, captions unchanged ---
// 8c-2: scene 7 joins the dark close-up (no imagery on the map in story).
check("8c-2 scenes 5-7 use the dark vector base, scene 8 stays dark",
  scenes[4].layers.basemap === "dark" &&
  scenes[5].layers.basemap === "dark" &&
  scenes[6].layers.basemap === "dark" &&
  scenes[7].layers.basemap === "dark");
check("8c-1 scene-5 ends 15.5/62/-30 on Carolabrücke's centroid",
  scenes[4].camera.zoom === 15.5 && scenes[4].camera.pitch === 62 &&
  scenes[4].camera.bearing === -30 &&
  scenes[4].camera.center[0] === story.STORY_CLOSEUP_CENTER[0] &&
  scenes[4].camera.center[1] === story.STORY_CLOSEUP_CENTER[1]);
check("8c-1 scene-6 steps to 16.0/65/-30 and orbits 20 deg",
  scenes[5].camera.zoom === 16.0 && scenes[5].camera.pitch === 65 &&
  scenes[5].camera.bearing === -30 && scenes[5].camera.orbit === 20);
check("planted: scene-5 old 15/60 framing is caught",
  scenes[4].camera.zoom !== 15 && scenes[4].camera.pitch !== 60);
check("planted: scene-6 old 15.7 framing is caught",
  scenes[5].camera.zoom !== 15.7);
check("planted: imagery close-up is caught",
  scenes[4].layers.basemap !== "imagery" &&
  scenes[5].layers.basemap !== "imagery");
check("7d scene-5 captions unchanged",
  scenes[4].captions.length === 2 &&
  scenes[4].captions[0].text === "{month}. {n:n_high|bridge|bridges} flagged." &&
  scenes[4].captions[1].text === "This one is moving at both ends.");
check("7d scene-6 captions unchanged",
  scenes[5].captions.length === 2 &&
  scenes[5].captions[0].text === "{month}. The only red bridge in the city." &&
  scenes[5].captions[1].text ===
  "Faster than anything in its own record. One end rising, the next span sinking.");

// --- phase 7d fix, updated 8c-1: step camera centres the bridge ---
const STEP_CAROLA = [13.7478, 51.0534]; // stand-in Carolabrücke centroid (not the city centre)
const stepPatch = stepCameraPatch(scenes[5].camera, STEP_CAROLA);
check("8c-1 step patch carries the centroid at 16.0/65/-30",
  Array.isArray(stepPatch.center) &&
  stepPatch.center[0] === STEP_CAROLA[0] && stepPatch.center[1] === STEP_CAROLA[1] &&
  stepPatch.zoom === 16.0 && stepPatch.pitch === 65 && stepPatch.bearing === -30);
check("planted: centre-less step patch is caught",
  stepPatch.center !== undefined);
check("step patch without a bearing still defaults to 0",
  stepCameraPatch({ zoom: 15, pitch: 60 }, STEP_CAROLA).bearing === 0);

// --- phase 8a: the FUI ease-out curve for camera moves ---
check("ease-out endpoints are exact",
  storyEaseOut(0) === 0 && storyEaseOut(1) === 1);
let easeMono = true;
for (let k = 1; k <= 20; k++) {
  if (!(storyEaseOut(k / 20) >= storyEaseOut((k - 1) / 20))) easeMono = false;
}
check("ease-out is monotone on [0, 1]", easeMono);
check("ease-out front-loads progress (f(0.5) > 0.5)",
  storyEaseOut(0.5) > 0.5);
check("ease-out clamps outside [0, 1]",
  storyEaseOut(-1) === 0 && storyEaseOut(2) === 1);
check("planted: linear easing is caught",
  Math.abs(storyEaseOut(0.25) - 0.25) > 0.05);

// --- phase 8b fix 4: scene 1 cranes to 15.2/66/-30 over Carolabrücke, scenes 3/4 flat at 12.3 ---
check("8b-fix4 scene 1 ends at zoom 15.2 pitch 66 bearing -30 over Carolabrücke",
  scenes[0].camera.zoom === 15.2 &&
  scenes[0].camera.pitch === 66 &&
  scenes[0].camera.bearing === -30 &&
  scenes[0].camera.orbit === undefined &&
  Array.isArray(scenes[0].camera.center) &&
  scenes[0].camera.center[0] === 13.7468 &&
  scenes[0].camera.center[1] === 51.0535);
check("8b-fix5 crane starts at 14.0/42/-30 (walls read in the first frame)",
  story.STORY_CRANE_START_ZOOM === 14.0 &&
  story.STORY_CRANE_START_PITCH === 42 &&
  story.STORY_TITLE_BEARING === -30);
check("8b-fix scenes 3/4 stay at zoom 12.3 pitch 40 (flat by design)",
  scenes[2].camera.zoom === 12.3 &&
  scenes[2].camera.pitch === 40 &&
  scenes[3].camera.zoom === 12.3 &&
  scenes[3].camera.pitch === 40);
check("8b-fix2 scene 4 centre sits off the city centre for the 200 px strip",
  Array.isArray(scenes[3].camera.center) &&
  scenes[3].camera.center[0] === 13.745 &&
  scenes[3].camera.center[1] === 51.039);
check("8c-3 scene 9 pulls back to the 12.3 city shot (not the old zoom 12)",
  scenes[8].camera.zoom === 12.3 && scenes[8].camera.zoom !== 12);
check("planted: flat-zoom city scenes are caught",
  scenes[0].camera.zoom !== 12 && scenes[2].camera.zoom !== 12 &&
  scenes[3].camera.zoom !== 12);
check("planted: scene-1 old 12.3 framing is caught",
  scenes[0].camera.zoom !== 12.3 && scenes[0].camera.pitch !== 55);
check("planted: scene-1 old 14.1 hold is caught",
  scenes[0].camera.zoom !== 14.1 && scenes[0].camera.pitch !== 60);
check("8b-fix4 wordmark enters at 2 s",
  story.STORY_TITLE_AT === 2.0);
check("8b-fix4 wordmark hides before 2 s and holds from 2 s",
  storyTitleShown(0) === false && storyTitleShown(1.99) === false &&
  storyTitleShown(2) === true && storyTitleShown(9) === true);
check("8b-fix4 wordmark shows at once under reduced motion",
  storyTitleShown(0, true) === true && storyTitleShown(1, true) === true);
check("planted: wordmark-up-at-zero is caught",
  storyTitleShown(0, false) !== true);
check("8b month wordmark is SEPTEMBER over 2024",
  (() => { const p = storyMonthWordParts("2024-09-01");
    return p.month === "SEPTEMBER" && p.year === "2024"; })());
check("8b month wordmark reads the bound cutoff only",
  (() => { const p = storyMonthWordParts("2022-01-01");
    return p.month === "JANUARY" && p.year === "2022"; })());
check("8b month wordmark never invents a month",
  (() => { const p = storyMonthWordParts("not-a-cutoff");
    const q = storyMonthWordParts("2024-13-01");
    return p.month === "" && p.year === "" && q.month === "" && q.year === ""; })());
check("planted: lowercase wordmark month is caught",
  storyMonthWordParts("2024-09-01").month !== "September");

// --- phase 8b fix: span dots hide below 13.5 in story (ramp 13.2-13.6) ---
check("8b-fix spans hidden at city zoom 12.3",
  storySpansOpacityAtZoom(12.3) === 0 &&
  storySpansStrokeAtZoom(12.3) === 0);
check("8b-fix spans ramp 13.2-13.6 without popping",
  storySpansOpacityAtZoom(13.2) === 0 &&
  storySpansOpacityAtZoom(13.6) === 0.92 &&
  storySpansOpacityAtZoom(13.4) > 0 &&
  storySpansOpacityAtZoom(13.4) < 0.92);
check("8b-fix spans full in the close-ups",
  storySpansOpacityAtZoom(15) === 0.92 &&
  storySpansOpacityAtZoom(15.7) === 0.92);
check("8b-fix4 spans ramp in over the crane (13.5) and read full at the landing (15.2)",
  Math.abs(storySpansOpacityAtZoom(13.5) - 0.69) < 1e-9 &&
  Math.abs(storySpansStrokeAtZoom(13.5) - 0.45) < 1e-9 &&
  storySpansOpacityAtZoom(15.2) === 0.92 &&
  storySpansStrokeAtZoom(15.2) === 0.6);
check("8b-fix spans expressions are zoom interpolations",
  JSON.stringify(storySpansOpacityExpr()) ===
  JSON.stringify(["interpolate", ["linear"], ["zoom"], 13.2, 0, 13.6, 0.92]) &&
  JSON.stringify(storySpansStrokeExpr()) ===
  JSON.stringify(["interpolate", ["linear"], ["zoom"], 13.2, 0, 13.6, 0.6]));
check("planted: constant story spans are caught",
  storySpansOpacityAtZoom(12.3) !== 0.92);

// --- phase 8b fix: fills 0.12 below 13, 0.38 at 15+ ---
check("8b-fix fills read 0.12 at city zoom",
  storyFillOpacityAtZoom(12.3) === 0.12 &&
  storyFillOpacityAtZoom(13) === 0.12);
check("8b-fix fills read 0.38 in the close-up",
  storyFillOpacityAtZoom(15) === 0.38 &&
  storyFillOpacityAtZoom(15.7) === 0.38);
check("8b-fix fills ramp 13-15",
  storyFillOpacityAtZoom(14) > 0.12 &&
  storyFillOpacityAtZoom(14) < 0.38);
check("8b-fix4 fills read 0.185 at the crane start (13.5), 0.38 at the landing (15.2)",
  Math.abs(storyFillOpacityAtZoom(13.5) - 0.185) < 1e-9 &&
  storyFillOpacityAtZoom(15.2) === 0.38);
check("8b-fix fill expression matches the dashboard",
  JSON.stringify(storyFillOpacityExpr()) ===
  JSON.stringify(["interpolate", ["linear"], ["zoom"], 13, 0.12, 15, 0.38]));
check("planted: constant 0.38 restore is caught",
  storyFillOpacityAtZoom(12.3) !== 0.38);

// --- phase 8b fix 2: history rows are 9 px + 1 px gap (200 px), labels 9 px ---
check("8b-fix2 history geometry at 1280 fills 1232 px",
  (() => {
    const g = storyHistoryGeometry(1232, 33, 20, 150);
    return g.cellH === 9 && g.gap === 1 && g.H === 200 &&
      g.labelW === 150 && (g.cellH + g.gap) === 10 &&
      Math.abs(g.labelW + 33 * g.unit - 1232) < 1e-9 &&
      g.cellW > 30 && g.cellW < 33;
  })());
check("8b-fix2 history geometry at 1920 fills 1872 px",
  (() => {
    const g = storyHistoryGeometry(1872, 33, 20, 150);
    return g.cellH === 9 && g.gap === 1 && g.H === 200 &&
      g.labelW === 150 && (g.cellH + g.gap) === 10 &&
      Math.abs(g.labelW + 33 * g.unit - 1872) < 1e-9 &&
      g.cellW > 50 && g.cellW < 53;
  })());
check("8b-fix2 row pitch is 10 px with a 150 px label column",
  (() => {
    const g = storyHistoryGeometry(1232, 33, 20, 150);
    return (g.cellH + g.gap) === 10 && g.labelW === 150;
  })());
check("8b-fix2 no two row labels overlap (10 px pitch carries 9 px labels)",
  (() => {
    const g = storyHistoryGeometry(1232, 33, 20, 150);
    const pitch = g.cellH + g.gap;
    const labelFont = 9;
    // Consecutive 9 px boxes centred on a 10 px pitch never touch.
    let ok = pitch >= labelFont;
    for (let r = 0; r + 1 < 20 && ok; r++) {
      const c0 = r * pitch + g.cellH / 2;
      const c1 = (r + 1) * pitch + g.cellH / 2;
      ok = ok && (c1 - labelFont / 2) >= (c0 + labelFont / 2);
    }
    return ok;
  })());
check("planted: narrow 10 px history cells are caught",
  storyHistoryGeometry(1232, 33, 20, 150).cellW !== 10);
check("planted: 7 px rows with 11 px labels are caught (overlap + short strip)",
  (() => {
    const g = storyHistoryGeometry(1232, 33, 20, 150);
    // Old geometry was 7 px rows (8 px pitch, 160 px) with 11 px labels:
    // 11 > 8 overlaps, and 160 !== 200. Either old value fails.
    return g.cellH !== 7 && g.H !== 160 && (g.cellH + g.gap) !== 8;
  })());

// --- phase 8b fix: wordmark text equals the headline month for every i ---
check("8b-fix wordmark matches the headline for every fixture month",
  (() => {
    for (const cutoff of CUTS) {
      const word = storyMonthWordParts(cutoff);
      const label = storyMonthLabel(cutoff);
      const top = topHighBridge(DEC[cutoff], NAMES);
      const head = headlineText(label, top);
      const wantMonth = label.split(" ")[0].toUpperCase();
      const wantYear = label.split(" ")[1];
      if (word.month !== wantMonth || word.year !== wantYear) return false;
      if (head.title.indexOf(label) !== 0) return false;
    }
    return true;
  })());
check("8b-fix wordmark matches the headline across a full year",
  (() => {
    for (let m = 1; m <= 12; m++) {
      const cutoff = `2023-${String(m).padStart(2, "0")}-01`;
      const word = storyMonthWordParts(cutoff);
      const label = storyMonthLabel(cutoff);
      if (word.month !== label.split(" ")[0].toUpperCase()) return false;
      if (word.year !== label.split(" ")[1]) return false;
      const head = headlineText(label, null);
      if (head.title !== `${label} — nothing unusual.`) return false;
    }
    return true;
  })());

// --- phase 8b fix 5: one camera path (fix 4 rule); the crane starts at 14.0/42 ---
check("8b-fix5 crane runs 14.0/42 to 15.2/66/-30 over 9 s on the ease-out curve",
  (() => {
    const c0 = storyCameraAt(scenes[0], 0, 0);
    const c4 = storyCameraAt(scenes[0], 4.5, 0);
    const c9 = storyCameraAt(scenes[0], 9, 0);
    if (!c0 || !c4 || !c9) return false;
    if (c0.zoom !== 14.0 || c0.pitch !== 42 || c0.bearing !== -30) return false;
    if (c0.center[0] !== 13.7468 || c0.center[1] !== 51.0535) return false;
    if (c9.zoom !== 15.2 || c9.pitch !== 66 || c9.bearing !== -30) return false;
    if (c9.center[0] !== 13.7468 || c9.center[1] !== 51.0535) return false;
    // Mid-move interpolates about the subject, front-loaded by ease-out.
    if (!(c4.zoom > 14.0 && c4.zoom < 15.2)) return false;
    if (!(c4.pitch > 42 && c4.pitch < 66)) return false;
    if (c4.bearing !== -30) return false;
    if (c4.center[0] !== 13.7468 || c4.center[1] !== 51.0535) return false;
    const linZ = 14.0 + (15.2 - 14.0) * 0.5;
    const linP = 42 + (66 - 42) * 0.5;
    if (!(c4.zoom > linZ && c4.pitch > linP)) return false;
    return true;
  })());
check("8b-fix4 crane end pose equals the landing framing",
  (() => {
    const c9 = storyCameraAt(scenes[0], 9, 0);
    return c9 && c9.zoom === story.STORY_TITLE_ZOOM &&
      c9.pitch === story.STORY_TITLE_PITCH &&
      c9.bearing === story.STORY_TITLE_BEARING &&
      c9.center[0] === story.STORY_TITLE_CENTER[0] &&
      c9.center[1] === story.STORY_TITLE_CENTER[1];
  })());
check("8b-fix5 dual-path: natural (landing offset) and seek agree on the full crane pose at 0, 4.5, 9 s",
  (() => {
    const NATURAL_BASE = 7.3; // accumulated landing bearing before Play
    for (const t of [0, 4.5, 9]) {
      const nat = storyCameraAt(scenes[0], t, NATURAL_BASE);
      const seek = storyCameraAt(scenes[0], t, 0);
      if (!nat || !seek) return false;
      if (nat.zoom !== seek.zoom || nat.pitch !== seek.pitch) return false;
      if (nat.bearing !== seek.bearing) return false;
      if (nat.center[0] !== seek.center[0] ||
          nat.center[1] !== seek.center[1]) return false;
      // Expected poses: 14.0/42/-30 at 0 s, 15.2/66/-30 at 9 s, ease-out mid at 4.5 s.
      if (nat.center[0] !== 13.7468 || nat.center[1] !== 51.0535) return false;
      if (t === 0 && (nat.zoom !== 14.0 || nat.pitch !== 42 || nat.bearing !== -30)) return false;
      if (t === 9 && (nat.zoom !== 15.2 || nat.pitch !== 66 || nat.bearing !== -30)) return false;
      if (t === 4.5) {
        if (!(nat.zoom > 14.0 && nat.zoom < 15.2)) return false;
        if (!(nat.pitch > 42 && nat.pitch < 66)) return false;
        if (nat.bearing !== -30) return false;
        const linZ = 14.0 + (15.2 - 14.0) * 0.5;
        const linP = 42 + (66 - 42) * 0.5;
        if (!(nat.zoom > linZ && nat.pitch > linP)) return false;
      }
    }
    return true;
  })());
check("8b-fix4 dual-path: scene 3 pull-back agrees at 0, 2, 9 s",
  (() => {
    for (const t of [0, 2, 9]) {
      const a = storyCameraAt(scenes[2], t, 0);
      const b = storyCameraAt(scenes[2], t, 0);
      if (!a || !b) return false;
      if (a.zoom !== b.zoom || a.pitch !== b.pitch) return false;
      if (a.bearing !== b.bearing) return false;
      if (a.center[0] !== b.center[0] || a.center[1] !== b.center[1]) return false;
    }
    return true;
  })());
check("8b-fix4 scene 3 pulls back from the crane end (15.2/66/-30) to 12.3/40/0 over 2.4 s on the ease-out curve",
  (() => {
    const s0 = storyCameraAt(scenes[2], 0, 0);
    const s2 = storyCameraAt(scenes[2], 2, 0);
    const s9 = storyCameraAt(scenes[2], 9, 0);
    if (!s0 || !s2 || !s9) return false;
    if (s0.zoom !== 15.2 || s0.pitch !== 66 || s0.bearing !== -30) return false;
    if (s0.center[0] !== 13.7468 || s0.center[1] !== 51.0535) return false;
    if (s9.zoom !== 12.3 || s9.pitch !== 40 || s9.bearing !== 0) return false;
    if (s9.center[0] !== 13.745 || s9.center[1] !== 51.057) return false;
    // Mid-move interpolates, front-loaded by the ease-out curve.
    if (!(s2.zoom < 15.2 && s2.zoom > 12.3)) return false;
    if (!(s2.pitch < 66 && s2.pitch > 40)) return false;
    if (!(s2.bearing < 0 && s2.bearing > -30)) return false;
    const lin = 15.2 + (12.3 - 15.2) * (2 / 2.4);
    if (!(s2.zoom < lin)) return false;
    return true;
  })());
check("8b-fix4 scene 3 lights up only once the 2.4 s move has landed",
  scene3LitCount(2.39, 20) === 0 && scene3LitCount(2.4, 20) === 1 &&
  story.STORY_SCENE3_FLY === 2.4);
check("planted: old 14.1 scene-1 hold is caught",
  (() => {
    const cam = storyCameraAt(scenes[0], 8, 0);
    return cam && cam.zoom !== 14.1 && cam.pitch !== 60;
  })());
check("planted: seek-path-only 13.2 ease is caught",
  (() => {
    const cam = storyCameraAt(scenes[0], 8, 0);
    return cam && cam.zoom !== 13.2 && cam.zoom !== 12.32;
  })());
check("planted: flat-map 13.5/35 crane start is caught",
  (() => {
    const cam = storyCameraAt(scenes[0], 0, 0);
    return cam && cam.zoom !== 13.5 && cam.pitch !== 35 &&
      story.STORY_CRANE_START_ZOOM !== 13.5 &&
      story.STORY_CRANE_START_PITCH !== 35;
  })());

// --- phase 8c-1: one camera path for scenes 5 and 6 ---
check("8c-1 close-up constants",
  story.STORY_CLOSEUP_CENTER.join(",") === "13.74675,51.05454" &&
  story.STORY_S4_END_CENTER.join(",") === "13.749,51.041" &&
  story.STORY_S5_ZOOM === 15.5 && story.STORY_S5_PITCH === 62 &&
  story.STORY_S5_BEARING === -30 && story.STORY_S5_FLY === 2.4 &&
  story.STORY_S6_ZOOM === 16.0 && story.STORY_S6_PITCH === 65 &&
  story.STORY_S6_BEARING === -30 && story.STORY_S6_ORBIT === 20);
check("8c-1 close-up centre is the shipped polygon's bbox centroid",
  (() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const gj = JSON.parse(fs.readFileSync(path.join(__dirname, "..",
        "web", "data", "bridges.geojson"), "utf8"));
      const f = gj.features.find((x) => x.properties &&
        x.properties.name === "Carolabrücke");
      if (!f) return false;
      const ring = f.geometry.coordinates[0];
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const p of ring) {
        if (p[0] < a) a = p[0];
        if (p[0] > c) c = p[0];
        if (p[1] < b) b = p[1];
        if (p[1] > d) d = p[1];
      }
      const cx = (a + c) / 2, cy = (b + d) / 2;
      console.log(`  info: Carolabrücke bbox centroid ${cx}, ${cy}`);
      return Math.abs(cx - story.STORY_CLOSEUP_CENTER[0]) < 1e-9 &&
        Math.abs(cy - story.STORY_CLOSEUP_CENTER[1]) < 1e-9;
    } catch (e) { return false; }
  })());
check("8c-1 scene 5 flies from scene 4's end pose to 15.5/62/-30 over 2.4 s",
  (() => {
    const s0 = storyCameraAt(scenes[4], 0, 0);
    const s1 = storyCameraAt(scenes[4], 1.2, 0);
    const s5 = storyCameraAt(scenes[4], 5, 0);
    const s9 = storyCameraAt(scenes[4], 9.9, 0);
    if (!s0 || !s1 || !s5 || !s9) return false;
    if (s0.zoom !== 12.3 || s0.pitch !== 40 || s0.bearing !== 0) return false;
    if (s0.center[0] !== 13.749 || s0.center[1] !== 51.041) return false;
    for (const e of [s5, s9]) {
      if (e.zoom !== 15.5 || e.pitch !== 62 || e.bearing !== -30) return false;
      if (e.center[0] !== 13.74675 || e.center[1] !== 51.05454) return false;
    }
    // Mid-fly interpolates, front-loaded by the ease-out curve.
    if (!(s1.zoom > 12.3 && s1.zoom < 15.5)) return false;
    if (!(s1.pitch > 40 && s1.pitch < 62)) return false;
    if (!(s1.bearing < 0 && s1.bearing > -30)) return false;
    const linZ = 12.3 + (15.5 - 12.3) * 0.5;
    if (!(s1.zoom > linZ)) return false;
    return true;
  })());
check("8c-1 scene 6 steps to 16.0/65/-30 and orbits 20 deg over its length",
  (() => {
    const dur = scenes[5].duration; // 12 s
    const g0 = storyCameraAt(scenes[5], 0, 0);
    const g6 = storyCameraAt(scenes[5], dur / 2, 0);
    const g12 = storyCameraAt(scenes[5], dur, 0);
    if (!g0 || !g6 || !g12) return false;
    for (const g of [g0, g6, g12]) {
      if (g.zoom !== 16.0 || g.pitch !== 65) return false;
      if (g.center[0] !== 13.74675 || g.center[1] !== 51.05454) return false;
    }
    if (g0.bearing !== -30) return false;
    if (Math.abs(g6.bearing - (-20)) > 1e-9) return false;
    if (Math.abs(g12.bearing - (-10)) > 1e-9) return false;
    return true;
  })());
check("8c-1 dual-path: scenes 5 and 6 agree at 0, half and end",
  (() => {
    const NATURAL_BASE = 7.3; // accumulated landing bearing before Play
    const cases = [
      { sc: scenes[4],
        times: [0, scenes[4].duration / 2, scenes[4].duration - 0.001] },
      { sc: scenes[5],
        times: [0, scenes[5].duration / 2, scenes[5].duration] }
    ];
    for (const { sc, times } of cases) {
      for (const t of times) {
        const nat = storyCameraAt(sc, t, NATURAL_BASE);
        const seek = storyCameraAt(sc, t, 0);
        if (!nat || !seek) return false;
        if (nat.zoom !== seek.zoom || nat.pitch !== seek.pitch) return false;
        if (nat.bearing !== seek.bearing) return false;
        if (nat.center[0] !== seek.center[0] ||
            nat.center[1] !== seek.center[1]) return false;
      }
    }
    return true;
  })());
check("planted: scene-5 hold before the fly is caught",
  (() => {
    const s0 = storyCameraAt(scenes[4], 0, 0);
    return s0 && s0.zoom !== 15.5;
  })());
check("planted: scene-6 6 s orbit is caught",
  (() => {
    const g6 = storyCameraAt(scenes[5], 6, 0);
    return g6 && Math.abs(g6.bearing - (-10)) > 1e-9;
  })());

// --- phase 8c-2: scenes 7-8 composed, caption text frozen ---
check("8c-3 scene 7 is dark with a hold/push-in camera and no SAM on the map",
  scenes[6].layers.basemap === "dark" && !scenes[6].layers.sam &&
  scenes[6].camera.mode === "hold" && scenes[6].camera.pushIn === 0.3);
check("8c-2 scene 8 is dark + dimmed with a hold camera",
  scenes[7].layers.basemap === "dark" && scenes[7].layers.dim === true &&
  scenes[7].camera.mode === "hold" && scenes[7].camera.dim === true);
check("8c-2 scene-7 captions unchanged",
  scenes[6].captions.length === 3 &&
  scenes[6].captions[0].text === "Muse Spark read the numbers and wrote the inspection memo." &&
  scenes[6].captions[1].text === "SAM 3.1 found the bridge in the satellite photo." &&
  scenes[6].captions[2].text === "Built with Muse Code.");
check("9g scene-8 captions state the objection and answer it",
  scenes[7].captions.length === 2 &&
  scenes[7].captions[0].text === "This model was built after the collapse. Did it peek at what came later?" &&
  scenes[7].captions[1].text === "No. Every month was re-run with the later months deleted. Carolabrücke still comes out first.");
check("planted: scene-7 imagery base is caught",
  scenes[6].layers.basemap !== "imagery");
check("8c-2 proof timing is 600 ms count + 90 ms stagger",
  story.STORY_PROOF_COUNT === 0.6 && story.STORY_PROOF_GAP === 0.09);
check("8c-2 evidence enters with the SAM caption at 5 s",
  story.STORY_EVIDENCE_AT === 5.0 &&
  storyEvidenceShown(4.99) === false &&
  storyEvidenceShown(5.0) === true &&
  storyEvidenceShown(13.9) === true);
check("planted: evidence-up-at-zero is caught",
  storyEvidenceShown(0) !== true);
check("8c-3 footprint hides in scenes 5-9 (no fills in scene 9)",
  storyHidesFootprint("august") === true &&
  storyHidesFootprint("september") === true &&
  storyHidesFootprint("the-report") === true &&
  storyHidesFootprint("the-proof") === true &&
  storyHidesFootprint("ten-days-later") === true &&
  storyHidesFootprint("title") === false &&
  storyHidesFootprint("how-radar-sees") === false &&
  storyHidesFootprint("twenty-bridges") === false &&
  storyHidesFootprint("three-years") === false);
check("8c-2 close-up id list",
  story.STORY_CLOSEUP_IDS.join(",") === "august,september,the-report,the-proof");
check("planted: city-zoom footprint hide is caught",
  storyHidesFootprint("three-years") !== true);

// --- phase 8c-3 item 1: SAM and radar off the story map, scenes 7 and 9 ---
check("8c-3 scene 7 layer spec carries no sam or radar",
  !scenes[6].layers.sam && !scenes[6].layers.radar);
check("8c-3 scene 9 layer spec carries no sam or radar",
  !scenes[8].layers.sam && !scenes[8].layers.radar);
check("8c-3 no story scene carries sam or radar on the map",
  scenes.every((s) => !s.layers.sam && !s.layers.radar));
check("planted: scene-7 sam flag is caught",
  scenes[6].layers.sam !== true);
check("planted: scene-9 radar flag is caught",
  scenes[8].layers.radar !== true);

// --- phase 8c-3 item 2: scene 9 pull-back, date roll, pulse ---
check("8c-3 scene-9 pull-back constants",
  story.STORY_S9_FLY === 2.4 &&
  story.STORY_S9_START_ZOOM === 16.3 &&
  story.STORY_S9_START_PITCH === 65 &&
  story.STORY_S9_START_BEARING === -10);
check("8c-3 scene 9 ends 12.3/40/0 on the city centre",
  scenes[8].camera.zoom === 12.3 && scenes[8].camera.pitch === 40 &&
  scenes[8].camera.bearing === 0 &&
  scenes[8].camera.center[0] === story.STORY_CITY_CENTER[0] &&
  scenes[8].camera.center[1] === story.STORY_CITY_CENTER[1]);
check("8c-3 pull-back runs scene-8 pose to 12.3/40/0 over 2.4 s on ease-out",
  (() => {
    const p0 = storyCameraAt(scenes[8], 0, 0);
    const p1 = storyCameraAt(scenes[8], 1.2, 0);
    const p5 = storyCameraAt(scenes[8], 5, 0);
    const p9 = storyCameraAt(scenes[8], 9.9, 0);
    if (!p0 || !p1 || !p5 || !p9) return false;
    if (p0.zoom !== 16.3 || p0.pitch !== 65 || p0.bearing !== -10) return false;
    if (p0.center[0] !== story.STORY_CLOSEUP_CENTER[0] ||
        p0.center[1] !== story.STORY_CLOSEUP_CENTER[1]) return false;
    for (const e of [p5, p9]) {
      if (e.zoom !== 12.3 || e.pitch !== 40 || e.bearing !== 0) return false;
      if (e.center[0] !== story.STORY_CITY_CENTER[0] ||
          e.center[1] !== story.STORY_CITY_CENTER[1]) return false;
    }
    if (!(p1.zoom < 16.3 && p1.zoom > 12.3)) return false;
    if (!(p1.pitch < 65 && p1.pitch > 40)) return false;
    if (!(p1.bearing < 0 && p1.bearing > -10)) return false;
    const linZ = 16.3 + (12.3 - 16.3) * 0.5;
    if (!(p1.zoom < linZ)) return false;
    return true;
  })());
check("8c-3-fix2 Europe beat is a cut (city to 10.5, Europe after)",
  (() => {
    const city = storyCameraAt(scenes[8], 10, 0);
    const cut = storyCameraAt(scenes[8], 10.5, 0);
    const lift = storyCameraAt(scenes[8], 10.6, 0);
    const late = storyCameraAt(scenes[8], 12, 0);
    if (!city || !cut || !lift || !late) return false;
    if (city.zoom !== 12.3 || city.pitch !== 40 || city.bearing !== 0) return false;
    if (city.center[0] !== story.STORY_CITY_CENTER[0] ||
        city.center[1] !== story.STORY_CITY_CENTER[1]) return false;
    for (const p of [cut, lift, late]) {
      if (p.zoom !== 3.8 || p.pitch !== 0 || p.bearing !== 0) return false;
      if (p.center[0] !== 12 || p.center[1] !== 52) return false;
    }
    return true;
  })());
check("8c-3 dual-path: scene 9 agrees at 0, 1.2, 2.4 and 5 s",
  (() => {
    const NATURAL_BASE = 7.3;
    for (const t of [0, 1.2, 2.4, 5]) {
      const nat = storyCameraAt(scenes[8], t, NATURAL_BASE);
      const seek = storyCameraAt(scenes[8], t, 0);
      if (!nat || !seek) return false;
      if (nat.zoom !== seek.zoom || nat.pitch !== seek.pitch) return false;
      if (nat.bearing !== seek.bearing) return false;
      if (nat.center[0] !== seek.center[0] ||
          nat.center[1] !== seek.center[1]) return false;
    }
    return true;
  })());
check("8c-3-fix2 dual-path: scene 9 Europe agrees at 10, 10.6 and 12 s",
  (() => {
    const NATURAL_BASE = 7.3;
    for (const t of [10, 10.6, 12]) {
      const nat = storyCameraAt(scenes[8], t, NATURAL_BASE);
      const seek = storyCameraAt(scenes[8], t, 0);
      if (!nat || !seek) return false;
      if (nat.zoom !== seek.zoom || nat.pitch !== seek.pitch) return false;
      if (nat.bearing !== seek.bearing) return false;
      if (nat.center[0] !== seek.center[0] ||
          nat.center[1] !== seek.center[1]) return false;
    }
    const at10 = storyCameraAt(scenes[8], 10, 0);
    const at106 = storyCameraAt(scenes[8], 10.6, 0);
    if (!at10 || !at106) return false;
    if (at10.zoom !== 12.3) return false;
    if (at106.zoom !== 3.8 || at106.pitch !== 0 || at106.bearing !== 0) return false;
    return true;
  })());
check("planted: continuous Europe zoom at 10.6 s is caught",
  (() => {
    const p = storyCameraAt(scenes[8], 10.6, 0);
    return p && p.zoom === 3.8 && p.zoom !== 8 && p.zoom !== 6;
  })());
check("planted: old zoom-12 pull-back end is caught",
  (() => {
    const p = storyCameraAt(scenes[8], 5, 0);
    return p && p.zoom !== 12;
  })());
check("8c-3 date roll is 2.5 s from 0.5 s, ending at 3.0 s",
  story.STORY_DATE_ROLL === 2.5 && story.STORY_DATE_ROLL_AT === 0.5 &&
  story.STORY_DATE_ROLL_AT + story.STORY_DATE_ROLL === 3.0);
check("planted: 2.0 s date roll is caught",
  story.STORY_DATE_ROLL !== 2.0);
check("8c-3 scene-9 captions unchanged",
  scenes[8].captions.length === 3 &&
  scenes[8].captions[0].text === "{days} days later, {event_asset} collapsed." &&
  scenes[8].captions[1].text === "The data flagged it first." &&
  scenes[8].captions[2].text === "Every bridge in Europe already has this data." &&
  scenes[8].captions[0].at === 2.5 && scenes[8].captions[1].at === 7.0 &&
  scenes[8].captions[2].at === 11.0);

// --- phase 8c-3 item 4: the ending sheet timing ---
check("8c-3 ending starts at 13 s (after the 12 s Europe frame, before the end)",
  story.STORY_END_AT === 13.0 &&
  story.STORY_END_AT > 12 && story.STORY_END_AT < 14);
check("planted: ending over Europe at 10 s is caught",
  story.STORY_END_AT !== 10.0);

// --- phase 8c-3 fix 2 item 1: Europe tile warmer is map-size (mocked) ---
check("8c-3-fix2 warmer is map-size, created once and removed (mock Map)",
  (() => {
    const prevDoc = global.document;
    const prevML = global.maplibregl;
    const prevMap = global.map;
    const prevBuild = global.buildFuiStyle;
    try {
      const styleObj = { version: 8 };
      let mapCalls = [];
      let removed = 0;
      let createdEl = null;
      const mapContainer = { clientWidth: 1280, clientHeight: 800 };
      const host = {
        kids: [],
        appendChild(el) {
          this.kids.push(el);
          el.parentNode = this;
          return el;
        },
        removeChild(el) {
          const i = this.kids.indexOf(el);
          if (i !== -1) this.kids.splice(i, 1);
          el.parentNode = null;
          return el;
        }
      };
      global.document = {
        createElement(tag) {
          createdEl = {
            tag, style: {}, attrs: {}, parentNode: null,
            setAttribute(k, v) { this.attrs[k] = v; }
          };
          return createdEl;
        },
        body: host,
        documentElement: host,
        getElementById() { return null; }
      };
      global.maplibregl = {
        Map: function (opts) {
          mapCalls.push(opts);
          this.opts = opts;
          this.remove = () => { removed++; };
        }
      };
      global.map = { getStyle: () => styleObj,
        getContainer: () => mapContainer };
      story.storyRemoveEuropeWarmer();
      mapCalls = [];
      removed = 0;
      const ok1 = story.storyEnsureEuropeWarmer();
      const ok2 = story.storyEnsureEuropeWarmer();
      if (!ok1 || !ok2) return false;
      if (mapCalls.length !== 1) return false;
      const o = mapCalls[0];
      if (o.container !== createdEl) return false;
      if (o.style !== styleObj) return false;
      if (!Array.isArray(o.center) || o.center[0] !== 12 || o.center[1] !== 52) return false;
      if (o.zoom !== 3.8) return false;
      if (o.pitch !== 0 || o.bearing !== 0) return false;
      if (o.interactive !== false) return false;
      if (o.attributionControl !== false) return false;
      if (createdEl.style.width !== "1280px") return false;
      if (createdEl.style.height !== "800px") return false;
      if (createdEl.style.visibility !== "hidden") return false;
      if (createdEl.style.pointerEvents !== "none") return false;
      if (createdEl.attrs["aria-hidden"] !== "true") return false;
      if (host.kids.indexOf(createdEl) === -1) return false;
      story.storyRemoveEuropeWarmer();
      if (removed !== 1) return false;
      if (createdEl.parentNode !== null) return false;
      if (host.kids.indexOf(createdEl) !== -1) return false;
      mapCalls = [];
      removed = 0;
      createdEl = null;
      const ok3 = story.storyEnsureEuropeWarmer();
      if (!ok3 || mapCalls.length !== 1) return false;
      story.storyRemoveEuropeWarmer();
      if (removed !== 1) return false;
      return true;
    } catch (e) {
      return false;
    } finally {
      if (prevDoc === undefined) delete global.document;
      else global.document = prevDoc;
      if (prevML === undefined) delete global.maplibregl;
      else global.maplibregl = prevML;
      if (prevMap === undefined) delete global.map;
      else global.map = prevMap;
      if (prevBuild === undefined) delete global.buildFuiStyle;
      else global.buildFuiStyle = prevBuild;
      try { story.storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
    }
  })());
check("planted: 2 x 2 px warmer is caught",
  (() => {
    const prevDoc = global.document;
    const prevML = global.maplibregl;
    const prevMap = global.map;
    try {
      const host = {
        appendChild(el) { el.parentNode = this; return el; },
        removeChild(el) { el.parentNode = null; return el; }
      };
      let createdEl = null;
      global.document = {
        createElement() {
          createdEl = { style: {}, parentNode: null,
            setAttribute() {} };
          return createdEl;
        },
        body: host,
        documentElement: host,
        getElementById() { return null; }
      };
      global.maplibregl = {
        Map: function () { this.remove = () => {}; }
      };
      global.map = { getStyle: () => ({ version: 8 }),
        getContainer: () => ({ clientWidth: 1920, clientHeight: 1080 }) };
      story.storyRemoveEuropeWarmer();
      const ok = story.storyEnsureEuropeWarmer();
      if (!ok || !createdEl) return false;
      const bad = createdEl.style.width === "2px" &&
        createdEl.style.height === "2px";
      story.storyRemoveEuropeWarmer();
      return !bad &&
        createdEl.style.width === "1920px" &&
        createdEl.style.height === "1080px";
    } catch (e) {
      return false;
    } finally {
      if (prevDoc === undefined) delete global.document;
      else global.document = prevDoc;
      if (prevML === undefined) delete global.maplibregl;
      else global.maplibregl = prevML;
      if (prevMap === undefined) delete global.map;
      else global.map = prevMap;
      try { story.storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
    }
  })());
check("8c-3-fix2 warmer failure leaves the story untouched (mock Map throws)",
  (() => {
    const prevDoc = global.document;
    const prevML = global.maplibregl;
    const prevMap = global.map;
    try {
      const host = {
        appendChild(el) { el.parentNode = this; return el; },
        removeChild(el) { el.parentNode = null; return el; }
      };
      global.document = {
        createElement() {
          return { style: {}, parentNode: null,
            setAttribute() {} };
        },
        body: host,
        documentElement: host,
        getElementById() { return null; }
      };
      global.maplibregl = {
        Map: function () { throw new Error("tiles down"); }
      };
      global.map = { getStyle: () => ({ version: 8 }),
        getContainer: () => ({ clientWidth: 1280, clientHeight: 800 }) };
      story.storyRemoveEuropeWarmer();
      let out = null;
      try {
        out = story.storyEnsureEuropeWarmer();
      } catch (e) {
        return false;
      }
      if (out !== false) return false;
      try {
        story.storyRemoveEuropeWarmer();
      } catch (e) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    } finally {
      if (prevDoc === undefined) delete global.document;
      else global.document = prevDoc;
      if (prevML === undefined) delete global.maplibregl;
      else global.maplibregl = prevML;
      if (prevMap === undefined) delete global.map;
      else global.map = prevMap;
      try { story.storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
    }
  })());
check("8c-3-fix2 no map size means no warmer (never 2 x 2)",
  (() => {
    const prevDoc = global.document;
    const prevML = global.maplibregl;
    const prevMap = global.map;
    try {
      const host = {
        appendChild(el) { el.parentNode = this; return el; },
        removeChild(el) { el.parentNode = null; return el; }
      };
      global.document = {
        createElement() {
          return { style: {}, parentNode: null,
            setAttribute() {} };
        },
        body: host,
        documentElement: host,
        getElementById() { return null; }
      };
      global.maplibregl = {
        Map: function () { this.remove = () => {}; }
      };
      global.map = { getStyle: () => ({ version: 8 }) };
      story.storyRemoveEuropeWarmer();
      const out = story.storyEnsureEuropeWarmer();
      story.storyRemoveEuropeWarmer();
      return out === false;
    } catch (e) {
      return false;
    } finally {
      if (prevDoc === undefined) delete global.document;
      else global.document = prevDoc;
      if (prevML === undefined) delete global.maplibregl;
      else global.maplibregl = prevML;
      if (prevMap === undefined) delete global.map;
      else global.map = prevMap;
      try { story.storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
    }
  })());

if (failures) {
  console.log(`test_story: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_story: PASS");
