"""Adaptadores de evidencia de daño: SERTIT y UNOSAT.

Los dos proveedores usan vocabularios distintos, y UNOSAT usa dos etiquetas
para lo mismo dentro del mismo campo (`Damage` y `Damaged`). El crosswalk es
configuracion declarada aqui arriba, visible y revisable, no un `if` enterrado
en el bucle de parseo.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from uri.contracts import DamageClass, DamageEvidence, EvidenceMethod
from uri.contracts.evidence import assert_no_prohibited_fields

#: Crosswalk SERTIT -> vocabulario normalizado.
SERTIT_DAMAGE: dict[str, DamageClass] = {
    "destroyed": DamageClass.DESTROYED,
    "damaged": DamageClass.DAMAGED,
    "possibly damaged": DamageClass.POSSIBLY_DAMAGED,
    "not applicable": DamageClass.NO_DAMAGE,
}

#: Crosswalk UNOSAT. `damage` y `damaged` conviven en el mismo campo de
#: origen; nadie normaliza eso por accidente.
UNOSAT_DAMAGE: dict[str, DamageClass] = {
    "destroyed": DamageClass.DESTROYED,
    "damage": DamageClass.DAMAGED,
    "damaged": DamageClass.DAMAGED,
    "possible damage": DamageClass.POSSIBLY_DAMAGED,
    "possibly damaged": DamageClass.POSSIBLY_DAMAGED,
}

#: UNOSAT declara su confianza; SERTIT no, asi que se deriva de la clase.
UNOSAT_CONFIDENCE: dict[str, float] = {
    "high": 0.80,
    "medium": 0.60,
    "uncertain": 0.35,
    "to be evaluated": 0.30,
}

#: Precision posicional de foto-interpretacion sobre Pleiades. Es una
#: estimacion documentada, no una medicion: por eso viaja en el dato.
PLEIADES_ACCURACY_M = 5.0


class UnknownDamageLabel(ValueError):
    """Una etiqueta fuera del crosswalk detiene el lote (FR-DC-01).

    Mapearla a un valor por defecto seria inventar una observacion.
    """


def _parse_sertit_date(raw: str) -> date:
    # "2026/08/11 15:53 UTC"
    return datetime.strptime(raw.split(" ")[0], "%Y/%m/%d").date()


def _parse_unosat_date(raw: str) -> date:
    # "20260811"
    return datetime.strptime(raw, "%Y%m%d").date()


def _point_wkt(coords: list[float]) -> str:
    return f"POINT({coords[0]} {coords[1]})"


def _load_features(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)["features"]


def load_sertit(path: Path, *, municipality: str | None = None) -> list[DamageEvidence]:
    features = _load_features(path)
    if not features:
        return []

    assert_no_prohibited_fields(list(features[0]["properties"]), source="sertit")

    out: list[DamageEvidence] = []
    for feature in features:
        props = feature["properties"]
        if municipality and props.get("municipio") != municipality:
            continue

        label = str(props["dano"]).strip()
        damage = SERTIT_DAMAGE.get(label.lower())
        if damage is None:
            raise UnknownDamageLabel(f"sertit: etiqueta de daño desconocida {label!r}")

        observed = _parse_sertit_date(props["sensor_date"])
        out.append(
            DamageEvidence(
                source="monitor_terremoto",
                original_source="sertit",
                geometry_wkt=_point_wkt(feature["geometry"]["coordinates"]),
                positional_accuracy_m=PLEIADES_ACCURACY_M,
                observation_date=observed,
                acquisition_date=date(2026, 9, 12),
                damage_class=damage,
                raw_damage_label=label,
                building_type=props.get("tipo"),
                method=EvidenceMethod.REMOTE_SENSING,
                # Ninguno de los productos satelitales de este evento esta
                # validado en campo. Es la diferencia entre "el edificio esta
                # destruido" y "alguien interpreto una imagen del 11 de agosto".
                field_validated=False,
                confidence=0.70 if damage is DamageClass.DESTROYED else 0.60,
                is_synthetic=False,
                notes=props.get("copyright"),
            )
        )
    return out


def load_unosat(path: Path, *, municipality: str | None = None) -> list[DamageEvidence]:
    features = _load_features(path)
    if not features:
        return []

    assert_no_prohibited_fields(list(features[0]["properties"]), source="unosat")

    out: list[DamageEvidence] = []
    for feature in features:
        props = feature["properties"]
        if municipality and props.get("municipio") != municipality:
            continue

        label = str(props["dano"]).strip()
        damage = UNOSAT_DAMAGE.get(label.lower())
        if damage is None:
            raise UnknownDamageLabel(f"unosat: etiqueta de daño desconocida {label!r}")

        validated = "not yet" not in str(props.get("validacion_campo", "")).lower()
        out.append(
            DamageEvidence(
                source="monitor_terremoto",
                original_source="unosat",
                geometry_wkt=_point_wkt(feature["geometry"]["coordinates"]),
                positional_accuracy_m=PLEIADES_ACCURACY_M,
                observation_date=_parse_unosat_date(props["sensor_date"]),
                acquisition_date=date(2026, 9, 12),
                damage_class=damage,
                raw_damage_label=label,
                building_type=None,
                method=EvidenceMethod.REMOTE_SENSING,
                field_validated=validated,
                confidence=UNOSAT_CONFIDENCE.get(
                    str(props.get("confianza", "")).strip().lower(), 0.40
                ),
                is_synthetic=False,
                notes=props.get("event_code"),
            )
        )
    return out
