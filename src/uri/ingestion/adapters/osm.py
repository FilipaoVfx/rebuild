"""Adaptador de OpenStreetMap (Overpass `out geom`).

Todo lo que sale de aqui se escribe en `osm_raw`, nunca en `core`
(fuentes.md §8). El aislamiento por esquema es lo que mantiene acotada la
obligacion de share-alike de ODbL.
"""

from __future__ import annotations

import gzip
import json
import math
import re
from dataclasses import dataclass, field
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

#: Clases de via que el extracto peatonal excluye (nadie camina por una
#: autopista) y que el de lugares trae solo para orientar. Complemento exacto
#: de `WALKABLE` dentro de lo que la consulta pide.
ARTERIAL = {
    "motorway",
    "trunk",
    "motorway_link",
    "trunk_link",
    "primary_link",
    "secondary_link",
    "tertiary_link",
}

#: Niveles administrativos de OSM que se cargan: perimetro urbano (7),
#: comunas (8) y barrios (9).
ADMIN_LEVELS = {7, 8, 9}

#: Nombres de lugar que se guardan como punto. `square` entra como hito, no
#: como lugar: una plaza es algo que se ve, no una division.
PLACE_TYPES = {"city", "town", "suburb", "neighbourhood", "quarter"}

#: Hitos: (etiqueta, valor) -> (kind, subkind, prioridad). La prioridad ordena
#: que se etiqueta primero cuando no cabe todo: 1 gobierno y plazas, 2 lo que
#: cualquiera usa para orientarse, 3 comercio y cultura, 4 el resto.
LANDMARK_RULES: tuple[tuple[str, str, str, str, int], ...] = (
    ("place", "square", "square", "square", 1),
    ("amenity", "townhall", "government", "townhall", 1),
    ("amenity", "courthouse", "government", "courthouse", 2),
    ("amenity", "hospital", "health", "hospital", 2),
    ("amenity", "university", "education", "university", 2),
    ("amenity", "bus_station", "transport", "bus_station", 2),
    ("public_transport", "station", "transport", "station", 2),
    ("leisure", "stadium", "sport", "stadium", 2),
    ("amenity", "theatre", "culture", "theatre", 3),
    ("tourism", "museum", "culture", "museum", 3),
    ("tourism", "attraction", "culture", "attraction", 3),
    ("tourism", "viewpoint", "culture", "viewpoint", 3),
    ("tourism", "artwork", "culture", "artwork", 4),
    ("amenity", "marketplace", "commerce", "marketplace", 3),
    ("shop", "mall", "commerce", "mall", 3),
    ("amenity", "library", "culture", "library", 4),
    ("amenity", "place_of_worship", "worship", "place_of_worship", 4),
    ("leisure", "park", "green", "park", 3),
    ("man_made", "bridge", "infrastructure", "bridge", 3),
)

#: Un puente que se llama como la calle que lo cruza no orienta a nadie.
_STREET_LIKE = re.compile(
    r"^(calle|cl\.?|cll\.?|carrera|cra\.?|cr\.?|kr\.?|avenida|av\.?|v[ií]a|variante|conexi[oó]n)\b",
    re.IGNORECASE,
)

#: Un parque de barrio se etiqueta despues que uno de ciudad.
LANDMARK_PARK_MIN_M2 = 10_000.0


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
class OsmLandUse:
    osm_id: int
    category: str
    wkt: str


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


def load_landuse(path: Path) -> list[OsmLandUse]:
    """Usos de suelo de OSM.

    Es un PROXY del POT, no el POT. IDE AMCO publica la capa normativa por WFS
    (alcanzable desde el 2026-09-24), pero sin licencia declarada: hasta que
    la declare solo alimenta un informe interno (ADR-26). Mientras tanto se usa
    dato real de OSM con esa limitación declarada — no una capa inventada.
    """
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        elements = json.load(handle)["elements"]

    out: list[OsmLandUse] = []
    for element in elements:
        tags = element.get("tags") or {}
        geometry = element.get("geometry")
        category = tags.get("landuse") or tags.get("natural")
        if not category or not geometry or len(geometry) < 3:
            continue
        out.append(OsmLandUse(osm_id=element["id"], category=category, wkt=_ring_wkt(geometry)))
    return out


