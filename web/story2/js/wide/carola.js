// Carolabrücke, Dresden: the structural numbers the wide mesh (js/wide/bridge.js) and the three.js
// close-up (js/closeup.js) share. Plain metres. "Along" runs from the Altstadt abutment (south
// bank, Terrassenufer) to the Neustadt abutment; "across" is measured from the centreline, positive
// to the west (left-hand side walking toward Neustadt), where strand C and the tram tracks are.
//
// Figures: the 1971 bridge is a prestressed-concrete box girder of three structurally separate
// strands (Brückenzüge A, B, C) side by side, together about 32 m wide and 375 m long between
// abutments. On 11 September 2024 at about 03:00 the western strand C, which carried the trams,
// lost about 100 m of its span on the Altstadt side into the Elbe. The pier spacing below is the
// fallback rule from the brief (piers evenly spaced, the first span sized to the 100 m that fell),
// not surveyed positions; the sources could not be reached from the build environment.

export const LENGTH_M = 375;            // between abutments; stretched onto the OSM footprint when drawn
export const WIDTH_M = 32;              // all three strands together, parapet to parapet

// Strands west to east (C carried the trams and a footway, B and A the road lanes).
export const STRAND_WIDTH_M = 10.2;     // each box girder's deck
export const STRAND_GAP_M = 0.7;        // daylight between neighbouring strands
export const STRANDS = [
  { id: 'C', across: STRAND_WIDTH_M + STRAND_GAP_M, tram: true },   // west
  { id: 'B', across: 0 },
  { id: 'A', across: -(STRAND_WIDTH_M + STRAND_GAP_M) },            // east
];

export const DECK_TOP_M = 12;           // roadway above the water
export const GIRDER_DEPTH_M = 3;        // box-girder depth; its underside sits at DECK_TOP_M - GIRDER_DEPTH_M
export const PARAPET = { height: 1.1, width: 0.5 };   // the raised lip along each outer edge
export const KERB = { height: 0.35, width: 0.4 };     // the smaller lip along each strand's inner edges

// Pier lines, metres along from the Altstadt abutment. On the OSM footprint the water runs from
// about 111 m to 253 m of these 375 m: the first pier stands on the Altstadt quay (Terrassenufer),
// the second and third in the river, the fourth on the Neustadt bank.
export const PIERS_M = [36.6, 148, 240, 346.6];
export const PIER = { along: 4, inset: 1.5 };          // thickness along the axis; set in from each strand's edge
export const ABUTMENT_M = 10;                          // length of each end block, solid from the ground to the deck
export const APPROACH_M = 44;                          // the ramp beyond each abutment that brings the roadway down to the street

// The collapse: strand C's span between the quay pier and the first river pier, as the photographs
// of 11 September 2024 show it. The span stayed hinged on the quay pier at deck level and dropped
// steeply into the river over its first 30 m; the rest lies nearly flat in the water, awash,
// rising a little toward the river pier where its far end came to rest, and rolled a few degrees
// toward the tram side. Each piece runs from `from` to `to` along; `top` heights are metres above
// the water, `drift` metres west of the strand's line, `roll` degrees about the piece's own axis,
// and `wet` pieces take the submerged tone. The drawing code interpolates every piece between the
// intact deck line and these numbers with a progress value from 0 to 1, so the fall can be played.
export const COLLAPSE = {
  strand: 'C',
  pieces: [
    { from: 36.6, to: 68, topFrom: DECK_TOP_M, topTo: 1.2, driftFrom: 0, driftTo: 0.8, roll: 4 },
    { from: 68, to: 146, topFrom: 1.2, topTo: 2.6, driftFrom: 0.8, driftTo: 1.8, roll: 8, wet: true },
  ],
};
