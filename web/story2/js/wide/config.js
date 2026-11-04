// Fixed palette and type from BRIEF.md. Colours as [r,g,b] for deck.gl, hex for CSS.
export const HEX = {
  bg: '#0a1020', ground: '#4a4d58', buildingLit: '#7d7f8c', buildingShadow: '#2b3146',
  water: '#0d1a30', road: '#8ea3cf', accent: '#ff5a3c', label: '#e6eefc', dim: '#8a9ab8',
};
export const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export const RGB = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, rgb(v)]));

// Haze colour: not in the palette list; derived as the midpoint between background and ground so
// fogged geometry sinks toward the letterbox rather than toward white.
export const FOG_HEX = '#2a3042';
export const FOG_RGB = rgb(FOG_HEX);

export const TILEJSON = 'https://tiles.openfreemap.org/planet';
export const WORLD_ATLAS = 'https://unpkg.com/world-atlas@2.0.2';

export const SUBJECT_ID = '4'; // Carolabrücke in ../data/bridges.geojson
export const SUBJECT_LNGLAT = [13.7468, 51.0535];

// Shots from BRIEF.md. Captions are placeholder copy for judging type and placement only.
export const SHOTS = {
  'crane-start': {
    scene: 'crane', view: { center: SUBJECT_LNGLAT, zoom: 14.0, pitch: 42, bearing: -30 },
    caption: 'Dresden, Elbe. Twenty bridges under watch.', sub: 'Scene 01 · Crane · start',
    tag: 'SCENE 01 · CRANE',
  },
  'crane-end': {
    scene: 'crane', view: { center: SUBJECT_LNGLAT, zoom: 15.2, pitch: 66, bearing: -30 },
    caption: 'Carolabrücke. Collapsed 11 September 2024.', sub: 'Scene 01 · Crane · end',
    tag: 'SCENE 01 · CRANE', tiltShift: true,
  },
  'city': {
    scene: 'city', view: { center: [13.745, 51.039], zoom: 12.3, pitch: 40, bearing: 0 },
    caption: 'Nineteen monitored. One not.', sub: 'Scenes 03–04 · City',
    tag: 'SCENE 03 · CITY',
  },
  'europe': {
    scene: 'europe', view: { center: [12, 52], zoom: 3.8, pitch: 0, bearing: 0 },
    caption: 'Fifteen cities. Dresden last.', sub: 'Scene 09 · Europe',
    tag: 'SCENE 09 · EUROPE',
  },
};
export const CRANE_DURATION_MS = 9000;

// Fifteen lit cities for the Europe pull-out, all north of 47° so none lands in the caption band at
// zoom 3.8. Coordinates are hand-entered city centres to two decimals (not from a data file);
// `anchor`/`dx`/`dy` place each label so none collide.
export const CITIES = [
  { name: 'Oslo',       lnglat: [10.75, 59.91], anchor: 'start', dx: 8,  dy: 0 },
  { name: 'Stockholm',  lnglat: [18.07, 59.33], anchor: 'start', dx: 8,  dy: 0 },
  { name: 'Copenhagen', lnglat: [12.57, 55.68], anchor: 'start', dx: 8,  dy: 0 },
  { name: 'Hamburg',    lnglat: [10.00, 53.55], anchor: 'end',   dx: -8, dy: 0 },
  { name: 'London',     lnglat: [-0.13, 51.51], anchor: 'end',   dx: -8, dy: 0 },
  { name: 'Amsterdam',  lnglat: [4.90, 52.37],  anchor: 'start', dx: 8,  dy: -4 },
  { name: 'Brussels',   lnglat: [4.35, 50.85],  anchor: 'end',   dx: -8, dy: 4 },
  { name: 'Paris',      lnglat: [2.35, 48.86],  anchor: 'end',   dx: -8, dy: 0 },
  { name: 'Berlin',     lnglat: [13.40, 52.52], anchor: 'start', dx: 8,  dy: -4 },
  { name: 'Warsaw',     lnglat: [21.01, 52.23], anchor: 'start', dx: 8,  dy: 0 },
  { name: 'Prague',     lnglat: [14.42, 50.09], anchor: 'start', dx: 8,  dy: 4 },
  { name: 'Munich',     lnglat: [11.58, 48.14], anchor: 'end',   dx: -8, dy: 2 },
  { name: 'Vienna',     lnglat: [16.37, 48.21], anchor: 'start', dx: 8,  dy: -2 },
  { name: 'Budapest',   lnglat: [19.04, 47.50], anchor: 'start', dx: 8,  dy: 6 },
  { name: 'Dresden',    lnglat: [13.74, 51.05], anchor: 'end',   dx: -14, dy: 0, subject: true },
];
