"""Site configuration (SPEC §2.4)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Site:
    """One monitored site: footprint, event date and owner-register inputs."""

    slug: str
    name: str
    bbox: tuple[float, float, float, float]  # minlon, minlat, maxlon, maxlat
    event_date: str | None = None  # ISO; retrospectives use epochs strictly before it
    notes: str = ""
    osm_names: dict[int, str] | None = None  # OSM way id -> display name override
    condition: dict[str, str] | None = None  # asset name -> "good" | "fair" | "poor"
    condition_source: dict[str, str] | None = None  # asset name -> documented source


SITES: dict[str, Site] = {
    "carola": Site(
        "carola",
        "Carola Bridge, Dresden",
        (13.735, 51.050, 13.748, 51.058),
        event_date="2024-09-11",
        osm_names={1422377883: "Carolabrücke", 1422377884: "Carolabrücke"},
        condition={"Carolabrücke": "poor"},
        condition_source={
            "Carolabrücke": (
                "Pre-event public record: sections A and B renovated 2019-2024, "
                "section C (tram) renovation scheduled for 2025 (City of Dresden). "
                "Grade 'poor' is this project's reading of that schedule."
            )
        },
    ),
}
