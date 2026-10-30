"use strict";
// RadarTwin vector basemap (phases 8a-8b): the OpenFreeMap dark style
// restyled to docs/design-spec.md section 4, with 3D buildings under the
// 8b craft rules (graded extrusions, mapped light, sparse labels).
//
// The tile host was unreachable from the build environment, so the needed
// layers are embedded here by hand (the phase allows either), written
// against the OpenMapTiles schema: background, water, parks, buildings,
// major roads, rail and place labels. At run time the page only needs the
// host's vector tiles and glyphs:
//
//   tiles:  https://tiles.openfreemap.org/planet
//   glyphs: https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf
//
// Place labels use the single face "Noto Sans Regular" (the host serves
// only that face; a two-face stack 404s the combined glyph file and aborts
// the tile parse for every layer, so the mono look comes from uppercase and
// letter-spacing only, which fui-places already sets).
// The whole file is pure (no DOM, no map): node runs it via
// tests/test_basemap.js. web/index.html calls buildFuiStyle() for the map
// style and FuiVectorLayerIds() to toggle the dark group in setBasemap.

// ---------- Pure part ----------

const FUI_VECTOR_TILES = "https://tiles.openfreemap.org/planet";
const FUI_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const FUI_LABEL_FONT = ["Noto Sans Regular"];
const FUI_ATTRIBUTION = "© OpenMapTiles © OpenStreetMap contributors";
const FUI_ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Phase 8b fix 4 atmosphere (design spec section 4): the MapLibre sky/fog
// applied via map.setSky once the style loads, on in story mode and in
// Explore, so the far city pales into haze.
const FUI_SKY = {
  "sky-color": "#070b14",
  "horizon-color": "#0d1a33",
  "fog-color": "#0a1326",
  "fog-ground-blend": 0.6,
  "horizon-fog-blend": 0.9,
  "sky-horizon-blend": 0.5,
  "atmosphere-blend": 0.8
};

function buildFuiSky() {
  return Object.assign({}, FUI_SKY);
}

// Apply the sky to a live map. Guarded: a MapLibre without setSky (or no
// map yet) does not throw. Returns true when setSky ran.
function applyFuiSky(map) {
  try {
    if (!map || typeof map.setSky !== "function") return false;
    map.setSky(buildFuiSky());
    return true;
  } catch (e) { return false; }
}

// Structural check for a sky object. Returns a list of problem strings
// (empty when valid); tests plant each failure mode to prove it is caught.
function validateFuiSky(sky) {
  const problems = [];
  const s = sky || {};
  if (s["sky-color"] !== "#070b14") problems.push("sky-color is not #070b14");
  if (s["horizon-color"] !== "#0d1a33") problems.push("horizon-color is not #0d1a33");
  if (s["fog-color"] !== "#0a1326") problems.push("fog-color is not #0a1326");
  if (s["fog-ground-blend"] !== 0.6) problems.push("fog-ground-blend is not 0.6");
  if (s["horizon-fog-blend"] !== 0.9) problems.push("horizon-fog-blend is not 0.9");
  if (s["sky-horizon-blend"] !== 0.5) problems.push("sky-horizon-blend is not 0.5");
  if (s["atmosphere-blend"] !== 0.8) problems.push("atmosphere-blend is not 0.8");
  return problems;
}

