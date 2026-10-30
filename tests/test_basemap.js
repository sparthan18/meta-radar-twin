"use strict";
// Phase 8a: test for the pure parts of web/basemap.js (the embedded
// OpenFreeMap dark style restyled to the FUI palette, with 3D buildings).
// Run with:
//   node tests/test_basemap.js
const bm = require("../web/basemap.js");
const {
  FUI_VECTOR_TILES, FUI_GLYPHS, FUI_LABEL_FONT, FUI_ESRI_IMAGERY, FUI_SKY,
  buildVectorLayers, FuiVectorLayerIds, buildFuiStyle, validateFuiStyle,
  buildFuiSky, applyFuiSky, validateFuiSky
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
check("labels keep only city/suburb with rank <= 2",
  JSON.stringify(layerById(dark, "fui-places").filter) ===
  JSON.stringify(["all",
    ["in", ["get", "class"], ["literal", ["city", "suburb"]]],
    ["<=", ["coalesce", ["get", "rank"], 99], 2]]));
check("planted: town labels are caught",
  JSON.stringify(layerById(dark, "fui-places").filter).indexOf("town") === -1);
check("labels stop at zoom 12.5",
  layerById(dark, "fui-places").maxzoom === 12.5);
check("labels cap density by rank sort key and spacing",
  JSON.stringify(layerById(dark, "fui-places").layout["symbol-sort-key"]) ===
  JSON.stringify(["coalesce", ["get", "rank"], 99]) &&
  layerById(dark, "fui-places").layout["symbol-spacing"] === 250);
check("planted: unsorted dense labels are caught",
  layerById(dark, "fui-places").layout["symbol-spacing"] !== 0);

// --- extrusion (phase 8b fix 4: light, graded walls, haze) ---
const ex = layerById(dark, "fui-buildings-3d");
check("extrusion is a gated fill-extrusion below the labels",
  ex && ex.type === "fill-extrusion" && ex.minzoom === undefined &&
  dark.layers.findIndex((l) => l.id === "fui-buildings-3d") <
  dark.layers.findIndex((l) => l.id === "fui-places"));
check("planted: extrusion above the labels is caught",
  dark.layers.findIndex((l) => l.id === "fui-places") -
  dark.layers.findIndex((l) => l.id === "fui-buildings-3d") === 1);
check("extrusion opacity fades in across zoom 13.3-13.9, full 0.95",
  ex && JSON.stringify(ex.paint["fill-extrusion-opacity"]) ===
  JSON.stringify(["interpolate", ["linear"], ["zoom"], 13.3, 0, 13.9, 0.95]));
check("planted: constant extrusion opacity is caught",
  ex && ex.paint["fill-extrusion-opacity"] !== 0.95);
check("planted: old 0.9 extrusion opacity is caught",
  ex && JSON.stringify(ex.paint["fill-extrusion-opacity"]) !==
  JSON.stringify(["interpolate", ["linear"], ["zoom"], 13.3, 0, 13.9, 0.9]));
check("extrusion colour is graded by height (#223355 at 0 m to #4d6a9e at 40 m)",
  ex && JSON.stringify(ex.paint["fill-extrusion-color"]) ===
  JSON.stringify(["interpolate", ["linear"],
    ["coalesce", ["get", "render_height"], 4],
    0, "#223355", 40, "#4d6a9e"]));
check("planted: flat extrusion colour is caught",
  ex && ex.paint["fill-extrusion-color"] !== "#111a2c");
check("planted: old near-background walls are caught",
  ex && JSON.stringify(ex.paint["fill-extrusion-color"]) !==
  JSON.stringify(["interpolate", ["linear"],
    ["coalesce", ["get", "render_height"], 4],
    0, "#0d1526", 60, "#1b2740"]));
check("flat footprints stay below the extrusions at #101a2e",
  layerById(dark, "fui-building") &&
  layerById(dark, "fui-building").paint["fill-color"] === "#101a2e" &&
  dark.layers.findIndex((l) => l.id === "fui-building") <
  dark.layers.findIndex((l) => l.id === "fui-buildings-3d"));
check("extrusion heights clamp to 4-60 m",
  ex && JSON.stringify(ex.paint["fill-extrusion-height"]) ===
  JSON.stringify(["max", 4,
    ["min", 60, ["coalesce", ["get", "render_height"], 4]]]));
check("planted: unclamped extrusion height is caught",
  ex && JSON.stringify(ex.paint["fill-extrusion-height"]) !==
  JSON.stringify(["get", "render_height"]));
check("extrusion base is render_min_height, gradient on",
  ex && JSON.stringify(ex.paint["fill-extrusion-base"]) ===
  JSON.stringify(["coalesce", ["get", "render_min_height"], 0]) &&
  ex.paint["fill-extrusion-vertical-gradient"] === true);

// --- light (phase 8b fix 4: hard, low, near-white) ---
check("light is anchored to the map",
  dark.light && dark.light.anchor === "map");
check("light is hard, low and near-white",
  dark.light && dark.light.color === "#ffffff" &&
  dark.light.intensity === 0.9 &&
  Array.isArray(dark.light.position) &&
  dark.light.position.join(",") === "1.5,100,25");
check("planted: viewport-anchored light is caught",
  !dark.light || dark.light.anchor !== "viewport");
check("planted: old soft light is caught",
  !dark.light || dark.light.intensity !== 0.4 ||
  dark.light.color !== "#bcd0ff" ||
  !dark.light.position || dark.light.position.join(",") !== "1.15,210,60");

// --- sky/fog (phase 8b fix 4 atmosphere) ---
check("sky carries the spec values",
  FUI_SKY && FUI_SKY["sky-color"] === "#070b14" &&
  FUI_SKY["horizon-color"] === "#0d1a33" &&
  FUI_SKY["fog-color"] === "#0a1326" &&
  FUI_SKY["fog-ground-blend"] === 0.6 &&
  FUI_SKY["horizon-fog-blend"] === 0.9 &&
  FUI_SKY["sky-horizon-blend"] === 0.5 &&
  FUI_SKY["atmosphere-blend"] === 0.8);
check("built sky validates clean",
  validateFuiSky(buildFuiSky()).length === 0);
check("built sky is a copy, not the constant",
  buildFuiSky() !== FUI_SKY &&
  JSON.stringify(buildFuiSky()) === JSON.stringify(FUI_SKY));
check("planted: wrong fog colour is caught",
  validateFuiSky(Object.assign({}, buildFuiSky(),
    { "fog-color": "#000000" })).length > 0);
check("planted: missing atmosphere blend is caught",
  (() => { const s = buildFuiSky(); delete s["atmosphere-blend"];
    return validateFuiSky(s).length > 0; })());
check("sky applies through setSky with the spec values",
  (() => {
    let got = null;
    const ok = applyFuiSky({ setSky: (s) => { got = s; } });
    return ok === true && JSON.stringify(got) === JSON.stringify(FUI_SKY);
  })());
check("sky apply is guarded without setSky",
  applyFuiSky(null) === false && applyFuiSky({}) === false &&
  applyFuiSky({ setSky: null }) === false);

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
check("planted: flat extrusion colour is caught",
  planted((s) => {
    layerById(s, "fui-buildings-3d").paint["fill-extrusion-color"] = "#000000";
  }).length > 0);
check("planted: constant extrusion opacity is caught",
  planted((s) => {
    layerById(s, "fui-buildings-3d").paint["fill-extrusion-opacity"] = 0.95;
  }).length > 0);
check("planted: old 0.9 extrusion opacity is caught",
  planted((s) => {
    layerById(s, "fui-buildings-3d").paint["fill-extrusion-opacity"] =
      ["interpolate", ["linear"], ["zoom"], 13.3, 0, 13.9, 0.9];
  }).length > 0);
check("planted: old near-background walls are caught",
  planted((s) => {
    layerById(s, "fui-buildings-3d").paint["fill-extrusion-color"] =
      ["interpolate", ["linear"],
        ["coalesce", ["get", "render_height"], 4],
        0, "#0d1526", 60, "#1b2740"];
  }).length > 0);
check("planted: unclamped extrusion height is caught",
  planted((s) => {
    layerById(s, "fui-buildings-3d").paint["fill-extrusion-height"] =
      ["get", "render_height"];
  }).length > 0);
check("planted: extrusion minzoom pop is caught",
  planted((s) => { layerById(s, "fui-buildings-3d").minzoom = 10; }).length > 0);
check("planted: gradient-off extrusions are caught",
  planted((s) => {
    layerById(s, "fui-buildings-3d").paint["fill-extrusion-vertical-gradient"] = false;
  }).length > 0);
check("planted: viewport-anchored light is caught",
  planted((s) => { s.light.anchor = "viewport"; }).length > 0);
check("planted: full-blast light is caught",
  planted((s) => { s.light.intensity = 1; }).length > 0);
check("planted: moved light is caught",
  planted((s) => { s.light.position = [1.15, 210, 30]; }).length > 0);
check("planted: old soft light is caught",
  planted((s) => {
    s.light = { anchor: "map", color: "#bcd0ff", intensity: 0.4,
      position: [1.15, 210, 60] };
  }).length === 3);
check("planted: town/suburb-unfiltered labels are caught",
  planted((s) => {
    layerById(s, "fui-places").filter = ["in", ["get", "class"],
      ["literal", ["city", "town", "village", "suburb", "neighbourhood"]]];
  }).length > 0);
check("planted: unranked labels are caught",
  planted((s) => { delete layerById(s, "fui-places").layout["symbol-sort-key"]; }).length > 0);
check("planted: labels past 12.5 are caught",
  planted((s) => { layerById(s, "fui-places").maxzoom = 14; }).length > 0);
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
