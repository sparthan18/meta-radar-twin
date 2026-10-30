"use strict";
// RadarTwin story mode (phase 7a): the director and the nine scenes.
//
// The file has two parts. The pure part (no DOM, no map, no GSAP) runs in
// node and is tested by tests/test_story.js: caption templates, the
// headline card text, the scene table, and the time/level helpers. The
// browser part (below the banner) drives one GSAP master timeline per run,
// with one sub-timeline per scene, and binds the dashboard to each scene's
// cutoff through the existing applyCutoff path from web/index.html.
//
// Scene data rule (docs/story-spec.md): every scene reads only its bound
// cutoff's decisions, spans and memo. The only authored facts are the
// sentences and the collapse date/event bridge from decisions.json.

// ---------- Pure part ----------

const STORY_MONTH_STEP = 0.7; // seconds per month in scene 4
const STORY_SCENE4_LEAD = 2.0; // lead-in before the first month (normal motion)
const STORY_SCENE4_TAIL = 4.9; // hold on the last month (normal motion)
const STORY_SCENE4_LEAD_REDUCED = 0.5;
const STORY_SCENE4_TAIL_REDUCED = 0.5;
const STORY_WAIT_TIMEOUT = 4000; // ms; a wait past this degrades to a cut
const STORY_CALLOUT_HOLD = 1.2; // seconds a scene-4 callout stays up
const STORY_DATE_ROLL = 2.5; // seconds for the scene-9 date roll (8c-3: cutoff to event over 2.5 s)
const STORY_DATE_ROLL_AT = 0.5; // scene-9 local time when the roll starts
const STORY_END_AT = 13.0; // scene-9 local time when the ending sheet starts (8c-3: near the scene end, 800 ms fade; captions hide)
const STORY_S9_FLY = 2.4; // scene-9 pull-back duration (8c-3: close-up to 12.3/40/0 on the ease-out curve)
// 8c-3 scene-9 pull-back start = scene 8's pose: the close-up centroid at
// 16.0 + the scene-7 0.3 push-in, pitch 65, bearing -10 (scene 6 end).
const STORY_S9_START_ZOOM = 16.3;
const STORY_S9_START_PITCH = 65;
const STORY_S9_START_BEARING = -10;

const STORY_MONTHS_FULL = ["January", "February", "March", "April", "May",
  "June", "July", "August", "September", "October", "November", "December"];
const STORY_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STORY_SCENE_NAMES = {
  "title": "Title",
  "how-radar-sees": "How radar sees",
  "twenty-bridges": "Twenty bridges",
  "three-years": "Three years",
  "august": "August",
  "september": "September",
  "the-report": "The report",
  "the-proof": "The proof",
  "ten-days-later": "Ten days later"
};

// 7c: every scene is real; no placeholders remain.
const STORY_PLACEHOLDERS = {};
const STORY_SCENE3_FLY = 2.4; // seconds of camera pull-back before light-up
// Phase 8b fix 5: the crane starts lower (14.0/42, bearing -30), where
// the walls already read in the first frame (13.5/35 was a flat map for
// the first second). The landing holds Carolabrücke at 15.2/66/-30 with
// the 0.5 deg/s orbit; scene 1 descends to the landing's framing over the
// scene's nine seconds on the ease-out curve; scene 3 pulls back from
// there to the flat city-wide 12.3/40 on the ease-out curve. The dip, the
// jump behind the dip and the one-camera-path rule stay as in fix 4.
const STORY_TITLE_ZOOM = 15.2;
const STORY_TITLE_PITCH = 66;
const STORY_TITLE_BEARING = -30;
const STORY_TITLE_CENTER = [13.7468, 51.0535];
const STORY_TITLE_ORBIT = 0.5;
const STORY_CRANE_START_ZOOM = 14.0;
const STORY_CRANE_START_PITCH = 42;
const STORY_TITLE_AT = 2.0;
const STORY_CITY_ZOOM = 12.3;
const STORY_CITY_PITCH = 40;
const STORY_CITY_CENTER = [13.745, 51.057];
// Phase 8c-1 close-up (spec section 4): scenes 5 and 6 on the vector city.
// STORY_CLOSEUP_CENTER is Carolabrücke's centroid: the bbox centre of its
// shipped polygon (web/data/bridges.geojson id "4"), the same definition
// web/index.html uses for CENTROIDS. Scene 5 flies from scene 4's end
// pose (12.3/40/0 over STORY_S4_END_CENTER) to 15.5/62/-30 over 2.4 s on
// the ease-out curve; scene 6 steps to 16.0/65/-30 and orbits 20 deg over
// its length; scene 7 holds scene 6's end pose (bearing -10) with its
// 0.3 push-in as now.
const STORY_CLOSEUP_CENTER = [13.74675, 51.05454];
const STORY_S4_END_CENTER = [13.749, 51.041];
const STORY_S5_ZOOM = 15.5;
const STORY_S5_PITCH = 62;
const STORY_S5_BEARING = -30;
const STORY_S5_FLY = 2.4;
const STORY_S6_ZOOM = 16.0;
const STORY_S6_PITCH = 65;
const STORY_S6_BEARING = -30;
const STORY_S6_ORBIT = 20;
const STORY_SCENE3_GAP = 0.25; // seconds between bridge light-ups
const STORY_SCENE6_ORBIT = 6.0; // seconds for the 20° orbit
const STORY_GLOW_PULSE = 1.2; // seconds for the one glow pulse
const STORY_MEMO_CPS = 40; // scene-7 typing speed, chars per second
const STORY_PROOF_COUNT = 0.6; // scene-8 seconds counting from zero (spec: 600 ms)
const STORY_PROOF_GAP = 0.09; // scene-8 seconds between check marks (spec: 90 ms stagger)
const STORY_EVIDENCE_AT = 5.0; // scene-7 local time the evidence card enters (the SAM caption)
const STORY_CLOSEUP_IDS = ["august", "september", "the-report", "the-proof"];
const STORY_EUROPE_AT = 10.0; // scene-9 local time the Europe beat starts (the dip starts)
const STORY_EUROPE_ZOOM = 3.8;
const STORY_EUROPE_CENTER = [12, 52];
// 8c-3 fix 2: the Europe beat is a cut. The dip runs 0.5 s down and
// 0.5 s back (the scenes 2/8 element and curve); the camera jumps to
// the Europe pose behind the dip at CUT_AT, and the dots start then.
const STORY_EUROPE_DIP = 0.5;
const STORY_EUROPE_CUT_AT = STORY_EUROPE_AT + STORY_EUROPE_DIP;
// Illustrative EGMS-covered cities for the scene-9 outro, Dresden last
// and labelled. Inline lon/lat; the footnote says they are examples.
const STORY_EUROPE_CITIES = [
  { name: "Berlin", lon: 13.405, lat: 52.52 },
  { name: "Prague", lon: 14.4378, lat: 50.0755 },
  { name: "Vienna", lon: 16.3738, lat: 48.2082 },
  { name: "Warsaw", lon: 21.0122, lat: 52.2297 },
  { name: "Copenhagen", lon: 12.5683, lat: 55.6761 },
  { name: "Amsterdam", lon: 4.9041, lat: 52.3676 },
  { name: "Paris", lon: 2.3522, lat: 48.8566 },
  { name: "Madrid", lon: -3.7038, lat: 40.4168 },
  { name: "Lisbon", lon: -9.1393, lat: 38.7223 },
  { name: "Rome", lon: 12.4964, lat: 41.9028 },
  { name: "Milan", lon: 9.19, lat: 45.4642 },
  { name: "Athens", lon: 23.7294, lat: 37.9838 },
  { name: "Stockholm", lon: 18.0686, lat: 59.3293 },
  { name: "Dublin", lon: -6.2603, lat: 53.3498 },
  { name: "Dresden", lon: 13.745, lat: 51.057 }
];
const STORY_PROOF_QUANTITIES = ["roll", "score", "z", "wmax", "wspread",
  "velocity", "coherence", "span_meta", "flags", "risk"];

function storyMonthLabel(cutoff) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(cutoff || "");
  if (!m) return cutoff || "";
  return `${STORY_MONTHS_FULL[Number(m[2]) - 1]} ${m[1]}`;
}

function storyFmtEventDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} ${STORY_MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

function storyDaysBetween(aIso, bIso) {
  return Math.round((Date.parse(bIso) - Date.parse(aIso)) / 86400000);
}

// Format cutoff + offset days as "11 Sep 2024" (UTC; the date roll).
function storyAddDays(dateStr, offset) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
  if (!m) return dateStr || "";
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) +
    Math.round(offset) * 86400000;
  const d = new Date(t);
  return `${d.getUTCDate()} ${STORY_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function storyPluralize(n, one, many) {
  return Number(n) === 1 ? one : many;
}

// captionText(template, data): every brace in the spec's captions is
// computed at run time. {key} substitutes data[key] ("" when missing).
// {n:key|singular|plural} renders the count with the right noun, so
// "{n:n_high|bridge|bridges} flagged" gives "1 bridge flagged" or
// "2 bridges flagged" from the bound cutoff's data.
function captionText(template, data) {
  const d = data || {};
  let s = String(template).replace(
    /\{n:([A-Za-z0-9_]+)\|([^|{}]*)\|([^|{}]*)\}/g,
    (m, key, one, many) => {
      const v = d[key];
      if (v === null || v === undefined || v === "") return "";
      return `${v} ${Number(v) === 1 ? one : many}`;
    });
  s = s.replace(/\{([A-Za-z0-9_]+)\}/g, (m, key) => {
    const v = d[key];
    return (v === null || v === undefined) ? "" : String(v);
  });
  return s;
}

// Plain-language reason for a high bridge. The headline prefers the
// rubric's own reason field; the leak-free pipeline leaves it empty for
// monitored bridges, so the fallback phrases the flags in SPEC section 4's
// own words (escalate = "exceeds anything in this asset's record,
// concentrated at one end").
function reasonFromFlags(flags) {
  const f = flags || {};
  if (f.escalate) return "Exceeds anything in its own record, concentrated at one end.";
  if (f.outlier) return "Exceeds anything in its own record.";
  if (f.accelerating && f.differential) return "Speeding up and moving unevenly along its length.";
  if (f.differential) return "Moving unevenly along its length.";
  if (f.accelerating) return "Speeding up compared with its longer-term behaviour.";
  if (f.moving) return "Moving faster than the noise floor.";
  return "";
}

// Headline card text. top is null when no bridge is high at the cutoff.
function headlineText(monthLbl, top) {
  if (!top) return { title: `${monthLbl} — nothing unusual.`, reason: "" };
  const own = (top.reason && String(top.reason).trim()) ? String(top.reason).trim() : "";
  return {
    title: `${monthLbl} — ${top.name} needs an inspector.`,
    reason: own || reasonFromFlags(top.flags)
  };
}

// Top model-high bridge by rank (ties by name), mirroring the map colours.
function topHighBridge(table, id2name) {
  let best = null;
  for (const bid of Object.keys(table || {})) {
    const d = table[bid];
    if (!d || !d.model || d.model.risk !== "high") continue;
    const rk = (d.rank === null || d.rank === undefined) ? 999 : d.rank;
    const name = (id2name && id2name[bid]) || bid;
    if (!best || rk < best.rank || (rk === best.rank && name < best.name)) {
      best = { bid, name, rank: rk, reason: d.reason || "", flags: d.flags || {} };
    }
  }
  return best;
}

function highCount(table) {
  let n = 0;
  for (const bid of Object.keys(table || {})) {
    const d = table[bid];
    if (d && d.model && d.model.risk === "high") n++;
  }
  return n;
}

// Rank order at one cutoff: rank ascending, null/undefined ranks
// (not-monitored) last, ties by bridge name. Used for the scene-3
// light-up (first cutoff) and the history-strip rows (last cutoff).
function orderBridgesByRank(table, id2name) {
  const bids = Object.keys(table || {});
  bids.sort((a, b) => {
    const da = table[a], db = table[b];
    const ra = (!da || da.rank === null || da.rank === undefined) ? 999 : da.rank;
    const rb = (!db || db.rank === null || db.rank === undefined) ? 999 : db.rank;
    if (ra !== rb) return ra - rb;
    const na = (id2name && id2name[a]) || a;
    const nb = (id2name && id2name[b]) || b;
    return String(na).localeCompare(String(nb));
  });
  return bids;
}

// How many scene-3 bridges are lit at local time localT (0..order.length).
// The camera flies for STORY_SCENE3_FLY seconds, then one bridge every
// STORY_SCENE3_GAP seconds in rank order.
function scene3LitCount(localT, total) {
  if (localT < STORY_SCENE3_FLY) return 0;
  return Math.max(0, Math.min(total, Math.floor((localT - STORY_SCENE3_FLY) / STORY_SCENE3_GAP) + 1));
}

// First month (and bridge) any bridge reaches each level, in level order.
// Levels never reached are absent. Used for the scene-4 callouts.
function firstLevelHits(cutoffs, decisions, id2name) {
  const out = [];
  for (const level of ["watch", "elevated", "high"]) {
    let found = null;
    for (let m = 0; m < (cutoffs || []).length && !found; m++) {
      const table = (decisions || {})[cutoffs[m]] || {};
      const bids = Object.keys(table).sort((a, b) => {
        const ta = table[a], tb = table[b];
        const ra = (ta.rank === null || ta.rank === undefined) ? 999 : ta.rank;
        const rb = (tb.rank === null || tb.rank === undefined) ? 999 : tb.rank;
        if (ra !== rb) return ra - rb;
        const na = (id2name && id2name[a]) || a;
        const nb = (id2name && id2name[b]) || b;
        return String(na).localeCompare(String(nb));
      });
      for (const bid of bids) {
        const d = table[bid];
        if (d && d.model && d.model.risk === level) {
          found = { level, monthIdx: m, cutoff: cutoffs[m], bid,
            name: ((id2name && id2name[bid]) || bid) };
          break;
        }
      }
    }
    if (found) out.push(found);
  }
  return out;
}

// The nine scenes. ctx: {cutoffs, reduced}. Durations are the spec's;
// under reduced motion each scene is shortened to its caption span
// (scene 4 still steps every month: content, not decoration).
function buildScenes(ctx) {
  const cutoffs = (ctx && ctx.cutoffs) || [];
  const reduced = !!(ctx && ctx.reduced);
  const first = cutoffs[0];
  const last = cutoffs[cutoffs.length - 1];
  const august = cutoffs.indexOf("2024-08-01") !== -1 ? "2024-08-01" : last;
  const n = cutoffs.length;
  const lead = reduced ? STORY_SCENE4_LEAD_REDUCED : STORY_SCENE4_LEAD;
  const tail = reduced ? STORY_SCENE4_TAIL_REDUCED : STORY_SCENE4_TAIL;
  const s4dur = lead + n * STORY_MONTH_STEP + tail;
  const D = (normal, span) => (reduced ? span : normal);
  return [
    { id: "title", cutoff: last,
      camera: { mode: "city", zoom: STORY_TITLE_ZOOM, pitch: STORY_TITLE_PITCH,
        bearing: STORY_TITLE_BEARING, center: STORY_TITLE_CENTER.slice() },
      layers: { basemap: "dark" }, overlay: "title",
      captions: [
        { text: "Dresden, {event_date}. A bridge fell into the Elbe.", at: 0.5, hold: 3.5 },
        { text: "The warning had been visible from orbit for a year.", at: 4.5, hold: 4.0 }
      ],
      duration: D(9, 8.5), waitFor: ["tiles", "fonts"] },
    { id: "how-radar-sees", cutoff: first,
      camera: { mode: "hold" },
      layers: { cover: true }, overlay: "explainer",
      captions: [
        { text: "Satellites bounce radio waves off the ground every few days.", at: 0.5, hold: 5.0 },
        { text: "Compare the echoes and a kerb that moved one millimetre shows up.", at: 6.0, hold: 5.0 },
        { text: "Europe publishes this for every bridge. RadarTwin looks every month.", at: 11.5, hold: 4.0 }
      ],
      duration: D(16, 15.5), waitFor: ["fonts"] },
    { id: "twenty-bridges", cutoff: first,
      camera: { mode: "city", zoom: STORY_CITY_ZOOM, pitch: STORY_CITY_PITCH,
        center: STORY_CITY_CENTER.slice() },
      layers: { basemap: "dark" }, overlay: "labels",
      captions: [
        { text: "{n_bridges} bridges in Dresden. {n_monitored} the satellite can see; {n_not} it cannot.",
          at: 0.5, hold: 9.0 }
      ],
      duration: D(10, 9.5), waitFor: ["tiles"] },
    { id: "three-years", cutoff: first, endCutoff: last,
      camera: { mode: "city", zoom: STORY_CITY_ZOOM, pitch: STORY_CITY_PITCH,
        drift: true, center: [13.745, 51.039] },
      layers: { basemap: "dark" }, overlay: "headline",
      captions: [],
      duration: s4dur, waitFor: ["tiles"] },
    { id: "august", cutoff: august,
      camera: { mode: "bridge", bridge: "Carolabrücke", zoom: STORY_S5_ZOOM,
        pitch: STORY_S5_PITCH, bearing: STORY_S5_BEARING,
        center: STORY_CLOSEUP_CENTER.slice() },
      layers: { basemap: "dark" }, overlay: "deck",
      captions: [
        { text: "{month}. {n:n_high|bridge|bridges} flagged.", at: 0.5, hold: 4.5 },
        { text: "This one is moving at both ends.", at: 5.5, hold: 4.0 }
      ],
      duration: D(10, 9.5), waitFor: ["tiles"] },
    { id: "september", cutoff: last,
      camera: { mode: "step", orbit: STORY_S6_ORBIT, zoom: STORY_S6_ZOOM,
        pitch: STORY_S6_PITCH, bearing: STORY_S6_BEARING,
        center: STORY_CLOSEUP_CENTER.slice() },
      layers: { basemap: "dark" }, overlay: "counter",
      captions: [
        { text: "{month}. The only red bridge in the city.", at: 0.5, hold: 5.5 },
        { text: "Faster than anything in its own record. One end rising, the next span sinking.",
          at: 6.5, hold: 5.0 }
      ],
      duration: D(12, 11.5), waitFor: ["tiles"] },
    { id: "the-report", cutoff: last,
      camera: { mode: "hold", pushIn: 0.3 },
      layers: { basemap: "dark" }, overlay: "memo",
      captions: [
        { text: "Muse Spark read the numbers and wrote the inspection memo.", at: 0.5, hold: 4.0 },
        { text: "SAM 3.1 found the bridge in the satellite photo.", at: 5.0, hold: 4.5 },
        { text: "Built with Muse Code.", at: 10.0, hold: 3.5 }
      ],
      duration: D(14, 13.5), waitFor: ["tiles", "memo"] },
    { id: "the-proof", cutoff: last,
      camera: { mode: "hold", dim: true },
      layers: { basemap: "dark", dim: true }, overlay: "proof",
      captions: [
        { text: "The future was deleted and everything re-run. Nothing changed.", at: 0.5, hold: 4.5 },
        { text: "An engineering checklist and the model agree on every red bridge.", at: 5.5, hold: 4.0 }
      ],
      duration: D(10, 9.5), waitFor: [] },
    { id: "ten-days-later", cutoff: last,
      camera: { mode: "pullback", zoom: STORY_CITY_ZOOM, pitch: STORY_CITY_PITCH,
        bearing: 0, center: STORY_CITY_CENTER.slice() },
      layers: { basemap: "dark" }, overlay: "outro",
      captions: [
        { text: "{days} days later, {event_asset} collapsed.", at: 2.5, hold: 4.0 },
        { text: "The data flagged it first.", at: 7.0, hold: 3.5 },
        { text: "Every bridge in Europe already has this data.", at: 11.0, hold: 2.5 }
      ],
      duration: D(14, 13.5), waitFor: ["tiles"] }
  ];
}

function sceneBounds(scenes) {
  const out = [];
  let t = 0;
  for (const sc of scenes) {
    out.push({ start: t, end: t + sc.duration });
    t += sc.duration;
  }
  return out;
}

function totalDuration(scenes) {
  return scenes.reduce((a, s) => a + s.duration, 0);
}

function sceneIndexAtTime(scenes, t) {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    acc += scenes[i].duration;
    if (t < acc || i === scenes.length - 1) return i;
  }
  return scenes.length - 1;
}

// Caption window lookup: the index of the caption whose [at, at+hold]
// window contains the scene-local time, or -1 in a gap. Pure.
function captionIndexAtLocalTime(captions, localT) {
  const arr = captions || [];
  for (let k = 0; k < arr.length; k++) {
    const c = arr[k] || {};
    if (typeof c.at !== "number" || typeof c.hold !== "number") continue;
    if (localT >= c.at && localT < c.at + c.hold) return k;
  }
  return -1;
}

// Caption state as a pure function of the master time: the owning scene
// (the same sceneIndexAtTime lookup the scrub bar and the scene tag use)
// and the caption index inside it (-1 when no window holds the playhead,
// so a seek into a gap never keeps another scene's caption).
function captionAtTime(scenes, t) {
  const arr = scenes || [];
  if (!arr.length) return { scene: -1, caption: -1 };
  const i = sceneIndexAtTime(arr, t);
  const bounds = sceneBounds(arr);
  const localT = t - bounds[i].start;
  const caps = (arr[i] && arr[i].captions) || [];
  return { scene: i, caption: captionIndexAtLocalTime(caps, localT) };
}

// The FUI ease-out curve (phase 8a): cubic-bezier(0.22, 1, 0.36, 1) as a
// function of linear time, for the director's MapLibre camera moves (which
// take an easing function, not a CSS curve). Newton solve on x, 5
// iterations; endpoints exact, monotone on [0, 1].
function storyEaseOut(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  if (x === 0 || x === 1) return x;
  const x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u;
  const sy = (u) => ((ay * u + by) * u + cy) * u;
  const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  let u = x;
  for (let i = 0; i < 5; i++) {
    const err = sx(u) - x;
    if (Math.abs(err) < 1e-4) break;
    const d = dx(u);
    if (Math.abs(d) < 1e-4) break;
    u = Math.max(0, Math.min(1, u - err / d));
  }
  return Math.max(0, Math.min(1, sy(u)));
}

// Linear camera orbit: totalDeg over spanSec from the scene start,
// holding the end value afterwards. Scene 6 runs 20 deg over
// STORY_SCENE6_ORBIT (6 s): 10 deg at 3 s, 20 deg from 6 s on.
function storyOrbitBearing(totalDeg, spanSec, localT) {
  const span = Number(spanSec);
  if (!(span > 0)) return 0;
  const frac = Math.max(0, Math.min(1, Number(localT) / span));
  return (Number(totalDeg) || 0) * frac;
}

// Phase 8b fix 5: one camera path for scenes 1, 3 and 4 (fix 4 rule),
// extended to scenes 5 and 6 in 8c-1 and to scene 9's pull-back in 8c-3.
// The full camera (centre, zoom, pitch, bearing) is a pure function of the
// scene-local time, driven from the master timeline on every update, so
// natural playback and seeks land on identical framing. Scene 1 is the
// crane move about the subject: from high (14.0/42/-30) down to the
// landing's framing (15.2/66/-30 over Carolabrücke) over the scene's
// duration on the ease-out curve; the bearing stays fixed, so the landing
// handoff (baseBearing) no longer steers it and both paths agree exactly.
// Scene 3 pulls back from the crane's end state to 12.3/40/0 over
// STORY_SCENE3_FLY on the ease-out curve. Scene 4 holds 12.3/40 with its
// northward drift. Scene 5 flies from scene 4's end pose to 15.5/62/-30
// on Carolabrücke's centroid over STORY_S5_FLY on the ease-out curve,
// then holds. Scene 6 steps to 16.0/65/-30 and orbits 20 deg linearly
// over the scene's length. Scene 9 pulls back from scene 8's pose to
// 12.3/40/0 over STORY_S9_FLY on the ease-out curve, holds the city
// until the Europe cut, then jumps to the Europe pose (3.8 on [12, 52],
// pitch 0, bearing 0) at STORY_EUROPE_CUT_AT (10.5 s, behind the dip).
// The cut replaces the continuous zoom; natural and seeks share this
// path, so seeks into the beat land on Europe directly with no dip.
// Other scenes return null (their own modes apply).
function storyCameraAt(sc, localT, baseBearing) {
  if (!sc) return null;
  void baseBearing;
  const t = Math.max(0, Number(localT) || 0);
  if (sc.id === "title") {
    const dur = (sc && Number(sc.duration) > 0) ? Number(sc.duration) : 9;
    const frac = storyEaseOut(Math.min(1, t / dur));
    return { center: STORY_TITLE_CENTER.slice(),
      zoom: STORY_CRANE_START_ZOOM +
        (STORY_TITLE_ZOOM - STORY_CRANE_START_ZOOM) * frac,
      pitch: STORY_CRANE_START_PITCH +
        (STORY_TITLE_PITCH - STORY_CRANE_START_PITCH) * frac,
      bearing: STORY_TITLE_BEARING };
  }
  if (sc.id === "twenty-bridges") {
    const frac = storyEaseOut(Math.min(1, t / STORY_SCENE3_FLY));
    return {
      center: [STORY_TITLE_CENTER[0] +
        (STORY_CITY_CENTER[0] - STORY_TITLE_CENTER[0]) * frac,
        STORY_TITLE_CENTER[1] +
        (STORY_CITY_CENTER[1] - STORY_TITLE_CENTER[1]) * frac],
      zoom: STORY_TITLE_ZOOM + (STORY_CITY_ZOOM - STORY_TITLE_ZOOM) * frac,
      pitch: STORY_TITLE_PITCH + (STORY_CITY_PITCH - STORY_TITLE_PITCH) * frac,
      bearing: STORY_TITLE_BEARING + (0 - STORY_TITLE_BEARING) * frac };
  }
  if (sc.id === "three-years") {
    let baseLon = 13.745, baseLat = 51.039;
    if (sc.camera && Array.isArray(sc.camera.center) &&
        sc.camera.center.length >= 2) {
      const lon = Number(sc.camera.center[0]), lat = Number(sc.camera.center[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        baseLon = lon; baseLat = lat;
      }
    }
    const dur = (sc && Number(sc.duration) > 0) ? Number(sc.duration) : 1;
    const frac = Math.max(0, Math.min(1, t / dur));
    const zoom = (sc.camera && sc.camera.zoom !== undefined)
      ? sc.camera.zoom : STORY_CITY_ZOOM;
    const pitch = (sc.camera && sc.camera.pitch !== undefined)
      ? sc.camera.pitch : STORY_CITY_PITCH;
    return { center: [baseLon + 0.004 * frac, baseLat + 0.002 * frac],
      zoom, pitch, bearing: 0 };
  }
  if (sc.id === "august") {
    const frac = storyEaseOut(Math.min(1, t / STORY_S5_FLY));
    return {
      center: [STORY_S4_END_CENTER[0] +
        (STORY_CLOSEUP_CENTER[0] - STORY_S4_END_CENTER[0]) * frac,
        STORY_S4_END_CENTER[1] +
        (STORY_CLOSEUP_CENTER[1] - STORY_S4_END_CENTER[1]) * frac],
      zoom: STORY_CITY_ZOOM + (STORY_S5_ZOOM - STORY_CITY_ZOOM) * frac,
      pitch: STORY_CITY_PITCH + (STORY_S5_PITCH - STORY_CITY_PITCH) * frac,
      bearing: 0 + (STORY_S5_BEARING - 0) * frac };
  }
  if (sc.id === "september") {
    const dur = (sc && Number(sc.duration) > 0) ? Number(sc.duration) : 12;
    return { center: STORY_CLOSEUP_CENTER.slice(),
      zoom: STORY_S6_ZOOM, pitch: STORY_S6_PITCH,
      bearing: STORY_S6_BEARING +
        storyOrbitBearing(STORY_S6_ORBIT, dur, t) };
  }
  if (sc.id === "ten-days-later") {
    // 8c-3 fix 2: the pull-back from scene 8's pose (close-up + push-in)
    // to the city shot (12.3/40/0) over STORY_S9_FLY on the ease-out
    // curve, the city hold until the Europe cut, then the Europe pose
    // (3.8 on [12, 52], pitch 0, bearing 0) at STORY_EUROPE_CUT_AT on.
    // The dip starts at STORY_EUROPE_AT (10 s); the jump lands behind
    // it at 10.5 s, so the dip lifts on the finished view. One camera
    // path: the per-update sync drives this for natural and seeks alike.
    if (t >= STORY_EUROPE_CUT_AT) {
      return { center: STORY_EUROPE_CENTER.slice(),
        zoom: STORY_EUROPE_ZOOM, pitch: 0, bearing: 0 };
    }
    const frac = storyEaseOut(Math.min(1, t / STORY_S9_FLY));
    return {
      center: [STORY_CLOSEUP_CENTER[0] +
        (STORY_CITY_CENTER[0] - STORY_CLOSEUP_CENTER[0]) * frac,
        STORY_CLOSEUP_CENTER[1] +
        (STORY_CITY_CENTER[1] - STORY_CLOSEUP_CENTER[1]) * frac],
      zoom: STORY_S9_START_ZOOM +
        (STORY_CITY_ZOOM - STORY_S9_START_ZOOM) * frac,
      pitch: STORY_S9_START_PITCH +
        (STORY_CITY_PITCH - STORY_S9_START_PITCH) * frac,
      bearing: STORY_S9_START_BEARING + (0 - STORY_S9_START_BEARING) * frac };
  }
  return null;
}

// Scene-1 wordmark (phase 8b fix 4): the city is seen first, then the
// wordmark enters at STORY_TITLE_AT (2 s) in the lower third and holds at
// the landing's 120 px; there is no shrink. Reduced motion shows it at
// once (it is content, not motion).
function storyTitleShown(localT, reduced) {
  if (reduced) return true;
  return Number(localT) >= STORY_TITLE_AT;
}

// Scene-4 month wordmark text (phase 8b): the bound month's name in
// uppercase over the year, from the cutoff only. Unparseable cutoffs give
// empty strings, never a wrong month.
function storyMonthWordParts(cutoff) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(cutoff || "");
  if (!m) return { month: "", year: "" };
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return { month: "", year: "" };
  return { month: STORY_MONTHS_FULL[mi].toUpperCase(), year: m[1] };
}

// Phase 8b fix: zoom-driven opacities. Span dots hide below 13.5 in
// story mode (ramp 13.2-13.6, never popping) and show in Explore and
// the close-ups; bridge fills sit at 0.12 below 13 and 0.38 at 15+.
const STORY_SPANS_OPACITY = 0.92;
const STORY_SPANS_STROKE = 0.6;
const STORY_SPANS_Z0 = 13.2;
const STORY_SPANS_Z1 = 13.6;
const STORY_FILL_Z0 = 13;
const STORY_FILL_Z1 = 15;
const STORY_FILL_MIN = 0.12;
const STORY_FILL_MAX = 0.38;

function storySpansOpacityAtZoom(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return 0;
  if (z <= STORY_SPANS_Z0) return 0;
  if (z >= STORY_SPANS_Z1) return STORY_SPANS_OPACITY;
  const f = (z - STORY_SPANS_Z0) / (STORY_SPANS_Z1 - STORY_SPANS_Z0);
  return STORY_SPANS_OPACITY * f;
}

function storySpansStrokeAtZoom(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return 0;
  if (z <= STORY_SPANS_Z0) return 0;
  if (z >= STORY_SPANS_Z1) return STORY_SPANS_STROKE;
  const f = (z - STORY_SPANS_Z0) / (STORY_SPANS_Z1 - STORY_SPANS_Z0);
  return STORY_SPANS_STROKE * f;
}

function storySpansOpacityExpr() {
  return ["interpolate", ["linear"], ["zoom"],
    STORY_SPANS_Z0, 0, STORY_SPANS_Z1, STORY_SPANS_OPACITY];
}

function storySpansStrokeExpr() {
  return ["interpolate", ["linear"], ["zoom"],
    STORY_SPANS_Z0, 0, STORY_SPANS_Z1, STORY_SPANS_STROKE];
}

function storyFillOpacityAtZoom(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return STORY_FILL_MIN;
  if (z <= STORY_FILL_Z0) return STORY_FILL_MIN;
  if (z >= STORY_FILL_Z1) return STORY_FILL_MAX;
  const f = (z - STORY_FILL_Z0) / (STORY_FILL_Z1 - STORY_FILL_Z0);
  return STORY_FILL_MIN + (STORY_FILL_MAX - STORY_FILL_MIN) * f;
}

function storyFillOpacityExpr() {
  return ["interpolate", ["linear"], ["zoom"],
    STORY_FILL_Z0, STORY_FILL_MIN, STORY_FILL_Z1, STORY_FILL_MAX];
}

// Phase 8b fix 2: history-strip cell geometry. Cells fill the band width:
// unit (cell + gap) = (band width - label column) / months, 9 px tall,
// 1 px gaps (10 px row pitch, 20 rows = 200 px). Pure; the browser
// renderer uses it per width.
function storyHistoryGeometry(bandW, nMonths, nRows, labelW) {
  const W = Number(bandW) || 0;
  const nM = Number(nMonths) || 33;
  const nR = Number(nRows) || 20;
  const lab = (labelW === undefined || labelW === null) ? 150 : Number(labelW);
  const gap = 1, cellH = 9;
  const unit = nM > 0 ? Math.max(gap + 1, (W - lab) / nM) : gap + 1;
  const cellW = Math.max(1, unit - gap);
  return { labelW: lab, cellW, cellH, gap, unit,
    W, H: nR * (cellH + gap) };
}

// Step camera patch (scene 6): the jumpTo patch for a "step" camera,
// carrying the scene's bridge centroid as well as zoom, pitch and the
// scene's bearing (8c-1: -30; older scenes default 0), so a seek lands
// on the same framing as natural play. centroid is [lon, lat] (null
// when unknown: the patch keeps the current centre, the pre-7d
// behaviour).
function stepCameraPatch(camera, centroid) {
  const c = camera || {};
  const patch = { bearing: (c.bearing === undefined) ? 0 : c.bearing };
  if (c.zoom !== undefined) patch.zoom = c.zoom;
  if (c.pitch !== undefined) patch.pitch = c.pitch;
  if (centroid) patch.center = centroid.slice ? centroid.slice() : centroid;
  return patch;
}

// Scene-4 replay guard: a month beyond the revealed position may only be
// bound through the sanctioned advance (forward stepping or an explicit
// seek), never by a stale async continuation.
function scene4Allowed(highWater, idx) {
  return idx <= highWater;
}

// Scene-7 typing: characters shown at scene-local time localT.
function memoTypedChars(localT, total) {
  const n = Math.floor(Number(localT) * STORY_MEMO_CPS);
  return Math.max(0, Math.min(Number(total) || 0, n));
}

// Scene-7 highlight range: the sentence containing "prompt inspection",
// or the first sentence of the Verdict section when that phrase is absent.
// Returns {start, end} offsets into text, or null when neither is found.
// Never matches inside the Owner condition section (that section is never
// highlighted).
function memoHighlightRange(text) {
  const s = String(text === null || text === undefined ? "" : text);
  if (!s) return null;
  const ownerAt = s.indexOf("## Owner condition");
  const inOwner = (i) => ownerAt !== -1 && i >= ownerAt;
  const sentenceAt = (idx) => {
    // Expand idx to the enclosing sentence: back to the previous
    // [.?!newline] boundary, forward to the next [.?!] or newline.
    let a = idx;
    while (a > 0 && ".?!\n".indexOf(s[a - 1]) === -1) a--;
    while (a < s.length && (s[a] === " " || s[a] === "\n")) a++;
    let b = idx;
    while (b < s.length && ".?!".indexOf(s[b]) === -1 && s[b] !== "\n") b++;
    if (b < s.length && ".?!".indexOf(s[b]) !== -1) b++;
    return { start: a, end: b };
  };
  const phrase = "prompt inspection";
  let pi = s.indexOf(phrase);
  while (pi !== -1 && inOwner(pi)) pi = s.indexOf(phrase, pi + 1);
  if (pi !== -1) return sentenceAt(pi);
  // Fallback: first sentence after the Verdict heading.
  const vh = s.indexOf("## Verdict");
  if (vh !== -1 && !inOwner(vh)) {
    let p = vh + "## Verdict".length;
    while (p < s.length && (s[p] === " " || s[p] === "\n" || s[p] === "\r")) p++;
    if (p < s.length && !inOwner(p)) return sentenceAt(p);
  }
  return null;
}

// Scene-7 rendered reveal (phase 7c fix): characters shown at
// scene-local time localT. Counts rendered text (H1 and Cutoff skipped),
// 40 chars/s, clamped to total when given.
function revealedCount(localT, total) {
  const raw = Number(localT);
  const n = Number.isFinite(raw) ? Math.floor(raw * STORY_MEMO_CPS) : 0;
  const c = Math.max(0, n);
  if (total === undefined || total === null) return c;
  return Math.max(0, Math.min(Number(total) || 0, c));
}

function memoIsWs(s) {
  return /^\s*$/.test(String(s === null || s === undefined ? "" : s));
}

function memoTextKids(node) {
  try {
    return node && node.childNodes ? Array.from(node.childNodes) : [];
  } catch (e) { return []; }
}

function memoTextOf(node) {
  try {
    if (node.textContent !== undefined && node.textContent !== null) {
      return String(node.textContent);
    }
  } catch (e) { /* fall through to data */ }
  try { return String(node.data || ""); } catch (e) { return ""; }
}

function memoSetText(node, s) {
  try { node.textContent = s; } catch (e) { /* ignore */ }
  try { if (node && ("data" in node)) node.data = s; } catch (e) { /* ignore */ }
}

// Concatenated descendant text (works on real DOM and on the plain
// {nodeType, childNodes, textContent} fakes the node tests use).
function memoElemText(el) {
  if (!el) return "";
  if (el.nodeType === 3) return memoTextOf(el);
  if (el.nodeType !== 1) return "";
  let s = "";
  for (const k of memoTextKids(el)) s += memoElemText(k);
  return s;
}

function memoTag(el) {
  try { return String(el.tagName || "").toUpperCase(); } catch (e) { return ""; }
}

function memoIsHeading(el) {
  if (!el || el.nodeType !== 1) return false;
  const t = memoTag(el);
  return t === "H1" || t === "H2" || t === "H3";
}

// Total rendered characters: sum of non-whitespace text-node lengths.
// Whitespace-only nodes (the "\n" separators renderMemo emits) never count.
function renderedTextLength(root) {
  let total = 0;
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      const full = memoTextOf(node);
      if (memoIsWs(full)) return;
      total += full.length;
    } else if (node.nodeType === 1) {
      for (const k of memoTextKids(node)) walk(k);
    }
  };
  walk(root);
  return total;
}

// Reveal the first n rendered characters in place: text nodes past the
// budget are emptied (the boundary node truncated), and elements with no
// visible text are hidden, so headings, paragraphs, list items and table
// cells appear as their text is reached and a table row appears when its
// first cell is reached. Returns the characters shown. The root itself is
// never hidden. Callers rebuild from the cached full HTML on every sync,
// so scrubbing backwards restores hidden text.
function revealNodes(root, n) {
  const budget = Math.max(0, Math.floor(Number(n) || 0));
  let remaining = budget;
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      const full = memoTextOf(node);
      if (memoIsWs(full)) return;
      if (remaining <= 0) {
        memoSetText(node, "");
      } else if (full.length <= remaining) {
        remaining -= full.length;
      } else {
        memoSetText(node, full.slice(0, remaining));
        remaining = 0;
      }
    } else if (node.nodeType === 1) {
      for (const k of memoTextKids(node)) walk(k);
    }
  };
  walk(root);
  const hidePass = (node, isRoot) => {
    if (!node || node.nodeType !== 1) return false;
    let vis = false;
    for (const k of memoTextKids(node)) {
      if (k.nodeType === 3) {
        const t = memoTextOf(k);
        if (t.length > 0 && !memoIsWs(t)) vis = true;
      } else if (k.nodeType === 1) {
        if (hidePass(k, false)) vis = true;
      }
    }
    if (!isRoot) {
      try { if (node.style) node.style.display = vis ? "" : "none"; } catch (e) { /* ignore */ }
    }
    return vis;
  };
  hidePass(root, true);
  return budget - remaining;
}

// Highlight range in rendered counting (same units revealNodes uses):
// the sentence containing "prompt inspection", or the first sentence
// under the Verdict heading when that phrase is absent. Never matches
// inside the Owner condition section. Returns {start, end, sentence} or
// null. Whitespace-only nodes neither count nor match.
function renderedHighlightRange(root) {
  if (!root || root.nodeType !== 1) return null;
  const top = memoTextKids(root);
  let ownerStart = -1, ownerEnd = top.length;
  let verdictStart = -1, verdictEnd = top.length;
  for (let i = 0; i < top.length; i++) {
    if (!memoIsHeading(top[i])) continue;
    const ht = memoElemText(top[i]).trim();
    if (ht.indexOf("Owner condition") === 0 && ownerStart === -1) {
      ownerStart = i;
      for (let j = i + 1; j < top.length; j++) {
        if (memoIsHeading(top[j])) { ownerEnd = j; break; }
      }
    }
    if (ht === "Verdict" && verdictStart === -1) {
      verdictStart = i;
      for (let j = i + 1; j < top.length; j++) {
        if (memoIsHeading(top[j])) { verdictEnd = j; break; }
      }
    }
  }
  const segs = [];
  let offset = 0;
  const walk = (node, topIdx) => {
    if (!node) return;
    if (node.nodeType === 3) {
      const full = memoTextOf(node);
      if (memoIsWs(full)) return;
      const start = offset;
      offset += full.length;
      segs.push({
        text: full, start, end: offset,
        inOwner: ownerStart !== -1 && topIdx >= ownerStart && topIdx < ownerEnd,
        inVerdict: verdictStart !== -1 && topIdx > verdictStart && topIdx < verdictEnd
      });
    } else if (node.nodeType === 1) {
      const kids = memoTextKids(node);
      if (node === root) {
        for (let i = 0; i < kids.length; i++) walk(kids[i], i);
      } else {
        for (const k of kids) walk(k, topIdx);
      }
    }
  };
  walk(root, -1);
  const sentenceAt = (text, idx) => {
    let a = idx;
    while (a > 0 && ".?!\n".indexOf(text[a - 1]) === -1) a--;
    while (a < text.length && (text[a] === " " || text[a] === "\n")) a++;
    let b = idx;
    while (b < text.length && ".?!".indexOf(text[b]) === -1 && text[b] !== "\n") b++;
    if (b < text.length && ".?!".indexOf(text[b]) !== -1) b++;
    return { start: a, end: b };
  };
  const phrase = "prompt inspection";
  for (const s of segs) {
    if (s.inOwner) continue;
    const pi = s.text.indexOf(phrase);
    if (pi !== -1) {
      const local = sentenceAt(s.text, pi);
      return {
        start: s.start + local.start,
        end: s.start + local.end,
        sentence: s.text.slice(local.start, local.end)
      };
    }
  }
  for (const s of segs) {
    if (!s.inVerdict || s.inOwner) continue;
    let p = 0;
    while (p < s.text.length && (s.text[p] === " " || s.text[p] === "\n" || s.text[p] === "\r")) p++;
    if (p >= s.text.length) continue;
    const local = sentenceAt(s.text, p);
    return {
      start: s.start + local.start,
      end: s.start + local.end,
      sentence: s.text.slice(local.start, local.end)
    };
  }
  return null;
}

// Scene-8 count-in: value at localT counting 0 -> target over
// STORY_PROOF_COUNT seconds. Reduced motion shows the final state.
function proofCountValue(target, localT, reduced) {
  const v = Number(target);
  if (reduced) return Number.isNaN(v) ? 0 : v;
  const frac = Math.max(0, Math.min(1, Number(localT) / STORY_PROOF_COUNT));
  return (Number.isNaN(v) ? 0 : v) * frac;
}

// Scene-8 checks: how many quantity rows show a check at localT (the
// count-in first, then one check every STORY_PROOF_GAP).
function proofChecksShown(localT, total, reduced) {
  const n = Number(total) || 0;
  if (reduced) return n;
  const t = Number(localT);
  if (t < STORY_PROOF_COUNT) return 0;
  return Math.max(0, Math.min(n, Math.floor((t - STORY_PROOF_COUNT) / STORY_PROOF_GAP) + 1));
}

// Phase 8c-2: the bridge footprint (bridges-fill and its outline) hides
// in the close-up scenes 5-8, where the slab is the bridge, and restores
// on exit. 8c-3 extends the hide to scene 9 (the city, the reticles and
// the date only: no footprint fills). Pure; the browser path hides via
// layout visibility.
function storyHidesFootprint(sceneId) {
  return STORY_CLOSEUP_IDS.indexOf(sceneId) !== -1 ||
    sceneId === "ten-days-later";
}

// Phase 8c-2 evidence card: visible from the "SAM 3.1 found the bridge"
// caption (STORY_EVIDENCE_AT) to the scene end. Pure.
function storyEvidenceShown(localT) {
  return Number(localT) >= STORY_EVIDENCE_AT;
}

// Scene-9 Europe dots: how many cities are lit at localT. 8c-3 fix 2:
// the dots start lighting as the dip lifts (one by one from
// STORY_EUROPE_CUT_AT to the scene end); all at once under reduced
// motion (which has no dip, so from STORY_EUROPE_AT).
function europeLitCount(localT, total, duration, reduced) {
  const n = Number(total) || 0;
  const t = Number(localT);
  if (reduced) {
    if (t < STORY_EUROPE_AT) return 0;
    return n;
  }
  if (t < STORY_EUROPE_CUT_AT) return 0;
  const span = Math.max(0.001, Number(duration) - STORY_EUROPE_CUT_AT);
  return Math.max(0, Math.min(n, Math.floor((t - STORY_EUROPE_CUT_AT) / span * n) + 1));
}

// Caption data for the bound cutoff. ctx: {cutoffIdx, cutoffs, decisions,
// id2name, counts:{n_bridges,n_monitored,n_not_monitored}, eventDate,
// eventAsset}. Only the bound cutoff's table is read, plus the authored
// collapse facts the spec allows (event date/bridge, city totals).
function captionDataFor(sceneId, ctx) {
  const cutoffs = (ctx && ctx.cutoffs) || [];
  const rawIdx = (ctx && typeof ctx.cutoffIdx === "number") ? ctx.cutoffIdx : 0;
  const idx = Math.max(0, Math.min(rawIdx, cutoffs.length - 1));
  const cutoff = cutoffs[idx];
  const table = ((ctx && ctx.decisions) || {})[cutoff] || {};
  const counts = (ctx && ctx.counts) || {};
  const last = cutoffs[cutoffs.length - 1];
  void sceneId;
  return {
    month: storyMonthLabel(cutoff),
    cutoff,
    event_date: storyFmtEventDate(ctx && ctx.eventDate),
    event_asset: (ctx && ctx.eventAsset) || "",
    days: (last && ctx && ctx.eventDate) ? storyDaysBetween(last, ctx.eventDate) : "",
    n_bridges: (counts.n_bridges === undefined || counts.n_bridges === null) ? "" : counts.n_bridges,
    n_monitored: (counts.n_monitored === undefined || counts.n_monitored === null) ? "" : counts.n_monitored,
    n_not: (counts.n_not_monitored === undefined || counts.n_not_monitored === null) ? "" : counts.n_not_monitored,
    n_high: highCount(table)
  };
}

// ---------- Browser part: the director ----------
// Everything below runs only in the page. It talks to web/index.html's
// globals (CUT, DEC, ID2NAME, NAME2ID, CENTROIDS, MEMO_CUTOFFS, EVENT_DATE,
// EVENT_ASSET, N_BRIDGES/N_MONITORED/N_NOT_MONITORED, cutoffIdx, map,
// applyCutoff, selectBridge, setBasemap, setLayerVisible) after that page
// dispatches "radartwin:ready". Nothing here runs under node.

let storyScenes = [];
let storyBounds = [];
let storyMaster = null;
let storyState = "idle"; // idle | playing | paused | ended
let storyScene = 0;
let storyMonth = -1;
let storyCaptionKey = "";
let storyScrubbing = false;
let storyScrubDragging = false;
let storyRunToken = 0;
let storyEnterToken = 0;
let storyHighWater = -1; // scene-4 replay position: furthest month revealed
let storyHits = [];
let storyHitsFired = {};
let storyCalloutTimers = [];
let storyCcOn = true;
let storyEls = {};
let storyScene3Order = [];
let storyScene3Lit = -1;
let storyS4Callouts = [];
let storyGlowPulsed = "";
let storyExplainerOn = false;
let storyMemoText = "";
let storyMemoCutoff = "";
let storyMemoRange = null;
let storyMemoHtml = "";
let storyMemoTotal = 0;
let storyMemoHl = null;
let storyS2On = false;
let storySamOn = false;
let storyEvidenceData = null;
let storyEvidenceDrawn = false;
let storyProof = null;
let storyEuropeN = -1;
let storyEuropeCam = false;
// 8c-3 fix: the hidden Europe tile warmer (one MapLibre instance at the
// Europe pose, created on scene 8 entry, removed on scene 9 end or any
// seek out of scenes 8-9; never more than one).
let storyEuropeWarmer = null;
let storyEuropeWarmerEl = null;
// Phase 8b landing: the preloader gates, the slow orbit behind the
// landing, and the scene-4 month wordmark key.
let storyLandingCamReady = false;
let storyLandingUiReady = false;
let storyLandingBearing = 0;
let storyLandingOrbitOn = false;
let storyLandingOrbitRaf = 0;
let storyLandingOrbitLast = 0;
let storyMonthWordKey = "";

function storyHasGsap() {
  return (typeof gsap !== "undefined") && gsap !== null;
}

function storyReduced() {
  if (typeof REDUCED !== "undefined") return !!REDUCED;
  try {
    return !!(typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) { return false; }
}

function storyMode() {
  try { return document.body.dataset.mode || "story"; } catch (e) { return "story"; }
}

function storyEl(id) {
  if (!storyEls[id]) {
    try { storyEls[id] = document.getElementById(id); } catch (e) { storyEls[id] = null; }
  }
  return storyEls[id];
}

function storyScene4Lead() {
  return storyReduced() ? STORY_SCENE4_LEAD_REDUCED : STORY_SCENE4_LEAD;
}

function storyMonthAtLocalTime(localT) {
  const n = (typeof CUT !== "undefined" && CUT) ? CUT.length : 0;
  if (n <= 0) return 0;
  const m = Math.floor((localT - storyScene4Lead()) / STORY_MONTH_STEP);
  return Math.max(0, Math.min(n - 1, m));
}

// Set the dashboard month through the existing path so Explore is in step.
function storySetCutoffIndex(idx) {
  const n = (typeof CUT !== "undefined" && CUT) ? CUT.length : 0;
  if (n <= 0) return;
  const c = Math.max(0, Math.min(n - 1, idx));
  try { cutoffIdx = c; } catch (e) { return; }
  try {
    if (typeof applyCutoff === "function") applyCutoff();
  } catch (e) { /* dashboard not ready yet */ }
}

// Guarded bind: during scene 4 a month beyond the replay position may
// only be bound through the sanctioned advance, never by stale async
// work. Assert and skip, never show.
function storyBindCutoffIndex(idx, sanctioned) {
  const sc = storyScenes[storyScene];
  if (sc && sc.id === "three-years" && !sanctioned &&
      !scene4Allowed(storyHighWater, idx)) {
    try {
      if (typeof console !== "undefined" && console.assert) {
        console.assert(false,
          `story: refused scene-4 bind to month ${idx} beyond replay position ${storyHighWater}`);
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  storySetCutoffIndex(idx);
  return true;
}

function storyCutoffIndexOf(cutoff) {
  try {
    if (typeof CUT === "undefined" || !CUT) return 0;
    const i = CUT.indexOf(cutoff);
    return i === -1 ? CUT.length - 1 : i;
  } catch (e) { return 0; }
}

// waitFor entries resolve against real readiness with a 4 s timeout that
// degrades to a cut. Returns {timedOut}.
function storyTilesReady() {
  return new Promise((resolve) => {
    try {
      if (typeof map === "undefined" || !map) { resolve("no-map"); return; }
      if (map.areTilesLoaded && map.areTilesLoaded()) { resolve("idle"); return; }
      let done = false;
      const finish = (why) => { if (!done) { done = true; resolve(why); } };
      const to = setTimeout(() => finish("tiles-inner-timeout"), STORY_WAIT_TIMEOUT);
      try {
        map.once("idle", () => { clearTimeout(to); finish("idle"); });
      } catch (e) { clearTimeout(to); finish("idle-error"); }
    } catch (e) { resolve("tiles-error"); }
  });
}

function storyMemoReady(cutoff) {
  return new Promise((resolve) => {
    try {
      if (typeof MEMO_CUTOFFS === "undefined" || MEMO_CUTOFFS.indexOf(cutoff) === -1) {
        resolve("no-memo");
        return;
      }
      fetch(`data/memos/${cutoff}.md`).then(
        () => resolve("memo"),
        () => resolve("memo-fail"));
    } catch (e) { resolve("memo-error"); }
  });
}

function storyWaitForReady(list, cutoff) {
  const jobs = (list || []).map((w) => {
    if (w === "tiles") return storyTilesReady();
    if (w === "memo") return storyMemoReady(cutoff);
    if (w === "fonts") {
      try {
        if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
          return document.fonts.ready.then(() => "fonts");
        }
      } catch (e) { /* fall through */ }
      return Promise.resolve("no-fonts");
    }
    return Promise.resolve("unknown-wait");
  });
  return Promise.race([
    Promise.all(jobs).then(() => ({ timedOut: false })),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), STORY_WAIT_TIMEOUT))
  ]);
}

function storyStopCamera() {
  try { if (typeof map !== "undefined" && map && map.stop) map.stop(); } catch (e) { /* ignore */ }
}

function storyApplyCamera(sc, cut) {
  storyStopCamera();
  try {
    if (typeof map === "undefined" || !map) return;
    const c = (sc && sc.camera) || {};
    const reduced = storyReduced();
    // Fix 4: scenes 1, 3 and 4 share one playhead-driven path
    // (storyCameraAt), extended to scenes 5 and 6 in 8c-1 and to scene 9's
    // pull-back in 8c-3. The landing backdrop (story not started) holds
    // the crane's end framing for the orbit; every scene entry jumps to
    // the path's start so natural play and seeks begin identically, and
    // the per-update sync animates from there. Reduced motion lands
    // scenes 1, 3, 5 and 9 at their end states at once; scene 6 holds its
    // step pose (the orbit is motion).
    if (sc && (sc.id === "title" || sc.id === "twenty-bridges" ||
        sc.id === "three-years" || sc.id === "august" ||
        sc.id === "september" || sc.id === "ten-days-later") &&
        typeof storyCameraAt === "function") {
      let started = true;
      try { started = storyHasStarted(); } catch (e) { started = true; }
      if (sc.id === "title" && !started) {
        if (map.jumpTo) {
          map.jumpTo({ center: STORY_TITLE_CENTER.slice(),
            zoom: STORY_TITLE_ZOOM, pitch: STORY_TITLE_PITCH,
            bearing: STORY_TITLE_BEARING });
        }
        return;
      }
      let at = 0;
      if (reduced && sc.id === "title") at = (sc.duration || 9);
      if (reduced && sc.id === "twenty-bridges") at = STORY_SCENE3_FLY;
      if (reduced && sc.id === "august") at = STORY_S5_FLY;
      if (reduced && sc.id === "ten-days-later") at = STORY_S9_FLY;
      let cam = null;
      try { cam = storyCameraAt(sc, at, 0); } catch (e) { cam = null; }
      if (cam && map.jumpTo) {
        map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch,
          bearing: cam.bearing || 0 });
        return;
      }
    }
    if (c.mode === "hold") {
      if (c.pushIn && !cut && !reduced) {
        map.easeTo({ zoom: map.getZoom() + c.pushIn, duration: 2000,
          easing: storyEaseOut });
      }
      return;
    }
    if (c.mode === "step") {
      // One step: centre the scene's bridge and set the scene's bearing
      // (stepCameraPatch). Scene 6 travels the one camera path now
      // (storyCameraAt + the playhead sync, 8c-1), so this branch is the
      // fallback for other step scenes; every entry starts from a known
      // bearing. The jumpTo carries the centroid, so a seek lands on the
      // same framing as natural play; playing 5 into 6 is still one
      // continuous shot (the centroid is already the centre). Falls back
      // to Carolabrücke, like "bridge" mode.
      try {
        if (map.jumpTo) {
          let centroid = null;
          try {
            let id = null;
            if (typeof NAME2ID !== "undefined" && NAME2ID) {
              id = NAME2ID[c.bridge] || NAME2ID["Carolabrücke"] || null;
            }
            if (id && typeof CENTROIDS !== "undefined" && CENTROIDS && CENTROIDS[id]) {
              centroid = CENTROIDS[id];
            }
          } catch (e) { centroid = null; }
          map.jumpTo(stepCameraPatch(c, centroid));
        }
      } catch (e) { /* ignore */ }
      return;
    }
    const CITY = [13.745, 51.057];
    let center = CITY.slice();
    let zoom = 12;
    let pitch = 40;
    if (c.mode === "bridge") {
      let id = null;
      try {
        if (typeof NAME2ID !== "undefined" && NAME2ID) {
          id = NAME2ID[c.bridge] || NAME2ID["Carolabrücke"] || null;
        }
      } catch (e) { id = null; }
      try {
        if (id && typeof CENTROIDS !== "undefined" && CENTROIDS && CENTROIDS[id]) {
          center = CENTROIDS[id];
        }
      } catch (e) { /* keep city centre */ }
      zoom = c.zoom || 15;
      pitch = (c.pitch === undefined) ? 60 : c.pitch;
    } else {
      if (c.zoom !== undefined) zoom = c.zoom;
      if (c.pitch !== undefined) pitch = c.pitch;
      if (Array.isArray(c.center) && c.center.length >= 2) {
        const lon = Number(c.center[0]), lat = Number(c.center[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) center = [lon, lat];
      }
    }
    // Orbit and drift are functions of the playhead in storySyncCamera
    // (jumpTo per update) so they scrub and survive seeks. Jump to the
    // scene's start now so no ease is in flight for the sync to fight.
    const playheadDriven = !reduced && (c.orbit || c.drift);
    if (cut || reduced || playheadDriven) {
      map.jumpTo({ center, zoom, pitch, bearing: 0 });
    } else if (c.mode === "bridge" || c.mode === "pullback") {
      map.easeTo({ center, zoom, pitch, bearing: 0, duration: 2000,
        easing: storyEaseOut });
    } else if (sc && sc.id === "twenty-bridges") {
      map.easeTo({ center, zoom, pitch, bearing: 0, duration: 2400,
        easing: storyEaseOut });
    } else {
      map.easeTo({ center, zoom, pitch, bearing: 0, duration: 1800,
        easing: storyEaseOut });
    }
  } catch (e) { /* map not ready; the dashboard still binds */ }
}

function storyApplyLayers(sc) {
  const L = (sc && sc.layers) || {};
  try {
    if (L.basemap && typeof setBasemap === "function") setBasemap(L.basemap);
    if (typeof setLayerVisible === "function") {
      setLayerVisible("btnSam", "sam-lines", !!L.sam);
      setLayerVisible("btnRadar", "s1-raster", !!L.radar);
      setLayerVisible("btnScatter", "scatterers-circles", !!L.scatterers);
    }
  } catch (e) { /* ignore */ }
}

function storyCarolaId() {
  try {
    if (typeof NAME2ID !== "undefined" && NAME2ID) {
      return NAME2ID["Carolabrücke"] || null;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// Span callout for scenes 5-6: the fastest span at monthIdx with its
// value ("+3.2 mm/yr" style). Reads only the bound month's anomaly.
// Phase 8c-1: the spanCallout flag draws the bracketed label with no
// filled box and the mm/yr value in 18 px mono (spec section 5).
function storySpanCallout(bid, monthIdx, calloutId) {
  try {
    if (typeof SPANS === "undefined" || !SPANS) return null;
    if (typeof fastestSpan !== "function") return null;
    const arr = SPANS[bid] || [];
    const best = fastestSpan(arr, monthIdx);
    if (!best) return null;
    let val = "no data";
    try {
      if (typeof formatSpanValue === "function") val = formatSpanValue(best.value);
    } catch (e) { /* keep fallback */ }
    let name = bid;
    try { if (typeof ID2NAME !== "undefined" && ID2NAME) name = ID2NAME[bid] || bid; } catch (e) { /* ignore */ }
    return { id: calloutId, lon: best.lon, lat: best.lat,
      title: `${name} span ${best.span}`, sub: String(val),
      spanCallout: true };
  } catch (e) { return null; }
}

// Scene 5-6 side view: render Carolabrücke's deck at monthIdx into the
// slide-in panel beside the map. Slides in with GSAP (appears under
// reduced motion); the deck itself rises via AnnotateRenderSideView.
// Phase 8c-1 (spec section 5): the title reads SIDE VIEW on a hairline
// rule with the VERTICAL ×N note at its right (×7 for Carolabrücke),
// and one mono caption line sits beneath.
function storyShowSideView(monthIdx) {
  const panel = storyEl("sceneSideView");
  const svg = storyEl("sceneSideSvg");
  if (!panel || !svg) return;
  const bid = storyCarolaId();
  try {
    if (typeof AnnotateRenderSideView === "function" && bid &&
        typeof SPANS !== "undefined" && SPANS) {
      let lenM = null;
      try {
        if (typeof BRIDGE_PROPS !== "undefined" && BRIDGE_PROPS && BRIDGE_PROPS[bid]) {
          lenM = BRIDGE_PROPS[bid].len_m;
        }
      } catch (e) { /* ignore */ }
      const geo = AnnotateRenderSideView(svg, SPANS[bid] || [], monthIdx, lenM, {});
      const title = storyEl("sceneSideTitle");
      if (title && geo) {
        const times = Math.round(Number(geo.factor) || 0);
        title.innerHTML = "";
        const t = document.createElement("span");
        t.className = "sv-title";
        t.textContent = "SIDE VIEW";
        const rule = document.createElement("span");
        rule.className = "sv-rule";
        rule.setAttribute("aria-hidden", "true");
        const f = document.createElement("span");
        f.className = "sv-factor";
        f.textContent = `VERTICAL ×${times}`;
        title.appendChild(t);
        title.appendChild(rule);
        title.appendChild(f);
      }
      const note = storyEl("sceneSideNote");
      if (note && geo) {
        note.textContent = "Sections displaced by this month's movement.";
      }
    }
  } catch (e) { /* panel still shows */ }
  const wasHidden = panel.hasAttribute("hidden");
  storyShow(panel, true);
  // No storyXfade here: the slide-in below is already a 600 ms reveal.
  if (wasHidden && !storyReduced() && storyHasGsap()) {
    try {
      gsap.from(panel, { x: "100%", opacity: 0, duration: 0.6, ease: "power2.out" });
    } catch (e) { /* ignore */ }
  }
}

function storyHideSideView() {
  storyShow(storyEl("sceneSideView"), false);
}

// ---------- Phase 7d: 3D deck + HUD for scenes 5-6 ----------

// Long-axis bearing for a bridge id from the dashboard's bridge polygons.
function storyAxisBearing(bid) {
  try {
    if (typeof deckAxisBearing !== "function") return 0;
    if (typeof BRIDGES === "undefined" || !BRIDGES) return 0;
    const f = BRIDGES.find((x) => x && x.properties &&
      String(x.properties.id) === String(bid));
    if (!f || !f.geometry) return 0;
    const g = f.geometry;
    let ring = null;
    if (g.type === "Polygon" && g.coordinates && g.coordinates[0]) {
      ring = g.coordinates[0];
    } else if (g.type === "MultiPolygon" && g.coordinates && g.coordinates[0]) {
      ring = g.coordinates[0][0];
    }
    if (!ring) return 0;
    return deckAxisBearing(ring);
  } catch (e) { return 0; }
}

function storyRingRadii() {
  try {
    if (typeof DECK_RING_RADII_M !== "undefined" && DECK_RING_RADII_M) {
      return DECK_RING_RADII_M.slice(0, 2);
    }
  } catch (e) { /* fall through */ }
  return [250, 300];
}

// Show Carolabrücke's deck, rings and HUD for the scene's bound month.
// Reads only that month's spans and decisions. Phase 8c-1: the deck
// shows in seated mode (the slab on piers); scene 6 retargets the August
// deck with a 600 ms tilt tween (instant under reduced motion); any
// other entry shows the month's deck directly. The HUD counts up on
// scene 5's entry and crossfades on the month change into scene 6
// (final values under reduced motion). On the phone layout the deck and
// rings stay off (the side view carries the deck) but the HUD still
// shows, collapsed to name + risk by CSS.
function storyDeckShowForScene(sc) {
  if (!sc) return;
  const bid = storyCarolaId();
  if (!bid) return;
  const midx = storyCutoffIndexOf(sc.cutoff);
  let d = {}, cname = bid, n = 19;
  try {
    if (typeof CUT !== "undefined" && CUT && typeof DEC !== "undefined" && DEC) {
      d = (DEC[CUT[midx]] || {})[bid] || {};
    }
    if (typeof ID2NAME !== "undefined" && ID2NAME) cname = ID2NAME[bid] || bid;
    if (typeof N_MONITORED !== "undefined") n = N_MONITORED;
  } catch (e) { /* defaults stand */ }
  const risk = (d.model && d.model.risk) || "unknown";
  const isSeptember = sc.id === "september";
  try {
    if (typeof Deck3DShow === "function" &&
        typeof SPANS !== "undefined" && SPANS) {
      let lenM = null;
      try {
        if (typeof BRIDGE_PROPS !== "undefined" && BRIDGE_PROPS &&
            BRIDGE_PROPS[bid]) {
          lenM = BRIDGE_PROPS[bid].len_m;
        }
      } catch (e) { /* ignore */ }
      let centroid = null;
      try {
        if (typeof CENTROIDS !== "undefined" && CENTROIDS) {
          centroid = CENTROIDS[bid] || null;
        }
      } catch (e) { /* ignore */ }
      if (centroid && typeof map !== "undefined" && map) {
        let showing = null;
        try {
          if (typeof Deck3DIsShowing === "function") {
            showing = Deck3DIsShowing();
          }
        } catch (e) { showing = null; }
        if (isSeptember && showing === String(bid) &&
            typeof Deck3DUpdate === "function") {
          Deck3DUpdate(map, midx, { tweenMs: 600 });
        } else {
          Deck3DShow(map, { bid, spans: SPANS[bid] || [], cutoffIdx: midx,
            lenM, centroid, risk, axisBearing: storyAxisBearing(bid),
            mode: "seated", tweenMs: 0 });
        }
      }
    }
  } catch (e) { /* the side view is the fallback, never fatal */ }
  try {
    if (typeof CENTROIDS !== "undefined" && CENTROIDS && CENTROIDS[bid] &&
        typeof AnnotateSetRings === "function") {
      AnnotateSetRings(CENTROIDS[bid][0], CENTROIDS[bid][1], storyRingRadii());
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof AnnotateSetHud === "function") {
      AnnotateSetHud({ name: cname, cutoff: sc.cutoff, rank: d.rank,
        n, z: d.z, risk },
        { transition: isSeptember ? "xfade" : "count" });
    }
  } catch (e) { /* ignore */ }
}

function storyDeckHide() {
  try {
    if (typeof Deck3DHide === "function" &&
        typeof map !== "undefined" && map) {
      Deck3DHide(map);
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof AnnotateClearRings === "function") AnnotateClearRings();
  } catch (e) { /* ignore */ }
  try {
    if (typeof AnnotateClearHud === "function") AnnotateClearHud();
  } catch (e) { /* ignore */ }
}

// Phase 8c-2 scenes 7-8: the seated deck stays in frame (same month as
// scene 6's end pose, same 0.3 push-in camera), but the HUD card and the
// rings belong to scenes 5-6 only, so they clear while the slab remains.
// When seeking straight into 7/8 the deck shows directly.
function storyDeckKeepForScene(sc) {
  if (!sc) return;
  const bid = storyCarolaId();
  if (!bid) return;
  const midx = storyCutoffIndexOf(sc.cutoff);
  let risk = "unknown";
  try {
    if (typeof CUT !== "undefined" && CUT && typeof DEC !== "undefined" && DEC) {
      const d = (DEC[CUT[midx]] || {})[bid] || {};
      risk = (d.model && d.model.risk) || "unknown";
    }
  } catch (e) { /* default stands */ }
  try {
    let showing = null;
    try {
      if (typeof Deck3DIsShowing === "function") showing = Deck3DIsShowing();
    } catch (e) { showing = null; }
    if (showing !== String(bid) && typeof Deck3DShow === "function" &&
        typeof SPANS !== "undefined" && SPANS &&
        typeof map !== "undefined" && map) {
      let lenM = null;
      try {
        if (typeof BRIDGE_PROPS !== "undefined" && BRIDGE_PROPS &&
            BRIDGE_PROPS[bid]) {
          lenM = BRIDGE_PROPS[bid].len_m;
        }
      } catch (e) { /* ignore */ }
      let centroid = null;
      try {
        if (typeof CENTROIDS !== "undefined" && CENTROIDS) {
          centroid = CENTROIDS[bid] || null;
        }
      } catch (e) { /* ignore */ }
      if (centroid) {
        Deck3DShow(map, { bid, spans: SPANS[bid] || [], cutoffIdx: midx,
          lenM, centroid, risk, axisBearing: storyAxisBearing(bid),
          mode: "seated", tweenMs: 0 });
      }
    }
  } catch (e) { /* the slab stays as it is, never fatal */ }
  try {
    if (typeof AnnotateClearRings === "function") AnnotateClearRings();
  } catch (e) { /* ignore */ }
  try {
    if (typeof AnnotateClearHud === "function") AnnotateClearHud();
  } catch (e) { /* ignore */ }
}

function storyEsc(s) {
  try {
    if (typeof esc === "function") return esc(String(s));
  } catch (e) { /* fall through */ }
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- Phase 7c: scene 2 explainer ----------

function storyShowExplainer() {
  const cover = storyEl("sceneCover");
  if (!cover) return;
  try {
    if (typeof ExplainerShow === "function") {
      ExplainerShow(cover);
      storyExplainerOn = true;
    }
  } catch (e) { storyExplainerOn = false; }
}

function storyHideExplainer() {
  if (!storyExplainerOn) return;
  storyExplainerOn = false;
  try {
    const cover = storyEl("sceneCover");
    if (cover && typeof ExplainerDestroy === "function") ExplainerDestroy(cover);
  } catch (e) { /* ignore */ }
}

function storySyncExplainer(localT) {
  if (!storyExplainerOn) return;
  try {
    const cover = storyEl("sceneCover");
    if (cover && typeof ExplainerSync === "function") ExplainerSync(cover, localT);
  } catch (e) { /* ignore */ }
}

// ---------- Phase 7c: scene 7 memo + S2 chip + SAM ----------

function storyShowMemoPanel(cutoff) {
  const panel = storyEl("sceneMemo");
  const body = storyEl("sceneMemoBody");
  const title = storyEl("sceneMemoTitle");
  if (!panel || !body) return;
  if (title) title.textContent = `INSPECTION MEMO — ${cutoff}`;
  body.textContent = "Loading the memo…";
  storyShow(panel, true);
  storyXfade(panel);
}

function storyHideMemoPanel() {
  storyShow(storyEl("sceneMemo"), false);
}

// Phase 8c-2 side panel (spec section 5): one glass sheet on the right;
// the memo fills it in scene 7 and the proof replaces it in scene 8 with
// a 600 ms crossfade. The sheet itself fades once on entry.
function storyShowSidePanel(on) {
  const panel = storyEl("storySidePanel");
  if (!panel) return;
  const wasHidden = (() => {
    try { return panel.hasAttribute("hidden"); } catch (e) { return false; }
  })();
  storyShow(panel, on);
  if (on && wasHidden) storyXfade(panel);
}

function storySwapSidePanel(which) {
  const memo = storyEl("sceneMemo");
  const proof = storyEl("sceneProof");
  if (!memo || !proof) return;
  const showEl = (which === "proof") ? proof : memo;
  const hideEl = (which === "proof") ? memo : proof;
  let hideWasHidden = true, showWasHidden = true;
  try { hideWasHidden = hideEl.hasAttribute("hidden"); } catch (e) { /* ignore */ }
  try { showWasHidden = showEl.hasAttribute("hidden"); } catch (e) { /* ignore */ }
  if (!showWasHidden && hideWasHidden) return;
  if (storyReduced() || !storyHasGsap()) {
    storyShow(hideEl, false);
    storyShow(showEl, true);
    return;
  }
  storyShow(showEl, true);
  try {
    gsap.fromTo(showEl, { opacity: 0 },
      { opacity: 1, duration: 0.6, ease: "power1.out" });
    if (!hideWasHidden) {
      gsap.to(hideEl, { opacity: 0, duration: 0.6, ease: "power1.out",
        onComplete: () => {
          storyShow(hideEl, false);
          try { hideEl.style.opacity = ""; } catch (e) { /* ignore */ }
        } });
    }
  } catch (e) {
    storyShow(hideEl, false);
  }
}

// Rendered memo for the typing panel: renderMemo output minus the H1
// (the panel heading already says "INSPECTION MEMO — <cutoff>") and the
// "Cutoff …" line, with the Action list table replaced by the 8c-2
// hairline action rows (memo.js), and the rendered length and highlight
// precomputed. Returns {html, total, hl} or null when renderMemo/DOM is
// unavailable.
function storyBuildRenderedMemo(md) {
  try {
    if (typeof renderMemo !== "function") return null;
    if (typeof document === "undefined" || !document.createElement) return null;
    const tmp = document.createElement("div");
    tmp.innerHTML = renderMemo(md);
    try {
      const h1 = tmp.querySelector("h1");
      if (h1 && h1.remove) h1.remove();
    } catch (e) { /* keep going */ }
    try {
      const ps = tmp.querySelectorAll("p");
      for (const p of Array.from(ps || [])) {
        const t = String((p.textContent || "").trim());
        if (t.indexOf("Cutoff ") === 0) {
          if (p.remove) p.remove();
          break;
        }
      }
    } catch (e) { /* keep going */ }
    try {
      const tbl = tmp.querySelector("table");
      if (tbl && typeof parseActionRows === "function" &&
          typeof renderActionRows === "function") {
        const rows = parseActionRows(md);
        if (rows && rows.length) {
          const wrap = document.createElement("div");
          wrap.innerHTML = renderActionRows(rows);
          const actionsEl = wrap.firstChild;
          if (actionsEl && tbl.parentNode) {
            tbl.parentNode.replaceChild(actionsEl, tbl);
          }
        }
      }
    } catch (e) { /* the bordered table stays as the fallback */ }
    try {
      while (tmp.firstChild && tmp.firstChild.nodeType === 3 &&
          /^\s*$/.test(String(tmp.firstChild.textContent || ""))) {
        tmp.removeChild(tmp.firstChild);
      }
    } catch (e) { /* keep going */ }
    const total = renderedTextLength(tmp);
    let hl = null;
    try { hl = renderedHighlightRange(tmp); } catch (e) { hl = null; }
    return { html: tmp.innerHTML, total, hl };
  } catch (e) { return null; }
}

// Wrap the precomputed highlight sentence in <mark>. The target block is
// text-only in the shipped memos (no bold/italic), so rebuilding its
// innerHTML from its truncated textContent keeps the panel well-formed.
// Skips the Owner condition section and elements with nested markup.
function storyHighlightRendered(body, hl) {
  if (!body || !hl || !hl.sentence) return;
  const sent = hl.sentence;
  let kids = [];
  try { kids = body.childNodes ? Array.from(body.childNodes) : []; } catch (e) { kids = []; }
  let ownerStart = -1, ownerEnd = kids.length;
  const isH = (el) => !!el && el.nodeType === 1 && /^(H1|H2|H3)$/i.test(String(el.tagName || ""));
  for (let i = 0; i < kids.length; i++) {
    if (!isH(kids[i])) continue;
    let ht = "";
    try { ht = String(kids[i].textContent || "").trim(); } catch (e) { ht = ""; }
    if (ht.indexOf("Owner condition") === 0) {
      ownerStart = i;
      for (let j = i + 1; j < kids.length; j++) {
        if (isH(kids[j])) { ownerEnd = j; break; }
      }
      break;
    }
  }
  const inOwner = (el) => {
    try {
      let cur = el;
      while (cur && cur.parentNode && cur.parentNode !== body) cur = cur.parentNode;
      if (!cur || cur.parentNode !== body) return false;
      const idx = kids.indexOf(cur);
      return ownerStart !== -1 && idx >= ownerStart && idx < ownerEnd;
    } catch (e) { return false; }
  };
  let cands = [];
  try { cands = body.querySelectorAll ? Array.from(body.querySelectorAll("p, li, td, th")) : []; }
  catch (e) { cands = []; }
  for (const el of cands) {
    if (inOwner(el)) continue;
    let hasElem = false;
    try {
      for (const cn of Array.from(el.childNodes || [])) {
        if (cn.nodeType === 1) { hasElem = true; break; }
      }
    } catch (e) { hasElem = true; }
    if (hasElem) continue;
    let txt = "";
    try { txt = String(el.textContent || ""); } catch (e) { continue; }
    const idx = txt.indexOf(sent);
    if (idx === -1) continue;
    el.innerHTML = storyEsc(txt.slice(0, idx)) + "<mark>" +
      storyEsc(sent) + "</mark>" + storyEsc(txt.slice(idx + sent.length));
    return;
  }
}

function storyFetchMemo(cutoff, token) {
  if (storyMemoCutoff === cutoff && (storyMemoHtml || storyMemoText)) return;
  fetch(`data/memos/${cutoff}.md`).then(
    (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }).then(
    (md) => {
      if (token !== storyEnterToken) return;
      storyMemoText = md;
      storyMemoCutoff = cutoff;
      try { storyMemoRange = memoHighlightRange(md); } catch (e) { storyMemoRange = null; }
      const built = storyBuildRenderedMemo(md);
      if (built) {
        storyMemoHtml = built.html;
        storyMemoTotal = built.total;
        storyMemoHl = built.hl;
      } else {
        storyMemoHtml = "";
        storyMemoTotal = 0;
        storyMemoHl = null;
      }
      // Re-sync the current playhead so the typing appears immediately.
      try {
        if (storyMaster && storyScenes[storyScene] && storyScenes[storyScene].id === "the-report") {
          const t = storyMaster.time();
          storySyncMemo(t - storyBounds[storyScene].start);
        }
      } catch (e) { /* ignore */ }
    },
    () => {
      if (token !== storyEnterToken) return;
      storyMemoText = "";
      storyMemoCutoff = cutoff;
      storyMemoRange = null;
      storyMemoHtml = "";
      storyMemoTotal = 0;
      storyMemoHl = null;
      try {
        const body = storyEl("sceneMemoBody");
        if (body) body.textContent = `Could not load the memo for ${cutoff}.`;
      } catch (e) { /* ignore */ }
    });
}

// Typing as a function of the playhead: the rendered memo (H1 and Cutoff
// skipped) reveals 40 chars/s, instant under reduced motion. The sentence
// containing "prompt inspection" highlights once fully typed (fallback:
// first Verdict sentence; Owner never highlighted).
function storySyncMemo(localT) {
  const body = storyEl("sceneMemoBody");
  if (!body) return;
  if (storyMemoHtml) {
    const total = storyMemoTotal;
    const n = storyReduced() ? total : revealedCount(localT, total);
    body.innerHTML = storyMemoHtml;
    try { revealNodes(body, n); } catch (e) { /* show the full panel */ }
    const hl = storyMemoHl;
    if (hl && n >= hl.end) {
      try { storyHighlightRendered(body, hl); } catch (e) { /* reveal without highlight */ }
    }
    try {
      const mark = body.querySelector("mark");
      if (mark) {
        const panel = storyEl("sceneMemo");
        if (panel) {
          const pr = panel.getBoundingClientRect();
          const mr = mark.getBoundingClientRect();
          if (mr.bottom > pr.bottom || mr.top < pr.top) {
            panel.scrollTop += mr.top - pr.top - 40;
          }
        }
      }
    } catch (e) { /* highlight without scrolling */ }
    return;
  }
  if (!storyMemoText) return; // fetch in flight; "Loading…" stays
  // Fallback when renderMemo is unavailable: raw typing (never in practice).
  const total = storyMemoText.length;
  const n = storyReduced() ? total : memoTypedChars(localT, total);
  const typed = storyMemoText.slice(0, n);
  const range = storyMemoRange;
  if (!range || n < range.end) {
    body.textContent = typed;
    return;
  }
  const a = Math.max(0, Math.min(range.start, n));
  const b = Math.max(a, Math.min(range.end, n));
  body.innerHTML = storyEsc(typed.slice(0, a)) + "<mark>" +
    storyEsc(typed.slice(a, b)) + "</mark>" + storyEsc(typed.slice(b));
}

function storyAddS2(token) {
  try {
    if (typeof map === "undefined" || !map) return;
    if (storyS2On && map.getSource && map.getSource("s2")) return;
  } catch (e) { return; }
  fetch("data/s2_visual.json").then(
    (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).then(
    (js) => {
      if (token !== storyEnterToken) return;
      try {
        if (typeof map === "undefined" || !map) return;
        if (map.getSource && map.getSource("s2")) {
          storyS2On = true;
          return;
        }
        map.addSource("s2", { type: "image", url: "data/s2_visual.png",
          coordinates: js.coordinates });
        const before = (map.getLayer && map.getLayer("bridges-fill"))
          ? "bridges-fill" : undefined;
        if (before) map.addLayer({ id: "s2-raster", type: "raster",
          source: "s2", paint: { "raster-opacity": 0.9 } }, before);
        else map.addLayer({ id: "s2-raster", type: "raster",
          source: "s2", paint: { "raster-opacity": 0.9 } });
        storyS2On = true;
      } catch (e) { /* chip is decoration, never fatal */ }
    },
    () => { /* chip stays hidden when its corners fail to load */ });
}

function storyRemoveS2() {
  storyS2On = false;
  try {
    if (typeof map === "undefined" || !map) return;
    if (map.getLayer && map.getLayer("s2-raster")) map.removeLayer("s2-raster");
    if (map.getSource && map.getSource("s2")) map.removeSource("s2");
  } catch (e) { /* ignore */ }
}

function storyAddSam(token) {
  try {
    if (typeof AnnotateSetSamOutline !== "function") return;
  } catch (e) { return; }
  fetch("data/sam.geojson").then(
    (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).then(
    (gj) => {
      if (token !== storyEnterToken) return;
      try {
        const feats = (gj && gj.features) || [];
        const carola = feats.find((f) =>
          f && f.properties && f.properties.bridge === "Carolabrücke");
        if (!carola) return;
        const geom = carola.geometry || {};
        let ring = null;
        if (geom.type === "Polygon" && geom.coordinates && geom.coordinates[0]) {
          ring = geom.coordinates[0];
        } else if (geom.type === "MultiPolygon" && geom.coordinates && geom.coordinates[0]) {
          ring = geom.coordinates[0][0];
        }
        if (!ring) return;
        let label = "SAM 3.1";
        try {
          if (typeof formatSamLabel === "function") {
            label = formatSamLabel(carola.properties.score, carola.properties.iou);
          } else {
            label = `SAM 3.1 · score ${carola.properties.score} · IoU ${carola.properties.iou}`;
          }
        } catch (e) { /* keep fallback */ }
        AnnotateSetSamOutline(ring, label);
        storySamOn = true;
      } catch (e) { /* outline is decoration, never fatal */ }
    },
    () => { /* outline stays hidden when sam.geojson fails to load */ });
}

function storyRemoveSam() {
  storySamOn = false;
  try {
    if (typeof AnnotateClearSam === "function") AnnotateClearSam();
  } catch (e) { /* ignore */ }
}

// Phase 8c-2 evidence card (spec section 5): the Sentinel-2 chip with the
// bridge's SAM polygon projected into the chip frame. Enters with the
// "SAM 3.1 found the bridge" caption (STORY_EVIDENCE_AT), exits with the
// scene. The 1 px cyan outline draws over 600 ms (at once reduced).
function storyShowEvidence(on) {
  const card = storyEl("sceneEvidence");
  if (!card) return;
  let wasHidden = true;
  try { wasHidden = card.hasAttribute("hidden"); } catch (e) { /* ignore */ }
  storyShow(card, on);
  if (on && wasHidden) {
    storyXfade(card);
    try { storyDrawEvidence(); } catch (e) { /* the chip still shows */ }
  }
  if (!on) storyEvidenceDrawn = false;
}

function storyHideEvidence() {
  storyShowEvidence(false);
}

function storyFetchEvidence(token) {
  if (storyEvidenceData) {
    try {
      if (storyMaster && storyScenes[storyScene] &&
          storyScenes[storyScene].id === "the-report") {
        const t = storyMaster.time();
        storySyncEvidence(t - storyBounds[storyScene].start);
      }
    } catch (e) { /* ignore */ }
    return;
  }
  const chipP = fetch("data/s2_visual.json").then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  const samP = fetch("data/sam.geojson").then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  Promise.all([chipP, samP]).then(
    (pair) => {
      if (token !== storyEnterToken) return;
      try {
        const chip = pair[0] || {};
        const gj = pair[1] || {};
        const corners = chip.coordinates || null;
        const W = Number(chip.width) || 93;
        const H = Number(chip.height) || 91;
        const feats = (gj && gj.features) || [];
        const carola = feats.find((f) =>
          f && f.properties && f.properties.bridge === "Carolabrücke");
        if (!corners || !carola) return;
        const geom = carola.geometry || {};
        let ring = null;
        if (geom.type === "Polygon" && geom.coordinates && geom.coordinates[0]) {
          ring = geom.coordinates[0];
        } else if (geom.type === "MultiPolygon" && geom.coordinates &&
            geom.coordinates[0]) {
          ring = geom.coordinates[0][0];
        }
        if (!ring) return;
        storyEvidenceData = { corners, W, H, ring,
          score: carola.properties.score, iou: carola.properties.iou };
        try {
          const foot = storyEl("sceneEvidenceFoot");
          if (foot) {
            if (typeof formatSamLabel === "function") {
              foot.textContent = formatSamLabel(
                carola.properties.score, carola.properties.iou);
            } else {
              foot.textContent = "SAM 3.1 · score " +
                carola.properties.score + " · IoU " + carola.properties.iou;
            }
          }
        } catch (e) { /* footer keeps its placeholder */ }
        try {
          if (storyMaster && storyScenes[storyScene] &&
              storyScenes[storyScene].id === "the-report") {
            const t = storyMaster.time();
            storySyncEvidence(t - storyBounds[storyScene].start);
          }
        } catch (e) { /* ignore */ }
      } catch (e) { /* card stays hidden, never fatal */ }
    },
    () => { /* card stays hidden when its data fails to load */ });
}

function storyEvidencePathD() {
  if (!storyEvidenceData) return "";
  const { corners, ring } = storyEvidenceData;
  if (typeof s2ChipProject !== "function") return "";
  const pts = [];
  for (const c of (ring || [])) {
    const lon = Array.isArray(c) ? c[0] : null;
    const lat = Array.isArray(c) ? c[1] : null;
    const p = s2ChipProject(lon, lat, corners, 1, 1);
    if (p && Number.isFinite(p.u) && Number.isFinite(p.v)) {
      pts.push(p);
    }
  }
  if (pts.length < 3) return "";
  let d = `M ${pts[0].u.toFixed(4)} ${pts[0].v.toFixed(4)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].u.toFixed(4)} ${pts[i].v.toFixed(4)}`;
  }
  return d + " Z";
}

function storyDrawEvidence() {
  const svg = storyEl("sceneEvidenceSvg");
  if (!svg || !storyEvidenceData) return;
  if (storyEvidenceDrawn) return;
  const d = storyEvidencePathD();
  if (!d) return;
  storyEvidenceDrawn = true;
  try {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const NS = "http://www.w3.org/2000/svg";
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "evidence-sam");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(path);
    if (storyReduced() || !storyHasGsap()) return;
    let len = 0;
    try { len = path.getTotalLength(); } catch (e) { len = 0; }
    if (!(len > 0)) len = 1;
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
    gsap.to(path.style, { strokeDashoffset: 0, duration: 0.6,
      ease: "power2.out" });
  } catch (e) {
    try {
      const p = svg.querySelector("path");
      if (p) p.style.strokeDashoffset = "0";
    } catch (e2) { /* static outline stays */ }
  }
}

function storySyncEvidence(localT) {
  const sc = storyScenes[storyScene];
  if (!sc || sc.id !== "the-report") {
    storyShowEvidence(false);
    return;
  }
  let show = false;
  try { show = storyEvidenceShown(localT); } catch (e) { show = false; }
  if (storyReduced() && show) {
    // Reduced motion still respects the caption entrance (content, not
    // motion); the draw itself is instant.
  }
  const card = storyEl("sceneEvidence");
  let hidden = true;
  try { hidden = !card || card.hasAttribute("hidden"); } catch (e) { hidden = true; }
  if (show && hidden) {
    storyShowEvidence(true);
  } else if (!show && !hidden) {
    storyShowEvidence(false);
  } else if (show && storyEvidenceData && !storyEvidenceDrawn) {
    try { storyDrawEvidence(); } catch (e) { /* ignore */ }
  }
}

// ---------- Phase 7c: scene 8 proof ----------

function storyShowProof() {
  const panel = storyEl("sceneProof");
  const list = storyEl("proofList");
  const foot = storyEl("proofFoot");
  if (!panel) return;
  try {
    let title = storyEl("sceneProofTitle");
    if (!title) {
      const card = panel.querySelector ? panel.querySelector(".proof-card") : null;
      if (card) {
        title = document.createElement("h3");
        title.id = "sceneProofTitle";
        title.className = "proof-title";
        card.insertBefore(title, card.firstChild);
        try { storyEls["sceneProofTitle"] = title; } catch (e) { /* ignore */ }
      }
    }
    if (title) {
      let cutoff = "";
      try {
        const sc = storyScenes[storyScene];
        cutoff = (sc && sc.cutoff) || "";
      } catch (e) { cutoff = ""; }
      if (!cutoff && storyProof && storyProof.cutoff) cutoff = storyProof.cutoff;
      title.textContent = `THE PROOF — ${cutoff}`;
    }
  } catch (e) { /* title stays as marked up */ }
  try {
    const cols = panel.querySelector ? panel.querySelector(".proof-cols") : null;
    if (cols && !cols.querySelector(".proof-eq")) {
      const eq = document.createElement("div");
      eq.className = "proof-eq";
      eq.setAttribute("aria-hidden", "true");
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("class", "proof-eq-svg");
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M 4 13 L 10 19 L 20 6");
      path.setAttribute("class", "proof-eq-check");
      svg.appendChild(path);
      eq.appendChild(svg);
      const kids = cols.querySelectorAll ? cols.querySelectorAll(".proof-col") : [];
      if (kids && kids.length >= 2) {
        cols.insertBefore(eq, kids[1]);
      } else {
        cols.appendChild(eq);
      }
    }
  } catch (e) { /* columns stay as marked up */ }
  if (list && !list.childNodes.length) {
    for (const q of STORY_PROOF_QUANTITIES) {
      const li = document.createElement("li");
      const tick = document.createElement("span");
      tick.className = "proof-check";
      const name = document.createElement("span");
      name.textContent = q;
      li.appendChild(tick);
      li.appendChild(name);
      list.appendChild(li);
    }
  }
  if (foot && storyProof && storyProof.agreement) {
    const ag = storyProof.agreement;
    const n = (ag.agree !== undefined) ? ag.agree : ag.n;
    const m = (ag.total !== undefined) ? ag.total : ag.m;
    foot.textContent = `Same high bridges in ${n} of ${m} months`;
  } else if (foot) {
    foot.textContent = "";
  }
  storyShow(panel, true);
  storyXfade(panel);
}

function storyHideProof() {
  storyShow(storyEl("sceneProof"), false);
}

function storyFetchProof(token) {
  if (storyProof) {
    try { storyShowProof(); } catch (e) { /* ignore */ }
    return;
  }
  fetch("data/proof.json").then(
    (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).then(
    (js) => {
      if (token !== storyEnterToken) return;
      storyProof = js;
      try { storyShowProof(); } catch (e) { /* ignore */ }
      try {
        if (storyMaster && storyScenes[storyScene] && storyScenes[storyScene].id === "the-proof") {
          const t = storyMaster.time();
          storySyncProof(t - storyBounds[storyScene].start);
        }
      } catch (e) { /* ignore */ }
    },
    () => {
      if (token !== storyEnterToken) return;
      try {
        const foot = storyEl("proofFoot");
        if (foot) foot.textContent = "Could not load the proof numbers.";
      } catch (e) { /* ignore */ }
    });
}

// Count-in (600 ms) + checks (90 ms stagger) as a function of the
// playhead; the equality check between the columns draws once both
// columns settle identical. Final state at once under reduced motion.
function storySyncProof(localT) {
  if (!storyProof) return;
  const reduced = storyReduced();
  const carola = storyProof.carola || {};
  const set = (id, v) => {
    const el = storyEl(id);
    if (el) el.textContent = (Number(v) || 0).toFixed(2);
  };
  set("proofScoreFull", proofCountValue(carola.score_full, localT, reduced));
  set("proofScoreTrunc", proofCountValue(carola.score_trunc, localT, reduced));
  set("proofZFull", proofCountValue(carola.z_full, localT, reduced));
  set("proofZTrunc", proofCountValue(carola.z_trunc, localT, reduced));
  try {
    const panel = storyEl("sceneProof");
    const eq = panel && panel.querySelector
      ? panel.querySelector(".proof-eq-check") : null;
    if (eq) {
      const settled = reduced || Number(localT) >= STORY_PROOF_COUNT;
      eq.classList.toggle("drawn", !!settled);
      if (settled && !reduced && storyHasGsap() && !eq.dataset.drew) {
        eq.dataset.drew = "1";
        try {
          let len = 0;
          try { len = eq.getTotalLength(); } catch (e) { len = 30; }
          if (!(len > 0)) len = 30;
          eq.style.strokeDasharray = String(len);
          eq.style.strokeDashoffset = String(len);
          gsap.to(eq.style, { strokeDashoffset: 0, duration: 0.6,
            ease: "power2.out" });
        } catch (e) {
          try { eq.style.strokeDashoffset = "0"; } catch (e2) { /* ignore */ }
        }
      } else if (!settled) {
        try { delete eq.dataset.drew; } catch (e) { /* ignore */ }
        try { eq.style.strokeDashoffset = ""; } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* columns still count without the check */ }
  const list = storyEl("proofList");
  if (list) {
    const n = proofChecksShown(localT, STORY_PROOF_QUANTITIES.length, reduced);
    const kids = list.querySelectorAll(".proof-check");
    for (let i = 0; i < kids.length; i++) {
      kids[i].textContent = (i < n) ? "✓" : "";
    }
  }
}

// ---------- Phase 7c: scene 9 Europe outro ----------

// 8c-3 fix 2: warm the Europe (zoom ~4) vector tiles before the cut.
// Creates one hidden MapLibre instance at the Europe pose when scene 8
// enters, so every coastline is cached before the beat and on screen the
// moment the dip lifts. The container is the size of the map container
// (same width and height, positioned off-screen with visibility hidden);
// a 2 x 2 px map loads one tile and leaves the frame dark. The map
// reuses the live style, centres [12, 52] at zoom 3.8 (pitch 0,
// bearing 0), adds no controls and is not interactive. Never more than
// one instance; every call is guarded so a MapLibre failure leaves the
// story untouched. Removed when scene 9 ends or on any seek out of
// scenes 8-9. Returns false (no warmer) when the map size is unknown
// rather than warming a few pixels.
function storyEuropeWarmerSize() {
  try {
    if (typeof map !== "undefined" && map &&
        typeof map.getContainer === "function") {
      let c = null;
      try { c = map.getContainer(); } catch (e) { c = null; }
      if (c) {
        const w = Number(c.clientWidth) || Number(c.offsetWidth) || 0;
        const h = Number(c.clientHeight) || Number(c.offsetHeight) || 0;
        if (w > 0 && h > 0) return { w: Math.round(w), h: Math.round(h) };
        try {
          if (typeof c.getBoundingClientRect === "function") {
            const r = c.getBoundingClientRect();
            if (r && Number(r.width) > 0 && Number(r.height) > 0) {
              return { w: Math.round(Number(r.width)),
                h: Math.round(Number(r.height)) };
            }
          }
        } catch (e) { /* fall through */ }
      }
    }
  } catch (e) { /* fall through */ }
  try {
    if (typeof document !== "undefined" && document &&
        typeof document.getElementById === "function") {
      let m = null;
      try { m = document.getElementById("map"); } catch (e) { m = null; }
      if (m) {
        const w = Number(m.clientWidth) || Number(m.offsetWidth) || 0;
        const h = Number(m.clientHeight) || Number(m.offsetHeight) || 0;
        if (w > 0 && h > 0) return { w: Math.round(w), h: Math.round(h) };
        try {
          if (typeof m.getBoundingClientRect === "function") {
            const r = m.getBoundingClientRect();
            if (r && Number(r.width) > 0 && Number(r.height) > 0) {
              return { w: Math.round(Number(r.width)),
                h: Math.round(Number(r.height)) };
            }
          }
        } catch (e) { /* fall through */ }
      }
    }
  } catch (e) { /* fall through */ }
  return null;
}

function storyEnsureEuropeWarmer() {
  try {
    if (storyEuropeWarmer) return true;
    if (typeof document === "undefined" || !document) return false;
    let ML = null;
    try {
      ML = (typeof maplibregl !== "undefined") ? maplibregl : null;
    } catch (e) { ML = null; }
    if (!ML || typeof ML.Map !== "function") return false;
    let style = null;
    try {
      if (typeof map !== "undefined" && map &&
          typeof map.getStyle === "function") {
        style = map.getStyle();
      }
    } catch (e) { style = null; }
    if (!style) {
      try {
        if (typeof buildFuiStyle === "function") {
          style = buildFuiStyle({ dark: true });
        }
      } catch (e) { style = null; }
    }
    if (!style) return false;
    let size = null;
    try { size = storyEuropeWarmerSize(); } catch (e) { size = null; }
    if (!size || !(size.w > 0) || !(size.h > 0)) return false;
    let el = null;
    try {
      el = document.createElement("div");
      el.style.width = `${size.w}px`;
      el.style.height = `${size.h}px`;
      el.style.visibility = "hidden";
      el.style.position = "fixed";
      el.style.left = "-10000px";
      el.style.top = "0";
      el.style.pointerEvents = "none";
      el.setAttribute("aria-hidden", "true");
    } catch (e) { return false; }
    try {
      const host = (document.body || document.documentElement);
      if (!host || typeof host.appendChild !== "function") return false;
      host.appendChild(el);
    } catch (e) { return false; }
    let warmer = null;
    try {
      warmer = new ML.Map({
        container: el,
        style,
        center: STORY_EUROPE_CENTER.slice(),
        zoom: STORY_EUROPE_ZOOM,
        pitch: 0,
        bearing: 0,
        interactive: false,
        attributionControl: false
      });
    } catch (e) {
      try {
        if (el.parentNode) el.parentNode.removeChild(el);
      } catch (e2) { /* ignore */ }
      return false;
    }
    storyEuropeWarmerEl = el;
    storyEuropeWarmer = warmer;
    return true;
  } catch (e) { return false; }
}

function storyRemoveEuropeWarmer() {
  try {
    if (storyEuropeWarmer) {
      try {
        if (typeof storyEuropeWarmer.remove === "function") {
          storyEuropeWarmer.remove();
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
  storyEuropeWarmer = null;
  try {
    if (storyEuropeWarmerEl) {
      try {
        if (storyEuropeWarmerEl.parentNode) {
          storyEuropeWarmerEl.parentNode.removeChild(storyEuropeWarmerEl);
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
  storyEuropeWarmerEl = null;
}

function storyEnsureEuropeLayer() {
  try {
    if (typeof map === "undefined" || !map) return false;
    if (map.getSource && map.getSource("europe")) return true;
    map.addSource("europe", { type: "geojson",
      data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "europe-dots", type: "circle", source: "europe",
      paint: { "circle-color": "#ffffff", "circle-radius": 5,
        "circle-opacity": 0.95, "circle-stroke-color": "#1d4ed8",
        "circle-stroke-width": 1.5 } });
    return true;
  } catch (e) { return false; }
}

function storyRemoveEurope() {
  storyEuropeN = -1;
  storyEuropeCam = false;
  storyShow(storyEl("sceneEuropeNote"), false);
  try {
    if (typeof AnnotateClearEurope === "function") AnnotateClearEurope();
  } catch (e) { /* ignore */ }
  try {
    if (typeof AnnotateClear === "function") AnnotateClear("eu-");
  } catch (e) { /* ignore */ }
  try {
    if (typeof map === "undefined" || !map) return;
    if (map.getLayer && map.getLayer("europe-dots")) map.removeLayer("europe-dots");
    if (map.getSource && map.getSource("europe")) map.removeSource("europe");
  } catch (e) { /* ignore */ }
}

// Europe cut + dots as a function of the playhead. 8c-3 fix 2: the
// Europe beat is a cut, not a zoom. At STORY_EUROPE_AT (10 s) natural
// playback dips the map to --bg over STORY_EUROPE_DIP (0.5 s, the scenes
// 2/8 element and curve); the camera jumps to the Europe pose (3.8 on
// [12, 52], pitch 0, bearing 0) behind the dip at STORY_EUROPE_CUT_AT
// (10.5 s) via the one camera path (storyCameraAt), and the dip lifts on
// the finished view. Seeks land on the same path directly with no dip.
// The basemap's place labels hide while Europe is up (below zoom 6 in
// story mode) and every lit city carries its own annotation label (mono
// 11 px uppercase, 8 px right of the dot; Dresden with the red reticle
// and "DRESDEN"); labels that would touch the lower-third band or
// another label are dropped, never overlapped (annotate.js owns the rule).
function storyDipEurope() {
  if (storyScrubbing || storyReduced() || !storyHasGsap()) return;
  const dip = storyEl("sceneDip");
  if (!dip) return;
  try {
    gsap.timeline()
      .to(dip, { opacity: 1, duration: STORY_EUROPE_DIP, ease: "power1.in" })
      .to(dip, { opacity: 0, duration: STORY_EUROPE_DIP, ease: "power1.out" });
  } catch (e) {
    try { dip.style.opacity = "0"; } catch (e2) { /* ignore */ }
  }
}

function storySyncEurope(localT, duration) {
  const wantEurope = Number(localT) >= STORY_EUROPE_AT;
  if (wantEurope !== storyEuropeCam) {
    storyEuropeCam = wantEurope;
    try {
      if (typeof map !== "undefined" && map) {
        if (wantEurope) {
          try {
            if (map.getLayer && map.getLayer("fui-places")) {
              map.setLayoutProperty("fui-places", "visibility", "none");
            }
          } catch (e) { /* labels stay as they are */ }
          if (!storyScrubbing && !storyReduced()) {
            try { storyDipEurope(); } catch (e) { /* ignore */ }
          }
          if (storyReduced() && map.jumpTo) {
            try {
              map.jumpTo({ center: STORY_EUROPE_CENTER.slice(),
                zoom: STORY_EUROPE_ZOOM, pitch: 0, bearing: 0 });
            } catch (e) { /* ignore */ }
          }
        } else {
          try {
            if (map.getLayer && map.getLayer("fui-places")) {
              map.setLayoutProperty("fui-places", "visibility", "visible");
            }
          } catch (e) { /* labels stay as they are */ }
          if (storyReduced() && map.jumpTo) {
            try {
              map.jumpTo({ center: STORY_CITY_CENTER.slice(),
                zoom: STORY_CITY_ZOOM, pitch: STORY_CITY_PITCH, bearing: 0 });
            } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (e) { /* ignore */ }
  }
  storyShow(storyEl("sceneEuropeNote"), wantEurope);
  const n = europeLitCount(localT, STORY_EUROPE_CITIES.length, duration,
    storyReduced());
  if (n === storyEuropeN) return;
  storyEuropeN = n;
  try {
    if (typeof map !== "undefined" && map && storyEnsureEuropeLayer()) {
      const feats = STORY_EUROPE_CITIES.slice(0, n).map((c, i) => ({
        type: "Feature",
        properties: { id: `eu-${i}`, name: c.name },
        geometry: { type: "Point", coordinates: [c.lon, c.lat] }
      }));
      map.getSource("europe").setData({ type: "FeatureCollection",
        features: feats });
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof AnnotateSetEurope === "function") {
      AnnotateSetEurope(STORY_EUROPE_CITIES.slice(0, n).map((c) => ({
        lon: c.lon, lat: c.lat, name: c.name,
        dresden: c.name === "Dresden"
      })));
    } else if (typeof AnnotateSetCallouts === "function") {
      if (n >= STORY_EUROPE_CITIES.length) {
        const d = STORY_EUROPE_CITIES[STORY_EUROPE_CITIES.length - 1];
        AnnotateSetCallouts([{ id: "eu-dresden", lon: d.lon, lat: d.lat,
          title: "Dresden" }]);
      } else {
        AnnotateClear("eu-");
      }
    }
  } catch (e) { /* ignore */ }
}

// Scene-6 glow pulse: one 1.2 s radius/opacity tween on the glow layer,
// then static. Only Carolabrücke glows at the last cutoff (the only high
// bridge), so the layer-wide tween reads as one marker pulsing. Static
// under reduced motion.
function storyGlowPulseOnce(key) {
  if (storyReduced()) return;
  if (!storyHasGsap()) return;
  if (storyGlowPulsed === key) return;
  storyGlowPulsed = key;
  try {
    if (typeof map === "undefined" || !map) return;
    if (!map.getLayer || !map.getLayer("bridges-glow")) return;
    const state = { t: 0 };
    gsap.to(state, { t: 1, duration: STORY_GLOW_PULSE / 2, ease: "sine.in",
      yoyo: true, repeat: 1,
      onUpdate: () => {
        try {
          map.setPaintProperty("bridges-glow", "circle-radius", 28 + 12 * state.t);
          map.setPaintProperty("bridges-glow", "circle-opacity",
            ["case", ["==", ["feature-state", "risk"], "high"], 0.25 + 0.35 * state.t, 0]);
        } catch (e) { /* ignore */ }
      },
      onComplete: () => {
        try {
          map.setPaintProperty("bridges-glow", "circle-radius", 28);
          map.setPaintProperty("bridges-glow", "circle-opacity",
            ["case", ["==", ["feature-state", "risk"], "high"], 0.25, 0]);
        } catch (e) { /* ignore */ }
      }
    });
  } catch (e) { /* glow is decoration, never fatal */ }
}

function storyShow(el, on) {
  if (!el) return;
  if (on) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

// Phase 8a transitions. storyXfade crossfades a shown overlay over 600 ms
// (120 ms under reduced motion). storyDipOnEnter dips the map to --bg and
// back (500 ms each way) when scenes 2 and 8 start; the Europe beat dips
// the same way via storyDipEurope (the third dip); never while scrubbing
// or under reduced motion. storyScan restarts the 2 s scan-line sweep on
// every scene start; never under reduced motion.
function storyXfade(el) {
  if (!el) return;
  try {
    if (el.hasAttribute("hidden")) return;
  } catch (e) { return; }
  if (!storyHasGsap()) return;
  try {
    gsap.fromTo(el, { opacity: 0 },
      { opacity: 1, duration: storyReduced() ? 0.12 : 0.6,
        ease: "power1.out" });
  } catch (e) { /* the overlay is already shown */ }
}

function storyDipOnEnter(sc) {
  if (!sc || (sc.id !== "how-radar-sees" && sc.id !== "the-proof")) return;
  if (storyScrubbing || storyReduced() || !storyHasGsap()) return;
  const dip = storyEl("sceneDip");
  if (!dip) return;
  try {
    gsap.timeline()
      .to(dip, { opacity: 1, duration: 0.5, ease: "power1.in" })
      .to(dip, { opacity: 0, duration: 0.5, ease: "power1.out" });
  } catch (e) {
    try { dip.style.opacity = "0"; } catch (e2) { /* ignore */ }
  }
}

function storyScan() {
  if (storyReduced()) return;
  const el = storyEl("scanline");
  if (!el) return;
  try {
    el.classList.remove("run");
    void el.offsetWidth;
    el.classList.add("run");
  } catch (e) { /* ignore */ }
}

function storyHasStarted() {
  try {
    const landing = storyEl("storyLanding");
    if (landing) return landing.hasAttribute("hidden");
  } catch (e) { /* fall through */ }
  return storyState !== "idle";
}

function storyApplyOverlays(i) {
  const sc = storyScenes[i];
  if (!sc) return;
  // The scene tag is removed in phase 8a (the "04 / 09" index replaces
  // it); its text still updates for continuity but it never shows.
  const tag = storyEl("sceneTag");
  if (tag) {
    tag.textContent = `scene ${i + 1} of 9`;
    storyShow(tag, false);
  }
  storyShow(storyEl("sceneTitle"), sc.overlay === "title" && storyHasStarted());
  storyXfade(storyEl("sceneTitle"));
  storyShow(storyEl("sceneCover"), !!(sc.layers && sc.layers.cover));
  storyShow(storyEl("sceneDim"), !!(sc.layers && sc.layers.dim));
  // 7c overlays: explainer owns the cover, the memo panel the side area,
  // the proof panel the dimmed map. Anything not for this scene is removed
  // so scrubs always land on correct state.
  if (sc.id === "how-radar-sees") storyShowExplainer();
  else storyHideExplainer();
  // 8c-2: the side panel owns scenes 7-8; the memo fills it in 7 and the
  // proof replaces it in 8 with a 600 ms crossfade. The evidence card
  // enters with the SAM caption and exits with scene 7. The map keeps the
  // dark base and the deck only: no S2 raster, no annotation SAM overlay
  // and (8c-3) no sam-lines outline on the map (their removals still run
  // so seeks from any state land clean).
  if (sc.id === "the-report") {
    storyShowSidePanel(true);
    storyShowMemoPanel(sc.cutoff);
    storyShow(storyEl("sceneProof"), false);
    storyRemoveS2();
    storyRemoveSam();
  } else if (sc.id === "the-proof") {
    storyShowSidePanel(true);
    storyShowProof();
    storySwapSidePanel("proof");
    storyHideEvidence();
    storyRemoveS2();
    storyRemoveSam();
  } else {
    storyShowSidePanel(false);
    storyHideMemoPanel();
    storyHideProof();
    storyHideEvidence();
    storyRemoveS2();
    storyRemoveSam();
  }
  if (sc.id === "the-report") {
    try {
      const memo = storyEl("sceneMemo");
      const proof = storyEl("sceneProof");
      if (memo && proof && !proof.hasAttribute("hidden")) {
        storySwapSidePanel("memo");
      }
    } catch (e) { /* panels stay as shown */ }
  }
  if (sc.id !== "ten-days-later") storyRemoveEurope();
  storyShow(storyEl("historyStrip"), sc.id === "three-years");
  storyXfade(storyEl("historyStrip"));
  // The month wordmark belongs to scene 4 only; leaving the scene resets
  // its key so re-entry sets (not skips) the first month.
  if (sc.id !== "three-years") storyMonthWordKey = "";
  storyShow(storyEl("sceneMonthWord"), sc.id === "three-years");
  if (sc.id === "august" || sc.id === "september") {
    try {
      storyShowSideView(storyCutoffIndexOf(sc.cutoff));
    } catch (e) { /* ignore */ }
  } else {
    storyHideSideView();
  }
  const headline = storyEl("headline");
  if (headline) {
    // The headline card belongs to Explore and to scene 4; in story mode
    // it lives on the map (storyPlaceCards) and shows only in scene 4.
    headline.classList.remove("story-hide");
    storyShow(headline, sc.id === "three-years");
    storyXfade(headline);
  }
  if (sc.id !== "ten-days-later") {
    storyShow(storyEl("storyEnd"), false);
    storyShow(storyEl("dateRoll"), false);
  } else {
    storyShow(storyEl("dateRoll"), true);
    storyXfade(storyEl("dateRoll"));
  }
  // Scene 9 carries the phase-5e collapse moment: Carolabrücke selected
  // with the dark base only (8c-3: no SAM outline, no radar chip, no
  // footprint fills; the layers come from storyApplyLayers).
  if (sc.id === "ten-days-later") {
    try {
      if (typeof NAME2ID !== "undefined" && NAME2ID && typeof selectBridge === "function") {
        const carola = NAME2ID["Carolabrücke"];
        if (carola) selectBridge(carola, { fly: false });
      }
    } catch (e) { /* ignore */ }
  }
}

// Phase 8b: the vector place labels hide in scenes 1, 3 and 4 (the crane
// in scene 1; bridge callouts replace them in scene 3; the month wordmark
// and callouts own scene 4). Never shown over imagery. 8c-3: hidden below
// zoom 6 in story mode, so the basemap's own labels never collide with
// the Europe dots and their annotation labels.
function storyApplyLabelVisibility(sc) {
  try {
    if (typeof map === "undefined" || !map || !map.getLayer) return;
    if (!map.getLayer("fui-places")) return;
    let imagery = false;
    try {
      imagery = map.getLayer("esri-layer") &&
        map.getLayoutProperty("esri-layer", "visibility") === "visible";
    } catch (e) { imagery = false; }
    let lowZoom = false;
    try {
      const z = (map.getZoom) ? map.getZoom() : null;
      lowZoom = storyMode() === "story" && Number.isFinite(Number(z)) &&
        Number(z) < 6;
    } catch (e) { lowZoom = false; }
    const hide = !!imagery || lowZoom || !!sc &&
      (sc.id === "title" || sc.id === "twenty-bridges" || sc.id === "three-years");
    map.setLayoutProperty("fui-places", "visibility", hide ? "none" : "visible");
  } catch (e) { /* labels stay as they are */ }
}

// Phase 8b fix 4 atmosphere: the MapLibre sky/fog from web/basemap.js,
// applied once the style loads, on in story mode and in Explore. Guarded
// so a MapLibre without setSky does not throw; never gated on reduced
// motion (the fog stays: it is not motion).
function storyApplySky() {
  try {
    if (typeof map === "undefined" || !map) return false;
    if (typeof applyFuiSky === "function") return applyFuiSky(map);
    if (typeof map.setSky !== "function") return false;
    map.setSky({
      "sky-color": "#070b14",
      "horizon-color": "#0d1a33",
      "fog-color": "#0a1326",
      "fog-ground-blend": 0.6,
      "horizon-fog-blend": 0.9,
      "sky-horizon-blend": 0.5,
      "atmosphere-blend": 0.8
    });
    return true;
  } catch (e) { return false; }
}

// Phase 8b fix: span dots hide below 13.5 in story mode via a
// zoom-driven opacity ramp (13.2-13.6, never popping); Explore keeps
// the constant 0.92. The ramp expression also covers the close-ups
// (zoom 15+ reads 0.92), so one path serves every story scene.
function storyApplySpansVisibility() {
  try {
    if (typeof map === "undefined" || !map || !map.getLayer) return;
    if (!map.getLayer("spans-circles")) return;
    if (storyMode() !== "story") {
      map.setPaintProperty("spans-circles", "circle-opacity",
        STORY_SPANS_OPACITY);
      map.setPaintProperty("spans-circles", "circle-stroke-opacity",
        STORY_SPANS_STROKE);
      return;
    }
    map.setPaintProperty("spans-circles", "circle-opacity",
      storySpansOpacityExpr());
    map.setPaintProperty("spans-circles", "circle-stroke-opacity",
      storySpansStrokeExpr());
  } catch (e) { /* dots stay as they are */ }
}

// Phase 8b fix: the 7d deck hide restored a constant 0.38 fill,
// overwriting the zoom-interpolate expression (0.12 at city zoom).
// Restore the expression so city zoom reads 0.12 and close-ups 0.38.
// 8c-1 fix: also restore the footprint outline to 2.5 (scenes 5-6 seat
// the slab over a 1 px hairline with no fill).
// 8c-2: the footprint (bridges-fill and its outline) hides entirely in
// scenes 5-8 (the slab is the bridge); restoring also returns the layers
// to visible.
function storyRestoreFill() {
  try {
    if (typeof map === "undefined" || !map || !map.getLayer) return;
    if (map.getLayer("bridges-fill")) {
      try {
        map.setLayoutProperty("bridges-fill", "visibility", "visible");
      } catch (e) { /* ignore */ }
      map.setPaintProperty("bridges-fill", "fill-opacity",
        storyFillOpacityExpr());
    }
    if (map.getLayer("bridges-line")) {
      try {
        map.setLayoutProperty("bridges-line", "visibility", "visible");
      } catch (e) { /* ignore */ }
      map.setPaintProperty("bridges-line", "line-width", 2.5);
    }
    if (map.getLayer("bridges-dashed")) {
      try {
        map.setLayoutProperty("bridges-dashed", "visibility", "visible");
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* fill stays as it is */ }
}

// Phase 8c-2 leftover: hide the footprint polygon in the close-ups.
function storyHideFootprint() {
  try {
    if (typeof map === "undefined" || !map || !map.getLayer) return;
    for (const id of ["bridges-fill", "bridges-line", "bridges-dashed"]) {
      try {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", "none");
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}

// Phase 8c-2 scene 7 used the map's SAM outline as a 1 px cyan hairline;
// 8c-3 keeps it off in every story scene (the evidence card carries the
// SAM result). The helper stays to restore the dashboard width on exit;
// story scenes always call it with false, Explore keeps the layer.
function storyApplySamHairline(on) {
  try {
    if (typeof map === "undefined" || !map || !map.getLayer) return;
    if (!map.getLayer("sam-lines")) return;
    map.setPaintProperty("sam-lines", "line-color", "#5ee7ff");
    map.setPaintProperty("sam-lines", "line-width", on ? 1 : 2.5);
  } catch (e) { /* outline stays as it is */ }
}

// Wrap the global Deck3DHide once so both the story and Explore deck
// paths restore the zoom-dependent fill (web/deck3d.js itself is out
// of scope for this fix; the wrapper lives here).
let storyDeckHideWrapped = false;
function storyWrapDeckHide() {
  if (storyDeckHideWrapped) return;
  try {
    if (typeof Deck3DHide !== "function") return;
    if (Deck3DHide._storyWrapped) {
      storyDeckHideWrapped = true;
      return;
    }
    const inner = Deck3DHide;
    const wrapped = function (m) {
      let out;
      try {
        out = inner(m);
      } finally {
        try { storyRestoreFill(); } catch (e) { /* ignore */ }
      }
      return out;
    };
    wrapped._storyWrapped = true;
    storyDeckHideWrapped = true;
    try { Deck3DHide = wrapped; } catch (e) { /* ignore */ }
    try {
      if (typeof window !== "undefined" && window) {
        window.Deck3DHide = wrapped;
      }
    } catch (e) { /* ignore */ }
  } catch (e) { /* ignore */ }
}

// Enter scene i. Forward play waits for the scene's waitFor list (4 s,
// then a cut); scrubbing and reduced motion cut straight to the state.
// forceWait (the landing backdrop only) takes the wait path even though
// the master is paused, so the tile wait precedes the first tilt.
function storyApplySceneState(i, forceWait) {
  const sc = storyScenes[i];
  if (!sc) return;
  const my = ++storyEnterToken;
  const instant = !forceWait &&
    (storyScrubbing || storyReduced() || !storyMaster || !storyMaster.isActive());
  storyClearCallouts();
  storyHideCaption();
  storyScan();
  storyDipOnEnter(sc);
  storyApplyLayers(sc);
  storyApplyLabelVisibility(sc);
  try { storyApplySky(); } catch (e) { /* ignore */ }
  try { storyWrapDeckHide(); } catch (e) { /* ignore */ }
  try { storyApplySpansVisibility(); } catch (e) { /* ignore */ }
  storyApplyOverlays(i);
  if (sc.id !== "three-years") {
    storyBindCutoffIndex(storyCutoffIndexOf(sc.cutoff), true);
  }
  // Scene 3: rank order at the first cutoff (not-monitored last); the
  // per-update sync lights bridges up from this list.
  if (sc.id === "twenty-bridges") {
    storyScene3Lit = -1;
    try {
      if (typeof CUT !== "undefined" && CUT && typeof DEC !== "undefined" && DEC) {
        const table = DEC[CUT[0]] || {};
        const names = (typeof ID2NAME !== "undefined") ? ID2NAME : {};
        storyScene3Order = orderBridgesByRank(table, names);
      } else {
        storyScene3Order = [];
      }
    } catch (e) { storyScene3Order = []; }
  }
  // Scenes 5-6: the span callout reads only the bound month. No floating
  // rank/z counter over the map: the HUD card is the scene's counter.
  if (sc.id === "august" || sc.id === "september") {
    try {
      const bid = storyCarolaId();
      const midx = storyCutoffIndexOf(sc.cutoff);
      if (bid && typeof AnnotateSetCallouts === "function") {
        const co = storySpanCallout(bid, midx,
          sc.id === "august" ? "aug-span" : "sep-span");
        if (co) {
          AnnotateSetCallouts([co]);
        }
      }
    } catch (e) { /* ignore */ }
  }
  // Scenes 5-6: the 3D deck, rings and HUD for the bound month;
  // scenes 7-8 keep the seated slab (no HUD/rings) over the dark city;
  // every other scene hides them, so seeks always land on correct state.
  // The footprint hides in 5-8 (the slab is the bridge) and in 9 (the
  // city, the reticles and the date only) and restores on exit. 8c-3: the
  // sam-lines outline stays off in every story scene (the evidence card
  // carries the SAM result); both SAM and radar remain Explore layers.
  if (sc.id === "august" || sc.id === "september") {
    try { storyDeckShowForScene(sc); } catch (e) { /* ignore */ }
    try { storyHideFootprint(); } catch (e) { /* ignore */ }
  } else if (sc.id === "the-report" || sc.id === "the-proof") {
    try { storyDeckKeepForScene(sc); } catch (e) { /* ignore */ }
    try { storyHideFootprint(); } catch (e) { /* ignore */ }
  } else if (sc.id === "ten-days-later") {
    try { storyDeckHide(); } catch (e) { /* ignore */ }
    try { storyHideFootprint(); } catch (e) { /* ignore */ }
  } else {
    try { storyDeckHide(); } catch (e) { /* ignore */ }
    try { storyRestoreFill(); } catch (e) { /* ignore */ }
  }
  try { storyApplySamHairline(false); } catch (e) { /* ignore */ }
  // Scene 7: memo typing + evidence card (token-guarded fetches). The map
  // keeps the dark base: no S2 raster and no annotation SAM overlay.
  if (sc.id === "the-report") {
    try { storyFetchMemo(sc.cutoff, my); } catch (e) { /* ignore */ }
    try { storyFetchEvidence(my); } catch (e) { /* ignore */ }
  }
  // Scene 8: proof numbers (token-guarded fetch).
  if (sc.id === "the-proof") {
    try { storyFetchProof(my); } catch (e) { /* ignore */ }
  }
  // 8c-3 fix 2: warm the Europe tiles on scene 8 entry (full map-size
  // warmer); remove the warmer on any entry outside scenes 8-9 (natural
  // play and seeks share this path, so a seek out of 8-9 always cleans
  // up). Scene 9 entry keeps the warmer; scene 9 end removes it
  // (storyOnComplete).
  if (sc.id === "the-proof") {
    try { storyEnsureEuropeWarmer(); } catch (e) { /* ignore */ }
  } else if (sc.id !== "ten-days-later") {
    try { storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
  }
  // Scene 6: glow pulse once. The rank/z count-up lives in the HUD
  // card (storyDeckShowForScene); no floating counter over the map.
  if (sc.id === "september") {
    try { storyGlowPulseOnce(`sep-${storyCutoffIndexOf(sc.cutoff)}`); } catch (e) { /* ignore */ }
  }
  if (instant || !(sc.waitFor && sc.waitFor.length)) {
    storyApplyCamera(sc, true);
    storyLandingCamApplied(i);
    return;
  }
  // Fix 4: the landing backdrop jumps to the crane's end framing
  // (15.2/66/-30 over Carolabrücke) before the tile wait starts, so the
  // wait (and the preloader's own tile wait) observes the landing view's
  // zoom-15 tiles, not the boot view's. The wait's re-apply after loading
  // wins over the boot ease.
  if (forceWait && i === 0) {
    try { storyApplyCamera(sc, true); } catch (e) { /* ignore */ }
  }
  try { storyMaster.pause(); } catch (e) { /* ignore */ }
  storyWaitForReady(sc.waitFor, sc.cutoff).then((res) => {
    // A seek or a new run while waiting invalidates this enter: never
    // apply a stale scene's camera or resume over the new state.
    if (my !== storyEnterToken) return;
    storyApplyCamera(sc, !!(res && res.timedOut));
    storyLandingCamApplied(i);
    if (storyState === "playing" && !storyScrubbing) {
      try { storyMaster.play(); } catch (e) { /* ignore */ }
    }
  });
}

function storyCaptionData() {
  let counts = {};
  try {
    counts = {
      n_bridges: (typeof N_BRIDGES !== "undefined") ? N_BRIDGES : "",
      n_monitored: (typeof N_MONITORED !== "undefined") ? N_MONITORED : "",
      n_not_monitored: (typeof N_NOT_MONITORED !== "undefined") ? N_NOT_MONITORED : ""
    };
  } catch (e) { counts = {}; }
  let cutoffIdx = 0;
  try { cutoffIdx = (typeof cutoffIdxLocal === "function") ? cutoffIdxLocal() : 0; } catch (e) { cutoffIdx = 0; }
  return captionDataFor((storyScenes[storyScene] || {}).id, {
    cutoffIdx,
    cutoffs: (typeof CUT !== "undefined") ? CUT : [],
    decisions: (typeof DEC !== "undefined") ? DEC : {},
    id2name: (typeof ID2NAME !== "undefined") ? ID2NAME : {},
    counts,
    eventDate: (typeof EVENT_DATE !== "undefined") ? EVENT_DATE : "",
    eventAsset: (typeof EVENT_ASSET !== "undefined") ? EVENT_ASSET : ""
  });
}

// cutoffIdx is a `let` binding owned by the inline script; read it through
// a helper so a missing dashboard fails soft instead of throwing.
function cutoffIdxLocal() {
  try {
    if (typeof CUT === "undefined" || !CUT) return 0;
    // eslint-disable-next-line no-undef
    return (typeof cutoffIdx === "number") ? cutoffIdx : CUT.length - 1;
  } catch (e) {
    return 0;
  }
}

function storyShowCaption(text) {
  const cap = storyEl("caption");
  const live = storyEl("captionLive");
  if (cap) {
    cap.textContent = text;
    cap.classList.toggle("show", !!storyCcOn);
    cap.classList.toggle("cc-off", !storyCcOn);
  }
  // Announce each caption once, even with CC hidden (the live region is
  // visually hidden already and serves screen-reader users).
  if (live) live.textContent = text;
}

function storyHideCaption() {
  storyCaptionKey = "";
  const cap = storyEl("caption");
  if (cap) {
    // Clear the text as well as hiding: a seek into a gap must never
    // leave another scene's caption in the element.
    cap.textContent = "";
    cap.classList.remove("show");
  }
}

function storyClearCallouts() {
  for (const t of storyCalloutTimers) {
    try { clearTimeout(t); } catch (e) { /* ignore */ }
  }
  storyCalloutTimers = [];
  storyS4Callouts = [];
  storyScene3Lit = -1;
  const box = storyEl("storyCallouts");
  if (box) box.innerHTML = "";
  try {
    if (typeof AnnotateClear === "function") AnnotateClear();
  } catch (e) { /* ignore */ }
}

// Scene-4 first-yellow/orange/red callouts use the annotation layer (the
// same component as the Explore high-bridge callouts): a name label with
// a leader line from the bridge's marker, up for STORY_CALLOUT_HOLD.
function storyShowCallout(hit) {
  const live = storyEl("captionLive");
  if (live) {
    try { live.textContent = `${hit.name}, ${hit.level}`; } catch (e) { /* ignore */ }
  }
  let done = false;
  try {
    if (typeof AnnotateSetCallouts === "function" &&
        typeof CENTROIDS !== "undefined" && CENTROIDS) {
      const c = CENTROIDS[hit.bid];
      if (c) {
        storyS4Callouts.push({ id: `s4-${hit.level}`, lon: c[0], lat: c[1],
          title: hit.name, sub: hit.level });
        AnnotateSetCallouts(storyS4Callouts.slice());
        done = true;
        storyCalloutTimers.push(setTimeout(() => {
          try {
            storyS4Callouts = storyS4Callouts.filter(
              (co) => co.id !== `s4-${hit.level}`);
            AnnotateSetCallouts(storyS4Callouts.slice());
          } catch (e) { /* ignore */ }
        }, STORY_CALLOUT_HOLD * 1000));
      }
    }
  } catch (e) { done = false; }
  if (done) return;
  // Fallback when the annotation layer is unavailable: the phase-7a chip.
  try {
    const box = storyEl("storyCallouts");
    if (!box) return;
    const div = document.createElement("div");
    div.className = `story-callout level-${hit.level}`;
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    const txt = document.createElement("span");
    txt.textContent = `${hit.name} — ${hit.level}`;
    div.appendChild(dot);
    div.appendChild(txt);
    box.appendChild(div);
    storyCalloutTimers.push(setTimeout(() => {
      try { if (div.parentNode === box) box.removeChild(div); } catch (e) { /* ignore */ }
    }, STORY_CALLOUT_HOLD * 1000));
  } catch (e) { /* ignore */ }
}

// Phase 8b 150 ms fade-in for a swapped headline or wordmark (nothing
// pops; scrubbing and reduced motion show final values).
function storyFade150(el) {
  if (!el) return;
  try {
    if (el.hasAttribute("hidden")) return;
  } catch (e) { return; }
  if (storyScrubbing || storyReduced() || !storyHasGsap()) return;
  try {
    gsap.fromTo(el, { opacity: 0 },
      { opacity: 1, duration: 0.15, ease: "power1.out" });
  } catch (e) { /* the new text is already shown */ }
}

// Scene-4 month wordmark (phase 8b fix): the bound month's name over
// the year from the cutoff only, set in the same tick as the headline
// (storyStepMonth binds the cutoff, which updates the headline, then
// calls here synchronously). The 150 ms fade overlaps the headline's
// own 150 ms fade; the previous month never shows fully opaque once
// the headline has changed because the text swaps before the fade.
function storySyncMonthWord(m) {
  const el = storyEl("sceneMonthWord");
  if (!el) return;
  let cutoff = "";
  try {
    cutoff = (typeof CUT !== "undefined" && CUT && CUT[m]) || "";
  } catch (e) { cutoff = ""; }
  if (storyMonthWordKey === cutoff) return;
  storyMonthWordKey = cutoff;
  const parts = storyMonthWordParts(cutoff);
  const set = () => {
    try {
      const a = el.querySelector(".mw-month");
      const b = el.querySelector(".mw-year");
      if (a) a.textContent = parts.month;
      if (b) b.textContent = parts.year;
    } catch (e) { /* ignore */ }
  };
  set();
  storyShow(el, true);
  if (storyScrubbing || storyReduced() || !storyHasGsap()) {
    try { el.style.opacity = "1"; } catch (e) { /* ignore */ }
    return;
  }
  try {
    gsap.fromTo(el, { opacity: 0 },
      { opacity: 1, duration: 0.15, ease: "power1.out" });
  } catch (e) { /* the new text is already shown */ }
}

// Phase 8b fix 2: story-mode history strip. Cells fill the band width
// (storyHistoryGeometry: (width - label) / months, 9 px tall, 1 px
// gaps, 10 px pitch, 200 px for 20 rows) instead of the 1:1 centred
// strip the Explore header uses. Same reveal/playhead/click contract as
// renderHistoryStrip; Explore keeps the original.
function storyRenderHistoryStrip(playheadIdx, revealIdx) {
  try {
    if (typeof document === "undefined") return;
  } catch (e) { return; }
  const box = storyEl("historyStrip");
  if (!box) return;
  let cuts = [], order = [], names = {};
  try {
    cuts = (typeof CUT !== "undefined" && CUT) ? CUT : [];
    order = (typeof HISTORY_ORDER !== "undefined" && HISTORY_ORDER)
      ? HISTORY_ORDER : [];
    names = (typeof ID2NAME !== "undefined" && ID2NAME) ? ID2NAME : {};
  } catch (e) { return; }
  if (!cuts.length || !order.length) return;
  const ph = (playheadIdx === undefined || playheadIdx === null)
    ? storyMonth : playheadIdx;
  const rv = (revealIdx === undefined || revealIdx === null)
    ? storyMonth : revealIdx;
  let bandW = 0;
  try {
    bandW = box.clientWidth || 0;
  } catch (e) { bandW = 0; }
  if (!(bandW > 0)) {
    try {
      const mapHost = storyEl("map");
      const mw = (mapHost && mapHost.clientWidth) || 0;
      if (mw > 48) bandW = mw - 48;
    } catch (e) { /* fall through */ }
  }
  if (!(bandW > 0)) {
    try {
      if (typeof window !== "undefined" && window.innerWidth) {
        bandW = window.innerWidth - 48;
      }
    } catch (e) { /* fall through */ }
  }
  if (!(bandW > 0)) bandW = 1232;
  const geo = storyHistoryGeometry(bandW, cuts.length, order.length, 150);
  const labelW = geo.labelW, cellW = geo.cellW, cellH = geo.cellH;
  const gap = geo.gap, unit = geo.unit;
  const W = Math.round(bandW), H = Math.round(geo.H);
  const NS = "http://www.w3.org/2000/svg";
  while (box.firstChild) box.removeChild(box.firstChild);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `History strip, ${order.length} bridges by ${cuts.length} months`);
  svg.setAttribute("class", "history-svg");
  try { svg.classList.add("history-svg"); } catch (e) { /* class set */ }
  box.appendChild(svg);
  const mk = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs || {})) el.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(el);
    return el;
  };
  const riskFill = (risk) => {
    try {
      if (typeof riskColor === "function") return riskColor(risk);
    } catch (e) { /* fall through */ }
    try {
      if (typeof RISK_COLORS !== "undefined" && RISK_COLORS) {
        return RISK_COLORS[risk] || RISK_COLORS.unknown;
      }
    } catch (e) { /* fall through */ }
    return "#8ea3c7";
  };
  const riskAt = (mIdx, bid) => {
    try {
      if (typeof historyRiskAt === "function") return historyRiskAt(mIdx, bid);
    } catch (e) { /* fall through */ }
    try {
      const cutoff = cuts[mIdx];
      const table = (typeof DEC !== "undefined" && DEC && DEC[cutoff]) || {};
      const d = table[bid] || {};
      return (d.model && d.model.risk) || "unknown";
    } catch (e) { return "unknown"; }
  };
  order.forEach((bid, r) => {
    const y = r * (cellH + gap);
    const name = names[bid] || bid;
    const lab = mk("text", { x: String(labelW - 6), y: String(y + cellH / 2),
      "class": "history-label", "text-anchor": "end", "font-size": "9",
      "dominant-baseline": "central" });
    try {
      lab.textContent = name.length > 22 ? name.slice(0, 21) + "…" : name;
    } catch (e) { /* ignore */ }
    try {
      const tip = document.createElementNS(NS, "title");
      tip.textContent = name;
      lab.appendChild(tip);
    } catch (e) { /* ignore */ }
    for (let m = 0; m < cuts.length; m++) {
      const x = labelW + m * unit;
      const revealed = m <= rv;
      const risk = revealed ? riskAt(m, bid) : "future";
      const fill = !revealed ? "transparent" : riskFill(risk);
      const rect = mk("rect", { x: String(x), y: String(y),
        width: String(cellW), height: String(cellH),
        "class": "history-cell" });
      try { rect.setAttribute("fill", fill); } catch (e) { /* ignore */ }
      try {
        rect.dataset.month = String(m);
        rect.dataset.bid = String(bid);
      } catch (e) { /* ignore */ }
      try {
        const ct = document.createElementNS(NS, "title");
        ct.textContent = revealed ? `${name} — ${cuts[m]}: ${risk}`
          : `${name} — ${cuts[m]}: not yet revealed`;
        rect.appendChild(ct);
      } catch (e) { /* ignore */ }
      try { rect.style.cursor = revealed ? "pointer" : "default"; } catch (e) { /* ignore */ }
      if (revealed) {
        try {
          rect.addEventListener("click", () => {
            try {
              if (typeof historyStripClick === "function") {
                historyStripClick(m);
              } else if (typeof StorySeekScene4Month === "function") {
                StorySeekScene4Month(m);
              }
            } catch (e) { /* ignore */ }
          });
        } catch (e) { /* ignore */ }
      }
    }
  });
  const px = labelW + ph * unit + cellW / 2;
  mk("line", { x1: String(px), y1: "0", x2: String(px), y2: String(H),
    "class": "history-playhead" });
}

// Sanctioned scene-4 advance: reveal month m, bind it, and fire any
// first-time callouts (suppressed while scrubbing). The history strip
// fills to the current month; cells after it stay empty.
function storyStepMonth(m, quiet) {
  storyMonth = m;
  if (m > storyHighWater) storyHighWater = m;
  storyBindCutoffIndex(m, true);
  try { storySyncMonthWord(m); } catch (e) { /* ignore */ }
  if (!quiet) {
    try { storyFade150(storyEl("headline")); } catch (e) { /* ignore */ }
  }
  try {
    if (storyMode() === "story") storyRenderHistoryStrip(m, m);
    else if (typeof renderHistoryStrip === "function") renderHistoryStrip(m, m);
    else storyRenderHistoryStrip(m, m);
  } catch (e) { /* ignore */ }
  if (quiet) return;
  for (const hit of storyHits) {
    if (hit.monthIdx === m && !storyHitsFired[hit.level]) {
      storyHitsFired[hit.level] = true;
      storyShowCallout(hit);
    }
  }
}

// Scene-3 light-up as a function of the playhead: the first N bridges in
// rank order get name labels (N from scene3LitCount). Labels fade in one
// by one via the annotation layer and clear at the scene's end.
function storySyncScene3(localT) {
  try {
    if (typeof AnnotateSetCallouts !== "function") return;
    if (typeof CENTROIDS === "undefined" || !CENTROIDS) return;
    const total = storyScene3Order.length;
    if (!total) return;
    const sc = storyScenes[storyScene];
    const fadingOut = sc && localT > sc.duration - 1.0;
    const n = fadingOut ? 0 : scene3LitCount(localT, total);
    if (n === storyScene3Lit) return;
    storyScene3Lit = n;
    const names = (typeof ID2NAME !== "undefined") ? ID2NAME : {};
    const list = [];
    for (let k = 0; k < n; k++) {
      const bid = storyScene3Order[k];
      const c = CENTROIDS[bid];
      if (!c) continue;
      list.push({ id: `s3-${bid}`, lon: c[0], lat: c[1],
        title: (names && names[bid]) || bid });
    }
    AnnotateSetCallouts(list);
  } catch (e) { /* ignore */ }
}

function storySyncDateRoll(localT) {
  const el = storyEl("dateRoll");
  if (!el) return;
  let last = "";
  try { last = (typeof CUT !== "undefined" && CUT && CUT.length) ? CUT[CUT.length - 1] : ""; } catch (e) { last = ""; }
  let eventDate = "";
  try { eventDate = (typeof EVENT_DATE !== "undefined") ? EVENT_DATE : ""; } catch (e) { eventDate = ""; }
  const days = (last && eventDate) ? storyDaysBetween(last, eventDate) : 0;
  const frac = Math.max(0, Math.min(1, (localT - STORY_DATE_ROLL_AT) / STORY_DATE_ROLL));
  el.textContent = storyAddDays(last, Math.round(frac * days));
}

// 8c-3 ending: the full-bleed sheet fades up over 800 ms (120 ms
// reduced) on the hidden-to-shown transition only, so the per-update sync
// never restarts the fade. The strings are the ones already shipped
// (storyEndLine1/2 wording) plus the event date, only re-set. Fix: the
// collapse line splits at the comma into the 16 px mono kicker
// ("10 days later,") and the 48 px nowrap main ("Carolabrücke
// collapsed."); storyEndLine1 keeps the full sentence for screen readers.
function storySyncEnding(show) {
  const end = storyEl("storyEnd");
  if (!end) return;
  let wasHidden = true;
  try { wasHidden = end.hasAttribute("hidden"); } catch (e) { wasHidden = true; }
  if (show && wasHidden) {
    const data = storyCaptionData();
    const dt = storyEl("storyEndDate");
    const l1 = storyEl("storyEndLine1");
    const kick = storyEl("storyEndKicker");
    const main = storyEl("storyEndMain");
    const l2 = storyEl("storyEndLine2");
    if (dt) dt.textContent = (data && data.event_date) || "";
    const full = captionText("{days} days later, {event_asset} collapsed.", data);
    if (l1) l1.textContent = full;
    let pre = "", post = full;
    const ci = full.indexOf(",");
    if (ci !== -1) {
      pre = full.slice(0, ci + 1);
      post = full.slice(ci + 1).trim();
    }
    if (kick) kick.textContent = pre;
    if (main) main.textContent = post;
    if (l2) l2.textContent = "The data flagged it first.";
  }
  storyShow(end, show);
  if (show && wasHidden) {
    if (!storyHasGsap()) return;
    try {
      gsap.fromTo(end, { opacity: 0 },
        { opacity: 1, duration: storyReduced() ? 0.12 : 0.8,
          ease: "power1.out" });
    } catch (e) { /* the sheet is already shown */ }
  }
}

// Camera as a function of the playhead (fix 4 rule, fix 5 start, 8c-1
// scenes 5-6, 8c-3 scene 9 pull-back). Scenes 1, 3, 4, 5, 6 and 9 apply
// the full storyCameraAt target (centre, zoom, pitch, bearing) via jumpTo
// per update, so natural play and seeks agree even when an entry ease was
// cut short. Scene 1 cranes 14.0/42/-30 down to the landing's 15.2/66/-30
// over the scene; scene 3 pulls back from there to 12.3/40/0 over 2.4 s;
// scene 4 drifts; scene 5 flies to 15.5/62/-30 over 2.4 s; scene 6 holds
// 16.0/65 and orbits 20 deg over its length; scene 9 pulls back from
// scene 8's pose to 12.3/40/0 over 2.4 s, holds the city until the
// Europe cut, then jumps to the Europe pose at STORY_EUROPE_CUT_AT via
// storyCameraAt (one path for natural and seeks; the dip covers the cut).
// Skipped under reduced motion.
function storySyncCamera(i, localT) {
  try {
    if (typeof map === "undefined" || !map) return;
    if (storyReduced()) return;
    if (storyMode() !== "story") return;
    const sc = storyScenes[i];
    if (!sc) return;
    const c = sc.camera || {};
    if ((sc.id === "title" || sc.id === "twenty-bridges" ||
        sc.id === "three-years" || sc.id === "august" ||
        sc.id === "september" || sc.id === "ten-days-later") &&
        typeof storyCameraAt === "function") {
      let cam = null;
      try { cam = storyCameraAt(sc, localT, 0); } catch (e) { cam = null; }
      if (cam && map.jumpTo) {
        try {
          map.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch,
            bearing: cam.bearing || 0 });
        } catch (e) { /* ignore */ }
      }
      return;
    }
    if (c.mode === "step" && c.orbit) {
      // Fallback for step scenes outside the one camera path (scene 6
      // travels storyCameraAt now): the linear orbit law over the scene.
      const span = (sc.id === "september") ? STORY_SCENE6_ORBIT : sc.duration;
      const b = storyOrbitBearing(c.orbit || 0, span, localT);
      try { if (map.jumpTo) map.jumpTo({ bearing: b }); } catch (e) { /* ignore */ }
    } else if (c.orbit) {
      // Generic orbit fallback (no scene uses it now: scenes 1, 3, 4, 5,
      // 6 and 9 travel storyCameraAt).
      const b = (c.orbit || 0) * Math.max(0, localT);
      try { if (map.jumpTo) map.jumpTo({ bearing: b }); } catch (e) { /* ignore */ }
    } else if (c.drift) {
      const frac = Math.max(0, Math.min(1, localT / sc.duration));
      let baseLon = 13.745, baseLat = 51.057;
      if (Array.isArray(c.center) && c.center.length >= 2) {
        const lon = Number(c.center[0]), lat = Number(c.center[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
          baseLon = lon; baseLat = lat;
        }
      }
      const cc = [baseLon + 0.004 * frac, baseLat + 0.002 * frac];
      try { if (map.jumpTo) map.jumpTo({ center: cc }); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* map not ready */ }
}

// The scene index (and the scene-1 title block) as a function of the
// playhead: the same sceneIndexAtTime lookup the scrub bar uses, on every
// master update, so seeks, steps, chapter clicks and natural transitions
// agree. Hidden until the story starts and in Explore mode. The old scene
// tag never shows (phase 8a removed it).
function storySyncSceneTag(t) {
  try {
    const tag = storyEl("sceneTag");
    const title = storyEl("sceneTitle");
    const index = storyEl("sceneIndex");
    if (!storyScenes.length) return;
    if (storyMode() !== "story" || !storyHasStarted()) {
      if (tag) storyShow(tag, false);
      if (title) storyShow(title, false);
      if (index) storyShow(index, false);
      return;
    }
    const idx = sceneIndexAtTime(storyScenes, t);
    if (tag) {
      tag.textContent = `scene ${idx + 1} of 9`;
      storyShow(tag, false);
    }
    if (index) {
      index.textContent =
        `${String(idx + 1).padStart(2, "0")} / ${String(storyScenes.length).padStart(2, "0")}`;
      storyShow(index, true);
    }
    if (title) {
      // Fix 4: the scene-1 wordmark is hidden while the city is seen first
      // and enters at STORY_TITLE_AT (2 s), a pure function of the playhead
      // (storyTitleShown) so seeks agree; the crossfade runs only on the
      // hidden-to-shown transition.
      const sc = storyScenes[idx];
      let shown = false;
      if (sc && sc.overlay === "title") {
        try {
          const localT = t - storyBounds[idx].start;
          shown = storyTitleShown(localT, storyReduced());
        } catch (e) { shown = false; }
      }
      if (shown) {
        let wasHidden = false;
        try { wasHidden = title.hasAttribute("hidden"); } catch (e) { wasHidden = false; }
        storyShow(title, true);
        if (wasHidden) storyXfade(title);
      } else {
        storyShow(title, false);
      }
    }
  } catch (e) { /* ignore */ }
}

// Sync everything that is a function of the playhead: the camera orbit /
// drift, the scene-3 light-up, the scene-4 month, the scene-9 date roll
// and ending panel. Captions sync separately from the master time in
// storySyncCaption. Runs on every master update, so playing and
// scrubbing share one path.
function storySyncProgress(i, localT) {
  const sc = storyScenes[i];
  if (!sc) return;
  storySyncCamera(i, localT);
  if (sc.id === "how-radar-sees") {
    storySyncExplainer(localT);
  }
  if (sc.id === "twenty-bridges") {
    storySyncScene3(localT);
  }
  if (sc.id === "three-years") {
    const m = storyMonthAtLocalTime(localT);
    if (m !== storyMonth) storyStepMonth(m, storyScrubbing);
  }
  if (sc.id === "the-report") {
    storySyncMemo(localT);
    storySyncEvidence(localT);
  }
  if (sc.id === "the-proof") {
    storySyncProof(localT);
  }
  if (sc.id === "ten-days-later") {
    storySyncDateRoll(localT);
    storyShow(storyEl("dateRoll"), localT < STORY_EUROPE_AT);
    // 8c-3: at the roll end Carolabrücke's reticle turns red with one
    // 1.2 s bloom pulse (the marker is already high red at this cutoff;
    // the pulse is the collapse moment).
    try {
      if (Number(localT) >= STORY_DATE_ROLL_AT + STORY_DATE_ROLL) {
        storyGlowPulseOnce(`s9-${storyCutoffIndexOf(sc.cutoff)}`);
      }
    } catch (e) { /* glow is decoration, never fatal */ }
    storySyncEnding(localT >= STORY_END_AT);
    storySyncEurope(localT, sc.duration);
  }
}

// The caption as a function of the master time: the same playhead lookup
// the scene tag uses, on every master update, so seeks, steps, chapter
// clicks and natural transitions agree. A gap shows nothing, and hiding
// clears the text, so another scene's caption is never left behind.
function storySyncCaption(t) {
  try {
    if (!storyScenes.length) return;
    const found = captionAtTime(storyScenes, t);
    // 8c-3: captions stay clear of the ending sheet.
    try {
      const esc = storyScenes[found.scene];
      const eb = storyBounds[found.scene];
      if (esc && esc.id === "ten-days-later" && eb &&
          Number(t) - Number(eb.start) >= STORY_END_AT) {
        storyHideCaption();
        return;
      }
    } catch (e) { /* fall through to the caption lookup */ }
    const key = found.caption === -1 ? "" : `${found.scene}:${found.caption}`;
    if (key === storyCaptionKey) return;
    if (found.caption === -1) {
      storyHideCaption();
      return;
    }
    storyCaptionKey = key;
    const sc = storyScenes[found.scene];
    storyShowCaption(captionText(sc.captions[found.caption].text, storyCaptionData()));
  } catch (e) { /* ignore */ }
}

// One GSAP master timeline per run; each scene gets its own sub-timeline
// carrying the scene's duration, sequenced back to back. All visible state
// (cutoff, camera, layers, overlays, captions, callouts, date roll) is a
// pure function of the playhead synced in storyOnMasterUpdate, so playing
// and scrubbing share one path and every seek lands on correct state.
function storyBuildMaster() {
  if (!storyHasGsap()) return;
  try { if (storyMaster) storyMaster.kill(); } catch (e) { /* ignore */ }
  storyRunToken++;
  storyHighWater = -1;
  storyHitsFired = {};
  storyGlowPulsed = "";
  storyLandingBearing = 0;
  storyMonthWordKey = "";
  storyScene3Order = [];
  storyScene3Lit = -1;
  storyClearCallouts();
  storyHideExplainer();
  storyShowSidePanel(false);
  storyHideMemoPanel();
  storyHideProof();
  storyHideEvidence();
  storyRemoveS2();
  storyRemoveSam();
  storyRemoveEurope();
  try { storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
  try { storyDeckHide(); } catch (e) { /* ignore */ }
  storyHideCaption();
  storyMaster = gsap.timeline({ paused: true,
    onUpdate: storyOnMasterUpdate, onComplete: storyOnComplete });
  storyScenes.forEach((sc, i) => {
    const sub = gsap.timeline();
    sub.to({}, { duration: sc.duration, ease: "none" });
    // 8c-1: no orbit tween here. Scene 6's 20 deg orbit is part of the
    // one camera path (storyCameraAt + storySyncCamera on every master
    // update), so natural play and seeks agree without a tween to fight.
    storyMaster.add(sub, storyBounds[i].start);
    try { storyMaster.addLabel(sc.id, storyBounds[i].start); } catch (e) { /* ignore */ }
  });
}

function storyOnMasterUpdate() {
  if (!storyMaster) return;
  const t = storyMaster.time();
  const i = sceneIndexAtTime(storyScenes, t);
  if (i !== storyScene) {
    storyScene = i;
    storyMonth = -1;
    storyApplySceneState(i);
  }
  storySyncProgress(i, t - storyBounds[i].start);
  storySyncCaption(t);
  storySyncScrubUI(t);
}

function storyOnComplete() {
  storyState = "ended";
  try { storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
  storyUpdatePlayButton();
}

function storyBuildChapters() {
  const box = storyEl("chapters");
  if (!box) return;
  box.innerHTML = "";
  const total = totalDuration(storyScenes);
  storyScenes.forEach((sc, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chapter";
    b.dataset.scene = String(i);
    const pct = (storyBounds[i].start / total) * 100;
    b.style.left = `${pct}%`;
    const label = `Scene ${i + 1} of 9: ${STORY_SCENE_NAMES[sc.id] || sc.id}`;
    b.setAttribute("aria-label", `Seek to ${label}`);
    b.setAttribute("title", label);
    b.dataset.label = `${i + 1} · ${STORY_SCENE_NAMES[sc.id] || sc.id}`;
    const dot = document.createElement("span");
    dot.className = "chapter-dot";
    dot.setAttribute("aria-hidden", "true");
    b.appendChild(dot);
    b.addEventListener("click", () => storySeekTo(storyBounds[i].start));
    box.appendChild(b);
  });
}

function storyBuildMonthTicks() {
  const box = storyEl("monthTicks");
  if (!box) return;
  box.innerHTML = "";
  const total = totalDuration(storyScenes);
  const s4 = storyBounds[3];
  if (!s4) return;
  const n = (typeof CUT !== "undefined" && CUT) ? CUT.length : 0;
  for (let m = 0; m < n; m++) {
    const tick = document.createElement("span");
    tick.className = "month-tick";
    tick.dataset.month = String(m);
    const t = s4.start + storyScene4Lead() + (m + 0.5) * STORY_MONTH_STEP;
    tick.style.left = `${(t / total) * 100}%`;
    box.appendChild(tick);
  }
}

function storySyncScrubUI(t) {
  storySyncSceneTag(t);
  const total = totalDuration(storyScenes);
  const scrub = storyEl("scrub");
  if (scrub && total > 0) {
    if (!storyScrubDragging) {
      scrub.value = String(Math.round((t / total) * 1000));
    }
    const name = STORY_SCENE_NAMES[(storyScenes[storyScene] || {}).id] || "";
    scrub.setAttribute("aria-valuetext", `Scene ${storyScene + 1} of 9: ${name}`);
  }
  const box = storyEl("chapters");
  if (box) {
    const kids = box.querySelectorAll(".chapter");
    for (const k of kids) {
      k.classList.toggle("active", Number(k.dataset.scene) === storyScene);
    }
  }
  const ticks = storyEl("monthTicks");
  if (ticks) {
    storyShow(ticks, storyScenes[storyScene] && storyScenes[storyScene].id === "three-years");
    if (!ticks.hasAttribute("hidden")) {
      const kids = ticks.querySelectorAll(".month-tick");
      for (const k of kids) {
        k.classList.toggle("current", Number(k.dataset.month) === storyMonth);
      }
    }
  }
}

// Callouts whose month lies after the seek target may fire again.
function storyClearFutureHits(t) {
  const s4 = storyBounds[3];
  if (!s4) return;
  for (const hit of storyHits) {
    const hitT = s4.start + storyScene4Lead() + hit.monthIdx * STORY_MONTH_STEP;
    if (hitT > t + 0.001) delete storyHitsFired[hit.level];
  }
}

function storySeekTo(t) {
  if (!storyMaster) return;
  storyEnterToken++; // invalidate any wait in flight
  storyStopLandingOrbit();
  storyLandingBearing = 0;
  storyShow(storyEl("storyPreloader"), false);
  storyClearFutureHits(t);
  // Leave idle and hide the landing before the playhead moves, so the
  // per-update tag/title sync sees the started state during the seek.
  if (storyState === "idle") storyState = "paused";
  storyHideLanding();
  storyScrubbing = true;
  const total = storyMaster.duration();
  const c = Math.max(0, Math.min(total - 0.001, t));
  try { storyMaster.time(c); } catch (e) { /* ignore */ }
  // Sync explicitly while still scrubbing (quiet): seeks must land on
  // correct state even if the timeline suppresses update callbacks.
  try { storyOnMasterUpdate(); } catch (e) { /* ignore */ }
  storyScrubbing = false;
  try {
    if (storyState === "playing") storyMaster.play();
    else storyMaster.pause();
  } catch (e) { /* ignore */ }
  storyUpdatePlayButton();
}

function storySeekScene(i) {
  const c = Math.max(0, Math.min(storyScenes.length - 1, i));
  if (!storyBounds[c]) return;
  storySeekTo(storyBounds[c].start);
}

function storyUpdatePlayButton() {
  const btn = storyEl("btnPlay");
  if (!btn || storyMode() !== "story") return;
  if (storyState === "playing") {
    btn.textContent = "Pause";
    btn.setAttribute("aria-pressed", "true");
  } else if (storyState === "ended") {
    btn.textContent = "Replay";
    btn.setAttribute("aria-pressed", "false");
  } else {
    btn.textContent = "Play";
    btn.setAttribute("aria-pressed", "false");
  }
}

function storyHideLanding() {
  storyShow(storyEl("storyLanding"), false);
}

// Phase 8b landing orbit (fix 4: full landing camera per frame): the map
// holds the crane's end framing (15.2/66 over Carolabrücke) and turns at
// 0.5 deg/s behind the landing. Enforcing the full camera here (not
// bearing alone) keeps the boot ease to 12.3 in web/index.html from owning
// the landing view. Scene 1 no longer continues from this bearing (the
// crane holds -30 and Play dips behind the cut). Starts once the landing
// camera is applied (after the tile wait) and the preloader is gone;
// stops on Play, seek, replay and Explore. Never under reduced motion.
function storyStartLandingOrbit() {
  storyStopLandingOrbit();
  if (storyReduced()) return;
  try {
    if (typeof map === "undefined" || !map) return;
    if (storyHasStarted()) return;
    storyLandingBearing = (map.getBearing && Number(map.getBearing())) || 0;
  } catch (e) { return; }
  if (typeof requestAnimationFrame === "undefined") return;
  storyLandingOrbitOn = true;
  storyLandingOrbitLast = 0;
  const step = (now) => {
    if (!storyLandingOrbitOn) return;
    try {
      const t = Number(now) || 0;
      const dt = storyLandingOrbitLast
        ? Math.max(0, Math.min(250, t - storyLandingOrbitLast)) : 16;
      storyLandingOrbitLast = t;
      storyLandingBearing = (storyLandingBearing + 0.5 * dt / 1000) % 360;
      if (typeof map !== "undefined" && map && map.jumpTo) {
        try {
          map.jumpTo({ center: STORY_TITLE_CENTER.slice(),
            zoom: STORY_TITLE_ZOOM, pitch: STORY_TITLE_PITCH,
            bearing: storyLandingBearing });
        } catch (e) {
          try { map.jumpTo({ bearing: storyLandingBearing }); } catch (e2) { /* ignore */ }
        }
      }
    } catch (e) {
      storyLandingOrbitOn = false;
      return;
    }
    try {
      storyLandingOrbitRaf = requestAnimationFrame(step);
    } catch (e) { storyLandingOrbitOn = false; }
  };
  try {
    storyLandingOrbitRaf = requestAnimationFrame(step);
  } catch (e) { storyLandingOrbitOn = false; }
}

function storyStopLandingOrbit() {
  storyLandingOrbitOn = false;
  try {
    if (storyLandingOrbitRaf && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(storyLandingOrbitRaf);
    }
  } catch (e) { /* ignore */ }
  storyLandingOrbitRaf = 0;
}

function storyMaybeStartLandingOrbit() {
  if (!storyLandingCamReady || !storyLandingUiReady) return;
  try {
    if (storyHasStarted()) return;
  } catch (e) { return; }
  storyStartLandingOrbit();
}

// The landing camera just applied (cut or after the wait): sync the orbit
// handoff bearing and open the camera gate for the orbit.
function storyLandingCamApplied(i) {
  if (i !== 0) return;
  try {
    if (storyHasStarted()) return;
  } catch (e) { return; }
  try {
    if (typeof map !== "undefined" && map && map.getBearing) {
      storyLandingBearing = Number(map.getBearing()) || 0;
    } else {
      storyLandingBearing = 0;
    }
  } catch (e) { storyLandingBearing = 0; }
  storyLandingCamReady = true;
  storyMaybeStartLandingOrbit();
}

// Phase 8b preloader: at least 1.2 s on --bg while the display fonts and
// the first tiles load (4 s ceiling, like every director wait), then a
// 300 ms fade into the landing. Reduced motion skips the fade only.
function storyRunPreloader() {
  const pre = storyEl("storyPreloader");
  const play = storyEl("storyPlay");
  if (!pre) {
    storyLandingUiReady = true;
    if (play) play.removeAttribute("disabled");
    storyMaybeStartLandingOrbit();
    return;
  }
  const minWait = new Promise((resolve) => setTimeout(resolve, 1200));
  let fontsReady = Promise.resolve();
  try {
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      fontsReady = document.fonts.ready.then(() => undefined, () => undefined);
    }
  } catch (e) { fontsReady = Promise.resolve(); }
  let tilesReady = Promise.resolve();
  try {
    tilesReady = storyTilesReady().then(() => undefined, () => undefined);
  } catch (e) { tilesReady = Promise.resolve(); }
  const ceiling = new Promise((resolve) => setTimeout(resolve, STORY_WAIT_TIMEOUT));
  Promise.race([Promise.all([minWait, fontsReady, tilesReady]), ceiling]).then(() => {
    const done = () => {
      storyShow(pre, false);
      storyLandingUiReady = true;
      try {
        if (play) play.removeAttribute("disabled");
      } catch (e) { /* ignore */ }
      storyMaybeStartLandingOrbit();
    };
    try {
      if (storyReduced() || !storyHasGsap()) { done(); return; }
      gsap.to(pre, { opacity: 0, duration: 0.3, ease: "power1.out",
        onComplete: () => {
          try { pre.style.opacity = ""; } catch (e) { /* ignore */ }
          done();
        } });
    } catch (e) { done(); }
  });
}

function storyPlay() {
  if (!storyHasGsap() || !storyScenes.length) return;
  storyStopLandingOrbit();
  storyShow(storyEl("storyPreloader"), false);
  if (!storyMaster) storyBuildMaster();
  if (storyState === "ended" ||
      (storyMaster && storyMaster.time() >= storyMaster.duration() - 0.01)) {
    storyBuildMaster();
    storyState = "playing";
    storyHideLanding();
    storySeekTo(0);
    return;
  }
  // Fix 4: the landing already holds the crane's end framing, so Play dips
  // to --bg for 500 ms; behind the dip, the camera jumps to the high start
  // pose, and the crane descends to the landing's framing as the dip lifts.
  // Sequence: dip down (0.5 s) with the landing still up; at full dip, jump
  // to the crane start, hide the landing and play the master; dip back up
  // (0.5 s) over the first half-second of the descent. Reduced motion and
  // plays from anywhere but the landing cut straight through.
  if (storyState === "idle" && storyScene === 0 && !storyHasStarted() &&
      !storyReduced()) {
    const dip = storyEl("sceneDip");
    if (dip) {
      storyState = "playing";
      storyUpdatePlayButton();
      try {
        gsap.timeline()
          .to(dip, { opacity: 1, duration: 0.5, ease: "power1.in" })
          .add(() => {
            try {
              const cam = storyCameraAt(storyScenes[0], 0, 0);
              if (cam && typeof map !== "undefined" && map && map.jumpTo) {
                map.jumpTo({ center: cam.center, zoom: cam.zoom,
                  pitch: cam.pitch, bearing: cam.bearing || 0 });
              }
            } catch (e) { /* the first sync lands the same pose */ }
            storyHideLanding();
            try { storyMaster.play(); } catch (e) { /* ignore */ }
          })
          .to(dip, { opacity: 0, duration: 0.5, ease: "power1.out" });
      } catch (e) {
        try { dip.style.opacity = "0"; } catch (e2) { /* ignore */ }
        storyHideLanding();
        try { storyMaster.play(); } catch (e3) { /* ignore */ }
      }
      return;
    }
  }
  storyState = "playing";
  storyHideLanding();
  try { storyMaster.play(); } catch (e) { /* ignore */ }
  storyUpdatePlayButton();
}

function storyPause() {
  storyState = (storyState === "ended") ? "ended" : "paused";
  try { if (storyMaster) storyMaster.pause(); } catch (e) { /* ignore */ }
  storyUpdatePlayButton();
}

function storyReplay() {
  if (!storyHasGsap() || !storyScenes.length) return;
  storyBuildMaster();
  storyScene = 0;
  storyMonth = -1;
  storyState = "playing";
  storyHideLanding();
  storySeekTo(0);
}

function storyTogglePlay() {
  if (storyState === "playing") storyPause();
  else storyPlay();
}

// Phase 8a: the headline card and the history strip live in the header
// in Explore and on the map in story mode (the header is hidden there).
// Home positions are captured on the first call; moves keep the nodes
// (and their listeners), so the dashboard update paths are untouched.
let storyCardHome = null;

function storyPlaceCards(toStory) {
  try {
    const head = storyEl("headline");
    const strip = storyEl("historyStrip");
    const mapHost = storyEl("map");
    if (!head || !strip || !mapHost) return;
    if (!storyCardHome) {
      storyCardHome = { hp: head.parentNode, hn: head.nextSibling,
        sp: strip.parentNode, sn: strip.nextSibling };
    }
    if (toStory) {
      mapHost.appendChild(head);
      mapHost.appendChild(strip);
    } else {
      if (storyCardHome.hp) {
        storyCardHome.hp.insertBefore(head, storyCardHome.hn);
      }
      if (storyCardHome.sp) {
        storyCardHome.sp.insertBefore(strip, storyCardHome.sn);
      }
    }
  } catch (e) { /* cards stay where they are */ }
}

function storyHideOverlays() {
  storyHideCaption();
  storyClearCallouts();
  try { storyDeckHide(); } catch (e) { /* ignore */ }
  // 7d fix: entering Explore hides the landing too (every Explore route
  // funnels through storySetMode("explore")); storyWatch brings it back
  // when the story never started.
  storyHideLanding();
  storyShow(storyEl("storyPreloader"), false);
  storyMonthWordKey = "";
  storyShow(storyEl("sceneMonthWord"), false);
  storyShow(storyEl("sceneTag"), false);
  storyShow(storyEl("sceneIndex"), false);
  storyShow(storyEl("sceneTitle"), false);
  storyShow(storyEl("sceneCover"), false);
  storyShow(storyEl("sceneDim"), false);
  storyShow(storyEl("dateRoll"), false);
  storyShow(storyEl("storyEnd"), false);
  storyShow(storyEl("hoverLabel"), false);
  storyHideExplainer();
  storyShowSidePanel(false);
  storyHideMemoPanel();
  storyHideProof();
  storyHideEvidence();
  storyRemoveS2();
  storyRemoveSam();
  try { storyApplySamHairline(false); } catch (e) { /* ignore */ }
  storyRemoveEurope();
  try { storyRemoveEuropeWarmer(); } catch (e) { /* ignore */ }
  storyHideSideView();
  // The history strip belongs to Explore (always full) and to scene 4.
  // Hide here; the Explore path re-renders it full via applyCutoff.
  storyShow(storyEl("historyStrip"), false);
  const headline = storyEl("headline");
  if (headline) {
    headline.classList.remove("story-hide");
    storyShow(headline, true);
  }
}

// Re-apply the current playhead's state (used when returning to Story).
function storyResync() {
  if (!storyMaster || !storyScenes.length) return;
  const t = storyMaster.time();
  const i = sceneIndexAtTime(storyScenes, t);
  storyScene = i;
  storyMonth = -1;
  storyScrubbing = true;
  try {
    storyApplySceneState(i);
    storySyncProgress(i, t - storyBounds[i].start);
    storySyncCaption(t);
    storySyncScrubUI(t);
  } finally {
    storyScrubbing = false;
  }
}

function storySetMode(mode) {
  try { document.body.dataset.mode = mode; } catch (e) { return; }
  try { storyWrapDeckHide(); } catch (e) { /* ignore */ }
  try { storyApplySky(); } catch (e) { /* ignore */ }
  try { storyApplySpansVisibility(); } catch (e) { /* ignore */ }
  if (mode === "explore") {
    if (storyState === "playing") storyPause();
    storyStopLandingOrbit();
    storyPlaceCards(false);
    storyHideOverlays();
    storyApplyLabelVisibility(null);
    try { storyRestoreFill(); } catch (e) { /* ignore */ }
    try {
      if (typeof map !== "undefined" && map) {
        map.resize();
        if (storyReduced()) map.jumpTo({ pitch: 0 });
        else map.easeTo({ pitch: 0, duration: 800 });
      }
    } catch (e) { /* ignore */ }
    const btn = storyEl("btnPlay");
    if (btn) { btn.textContent = "Play"; btn.setAttribute("aria-pressed", "false"); }
    try { if (typeof applyCutoff === "function") applyCutoff(); } catch (e) { /* ignore */ }
  } else {
    try { if (typeof setPlaying === "function") setPlaying(false); } catch (e) { /* ignore */ }
    try { if (typeof map !== "undefined" && map) map.resize(); } catch (e) { /* ignore */ }
    storyPlaceCards(true);
    storyResync();
    storyUpdatePlayButton();
  }
}

// "Watch the story": resume a paused story, else restart at scene 1.
// If story init failed (e.g. the GSAP CDN was down), retry once and stay
// in Explore rather than entering a dead Story mode.
function storyWatch() {
  try {
    if (typeof window !== "undefined" && !window.__storyReady && !storyInit()) return;
  } catch (e) { return; }
  // 7d fix: when the story never started (e.g. Escape from the landing
  // to Explore), bring the landing back instead of auto-playing. Show it
  // before the resync so the tag/title sync sees the unstarted state.
  const idle = storyState === "idle";
  if (idle) storyShow(storyEl("storyLanding"), true);
  storySetMode("story");
  if (idle) return;
  if (storyState === "paused") storyPlay();
  else storyReplay();
}

function storyApplyCc() {
  const btn = storyEl("btnCC");
  if (btn) {
    btn.setAttribute("aria-pressed", storyCcOn ? "true" : "false");
    btn.classList.toggle("active", storyCcOn);
  }
  const cap = storyEl("caption");
  if (cap) {
    cap.classList.toggle("cc-off", !storyCcOn);
    if (storyCaptionKey) cap.classList.toggle("show", storyCcOn);
  }
}

function storyToggleCc() {
  storyCcOn = !storyCcOn;
  try { localStorage.setItem("radartwin-cc", storyCcOn ? "on" : "off"); } catch (e) { /* ignore */ }
  storyApplyCc();
}

function storyWireHover() {
  try {
    if (typeof map === "undefined" || !map) return;
    const show = (e) => {
      if (storyMode() !== "story") return;
      if (!e.features || !e.features.length) return;
      const bid = String(e.features[0].properties.id);
      let name = bid;
      try { if (typeof ID2NAME !== "undefined" && ID2NAME) name = ID2NAME[bid] || bid; } catch (err) { /* ignore */ }
      let level = "not monitored";
      try {
        if (typeof DEC !== "undefined" && typeof CUT !== "undefined" && CUT) {
          const ci = cutoffIdxLocal();
          const d = DEC[CUT[ci]] && DEC[CUT[ci]][bid];
          if (d && d.model) level = d.model.risk;
        }
      } catch (err) { /* ignore */ }
      const label = storyEl("hoverLabel");
      if (!label || !e.point) return;
      label.textContent = `${name} — ${level}`;
      label.style.left = `${e.point.x + 14}px`;
      label.style.top = `${e.point.y + 10}px`;
      storyShow(label, true);
    };
    const hide = () => storyShow(storyEl("hoverLabel"), false);
    map.on("mousemove", "bridges-fill", show);
    map.on("mousemove", "bridges-markers", show);
    map.on("mousemove", "bridges-markers-hit", show);
    map.on("mouseleave", "bridges-fill", hide);
    map.on("mouseleave", "bridges-markers", hide);
    map.on("mouseleave", "bridges-markers-hit", hide);
    map.on("dragstart", hide);
  } catch (e) { /* hover labels are a nicety, never fatal */ }
}

function storyWireEvents() {
  const scrub = storyEl("scrub");
  if (scrub) {
    scrub.addEventListener("input", () => {
      if (!storyMaster) return;
      storySeekTo((Number(scrub.value) / 1000) * storyMaster.duration());
    });
    scrub.addEventListener("pointerdown", () => { storyScrubDragging = true; });
    scrub.addEventListener("pointerup", () => { storyScrubDragging = false; });
    scrub.addEventListener("blur", () => { storyScrubDragging = false; });
  }
  const play = storyEl("storyPlay");
  if (play) play.addEventListener("click", () => storyPlay());
  const replay = storyEl("btnReplay");
  if (replay) replay.addEventListener("click", () => storyReplay());
  const ex1 = storyEl("btnExploreStory");
  if (ex1) ex1.addEventListener("click", () => storySetMode("explore"));
  const ex2 = storyEl("btnExploreEnd");
  if (ex2) ex2.addEventListener("click", () => storySetMode("explore"));
  const watch = storyEl("btnWatchStory");
  if (watch) watch.addEventListener("click", () => storyWatch());
  const cc = storyEl("btnCC");
  if (cc) cc.addEventListener("click", () => storyToggleCc());
  document.addEventListener("keydown", (e) => {
    if (storyMode() !== "story" || !storyMaster) return;
    const target = e.target || {};
    const tag = target.tagName || "";
    // Never hijack typing or a focused button/link (Space activates those).
    if ((tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && target.id !== "scrub") return;
    if ((e.key === " " || e.key === "Spacebar") && (tag === "BUTTON" || tag === "A")) return;
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      storyTogglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      storySeekScene(storyScene - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      storySeekScene(storyScene + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      storySeekScene(0);
    } else if (e.key === "End") {
      e.preventDefault();
      storySeekScene(storyScenes.length - 1);
    }
  });
  try {
    if (typeof map !== "undefined" && map) {
      if (map.loaded && map.loaded()) storyWireHover();
      else if (map.on) map.on("load", storyWireHover);
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", () => {
        try {
          if (storyMode() !== "story") return;
          const sc = storyScenes[storyScene];
          if (!sc || sc.id !== "three-years") return;
          if (storyMonth >= 0) storyRenderHistoryStrip(storyMonth, storyMonth);
        } catch (e) { /* ignore */ }
      });
    }
  } catch (e) { /* ignore */ }
}

function storyInit() {
  try {
    if (typeof window !== "undefined" && window.__storyReady) return true;
  } catch (e) { /* ignore */ }
  try {
    const saved = localStorage.getItem("radartwin-cc");
    storyCcOn = (saved !== "off");
  } catch (e) { storyCcOn = true; }
  storyApplyCc();
  if (!storyHasGsap()) return false;
  try {
    if (typeof CUT === "undefined" || !CUT || !CUT.length) return false;
    if (typeof DEC === "undefined" || !DEC) return false;
  } catch (e) { return false; }
  try {
    if (storyReduced()) document.body.classList.add("story-reduced");
  } catch (e) { /* ignore */ }
  storyScenes = buildScenes({ cutoffs: CUT, reduced: storyReduced() });
  storyBounds = sceneBounds(storyScenes);
  try {
    storyHits = firstLevelHits(CUT, DEC, (typeof ID2NAME !== "undefined") ? ID2NAME : {});
  } catch (e) { storyHits = []; }
  storyBuildChapters();
  storyBuildMonthTicks();
  storyWireEvents();
  storyBuildMaster();
  // Landing backdrop: scene 1's state behind the title and Play button,
  // but the scene-1 title block and index stay hidden until Play. The
  // enter takes the tile-wait path even though the master is paused, so
  // the first tilt never starts on half-loaded tiles; the Play ring
  // enables when the preloader (fonts + first tiles, 1.2 s minimum) lifts.
  storyScene = 0;
  storyMonth = -1;
  storyPlaceCards(true);
  storyApplySceneState(0, true);
  // Fix 4: the boot ease to 12.3 in web/index.html runs on map load,
  // after this init. Re-assert the 15.2/66/-30 landing view on load (this
  // handler runs after the inline one, so it wins) and stop the ease.
  try {
    if (typeof map !== "undefined" && map) {
      const landingFix = () => {
        try {
          if (storyHasStarted()) return;
          const sc0 = storyScenes[0];
          if (sc0) storyApplyCamera(sc0, true);
          try { storyApplySky(); } catch (e) { /* ignore */ }
        } catch (e) { /* ignore */ }
      };
      if (map.loaded && map.loaded()) landingFix();
      else if (map.on) map.on("load", landingFix);
    }
  } catch (e) { /* ignore */ }
  storySyncProgress(0, 0);
  storySyncCaption(0);
  storySyncScrubUI(0);
  storyShow(storyEl("sceneTitle"), false);
  storyShow(storyEl("sceneTag"), false);
  storyRunPreloader();
  storyUpdatePlayButton();
  try { window.__storyReady = true; } catch (e) { /* ignore */ }
  return true;
}

// Page API used by web/index.html's inline script (guarded there).
function StoryTogglePlay() { storyTogglePlay(); }
function StoryToExplore() { storySetMode("explore"); }
function StoryBridgeClick(bid) {
  storyPause();
  storySetMode("explore");
  try { if (typeof selectBridge === "function") selectBridge(bid); } catch (e) { /* ignore */ }
}
// History-strip click in Story mode: seek to scene 4 at that month.
function StorySeekScene4Month(m) {
  try {
    if (!storyMaster || !storyBounds[3]) return;
    const n = (typeof CUT !== "undefined" && CUT) ? CUT.length : 0;
    const mm = Math.max(0, Math.min(n - 1, Number(m)));
    storySeekTo(storyBounds[3].start + storyScene4Lead() + mm * STORY_MONTH_STEP + 0.01);
  } catch (e) { /* ignore */ }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    window.addEventListener("radartwin:ready", () => {
      try { storyInit(); } catch (e) { /* inline script falls back to Explore */ }
    });
  } catch (e) { /* ignore */ }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    captionText, storyPluralize, storyMonthLabel, storyFmtEventDate,
    storyDaysBetween, storyAddDays, reasonFromFlags, headlineText,
    topHighBridge, highCount, orderBridgesByRank, scene3LitCount,
    firstLevelHits, buildScenes, sceneBounds,
    totalDuration, sceneIndexAtTime, scene4Allowed, captionDataFor,
    captionIndexAtLocalTime, captionAtTime, storyOrbitBearing,
    stepCameraPatch, storyEaseOut, storyCameraAt, storyTitleShown,
    storyMonthWordParts,
    storySpansOpacityAtZoom, storySpansStrokeAtZoom, storySpansOpacityExpr,
    storySpansStrokeExpr, storyFillOpacityAtZoom, storyFillOpacityExpr,
    storyHistoryGeometry,
    memoTypedChars, memoHighlightRange, revealedCount, renderedTextLength,
    revealNodes, renderedHighlightRange, proofCountValue, proofChecksShown,
    europeLitCount, storyHidesFootprint, storyEvidenceShown,
    storyEnsureEuropeWarmer, storyRemoveEuropeWarmer,
    storyEuropeWarmerSize,
    STORY_SCENE_NAMES, STORY_PLACEHOLDERS,
    STORY_MONTH_STEP, STORY_SCENE4_LEAD, STORY_SCENE4_TAIL,
    STORY_WAIT_TIMEOUT, STORY_CALLOUT_HOLD, STORY_DATE_ROLL,
    STORY_DATE_ROLL_AT, STORY_END_AT, STORY_S9_FLY, STORY_S9_START_ZOOM,
    STORY_S9_START_PITCH, STORY_S9_START_BEARING,
    STORY_SCENE3_FLY, STORY_SCENE3_GAP, STORY_SCENE6_ORBIT, STORY_GLOW_PULSE,
    STORY_TITLE_ZOOM, STORY_TITLE_PITCH, STORY_TITLE_BEARING,
    STORY_TITLE_CENTER, STORY_TITLE_ORBIT,
    STORY_CRANE_START_ZOOM, STORY_CRANE_START_PITCH, STORY_TITLE_AT,
    STORY_CITY_ZOOM, STORY_CITY_PITCH, STORY_CITY_CENTER,
    STORY_CLOSEUP_CENTER, STORY_S4_END_CENTER,
    STORY_S5_ZOOM, STORY_S5_PITCH, STORY_S5_BEARING, STORY_S5_FLY,
    STORY_S6_ZOOM, STORY_S6_PITCH, STORY_S6_BEARING, STORY_S6_ORBIT,
    STORY_SPANS_OPACITY, STORY_SPANS_STROKE, STORY_SPANS_Z0, STORY_SPANS_Z1,
    STORY_FILL_Z0, STORY_FILL_Z1, STORY_FILL_MIN, STORY_FILL_MAX,
    STORY_MEMO_CPS, STORY_PROOF_COUNT, STORY_PROOF_GAP, STORY_EUROPE_AT,
    STORY_EUROPE_ZOOM, STORY_EUROPE_CENTER, STORY_EUROPE_CITIES,
    STORY_EUROPE_DIP, STORY_EUROPE_CUT_AT,
    STORY_PROOF_QUANTITIES, STORY_EVIDENCE_AT, STORY_CLOSEUP_IDS
  };
}
