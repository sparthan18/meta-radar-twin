"use strict";
// RadarTwin vector basemap (phase 8a): the OpenFreeMap dark style restyled
// to docs/design-spec.md section 4, with 3D buildings.
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
      paint: { "fill-color": "#0d1526" } },
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
      "source-layer": "building", minzoom: 13,
      paint: { "fill-extrusion-color": "#111a2c",
        "fill-extrusion-opacity": 0.9,
        "fill-extrusion-height": ["get", "render_height"],
        "fill-extrusion-base": ["get", "render_min_height"],
        "fill-extrusion-vertical-gradient": true } },
    { id: "fui-places", type: "symbol", source: src, "source-layer": "place",
      filter: ["in", ["get", "class"],
        ["literal", ["city", "town", "village", "suburb", "neighbourhood"]]],
      layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-font": FUI_LABEL_FONT.slice(),
        "text-size": 11,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "symbol-placement": "point" },
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
  const ex = byId["fui-buildings-3d"];
  if (!ex) {
    problems.push("fill-extrusion layer is missing");
  } else {
    if (ex.type !== "fill-extrusion") problems.push("buildings layer is not a fill-extrusion");
    if (ex.minzoom !== 13) problems.push("extrusion minzoom is not 13");
    const p = ex.paint || {};
    if (p["fill-extrusion-color"] !== "#111a2c") problems.push("extrusion colour is not #111a2c");
    if (p["fill-extrusion-opacity"] !== 0.9) problems.push("extrusion opacity is not 0.9");
    if (JSON.stringify(p["fill-extrusion-height"]) !== JSON.stringify(["get", "render_height"])) {
      problems.push("extrusion height is not render_height");
    }
    if (JSON.stringify(p["fill-extrusion-base"]) !== JSON.stringify(["get", "render_min_height"])) {
      problems.push("extrusion base is not render_min_height");
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
  }
  return problems;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FUI_VECTOR_TILES, FUI_GLYPHS, FUI_LABEL_FONT, FUI_ATTRIBUTION,
    FUI_ESRI_IMAGERY,
    buildVectorLayers, FuiVectorLayerIds, buildFuiStyle, validateFuiStyle
  };
}
