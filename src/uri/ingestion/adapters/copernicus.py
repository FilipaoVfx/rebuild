"""Adaptador de Copernicus EMS — activación EMSR916, AOI 02 (Pereira).

Esta es la capa de daño **real y publicable**. Reemplaza tanto la evidencia de
ICube-SERTIT, que no permite redistribución, como el generador sintético.

Licencia verificada el 2026-09-15 abriendo el paquete de entrega, que es lo que
`fuentes.md` §10 exige y no se había hecho:

- La activación declara `sensitive: false`, y el servicio establece que «except
  for sensitive activations, all mapping products are available online on a
  full, free and open basis».
- Los metadatos del producto no imponen restricción: su única `useLimitation`
  remite al aviso de copyright del servicio.
- La documentación de producto (JRC121741) se publica bajo CC BY 4.0.
- Activada por EC Services | DG ECHO.

Atribución obligatoria: © European Union, Copernicus Emergency Management
Service (EMSR916).
"""

from __future__ import annotations

import gzip
import json
from datetime import date
from pathlib import Path

from uri.contracts import DamageClass, DamageEvidence, EvidenceMethod
from uri.contracts.evidence import assert_no_prohibited_fields

#: Crosswalk del vocabulario de grading de CEMS al vocabulario normalizado.
DAMAGE_GRADE: dict[str, DamageClass] = {
    "destroyed": DamageClass.DESTROYED,
    "damaged": DamageClass.DAMAGED,
    "possibly damaged": DamageClass.POSSIBLY_DAMAGED,
    "negligible to slight damage": DamageClass.NO_DAMAGE,
    "not applicable": DamageClass.NO_DAMAGE,
}

#: Confianza por clase. La foto-interpretación sobre Pléiades identifica un
#: colapso total con mucha más seguridad que un daño parcial, y el dato no
#: viene con una confianza declarada: se deriva de la clase y se documenta.
GRADE_CONFIDENCE: dict[DamageClass, float] = {
    DamageClass.DESTROYED: 0.80,
    DamageClass.DAMAGED: 0.70,
    DamageClass.POSSIBLY_DAMAGED: 0.45,
    DamageClass.NO_DAMAGE: 0.60,
}

#: Precisión posicional de foto-interpretación sobre Pléiades VHR1.
PLEIADES_ACCURACY_M = 5.0

#: Fecha de adquisición de la imagen del producto AOI02.
OBSERVATION_DATE = date(2026, 8, 11)
DELIVERY_DATE = date(2026, 8, 12)


class UnknownDamageGrade(ValueError):
    """Una clase fuera del crosswalk detiene el lote (FR-DC-01).

    Mapearla a un valor por defecto seria inventar una observacion.
    """


def _load(path: Path) -> dict:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def load_damage(path: Path) -> list[DamageEvidence]:
    """Puntos de edificación clasificados por daño."""
    features = _load(path)["damage"]["features"]
    if not features:
        return []

    assert_no_prohibited_fields(
        list(features[0]["properties"]),
        source="copernicus_ems",
        # `name` en el esquema CEMS nombra un hito o edificio singular, no a
        # una persona. Revisado el 2026-09-15: vale 'Unknown' en los 182
        # registros. El adaptador no lo consume ni lo escribe.
        reviewed={"name": "marcador del esquema CEMS, 'Unknown' en todos los registros"},
    )

    out: list[DamageEvidence] = []
    for feature in features:
        props = feature["properties"]
        label = str(props.get("damage_gra") or "").strip()
        damage = DAMAGE_GRADE.get(label.lower())
        if damage is None:
            raise UnknownDamageGrade(f"copernicus_ems: grado de daño desconocido {label!r}")

        lon, lat = feature["geometry"]["coordinates"][:2]
        out.append(
            DamageEvidence(
                source="copernicus_ems",
                original_source="copernicus_ems",
                geometry_wkt=f"POINT({lon} {lat})",
                positional_accuracy_m=PLEIADES_ACCURACY_M,
                observation_date=OBSERVATION_DATE,
                acquisition_date=DELIVERY_DATE,
                damage_class=damage,
                raw_damage_label=label,
                building_type=props.get("obj_type"),
                method=EvidenceMethod.REMOTE_SENSING,
                # El producto no declara validación de campo. Asumirla sería
                # exactamente el tipo de afirmación que este sistema evita.
                field_validated=False,
                confidence=GRADE_CONFIDENCE[damage],
                is_synthetic=False,
                notes=f"EMSR916/AOI02 · {props.get('det_method') or 'grading'}",
            )
        )
    return out


def load_aoi_wkt(path: Path) -> str:
    """Polígono del área de interés del producto.

    Sustituye al bbox arbitrario que se venía usando: el alcance del análisis
    pasa a ser el que el proveedor de la evidencia declaró haber observado, no
    uno inventado por nosotros.
    """
    feature = _load(path)["aoi"]["features"][0]
    ring = feature["geometry"]["coordinates"][0]
    if feature["geometry"]["type"] == "MultiPolygon":
        ring = feature["geometry"]["coordinates"][0][0]
    inner = ", ".join(f"{lon} {lat}" for lon, lat, *_ in ring)
    return f"POLYGON(({inner}))"


def aoi_bbox(path: Path) -> tuple[float, float, float, float]:
    feature = _load(path)["aoi"]["features"][0]
    coords = feature["geometry"]["coordinates"]
    ring = coords[0][0] if feature["geometry"]["type"] == "MultiPolygon" else coords[0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lons), min(lats), max(lons), max(lats)


def load_damaged_roads(path: Path) -> list[tuple[str, str]]:
    """Tramos viales con su estado. `(wkt, estado)`."""
    out: list[tuple[str, str]] = []
    for feature in _load(path)["roads"]["features"]:
        geometry = feature["geometry"]
        if geometry["type"] != "LineString":
            continue
        inner = ", ".join(f"{lon} {lat}" for lon, lat, *_ in geometry["coordinates"])
        state = str(feature["properties"].get("damage_gra") or "Not Applicable")
        out.append((f"LINESTRING({inner})", state))
    return out
