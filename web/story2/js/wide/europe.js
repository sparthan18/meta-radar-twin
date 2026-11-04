// Europe pull-out (scene 9). Default is deck.gl's GlobeView with no basemap at all: Natural Earth
// 50 m land and country borders (world-atlas, TopoJSON) drawn as deck layers, fifteen lit cities,
// Dresden last with the accent reticle. Variants: `mvt` puts OpenFreeMap vector tiles on the globe,
// `flat` runs the same overlay on a MapLibre Mercator map (see main.js).
import { RGB, WORLD_ATLAS, CITIES } from './config.js';

const { GeoJsonLayer, SolidPolygonLayer, ScatterplotLayer, IconLayer, TextLayer, MVTLayer } = deck;
const MONO = { fontFamily: 'JetBrains Mono', fontWeight: 500, fontSettings: { sdf: true, fontSize: 48, buffer: 6, radius: 10 }, characterSet: 'auto' };

export async function loadNaturalEarth() {
  const [land, countries] = await Promise.all([
    fetch(`${WORLD_ATLAS}/land-50m.json`).then(r => r.json()),
    fetch(`${WORLD_ATLAS}/countries-50m.json`).then(r => r.json()),
  ]);
  return {
    land: topojson.feature(land, land.objects.land),
    borders: topojson.mesh(countries, countries.objects.countries, (a, b) => a !== b),
  };
}

export function globeBackground() {
  // One polygon over the whole sphere, tessellated by GlobeView.resolution, in the water colour.
  return new SolidPolygonLayer({
    id: 'ocean', data: [{ polygon: [[-180, -90], [180, -90], [180, 90], [-180, 90]] }],
    getPolygon: d => d.polygon, getFillColor: RGB.water, material: false, pickable: false,
  });
}

export function naturalEarthLayers(ne) {
  return [
    new GeoJsonLayer({ id: 'land', data: ne.land, filled: true, stroked: false, getFillColor: RGB.ground, material: false, pickable: false }),
    new GeoJsonLayer({ id: 'borders', data: ne.borders, stroked: true, filled: false, lineWidthUnits: 'pixels', getLineWidth: 1, lineWidthMinPixels: 1, getLineColor: [...RGB.road, 80], pickable: false }),
  ];
}

export function mvtGlobeLayer(tilejson, workerUrl, onError) {
  return new MVTLayer({
    id: 'planet-globe', data: tilejson, minZoom: 0, maxZoom: 5, maxRequests: 8, pickable: false,
    loadOptions: { mvt: { layers: ['water', 'boundary'], ...(workerUrl ? { workerUrl } : {}) } }, onTileError: onError,
    renderSubLayers: props => {
      const water = [], borders = [];
      for (const f of props.data || []) {
        const p = f.properties || {};
        if (p.layerName === 'water') water.push(f);
        else if (p.layerName === 'boundary' && p.admin_level === 2 && !p.maritime) borders.push(f);
      }
      return [
        new GeoJsonLayer({ ...props, id: `${props.id}-water`, data: water, filled: true, stroked: false, getFillColor: RGB.water, material: false }),
        new GeoJsonLayer({ ...props, id: `${props.id}-borders`, data: borders, filled: false, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, lineWidthMinPixels: 1, getLineColor: [...RGB.road, 80] }),
      ];
    },
  });
}

// `deckLabels` draws labels and the reticle with TextLayer/IconLayer. deck.gl 9.4.1's GlobeView did not
// render either in headless Chromium (MapView does), so the default is HTML labels (mountHtmlLabels).
export function cityLayers(atlas, { deckLabels = false, subjectOnly = false } = {}) {
  const subject = CITIES.filter(c => c.subject);
  const CITIES_ = subjectOnly ? subject : CITIES;
  if (!deckLabels) return [
    new ScatterplotLayer({ id: 'city-glow', data: CITIES_, getPosition: d => d.lnglat, radiusUnits: 'pixels', getRadius: 7, getFillColor: d => d.subject ? [...RGB.accent, 36] : [...RGB.label, 34], stroked: false, pickable: false }),
    new ScatterplotLayer({ id: 'city-dots', data: CITIES_, getPosition: d => d.lnglat, radiusUnits: 'pixels', getRadius: 2.2, getFillColor: d => d.subject ? RGB.accent : RGB.label, stroked: false, antialiasing: true, pickable: false }),
  ];
  return [
    new ScatterplotLayer({ id: 'city-glow', data: CITIES, getPosition: d => d.lnglat, radiusUnits: 'pixels', getRadius: 7, getFillColor: d => d.subject ? [...RGB.accent, 36] : [...RGB.label, 34], stroked: false, pickable: false }),
    new ScatterplotLayer({ id: 'city-dots', data: CITIES, getPosition: d => d.lnglat, radiusUnits: 'pixels', getRadius: 2.2, getFillColor: d => d.subject ? RGB.accent : RGB.label, stroked: false, antialiasing: true, pickable: false }),
    new IconLayer({ id: 'dresden-reticle', data: subject, iconAtlas: atlas.url, iconMapping: atlas.mapping, getIcon: () => 'reticle', getPosition: d => d.lnglat, getSize: 24, sizeUnits: 'pixels', getColor: [...RGB.accent, 255], billboard: true, pickable: false }),
    new TextLayer({
      id: 'city-labels', data: CITIES, getPosition: d => d.lnglat, getText: d => d.name.toUpperCase(),
      getSize: 11, getColor: d => d.subject ? [...RGB.accent, 255] : [...RGB.label, 255], ...MONO,
      outlineWidth: 0.35, outlineColor: [10, 16, 32, 230],
      getTextAnchor: d => d.anchor, getAlignmentBaseline: 'center', getPixelOffset: d => [d.dx, d.dy], billboard: true, pickable: false,
    }),
  ];
}

