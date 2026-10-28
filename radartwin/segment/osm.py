"""OpenStreetMap bridge footprints via Overpass (SPEC §2.3)."""
from __future__ import annotations

from pathlib import Path
import json

import geopandas as gpd
import httpx
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

from radartwin.config import Site

USER_AGENT = "radartwin/0.1"  # Overpass returns 406 without a custom User-Agent
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
BUFFER_M = 12.0  # flat-cap deck buffer, metres
MIN_LEN_M = 80  # keep bridges with rounded length >= 80 m


def overpass_query(bbox: tuple[float, float, float, float]) -> str:
    """Overpass QL for bridge/dam ways. Bbox order is south, west, north, east."""
    w, s, e, n = bbox[0], bbox[1], bbox[2], bbox[3]
    return (
        "[out:json][timeout:60];"
        f"( way[\"bridge\"][\"highway\"]({s},{w},{n},{e});"
        f" way[\"bridge\"][\"railway\"]({s},{w},{n},{e});"
        f" way[\"man_made\"=\"bridge\"]({s},{w},{n},{e});"
        f" way[\"waterway\"=\"dam\"]({s},{w},{n},{e});"
        f" way[\"man_made\"=\"dam\"]({s},{w},{n},{e}); );"
        "out geom;"
    )


def bbox_tag(bbox: tuple[float, float, float, float]) -> str:
    """Cache tag encoding the bbox, e.g. ``13.7_51.03_13.79_51.08``."""
    return "_".join(str(v) for v in bbox)


def cache_file(data_dir: str | Path, bbox: tuple[float, float, float, float]) -> Path:
    """Per-bbox raw-JSON cache path under ``data/<site>/``."""
    return Path(data_dir) / f"osm_raw_{bbox_tag(bbox)}.json"


def fetch_overpass(bbox: tuple[float, float, float, float]) -> dict:
    """POST the query to each mirror in turn; fall through on HTTP/JSON errors."""
    query = overpass_query(bbox)
    last_err: Exception | None = None
    for mirror in OVERPASS_MIRRORS:
        try:
            resp = httpx.post(
                mirror,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=120.0,
            )
            resp.raise_for_status()
            return resp.json()  # raises on HTML rate-limit pages -> next mirror
        except Exception as exc:  # noqa: BLE001 - any failure falls through
            last_err = exc
    raise RuntimeError(f"all Overpass mirrors failed for bbox {bbox}: {last_err}")


def _way_geometry(el: dict) -> LineString | Polygon | None:
    """Closed way with >3 nodes -> Polygon, else LineString."""
    pts = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
    if len(pts) < 2:
        return None
    if pts[0] == pts[-1] and len(el.get("nodes", [])) > 3:
        return Polygon(pts)
    return LineString(pts)


def _way_name(el: dict, site: Site) -> str:
    """osm_names override, else ``name``, else ``bridge:name``, else ``osm-<id>``."""
    tags = el.get("tags", {})
    if site.osm_names and el["id"] in site.osm_names:
        return site.osm_names[el["id"]]
    return tags.get("name") or tags.get("bridge:name") or f"osm-{el['id']}"


def _is_rail_only(el: dict) -> bool:
    """A way with ``railway`` and no ``highway`` is rail-only."""
    tags = el.get("tags", {})
    return "railway" in tags and "highway" not in tags


def load_bridges(bbox: tuple[float, float, float, float], site: Site,
                 data_dir: str | Path | None = None) -> gpd.GeoDataFrame:
    """Bridge ways for ``bbox``: cached Overpass JSON -> deduped buffered footprints.

    Rail-only ways intersecting the union of road ways are dropped on the raw
    (unbuffered) centerlines — tram rails duplicating a deck share its line —
    then survivors are buffered by 12 m with flat caps in UTM. Returns
    EPSG:4326 ``[osm_id, name, rail_only, geometry]``.
    """
    data_dir = Path(data_dir) if data_dir is not None else Path("data") / site.slug
    cache = cache_file(data_dir, bbox)
    if cache.exists():
        payload = json.loads(cache.read_text())
    else:
        payload = fetch_overpass(bbox)
        data_dir.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(payload))

    recs = []
    for el in payload.get("elements", []):
        if el.get("type") != "way":
            continue
        geom = _way_geometry(el)
        if geom is None:
            continue
        recs.append({"osm_id": el["id"], "name": _way_name(el, site),
                     "rail_only": _is_rail_only(el), "geometry": geom})
    gdf = gpd.GeoDataFrame(recs, crs="EPSG:4326")
    utm = gdf.estimate_utm_crs()
    gdf = gdf.to_crs(utm)
    road_union = unary_union(gdf.loc[~gdf["rail_only"], "geometry"].tolist())
    drop = gdf["rail_only"] & gdf["geometry"].intersects(road_union)
    gdf = gdf.loc[~drop].copy()
    gdf["geometry"] = gdf["geometry"].buffer(BUFFER_M, cap_style="flat")
    return gdf.to_crs("EPSG:4326").reset_index(drop=True)


def dissolve_bridges(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Dissolve ways by name; drop unnamed and < 80 m bridges; assign asset ids.

    Length ≈ buffered-outline length / 2, rounded to whole metres; ids run over
    names in alphabetical order. Returns EPSG:4326
    ``[asset_id, name, len_m, geometry]`` sorted by name.
    """
    diss = gdf.dissolve(by="name", as_index=False)
    diss = diss.loc[~diss["name"].str.startswith("osm-")].copy()
    utm = diss.estimate_utm_crs()
    lengths = diss.to_crs(utm)["geometry"].length / 2.0
    diss["len_m"] = [float(round(v)) for v in lengths]
    diss = diss.loc[diss["len_m"] >= MIN_LEN_M].copy()
    diss = diss.sort_values("name").reset_index(drop=True)
    diss["asset_id"] = range(len(diss))
    return diss[["asset_id", "name", "len_m", "geometry"]]
