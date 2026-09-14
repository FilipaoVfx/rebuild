"""Evaluacion de restricciones.

FR-CONS-01: las restricciones duras se evaluan ANTES de cualquier ranking, y
no son expresables como peso. La separacion es estructural: `evaluate_constraints`
devuelve el conjunto de candidatos, y el modulo de scoring recibe ese conjunto.
Un sitio excluido no esta en la estructura de datos sobre la que opera el
scoring, asi que un score alto no puede resucitarlo.

FR-CONS-03: el conjunto de restricciones es configuracion versionada. Un
escenario creado bajo v1 sigue reproduciendo v1 cuando se publique v2.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from uri.contracts import InterventionType


@dataclass(frozen=True)
class Exclusion:
    constraint_id: str
    reason: str
    is_prohibited_risk: bool = False


@dataclass(frozen=True)
class Penalty:
    constraint_id: str
    magnitude: float
    reason: str


@dataclass(frozen=True)
class ConstraintSet:
    version: str
    min_site_area_m2: float
    max_risk_score: float
    prohibited_risk_threshold: float
    min_land_use_compatibility: float
    soft: dict[str, float] = field(default_factory=dict)


#: Conjunto v1. Los umbrales son configuracion, no constantes de codigo:
#: cambiarlos es publicar una version nueva del conjunto.
CONSTRAINT_SET_V1 = ConstraintSet(
    version="constraints_v1",
    min_site_area_m2=300.0,
    max_risk_score=0.75,
    prohibited_risk_threshold=0.75,
    min_land_use_compatibility=0.35,
    soft={
        "moderate_risk": 0.30,
        "low_land_use_compatibility": 0.20,
        "low_confidence": 0.25,
    },
)


def evaluate_constraints(
    features: dict, constraint_set: ConstraintSet = CONSTRAINT_SET_V1
) -> list[Exclusion]:
    """Devuelve TODAS las restricciones violadas, no la primera (FR-CONS-02).

    Un sitio que falla por area y por uso de suelo tiene dos problemas. Si el
    sistema solo reporta el primero, alguien resuelve el area y vuelve a
    encontrarse excluido sin saber por que.
    """
    exclusions: list[Exclusion] = []

    area = float(features.get("site_area") or 0)
    if area < constraint_set.min_site_area_m2:
        exclusions.append(
            Exclusion(
                constraint_id="min_site_area",
                reason=(
                    f"Area {area:.0f} m2 por debajo del minimo "
                    f"{constraint_set.min_site_area_m2:.0f} m2"
                ),
            )
        )

    risk = float(features.get("risk_score") or 0)
    if risk >= constraint_set.prohibited_risk_threshold:
        exclusions.append(
            Exclusion(
                constraint_id="prohibited_risk",
                reason=f"Riesgo {risk:.2f} en o por encima del umbral prohibido "
                f"{constraint_set.prohibited_risk_threshold:.2f}",
                # FR-LIFE-03 — esta marca es la que impide que un override
                # manual devuelva el sitio al ranking.
                is_prohibited_risk=True,
            )
        )

    compatibility = float(features.get("land_use_compatibility") or 0)
    if compatibility < constraint_set.min_land_use_compatibility:
        exclusions.append(
            Exclusion(
                constraint_id="land_use_incompatible",
                reason=(
                    f"Compatibilidad de uso de suelo {compatibility:.2f} por debajo de "
                    f"{constraint_set.min_land_use_compatibility:.2f}"
                ),
            )
        )

    return exclusions


def evaluate_penalties(
    features: dict, constraint_set: ConstraintSet = CONSTRAINT_SET_V1
) -> list[Penalty]:
    """FR-CONS-04 — las restricciones blandas restan puntos de forma visible
    y cuantificada, no reordenan resultados en silencio."""
    penalties: list[Penalty] = []

    risk = float(features.get("risk_score") or 0)
    if 0.4 <= risk < constraint_set.prohibited_risk_threshold:
        magnitude = constraint_set.soft["moderate_risk"] * (risk - 0.4) / 0.35
        penalties.append(Penalty("moderate_risk", magnitude, f"Riesgo moderado ({risk:.2f})"))

    compatibility = float(features.get("land_use_compatibility") or 0)
    if compatibility < 0.6:
        magnitude = constraint_set.soft["low_land_use_compatibility"] * (0.6 - compatibility) / 0.6
        penalties.append(
            Penalty(
                "low_land_use_compatibility",
                magnitude,
                f"Compatibilidad de uso de suelo baja ({compatibility:.2f})",
            )
        )

    confidence = float(features.get("confidence") or 0.5)
    if confidence < 0.5:
        magnitude = constraint_set.soft["low_confidence"] * (0.5 - confidence) / 0.5
        penalties.append(Penalty("low_confidence", magnitude, f"Confianza baja ({confidence:.2f})"))

    return penalties


def applicable_interventions(features: dict, catalog: dict) -> list[InterventionType]:
    """Que intervenciones caben en este sitio.

    `NO_BUILD` siempre es aplicable: sin ella el sistema estaria obligado a
    recomendar construir algo en todas partes, que es justo lo que un sitio
    en riesgo no necesita.
    """
    area = float(features.get("site_area") or 0)
    risk = float(features.get("risk_score") or 0)

    out: list[InterventionType] = []
    for intervention_type, spec in catalog.items():
        if intervention_type is InterventionType.NO_BUILD:
            out.append(intervention_type)
            continue
        if area >= spec["minimum_area_m2"] and risk <= spec["max_risk_score"]:
            out.append(intervention_type)
    return out
