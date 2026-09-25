"""IDE AMCO: el POT de Pereira por WFS, con puerta (ADR-26).

El GeoServer del AMCO publica el POT de Pereira como servicio OGC. Dos capas
responden lo que el sistema no tenía con qué responder:

- `pot_sectores_normativos`: tratamiento urbanístico y área de actividad de
  cada sector. Es la NORMA. `uso_del_suelo_pereira`, del mismo servidor, es
  cobertura del suelo y marca "Zona Urbana" en 110 de los 115 sitios: no
  distingue a ninguno.
- `pot_microzonificacion_sismica`: zona geotécnica. Hay una segunda versión
  publicada (`pere_zonsism`) que no coincide con la primera en todos los
  sitios. Se descargan las dos y la discrepancia se declara; no se resuelve
  eligiendo la que convenga.
- `dosq_zonsism`: la microzonificación de Dosquebradas. Tres sitios del AOI
  están allí, fuera de toda capa de Pereira. Su numeración de zonas es otra
  (la zona 1 de Dosquebradas no es la de Pereira), así que cada zona viaja
  con su municipio.

El servidor mezcla en el mismo espacio de trabajo capas con datos personales
(`dosquebradas_personas_naturales`, entre otras). Por eso no se descarga el
espacio entero: solo las capas de `LAYERS`, una por una.

La fuente sigue en UNCLEAR: el servicio no declara licencia. Todo va al
sandbox (`data/ide_amco/.sandbox/`), que no se versiona, no se sirve y no se
empaqueta. El cruce con los sitios produce un informe interno; ninguna
feature de la base lo lee todavía.

Consumo por pipeline con la consulta archivada (`FR-ING-05`): la URL de
GetFeature es la procedencia.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from collections.abc import Hashable, Iterable
from dataclasses import dataclass
from pathlib import Path

from uri.ingestion import registry

SOURCE_ID = "ide_amco"
WFS_URL = "https://geo.ideamco.gov.co:8443/geoserver/amco/wfs"

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data" / "ide_amco"
SANDBOX = DATA / ".sandbox"

#: Puntos por lado de la rejilla con la que se muestrea cada sitio. Un sitio
#: puede caer entre dos sectores: con la rejilla se sabe qué parte cae en
#: cada uno, en vez de decidirlo por un centroide.
SAMPLE_GRID = 7

RETRIES = 4

Ring = list[list[float]]
BBox = tuple[float, float, float, float]


@dataclass(frozen=True)
class PotLayer:
    key: str
    type_name: str
    municipio: str
    description: str


LAYERS: tuple[PotLayer, ...] = (
    PotLayer(
        key="sectores_normativos",
        type_name="amco:pot_sectores_normativos",
        municipio="Pereira",
        description="Sectores normativos: tratamiento urbanístico y área de actividad.",
    ),
    PotLayer(
        key="microzonificacion_sismica",
        type_name="amco:pot_microzonificacion_sismica",
        municipio="Pereira",
        description="Microzonificación sísmica del POT.",
    ),
    PotLayer(
        key="microzonificacion_sismica_alterna",
        type_name="amco:pere_zonsism",
        municipio="Pereira",
        description=(
            "Segunda versión publicada de la microzonificación. Solo sirve "
            "para declarar dónde no coincide con la primera."
        ),
    ),
    PotLayer(
        key="microzonificacion_sismica_dosquebradas",
        type_name="amco:dosq_zonsism",
        municipio="Dosquebradas",
        description="Microzonificación sísmica de Dosquebradas.",
    ),
)

LAYERS_BY_KEY = {layer.key: layer for layer in LAYERS}


@dataclass(frozen=True)
class NormativeSector:
    sector: int | None
    tratamiento: str | None
    subtratamiento: str | None
    actividad: str | None


@dataclass(frozen=True)
class SeismicZone:
    municipio: str
    zona: str | None
    leyenda: str | None


@dataclass(frozen=True)
class Parcel:
    geometry: dict
    bbox: BBox
    attrs: Hashable


@dataclass(frozen=True)
class Match:
    #: Atributos de la parcela que cubre la mayor parte del sitio.
    attrs: Hashable | None
    #: Fracción del sitio que cae en esa parcela.
    share: float
    #: Fracción del sitio que cae en alguna parcela de la capa.
    covered: float


# ── Puerta ──────────────────────────────────────────────────────────────


def is_publishable() -> bool:
    return registry.is_publishable(SOURCE_ID)


def output_dir() -> Path:
    """`data/ide_amco/` si se puede redistribuir; si no, el sandbox.

    El sandbox está en .gitignore, la API no lo sirve y `build_static.py` no
    lo copia. Es la misma puerta que las ortofotos (ADR-22 §6).
    """
    return DATA if is_publishable() else SANDBOX


# ── Consulta ────────────────────────────────────────────────────────────


def getfeature_url(layer: PotLayer, bbox: BBox) -> str:
    """La consulta exacta. Es la procedencia que `FR-ING-05` pide archivar.

    El bbox va con `EPSG:4326` corto, que GeoServer lee en orden lon/lat. La
    forma URN invertiría los ejes; `check_collection` lo detectaría.
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": layer.type_name,
        "outputFormat": "application/json",
        "bbox": f"{min_lon},{min_lat},{max_lon},{max_lat},EPSG:4326",
    }
    return f"{WFS_URL}?{urllib.parse.urlencode(params)}"


