# RadarTwin — city-scale radar watchlist for infrastructure

**One line.** RadarTwin turns Europe's free Sentinel-1 ground-motion feed into a ranked inspection
list for every bridge in a city, with typed risk decisions and stated probabilities, and shows that
it would have flagged the Dresden Carola Bridge twice before it collapsed in September 2024.

## The problem

Asset owners run hundreds of bridges and inspect them on fixed cycles, mostly by eye. Some failures
are invisible to visual inspection: the Carola Bridge fell because of hydrogen-induced stress
corrosion in tendons sealed inside the deck. Satellite radar interferometry measures ground and
structure motion to the millimetre, every six to twelve days, in any weather, and Europe publishes
the processed product (EGMS) for free. Almost nobody turns that feed into a decision.

## What RadarTwin does

1. **Finds the assets.** SAM 3.1 segments bridge decks from Sentinel-2 imagery, seeded with
   OpenStreetMap footprints as box prompts, and a backscatter check against Sentinel-1 amplitude
   confirms each polygon sits on real metal or concrete.
2. **Binds the motion.** Every EGMS scatterer inside a polygon is attached to the asset. The deck
   is split into spans along its axis; ascending and descending passes are combined into vertical
   and east-west motion per span.
3. **Computes the physics deterministically.** Each series is deseasoned (the thermal cycle on a
   deck is ten times larger than the trend), then long-term velocity, recent velocity, acceleration
   and span-to-span spread are computed in Python. No model does arithmetic.
4. **Scores honestly.** A rolling retrospective uses only data before each monthly cutoff, so lead
   time can never leak from the future. Each bridge is scored on reliability-weighted differential
   motion, against its own history and against every other bridge in the city.
5. **Decides with probabilities.** Muse Spark answers three typed questions per asset per cutoff:
   motion pattern, risk level, inspect yes/no, each with a probability.
6. **Explains.** Muse Spark runs the audit as a tool-calling agent over those functions and writes
   the engineering memo plus a GeoJSON hazard layer. It narrates; it never decides.
7. **Shows it.** A MapLibre twin over the OpenFreeMap vector basemap (satellite imagery as an option): bridges coloured by risk, a cutoff-date
   scrubber, per-span anomaly charts, scatterers and radar amplitude as toggles.

## What it has shown so far (Dresden, 20 bridges in the data, 19 monitored, EGMS 2020–2024)

- The pipeline reproduces the official EGMS velocities to 0.1 mm/yr.
- Carola was the most anomalous bridge in the city in October 2023 (eleven months before
  collapse; risk *high*, inspect recommended) and again in September 2024 (ten days before;
  rank 1, z = 4.2, risk *high*), with August 2024 at rank 3 and the top own-history deviation.
  It dropped off the list in spring 2024.
- The signal is differential motion along the deck, not bulk settlement.
- Visible false positives: the Albert Bridge ranked first in September 2024 and did not fail; two
  small harbour bridges out-scored Carola for most of 2024 with no ground truth either way.
- 399 decisions across 21 cutoffs with the former engine cost a few cents.

## What it does not claim

- It does not predict failure or its timing. It ranks assets for inspection.
- It is validated on one city and one known failure. Thresholds are provisional.
- Bridges with few scatterers (Carola has 61; one span has 2) are thinly measured.
- It does not generate synthetic imagery. The "twin" is real satellite imagery with radar layers.

## Meta AI tooling

SAM 3.1 (asset segmentation, box-prompted), Muse Spark 1.3 (audit agent, memo), Muse Image
(illustrative view in the memo, labelled as illustration, if its edit mode proves usable),
Muse Code (build agent). Muse Glimmer open weights on Baseten/Modal as an on-premise narrator is a
stretch goal that shows the pipeline is model-agnostic for asset owners who cannot send data out.

## Why it matters

A free public feed, a ranking that would have surfaced a real collapse twice, and an honest
false-positive rate on screen. Scaling it from one city to a country is a loop over tiles, not new
science.

## The hard question: would it have warned anyone in August 2024?