// Country names at globe scale. Hand-set label points (rough centroids, nudged clear of the city labels
// and the reticle); the subject's country is the larger tier. Shown while the globe is at country scale:
// opacity is keyed to the globe zoom (full at the opening zoom, gone before the city tiles cut in), and
// only GERMANY stays, one size down, once the other cities light (the Europe chapter), where the rest would
// collide with the city labels.
// Only the subject's country is named: the owner cut the neighbours (one name across the shape is the
// whole message); the mechanism keeps taking a list.
export const COUNTRIES = [
  { name: 'Germany',     lnglat: [8.8, 49.6],  major: true },
];
const COUNTRY_ZOOM_FULL = 4.6, COUNTRY_ZOOM_GONE = 5.6;

// The globe's zoom, read back from the projection, so this module needs no view state of its own: deck's
// GlobeViewport draws the sphere with radius 256 units × 2^(zoom − log2(π·cos latitude)) (see
// @deck.gl/core globe-viewport, GLOBE_RADIUS and zoomAdjust), so one degree of longitude at 51 N near the
// view centre measures 256·π/180·cos 51° × that scale in pixels. Accurate to about a tenth of a zoom level
// while the view centre sits near 50 N, which the intro dive and the Europe chapter both do.
function zoomFromProjection(project) {
  const a = project([10, 51]), b = project([11, 51]);
  if (!a || !b) return null;
  const px = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rad = Math.PI / 180;
  return Math.log2(px / (256 * rad * Math.cos(51 * rad))) + Math.log2(Math.PI * Math.cos(50.5 * rad));
}

// HTML city labels, the country names and the Dresden reticle, positioned every frame from the live viewport
// (`project` is deck's viewport.project or MapLibre's map.project). Exact 11 px / 0.12 em typography.
// The subject's label is DRESDEN alone; the country is named once, across its shape (COUNTRIES).
export function mountHtmlLabels(container, project) {
  container.innerHTML = '';
  const nodes = CITIES.map(c => {
    const el = document.createElement('div');
    el.className = `lbl ${c.anchor}${c.subject ? ' accent' : ''}`;
    el.textContent = c.name.toUpperCase();
    container.appendChild(el);
    return { c, el };
  });
  const countries = COUNTRIES.map(c => {
    const el = document.createElement('div');
    el.className = `clbl${c.major ? ' major' : ''}`;
    el.textContent = c.name.toUpperCase();
    container.appendChild(el);
    return { c, el };
  });
  const subject = CITIES.find(c => c.subject);
  const ret = document.createElement('div');
  ret.className = 'reticle';
  ret.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff5a3c" stroke-width="1">
    <circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.3" fill="#ff5a3c" stroke="none"/>
    <path d="M12 0.5V3.5M12 20.5V23.5M0.5 12H3.5M20.5 12H23.5"/></svg>`;
  container.appendChild(ret);
  return function update() {
    for (const { c, el } of nodes) {
      const p = project(c.lnglat);
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = `${p[0] + c.dx}px`; el.style.top = `${p[1] + c.dy}px`;
    }
    // wide.js lights the city labels by setting their opacity: the intro shows the subject alone (every other
    // city at 0); anything else is the Europe chapter, where only the subject's country stays, one size down
    const intro = nodes.every(({ c, el }) => c.subject ? el.style.opacity !== '0' : (el.style.opacity === '0' || el.style.opacity === ''));
    const z = zoomFromProjection(project);
    const byZoom = z === null ? 1 : Math.max(0, Math.min(1, (COUNTRY_ZOOM_GONE - z) / (COUNTRY_ZOOM_GONE - COUNTRY_ZOOM_FULL)));
    for (const { c, el } of countries) {
      const p = project(c.lnglat);
      const shown = byZoom > 0 && p && (intro || c.major);
      if (!shown) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.classList.toggle('small', !intro);
      el.style.opacity = byZoom;
      el.style.left = `${p[0]}px`; el.style.top = `${p[1]}px`;
    }
    const p = project(subject.lnglat);
    if (p) { ret.style.left = `${p[0]}px`; ret.style.top = `${p[1]}px`; }
  };
}
