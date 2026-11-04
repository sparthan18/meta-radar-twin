// The Carolabrücke as a structure for the wide shots: three box-girder strands on piers, parapets
// along the outer edges, and strand C's fallen span lying in the river. Every part is a box, so the
// whole bridge is one instanced SimpleMeshLayer of unit cubes with a transform per part, lit and
// shadowed like the buildings. The accent (the director's blink) is a separate pair of PathLayers
// along the deck's outline, strongest on the fallen span, so the orange never covers the roadway.
// Dimensions come from js/wide/carola.js; placement comes from the OSM footprint's principal axis.
import { RGB } from './config.js';
import { FogExtension } from './fog.js';
import { NoShadowExtension } from './noshadow.js';
import { LENGTH_M, WIDTH_M, STRAND_WIDTH_M, STRANDS, DECK_TOP_M, GIRDER_DEPTH_M, PARAPET, KERB, PIERS_M, PIER, ABUTMENT_M, APPROACH_M, COLLAPSE } from './carola.js';

const { SimpleMeshLayer, PathLayer, COORDINATE_SYSTEM } = deck;
const DEG_M = 40030000 / 360; // deck.gl's metres per degree of latitude (its meter-offset scale)

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const GREY = { deck: RGB.buildingLit, pier: mix(RGB.buildingLit, RGB.ground, 0.45), lip: mix(RGB.buildingLit, RGB.label, 0.3), wet: mix(RGB.buildingLit, RGB.ground, 0.7) };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));

// A fallen piece at collapse progress `k`: 0 is the intact deck line, 1 the resting shape in carola.js.
function pieceAt(pc, k) {
  return {
    from: pc.from, to: pc.to, wet: !!pc.wet, k,
    topFrom: lerp(DECK_TOP_M, pc.topFrom, k), topTo: lerp(DECK_TOP_M, pc.topTo, k),
    driftFrom: pc.driftFrom * k, driftTo: pc.driftTo * k, roll: (pc.roll || 0) * k,
  };
}

// Local frame on the footprint: `a` metres along from the Altstadt (south) end, `p` metres across
// (positive west), `z` metres up. The 375 m structure is stretched onto the footprint's length so
// the abutments land on the footprint's ends.
export function bridgeFrame(axis) {
  const [s, e] = axis.start[1] <= axis.end[1] ? [axis.start, axis.end] : [axis.end, axis.start];
  const origin = axis.centre;
  const kx = DEG_M * Math.cos(origin[1] * Math.PI / 180), ky = DEG_M;
  const dx = (e[0] - s[0]) * kx, dy = (e[1] - s[1]) * ky, length = Math.hypot(dx, dy);
  const u = [dx / length, dy / length], v = [-u[1], u[0]];
  const sx = (s[0] - origin[0]) * kx, sy = (s[1] - origin[1]) * ky;
  const scale = length / LENGTH_M;
  const toXYZ = (a, p, z) => [sx + a * u[0] + p * v[0], sy + a * u[1] + p * v[1], z];
  return { origin: [origin[0], origin[1], 0], u, v, length, scale, toXYZ };
}

// Unit cube with flat normals: 24 vertices, 12 triangles.
function cubeMesh() {
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const positions = [], normals = [], indices = [];
  faces.forEach((n, f) => {
    const t = n[0] ? [0, 1, 0] : [1, 0, 0];
    const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]; // n × t
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(...[0, 1, 2].map(i => 0.5 * (n[i] + su * t[i] + sv * b[i])));
      normals.push(...n);
    }
    const o = f * 4; indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { attributes: { positions: { value: new Float32Array(positions), size: 3 }, normals: { value: new Float32Array(normals), size: 3 } }, indices: { value: new Uint16Array(indices) } };
}
let MESH = null;
const mesh = () => MESH || (MESH = cubeMesh());

// A box part. `top` is the line its top face follows, from `from` to `to`, each [along, across, up]
// in the frame (along in the 375 m structure's metres, across and up in plain metres); `w` is its
// width, `h` its height below that line (or above it, with `above`); `roll` turns it about its own
// axis, in degrees, positive dropping the left (west) edge.
function box(frame, { from, to, w, h, above = false, roll = 0, color, kind = 'part' }) {
  const s = frame.scale;
  const S = [from[0] * s, from[1], from[2]], E = [to[0] * s, to[1], to[2]];
  const d = [E[0] - S[0], E[1] - S[1], E[2] - S[2]], len = Math.hypot(...d);
  const x = d.map(c => c / len);                                      // along the part
  const hy = Math.hypot(x[0], x[1]), y0 = [-x[1] / hy, x[0] / hy, 0]; // horizontal, to the part's left
  const z0 = [x[1] * y0[2] - x[2] * y0[1], x[2] * y0[0] - x[0] * y0[2], x[0] * y0[1] - x[1] * y0[0]]; // up
  const r = roll * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
  const y = [0, 1, 2].map(i => y0[i] * cr - z0[i] * sr), z = [0, 1, 2].map(i => z0[i] * cr + y0[i] * sr);
  const off = above ? h / 2 : -h / 2;
  const c = [0, 1, 2].map(i => (S[i] + E[i]) / 2 + off * z[i]);
  const position = frame.toXYZ(c[0], c[1], c[2]);
  const [u, v] = [frame.u, frame.v];
  // local (along, across, up) → (east, north, up); column-major 4x4 for SimpleMeshLayer
  const col = (e, k) => [k * (e[0] * u[0] + e[1] * v[0]), k * (e[0] * u[1] + e[1] * v[1]), k * e[2], 0];
  const matrix = [...col(x, len), ...col(y, w), ...col(z, h), 0, 0, 0, 1];
  return { position, matrix, color, kind };
}

