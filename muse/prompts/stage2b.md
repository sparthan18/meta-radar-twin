Stage 2b: finish stage 2. Read muse/prompts/stage2.md for the full scope; this prompt changes how masks are decoded and lists what is left.

What already exists and works: radartwin/ingest/imagery.py with data/carola/s2_visual.tif and s1_rtc_vv.tif, and radartwin/segment/sam.py with encode_chip, box_prompt, the /v1/responses call and record parsing. Mask decoding in sam.py does not work.

Change from stage2.md: do not hand-decode masks. Meta's official parser `meta_sam_parser` (PyPI package meta-sam-parser) is now installed in .venv. Its API is documented at https://dev.meta.ai/docs/sam/client-libraries (Python parser section): parse a response into records, then convert a mask with `decode_mask_to_raster` (also `decode_mask_to_rle`, `decode_mask_to_svg_path`), and build box prompts with `build_object_prompt`.

1. Run `.venv/bin/python -c "import meta_sam_parser"`. If it fails, stop and say so. Do not install packages and do not contact any package registry or mirror.
2. Read the installed package's source and signatures (inspect / help, or the files in .venv) before using it. Do not guess the API.
3. In sam.py, replace the hand-written decoder with meta_sam_parser: use its record parser on the response text and decode_mask_to_raster for masks. Use build_object_prompt for box prompts if it produces the same grammar; keep box_prompt as a thin wrapper so callers do not change. Delete the old base85 decoding code. First check the decoder offline on the raw response text in /tmp/sam_probe_out.txt (no API calls), and print each mask's shape and pixel count.
4. Re-run scripts/sam_smoke.py. The Sentinel-2 chip is about 90 x 90 pixels at 10 m, so bridges are only a few pixels wide. If text prompts still return nothing, say so, and try one variant where the chip is upsampled 4x (nearest or bilinear, keep the georeferencing consistent) before sending. Report which worked.
5. Do steps 3 and 4 of stage2.md: scripts/sam_vs_osm.py (box prompts from OSM footprints in one request, plus the text-prompt variant, IoU table, out/sam_vs_osm.png) and radartwin/agents/fidelity.py (bright_fraction for OSM and SAM polygons, Carola and Augustus).
6. Write the README "SAM 3.1 notes" section as stage2.md asks. Include: that masks are decoded with meta_sam_parser, the text-prompt result at 10 m, whether upsampling helped, and the exact response fragments behind each note.

Rules:
- Stage 2 has already used about 20 SAM requests. Use at most 20 more.
- If MODEL_API_KEY is missing or the API returns 401, stop and print what is missing.
- Only network hosts needed: api.meta.ai and dev.meta.ai. Nothing else.
- Do not create git commits.
- Finish with: files changed, the smoke-test numbers, the IoU table, the fidelity fractions, and the number of SAM requests used in this run.