def fetch_json(url: str, *, timeout: int = 120) -> dict:
    """Los servidores estatales se caen: reintentos con espera."""
    delay = 2.0
    for attempt in range(1, RETRIES + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "uri-pipeline/0.1"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError):
            if attempt == RETRIES:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("inalcanzable")


def check_collection(payload: dict, bbox: BBox) -> None:
    """Aborta antes de archivar algo que no es lo que parece.

    Dos fallos silenciosos posibles: una respuesta truncada por el límite de
    rasgos del servidor, y unos ejes invertidos que pondrían Pereira en el
    océano Índico sin que ningún cruce fallara — simplemente no cruzaría nada.
    """
    if payload.get("type") != "FeatureCollection":
        raise ValueError("la respuesta no es un FeatureCollection")
    matched, returned = payload.get("numberMatched"), payload.get("numberReturned")
    if isinstance(matched, int) and isinstance(returned, int) and returned < matched:
        raise ValueError(f"respuesta truncada: {returned} de {matched} rasgos")
    min_lon, min_lat, max_lon, max_lat = bbox
    for feature in payload.get("features", [])[:20]:
        if not feature.get("geometry"):
            continue
        x, y = _first_vertex(feature["geometry"])
        if not (min_lon - 0.5 <= x <= max_lon + 0.5 and min_lat - 0.5 <= y <= max_lat + 0.5):
            raise ValueError(f"vértice ({x}, {y}) fuera del área: ejes invertidos o CRS distinto")


# ── Lectura ─────────────────────────────────────────────────────────────


def _text(value) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text or None


def _int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_sectors(payload: dict) -> list[Parcel]:
    return [
        Parcel(
            geometry=f["geometry"],
            bbox=geometry_bbox(f["geometry"]),
            attrs=NormativeSector(
                sector=_int(f["properties"].get("sectnorm")),
                tratamiento=_text(f["properties"].get("cattrat")),
                subtratamiento=_text(f["properties"].get("subcattrat")),
                actividad=_text(f["properties"].get("actividad")),
            ),
        )
        for f in payload.get("features", [])
        if f.get("geometry")
    ]


def _leyenda(value) -> str | None:
    """Dosquebradas repite la zona dentro de la leyenda ("Zona 4 Cenizas…");
    Pereira no. Se quita para que las dos se lean igual."""
    text = _text(value)
    if text is None:
        return None
    return re.sub(r"^zona\s*\d+\s*", "", text, flags=re.IGNORECASE) or None


def parse_zones(payload: dict, *, municipio: str) -> list[Parcel]:
    return [
        Parcel(
            geometry=f["geometry"],
            bbox=geometry_bbox(f["geometry"]),
            attrs=SeismicZone(
                municipio=municipio,
                zona=_text(f["properties"].get("zona")),
                leyenda=_leyenda(f["properties"].get("leyenda")),
            ),
        )
        for f in payload.get("features", [])
        if f.get("geometry")
    ]


# ── Geometría, sin dependencias: Polygon y MultiPolygon en lon/lat ──────


def _polygons(geometry: dict) -> list[list[Ring]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"geometría {geometry['type']}: se esperaba un polígono")