// Every part of the structure as boxes in the frame. `detail` adds the parapets and kerbs, which
// are sub-pixel at the city shot's zoom. `collapse` is the fall's progress: 0 draws the intact
// bridge, 1 the resting shape in carola.js.
export function bridgeParts(frame, { detail = true, collapse = 1 } = {}) {
  const parts = [];
  const k = clamp01(collapse);
  const L = LENGTH_M, under = DECK_TOP_M - GIRDER_DEPTH_M, half = STRAND_WIDTH_M / 2;
  const flat = (a0, a1, p, w, h, color, extra = {}) => parts.push(box(frame, { from: [a0, p, DECK_TOP_M], to: [a1, p, DECK_TOP_M], w, h, color, ...extra }));
  // a box along a fallen piece's top line, shifted `e` metres to its left (west)
  const cAcross = STRANDS.find(st => st.id === COLLAPSE.strand).across;
  const pieces = COLLAPSE.pieces.map(pc => pieceAt(pc, k));
  const fallen = (pc, e, w, h, extra) => box(frame, { from: [pc.from, cAcross + pc.driftFrom + e, pc.topFrom], to: [pc.to, cAcross + pc.driftTo + e, pc.topTo], w, h, roll: pc.roll, ...extra });
  // a wet piece lies awash: only what stands above the water is drawn, in the submerged tone
  const girder = pc => pc.wet ? Math.max(0.6, Math.min(GIRDER_DEPTH_M, lerp(GIRDER_DEPTH_M, (pc.topFrom + pc.topTo) / 2, pc.k))) : GIRDER_DEPTH_M;
  const deckTone = pc => pc.wet ? mix(GREY.deck, GREY.wet, pc.k) : GREY.deck;
  for (const strand of STRANDS) {
    const west = strand.across + half, east = strand.across - half;
    const collapsed = strand.id === COLLAPSE.strand;
    // the girder, in one run or in the pieces either side of the fallen span
    const runs = collapsed ? [[0, pieces[0].from], [pieces[pieces.length - 1].to, L]] : [[0, L]];
    for (const [a0, a1] of runs) flat(a0, a1, strand.across, STRAND_WIDTH_M, GIRDER_DEPTH_M, GREY.deck);
    if (collapsed) for (const pc of pieces) parts.push(fallen(pc, 0, STRAND_WIDTH_M, girder(pc), { color: deckTone(pc) }));
    if (detail) {
      // outer parapets on the bridge's two outer edges, kerbs on the inner edges; all follow the deck
      const edges = [[west, strand === STRANDS[0]], [east, strand === STRANDS[STRANDS.length - 1]]];
      for (const [edge, outer] of edges) {
        const lip = outer ? PARAPET : KERB;
        const p = edge + (edge > strand.across ? -lip.width / 2 : lip.width / 2);
        for (const [a0, a1] of runs) flat(a0, a1, p, lip.width, lip.height, GREY.lip, { above: true, kind: 'lip' });
        if (collapsed) for (const pc of pieces) parts.push(fallen(pc, p - strand.across, lip.width, lip.height, { above: true, color: mix(GREY.lip, GREY.wet, pc.wet ? pc.k * 0.6 : 0), kind: 'lip' }));
      }
    }
    // one pier per strand on each pier line
    for (const pa of PIERS_M) {
      const t = PIER.along / 2 / frame.scale;
      parts.push(box(frame, { from: [pa - t, strand.across, under], to: [pa + t, strand.across, under], w: STRAND_WIDTH_M - 2 * PIER.inset, h: under, color: GREY.pier, kind: 'pier' }));
    }
  }
  // The ends meet the ground: a solid abutment from the ground to the deck top, then an approach ramp
  // beyond the footprint that brings the roadway down to the street in two tilted blocks (their
  // undersides run below the ground, where the terrain hides them), so the deck never floats.
  const ab = ABUTMENT_M / frame.scale, ramp = APPROACH_M / frame.scale;
  for (const [a0, a1, dir] of [[0, ab, -1], [L - ab, L, 1]]) {
    parts.push(box(frame, { from: [a0, 0, DECK_TOP_M], to: [a1, 0, DECK_TOP_M], w: WIDTH_M, h: DECK_TOP_M, color: GREY.pier, kind: 'abutment' }));
    const s0 = dir < 0 ? 0 : L, s1 = s0 + dir * ramp * 0.5, s2 = s0 + dir * ramp;
    parts.push(box(frame, { from: [s0, 0, DECK_TOP_M], to: [s1, 0, DECK_TOP_M * 0.5], w: WIDTH_M, h: DECK_TOP_M * 0.75, color: GREY.deck, kind: 'approach' }));
    parts.push(box(frame, { from: [s1, 0, DECK_TOP_M * 0.5], to: [s2, 0, 0.2], w: WIDTH_M, h: DECK_TOP_M * 0.5, color: GREY.deck, kind: 'approach' }));
    if (detail) for (const e of [WIDTH_M / 2 - PARAPET.width / 2, -(WIDTH_M / 2 - PARAPET.width / 2)]) {
      parts.push(box(frame, { from: [s0, e, DECK_TOP_M], to: [s2, e, 0.2], w: PARAPET.width, h: PARAPET.height, above: true, color: GREY.lip, kind: 'lip' }));
    }
  }
  return parts;
}

