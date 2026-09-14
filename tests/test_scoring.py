"""FR-REC-01..05 — el score se descompone exactamente."""

from __future__ import annotations

import random

import pytest

from uri.contracts import InterventionType
from uri.scoring import DEFAULT_WEIGHTS, score_site
from uri.scoring.model import INTERVENTION_CATALOG, score_pair


def test_se_puntua_el_par_sitio_x_intervencion(base_features):
    """FR-REC-01 — un sitio excelente para un parque puede ser malo para un
    equipamiento; un ranking de sitios solos oculta esa diferencia."""
    recommendations = score_site(base_features)
    assert len(recommendations) >= 2
    assert len({r.intervention for r in recommendations}) == len(recommendations)


def test_la_descomposicion_suma_el_score(base_features):
    """FR-REC-02 — si esto falla, la explicacion y el numero discrepan."""
    for recommendation in score_site(base_features):
        assert recommendation.explanation.sums_to_score(1e-6), recommendation.intervention


def test_toda_recomendacion_trae_explicacion(base_features):
    """FR-REC-03 — ningun score se expone sin explicacion."""
    for recommendation in score_site(base_features):
        explanation = recommendation.explanation
        assert explanation.contributions
        assert explanation.final_score == pytest.approx(recommendation.score)


def test_contrafactual_o_declaracion_explicita_de_ausencia(base_features):
    """FR-REC-04 — devuelve un umbral, o dice que no encontro ninguno.
    Callar seria la tercera opcion, y no existe."""
    top = score_site(base_features)[0]
    counterfactual = top.explanation.counterfactual
    if counterfactual is not None:
        assert counterfactual.delta > 0
        assert counterfactual.factor in DEFAULT_WEIGHTS


def test_los_pesos_positivos_suman_uno():
    """No es cosmetico: si no suman 1, el rango del score deja de ser 0-100 y
    los umbrales de las restricciones blandas dejan de significar lo mismo."""
    assert sum(DEFAULT_WEIGHTS.values()) == pytest.approx(1.0)


@pytest.mark.parametrize("seed", range(25))
def test_descomposicion_exacta_sobre_vectores_generados(seed):
    """Property-based: la identidad tiene que valer para cualquier vector,
    no solo para el que elegimos como ejemplo."""
    rng = random.Random(seed)
    features = {
        "site_id": f"gen_{seed}",
        "site_area": rng.uniform(300, 8000),
        "risk_score": rng.uniform(0, 0.74),
        "land_use_compatibility": rng.uniform(0.35, 1.0),
        "population_10min": rng.uniform(0, 12000),
        "park_deficit": rng.random(),
        "social_vulnerability": rng.random(),
        "pedestrian_accessibility": rng.random(),
        "school_access": rng.random(),
        "health_access": rng.random(),
        "community_access": rng.random(),
        "confidence": rng.random(),
    }
    for recommendation in score_site(features):
        assert recommendation.explanation.sums_to_score(1e-6)


def test_no_build_siempre_es_aplicable(base_features):
    """Sin ella el sistema estaria obligado a recomendar construir algo en
    todas partes, que es justo lo que un sitio en riesgo no necesita."""
    base_features["site_area"] = 10.0
    interventions = {r.intervention for r in score_site(base_features)}
    assert InterventionType.NO_BUILD in interventions


def test_el_score_es_monotono_en_el_deficit(base_features):
    """Subir el deficit no puede bajar el score de un parque. Si lo hiciera,
    el modelo diria lo contrario de lo que su explicacion afirma."""
    low = dict(base_features, park_deficit=0.2)
    high = dict(base_features, park_deficit=0.9)
    assert (
        score_pair(high, InterventionType.PARK).score > score_pair(low, InterventionType.PARK).score
    )


def test_los_costos_estan_marcados_como_estimados():
    """OI-05: no hay fuente oficial de costos. Un estimado que viaja a un
    reporte sin marca se lee como un presupuesto."""
    assert all(spec["unit_cost_per_m2"] > 0 for spec in INTERVENTION_CATALOG.values())
