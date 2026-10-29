"use strict";
// Phase 8a: test for the pure parts of web/basemap.js (the embedded
// OpenFreeMap dark style restyled to the FUI palette, with 3D buildings).
// Run with:
//   node tests/test_basemap.js
const bm = require("../web/basemap.js");
const {
  FUI_VECTOR_TILES, FUI_GLYPHS, FUI_LABEL_FONT, FUI_ESRI_IMAGERY,
  buildVectorLayers, FuiVectorLayerIds, buildFuiStyle, validateFuiStyle
} = bm;

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}`);
  }
}

function layerById(style, id) {
  return (style.layers || []).find((l) => l && l.id === id) || null;
}

// --- endpoints and constants ---
check("vector tiles are the OpenFreeMap planet set",
  FUI_VECTOR_TILES === "https://tiles.openfreemap.org/planet");
check("glyphs are the OpenFreeMap font host",
  FUI_GLYPHS === "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf");
check("label stack is the single served face",
  Array.isArray(FUI_LABEL_FONT) &&
  FUI_LABEL_FONT.length === 1 &&
  FUI_LABEL_FONT[0] === "Noto Sans Regular");
check("imagery is the Esri World Imagery endpoint",
  FUI_ESRI_IMAGERY.indexOf("server.arcgisonline.com") !== -1 &&
  FUI_ESRI_IMAGERY.indexOf("World_Imagery") !== -1);

// --- built style ---
const dark = buildFuiStyle({ dark: true });
check("style validates clean", validateFuiStyle(dark).length === 0);
check("style is version 8 with glyphs + two sources",
  dark.version === 8 && !!dark.sources.openmaptiles && !!dark.sources.esri);
check("no Esri dark canvas anywhere",
  JSON.stringify(dark).toLowerCase().indexOf("dark_gray") === -1 &&
  JSON.stringify(dark).indexOf("esri-dark") === -1 &&
  layerById(dark, "esri-dark-layer") === null);
check("dark build shows the vector group and hides imagery",
  layerById(dark, "esri-layer").layout.visibility === "none" &&
  layerById(dark, "fui-water").layout.visibility === "visible");
const light = buildFuiStyle({ dark: false });
check("imagery build flips visibility",
  layerById(light, "esri-layer").layout.visibility === "visible" &&
  layerById(light, "fui-water").layout.visibility === "none");
check("default build is dark",
  layerById(buildFuiStyle(), "esri-layer").layout.visibility === "none");

// --- kept layers only ---
const vectorIds = FuiVectorLayerIds();
for (const id of ["fui-background", "fui-water", "fui-waterway", "fui-park",
    "fui-landuse-park", "fui-building", "fui-roads-minor", "fui-roads-major",
    "fui-rail", "fui-buildings-3d", "fui-places"]) {
  check(`vector group keeps ${id}`, vectorIds.indexOf(id) !== -1);
}
check("imagery is not in the vector toggle group",
  vectorIds.indexOf("esri-layer") === -1);
const usedSourceLayers = {};
for (const l of dark.layers) {
  if (l.source === "openmaptiles" && l["source-layer"]) {
    usedSourceLayers[l["source-layer"]] = true;
  }
}
check("only water, parks, buildings, roads, rail and labels are kept",
  Object.keys(usedSourceLayers).sort().join(",") ===
  "building,landuse,park,place,transportation,water,waterway");
check("planted: a POI layer would be caught",
  usedSourceLayers.poi !== true);

// --- palette ---
check("background is --bg",
  layerById(dark, "fui-background").paint["background-color"] === "#070b14");
check("water is #0a1a33",
  layerById(dark, "fui-water").paint["fill-color"] === "#0a1a33");
check("parks are #0d1a1f",
  layerById(dark, "fui-park").paint["fill-color"] === "#0d1a1f" &&
  layerById(dark, "fui-landuse-park").paint["fill-color"] === "#0d1a1f");
check("landuse keeps only the park class",
  JSON.stringify(layerById(dark, "fui-landuse-park").filter) ===
  JSON.stringify(["==", ["get", "class"], "park"]));
check("major roads are the top three classes",
  JSON.stringify(layerById(dark, "fui-roads-major").filter) ===
  JSON.stringify(["in", ["get", "class"],
    ["literal", ["motorway", "trunk", "primary"]]]));
check("rail is dashed",
  (layerById(dark, "fui-rail").paint["line-dasharray"] || []).join(",") === "2,2");
check("place labels are 11 px uppercase mono with wide tracking",
  layerById(dark, "fui-places").layout["text-size"] === 11 &&
  layerById(dark, "fui-places").layout["text-transform"] === "uppercase" &&
  layerById(dark, "fui-places").layout["text-letter-spacing"] === 0.12 &&
  JSON.stringify(layerById(dark, "fui-places").layout["text-font"]) ===
  JSON.stringify(FUI_LABEL_FONT));
check("place labels are dim with a dark halo",
  layerById(dark, "fui-places").paint["text-color"] === "#8ea3c7" &&
  layerById(dark, "fui-places").paint["text-halo-color"] === "#070b14");

// --- extrusion ---
const ex = layerById(dark, "fui-buildings-3d");
check("extrusion spec matches the phase contract",
  ex && ex.type === "fill-extrusion" && ex.minzoom === 13 &&
  ex.paint["fill-extrusion-color"] === "#111a2c" &&
  ex.paint["fill-extrusion-opacity"] === 0.9 &&
  JSON.stringify(ex.paint["fill-extrusion-height"]) ===
  JSON.stringify(["get", "render_height"]) &&
  JSON.stringify(ex.paint["fill-extrusion-base"]) ===
  JSON.stringify(["get", "render_min_height"]));
check("extrusion sits below the labels",
  dark.layers.findIndex((l) => l.id === "fui-buildings-3d") <
  dark.layers.findIndex((l) => l.id === "fui-places"));
check("planted: extrusion above the labels is caught",
  dark.layers.findIndex((l) => l.id === "fui-places") -
  dark.layers.findIndex((l) => l.id === "fui-buildings-3d") === 1);

// --- the validator catches planted failures ---
function planted(mut) {
  const clone = JSON.parse(JSON.stringify(dark));
  mut(clone);
  return validateFuiStyle(clone);
}
check("planted: missing glyphs are caught",
  planted((s) => { delete s.glyphs; }).length > 0);
check("planted: wrong tile host is caught",
  planted((s) => { s.sources.openmaptiles.url = "https://example.com/x"; }).length > 0);
check("planted: missing imagery is caught",
  planted((s) => { delete s.sources.esri; }).length > 0);
check("planted: re-added Esri dark canvas is caught",
  planted((s) => {
    s.layers.push({ id: "esri-dark-layer", type: "raster",
      source: "esri_dark" });
  }).length > 0);
check("planted: missing extrusion is caught",
  planted((s) => {
    s.layers = s.layers.filter((l) => l.id !== "fui-buildings-3d");
  }).length > 0);
check("planted: wrong extrusion colour is caught",
  planted((s) => {
    layerById(s, "fui-buildings-3d").paint["fill-extrusion-color"] = "#000000";
  }).length > 0);
check("planted: extrusion at the wrong zoom is caught",
  planted((s) => { layerById(s, "fui-buildings-3d").minzoom = 10; }).length > 0);
check("planted: two-face label stack is caught",
  planted((s) => {
    layerById(s, "fui-places").layout["text-font"] =
      ["Noto Sans Mono Regular", "Noto Sans Regular"];
  }).length > 0);
check("planted: stray source-layer is caught",
  planted((s) => {
    s.layers.push({ id: "fui-poi", type: "symbol", source: "openmaptiles",
      "source-layer": "poi", layout: {}, paint: {} });
  }).length > 0);

if (failures) {
  console.log(`test_basemap: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_basemap: PASS");
