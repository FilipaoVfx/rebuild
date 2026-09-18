"""Adaptador del SIG de la Alcaldía de Pereira (ArcGIS Online, org Zdpg0E6lri7EggIc).

Solo entran los items que DECLARAN licencia en su ficha: equipamientos y
espacio publico, ambos con el texto de datos abiertos de la Ley 1712 de 2014
(db/terms/pereira_sig_20260918.txt). La misma org publica comunas, barrios,
nomenclatura y una ortofoto sin una sola frase de terminos, y esos no pasan
por aqui.

La descarga es manual (`scripts/fetch_pereira_sig.py`) y el extracto se
archiva en `db/seed/`: el pipeline y CI leen el archivo, nunca el servicio.
"""

from __future__ import annotations

import gzip
import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from uri.contracts.evidence import assert_no_prohibited_fields

SOURCE_ID = "pereira_sig"

BASE = "https://services3.arcgis.com/Zdpg0E6lri7EggIc/arcgis/rest/services"


#: Un item por capa: URL de la capa, campos que se piden y mapeo a columnas
#: propias. Se piden SOLO los campos que se usan. `Espacio Público actual`
#: trae `DIRECCION`: no se pide, no se archiva, no se mira. Es la direccion
#: de un parque y no de una persona, pero FR-PII-01 es lexico a proposito y
#: una excepcion "porque este caso es inocuo" es como empiezan todas.
@dataclass(frozen=True)
class SigLayer:
    key: str
    item_id: str
    url: str
    out_fields: tuple[str, ...]
    #: campo crudo -> columna propia. `NOMBRE` tokeniza a `nombre`, que el
    #: diccionario prohibe: el mapeo va ANTES del control, y el control corre
    #: sobre las columnas mapeadas.
    mapping: dict[str, str]
    seed: str


LAYERS: tuple[SigLayer, ...] = (
    SigLayer(
        key="facilities",
        item_id="3e6a1a40b02b43d8a4dff55791cf2cd6",
        url=f"{BASE}/Equipamientos_actual/FeatureServer/0",
        out_fields=("FID", "NOMBRE", "TIPO", "Fuente", "Area"),
        mapping={
            "FID": "source_ref",
            "NOMBRE": "display_name",
            "TIPO": "facility_type",
            "Fuente": "origin_note",
            "Area": "area_m2",
        },
        seed="pereira_sig_equipamientos.geojson.gz",
    ),
    SigLayer(
        key="public_space",
        item_id="4d058c2ef1814ad4b8bc2ed09b81b238",
        url=f"{BASE}/Espacio_P%C3%BAblico_actual/FeatureServer/0",
        out_fields=("FID", "NOMBRE", "TIPO_DE_ES", "Fuente", "Area"),
        mapping={
            "FID": "source_ref",
            "NOMBRE": "display_name",
            "TIPO_DE_ES": "space_type",
            "Fuente": "origin_note",
            "Area": "area_m2",
        },
        seed="pereira_sig_espacio_publico.geojson.gz",
    ),
)

LAYERS_BY_KEY = {layer.key: layer for layer in LAYERS}

PAGE_SIZE = 2000


@dataclass(frozen=True)
class MunicipalFeature:
    source_ref: str
    display_name: str | None
    kind: str | None
    origin_note: str | None
    area_m2: float | None
    geometry: dict


def fetch_layer(layer: SigLayer, *, timeout: int = 120) -> dict:
    """Descarga una capa completa en GeoJSON EPSG:4326, paginando.

    `maxRecordCount` es 2000 y las dos capas caben en una pagina, pero el
    servicio lo dice con `exceededTransferLimit` y se le hace caso: un
    extracto cortado a la mitad es peor que ninguno.
    """
    features: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": "1=1",
            "outFields": ",".join(layer.out_fields),
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": str(offset),
            "resultRecordCount": str(PAGE_SIZE),
        }
        url = f"{layer.url}/query?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=timeout) as response:
            page = json.loads(response.read().decode("utf-8"))
        if "error" in page:
            raise RuntimeError(f"{layer.key}: {page['error']}")
        features.extend(page.get("features") or [])
        if not page.get("properties", {}).get("exceededTransferLimit"):
            break
        offset += PAGE_SIZE
    return {
        "type": "FeatureCollection",
        "source_id": SOURCE_ID,
        "item_id": layer.item_id,
        "layer_url": layer.url,
        "request_parameters": {
            "where": "1=1",
            "outFields": list(layer.out_fields),
            "outSR": 4326,
            "f": "geojson",
        },
        "features": features,
    }


def load_layer(path: Path, layer: SigLayer) -> list[MunicipalFeature]:
    """Lee un extracto archivado y lo mapea a columnas propias.

    El control de PII corre sobre los nombres MAPEADOS: `NOMBRE` designa una
    institucion (un colegio, un hospital), y `display_name` es como este
    esquema nombra cosas que no son personas (migracion 004).
    """
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        collection = json.load(handle)

    kind_field = next(k for k, v in layer.mapping.items() if v not in _COMMON_COLUMNS)
    out: list[MunicipalFeature] = []
    columns: set[str] = set()
    for feature in collection.get("features") or []:
        props = feature.get("properties") or {}
        geometry = feature.get("geometry")
        if not geometry:
            continue
        mapped = {layer.mapping[k]: v for k, v in props.items() if k in layer.mapping}
        columns.update(mapped)
        area = mapped.get("area_m2")
        out.append(
            MunicipalFeature(
                source_ref=str(mapped.get("source_ref")),
                display_name=_clean(mapped.get("display_name")),
                kind=_clean(props.get(kind_field)),
                origin_note=_clean(mapped.get("origin_note")),
                area_m2=float(area) if area is not None else None,
                geometry=geometry,
            )
        )
    assert_no_prohibited_fields(sorted(columns), source=f"{SOURCE_ID}/{layer.key}")
    return out


_COMMON_COLUMNS = {"source_ref", "display_name", "origin_note", "area_m2"}


def _clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
