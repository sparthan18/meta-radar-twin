// The director: one GSAP master timeline over two renderers (deck.gl wide, three.js close-up),
// cutting between them behind a dip. Nine beats, each with an idempotent enter() so the scrub
// line can seek to any chapter and land on a consistent frame; everything that moves inside a
// beat (camera, month index, label reveal, lit cities) is a tween the timeline owns.
import { createWide, WIDE } from "./wide.js";
import { createCloseup, CLOSEUP_POSE } from "./closeup.js";
import { loadStory, RISK_RGB } from "./beats/data.js";
import { createStrip } from "./beats/strip.js";
import { createBridgeLabels } from "./beats/labels.js";
import { createReport } from "./beats/report.js";
import { createProof } from "./beats/proof.js";
import { createExplainer } from "./beats/explainer.js";
import { createScrub } from "./beats/scrub.js";
import { createCallouts } from "./beats/callout.js";
import { createAcquire } from "./beats/acquire.js";
import { createNews } from "./beats/news.js";

const $ = id => document.getElementById(id);
const EASE = "power3.out";
const DIP = 0.5;

export const BEATS = [
  { id: "crane", title: "The bridge", dur: 29.3 },
  { id: "radar", title: "How radar sees", dur: 14 },
  { id: "twenty", title: "Twenty bridges", dur: 13.5 },
  { id: "years", title: "Three years", dur: 0 }, // computed from the month schedule
  { id: "close", title: "The close-up", dur: 12 },
  { id: "report", title: "The report", dur: 15 },
  { id: "proof", title: "The proof", dur: 11 },
  { id: "europe", title: "Europe", dur: 9.8 },
  { id: "end", title: "The ending", dur: 2 },
];

const CAP = {
  crane: [ // the caption narrates; the callout gives the data; never both in the same beat
    { at: 0.6, hold: 1.8, text: "11 September 2024." },
    { at: 2.6, hold: 3.8, text: "A bridge in Dresden, Germany, fell into the Elbe." },
    { at: 25.2, hold: 3.0, text: "The warning had been visible from orbit for a year." },
  ],
  radar: [
    { at: 0.5, hold: 4.0, text: "Satellites bounce radio waves off the ground every few days." },
    { at: 4.8, hold: 4.4, text: "Compare the echoes, and a kerb that moved one millimetre shows up." },
    { at: 9.6, hold: 4.0, text: "Europe publishes this for every bridge. RadarTwin looks every month." },
  ],
  twenty: [
    { at: 0.6, hold: 3.2, text: "This is the bridge: 406 metres, five spans, 61 radar points on it." },
    { at: 4.6, hold: 4.4, text: "Twenty bridges in Dresden. Nineteen the satellite can see; one it cannot." },
    { at: 9.4, hold: 3.6, text: "Every span gets a motion reading every month." },
  ],
  years: [
    { at: 0.6, hold: 4.0, text: "Thirty-three months, scored only with what was known at the time." },
    { key: "2023-10-01", hold: 2.6, text: "October 2023: Carolabrücke goes red for the first time." },
    { key: "2024-08-01", hold: 5.0, text: "August 2024: red again, and alone by September." },
  ],
  close: [
    { at: 0.6, hold: 5.0, text: "September 2024. The only red bridge in the city." },
    { at: 6.2, hold: 5.6, text: "Faster than anything in its own record. One end rising, the next span sinking." },
  ],
  report: [
    { at: 0.5, hold: 4.6, text: "Muse Spark read the numbers and wrote the inspection memo." },
    { at: 5.6, hold: 4.2, text: "SAM 3.1 found the bridge in the Sentinel-2 image." },
    { at: 10.4, hold: 3.6, text: "Every number in the memo traces to a logged tool call." },
  ],
  proof: [ // the objection first, in a judge's words; then the test and the result, named
    { at: 0.5, hold: 4.6, text: "This model was built after the collapse. Did it peek at what came later?" },
    { at: 5.4, hold: 5.0, text: "No. Every month was re-run with the later months deleted. Carolabrücke still comes out first." },
  ],
  europe: [
    { at: 0.8, hold: 3.6, text: "The data flagged it first." },
    { at: 5.0, hold: 4.4, text: "Every bridge in Europe already has this data." },
  ],
};

