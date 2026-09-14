"""Adaptador de OpenStreetMap (Overpass `out geom`).

Todo lo que sale de aqui se escribe en `osm_raw`, nunca en `core`
(fuentes.md §8). El aislamiento por esquema es lo que mantiene acotada la
obligacion de share-alike de ODbL.
"""

from __future__ import annotations

import gzip
import json
import math
from dataclasses import dataclass
from pathlib import Path

#: Vias por las que se puede caminar. `motorway` y compañia quedan fuera:
#: una autopista en el grafo peatonal produce catchments que cruzan por
#: donde nadie cruza.
WALKABLE = {
    "footway",
    "path",
    "pedestrian",
    "steps",
    "living_street",
    "residential",
    "service",
    "unclassified",
    "tertiary",
    "secondary",
    "primary",
}

FACILITY_CATEGORY = {
    "school": "education",
    "kindergarten": "education",
    "college": "education",
    "university": "education",
    "hospital": "health",
    "clinic": "health",
    "doctors": "health",
    "health_post": "health",
    "community_centre": "community",
    "social_facility": "community",
}

GREEN_LEISURE = {"park", "garden", "pitch", "sports_centre", "playground", "recreation_ground"}


@dataclass(frozen=True)
class OsmRoad:
    osm_id: int
    highway: str
    name: str | None
    wkt: str


@dataclass(frozen=True)
class OsmGreenSpace:
    osm_id: int
    leisure: str
    name: str | None
    wkt: str
    area_m2: float


@dataclass(frozen=True)
class OsmFacility:
    osm_id: int
    amenity: str
    category: str
    name: str | None
    wkt: str


def _ring_wkt(geometry: list[dict]) -> str:
    points = [(p["lon"], p["lat"]) for p in geometry]
    if points[0] != points[-1]:
        points.append(points[0])
    inner = ", ".join(f"{lon} {lat}" for lon, lat in points)
    return f"POLYGON(({inner}))"


def _line_wkt(geometry: list[dict]) -> str:
    inner = ", ".join(f"{p['lon']} {p['lat']}" for p in geometry)
    return f"LINESTRING({inner})"


def _centroid(geometry: list[dict]) -> tuple[float, float]:
    lon = sum(p["lon"] for p in geometry) / len(geometry)
    lat = sum(p["lat"] for p in geometry) / len(geometry)
    return lon, lat


def _shoelace_area_m2(geometry: list[dict]) -> float:
    """Area aproximada en metros via proyeccion equirectangular local.

    Suficiente para clasificar un parque por tamaño. El area exacta la
    calcula PostGIS en EPSG:3116 cuando importa.
    """
    if len(geometry) < 3:
        return 0.0
    lat0 = math.radians(sum(p["lat"] for p in geometry) / len(geometry))
    mx = 111_320.0 * math.cos(lat0)
    my = 110_540.0
    pts = [(p["lon"] * mx, p["lat"] * my) for p in geometry]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    area = sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1))
    return abs(area) / 2.0


def load_overpass(path: Path) -> tuple[list[OsmRoad], list[OsmGreenSpace], list[OsmFacility]]:
    """Lee una respuesta de Overpass, comprimida o no.

    El extracto archivado en `db/seed/` va en gzip: 4 MB de JSON se quedan en
    578 KB, y versionarlo es lo que hace el despliegue reproducible sin
    depender de que Overpass esté en pie (fuentes.md §11, regla 3).
    """
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        elements = json.load(handle)["elements"]

    roads: list[OsmRoad] = []
    greens: list[OsmGreenSpace] = []
    facilities: list[OsmFacility] = []

    for element in elements:
        tags = element.get("tags") or {}
        geometry = element.get("geometry")

        highway = tags.get("highway")
        if highway in WALKABLE and element["type"] == "way" and geometry and len(geometry) > 1:
            roads.append(
                OsmRoad(
                    osm_id=element["id"],
                    highway=highway,
                    name=tags.get("name"),
                    wkt=_line_wkt(geometry),
                )
            )
            continue

        leisure = tags.get("leisure")
        if leisure in GREEN_LEISURE and geometry and len(geometry) >= 3:
            greens.append(
                OsmGreenSpace(
                    osm_id=element["id"],
                    leisure=leisure,
                    name=tags.get("name"),
                    wkt=_ring_wkt(geometry),
                    area_m2=_shoelace_area_m2(geometry),
                )
            )
            continue

        amenity = tags.get("amenity")
        category = FACILITY_CATEGORY.get(amenity or "")
        if category:
            if element["type"] == "node":
                lon, lat = element["lon"], element["lat"]
            elif geometry:
                lon, lat = _centroid(geometry)
            else:
                continue
            facilities.append(
                OsmFacility(
                    osm_id=element["id"],
                    amenity=amenity,
                    category=category,
                    name=tags.get("name"),
                    wkt=f"POINT({lon} {lat})",
                )
            )

    return roads, greens, facilities
