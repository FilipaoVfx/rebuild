"""Ortofotos de Pereira, con puerta (ADR-22 §6).

Dos productos, dos regimenes, un adaptador:

- `igac_ortofoto`: ortoimagen 1:1.000 del IGAC (WMS). CC BY 4.0 por la
  Res. 616/2020 SI la titularidad es del IGAC, y eso esta por confirmar.
- `pereira_ortofoto_post`: ortofoto municipal del 14-08-2026, cuatro dias
  despues del sismo (cache de teselas). Sin una frase de terminos.

Ninguna de las dos se publica mientras su fuente siga en UNCLEAR. El script
que las descarga (`scripts/fetch_ortofoto.py`) escribe en el sandbox, que no
se versiona, no se sirve y no se empaqueta; el visor muestra el control
deshabilitado con la razon. Cuando la fila del registro cambie, el mismo
script escribe en `data/ortofoto/<fuente>/` y todo lo demas sigue igual.

Consumo por pipeline, nunca desde el navegador (fuentes.md §11.1): el WMS y el
cache se piden tesela a tesela en XYZ/EPSG:3857 y se archivan con su indice.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from uri.contracts import LicenseClass
from uri.ingestion.registry import SOURCES_BY_ID

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data" / "ortofoto"
SANDBOX = DATA / ".sandbox"

#: Teselas por debajo de z14 no aportan sobre las huellas; por encima de z17
#: el AOI son miles de teselas y decenas de MB por fuente.
MIN_ZOOM = 14
MAX_ZOOM = 17
TILE_SIZE = 256

#: Esquema de teselas Web Mercator estandar. Si el servicio declara otro, el
#: script aborta en vez de deformar imagenes.
WEB_MERCATOR_WKIDS = {3857, 102100}
STANDARD_ORIGIN = (-20037508.342787, 20037508.342787)


@dataclass(frozen=True)
class OrtofotoSource:
    source_id: str
    display_name: str
    #: `wms`: GetMap por bbox de tesela; `tiles`: cache `tile/{z}/{y}/{x}`.
    mode: str
    url: str
    acquisition: str | None
    wms_layer: str | None = None


SOURCES: tuple[OrtofotoSource, ...] = (
    OrtofotoSource(
        source_id="igac_ortofoto",
        display_name="IGAC — Ortoimagen 1:1.000 de Pereira",
        mode="wms",
        url="https://mapas.igac.gov.co/image/services/orto/orto66001000pereira/ImageServer/WMSServer",
        acquisition=None,
        wms_layer="0",
    ),
    OrtofotoSource(
        source_id="pereira_ortofoto_post",
        display_name="Alcaldía de Pereira — Ortofoto post-sismo (14-08-2026)",
        mode="tiles",
        url="https://tiles.arcgis.com/tiles/Zdpg0E6lri7EggIc/arcgis/rest/services/mapaortofoto/MapServer",
        acquisition="2026-08-14",
    ),
)

SOURCES_BY_KEY = {s.source_id: s for s in SOURCES}


def is_publishable(source_id: str) -> bool:
    """Lo que la puerta de publicacion exige: clase distinta de UNCLEAR y
    redistribucion permitida. Las dos, no una."""
    source = SOURCES_BY_ID.get(source_id)
    return (
        source is not None
        and source.license_class is not LicenseClass.UNCLEAR
        and source.redistribution_allowed is True
    )


def output_dir(source_id: str) -> Path:
    """`data/ortofoto/<fuente>/` si se puede redistribuir; si no, el sandbox.

    El sandbox esta en .gitignore, la API no lo sirve y `build_static.py` no
    lo copia. Es la misma puerta que los exports, aplicada al disco.
    """
    if source_id not in SOURCES_BY_KEY:
        raise ValueError(f"{source_id}: no es una ortofoto registrada")
    return (DATA if is_publishable(source_id) else SANDBOX) / source_id


def tile_url(source: OrtofotoSource, z: int, x: int, y: int) -> str:
    if source.mode == "tiles":
        return f"{source.url}/tile/{z}/{y}/{x}"
    west, south, east, north = mercator_bounds(z, x, y)
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": source.wms_layer or "0",
        "STYLES": "",
        "CRS": "EPSG:3857",
        "BBOX": f"{west},{south},{east},{north}",
        "WIDTH": str(TILE_SIZE),
        "HEIGHT": str(TILE_SIZE),
        "FORMAT": "image/png",
        "TRANSPARENT": "TRUE",
    }
    return f"{source.url}?{urllib.parse.urlencode(params)}"


def mercator_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Esquinas de una tesela XYZ en metros Web Mercator."""
    size = 2 * 20037508.342787 / (2**z)
    west = -20037508.342787 + x * size
    north = 20037508.342787 - y * size
    return west, north - size, west + size, north


def check_tile_scheme(service_json: dict) -> None:
    """El cache de ArcGIS puede publicarse en cualquier proyeccion. Solo se
    acepta el esquema Web Mercator estandar: cualquier otro se deformaria al
    servirse como XYZ."""
    info = service_json.get("tileInfo") or {}
    sr = info.get("spatialReference") or {}
    wkid = sr.get("latestWkid") or sr.get("wkid")
    if wkid not in WEB_MERCATOR_WKIDS:
        raise ValueError(f"esquema de teselas en WKID {wkid}, no Web Mercator")
    if info.get("rows") != TILE_SIZE or info.get("cols") != TILE_SIZE:
        raise ValueError(f"teselas de {info.get('cols')}x{info.get('rows')}, no {TILE_SIZE}")
    origin = info.get("origin") or {}
    if (
        abs(float(origin.get("x", 0)) - STANDARD_ORIGIN[0]) > 1
        or abs(float(origin.get("y", 0)) - STANDARD_ORIGIN[1]) > 1
    ):
        raise ValueError("origen del cache distinto del estandar")


def image_format(payload: bytes) -> str:
    """`jpg` o `png` segun los bytes magicos; cualquier otra cosa es un error
    del servicio (una pagina HTML de mantenimiento, por ejemplo)."""
    if payload[:3] == b"\xff\xd8\xff":
        return "jpg"
    if payload[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    raise ValueError(f"la respuesta no es una imagen ({payload[:12]!r})")


def fetch_json(url: str, *, timeout: int = 60) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_bytes(url: str, *, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "uri-pipeline/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()
