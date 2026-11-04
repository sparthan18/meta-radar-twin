// The Elbe's current as an ambient particle layer: a sparse field of faint cyan points drifting
// downstream along the river's centreline. Everything else in the frame stays still; only this moves.
//
// Contract
//   const flow = createRiverFlow(feature, { widthM: 120, count: 420, speedMps: 2, seed: 1 });
//   flow.layer({ t: seconds, opacity: 1, extra: {} })  -> one deck.ScatterplotLayer for that instant
//   flow.bounds                                        -> [[minLng, minLat], [maxLng, maxLat]] of the line
//
// `feature` is the parsed LineString from ../data/elbe.geojson, in downstream order; the module never
// fetches and never touches the DOM. The particle set is built once, deterministically from `seed`:
// each particle gets a start position along the line in metres, a lateral offset across it, a
// lifetime of 6–12 s and a phase, all fixed for good. `layer()` is a pure function of `t`, so the
// story can scrub backward and forward and get the same frame for the same time.
//
// Motion: a particle's along-position at time t is start + speed × t, with the speed scaled by a
// lateral profile (full speed mid-river, 40 % slower at the banks), wrapped on the line's length.
// Lateral offsets are uniform within ±0.85 × half the width. The polyline is walked by metres on a
// local flat projection at its mean latitude, and the point is pushed along the local normal, which
// is blended between vertices so it turns smoothly through bends.
// Each particle fades in over the first 12 % of its life and out over the last 12 %, looping with
// its phase, so the field never pops; the first and last 200 m of the line thin out as well, so the
// wrap from the west end back to the east end is never seen.
//
// Output: a deck.ScatterplotLayer with id 'river-flow', positions [lng, lat, 0.3], 1.3 px dots in the
// palette cyan with alpha 90 × fade, unstroked, unpickable, `opacity` from the argument and `extra`
// spread last so the caller can add fog or shadow props. The typed arrays are allocated once and
// rewritten in place; the layer gets them as binary attributes inside a fresh wrapper object per
// frame, which is what makes deck.gl re-upload them.
import { RGB, rgb } from './config.js';

const CYAN = RGB.cyan || rgb('#8fd3ff'); // palette cyan; config.js has no entry for it yet
const DEG = Math.PI / 180;
const METRES_PER_DEG_LAT = 111320;
const END_FADE_M = 200; // particles thin out over the last metres of the line so the wrap never shows

// Deterministic 32-bit generator (mulberry32) so the same seed gives the same field everywhere.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Stitched waterway lines double back on themselves at a few seams (a short spur east, then west
// again). A particle walked over such a spur would hop upstream, so vertices that reverse the
// direction of travel are dropped, as are repeats of the previous vertex.
export function dropReversals(coords, mx, my) {
  const kept = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const p = coords[i], q = kept[kept.length - 1];
    const dx = (p[0] - q[0]) * mx, dy = (p[1] - q[1]) * my;
    if (Math.hypot(dx, dy) < 1) continue;
    if (kept.length > 1) {
      const o = kept[kept.length - 2];
      if (dx * (q[0] - o[0]) * mx + dy * (q[1] - o[1]) * my < 0) continue;
    }
    kept.push(p);
  }
  return kept;
}

