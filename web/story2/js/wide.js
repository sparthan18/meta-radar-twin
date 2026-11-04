// The wide renderer (deck.gl over MapLibre): the Dresden crane and city shots, and the Europe
// globe. Built from the deck.gl spike; exposes one object the director drives.
import { HEX, FOG_HEX, TILEJSON, SUBJECT_LNGLAT } from "./wide/config.js";
import { makeIconAtlas } from "./wide/icons.js";
import { groundLayer, planetLayer, bridgeLayers, makeLighting, footprintAxis, subjectAccentLayer } from "./wide/layers.js";
import { startTiltShift } from "./wide/tiltshift.js";
import { loadNaturalEarth, globeBackground, naturalEarthLayers, cityLayers, mountHtmlLabels } from "./wide/europe.js";
import { createRiverFlow } from "./wide/river.js";

const FOG = { near: 1.4, far: 5.0, strength: 0.85 };
const DPR = 2;

export const WIDE = {
  landing: { center: SUBJECT_LNGLAT, zoom: 15.2, pitch: 66, bearing: -30 },
  craneStart: { center: SUBJECT_LNGLAT, zoom: 14.0, pitch: 42, bearing: -30 },
  craneEnd: { center: SUBJECT_LNGLAT, zoom: 15.2, pitch: 66, bearing: -30 },
  city: { center: [13.745, 51.039], zoom: 12.3, pitch: 40, bearing: 0 },
  europe: { center: [12, 52], zoom: 3.8 },
};