// The embedded vector layers, bottom to top: background, water, parks,
// flat buildings, minor then major roads, rail, the 3D extrusion (right
// after the flat buildings' neighbours, below the labels), place labels.
function buildVectorLayers() {
  const src = "openmaptiles";
  return [
    { id: "fui-background", type: "background",
      paint: { "background-color": "#070b14" } },
    { id: "esri-layer", type: "raster", source: "esri",
      paint: { "raster-saturation": -0.7, "raster-contrast": 0.05 } },
    { id: "fui-water", type: "fill", source: src, "source-layer": "water",
      paint: { "fill-color": "#0a1a33" } },
    { id: "fui-waterway", type: "line", source: src, "source-layer": "waterway",
      paint: { "line-color": "#0d2038",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.5] } },
    { id: "fui-park", type: "fill", source: src, "source-layer": "park",
      paint: { "fill-color": "#0d1a1f" } },
    { id: "fui-landuse-park", type: "fill", source: src, "source-layer": "landuse",
      filter: ["==", ["get", "class"], "park"],
      paint: { "fill-color": "#0d1a1f" } },
    { id: "fui-building", type: "fill", source: src, "source-layer": "building",
      paint: { "fill-color": "#101a2e" } },
    { id: "fui-roads-minor", type: "line", source: src,
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
      paint: { "line-color": "rgba(143, 184, 255, 0.18)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1] } },
    { id: "fui-roads-major", type: "line", source: src,
      "source-layer": "transportation",
      filter: ["in", ["get", "class"],
        ["literal", ["motorway", "trunk", "primary"]]],
      paint: { "line-color": "rgba(143, 184, 255, 0.35)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2] } },
    { id: "fui-rail", type: "line", source: src,
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "rail"],
      paint: { "line-color": "rgba(143, 184, 255, 0.3)",
        "line-width": 1, "line-dasharray": [2, 2] } },
    { id: "fui-buildings-3d", type: "fill-extrusion", source: src,
      "source-layer": "building",
      paint: { "fill-extrusion-color": ["interpolate", ["linear"],
          ["coalesce", ["get", "render_height"], 4],
          0, "#223355", 40, "#4d6a9e"],
        "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"],
          13.3, 0, 13.9, 0.95],
        "fill-extrusion-height": ["max", 4,
          ["min", 60, ["coalesce", ["get", "render_height"], 4]]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-vertical-gradient": true } },
    { id: "fui-places", type: "symbol", source: src, "source-layer": "place",
      maxzoom: 12.5,
      filter: ["all",
        ["in", ["get", "class"], ["literal", ["city", "suburb"]]],
        ["<=", ["coalesce", ["get", "rank"], 99], 2]],
      layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-font": FUI_LABEL_FONT.slice(),
        "text-size": 11,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "symbol-placement": "point",
        "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
        "symbol-spacing": 250 },
      paint: { "text-color": "#8ea3c7",
        "text-halo-color": "#070b14", "text-halo-width": 1 } }
  ];
}

// Ids of the dark vector group (everything setBasemap toggles together).
// The Esri imagery layer is not in this list: it toggles the other way.
function FuiVectorLayerIds() {
  return buildVectorLayers()
    .map((l) => l.id)
    .filter((id) => id !== "esri-layer");
}

// Full MapLibre style object. opts.dark (default true) picks which group
// is visible; data layers are added on top later by web/index.html.
function buildFuiStyle(opts) {
  const o = opts || {};
  const dark = o.dark === undefined ? true : !!o.dark;
  const layers = buildVectorLayers().map((l) => {
    const layer = JSON.parse(JSON.stringify(l));
    if (layer.id === "esri-layer") {
      layer.layout = { visibility: dark ? "none" : "visible" };
    } else {
      layer.layout = Object.assign({}, layer.layout,
        { visibility: dark ? "visible" : "none" });
    }
    return layer;
  });
  return {
    version: 8,
    glyphs: FUI_GLYPHS,
    // Phase 8b fix 4 (design spec section 4): a hard, low, near-white
    // light anchored to the map, so one face of every block is lit and
    // the next is in shadow. The old soft light (0.4, cool #bcd0ff at
    // [1.15, 210, 60]) left the walls one step above the background.
    light: { anchor: "map", color: "#ffffff", intensity: 0.9,
      position: [1.5, 100, 25] },
    sources: {
      openmaptiles: { type: "vector", url: FUI_VECTOR_TILES,
        attribution: FUI_ATTRIBUTION },
      esri: { type: "raster", tiles: [FUI_ESRI_IMAGERY], tileSize: 256,
        attribution: "Esri World Imagery" }
    },
    layers
  };
}

// Structural check for the built style. Returns a list of problem strings
// (empty when valid); tests plant each failure mode to prove it is caught.
function validateFuiStyle(style) {
  const problems = [];
  const s = style || {};
  if (s.version !== 8) problems.push("version is not 8");
  if (s.glyphs !== FUI_GLYPHS) problems.push("glyphs is not the OpenFreeMap font host");
  const src = s.sources || {};
  if (!src.openmaptiles || src.openmaptiles.url !== FUI_VECTOR_TILES) {
    problems.push("openmaptiles source is not the planet tileset");
  }
  if (!src.esri || !src.esri.tiles ||
      src.esri.tiles.indexOf(FUI_ESRI_IMAGERY) === -1) {
    problems.push("Esri imagery source is missing");
  }
  const dump = JSON.stringify(s);
  if (/dark_gray|Dark_Gray|esri-dark|esri_dark/i.test(dump)) {
    problems.push("Esri dark canvas is still referenced");
  }
  const layers = s.layers || [];
  const byId = {};
  for (const l of layers) byId[l.id] = l;
  if (!byId["esri-layer"]) problems.push("esri-layer is missing");
  const allowedVector = { water: 1, waterway: 1, landuse: 1, park: 1,
    building: 1, transportation: 1, place: 1 };
  for (const l of layers) {
    if (l.source === "openmaptiles" && l["source-layer"] &&
        !allowedVector[l["source-layer"]]) {
      problems.push(`unexpected vector source-layer ${l["source-layer"]} (${l.id})`);
    }
  }
  // Phase 8b fix 4: a hard, low, near-white light anchored to the map
  // (intensity 0.9, #ffffff, position [1.5, 100, 25]). The old soft
  // light (0.4, #bcd0ff at [1.15, 210, 60]) fails every check below.
  const light = s.light || {};
  if (light.anchor !== "map") problems.push("light is not anchored to the map");
  if (light.color !== "#ffffff") problems.push("light color is not near-white #ffffff");
  if (light.intensity !== 0.9) problems.push("light intensity is not hard (0.9)");
  if (JSON.stringify(light.position || []) !== JSON.stringify([1.5, 100, 25])) {
    problems.push("light position is not [1.5, 100, 25]");
  }
  const flat = byId["fui-building"];
  if (!flat) {
    problems.push("flat building footprint layer is missing");
  } else if ((flat.paint || {})["fill-color"] !== "#101a2e") {
    problems.push("flat building footprints are not #101a2e");
  }
  const ex = byId["fui-buildings-3d"];
  if (!ex) {
    problems.push("fill-extrusion layer is missing");
  } else {
    if (ex.type !== "fill-extrusion") problems.push("buildings layer is not a fill-extrusion");
    if (ex.minzoom !== undefined) problems.push("extrusion must not pop at a minzoom (opacity gates it)");
    const p = ex.paint || {};
    if (JSON.stringify(p["fill-extrusion-color"]) !== JSON.stringify(
        ["interpolate", ["linear"],
          ["coalesce", ["get", "render_height"], 4],
          0, "#223355", 40, "#4d6a9e"])) {
      problems.push("extrusion colour is not the height grade #223355-#4d6a9e (0-40 m)");
    }
    if (JSON.stringify(p["fill-extrusion-opacity"]) !== JSON.stringify(
        ["interpolate", ["linear"], ["zoom"], 13.3, 0, 13.9, 0.95])) {
      problems.push("extrusion opacity does not fade in across zoom 13.3-13.9 to 0.95");
    }
    if (JSON.stringify(p["fill-extrusion-height"]) !== JSON.stringify(
        ["max", 4, ["min", 60, ["coalesce", ["get", "render_height"], 4]]])) {
      problems.push("extrusion height is not render_height clamped to 4-60 m");
    }
    if (JSON.stringify(p["fill-extrusion-base"]) !== JSON.stringify(
        ["coalesce", ["get", "render_min_height"], 0])) {
      problems.push("extrusion base is not render_min_height");
    }
    if (p["fill-extrusion-vertical-gradient"] !== true) {
      problems.push("extrusion vertical gradient is off");
    }
  }
  const labels = byId["fui-places"];
  if (!labels) {
    problems.push("place label layer is missing");
  } else {
    const font = labels.layout && labels.layout["text-font"];
    if (!Array.isArray(font) || font.length !== 1 ||
        font[0] !== "Noto Sans Regular") {
      problems.push("label font stack is not [\"Noto Sans Regular\"]");
    }
    if (labels.maxzoom !== 12.5) problems.push("labels do not stop at zoom 12.5");
    if (JSON.stringify(labels.filter) !== JSON.stringify(["all",
        ["in", ["get", "class"], ["literal", ["city", "suburb"]]],
        ["<=", ["coalesce", ["get", "rank"], 99], 2]])) {
      problems.push("labels are not city/suburb with rank <= 2");
    }
    const lay = labels.layout || {};
    if (JSON.stringify(lay["symbol-sort-key"]) !==
        JSON.stringify(["coalesce", ["get", "rank"], 99])) {
      problems.push("labels have no rank sort key");
    }
    if (!(lay["symbol-spacing"] >= 200)) {
      problems.push("label spacing does not cap on-screen density");
    }
  }
  return problems;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FUI_VECTOR_TILES, FUI_GLYPHS, FUI_LABEL_FONT, FUI_ATTRIBUTION,
    FUI_ESRI_IMAGERY, FUI_SKY,
    buildVectorLayers, FuiVectorLayerIds, buildFuiStyle, validateFuiStyle,
    buildFuiSky, applyFuiSky, validateFuiSky
  };
}