**What the screen would have said.** At the 1 Aug 2024 cutoff Carola was rank 3 of 19 monitored (20 in the data) by score and
rank 1 by deviation from its own history (z = 2.8). Two flags lit: differential motion along the
deck, and outlier against its own past. The former engine gave pattern *differential* at full confidence, risk
*elevated* at 47%, inspect *yes* at 52%. By the 1 Sept 2024 cutoff it was rank 1 with z = 4.2,
three flags lit, and risk *high*. The per-span chart showed the north (Neustadt-side) spans
and the mid-river span drifting down through 2024 while the south half stayed still, which is the
end of the bridge where the strand fell.

**What it would not have said.** Nothing about collapse, timing, strand C, or tendon corrosion. The
signal is 2–3 mm/yr of differential motion. Two small harbour bridges sat above Carola with "high"
labels. The corrosion was inside a sealed box girder, so an ordinary inspection prompted by the
flag might not have found the mechanism.

**Would it have stressed urgency? Partly.** In October 2023 the verdict was already *high*, which
maps to a field inspection within the quarter, and that is the one reading a real operator would
have had given EGMS latency. In August 2024 it fell back to *elevated*, a review within the year,
six weeks before the collapse; only the September cutoff, ten days out, returned to *high*. The tool
raised priority and, once, urgency; it did not hold the alarm through summer 2024. Two things
explain the gap:

- The strongest fact in the data, "moving more than at any point in this asset's record, and
  concentrated at one end", was treated as two flags among five rather than as an escalation.
- The tool had no idea the city already knew strand C was chloride-damaged and scheduled for
  renovation. A known-weak structure that starts moving more than ever is a different situation
  from a healthy one doing the same.

**The fix (to implement, then re-run on all 20 bridges, 19 monitored).**

1. Escalation rule in the deterministic rubric: own-history outlier *and* differential motion
   together produce a stated fact for the decision model ("exceeds anything in this asset's record, concentrated
   at one end") and map to *high*.
2. Asset condition input: inspection grade, age, known defects from the owner's register (or OSM
   tags where present). Poor condition + the escalation rule → *immediate*.

The rule must be stated as a general engineering principle and shown not to fire across the city,
otherwise it is post-hoc tuning and a judge will say so.

## The data latency caveat

The EGMS 2020–2024 release used here was published in Aug–Sep 2025. EGMS updates annually with
roughly a year of latency. A real operator in August 2024 would have had the previous release,
ending December 2023, and would therefore have seen only the October 2023 flag (rank 3,
differential, elevated, inspect at 32%). The retrospective is a true test of the **method**, not of
the public service's timeliness. Closing the gap means processing Sentinel-1 on demand (for example
ASF HyP3), which is what a production RadarTwin would plug in. State this in the submission before
a judge does.

## How a sceptical judge reads it

The rubric is Impact 30 / Meta tooling 25 / Technical depth 20 / Demo 25.

- **Loses them:** "detects failing bridges from space". They ask the August 2024 question, find
  *elevated* six weeks out, two bridges ranked above, data unavailable until 2025, and stop.
- **Convinces them:** "a public feed turned into a ranked inspection list, tested the only honest
  way, with the gap shown". Answer the August question before they ask: on the list twice, pointed
  at the right end, under-sold the urgency, here is why, here is the fix running across the city.
- **Impact:** strong if the latency caveat is ours. **Depth:** very strong (leak-free retrospective,
  deseasoning, span decomposition, visible false positives). **Demo:** strong if the video leads
  with the honest version. **Meta tooling:** the weak column until SAM 3.1 and the Muse Spark agent
  are actually built; a judge will notice a model-and-Python pipeline with Meta models on the edges.
- **Still loses them:** an escalation rule tuned after seeing the answer and not declared; only one
  site; any sentence in the video that outruns the data.

Estimate: honest framing + escalation fix + second site + real SAM/Spark integration = top-decile
indie entry and a plausible finalist. Without the Meta-model work it scores poorly on a quarter of
the rubric. Without the honesty it is taken apart in two questions.
