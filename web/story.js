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
const STORY_DATE_ROLL = 2.0; // seconds for the scene-9 date roll
const STORY_DATE_ROLL_AT = 0.5; // scene-9 local time when the roll starts
const STORY_END_AT = 10.0; // scene-9 local time when the ending panel appears

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
const STORY_SCENE3_FLY = 2.0; // seconds of camera pull-back before light-up
const STORY_SCENE3_GAP = 0.25; // seconds between bridge light-ups
const STORY_SCENE6_ORBIT = 6.0; // seconds for the 20° orbit
const STORY_GLOW_PULSE = 1.2; // seconds for the one glow pulse
const STORY_MEMO_CPS = 40; // scene-7 typing speed, chars per second
const STORY_PROOF_COUNT = 2.0; // scene-8 seconds counting from zero
const STORY_PROOF_GAP = 0.1; // scene-8 seconds between check marks
const STORY_EUROPE_AT = 10.0; // scene-9 local time the Europe pullout starts
const STORY_EUROPE_ZOOM = 3.8;
const STORY_EUROPE_CENTER = [12, 52];
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
      camera: { mode: "city", pitch: 55, orbit: 0.5 },
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
      camera: { mode: "city", zoom: 12, pitch: 40 },
      layers: { basemap: "dark" }, overlay: "labels",
      captions: [
        { text: "{n_bridges} bridges in Dresden. {n_monitored} the satellite can see; {n_not} it cannot.",
          at: 0.5, hold: 9.0 }
      ],
      duration: D(10, 9.5), waitFor: ["tiles"] },
    { id: "three-years", cutoff: first, endCutoff: last,
      camera: { mode: "city", pitch: 40, drift: true },
      layers: { basemap: "dark" }, overlay: "headline",
      captions: [],
      duration: s4dur, waitFor: ["tiles"] },
    { id: "august", cutoff: august,
      camera: { mode: "bridge", bridge: "Carolabrücke", zoom: 15, pitch: 60 },
      layers: { basemap: "imagery" }, overlay: "deck",
      captions: [
        { text: "{month}. {n:n_high|bridge|bridges} flagged.", at: 0.5, hold: 4.5 },
        { text: "This one is moving at both ends.", at: 5.5, hold: 4.0 }
      ],
      duration: D(10, 9.5), waitFor: ["tiles"] },
    { id: "september", cutoff: last,
      camera: { mode: "step", orbit: 20 },
      layers: { basemap: "imagery" }, overlay: "counter",
      captions: [
        { text: "{month}. The only red bridge in the city.", at: 0.5, hold: 5.5 },
        { text: "Faster than anything in its own record. One end rising, the next span sinking.",
          at: 6.5, hold: 5.0 }
      ],
      duration: D(12, 11.5), waitFor: ["tiles"] },
    { id: "the-report", cutoff: last,
      camera: { mode: "hold", pushIn: 0.3 },
      layers: { basemap: "imagery", sam: true }, overlay: "memo",
      captions: [
        { text: "Muse Spark read the numbers and wrote the inspection memo.", at: 0.5, hold: 4.0 },
        { text: "SAM 3.1 found the bridge in the satellite photo.", at: 5.0, hold: 4.5 },
        { text: "Built with Muse Code.", at: 10.0, hold: 3.5 }
      ],
      duration: D(14, 13.5), waitFor: ["tiles", "memo"] },
    { id: "the-proof", cutoff: last,
      camera: { mode: "hold", dim: true },
      layers: { dim: true }, overlay: "proof",
      captions: [
        { text: "The future was deleted and everything re-run. Nothing changed.", at: 0.5, hold: 4.5 },
        { text: "An engineering checklist and the model agree on every red bridge.", at: 5.5, hold: 4.0 }
      ],
      duration: D(10, 9.5), waitFor: [] },
    { id: "ten-days-later", cutoff: last,
      camera: { mode: "pullback", zoom: 12, pitch: 40 },
      layers: { basemap: "dark", sam: true, radar: true }, overlay: "outro",
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

// Linear camera orbit: totalDeg over spanSec from the scene start,
// holding the end value afterwards. Scene 6 runs 20 deg over
// STORY_SCENE6_ORBIT (6 s): 10 deg at 3 s, 20 deg from 6 s on.
function storyOrbitBearing(totalDeg, spanSec, localT) {
  const span = Number(spanSec);
  if (!(span > 0)) return 0;
  const frac = Math.max(0, Math.min(1, Number(localT) / span));
  return (Number(totalDeg) || 0) * frac;
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

// Scene-9 Europe dots: how many cities are lit at localT (one by one from
// STORY_EUROPE_AT to the scene end; all at once under reduced motion).
function europeLitCount(localT, total, duration, reduced) {
  const n = Number(total) || 0;
  const t = Number(localT);
  if (t < STORY_EUROPE_AT) return 0;
  if (reduced) return n;
  const span = Math.max(0.001, Number(duration) - STORY_EUROPE_AT);
  return Math.max(0, Math.min(n, Math.floor((t - STORY_EUROPE_AT) / span * n) + 1));
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
let storyProof = null;
let storyEuropeN = -1;
let storyEuropeCam = false;

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
    if (c.mode === "hold") {
      if (c.pushIn && !cut && !reduced) {
        map.easeTo({ zoom: map.getZoom() + c.pushIn, duration: 2000 });
      }
      return;
    }
    if (c.mode === "step") {
      // One step: hold position and reset the bearing. The scene-6 orbit
      // tween on the sub-timeline (plus the playhead sync) drives the
      // bearing from here, so every entry starts from a known 0.
      try { if (map.jumpTo) map.jumpTo({ bearing: 0 }); } catch (e) { /* ignore */ }
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
    }
    // Orbit and drift are functions of the playhead in storySyncCamera
    // (jumpTo per update) so they scrub and survive seeks. Jump to the
    // scene's start now so no ease is in flight for the sync to fight.
    const playheadDriven = !reduced && (c.orbit || c.drift);
    if (cut || reduced || playheadDriven) {
      map.jumpTo({ center, zoom, pitch, bearing: 0 });
    } else if (c.mode === "bridge" || c.mode === "pullback") {
      map.flyTo({ center, zoom, pitch, bearing: 0, duration: 2000 });
    } else if (sc && sc.id === "twenty-bridges") {
      map.easeTo({ center, zoom, pitch, bearing: 0, duration: 2000 });
    } else {
      map.easeTo({ center, zoom, pitch, bearing: 0, duration: 1800 });
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
      title: `${name} span ${best.span}`, sub: String(val) };
  } catch (e) { return null; }
}

// Scene 5-6 side view: render Carolabrücke's deck at monthIdx into the
// slide-in panel beside the map. Slides in with GSAP (appears under
// reduced motion); the deck itself rises via AnnotateRenderSideView.
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
      const note = storyEl("sceneSideNote");
      if (note && geo) {
        note.textContent = `Sections displaced by this month's movement. Vertical ×${geo.factor.toFixed(1)}.`;
      }
    }
  } catch (e) { /* panel still shows */ }
  const wasHidden = panel.hasAttribute("hidden");
  storyShow(panel, true);
  if (wasHidden && !storyReduced() && storyHasGsap()) {
    try {
      gsap.from(panel, { x: "100%", opacity: 0, duration: 0.6, ease: "power2.out" });
    } catch (e) { /* ignore */ }
  }
}

