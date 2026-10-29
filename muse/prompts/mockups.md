Side task: concept mockups of the RadarTwin web app as a cinematic film user interface, generated with Muse Image through the Meta Model API. This is art direction for the story mode (docs/story-spec.md), not code. Read docs/story-spec.md (scenes and Explore additions) and SPEC.md section 6 (the Meta Model API; `muse-image-1.0`) first, and check the API docs or `radartwin/agents/llm.py` for the image generation call shape before spending.

Style brief: the look of a big-budget film's diegetic interface: a dark, cinematic frame; thin luminous lines and rings; sparse monospaced data readouts; a restrained accent colour (the project's `high` red) against cool greys and blues; depth and atmosphere (soft glow, subtle vignette, shallow depth of field on the map); typography large and confident; no clutter, no fake buttons everywhere. It must still be RadarTwin: a tilted dark map of Dresden with the Elbe, bridges as glowing markers, one red, a bridge deck in close-up with span dots, captions in lower-thirds, a month readout, a history strip of coloured cells, a side view of a bending deck. Real names and numbers where text is readable: "Carolabrücke", "September 2024", "rank 1 of 19 · z 4.43", "collapsed 10 days after this cutoff".

Generate six images, 16:9, one attempt each plus at most one retry if the first is unusable:
1. Landing: dark tilted city, one Play button, the title.
2. Scene 4, the replay: city at pitch, markers lit, headline card "August 2024 — Carolabrücke needs an inspector", history strip filling along the bottom, month readout large.
3. Scene 6, the close-up: tilted aerial view of Carolabrücke, red deck, span dots blue to red, a leader line to one span "+4.0 mm/yr", the counter "rank 1 of 19 · z 4.43", the side-view panel of the bending deck.
4. Scene 8, the proof: split panel "full run / future deleted" with identical numbers and check marks over a dimmed map.
5. Explore: the dashboard reimagined in the same language: worry scale in words, ranking, detail with plain labels, the strip.
6. Phone: scene 6 at phone proportions (9:16), captions above the map's bottom edge.

Save the images to out/mockups/01-landing.png … 06-phone.png and write out/mockups/index.md with, per image, the exact prompt sent, the model, size, the cost, and one line on what the image gets right or wrong against the spec. Nothing under web/, docs/ or the tracked tree changes; out/ is ignored by git.

Spend: Meta API Muse Image calls only, hard cap $3.00 for this task; stop and report if a call fails twice or the cap is near. Allowed network host: the Meta Model API only. Do not use jg/jevgrep or any tool that sends code to an external service. Do not install packages. Do not create git commits. Do not touch web/story.js, web/index.html or any file another session may be editing. Run in the foreground; no `&`; no background jobs; no servers.

Finish with: the six files, the index, the total cost, and which three images best match the story spec and why.
