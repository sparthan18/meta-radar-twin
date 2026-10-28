You are building RadarTwin in this repository from scratch. Read SPEC.md completely before writing any code, then read docs/idea.md. The spec is authoritative: follow its module layout, function names, formulas, thresholds and constants exactly.

Stage 1 scope (nothing beyond this):

1. Create the uv project: pyproject.toml with Python 3.12 (requires-python ">=3.12,<3.13"), hatchling build backend, package "radartwin", and the dependencies listed in SPEC.md section 1. Run `uv sync`.
2. Implement these modules exactly as specified in SPEC.md sections 2 and 3:
   - radartwin/config.py (Site dataclass incl. `condition`, SITES["carola"])
   - radartwin/ingest/egms.py (clip_egms with chunked reading, load_egms with bbox and track tag, date_columns with `until`, time_series)
   - radartwin/segment/osm.py (Overpass query, custom User-Agent, mirror fallback, per-bbox JSON cache under data/<site>/, 12 m flat-cap buffer in UTM, rail-only dedupe rule, name overrides)
   - radartwin/analytics/trends.py, geometry.py, decompose.py, bind.py, retro.py (rolling_span_anomaly, span_meta, score_history with SHRINK_K = 8)
3. Implement scripts/rank_city.py taking a site slug (default "carola"). It must:
   - load the three clipped EGMS CSVs in data/carola/clip_*.csv (do NOT read the raw zips or unpack them),
   - fetch bridge footprints for DRESDEN_CENTRE = (13.700, 51.030, 13.790, 51.080) using the cached Overpass JSON already present in data/carola/ (the cache file name encodes the bbox; match the spec's naming so the cache is hit and no network call is needed),
   - dissolve by name, drop unnamed and < 80 m bridges, keep bridges with >= 10 scatterers on >= 2 tracks,
   - run the leak-free rolling retrospective at monthly cutoffs from 2022-01-01 to the site event date,
   - score and rank, and write out/dresden_scores.csv, out/dresden_z_scores.csv, out/dresden_wmax.csv, out/dresden_wspread.csv, out/dresden_bridges.csv, out/dresden_ranking.png, and out/dresden_state.pkl (dict with rolls, scores, pts, bridges).
4. Validate against reference/ and print a comparison table:
   - number of analysed bridges must be 19; scatterers on bridges 3,700 total; Carolabrücke must have 61 scatterers and 3 tracks;
   - Carolabrücke's rank by `score` among the 19 must be 3 at 2023-10-01, 10 at 2024-06-01, 3 at 2024-08-01 and 2 at 2024-09-01; rank by `z` must be 1 at 2024-08-01 and 2024-09-01 with z within 0.15 of 2.57;
   - compare your out/dresden_scores.csv to reference/dresden_scores.csv cell by cell for Carolabrücke and report the max absolute difference (target < 0.05 mm/yr).
   If anything differs, find the cause in your implementation and fix it. Do not change the reference files and do not loosen the targets.
5. Write a short README.md: what the project is (one paragraph from docs/idea.md), how to set up (.env keys), and how to run scripts/rank_city.py.

Rules:
- Run scripts with `uv run`. Use `python -I` semantics are not needed; the data is trusted project data.
- Do not create git commits. Leave committing to the repository owner.
- Do not add any dependency not in the spec without saying why in README.md.
- Keep every function small and documented with the formula it implements.
- When finished, print a summary of files created, the validation table, and any deviation from the spec with its reason.