# ── Lugares (ADR-22) ────────────────────────────────────────────────────


@dataclass(frozen=True)
class OsmAdminArea:
    osm_id: int
    admin_level: int
    name: str
    wikidata: str | None
    #: LINESTRING de cada miembro `way`. El multipoligono se arma en PostGIS
    #: (`ST_BuildArea`): cerrar anillos a mano es reimplementarlo peor.
    member_wkts: tuple[str, ...]


@dataclass(frozen=True)
class OsmPlace:
    osm_id: int
    place: str
    name: str
    wikidata: str | None
    population: int | None
    wkt: str


@dataclass(frozen=True)
class OsmWaterway:
    osm_id: int
    waterway: str
    name: str
    wkt: str


@dataclass(frozen=True)
class OsmLandmark:
    osm_id: int
    kind: str
    subkind: str
    name: str
    wikidata: str | None
    priority: int
    wkt: str


@dataclass(frozen=True)
class OsmArterial:
    osm_id: int
    highway: str
    name: str | None
    wkt: str


@dataclass
class OsmPlaces:
    admin_areas: list[OsmAdminArea] = field(default_factory=list)
    places: list[OsmPlace] = field(default_factory=list)
    waterways: list[OsmWaterway] = field(default_factory=list)
    landmarks: list[OsmLandmark] = field(default_factory=list)
    arterials: list[OsmArterial] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        return {
            "admin_areas": len(self.admin_areas),
            "places": len(self.places),
            "waterways": len(self.waterways),
            "landmarks": len(self.landmarks),
            "arterials": len(self.arterials),
        }


def _element_points(element: dict) -> list[dict]:
    """Todos los vertices de un elemento, venga como nodo, via o relacion."""
    if element["type"] == "node":
        return [{"lon": element["lon"], "lat": element["lat"]}]
    if element["type"] == "way":
        return list(element.get("geometry") or [])
    points: list[dict] = []
    for member in element.get("members") or []:
        if member.get("type") == "node" and "lon" in member:
            points.append({"lon": member["lon"], "lat": member["lat"]})
        else:
            points.extend(member.get("geometry") or [])
    return points


def _point_wkt(element: dict) -> str | None:
    points = _element_points(element)
    if not points:
        return None
    lon, lat = _centroid(points)
    return f"POINT({lon} {lat})"


def _maybe_int(value: str | None) -> int | None:
    if value is None:
        return None
    digits = re.sub(r"[^0-9]", "", value)
    return int(digits) if digits else None


def landmark_rule(tags: dict) -> tuple[str, str, int] | None:
    """(kind, subkind, prioridad) de un elemento, o None si no es un hito.

    Un puente con `bridge=yes` cuenta si tiene nombre propio; uno que se llama
    como su calle no. Una catedral vale mas que una capilla, y cualquier cosa
    con entrada en Wikidata es, por definicion, algo que alguien reconoce.
    """
    name = tags.get("name")
    if not name:
        return None
    match: tuple[str, str, int] | None = None
    for key, value, kind, subkind, priority in LANDMARK_RULES:
        if tags.get(key) == value:
            match = (kind, subkind, priority)
            break
    if match is None and tags.get("historic"):
        match = ("heritage", tags["historic"], 3)
    if match is None and tags.get("bridge") == "yes" and not _STREET_LIKE.match(name):
        match = ("infrastructure", "bridge", 3)
    if match is None:
        return None
    kind, subkind, priority = match
    if subkind == "place_of_worship" and re.search(r"catedral", name, re.IGNORECASE):
        priority = 2
    # OSM etiqueta como `bus_station` la taquilla de cada empresa dentro del
    # terminal, y como `stadium` una cancha de barrio. El terminal y el
    # estadio orientan; la taquilla y la cancha, no.
    if subkind == "bus_station" and not re.search(r"terminal", name, re.IGNORECASE):
        priority = 3
    if subkind == "stadium" and re.match(r"cancha", name, re.IGNORECASE):
        priority = 3
    # `amenity=hospital` cubre desde el Hospital San Jorge hasta una IPS de
    # barrio. Orienta el que se llama hospital o clinica; el resto espera.
    if subkind == "hospital" and not re.search(r"hospital|cl[ií]nica", name, re.IGNORECASE):
        priority = 3
    if tags.get("wikidata"):
        priority = min(priority, 2)
    return kind, subkind, priority


