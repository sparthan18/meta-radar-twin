"use strict";
// Phase 7c: fixture-driven test for the pure parts of web/explainer.js
// (scene-2 beats, satellite, pulses, kerb, counter, chart). Run with:
//   node tests/test_explainer.js
const exp = require("../web/explainer.js");
const {
  explainerBeat, explainerSatX, explainerSatVisible, explainerPulse,
  explainerEcho, explainerKerbDy, explainerCounter, explainerCounterText,
  explainerChartProgress, explainerDotMorph, explainerChartPoints,
  explainerFrame, explainerReducedT
} = exp;

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.log(`  FAIL: ${name}`);
  }
}
function approx(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
}

// --- beats ---
check("beat 1 early", explainerBeat(0) === 1 && explainerBeat(5.999) === 1);
check("beat 2 middle", explainerBeat(6) === 2 && explainerBeat(11.499) === 2);
check("beat 3 late", explainerBeat(11.5) === 3 && explainerBeat(16) === 3);
check("planted: beat boundary is caught", explainerBeat(6) !== 1);

// --- satellite ---
check("sat starts left", approx(explainerSatX(0), 80));
check("sat ends beat 1 right", approx(explainerSatX(5.999), 720, 1));
check("sat restarts beat 2", approx(explainerSatX(6), 80));
check("sat mid beat 2", approx(explainerSatX(8.75), 400, 1));
check("sat hidden in beat 3",
  explainerSatVisible(5) === true && explainerSatVisible(12) === false);
check("planted: parked sat is caught", explainerSatX(0) !== explainerSatX(3));

// --- pulses / echo ---
const p0 = explainerPulse(0.5);
check("pulse expands", p0.r > 20 && p0.opacity > 0 && p0.opacity <= 0.9);
check("pulse silent in beat 3",
  explainerPulse(12).opacity === 0);
const e1 = explainerEcho(0.2);
check("echo silent before delay", e1.opacity === 0);
const e1b = explainerEcho(1.0);
check("echo returns in beat 1", e1b.opacity > 0);
// Same offset into the beat: beat-2 echo is dimmer (later arrival).
const eBeat1 = explainerEcho(0.8);
const eBeat2 = explainerEcho(6.8);
check("beat-2 echo arrives later",
  eBeat2.opacity < eBeat1.opacity || eBeat2.r < eBeat1.r);
check("planted: identical echoes are caught",
  JSON.stringify(explainerEcho(0.8)) !== JSON.stringify(explainerEcho(6.8)));

// --- kerb ---
check("kerb flat in beat 1", explainerKerbDy(0) === 0 && explainerKerbDy(5.9) === 0);
check("kerb lifted in beat 2", explainerKerbDy(7) === -14);
check("kerb holds in beat 3", explainerKerbDy(12) === -14 && explainerKerbDy(16) === -14);
check("planted: unlifted kerb is caught", explainerKerbDy(8) !== 0);

// --- counter ---
check("counter zero in beat 1", explainerCounter(0) === 0 && explainerCounter(5.9) === 0);
check("counter mid beat 2", approx(explainerCounter(8), 0.5));
check("counter full at beat 2 end", explainerCounter(10.5) === 1.0);
check("counter holds in beat 3", explainerCounter(12) === 1.0);
check("counter text", explainerCounterText(0) === "+0.0 mm" &&
  explainerCounterText(16) === "+1.0 mm");
check("planted: instant counter is caught", explainerCounter(0) !== 1.0);

// --- chart / dot ---
check("chart idle before beat 3",
  explainerChartProgress(0) === 0 && explainerChartProgress(11) === 0);
check("chart draws in beat 3",
  explainerChartProgress(12.75) > 0.4 && explainerChartProgress(12.75) < 0.6);
check("chart complete by 14", explainerChartProgress(14) === 1);
check("dot morph after 14",
  explainerDotMorph(13.9) === 0 && explainerDotMorph(15) === 0.5 &&
  explainerDotMorph(16) === 1);
const pts = explainerChartPoints();
check("chart has 12 months rising 0 to 1",
  pts.length === 12 && pts[0] === 0 && pts[11] === 1.0 &&
  pts[11] > pts[0]);
check("planted: flat chart is caught", pts.some((v) => v !== 0));

// --- composite frame ---
const f = explainerFrame(8);
check("frame shape",
  f.beat === 2 && typeof f.sat.x === "number" && f.sat.y === 60 &&
  typeof f.pulse.r === "number" && typeof f.echo.r === "number" &&
  typeof f.kerbDy === "number" && typeof f.counter === "number" &&
  typeof f.chartProgress === "number" && typeof f.dotMorph === "number");
check("frame clamps",
  explainerFrame(-5).t === 0 && explainerFrame(99).t === 16);

// --- reduced motion stills ---
check("reduced stills switch per beat",
  explainerReducedT(1) === 5.0 && explainerReducedT(7) === 10.5 &&
  explainerReducedT(13) === 15.0);
check("planted: animated reduced time is caught",
  explainerReducedT(1) !== 1);

if (failures) {
  console.log(`test_explainer: FAIL (${failures} failure(s))`);
  process.exit(1);
}
console.log("test_explainer: PASS");