export function bridgeMeshLayer(frame, { material, fog, opacity = 1, detail = true, collapse = 1, id = 'carola' }) {
  return new SimpleMeshLayer({
    id, data: bridgeParts(frame, { detail, collapse }), mesh: mesh(),
    coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: frame.origin,
    getPosition: d => d.position, getTransformMatrix: d => d.matrix, getColor: d => d.color,
    material, opacity, pickable: false, ...fog,
  });
}

// The deck's outline at parapet height, as 3D paths in the frame. Returns the faint outline of the
// whole structure and the strong outline of the fallen span.
export function bridgeOutlines(frame, collapse = 1) {
  const L = LENGTH_M, lift = 0.3, top = DECK_TOP_M + PARAPET.height + lift;
  const half = STRAND_WIDTH_M / 2;
  const west = STRANDS[0].across + half, east = STRANDS[STRANDS.length - 1].across - half;
  const P = (a, p, z) => frame.toXYZ(a * frame.scale, p, z);
  const pieces = COLLAPSE.pieces.map(pc => pieceAt(pc, clamp01(collapse)));
  const strand = STRANDS.find(st => st.id === COLLAPSE.strand);
  const westSide = strand === STRANDS[0];
  // the fallen pieces' two long edges, `e` metres from the strand's centreline
  const fallenEdge = (e) => [P(pieces[0].from, strand.across + pieces[0].driftFrom + e, top), ...pieces.map(pc => P(pc.to, strand.across + pc.driftTo + e, pc.topTo + PARAPET.height + lift))];
  const outerE = westSide ? half : -half, innerE = -outerE;
  const outerP = westSide ? west : east, otherP = westSide ? east : west;
  // faint: around the whole deck, dipping with the fallen span on its side
  const last = pieces[pieces.length - 1];
  const faint = [P(0, outerP, top), P(pieces[0].from, outerP, top), ...fallenEdge(outerE).slice(1), P(last.to, outerP, top), P(L, outerP, top), P(L, otherP, top), P(0, otherP, top), P(0, outerP, top)];
  // strong: both long edges of the fallen pieces plus the break lines across them
  const strong = [fallenEdge(outerE), fallenEdge(innerE)];
  for (const pc of pieces) strong.push([P(pc.to, strand.across + pc.driftTo + outerE, pc.topTo + PARAPET.height + lift), P(pc.to, strand.across + pc.driftTo + innerE, pc.topTo + PARAPET.height + lift)]);
  strong.push([P(pieces[0].from, strand.across + outerE, top), P(pieces[0].from, strand.across + innerE, top)]);
  return { faint, strong };
}

// The accent as a highlight on the structure: a wide soft pass behind a thin crisp line, faint on
// the intact outline and full on the fallen span. `opacity` is the director's blink value.
export function bridgeAccentLayers(frame, opacity, { id = 'subject-accent', collapse = 1 } = {}) {
  const k = clamp01(collapse);
  const { faint, strong } = bridgeOutlines(frame, k);
  const o = Math.max(0, Math.min(1, opacity));
  const common = {
    coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: frame.origin,
    getPath: d => d.path, widthUnits: 'pixels', capRounded: true, jointRounded: true, pickable: false,
    shadowEnabled: false, extensions: [new NoShadowExtension()], parameters: { depthCompare: 'less-equal', depthWriteEnabled: false },
    opacity: o, visible: o > 0.01,
  };
  // the strong outline grows with the fall, so an intact bridge carries the faint edge only
  const data = [{ path: faint, k: 0.28, w: 0 }, ...strong.map(path => ({ path, k: k, w: 1 }))];
  return [
    new PathLayer({ ...common, id: `${id}-glow`, data, getWidth: d => d.w ? 9 : 5, getColor: d => [...RGB.accent, Math.round(70 * d.k)], updateTriggers: { getColor: k } }),
    new PathLayer({ ...common, id: `${id}-line`, data, getWidth: d => d.w ? 2 : 1.2, getColor: d => [...RGB.accent, Math.round(235 * d.k)], updateTriggers: { getColor: k } }),
  ];
}