// Prepare the polyline: local metres per degree, cumulative lengths, and a left-hand normal per
// vertex (the mean of the two adjacent segments' normals) so the lateral offset turns smoothly
// through a bend instead of snapping at each vertex.
export function prepareLine(feature) {
  const raw = feature.geometry.coordinates;
  const lat0 = raw.reduce((s, p) => s + p[1], 0) / raw.length;
  const my = METRES_PER_DEG_LAT, mx = METRES_PER_DEG_LAT * Math.cos(lat0 * DEG);
  const pts = dropReversals(raw, mx, my);
  const n = pts.length - 1;
  const cum = new Float64Array(n + 1), seg = new Float64Array(n * 2), nrm = new Float64Array((n + 1) * 2);
  for (let i = 0; i < n; i++) {
    const dx = (pts[i + 1][0] - pts[i][0]) * mx, dy = (pts[i + 1][1] - pts[i][1]) * my;
    const len = Math.hypot(dx, dy);
    cum[i + 1] = cum[i] + len;
    seg[i * 2] = -dy / len; seg[i * 2 + 1] = dx / len; // left of travel
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.max(i - 1, 0), b = Math.min(i, n - 1);
    const x = seg[a * 2] + seg[b * 2], y = seg[a * 2 + 1] + seg[b * 2 + 1], len = Math.hypot(x, y) || 1;
    nrm[i * 2] = x / len; nrm[i * 2 + 1] = y / len;
  }
  const lngs = raw.map(p => p[0]), lats = raw.map(p => p[1]);
  const bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
  return { pts, cum, nrm, mx, my, length: cum[n], bounds };
}

// Point at `s` metres along the line, pushed `offset` metres to the left of the direction of travel.
export function pointAt(line, s, offset, out, k) {
  const { pts, cum, nrm, mx, my } = line;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const f = (s - cum[lo]) / (cum[lo + 1] - cum[lo]), g = 1 - f;
  const nx = nrm[lo * 2] * g + nrm[lo * 2 + 2] * f, ny = nrm[lo * 2 + 1] * g + nrm[lo * 2 + 3] * f;
  const x = (pts[lo][0] * g + pts[lo + 1][0] * f) * mx + nx * offset;
  const y = (pts[lo][1] * g + pts[lo + 1][1] * f) * my + ny * offset;
  out[k] = x / mx; out[k + 1] = y / my;
}

export function createRiverFlow(feature, { widthM = 120, count = 420, speedMps = 2, seed = 1 } = {}) {
  const line = prepareLine(feature);
  const half = widthM / 2, L = line.length;
  const random = makeRandom(seed);
  const start = new Float64Array(count), offset = new Float64Array(count);
  const speed = new Float64Array(count), life = new Float64Array(count), phase = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    start[i] = random() * L;
    offset[i] = (random() * 2 - 1) * 0.85 * half;
    speed[i] = speedMps * (1 - 0.6 * (offset[i] / half) ** 2);
    life[i] = 6 + random() * 6;
    phase[i] = random();
  }
  const positions = new Float64Array(count * 3);
  const colors = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 2] = 0.3;
    colors[i * 4] = CYAN[0]; colors[i * 4 + 1] = CYAN[1]; colors[i * 4 + 2] = CYAN[2];
  }

  // Rewrite positions and alphas for time t (seconds). Pure in t: no state carries between calls.
  function advance(t) {
    for (let i = 0; i < count; i++) {
      let s = (start[i] + speed[i] * t) % L;
      if (s < 0) s += L;
      pointAt(line, s, offset[i], positions, i * 3);
      const age = (((t / life[i] + phase[i]) % 1) + 1) % 1; // also right for negative t
      const fade = age < 0.12 ? age / 0.12 : age > 0.88 ? (1 - age) / 0.12 : 1;
      const edge = Math.min(1, s / END_FADE_M, (L - s) / END_FADE_M); // thin out before the wrap
      colors[i * 4 + 3] = Math.round(90 * fade * edge);
    }
  }

  function layer({ t = 0, opacity = 1, extra = {} } = {}) {
    advance(t);
    return new deck.ScatterplotLayer({
      id: 'river-flow',
      data: { length: count, attributes: { getPosition: { value: positions, size: 3 }, getFillColor: { value: colors, size: 4 } } },
      radiusUnits: 'pixels', getRadius: 1.3,
      stroked: false, pickable: false, opacity,
      updateTriggers: { getPosition: t, getFillColor: t },
      ...extra,
    });
  }

  return { layer, bounds: line.bounds, length: L, count };
}