export async function boot() {
  const stage = $("stage"), dip = $("dip"), dim = $("dim"), caption = $("captionText"), index = $("fxIndex");
  const preloader = $("preloader"), landing = $("landing"), play = $("play"), ending = $("ending");
  const errors = [];
  const state = { phase: "loading", tl: null, errors, beat: null };
  window.__story = state;

  const story = await loadStory();
  const wide = await createWide({ mapEl: $("map"), globeCanvas: $("globe"), labelsEl: $("labels"), tiltCanvas: $("tilt"), onError: e => errors.push(e) });
  state.wide = wide;
  const close = await createCloseup($("gl"));
  const strip = createStrip(story);
  const blabels = createBridgeLabels(story, wide, $("bridgeLabels"));
  const report = createReport(story);
  const proof = createProof(story);
  const explainer = createExplainer();
  const callouts = createCallouts(wide, $("callouts"));
  const subjectFeature = story.bridges.features.find(f => String(f.properties.id) === "4" && f.geometry.type === "Polygon");
  const acquire = createAcquire(wide, { svg: $("acquire"), stack: $("acqStack"), subjectFeature, subjectLngLat: [13.74, 51.05] });
  const news = createNews($("news"), $("acqStack"));
  const stats = $("stats");
  const TWENTY_CLOSE = { center: [13.7468, 51.0535], zoom: 14.6, pitch: 52, bearing: -30 };
  const CAROLA = [13.7468, 51.0535];
  const AUGUSTUS = (() => { const f = story.bridges.features.find(x => String(x.properties.id) === "1"); const r = f.geometry.coordinates[0]; let x = 0, y = 0; for (const [a, b] of r) { x += a; y += b; } return [x / r.length, y / r.length]; })();
  // the crane ends with the bridge on the frame's left third, the right two thirds held for the callout
  const CRANE_END = { ...WIDE.craneEnd, center: [13.7501, 51.0547] };
  // the event camera: close on the fallen span from the west bank, the fallen strand nearest, so a 12 m
  // drop is a quarter of the frame instead of four pixels
  const EVENT_CAM = { center: acquire.lnglatAt(acquire.length * 0.25, 6), zoom: 17.0, pitch: 62, bearing: 118 };
  const TWENTY_CALLOUTS = [
    { lnglat: wide.subjectCentre, accent: true, dx: 90, dy: -60, lines: [{ cls: "big", text: "CAROLABRÜCKE" }, { cls: "dim", text: "THE SUBJECT" }] },
    { lnglat: AUGUSTUS, dim: true, dx: -90, dy: 70, lines: [{ cls: "", text: "AUGUSTUSBRÜCKE" }, { cls: "dim", text: "6 SCATTERERS · RADAR CANNOT SEE IT" }] },
  ];
  const GLOBE_START = { longitude: 8, latitude: 50, zoom: 3.4 };
  const GLOBE_END = { longitude: 13.7468, latitude: 51.0535, zoom: 6.4 };
  const GLOBE_LEN = 5.0; // the globe holds for the two opening lines, then dives
  const gv = { ...GLOBE_START }, lit = { n: 0 }; // tween targets the timeline drives and a seek reads back
  const CITY_HIGH = { center: [13.7468, 51.0535], zoom: 12.6, pitch: 36, bearing: -30 };
  const cam = { ...CITY_HIGH, center: [...CITY_HIGH.center], lon: CITY_HIGH.center[0], lat: CITY_HIGH.center[1] };
  const camGo = () => { cam.center = [cam.lon, cam.lat]; wide.jumpTo(cam); };
  // place labels over the rooftops: the river is the larger cyan tier; districts and landmarks are one size
  // down, tracked wider, each with a hairline leader tick from the word to the point it names (`tick` is the
  // tick's end in px; the word starts just past it). All in the foreground tone: no dimmed tier.
  const PLACE_LABELS = [
    { lnglat: [13.7545, 51.0568], bare: true, cls: "river", text: "ELBE", anchor: "middle", dx: 0, dy: 0, delay: 0 },
    { lnglat: [13.7416, 51.0518], bare: true, text: "FRAUENKIRCHE", tick: [9, -9], delay: 0.25 },
    { lnglat: [13.7345, 51.0496], bare: true, text: "ALTSTADT", tick: [9, 9], delay: 0.4 },
    { lnglat: [13.7470, 51.0625], bare: true, text: "NEUSTADT", tick: [9, -9], delay: 0.55 },
  ].map(it => it.tick ? { ...it, anchor: it.tick[0] >= 0 ? "start" : "end", dx: it.tick[0] + Math.sign(it.tick[0]) * 4, dy: it.tick[1] } : it);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const placeLabels = (list, opts = {}) => { // bare callouts plus their leader ticks (callout.js draws the word only)
    callouts.set(list, opts);
    for (const it of callouts.items()) {
      if (!it.tick) continue;
      const n = it._n, line = document.createElementNS(SVG_NS, "line"), dot = document.createElementNS(SVG_NS, "circle");
      line.setAttribute("class", "co-tick"); line.setAttribute("x1", 0); line.setAttribute("y1", 0); line.setAttribute("x2", it.tick[0]); line.setAttribute("y2", it.tick[1]);
      dot.setAttribute("class", "co-tickdot"); dot.setAttribute("r", 1.4);
      n.g.insertBefore(line, n.t); n.g.insertBefore(dot, n.t); n.tick = [line, dot];
      if (!opts.instant) gsap.fromTo(n.tick, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: EASE, delay: it.delay || 0 });
    }
  };
  const exitPlaceLabels = () => { for (const it of callouts.items()) if (it._n.tick) gsap.to(it._n.tick, { opacity: 0, duration: 0.3 }); return callouts.exit(); };
  const altEl = $("fxAltV"), viewEl = $("fxAltW");
  const setAlt = (km, view) => { altEl.textContent = km >= 10 ? `${Math.round(km)} KM` : km >= 1 ? `${km.toFixed(1)} KM` : `${Math.round(km * 1000)} M`; if (view) viewEl.textContent = view; };
  stats.innerHTML = `<div class="pt">WHAT THE SATELLITE SEES</div><div class="ro"><span class="k">BRIDGES</span><span class="v">20</span></div><div class="ro"><span class="k">MONITORED BY RADAR</span><span class="v">19</span></div><div class="ro"><span class="k">RADAR-BLIND</span><span class="v accent">1</span></div><div class="ro"><span class="k">PERSISTENT SCATTERERS</span><span class="v">3,694</span></div><div class="ro"><span class="k">MONTHLY CUTOFFS</span><span class="v">33</span></div>`;
  close.hide();
  wide.showDresden();
  wide.jumpTo(CITY_HIGH);

  await Promise.all([document.fonts.load('500 11px "JetBrains Mono"'), document.fonts.load('500 32px Rajdhani'), document.fonts.load('700 120px Rajdhani')]).catch(() => {});
  await new Promise(res => { const t0 = performance.now(); const chk = () => { if (wide.ready() || performance.now() - t0 > 20000) res(); else setTimeout(chk, 120); }; chk(); });
  await new Promise(r => setTimeout(r, 400));
  // the landing is the globe: Europe at night, turning slowly, the subject's reticle on Saxony
  await wide.showEurope(); wide.europeSubjectOnly(true); wide.globeView(GLOBE_START);
  const orbit = { lon: GLOBE_START.longitude };
  let orbitOn = true;
  const orbitTick = () => { if (orbitOn) { orbit.lon -= 0.4 / 60; wide.globeView({ ...GLOBE_START, longitude: orbit.lon }); } requestAnimationFrame(orbitTick); };
  orbitTick();
  stage.classList.add("intro"); setAlt(693, "ORBIT");
  preloader.classList.add("off");
  landing.classList.add("on");
  state.phase = "landing";

  // ---------- month schedule for "three years" ----------
  const holds = { "2023-10-01": 2.4, "2024-08-01": 2.4 };
  const monthAt = []; let tm = 0.8;
  story.cutoffs.forEach(c => { monthAt.push(tm); tm += 0.3 + (holds[c] || 0); }); // quiet months pass at 0.3 s; the two red months hold
  const YEARS_LEN = tm + 3.0;
  BEATS.find(b => b.id === "years").dur = YEARS_LEN;
  const monthIndexAt = (t) => { let i = 0; while (i + 1 < monthAt.length && monthAt[i + 1] <= t) i++; return t < monthAt[0] ? 0 : i; };
  const ringByRisk = (c) => (f) => { const r = story.risk[c][String(f.properties.id)]; return [...RISK_RGB[r], r === "none" ? 160 : 255]; };
  let shownMonth = -1;
  const setMonth = (i) => { if (i === shownMonth) return; shownMonth = i; strip.setMonth(i); wide.setRingColor(ringByRisk(story.cutoffs[i])); };

  // ---------- captions ----------
  let capTimer = null;
  // Meta's products stand out in every caption
  const META_RE = /(Muse Spark(?: Open)?(?: 1\.3)?|Muse Code|Muse Image|Muse Wonder|Muse Glimmer|SAM 3\.1|Meta Model API)/g;
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const markMeta = text => esc(text).replace(META_RE, '<span class="meta">$1</span>');
  const showCaption = (text, hold) => { caption.innerHTML = markMeta(text); caption.classList.add("show"); if (capTimer) capTimer.kill(); capTimer = gsap.delayedCall(hold, () => caption.classList.remove("show")); };
  const clearCaption = () => { caption.classList.remove("show"); if (capTimer) capTimer.kill(); };

  // ---------- the shake: three frames on the picture and the layers that track it ----------
  const shake = () => { const els = [$("map"), $("acquire"), $("callouts"), $("tilt")]; const tl = gsap.timeline(); [[2, -1], [-2, 1], [1, -1], [0, 0]].forEach(([x, y], i) => tl.set(els, { x, y }, i * 0.05)); };

  // ---------- close-up render loop ----------
  let closeupRaf = null;
  const closeupLoop = () => { close.render(); closeupRaf = requestAnimationFrame(closeupLoop); };
  const closeupOn = (hud) => { close.show(); close.setHud(hud); if (!closeupRaf) closeupLoop(); };
  const closeupOff = () => { if (closeupRaf) cancelAnimationFrame(closeupRaf); closeupRaf = null; close.setHud(false); close.hide(); };

  // ---------- beat entry: reset everything, then set what the beat needs ----------
  const pose = { az: CLOSEUP_POSE.az - 4, dist: CLOSEUP_POSE.dist + 30 };
  function resetAll() {
    clearCaption();
    wide.tilt(false); explainer.show(false); blabels.show(false); strip.show(false); shownMonth = -1;
    report.show(false); report.evidence(false); proof.show(false); dim.classList.remove("on"); callouts.show(false); stats.classList.remove("on"); wide.blink(false);
    acquire.show(false); news.show(false); wide.setRiver(false); wide.setLit(0); wide.setSweep(-1);
    stage.classList.remove("panel", "closeup", "intro"); ending.classList.remove("on");
  }
  function enter(id, { seek = false, local = 0 } = {}) {
    resetAll();
    state.beat = id;
    index.textContent = `${String(BEATS.findIndex(b => b.id === id) + 1).padStart(2, "0")} / ${String(BEATS.length).padStart(2, "0")}`;
    switch (id) {
      case "crane": closeupOff(); stage.classList.add("intro"); wide.setScene("crane"); wide.setRingColor(null); $("fxCutoff").textContent = "2024-09-01";
        wide.setCollapse(local >= GLOBE_LEN + 11.6 ? 1 : 0); acquire.show(true); acquire.reset(); news.show(true); news.reset();
        if (local < GLOBE_LEN) { wide.hideAll(); wide.showEurope().then(() => { wide.europeSubjectOnly(true); wide.globeView(gv); }); setAlt(693, "ORBIT"); }
        else { wide.showDresden(); wide.jumpTo(seek ? CRANE_END : CITY_HIGH); setAlt(0.4, "CRANE"); wide.setRiver(true); if (local >= GLOBE_LEN + 6.4) wide.tilt(true); } break;
      case "radar": closeupOff(); wide.hideAll(); explainer.show(true); if (seek) explainer.seek(local, true); else explainer.play(); break;
      case "twenty": closeupOff(); wide.showDresden(); wide.setScene("city"); wide.setRingColor(null); wide.setCollapse(0); wide.setRiver(true); wide.jumpTo(local >= 4 ? WIDE.city : TWENTY_CLOSE);
        if (local >= 4) { callouts.set(TWENTY_CALLOUTS, { instant: seek }); stats.classList.add("on"); } else callouts.set([{ lnglat: wide.subjectCentre, accent: true, dx: 110, dy: -80, lines: [{ cls: "big", text: "CAROLABRÜCKE" }, { cls: "dim", text: "406 M · 5 SPANS · 61 SCATTERERS · 3 TRACKS" }] }], { instant: seek }); break;
      case "years": closeupOff(); wide.showDresden(); wide.setScene("city"); wide.setCollapse(0); wide.setRiver(true); wide.jumpTo(WIDE.city); strip.show(true); setMonth(monthIndexAt(local)); break;
      case "close": wide.hideAll(); close.setPose({ ...CLOSEUP_POSE, ...pose }); closeupOn(true); stage.classList.add("closeup"); $("fxCutoff").textContent = "2024-09-01"; break;
      case "report": wide.hideAll(); close.setPose({ ...CLOSEUP_POSE, az: CLOSEUP_POSE.az + 4, dist: CLOSEUP_POSE.dist - 20 }); closeupOn(false); stage.classList.add("closeup", "panel"); report.show(true);
        if (seek) { report.type(0.01); if (local >= 5.7) { report.rows(); report.evidence(true); } } else report.type(5.5); break;
      case "proof": wide.hideAll(); close.setPose({ ...CLOSEUP_POSE, az: CLOSEUP_POSE.az + 4, dist: CLOSEUP_POSE.dist - 20 }); closeupOn(false); stage.classList.add("closeup", "panel"); dim.classList.add("on"); proof.show(true); if (seek) proof.seek(local); else proof.play(); break;
      case "europe": closeupOff(); wide.showEurope().then(() => { wide.europeSubjectOnly(false); wide.globeView({ longitude: WIDE.europe.center[0], latitude: WIDE.europe.center[1], zoom: WIDE.europe.zoom }); wide.setEuropeLit(seek ? Math.floor(lit.n) : 0); }); break;
      case "end": closeupOff(); wide.showEurope().then(() => { wide.europeSubjectOnly(false); wide.globeView({ longitude: WIDE.europe.center[0], latitude: WIDE.europe.center[1], zoom: WIDE.europe.zoom }); wide.setEuropeLit(15); }); ending.classList.add("on"); state.phase = "ended"; break;
    }
  }

  function buildTimeline() {
    const tl = gsap.timeline({ paused: true });
    const caps = (label, list) => { for (const c of list) { const at = c.key ? monthAt[story.cutoffs.indexOf(c.key)] + 0.2 : c.at; tl.call(() => showCaption(c.text, c.hold), null, `${label}+=${at}`); } };
    const cutTo = (id, atLabel) => { // dip, enter the beat at full dip, lift; the beat's label sits at the lift
      const l = `to_${id}`;
      tl.addLabel(l, atLabel);
      tl.to(dip, { opacity: 1, duration: DIP, ease: "power1.in" }, l);
      tl.call(() => enter(id), null, `${l}+=${DIP}`);
      tl.to(dip, { opacity: 0, duration: DIP, ease: "power1.out" }, `${l}+=${DIP}`);
      tl.addLabel(id, `${l}+=${DIP}`);
    };
    const len = id => BEATS.find(b => b.id === id).dur;
    // 1 crane: entered by start() behind the Play dip. The beat sheet: orbit (where), crane (what city),
    // acquire (what), identify, the event, the hook, exit, and a match cut into chapter 2.
    tl.addLabel("crane", 0);
    tl.call(() => enter("crane"), null, "crane");
    // the world: the globe dives from Europe to Saxony while the altitude readout falls; the lock-on finds Dresden
    Object.assign(gv, GLOBE_START); const alt = { km: 693 };
    const DIVE_AT = 2.2; // after the first line has been read
    tl.to(gv, { longitude: GLOBE_END.longitude, latitude: GLOBE_END.latitude, zoom: GLOBE_END.zoom, duration: GLOBE_LEN - DIVE_AT - 0.3, ease: "power2.in", onUpdate: () => wide.globeView(gv) }, `crane+=${DIVE_AT}`);
    tl.to(alt, { km: 60, duration: GLOBE_LEN - DIVE_AT - 0.3, ease: "power2.in", onUpdate: () => setAlt(alt.km, "ORBIT") }, `crane+=${DIVE_AT}`);
    tl.call(() => acquire.globeLock(), null, "crane+=1.4");
    // cut to the city high and flat, then the crane descends to the bridge, drifting so it lands on the left third
    tl.addLabel("craneCity", `crane+=${GLOBE_LEN}`);
    tl.to(dip, { opacity: 1, duration: 0.35, ease: "power1.in" }, `crane+=${GLOBE_LEN - 0.35}`);
    tl.call(() => { acquire.globeOff(); wide.showDresden(); wide.jumpTo(CITY_HIGH); setAlt(4, "CITY"); wide.setRiver(true); }, null, "craneCity");
    tl.to(dip, { opacity: 0, duration: 0.45, ease: "power1.out" }, "craneCity");
    Object.assign(cam, { ...CITY_HIGH, center: [...CITY_HIGH.center], lon: CITY_HIGH.center[0], lat: CITY_HIGH.center[1] });
    tl.to(cam, { zoom: CRANE_END.zoom, pitch: CRANE_END.pitch, lon: CRANE_END.center[0], lat: CRANE_END.center[1], duration: 9.5, ease: EASE, onUpdate: camGo }, "craneCity");
    const alt2 = { km: 4 };
    tl.to(alt2, { km: 0.4, duration: 9.5, ease: EASE, onUpdate: () => setAlt(alt2.km, "CRANE") }, "craneCity");
    tl.call(() => placeLabels(PLACE_LABELS), null, "craneCity+=1.2");
    tl.call(() => exitPlaceLabels(), null, "craneCity+=4.0");
    tl.call(() => wide.tilt(true), null, "craneCity+=6.4");
    // Reading time governs everything from here: nothing new arrives while the viewer is still reading
    // the last thing. A word of tracked type holds about 2 s, a headline with its number 2.5 s, a
    // photograph 2.8 s, a line of mono 0.35 s a word plus 0.6 s; the ticker is ambient and does not count.
    // acquire and identify: the structure lights (a sweep along the deck, then the whole outline breathing), leader, the tracked name (read it), the meta line
    const glow = { lit: 0, sweep: 0 };
    tl.call(() => wide.blink(true, { instant: true }), null, "craneCity+=6.0");
    tl.to(glow, { lit: 1, duration: 0.5, ease: "expo.out", onUpdate: () => wide.setLit(glow.lit) }, "craneCity+=6.0");
    tl.fromTo(glow, { sweep: 0 }, { sweep: 1, duration: 0.7, ease: "power1.inOut", onUpdate: () => wide.setSweep(glow.sweep), onComplete: () => wide.setSweep(-1) }, "craneCity+=6.0");
    tl.call(() => acquire.leader(), null, "craneCity+=6.8");
    tl.call(() => acquire.name(), null, "craneCity+=7.1");
    tl.call(() => acquire.meta(), null, "craneCity+=9.2");
    // the event: the stamp and the flash, the clock, the span falling with the name on it, a push and a shake
    // a hard cut in to the event camera as the stamp lands; the fall plays large; a hard cut back for the record
    tl.call(() => { wide.tilt(false); wide.jumpTo(EVENT_CAM); setAlt(0.13, "CLOSE"); acquire.eventMode(true); acquire.stamp(); wide.blink(true, { flash: true }); }, null, "craneCity+=10.8");
    const fall = { k: 0 };
    tl.to(fall, { k: 1, duration: 0.8, ease: "power2.in", onUpdate: () => wide.setCollapse(fall.k) }, "craneCity+=11.0");
    tl.call(() => shake(), null, "craneCity+=11.8");
    tl.call(() => { cam.zoom = CRANE_END.zoom + 0.03; camGo(); setAlt(0.4, "CRANE"); acquire.eventMode(false); wide.tilt(true); }, null, "craneCity+=13.2");
    const brk = { k: 0 }; // back on the wide, the name breaks with the span the viewer has just seen fall
    tl.to(brk, { k: 1, duration: 0.6, ease: "power2.in", onUpdate: () => acquire.setBreak(brk.k) }, "craneCity+=13.3");
    // the record arrives once the stamp has been read: the photograph, then the ticker
    tl.call(() => news.photoIn(), null, "craneCity+=13.4");
    tl.call(() => news.tickerIn(tl.time()), null, "craneCity+=14.0");
    // the hook, one line at a time
    tl.call(() => acquire.note(1), null, "craneCity+=16.2");
    tl.call(() => acquire.note(2), null, "craneCity+=18.0");
    // exit in reverse once the caption has been read, then the bracket closes to a point
    tl.call(() => news.exit(), null, "craneCity+=23.2");
    tl.call(() => acquire.exit(), null, "craneCity+=23.3");
    caps("crane", CAP.crane);
    // 2 how radar sees: a hard cut, no dip; the point that closed on the bridge travels to the satellite
    tl.addLabel("radar", `crane+=${len("crane")}`);
    tl.call(() => {
      const from = acquire.state.pointXY;
      enter("radar");
      const sat = document.querySelector("#explainer .ex-sat");
      acquire.show(true); if (from) acquire.state.pointXY = from;
      if (sat) acquire.travel(sat).eventCallback("onComplete", () => acquire.show(false)); else acquire.show(false);
    }, null, "radar");
    caps("radar", CAP.radar);
    // 3 twenty
    cutTo("twenty", `radar+=${len("radar")}`);
    const tcam = { ...TWENTY_CLOSE };
    tl.to(tcam, { zoom: WIDE.city.zoom, pitch: WIDE.city.pitch, bearing: WIDE.city.bearing, duration: 2.8, ease: "power2.inOut", onUpdate: () => wide.jumpTo({ ...tcam, center: tcam.center }) }, "twenty+=3.4");
    tl.to(tcam, { "center.0": WIDE.city.center[0], "center.1": WIDE.city.center[1], duration: 2.8, ease: "power2.inOut" }, "twenty+=3.4");
    tl.call(() => callouts.exit(), null, "twenty+=3.0");
    tl.call(() => { callouts.set(TWENTY_CALLOUTS); stats.classList.add("on"); }, null, "twenty+=6.2");
    caps("twenty", CAP.twenty);
    // 4 years: no dip, same shot
    tl.addLabel("years", `twenty+=${len("twenty")}`);
    tl.call(() => enter("years"), null, "years");
    const mt = { t: 0 };
    tl.to(mt, { t: YEARS_LEN, duration: YEARS_LEN, ease: "none", onUpdate: () => setMonth(monthIndexAt(mt.t)) }, "years");
    caps("years", CAP.years);
    // 5 close
    cutTo("close", `years+=${YEARS_LEN.toFixed(2)}`);
    tl.fromTo(pose, { az: CLOSEUP_POSE.az - 4, dist: CLOSEUP_POSE.dist + 30 }, { az: CLOSEUP_POSE.az + 4, dist: CLOSEUP_POSE.dist - 20, duration: 12, ease: "none", onUpdate: () => close.setPose(pose) }, "close");
    caps("close", CAP.close);
    // 6 report: no dip
    tl.addLabel("report", `close+=${len("close")}`);
    tl.call(() => enter("report"), null, "report");
    tl.call(() => { report.rows(); report.evidence(true); }, null, "report+=5.7");
    caps("report", CAP.report);
    // 7 proof: no dip
    tl.addLabel("proof", `report+=${len("report")}`);
    tl.call(() => enter("proof"), null, "proof");
    caps("proof", CAP.proof);
    // 8 europe
    cutTo("europe", `proof+=${len("proof")}`);
    lit.n = 0;
    tl.to(lit, { n: 15, duration: 6, ease: "none", onUpdate: () => wide.setEuropeLit(Math.floor(lit.n)) }, "europe+=0.6");
    caps("europe", CAP.europe);
    // 9 end
    tl.addLabel("end", `europe+=${len("europe")}`);
    tl.call(() => enter("end"), null, "end");
    tl.to({}, { duration: len("end") });
    return tl;
  }

  // ---------- state at a moment: what the timeline's calls would have set by then ----------
  const syncCaptions = (id, local) => {
    let hit = null;
    for (const c of CAP[id] || []) { const at = c.key ? monthAt[story.cutoffs.indexOf(c.key)] + 0.2 : c.at; if (local >= at && local < at + c.hold) hit = { c, left: at + c.hold - local }; }
    if (hit) showCaption(hit.c.text, hit.left); else clearCaption();
  };
  const syncCrane = (local) => {
    if (local < GLOBE_LEN) { acquire.instant({ globe: local < 1.4 ? 0 : Math.min(1, (local - 1.4) / 0.6) }); return; }
    const L = local - GLOBE_LEN; // time since the city cut; the cue times below are the timeline's
    if (L >= 1.2 && L < 4.0) placeLabels(PLACE_LABELS, { instant: true });
    const inEvent = L >= 10.8 && L < 13.2, exited = L >= 24.05;
    // the camera first, so everything measured against the projection lands on a settled view
    if (inEvent) { wide.tilt(false); wide.jumpTo(EVENT_CAM); setAlt(0.13, "CLOSE"); }
    else { camGo(); if (L >= 6.4) wide.tilt(true); if (L >= 9.5) setAlt(0.4, "CRANE"); }
    const k = L < 11.0 ? 0 : L >= 11.8 ? 1 : ((L - 11.0) / 0.8) ** 2;
    const bk = L < 13.3 ? 0 : L >= 13.9 ? 1 : ((L - 13.3) / 0.6) ** 2;
    wide.setCollapse(k); wide.setSweep(-1); wide.setLit(L < 6.0 ? 0 : Math.min(1, (L - 6.0) / 0.5));
    if (L >= 6.0) wide.blink(true, { instant: true });
    acquire.instant({
      bracket: L < 6.0 ? 0 : Math.min(1, (L - 6.0) / 0.5), leader: L < 6.8 ? 0 : Math.min(1, (L - 6.8) / 0.3), name: L < 7.1 ? 0 : Math.min(1, (L - 7.1) / 0.25),
      meta: L >= 9.2, head: L >= 10.8, clock: L < 10.8 ? 0 : (L - 10.8) / 0.6 * 180, note1: L >= 16.2, note2: L >= 18.0,
      breakK: bk, event: inEvent, exited, point: L >= 24.02 && L < 24.3,
    });
    news.instant({ photo: L >= 13.4 && L < 23.2, tickerT0: L >= 14.0 && L < 23.2 ? state.tl.labels.craneCity + 14.0 : null });
  };
  const unpauseInstruments = () => { explainer.pause(false); };

  // ---------- transport ----------
  // seek to any second: enter the chapter at that local time, land every tween, then reconstruct what
  // the timeline's calls would have set (callouts, captions, the acquire and news layers, instruments)
  function seekTime(t, { hold = false } = {}) {
    if (!state.tl) start();
    const tl = state.tl; const wasPlaying = !tl.paused();
    tl.pause(); explainer.pause(true);
    t = Math.max(0, Math.min(tl.duration() - 0.05, t));
    let id = BEATS[0].id;
    for (const b of BEATS) { const L = tl.labels[b.id]; if (L === undefined) continue; const from = tl.labels[`to_${b.id}`] ?? L; if (t >= from) id = b.id; }
    const local = Math.max(0, t - tl.labels[id]);
    enter(id, { seek: true, local });
    tl.seek(t, true); tl.seek(Math.min(tl.duration(), t + 1e-4), false); // land the tweens, then one event-enabled render so active tweens push their values
    syncCaptions(id, local);
    if (id === "crane") syncCrane(local);
    if (wasPlaying && !hold) { tl.play(); unpauseInstruments(); state.phase = "playing"; } else state.phase = "paused";
    scrub.setPlaying(!tl.paused());
  }
  function start() {
    if (state.tl) return;
    state.phase = "playing";
    const tl = buildTimeline();
    state.tl = tl;
    scrub.show(true);
    gsap.ticker.add(() => { const t = tl.time(); acquire.setFloat(t); news.setTime(t); wide.setRiverTime(t); });
    orbitOn = false; landing.classList.remove("on"); tl.play(0);
  }
  // a chapter tick lands at the chapter's own first frame (past its lift; chapter 1 from the globe)
  function seekTo(id) {
    if (!state.tl) start();
    const t = state.tl.labels[id];
    if (t === undefined) return;
    seekTime(t + (id === "crane" ? 0 : DIP + 0.02));
  }
  function toggle() {
    const tl = state.tl; if (!tl) return start();
    if (tl.paused()) { tl.play(); unpauseInstruments(); state.phase = "playing"; } else { tl.pause(); explainer.pause(true); state.phase = "paused"; }
    scrub.setPlaying(!tl.paused());
  }
  let scrubWasPlaying = false;
  const scrub = createScrub({
    beats: BEATS, onSeek: seekTo, onToggle: toggle, getTime: () => state.tl ? state.tl.time() : 0, getDuration: () => state.tl ? state.tl.duration() : 1, getLabels: () => state.tl ? state.tl.labels : {},
    onScrubStart: () => { scrubWasPlaying = state.tl ? !state.tl.paused() : false; },
    onSeekTime: (t) => seekTime(t, { hold: true }),
    onScrubEnd: () => { if (scrubWasPlaying && state.tl) { state.tl.play(); unpauseInstruments(); state.phase = "playing"; scrub.setPlaying(true); } },
  });
  play.addEventListener("click", start);
  $("replay").addEventListener("click", () => seekTo("crane"));
  addEventListener("keydown", e => {
    if (e.key === " ") { e.preventDefault(); toggle(); }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (e.shiftKey && state.tl) { seekTime(state.tl.time() + (e.key === "ArrowRight" ? 1 : -1)); return; } // shift: one second
      const i = BEATS.findIndex(b => b.id === state.beat); const j = Math.min(BEATS.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1))); seekTo(BEATS[j].id);
    }
    if (e.key === "Home") seekTo("crane");
  });
  addEventListener("resize", () => wide.resize());
  Object.assign(state, { start, seekTo, seekTime, toggle, story, beats: BEATS, callouts, wide, acquire, news });
  return state;
}
