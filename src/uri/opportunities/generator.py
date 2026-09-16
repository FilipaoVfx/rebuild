"""Genera oportunidades de recuperación a partir de features y evidencia.

Desacopla la UI de las tablas originales: una vista consume oportunidades y no
necesita saber que la población viene de manzanas del DANE, el daño de
Copernicus EMS y la red peatonal de OSM.

El titular del problema se **compone** de los factores que dominan el score en
ESE sitio, no de una plantilla. Si en uno manda la población y en otro el
déficit, los dos textos dicen cosas distintas — que es lo que distingue una
explicación de un relleno.
"""

from __future__ import annotations

from uri.contracts.enums import InterventionType
from uri.contracts.opportunity import (
    EvidenceSummary,
    ImpactEstimate,
    ProblemStatement,
    RecoveryOpportunity,
)
from uri.opportunities import feasibility
from uri.scoring.model import INTERVENTION_CATALOG, score_pair

#: Cómo se lee cada factor en el titular del problema. La frase describe el
#: PROBLEMA, no la feature: "alta concentración de población" y no
#: "population_10min alto".
FACTOR_PHRASE = {
    "need": "alta concentración de población",
    "deficit": "déficit de espacio público",
    "vulnerability": "vulnerabilidad social elevada",
    "accessibility": "buena conectividad peatonal",
    "facility_gap": "escasez de equipamientos cercanos",
}

FACTOR_LABEL = {
    "need": "Población alcanzable",
    "deficit": "Déficit de espacio público",
    "vulnerability": "Vulnerabilidad social",
    "accessibility": "Accesibilidad peatonal",
    "facility_gap": "Brecha de equipamientos",
}

#: Un factor entra al titular si aporta al menos esta fracción del score base.
#: Por debajo es ruido: nombrar cinco factores para todos los sitios es no
#: nombrar ninguno.
DRIVER_SHARE = 0.15


def _problem(features: dict, explanation) -> ProblemStatement:
    base = explanation.base_score or 0.0
    dominantes = [
        c for c in explanation.contributions if base > 0 and c.contribution / base >= DRIVER_SHARE
    ]
    dominantes.sort(key=lambda c: c.contribution, reverse=True)

    frases = [FACTOR_PHRASE[c.factor] for c in dominantes[:3] if c.factor in FACTOR_PHRASE]
    if not frases:
        titular = "Sitio con daño documentado y sin factor dominante en el modelo."
    elif len(frases) == 1:
        titular = f"Zona con {frases[0]}."
    else:
        titular = f"Zona con {', '.join(frases[:-1])} y {frases[-1]}."

    # Lo que el modelo NO pudo mirar aquí va junto al titular, no en una nota
    # al pie: cambia cuánto se le puede creer.
    ausentes = [
        FACTOR_LABEL[f]
        for f, col in (
            ("vulnerability", "social_vulnerability"),
            ("deficit", "park_deficit"),
            ("accessibility", "pedestrian_accessibility"),
        )
        if features.get(col) is None
    ]
    return ProblemStatement(
        headline=titular,
        drivers=[FACTOR_LABEL[c.factor] for c in dominantes if c.factor in FACTOR_LABEL],
        missing_factors=ausentes,
    )


def _impact(features: dict, intervention: InterventionType, cost: float) -> ImpactEstimate:
    poblacion = int(float(features.get("population_10min") or 0))
    area = float(features.get("site_area_m2") or 0)
    deficit = features.get("park_deficit")

    # Personas por millón de COP: la comparación honesta entre alternativas de
    # tamaño distinto. Un parque grande que alcanza a poca gente y uno pequeño
    # que alcanza a mucha no se distinguen mirando solo el coste.
    por_millon = round(poblacion / (cost / 1e6), 2) if cost > 0 and poblacion else None

    return ImpactEstimate(
        population_reached=poblacion,
        # La reducción del déficit se acota al propio déficit: una
        # intervención no puede reducir más de lo que hay.
        deficit_reduction=(
            round(min(float(deficit), area / max(poblacion, 1)), 4)
            if deficit is not None and poblacion
            else None
        ),
        area_m2=round(area, 1),
        people_per_million_cop=por_millon,
    )


def _confidence(features: dict, evidence: EvidenceSummary) -> float:
    """Cuánto se le puede creer a esta oportunidad.

    Dos términos, los dos medibles: cuánta evidencia de daño la sostiene y
    cuántos factores del modelo tienen dato en este sitio. Un sitio con una
    sola observación y tres features nulas no merece la misma confianza que
    uno con ocho observaciones y el vector completo.
    """
    columnas = (
        "population_10min",
        "park_deficit",
        "social_vulnerability",
        "pedestrian_accessibility",
        "building_density",
    )
    cobertura = sum(1 for c in columnas if features.get(c) is not None) / len(columnas)
    respaldo = min(1.0, evidence.damage_observations / 5.0)
    return round(0.6 * cobertura + 0.4 * respaldo, 4)


def build_opportunity(
    *,
    site_id: str,
    features: dict,
    evidence: EvidenceSummary,
    intervention: InterventionType,
    zone: str | None = None,
    weights: dict[str, float] | None = None,
    provenance: dict | None = None,
) -> RecoveryOpportunity:
    """Compone una oportunidad para un par (sitio, intervención)."""
    spec = INTERVENTION_CATALOG[intervention]
    recomendacion = score_pair(features, intervention, weights=weights)

    area = float(features.get("site_area_m2") or 0)
    coste = round(area * float(spec["unit_cost_per_m2"]), 2)

    return RecoveryOpportunity(
        opportunity_id=f"opp_{site_id.removeprefix('site_')}_{intervention.value.lower()}",
        site_id=site_id,
        zone=zone,
        problem=_problem(features, recomendacion.explanation),
        evidence=evidence,
        intervention=intervention,
        intervention_label=spec["display_name"],
        impact=_impact(features, intervention, coste),
        feasibility=feasibility.assess(features, intervention),
        cost_cop=coste,
        suitability=recomendacion.explanation.final_score,
        confidence=_confidence(features, evidence),
        provenance=provenance or {},
    )


def generate_opportunities(
    sitios: list[dict],
    *,
    weights: dict[str, float] | None = None,
) -> list[RecoveryOpportunity]:
    """Una oportunidad por sitio, con la intervención que mejor puntúa.

    Se elige la mejor intervención y no se emiten las cinco: el requerimiento
    pide pocas decisiones comprensibles a partir de muchos datos, y cinco
    oportunidades por sitio sobre 115 sitios son 575 filas que vuelven a ser
    un visor GIS con otro nombre.

    Las alternativas no se pierden: el score de cada par se sigue calculando y
    la vista técnica puede pedirlo.
    """
    oportunidades = []
    for sitio in sitios:
        features = sitio["features"]
        evidencia = sitio["evidence"]
        candidatas = [
            build_opportunity(
                site_id=sitio["site_id"],
                features=features,
                evidence=evidencia,
                intervention=tipo,
                zone=sitio.get("zone"),
                weights=weights,
                provenance=sitio.get("provenance", {}),
            )
            for tipo in INTERVENTION_CATALOG
        ]
        # Una intervención bloqueada no puede ser la recomendada. Si todas lo
        # están, se emite la mejor igualmente con su bloqueo a la vista: el
        # sitio existe y ocultarlo sería esconder el problema.
        viables = [o for o in candidatas if not o.blocked]
        mejor = max(viables or candidatas, key=lambda o: o.suitability)
        oportunidades.append(mejor)
    return oportunidades
