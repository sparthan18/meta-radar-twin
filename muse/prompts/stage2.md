Stage 2: imagery, SAM 3.1 segmentation via the Meta Model API, and the backscatter fidelity guardrail. Read SPEC.md sections 2.2, 6.1, 7 and 8 before writing code. Stage 1 modules already exist and are validated; do not modify them except to fix a bug you can demonstrate with a failing command.

Scope:

1. radartwin/ingest/imagery.py per SPEC 2.2: `fetch_sentinel2(site, datetime="2023-05-01/2023-09-30")` (collection sentinel-2-l2a, asset `visual`, cloud cover < 10, lowest cloud) and `fetch_sentinel1_rtc(site, datetime=...)` (collection sentinel-1-rtc, asset `vv`). Clip to the site bbox with a rasterio window after transforming the bbox to the asset CRS. Write GeoTIFFs to data/<site>/s2_visual.tif and data/<site>/s1_rtc_vv.tif. Run both for SITES["carola"] and confirm each output opens and covers the bbox.

2. radartwin/segment/sam.py per SPEC 6.1. Use the `openai` SDK with base_url https://api.meta.ai/v1 and MODEL_API_KEY from .env (python-dotenv). Implement:
   - `encode_chip(tif) -> (data_url, width, height, transform, crs)`: read the GeoTIFF's RGB bands, write PNG bytes, return a base64 data URL.
   - `box_prompt(boxes_px, width, height) -> str`: build the `<0f>` grammar with one `<|box;...|>` per box, ids starting at 1, w/h equal to the image size.
   - `segment(tif, text=None, boxes_px=None, include_confidence=True)`: POST to /v1/responses with model "sam-3.1"; one noun phrase OR the box grammar in `input_text`, the data URL in `input_image`; parse the text output into records (id, box, confidence, mask). Decode each mask: fields `data=H,W,<enc><payload>`; `~` lossless, payload base85 (`base64.b85decode`); produce a row-major 0/1 numpy array of shape (H, W). If the decoded byte count does not equal H*W, inspect the payload and work out the packing (it may be bit-packed or run-length); document what you find in the module docstring. Resize the mask to the chip size, then vectorise with rasterio.features.shapes using the chip transform. Return a GeoDataFrame (EPSG:4326) with columns label, score, geometry.
   - A tiny `scripts/sam_smoke.py` that segments data/carola/s2_visual.tif with text "bridge" and prints the number of records, their boxes and confidences, and saves out/sam_smoke.png with masks drawn over the chip. Run it. If the API returns zero matches for "bridge", also try "river bridge" and "road bridge" and report which worked.

3. scripts/sam_vs_osm.py: load the OSM bridge footprints for the site bbox (use the cached Overpass JSON), project each footprint's bounding box into chip pixel coordinates, call `segment` with those boxes as prompts (one request), and compare SAM polygons to OSM polygons per bridge by IoU. Print a table (bridge, IoU, SAM area m², OSM area m²) and save out/sam_vs_osm.png showing OSM outlines and SAM masks side by side. Also run the text-prompt variant and report its IoU in the same table so the two modes can be compared honestly.

4. radartwin/agents/fidelity.py per SPEC 7: `backscatter_fidelity(assets, s1_rtc_vv, bright_db=-8.0)` adds `bright_fraction` per polygon. Run it on both the OSM footprints and the SAM polygons for Carola and Augustus and print the fractions.

Rules:
- SAM 3.1 costs $2.50 per 1,000 images; the whole stage should use well under 50 requests. Do not loop over the city.
- If MODEL_API_KEY is missing or the API returns 401, stop and print exactly what is missing; do not stub the results.
- Do not create git commits.
- Record every deviation from the spec and every API behaviour that differs from SPEC 6.1 in README.md under a "SAM 3.1 notes" heading, with the exact response fragment that showed it.
- Finish with a summary: files created, the smoke-test numbers, the IoU table, and the fidelity fractions.
