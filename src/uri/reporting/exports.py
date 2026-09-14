"""Exportes autocontenidos.

FR-EXP-04: un export tiene que seguir siendo interpretable dentro de un año,
sin acceso a la plataforma. Eso significa que la procedencia, las versiones,
el estado sintetico y la atribucion viajan DENTRO del archivo, no en un
correo adjunto que se pierde.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime

from uri.contracts import Provenance


class ExportBlocked(RuntimeError):
    """Control C3 — el perfil de export no admite alguna fuente contribuyente."""


def attribution_block(sources: list[dict]) -> list[str]:
    """FR-LIC-01 — la atribucion se compone desde el registro, no desde una
    plantilla escrita a mano que se desincroniza."""
    lines = []
    for source in sources:
        text = source.get("attribution_text") or source["source_id"]
        license_name = source.get("license_name")
        lines.append(f"{text} ({license_name})" if license_name else text)
    return lines


def _header(provenance: Provenance, attribution: list[str], scenario: dict) -> dict:
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "scenario_id": scenario["scenario_id"],
        "scenario_name": scenario["display_name"],
        "data_version": provenance.data_version,
        "feature_version": provenance.feature_version,
        "constraint_set_version": provenance.constraint_set_version,
        "scoring_version": provenance.scoring_version,
        "is_synthetic": provenance.is_synthetic,
        "synthetic_layers": provenance.synthetic_layers,
        "advisory_notice": (
            "Salida consultiva. El sistema no emite decisiones vinculantes ni "
            "sustituye inspeccion estructural, licencias ni el POT."
        ),
        "attribution": attribution,
    }


def scenario_to_geojson(
    scenario: dict, items: list[dict], provenance: Provenance, attribution: list[str]
) -> str:
    features = [
        {
            "type": "Feature",
            "geometry": json.loads(item["geojson"]),
            "properties": {
                "site_id": item["site_id"],
                "rank": item["rank"],
                "intervention": item["intervention_type"],
                "score": float(item["score"]),
                "cost_cop": float(item["cost_cop"]),
                "cost_is_estimated": True,
                "marginal_population": float(item["marginal_population"]),
                "redundancy_ratio": float(item["redundancy_ratio"]),
                "area_m2": float(item["area_m2"]),
                # FR-SYN-04 — la marca sintetica sobrevive en cada feature,
                # no solo en la cabecera del archivo.
                "is_synthetic": provenance.is_synthetic,
            },
        }
        for item in items
    ]
    return json.dumps(
        {
            "type": "FeatureCollection",
            "metadata": _header(provenance, attribution, scenario),
            "features": features,
        },
        ensure_ascii=False,
        indent=2,
    )


def scenario_to_csv(
    scenario: dict, items: list[dict], provenance: Provenance, attribution: list[str]
) -> str:
    buffer = io.StringIO()
    header = _header(provenance, attribution, scenario)

    # Las lineas de cabecera comentadas mantienen el archivo interpretable
    # cuando alguien lo abre en una hoja de calculo tres meses despues.
    for key, value in header.items():
        if key == "attribution":
            continue
        buffer.write(f"# {key}: {value}\n")
    for line in attribution:
        buffer.write(f"# attribution: {line}\n")
    if provenance.is_synthetic:
        buffer.write("# AVISO: capas simuladas — no usar como evidencia de daño real\n")

    writer = csv.writer(buffer)
    writer.writerow(
        [
            "rank",
            "site_id",
            "intervention",
            "score",
            "cost_cop",
            "marginal_population",
            "redundancy_ratio",
            "area_m2",
            "is_synthetic",
        ]
    )
    for item in items:
        writer.writerow(
            [
                item["rank"],
                item["site_id"],
                item["intervention_type"],
                item["score"],
                item["cost_cop"],
                item["marginal_population"],
                item["redundancy_ratio"],
                item["area_m2"],
                provenance.is_synthetic,
            ]
        )
    return buffer.getvalue()
