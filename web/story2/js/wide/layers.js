// deck.gl layers for the Dresden shots (crane, city).
import { RGB, SUBJECT_ID, FOG_RGB } from './config.js';
import { FogExtension } from './fog.js';
import { NoShadowExtension } from './noshadow.js';
import { bridgeFrame, bridgeMeshLayer, bridgeAccentLayers } from './bridge.js';

const { MVTLayer, GeoJsonLayer, SolidPolygonLayer, IconLayer, TextLayer, PathLayer } = deck;

const DISTRICT_CLASSES = new Set(['suburb', 'quarter', 'neighbourhood', 'borough']);
// Hairline alpha per OpenMapTiles transportation class; classes absent here are not drawn.
const ROAD_ALPHA = { motorway: 235, trunk: 235, primary: 215, secondary: 160, tertiary: 125, minor: 85, service: 50, rail: 95, transit: 95 };

export const DRESDEN_EXTENT = [13.2, 50.8, 14.3, 51.3]; // lon/lat box for the ground plane and tile loading
export const BUILDING_MATERIAL = { ambient: 1.0, diffuse: 1.0, shininess: 1, specularColor: [0, 0, 0] };
// One fixed character set so every per-tile TextLayer shares a single font atlas (an 'auto' set per
// tile regenerated the atlas and tripped texSubImage2D errors in headless Chromium).
const LABEL_CHARS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789 -./()'];
const MONO = { fontFamily: 'JetBrains Mono', fontWeight: 500, fontSettings: { sdf: true, fontSize: 48, buffer: 6, radius: 10 }, characterSet: LABEL_CHARS };

export function clampHeight(p) {
  const h = Number(p && p.render_height);
  return Math.min(60, Math.max(4, Number.isFinite(h) ? h : 4));
}

export function fogProps(fog) {
  return { extensions: [new FogExtension()], fogColor: FOG_RGB, fogNear: fog.near, fogFar: fog.far, fogStrength: fog.strength };
}

// Shadow receiver. deck.gl shadows only fall on deck.gl geometry, so the ground must be a deck layer.
export function groundLayer(fog) {
  return new SolidPolygonLayer({
    id: 'ground',
    data: [{ polygon: [[DRESDEN_EXTENT[0], DRESDEN_EXTENT[1]], [DRESDEN_EXTENT[2], DRESDEN_EXTENT[1]], [DRESDEN_EXTENT[2], DRESDEN_EXTENT[3]], [DRESDEN_EXTENT[0], DRESDEN_EXTENT[3]]] }],
    getPolygon: d => d.polygon, getFillColor: RGB.ground, material: false, pickable: false,
    ...fogProps(fog),
  });
}

export function makeLighting({ shadows }) {
  // Low light from the east-north-east (azimuth ~67°, elevation ~20°); direction is light travel.
  const ambient = new deck.AmbientLight({ color: [88, 98, 128], intensity: 1.0 });
  const sun = new deck.DirectionalLight({ color: [255, 255, 255], intensity: 0.75, direction: [-0.87, -0.36, -0.34], _shadow: shadows });
  const fx = new deck.LightingEffect({ ambient, sun });
  fx.shadowColor = [43 / 255, 49 / 255, 70 / 255, 0.78]; // #2b3146
  return fx;
}

export function planetLayer({ tilejson, workerUrl = null, fog, drawBasemap, drawLabels, onTiles, onError }) {
  return new MVTLayer({
    id: 'planet',
    data: tilejson,
    binary: false,
    minZoom: 13, // OpenMapTiles ships buildings from z13; with `extent` set, lower view zooms still fetch z13
    maxZoom: 14,
    extent: DRESDEN_EXTENT,
    maxRequests: 8,
    refinementStrategy: 'no-overlap',
    loadOptions: { mvt: { layers: drawBasemap ? ['building', 'water', 'transportation', 'place'] : ['building', 'place'], ...(workerUrl ? { workerUrl } : {}) } },
    onViewportLoad: onTiles,
    onTileError: onError,
    pickable: false,
    renderSubLayers: props => {
      const by = { building: [], water: [], transportation: [], place: [] };
      for (const f of props.data || []) { const l = f.properties && f.properties.layerName; if (by[l]) by[l].push(f); }
      const common = { ...props, pickable: false, ...fogProps(fog) };
      const out = [];
      if (drawBasemap) {
        out.push(new GeoJsonLayer({ ...common, id: `${props.id}-water`, data: by.water, stroked: false, filled: true, getFillColor: RGB.water }));
        out.push(new GeoJsonLayer({
          ...common, id: `${props.id}-roads`,
          data: by.transportation.filter(f => ROAD_ALPHA[f.properties.class]),
          filled: false, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, lineWidthMinPixels: 1,
          getLineColor: f => [RGB.road[0], RGB.road[1], RGB.road[2], ROAD_ALPHA[f.properties.class]],
        }));
      }
      out.push(new GeoJsonLayer({
        ...common, id: `${props.id}-buildings`, data: by.building,
        extruded: true, filled: true, stroked: false, wireframe: false,
        getElevation: f => clampHeight(f.properties), getFillColor: RGB.buildingLit, material: BUILDING_MATERIAL,
      }));
      if (drawLabels) {
        out.push(new TextLayer({
          ...common, id: `${props.id}-districts`,
          data: by.place.filter(f => f.properties.name && DISTRICT_CLASSES.has(f.properties.class)),
          getPosition: f => f.geometry.coordinates,
          getText: f => String(f.properties['name:latin'] || f.properties.name).toUpperCase().replace(/[^A-ZÄÖÜ0-9 \-./()]/g, ''),
          getSize: 11, getColor: [...RGB.dim, 235], ...MONO,
          outlineWidth: 0.35, outlineColor: [10, 16, 32, 230],
          getTextAnchor: 'middle', getAlignmentBaseline: 'center', billboard: true,
          // No CollisionFilterExtension: with it, every per-tile TextLayer rendered nothing in 9.4.1 here.
          parameters: { depthCompare: 'always', depthWriteEnabled: false }, shadowEnabled: false, extensions: [new FogExtension(), new NoShadowExtension()],
          // shadowEnabled is not forwarded to TextLayer's character sub-layer; without this the glyphs cast shadows.
          _subLayerProps: { characters: { shadowEnabled: false } },
        }));
      }
      return out;
    },
  });
}

