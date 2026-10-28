"""Sentinel-2 visual + Sentinel-1 RTC chips (SPEC §2.2).

STAC ``https://planetarycomputer.microsoft.com/api/stac/v1`` (SPEC §2.2 says
``.../api/v1``; that path serves the portal HTML, the STAC API lives under
``/api/stac/v1``), signed with ``planetary_computer.sign_inplace``.
"""
from __future__ import annotations

from pathlib import Path

import planetary_computer
import rasterio
from pystac_client import Client
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

from radartwin.config import Site

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
S2_COLLECTION = "sentinel-2-l2a"
S2_ASSET = "visual"
S1_COLLECTION = "sentinel-1-rtc"
S1_ASSET = "vv"
DEFAULT_DATETIME = "2023-05-01/2023-09-30"


def _clip_href_to_bbox(href: str, bbox: tuple[float, float, float, float], dst: Path) -> Path:
    """Clip a signed COG href to ``bbox`` (lon/lat) and write a GeoTIFF to ``dst``.

    The bbox is transformed to the asset CRS first, then a rasterio window
    clips the read. Returns ``dst``.
    """
    with rasterio.open(href) as src:
        bb = transform_bounds("EPSG:4326", src.crs, *bbox, densify_pts=21)
        window = from_bounds(*bb, transform=src.transform).round_offsets().round_lengths()
        window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        data = src.read(window=window)
        transform = src.window_transform(window)
        profile = src.profile.copy()
        profile.update({"height": window.height, "width": window.width, "transform": transform})
    dst.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(dst, "w", **profile) as out:
        out.write(data)
    return dst


def fetch_sentinel2(site: Site, datetime: str = DEFAULT_DATETIME) -> Path:
    """Lowest-cloud Sentinel-2 visual chip for ``site`` clipped to its bbox.

    Collection ``sentinel-2-l2a``, asset ``visual``, filter
    ``eo:cloud_cover < 10``, pick lowest cloud in ``datetime``. Writes
    ``data/<site>/s2_visual.tif``.
    """
    client = Client.open(STAC_URL)
    search = client.search(
        collections=[S2_COLLECTION],
        bbox=site.bbox,
        datetime=datetime,
        query={"eo:cloud_cover": {"lt": 10}},
        limit=100,
    )
    items = list(search.items())
    if not items:
        raise RuntimeError(f"no {S2_COLLECTION} items for bbox {site.bbox} in {datetime}")
    item = min(items, key=lambda it: it.properties.get("eo:cloud_cover", 100))
    planetary_computer.sign_inplace(item)
    href = item.assets[S2_ASSET].href
    dst = Path("data") / site.slug / "s2_visual.tif"
    return _clip_href_to_bbox(href, site.bbox, dst)


def fetch_sentinel1_rtc(site: Site, datetime: str = DEFAULT_DATETIME) -> Path:
    """Sentinel-1 RTC VV chip for ``site`` clipped to its bbox.

    Collection ``sentinel-1-rtc``, asset ``vv`` (linear power). Writes
    ``data/<site>/s1_rtc_vv.tif``.
    """
    client = Client.open(STAC_URL)
    search = client.search(
        collections=[S1_COLLECTION],
        bbox=site.bbox,
        datetime=datetime,
        limit=100,
    )
    items = list(search.items())
    if not items:
        raise RuntimeError(f"no {S1_COLLECTION} items for bbox {site.bbox} in {datetime}")
    item = items[0]
    planetary_computer.sign_inplace(item)
    href = item.assets[S1_ASSET].href
    dst = Path("data") / site.slug / "s1_rtc_vv.tif"
    return _clip_href_to_bbox(href, site.bbox, dst)