function storyHideSideView() {
  storyShow(storyEl("sceneSideView"), false);
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
  if (title) title.textContent = `Inspection memo — ${cutoff}`;
  body.textContent = "Loading the memo…";
  storyShow(panel, true);
}

function storyHideMemoPanel() {
  storyShow(storyEl("sceneMemo"), false);
}

// Rendered memo for the typing panel: renderMemo output minus the H1
// (the panel heading already says "Inspection memo — <cutoff>") and the
// "Cutoff …" line, with the rendered length and highlight precomputed.
// Returns {html, total, hl} or null when renderMemo/DOM is unavailable.
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

// ---------- Phase 7c: scene 8 proof ----------

function storyShowProof() {
  const panel = storyEl("sceneProof");
  const list = storyEl("proofList");
  const foot = storyEl("proofFoot");
  if (!panel) return;
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

// Count-in + checks as a function of the playhead; final state at once
// under reduced motion.
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
    if (typeof AnnotateClear === "function") AnnotateClear("eu-");
  } catch (e) { /* ignore */ }
  try {
    if (typeof map === "undefined" || !map) return;
    if (map.getLayer && map.getLayer("europe-dots")) map.removeLayer("europe-dots");
    if (map.getSource && map.getSource("europe")) map.removeSource("europe");
  } catch (e) { /* ignore */ }
}