def _first_vertex(geometry: dict) -> tuple[float, float]:
    point = _polygons(geometry)[0][0][0]
    return float(point[0]), float(point[1])


def geometry_bbox(geometry: dict) -> BBox:
    xs = [p[0] for polygon in _polygons(geometry) for p in polygon[0]]
    ys = [p[1] for polygon in _polygons(geometry) for p in polygon[0]]
    return min(xs), min(ys), max(xs), max(ys)


def _in_ring(x: float, y: float, ring: Ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def contains(geometry: dict, x: float, y: float) -> bool:
    """Punto en polígono, respetando los huecos."""
    return any(
        _in_ring(x, y, polygon[0]) and not any(_in_ring(x, y, hole) for hole in polygon[1:])
        for polygon in _polygons(geometry)
    )


def sample_points(geometry: dict, n: int = SAMPLE_GRID) -> list[tuple[float, float]]:
    """Centros de una rejilla n×n sobre el bbox que caen dentro del sitio.

    Un sitio demasiado fino para la rejilla se representa por el promedio de
    los vértices de su anillo exterior, que es lo más cercano a "el sitio"
    que queda.
    """
    min_x, min_y, max_x, max_y = geometry_bbox(geometry)
    dx, dy = (max_x - min_x) / n, (max_y - min_y) / n
    points = [(min_x + (i + 0.5) * dx, min_y + (j + 0.5) * dy) for i in range(n) for j in range(n)]
    inside = [p for p in points if contains(geometry, *p)]
    if inside:
        return inside
    ring = _polygons(geometry)[0][0]
    return [(sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))]


def match_site(geometry: dict, parcels: Iterable[Parcel]) -> Match:
    """La parcela que cubre la mayor parte del sitio, y cuánto cubre."""
    parcels = list(parcels)
    points = sample_points(geometry)
    hits: Counter = Counter()
    for x, y in points:
        for parcel in parcels:
            min_x, min_y, max_x, max_y = parcel.bbox
            if min_x <= x <= max_x and min_y <= y <= max_y and contains(parcel.geometry, x, y):
                hits[parcel.attrs] += 1
                break
    if not hits:
        return Match(attrs=None, share=0.0, covered=0.0)
    attrs, count = hits.most_common(1)[0]
    return Match(attrs=attrs, share=count / len(points), covered=sum(hits.values()) / len(points))


# ── Cruce con los sitios ────────────────────────────────────────────────


def site_attributes(
    sites: Iterable[tuple[str, dict]],
    *,
    sectors: list[Parcel],
    zones: list[Parcel],
    zones_alt: list[Parcel] | None = None,
) -> dict[str, dict]:
    """Lo que el POT dice de cada sitio, con las claves que lee la viabilidad.

    Las claves están siempre, y `None` significa "se consultó la capa y el
    sitio cae fuera". Es distinto de no tener la clave, que significa que la
    capa no se consultó: la viabilidad dice cosas distintas en cada caso.

    El municipio sale de la microzonificación que cubre el sitio, porque es la
    única familia de capas que el AMCO publica para los dos.
    """
    out: dict[str, dict] = {}
    for site_id, geometry in sites:
        sector = match_site(geometry, sectors)
        zone = match_site(geometry, zones)
        alt = match_site(geometry, zones_alt).attrs if zones_alt else None
        out[site_id] = {
            "pot_municipio": zone.attrs.municipio if isinstance(zone.attrs, SeismicZone) else None,
            "pot_sector": (
                {
                    "sector": sector.attrs.sector,
                    "tratamiento": sector.attrs.tratamiento,
                    "subtratamiento": sector.attrs.subtratamiento,
                    "actividad": sector.attrs.actividad,
                    "cobertura": round(sector.share, 2),
                }
                if isinstance(sector.attrs, NormativeSector)
                else None
            ),
            "pot_zona_sismica": (
                {
                    "municipio": zone.attrs.municipio,
                    "zona": zone.attrs.zona,
                    "leyenda": zone.attrs.leyenda,
                    "cobertura": round(zone.share, 2),
                    "zona_alterna": alt.zona if isinstance(alt, SeismicZone) else None,
                }
                if isinstance(zone.attrs, SeismicZone)
                else None
            ),
        }
    return out
