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
  captionIndexAtLocalTime, captionAtTime, storyOrbitBearing
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
  scene3LitCount(0, 20) === 0 && scene3LitCount(1.999, 20) === 0);
check("scene-3 first bridge at 2 s", scene3LitCount(2.0, 20) === 1);
check("scene-3 one bridge per 0.25 s",
  scene3LitCount(2.24, 20) === 1 && scene3LitCount(2.25, 20) === 2 &&
  scene3LitCount(6.75, 20) === 20);
check("scene-3 clamps at the total", scene3LitCount(99, 20) === 20);
check("planted: instant light-up is caught", scene3LitCount(0, 20) !== 20);
check("7b scenes 3/5/6 are real",
  story.STORY_PLACEHOLDERS["twenty-bridges"] === undefined &&
  story.STORY_PLACEHOLDERS["august"] === undefined &&
  story.STORY_PLACEHOLDERS["september"] === undefined);
check("7b scenes 2/7/8 stay placeholders",
  story.STORY_PLACEHOLDERS["how-radar-sees"] === true &&
  story.STORY_PLACEHOLDERS["the-report"] === true &&
  story.STORY_PLACEHOLDERS["the-proof"] === true);
check("7b timing constants",
  story.STORY_SCENE3_FLY === 2.0 && story.STORY_SCENE3_GAP === 0.25 &&
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
  scenes.map((s) => s.duration).join(",") === "9,16,10,30,10,12,14,10,14");
check("total story length is 125 s", totalDuration(scenes) === 125);
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

if (failures) {
  console.log(`test_story: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_story: PASS");