function ringCentre(feature) {
  const g = feature.geometry;
  let ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.map(p => p[0]).sort((a, b) => b.length - a.length)[0];
  let x = 0, y = 0; for (const [lx, ly] of ring) { x += lx; y += ly; }
  return [x / ring.length, y / ring.length];
}

export function bridgeLayers(bridges, { scene, fog, atlas, ringColor = null, ringVersion = 0, subjectOpacity = 1, collapse = 1 }) {
  const feats = bridges.features;
  const subject = feats.filter(f => f.properties.id === SUBJECT_ID);
  const ringed = scene === 'city' ? feats : feats.filter(f => f.properties.id !== SUBJECT_ID);
  const layers = [];
  // The subject as a structure: strands on piers with the fallen span, in the buildings' grey and
  // lighting, placed on the footprint's axis (js/wide/bridge.js). Parapets are dropped at the city
  // shot's zoom, where they are sub-pixel.
  if (subject.length) {
    layers.push(bridgeMeshLayer(bridgeFrame(footprintAxis(subject[0])), {
      id: 'subject-structure', material: BUILDING_MATERIAL, fog: fogProps(fog), opacity: subjectOpacity, detail: scene !== 'city', collapse,
    }));
  }
  layers.push(new IconLayer({
    id: 'bridge-rings', data: ringed,
    iconAtlas: atlas.url, iconMapping: atlas.mapping, getIcon: () => 'ring',
    getPosition: ringCentre, getSize: 14, sizeUnits: 'pixels', billboard: true, pickable: false,
    // HUD semantics: markers are never clipped by the ground plane or buildings.
    parameters: { depthCompare: 'always', depthWriteEnabled: false }, shadowEnabled: false, extensions: [new NoShadowExtension()],
    // No worry class is present in ../data/site.json, so rings are neutral; the one unmonitored bridge is dimmer.
    getColor: f => ringColor ? ringColor(f) : (f.properties.id === SUBJECT_ID ? [...RGB.accent, 255] : f.properties.monitored ? [...RGB.label, 215] : [...RGB.dim, 130]),
    updateTriggers: { getColor: ringVersion },
  }));
  return layers;
}

// Principal axis of a footprint ring in lon/lat: returns the two end points of the centreline.
export function footprintAxis(feature) {
  const ring = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0];
  const kx = Math.cos(ring[0][1] * Math.PI / 180);
  const pts = ring.map(([lon, lat]) => [lon * kx, lat]);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; sxy += (x - cx) * (y - cy); syy += (y - cy) ** 2; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); const ax = [Math.cos(th), Math.sin(th)];
  let mn = 1e9, mx = -1e9;
  for (const [x, y] of pts) { const a = (x - cx) * ax[0] + (y - cy) * ax[1]; mn = Math.min(mn, a); mx = Math.max(mx, a); }
  const at = a => [(cx + a * ax[0]) / kx, cy + a * ax[1]];
  return { start: at(mn), end: at(mx), centre: at((mn + mx) / 2) };
}

// A highlight that sweeps along the subject's centreline: a short bright segment with a fading
// tail, at deck height, drawn over everything. `t` in [0,1) is the sweep phase.
export function sweepLayer(axis, t, { fog, widthM = 22 } = {}) {
  const lerp = (u) => [axis.start[0] + (axis.end[0] - axis.start[0]) * u, axis.start[1] + (axis.end[1] - axis.start[1]) * u, 7];
  const head = t, len = 0.22;
  const segs = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.max(0, head - len * (k + 1) / 6), b = Math.max(0, head - len * k / 6);
    if (b <= 0 || a === b) continue;
    segs.push({ path: [lerp(Math.min(1, a)), lerp(Math.min(1, b))], alpha: 255 * (1 - k / 6) });
  }
  return new PathLayer({
    id: 'subject-sweep', data: segs, getPath: d => d.path, getColor: d => [...RGB.accent, d.alpha], getWidth: widthM, widthUnits: 'meters',
    capRounded: false, jointRounded: false, pickable: false, shadowEnabled: false,
    parameters: { depthCompare: 'always', depthWriteEnabled: false }, extensions: [new NoShadowExtension()],
    updateTriggers: { getPath: t, getColor: t },
  });
}

// The blink: the accent as an edge glow on the structure's outline, strongest along the fallen
// span, never a fill over the roadway. Built on its own so the director can swap just these
// layers every frame without touching the tile layer. Returns a pair of PathLayers.
export function subjectAccentLayer(bridges, opacity, collapse = 1) {
  const subject = bridges.features.find(f => f.properties.id === SUBJECT_ID && f.geometry.type === 'Polygon');
  if (!subject) return [];
  return bridgeAccentLayers(bridgeFrame(footprintAxis(subject)), opacity, { id: 'subject-accent', collapse });
}