export async function createWide({ mapEl, globeCanvas, labelsEl, tiltCanvas, onError = () => {} }) {
  const status = { tiles: false, deck: false, errors: [] };
  const pushError = e => { const m = (e && (e.message || e.error?.message)) || String(e); if (!status.errors.includes(m)) status.errors.push(m); onError(m); };
  const atlas = makeIconAtlas();
  const bridges = await fetch("../data/bridges.geojson").then(r => r.json());
  const elbe = await fetch("../data/elbe.geojson").then(r => r.json()).catch(() => null);
  const river = elbe ? createRiverFlow(elbe.features[0], { widthM: 120, count: 420, speedMps: 2, seed: 1 }) : null;
  let riverOn = false, riverT = 0;

  const style = {
    version: 8, sources: {},
    sky: { "sky-color": HEX.bg, "horizon-color": FOG_HEX, "fog-color": FOG_HEX, "fog-ground-blend": 0.5, "horizon-fog-blend": 0.75, "sky-horizon-blend": 0.75, "atmosphere-blend": 0 },
    layers: [{ id: "bg", type: "background", paint: { "background-color": HEX.ground } }],
  };
  const map = new maplibregl.Map({
    container: mapEl, style, center: WIDE.landing.center, zoom: WIDE.landing.zoom, pitch: WIDE.landing.pitch, bearing: WIDE.landing.bearing,
    maxPitch: 85, minZoom: 2, interactive: false, attributionControl: false, fadeDuration: 0, pixelRatio: 1,
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
  });
  map.on("error", e => pushError(e.error || e));
  let scene = "crane";
  let ringColor = null, ringVersion = 0, subjectOpacity = 1, collapse = 1;
  const accent = { o: 0 }; let accentShown = 0;
  const subjectFeat = bridges.features.find(f => String(f.properties.id) === "4");
  const axis = footprintAxis(subjectFeat);
  // Base layers are built once per scene/colour change and reused by identity, so a per-frame
  // setProps (the blink) costs one small layer diff, never a tile-layer rebuild.
  let base = null;
  const baseLayers = () => base || (base = [
    groundLayer(FOG),
    planetLayer({ tilejson: TILEJSON, fog: FOG, drawBasemap: true, drawLabels: false, onTiles: () => {}, onError: pushError }),
    ...bridgeLayers(bridges, { scene, fog: FOG, atlas, ringColor, ringVersion, subjectOpacity, collapse }),
  ]);
  const invalidate = () => { base = null; };
  // the river's current sits between the planet and the bridges, so it runs under the decks
  // the current reads at the crane's altitude and thins to a hint at the city shot, where the same points would crowd
  const riverOpacity = () => { const z = map.getZoom(); return 0.65 * Math.max(0.12, Math.min(1, (z - 12.0) / 2.6)); };
  const makeLayers = () => { const b = baseLayers(); const out = [b[0], b[1]]; if (riverOn && river) out.push(river.layer({ t: riverT, opacity: riverOpacity() })); out.push(...b.slice(2)); out.push(...[].concat(subjectAccentLayer(bridges, accent.o, collapse))); return out; };
  const pushAccent = () => { if (Math.abs(accent.o - accentShown) < 0.02 && !(accent.o === 0 && accentShown !== 0)) return; accentShown = accent.o; overlay.setProps({ layers: makeLayers() }); };
  let blinkTl = null;
  const overlay = new deck.MapboxOverlay({
    interleaved: false, layers: makeLayers(), effects: [makeLighting({ shadows: true })], useDevicePixels: DPR,
    onError: pushError, deviceProps: { createCanvasContext: { preserveDrawingBuffer: true } },
  });
  map.addControl(overlay);
  const deckOf = () => overlay._deck;
  const allLoaded = () => { const lm = deckOf() && deckOf().layerManager; if (!lm) return false; const ls = lm.getLayers(); return ls.length > 0 && ls.every(l => l.isLoaded); };

  // tilt-shift pass, enabled by the director for the crane end
  let stopTilt = null;
  const sources = () => [...mapEl.querySelectorAll("canvas")];

  // Europe globe, built lazily on first use
  let globe = null, globeLabels = null, ne = null;
  async function ensureGlobe() {
    if (globe) return globe;
    ne = ne || await loadNaturalEarth().catch(e => { pushError(e); return null; });
    const GlobeView = deck._GlobeView || deck.GlobeView;
    globeCanvas.width = innerWidth; globeCanvas.height = innerHeight;
    globe = new deck.Deck({
      canvas: globeCanvas, width: innerWidth, height: innerHeight, useDevicePixels: DPR,
      views: new GlobeView({ id: "globe", controller: false }),
      initialViewState: { longitude: WIDE.europe.center[0], latitude: WIDE.europe.center[1], zoom: WIDE.europe.zoom, pitch: 0, bearing: 0 },
      controller: false, layers: [globeBackground(), ...(ne ? naturalEarthLayers(ne) : []), ...cityLayers(atlas, {})],
      onError: pushError, onAfterRender: () => { if (globeLabels) globeLabels(); },
      deviceProps: { createCanvasContext: { preserveDrawingBuffer: true } },
    });
    globeLabels = mountHtmlLabels(labelsEl, ll => { const vp = globe.getViewports()[0]; if (!vp) return null; const p = vp.project(ll); return p && Number.isFinite(p[0]) ? [p[0], p[1]] : null; });
    return globe;
  }

  return {
    map, status,
    ready() { status.tiles = map.areTilesLoaded(); status.deck = allLoaded(); return status.tiles && status.deck; },
    jumpTo(v) { map.jumpTo({ center: v.center, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing }); },
    setScene(s) { if (s !== scene) { scene = s; invalidate(); overlay.setProps({ layers: makeLayers() }); } },
    setRingColor(fn) { ringColor = fn; ringVersion++; invalidate(); overlay.setProps({ layers: makeLayers() }); },
    // three hard blinks (on 160 ms / off 200 ms), then a slow breathe between 0.25 and 0.85
    // `flash`: one hard flash (two frames at full) and straight into the breathe, for the stamp
    blink(on, { instant = false, flash = false } = {}) {
      if (blinkTl) { blinkTl.kill(); blinkTl = null; }
      if (!on) { accent.o = 0; pushAccent(); return; }
      blinkTl = gsap.timeline({ onUpdate: pushAccent });
      if (flash) { blinkTl.set(accent, { o: 1 }, 0); blinkTl.set(accent, { o: 0.2 }, 0.08); blinkTl.to(accent, { o: 0.85, duration: 0.25 }, 0.12); blinkTl.to(accent, { o: 0.25, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: -1 }, 0.4); return; }
      if (!instant) { for (let i = 0; i < 3; i++) { blinkTl.set(accent, { o: 1 }, i * 0.36); blinkTl.set(accent, { o: 0 }, i * 0.36 + 0.16); } }
      blinkTl.to(accent, { o: 0.85, duration: 0.3 }, instant ? 0 : 1.1);
      blinkTl.to(accent, { o: 0.25, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: -1 }, instant ? 0.3 : 1.4);
    },
    subjectCentre: axis.centre,
    // the fall of strand C: 0 intact, 1 at rest; the director plays it once in chapter 1
    setCollapse(v) { v = Math.max(0, Math.min(1, v)); if (Math.abs(v - collapse) < 0.002) return; collapse = v; invalidate(); overlay.setProps({ layers: makeLayers() }); },
    collapse() { return collapse; },
    // the Elbe's current: on in the Dresden shots, advanced by the story clock so it scrubs with the timeline
    setRiver(on) { if (!!on === riverOn) return; riverOn = !!on; overlay.setProps({ layers: makeLayers() }); },
    setRiverTime(t) { if (!riverOn || !river || t === riverT) return; riverT = t; overlay.setProps({ layers: makeLayers() }); },
    // screen position of a lnglat on the globe (null when the globe is not built or the point is off it)
    projectGlobe(ll) { if (!globe) return null; const vp = globe.getViewports()[0]; if (!vp) return null; const p = vp.project(ll); return p && Number.isFinite(p[0]) ? [p[0], p[1]] : null; },
    setSubjectOpacity(v) { v = Math.max(0.05, Math.min(1, v)); if (Math.abs(v - subjectOpacity) < 0.01) return; subjectOpacity = v; invalidate(); overlay.setProps({ layers: makeLayers() }); },
    project(lnglat) { const p = map.project(lnglat); return [p.x, p.y]; },
    bridges,
    showDresden() { const was = mapEl.style.display; mapEl.style.display = "block"; globeCanvas.style.display = "none"; labelsEl.style.display = "none"; if (was === "none") map.resize(); /* a hidden map keeps a stale transform; projections need the resize */ },
    hideAll() { mapEl.style.display = "none"; globeCanvas.style.display = "none"; labelsEl.style.display = "none"; },
    async showEurope() { await ensureGlobe(); mapEl.style.display = "none"; globeCanvas.style.display = "block"; labelsEl.style.display = "block"; globe.redraw(); },
    // drive the globe camera (the intro dive); v = { longitude, latitude, zoom }
    globeView(v) { if (!globe) return; globe.setProps({ viewState: { longitude: v.longitude, latitude: v.latitude, zoom: v.zoom, pitch: 0, bearing: 0 } }); },
    // show only the subject's reticle and label on the globe (the intro), or all cities (Europe)
    europeSubjectOnly(on) { if (!globe) return; globe.setProps({ layers: [globeBackground(), ...(ne ? naturalEarthLayers(ne) : []), ...cityLayers(atlas, { subjectOnly: !!on })] }); const kids = labelsEl.querySelectorAll(".lbl"); kids.forEach((el, i) => { el.style.opacity = on ? (i === kids.length - 1 ? 1 : 0) : el.style.opacity; }); const ret = labelsEl.querySelector(".reticle"); if (ret) ret.style.opacity = on ? 1 : ret.style.opacity; },
    setEuropeLit(n) { /* lighting cities one by one is handled by the HTML labels' opacity */ const kids = labelsEl.querySelectorAll(".lbl"); kids.forEach((el, i) => { el.style.opacity = i < n ? 1 : 0; }); const ret = labelsEl.querySelector(".reticle"); if (ret) ret.style.opacity = n >= kids.length ? 1 : 0; },
    tilt(on) { if (on && !stopTilt) { tiltCanvas.width = innerWidth; tiltCanvas.height = innerHeight; tiltCanvas.style.display = "block"; stopTilt = startTiltShift(tiltCanvas, sources, { blur: 5, focus: 0.5, band: 0.16 }); } if (!on && stopTilt) { stopTilt(); stopTilt = null; tiltCanvas.style.display = "none"; } },
    resize() { map.resize(); if (globe) { globeCanvas.width = innerWidth; globeCanvas.height = innerHeight; globe.setProps({ width: innerWidth, height: innerHeight }); } },
  };
}