def load_places(path: Path) -> OsmPlaces:
    """Lee el extracto de lugares (`db/seed/pereira_places.overpass`).

    Todo lo que sale de aqui nombra o delimita; nada alimenta una feature. Es
    un extracto aparte del peatonal a proposito: tocar aquel mueve el grafo,
    los catchments y el hash de la matriz de features.
    """
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        elements = json.load(handle)["elements"]

    out = OsmPlaces()
    seen_landmarks: set[tuple[str, str]] = set()

    for element in elements:
        tags = element.get("tags") or {}
        name = tags.get("name")
        kind = element["type"]

        if tags.get("boundary") == "administrative" and kind == "relation":
            level = _maybe_int(tags.get("admin_level"))
            if level not in ADMIN_LEVELS or not name:
                continue
            # El AMCO tambien es nivel 7 y cubre cuatro municipios. Aqui solo
            # entra el perimetro urbano de Pereira.
            if level == 7 and ("Pereira" not in name or "Metropolitana" in name):
                continue
            members = tuple(
                _line_wkt(m["geometry"])
                for m in element.get("members") or []
                if m.get("type") == "way" and len(m.get("geometry") or []) > 1
            )
            if not members:
                continue
            out.admin_areas.append(
                OsmAdminArea(
                    osm_id=element["id"],
                    admin_level=level,
                    name=name,
                    wikidata=tags.get("wikidata"),
                    member_wkts=members,
                )
            )
            continue

        place = tags.get("place")
        if place in PLACE_TYPES and name:
            wkt = _point_wkt(element)
            if wkt:
                out.places.append(
                    OsmPlace(
                        osm_id=element["id"],
                        place=place,
                        name=name,
                        wikidata=tags.get("wikidata"),
                        population=_maybe_int(tags.get("population")),
                        wkt=wkt,
                    )
                )
            continue

        waterway = tags.get("waterway")
        if waterway in {"river", "stream"} and name and kind == "way":
            geometry = element.get("geometry") or []
            if len(geometry) > 1:
                out.waterways.append(
                    OsmWaterway(
                        osm_id=element["id"],
                        waterway=waterway,
                        name=name,
                        wkt=_line_wkt(geometry),
                    )
                )
            continue

        highway = tags.get("highway")
        if highway in ARTERIAL and kind == "way":
            geometry = element.get("geometry") or []
            if len(geometry) > 1:
                out.arterials.append(
                    OsmArterial(
                        osm_id=element["id"],
                        highway=highway,
                        name=name,
                        wkt=_line_wkt(geometry),
                    )
                )
            # Una arteria con nombre propio de puente sigue siendo hito.
            if not (tags.get("bridge") == "yes" and name and not _STREET_LIKE.match(name)):
                continue

        rule = landmark_rule(tags)
        if rule is None:
            continue
        landmark_kind, subkind, priority = rule
        if subkind == "park" and kind == "way":
            geometry = element.get("geometry") or []
            if _shoelace_area_m2(geometry) < LANDMARK_PARK_MIN_M2:
                priority = 4
        key = (landmark_kind, re.sub(r"\s+", " ", name.strip().lower()))
        if key in seen_landmarks:
            continue
        wkt = _point_wkt(element)
        if not wkt:
            continue
        seen_landmarks.add(key)
        out.landmarks.append(
            OsmLandmark(
                osm_id=element["id"],
                kind=landmark_kind,
                subkind=subkind,
                name=name,
                wikidata=tags.get("wikidata"),
                priority=priority,
                wkt=wkt,
            )
        )

    return out