// Europe camera + dots as a function of the playhead: Dresden until
// STORY_EUROPE_AT, then zoom 3.8 on 12E 52N with the cities lighting one
// by one, Dresden last and labelled.
function storySyncEurope(localT, duration) {
  const wantEurope = Number(localT) >= STORY_EUROPE_AT;
  if (wantEurope !== storyEuropeCam) {
    storyEuropeCam = wantEurope;
    try {
      if (typeof map !== "undefined" && map) {
        if (wantEurope) {
          if (storyScrubbing || storyReduced()) {
            map.jumpTo({ center: STORY_EUROPE_CENTER.slice(),
              zoom: STORY_EUROPE_ZOOM, pitch: 0, bearing: 0 });
          } else {
            map.easeTo({ center: STORY_EUROPE_CENTER.slice(),
              zoom: STORY_EUROPE_ZOOM, pitch: 0, bearing: 0,
              duration: 2000 });
          }
        } else {
          map.jumpTo({ center: [13.745, 51.057], zoom: 12, pitch: 40,
            bearing: 0 });
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
    if (typeof AnnotateSetCallouts === "function") {
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
          map.setPaintProperty("bridges-glow", "circle-radius", 18 + 10 * state.t);
          map.setPaintProperty("bridges-glow", "circle-opacity",
            ["case", ["==", ["feature-state", "risk"], "high"], 0.25 + 0.35 * state.t, 0]);
        } catch (e) { /* ignore */ }
      },
      onComplete: () => {
        try {
          map.setPaintProperty("bridges-glow", "circle-radius", 18);
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
  // The tag text always reflects the scene; visibility is owned per-update
  // by storySyncSceneTag so seeks and natural transitions agree. The title
  // shows only after the story starts (landing hidden).
  const tag = storyEl("sceneTag");
  if (tag) {
    tag.textContent = `scene ${i + 1} of 9`;
    storyShow(tag, storyHasStarted());
  }
  storyShow(storyEl("sceneTitle"), sc.overlay === "title" && storyHasStarted());
  storyShow(storyEl("sceneCover"), !!(sc.layers && sc.layers.cover));
  storyShow(storyEl("sceneDim"), !!(sc.layers && sc.layers.dim));
  // 7c overlays: explainer owns the cover, the memo panel the side area,
  // the proof panel the dimmed map. Anything not for this scene is removed
  // so scrubs always land on correct state.
  if (sc.id === "how-radar-sees") storyShowExplainer();
  else storyHideExplainer();
  if (sc.id === "the-report") storyShowMemoPanel(sc.cutoff);
  else {
    storyHideMemoPanel();
    storyRemoveS2();
    storyRemoveSam();
  }
  if (sc.id === "the-proof") storyShowProof();
  else storyHideProof();
  if (sc.id !== "ten-days-later") storyRemoveEurope();
  storyShow(storyEl("historyStrip"), sc.id === "three-years");
  if (sc.id === "august" || sc.id === "september") {
    try {
      storyShowSideView(storyCutoffIndexOf(sc.cutoff));
    } catch (e) { /* ignore */ }
  } else {
    storyHideSideView();
  }
  const headline = storyEl("headline");
  if (headline) {
    // The headline card belongs to Explore and to scene 4; during the
    // other story scenes it hides but keeps its space (no header jump).
    headline.classList.toggle("story-hide", sc.id !== "three-years");
  }
  if (sc.id !== "ten-days-later") {
    storyShow(storyEl("storyEnd"), false);
    storyShow(storyEl("dateRoll"), false);
  } else {
    storyShow(storyEl("dateRoll"), true);
  }
  // Scene 9 carries the phase-5e collapse moment: Carolabrücke selected
  // with the Radar and SAM layers on (the layers come from storyApplyLayers).
  if (sc.id === "ten-days-later") {
    try {
      if (typeof NAME2ID !== "undefined" && NAME2ID && typeof selectBridge === "function") {
        const carola = NAME2ID["Carolabrücke"];
        if (carola) selectBridge(carola, { fly: false });
      }
    } catch (e) { /* ignore */ }
  }
}

// Enter scene i. Forward play waits for the scene's waitFor list (4 s,
// then a cut); scrubbing and reduced motion cut straight to the state.
function storyApplySceneState(i) {
  const sc = storyScenes[i];
  if (!sc) return;
  const my = ++storyEnterToken;
  const instant = storyScrubbing || storyReduced() || !storyMaster || !storyMaster.isActive();
  storyClearCallouts();
  storyHideCaption();
  storyApplyLayers(sc);
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
  // Scenes 5-6: the span callout reads only the bound month.
  if (sc.id === "august" || sc.id === "september") {
    try {
      const bid = storyCarolaId();
      const midx = storyCutoffIndexOf(sc.cutoff);
      if (bid && typeof AnnotateSetCallouts === "function") {
        const co = storySpanCallout(bid, midx,
          sc.id === "august" ? "aug-span" : "sep-span");
        if (co) {
          if (sc.id === "september") {
            // The counter starts at the bound month's values; the tween
            // below counts it up from August.
            try {
              if (typeof CUT !== "undefined" && CUT && typeof DEC !== "undefined" && DEC) {
                const table = DEC[CUT[midx]] || {};
                const d = table[bid] || {};
                const n = (typeof N_MONITORED !== "undefined") ? N_MONITORED : 19;
                if (typeof formatRankCounter === "function") {
                  co.counter = formatRankCounter(d.rank, n, d.z);
                }
              }
            } catch (e) { /* counter set by the tween */ }
          }
          AnnotateSetCallouts([co]);
        }
      }
    } catch (e) { /* ignore */ }
  }
  // Scene 7: memo typing + S2 chip + SAM outline (token-guarded fetches).
  if (sc.id === "the-report") {
    try { storyFetchMemo(sc.cutoff, my); } catch (e) { /* ignore */ }
    try { storyAddS2(my); } catch (e) { /* ignore */ }
    try { storyAddSam(my); } catch (e) { /* ignore */ }
  }
  // Scene 8: proof numbers (token-guarded fetch).
  if (sc.id === "the-proof") {
    try { storyFetchProof(my); } catch (e) { /* ignore */ }
  }
  // Scene 6: glow pulse once, then the rank/z counter from August.
  if (sc.id === "september") {
    try { storyGlowPulseOnce(`sep-${storyCutoffIndexOf(sc.cutoff)}`); } catch (e) { /* ignore */ }
    try {
      if (typeof AnnotateTweenCounter === "function" &&
          typeof CUT !== "undefined" && CUT && typeof DEC !== "undefined" && DEC) {
        const midx = storyCutoffIndexOf(sc.cutoff);
        const prev = Math.max(0, midx - 1);
        const bid = storyCarolaId();
        const now = (DEC[CUT[midx]] || {})[bid] || {};
        const was = (DEC[CUT[prev]] || {})[bid] || {};
        const n = (typeof N_MONITORED !== "undefined") ? N_MONITORED : 19;
        AnnotateTweenCounter("sep-span", was.rank, now.rank, n, was.z, now.z, 1.5);
      }
    } catch (e) { /* counter already shows the final value */ }
  }
  if (instant || !(sc.waitFor && sc.waitFor.length)) {
    storyApplyCamera(sc, true);
    return;
  }
  try { storyMaster.pause(); } catch (e) { /* ignore */ }
  storyWaitForReady(sc.waitFor, sc.cutoff).then((res) => {
    // A seek or a new run while waiting invalidates this enter: never
    // apply a stale scene's camera or resume over the new state.
    if (my !== storyEnterToken) return;
    storyApplyCamera(sc, !!(res && res.timedOut));
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

// Sanctioned scene-4 advance: reveal month m, bind it, and fire any
// first-time callouts (suppressed while scrubbing). The history strip
// fills to the current month; cells after it stay empty.
function storyStepMonth(m, quiet) {
  storyMonth = m;
  if (m > storyHighWater) storyHighWater = m;
  storyBindCutoffIndex(m, true);
  try {
    if (typeof renderHistoryStrip === "function") renderHistoryStrip(m, m);
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

function storySyncEnding(show) {
  const end = storyEl("storyEnd");
  if (!end) return;
  if (show && end.hasAttribute("hidden")) {
    const data = storyCaptionData();
    const l1 = storyEl("storyEndLine1");
    const l2 = storyEl("storyEndLine2");
    if (l1) l1.textContent = captionText("{days} days later, {event_asset} collapsed.", data);
    if (l2) l2.textContent = "The data flagged it first.";
  }
  storyShow(end, show);
}

// Camera as a function of the playhead: scene 1 orbits at 0.5 deg/s
// (bearing = 0.5 * localT, so 2 deg at 4 s and 4 deg at 8 s), scene 6
// orbits 20° over 6 s, scene 4 drifts its centre. jumpTo per update
// scrubs and survives seeks; skipped under reduced motion.
function storySyncCamera(i, localT) {
  try {
    if (typeof map === "undefined" || !map) return;
    if (storyReduced()) return;
    if (storyMode() !== "story") return;
    const sc = storyScenes[i];
    if (!sc) return;
    const c = sc.camera || {};
    if (c.mode === "step" && c.orbit) {
      // Same linear law as the scene-6 sub-timeline tween, so seeks land
      // on the right bearing even when tween callbacks are suppressed.
      const span = (sc.id === "september") ? STORY_SCENE6_ORBIT : sc.duration;
      const b = storyOrbitBearing(c.orbit || 0, span, localT);
      try { if (map.jumpTo) map.jumpTo({ bearing: b }); } catch (e) { /* ignore */ }
    } else if (c.orbit) {
      const b = (c.orbit || 0) * Math.max(0, localT);
      try { if (map.jumpTo) map.jumpTo({ bearing: b }); } catch (e) { /* ignore */ }
    } else if (c.drift) {
      const frac = Math.max(0, Math.min(1, localT / sc.duration));
      const cc = [13.745 + 0.004 * frac, 51.057 + 0.002 * frac];
      try { if (map.jumpTo) map.jumpTo({ center: cc }); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* map not ready */ }
}

// The scene tag (and the scene-1 title block) as a function of the
// playhead: the same sceneIndexAtTime lookup the scrub bar uses, on every
// master update, so seeks, steps, chapter clicks and natural transitions
// agree. Hidden until the story starts and in Explore mode.
function storySyncSceneTag(t) {
  try {
    const tag = storyEl("sceneTag");
    const title = storyEl("sceneTitle");
    if (!storyScenes.length) return;
    if (storyMode() !== "story" || !storyHasStarted()) {
      if (tag) storyShow(tag, false);
      if (title) storyShow(title, false);
      return;
    }
    const idx = sceneIndexAtTime(storyScenes, t);
    if (tag) {
      tag.textContent = `scene ${idx + 1} of 9`;
      storyShow(tag, true);
    }
    if (title) {
      const sc = storyScenes[idx];
      storyShow(title, !!sc && sc.overlay === "title");
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
  }
  if (sc.id === "the-proof") {
    storySyncProof(localT);
  }
  if (sc.id === "ten-days-later") {
    storySyncDateRoll(localT);
    storyShow(storyEl("dateRoll"), localT < STORY_END_AT);
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
  storyScene3Order = [];
  storyScene3Lit = -1;
  storyClearCallouts();
  storyHideExplainer();
  storyHideMemoPanel();
  storyHideProof();
  storyRemoveS2();
  storyRemoveSam();
  storyRemoveEurope();
  storyHideCaption();
  storyMaster = gsap.timeline({ paused: true,
    onUpdate: storyOnMasterUpdate, onComplete: storyOnComplete });
  storyScenes.forEach((sc, i) => {
    const sub = gsap.timeline();
    sub.to({}, { duration: sc.duration, ease: "none" });
    if (sc.id === "september" && !storyReduced() &&
        sc.camera && sc.camera.orbit) {
      // Scene-6 orbit: a tween on this sub-timeline from the bearing at
      // scene start (0; storyApplyCamera resets it on entry) to +20 deg
      // over STORY_SCENE6_ORBIT seconds. It scrubs with the master, holds
      // 20 deg after 6 s, and is skipped under reduced motion.
      const orbTarget = sc.camera.orbit || 20;
      const orbSpan = Math.min(STORY_SCENE6_ORBIT, sc.duration);
      const orb = { b: 0 };
      sub.fromTo(orb, { b: 0 }, { b: orbTarget, duration: orbSpan,
        ease: "none",
        onUpdate: () => {
          try {
            if (storyReduced()) return;
            if (storyMode() !== "story") return;
            if (typeof map !== "undefined" && map && map.jumpTo) {
              map.jumpTo({ bearing: orb.b });
            }
          } catch (e) { /* ignore */ }
        } }, 0);
    }
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

function storyPlay() {
  if (!storyHasGsap() || !storyScenes.length) return;
  if (!storyMaster) storyBuildMaster();
  if (storyState === "ended" ||
      (storyMaster && storyMaster.time() >= storyMaster.duration() - 0.01)) {
    storyBuildMaster();
    storyState = "playing";
    storyHideLanding();
    storySeekTo(0);
    return;
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

function storyHideOverlays() {
  storyHideCaption();
  storyClearCallouts();
  storyShow(storyEl("sceneTag"), false);
  storyShow(storyEl("sceneTitle"), false);
  storyShow(storyEl("sceneCover"), false);
  storyShow(storyEl("sceneDim"), false);
  storyShow(storyEl("dateRoll"), false);
  storyShow(storyEl("storyEnd"), false);
  storyShow(storyEl("hoverLabel"), false);
  storyHideExplainer();
  storyHideMemoPanel();
  storyHideProof();
  storyRemoveS2();
  storyRemoveSam();
  storyRemoveEurope();
  storyHideSideView();
  // The history strip belongs to Explore (always full) and to scene 4.
  // Hide here; the Explore path re-renders it full via applyCutoff.
  storyShow(storyEl("historyStrip"), false);
  const headline = storyEl("headline");
  if (headline) headline.classList.remove("story-hide");
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
  if (mode === "explore") {
    if (storyState === "playing") storyPause();
    storyHideOverlays();
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
  storySetMode("story");
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
    map.on("mouseleave", "bridges-fill", hide);
    map.on("mouseleave", "bridges-markers", hide);
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
  // but the scene-1 title block and tag stay hidden until Play.
  storyScene = 0;
  storyMonth = -1;
  storyApplySceneState(0);
  storySyncProgress(0, 0);
  storySyncCaption(0);
  storySyncScrubUI(0);
  storyShow(storyEl("sceneTitle"), false);
  storyShow(storyEl("sceneTag"), false);
  const play = storyEl("storyPlay");
  if (play) play.removeAttribute("disabled");
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
    memoTypedChars, memoHighlightRange, revealedCount, renderedTextLength,
    revealNodes, renderedHighlightRange, proofCountValue, proofChecksShown,
    europeLitCount,
    STORY_SCENE_NAMES, STORY_PLACEHOLDERS,
    STORY_MONTH_STEP, STORY_SCENE4_LEAD, STORY_SCENE4_TAIL,
    STORY_WAIT_TIMEOUT, STORY_CALLOUT_HOLD, STORY_DATE_ROLL, STORY_END_AT,
    STORY_SCENE3_FLY, STORY_SCENE3_GAP, STORY_SCENE6_ORBIT, STORY_GLOW_PULSE,
    STORY_MEMO_CPS, STORY_PROOF_COUNT, STORY_PROOF_GAP, STORY_EUROPE_AT,
    STORY_EUROPE_ZOOM, STORY_EUROPE_CENTER, STORY_EUROPE_CITIES,
    STORY_PROOF_QUANTITIES
  };
}
