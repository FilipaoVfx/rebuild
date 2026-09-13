"""Modelo de idoneidad: lineal ponderado, descomponible exactamente.

ADR-09: sin ML. No hay ground truth (PRD §22), y un modelo entrenado sobre
etiquetas inexistentes es circularidad con disfraz tecnico. La consecuencia
util es que las explicaciones son exactas y no aproximadas: las
contribuciones SUMAN el score, no lo estiman.

Nota sobre los pesos, que es lo mas importante de este archivo:
`DEFAULT_WEIGHTS` es politica urbana, no un hiperparametro. Decidir que la
vulnerabilidad pesa 0,20 y no 0,35 es una decision de politica publica de
reconstruccion. Estos valores son un marcador de posicion hasta que exista
un dueño institucional (D7), y NO deben ajustarse mirando resultados
calculados sobre capas sinteticas (antes-de-empezar.md §5).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from uri.constraints import ConstraintSet
from uri.constraints.engine import (
    CONSTRAINT_SET_V1,
    Penalty,
    applicable_interventions,
    evaluate_penalties,
)
from uri.contracts import InterventionType

SCORING_VERSION = "scoring_v1_weighted"

#: Pesos por defecto. Suman 1,0 en la parte positiva.
DEFAULT_WEIGHTS: dict[str, float] = {
    "need": 0.28,  # poblacion alcanzable a pie
    "deficit": 0.24,  # deficit de espacio publico
    "vulnerability": 0.20,  # vulnerabilidad social
    "accessibility": 0.16,  # conectividad peatonal
    "facility_gap": 0.12,  # ausencia de equipamientos cercanos
}

#: Techo de normalizacion de poblacion. Normalizar es una decision
#: versionada, porque determina que significa un peso (ADR-09).
POPULATION_NORMALISATION_CEILING = 6000.0

#: PRD §16 recortado a 6 (plan de MVP §1.4). Costos estimados: OI-05 sigue
#: abierto y no hay fuente oficial, asi que `cost_is_estimated` es true en
#: todos y el optimizador reporta sensibilidad al costo.
INTERVENTION_CATALOG: dict[InterventionType, dict] = {
    InterventionType.PARK: {
        "display_name": "Parque",
        "minimum_area_m2": 500.0,
        "preferred_area_m2": 1500.0,
        "service_radius_m": 800.0,
        "unit_cost_per_m2": 450_000.0,
        "max_risk_score": 0.6,
        "affinity": {
            "deficit": 1.0,
            "need": 1.0,
            "vulnerability": 0.9,
            "accessibility": 0.8,
            "facility_gap": 0.5,
        },
    },
    InterventionType.SPORTS: {
        "display_name": "Escenario deportivo",
        "minimum_area_m2": 800.0,
        "preferred_area_m2": 2500.0,
        "service_radius_m": 1000.0,
        "unit_cost_per_m2": 780_000.0,
        "max_risk_score": 0.5,
        "affinity": {
            "deficit": 0.8,
            "need": 0.9,
            "vulnerability": 1.0,
            "accessibility": 0.7,
            "facility_gap": 0.8,
        },
    },
    InterventionType.PUBLIC_SQUARE: {
        "display_name": "Plaza pública",
        "minimum_area_m2": 300.0,
        "preferred_area_m2": 900.0,
        "service_radius_m": 500.0,
        "unit_cost_per_m2": 620_000.0,
        "max_risk_score": 0.6,
        "affinity": {
            "deficit": 0.7,
            "need": 1.0,
            "vulnerability": 0.7,
            "accessibility": 1.0,
            "facility_gap": 0.4,
        },
    },
    InterventionType.COMMUNITY_FACILITY: {
        "display_name": "Equipamiento comunitario",
        "minimum_area_m2": 400.0,
        "preferred_area_m2": 1200.0,
        "service_radius_m": 900.0,
        "unit_cost_per_m2": 1_850_000.0,
        "max_risk_score": 0.4,
        "affinity": {
            "deficit": 0.5,
            "need": 0.9,
            "vulnerability": 1.0,
            "accessibility": 0.8,
            "facility_gap": 1.0,
        },
    },
    InterventionType.OPEN_SPACE: {
        "display_name": "Espacio abierto",
        "minimum_area_m2": 200.0,
        "preferred_area_m2": 600.0,
        "service_radius_m": 400.0,
        "unit_cost_per_m2": 180_000.0,
        "max_risk_score": 0.7,
        "affinity": {
            "deficit": 0.6,
            "need": 0.6,
            "vulnerability": 0.6,
            "accessibility": 0.6,
            "facility_gap": 0.3,
        },
    },
    InterventionType.NO_BUILD: {
        "display_name": "No construir",
        "minimum_area_m2": 0.0,
        "preferred_area_m2": 0.0,
        "service_radius_m": 0.0,
        "unit_cost_per_m2": 35_000.0,
        "max_risk_score": 1.0,
        "affinity": {
            "deficit": 0.0,
            "need": 0.0,
            "vulnerability": 0.0,
            "accessibility": 0.0,
            "facility_gap": 0.0,
        },
    },
}


@dataclass(frozen=True)
class Contribution:
    factor: str
    raw_value: float
    normalized: float
    weight: float
    affinity: float
    contribution: float


@dataclass(frozen=True)
class Counterfactual:
    factor: str
    current_value: float
    required_value: float
    delta: float
    note: str


@dataclass
class Explanation:
    """FR-REC-03 — ningun score se expone sin esto."""

    contributions: list[Contribution]
    penalties: list[Penalty]
    base_score: float
    penalty_total: float
    final_score: float
    counterfactual: Counterfactual | None
    drivers_positive: list[str] = field(default_factory=list)
    drivers_negative: list[str] = field(default_factory=list)

    def sums_to_score(self, tolerance: float = 1e-9) -> bool:
        """FR-REC-02 — la descomposicion suma el score. Si esto es falso, la
        explicacion y el numero discrepan, y la explicacion no sirve."""
        total = sum(c.contribution for c in self.contributions) - self.penalty_total
        return abs(max(0.0, total) - self.final_score) <= tolerance


@dataclass
class Recommendation:
    site_id: str
    intervention: InterventionType
    score: float
    cost_cop: float
    explanation: Explanation


def normalize(features: dict) -> dict[str, float]:
    """Normalizacion versionada.

    Determina que significa un peso, asi que cambiarla cambia el modelo
    aunque los pesos no se toquen.
    """
    population = float(features.get("population_10min") or 0)
    facility = (
        float(features.get("school_access") or 0)
        + float(features.get("health_access") or 0)
        + float(features.get("community_access") or 0)
    ) / 3.0
    return {
        "need": min(1.0, population / POPULATION_NORMALISATION_CEILING),
        "deficit": min(1.0, max(0.0, float(features.get("park_deficit") or 0))),
        "vulnerability": min(1.0, max(0.0, float(features.get("social_vulnerability") or 0))),
        "accessibility": min(1.0, max(0.0, float(features.get("pedestrian_accessibility") or 0))),
        # Es una brecha: a mas equipamiento cercano, menos aporta uno nuevo.
        "facility_gap": min(1.0, max(0.0, 1.0 - facility)),
    }


def _raw_value(features: dict, factor: str) -> float:
    return {
        "need": float(features.get("population_10min") or 0),
        "deficit": float(features.get("park_deficit") or 0),
        "vulnerability": float(features.get("social_vulnerability") or 0),
        "accessibility": float(features.get("pedestrian_accessibility") or 0),
        "facility_gap": 1.0
        - (
            float(features.get("school_access") or 0)
            + float(features.get("health_access") or 0)
            + float(features.get("community_access") or 0)
        )
        / 3.0,
    }[factor]


def score_pair(
    features: dict,
    intervention: InterventionType,
    *,
    weights: dict[str, float] | None = None,
    constraint_set: ConstraintSet = CONSTRAINT_SET_V1,
) -> Recommendation:
    """Puntua un par (sitio, intervencion). FR-REC-01: se puntua el par, no
    el sitio: un sitio excelente para un parque puede ser malo para un
    equipamiento, y un ranking de sitios solos oculta esa diferencia."""
    weights = weights or DEFAULT_WEIGHTS
    spec = INTERVENTION_CATALOG[intervention]
    normalized = normalize(features)

    contributions: list[Contribution] = []
    for factor, weight in weights.items():
        affinity = spec["affinity"][factor]
        value = normalized[factor]
        contributions.append(
            Contribution(
                factor=factor,
                raw_value=round(_raw_value(features, factor), 4),
                normalized=round(value, 4),
                weight=weight,
                affinity=affinity,
                contribution=round(value * weight * affinity * 100.0, 4),
            )
        )

    base = sum(c.contribution for c in contributions)
    penalties = evaluate_penalties(features, constraint_set)
    penalty_total = round(sum(p.magnitude for p in penalties) * 100.0, 4)
    final = round(max(0.0, base - penalty_total), 4)

    ordered = sorted(contributions, key=lambda c: c.contribution, reverse=True)
    explanation = Explanation(
        contributions=contributions,
        penalties=penalties,
        base_score=round(base, 4),
        penalty_total=penalty_total,
        final_score=final,
        counterfactual=None,
        drivers_positive=[c.factor for c in ordered if c.contribution > 0][:3],
        drivers_negative=[p.constraint_id for p in penalties],
    )

    area = float(features.get("site_area") or 0)
    cost = area * spec["unit_cost_per_m2"]
    return Recommendation(
        site_id=str(features.get("site_id", "")),
        intervention=intervention,
        score=final,
        cost_cop=round(cost, 2),
        explanation=explanation,
    )


def counterfactual(
    features: dict,
    winner: Recommendation,
    runner_up: Recommendation | None,
    *,
    weights: dict[str, float] | None = None,
) -> Counterfactual | None:
    """FR-REC-04 — el cambio minimo que altera la recomendacion.

    Convierte un ranking en una herramienta de analisis: no dice solo "parque",
    dice "parque, y dejaria de serlo si el deficit bajara de 0,64 a 0,41".
    Devuelve `None` explicitamente cuando no encuentra ninguno, en lugar de
    callar.
    """
    if runner_up is None:
        return None

    weights = weights or DEFAULT_WEIGHTS
    gap = winner.score - runner_up.score
    if gap <= 0:
        return None

    normalized = normalize(features)
    best: Counterfactual | None = None
    for factor, weight in weights.items():
        affinity_delta = (
            INTERVENTION_CATALOG[winner.intervention]["affinity"][factor]
            - INTERVENTION_CATALOG[runner_up.intervention]["affinity"][factor]
        )
        sensitivity = weight * affinity_delta * 100.0
        if sensitivity <= 1e-9:
            continue
        required = normalized[factor] - gap / sensitivity
        if required < 0:
            continue
        delta = normalized[factor] - required
        if best is None or delta < best.delta:
            best = Counterfactual(
                factor=factor,
                current_value=round(normalized[factor], 4),
                required_value=round(required, 4),
                delta=round(delta, 4),
                note=(
                    f"Si {factor} bajara a {required:.3f}, la recomendacion pasaria "
                    f"de {winner.intervention.value} a {runner_up.intervention.value}"
                ),
            )
    return best


def score_site(
    features: dict,
    *,
    weights: dict[str, float] | None = None,
    allowed: list[InterventionType] | None = None,
    constraint_set: ConstraintSet = CONSTRAINT_SET_V1,
) -> list[Recommendation]:
    """Todas las intervenciones aplicables, ordenadas, con explicacion."""
    candidates = applicable_interventions(features, INTERVENTION_CATALOG)
    if allowed is not None:
        candidates = [c for c in candidates if c in allowed]

    recommendations = [
        score_pair(features, intervention, weights=weights, constraint_set=constraint_set)
        for intervention in candidates
    ]
    recommendations.sort(key=lambda r: r.score, reverse=True)

    if recommendations:
        runner_up = recommendations[1] if len(recommendations) > 1 else None
        recommendations[0].explanation.counterfactual = counterfactual(
            features, recommendations[0], runner_up, weights=weights
        )
    return recommendations
