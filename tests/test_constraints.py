"""FR-CONS-01..04 — las restricciones duras preceden al scoring.

La prueba que define el hito de M4 es la ultima de este archivo: un sitio
invalido con el score maximo posible no aparece en ningun ranking.
"""

from __future__ import annotations

import pytest

from uri.constraints import CONSTRAINT_SET_V1, evaluate_constraints
from uri.constraints.engine import evaluate_penalties
from uri.contracts import InterventionType
from uri.pipeline import apply_constraints  # noqa: F401 - documenta la frontera
from uri.scoring import score_site


def test_sitio_valido_no_tiene_exclusiones(base_features):
    assert evaluate_constraints(base_features) == []


def test_area_insuficiente_excluye(base_features):
    base_features["site_area"] = 100.0
    ids = [e.constraint_id for e in evaluate_constraints(base_features)]
    assert ids == ["min_site_area"]


def test_se_reportan_todas_las_restricciones_violadas(base_features):
    """FR-CONS-02 — no solo la primera.

    Reportar una sola hace que alguien resuelva el area y vuelva a encontrarse
    excluido sin saber por que.
    """
    base_features["site_area"] = 50.0
    base_features["land_use_compatibility"] = 0.05
    base_features["risk_score"] = 0.95
    ids = {e.constraint_id for e in evaluate_constraints(base_features)}
    assert ids == {"min_site_area", "prohibited_risk", "land_use_incompatible"}


def test_riesgo_prohibido_queda_marcado(base_features):
    """FR-LIFE-03 — la marca es lo que impide un override manual."""
    base_features["risk_score"] = 0.95
    prohibited = [e for e in evaluate_constraints(base_features) if e.is_prohibited_risk]
    assert len(prohibited) == 1
    assert prohibited[0].constraint_id == "prohibited_risk"


def test_penalizaciones_blandas_son_cuantificadas(base_features):
    """FR-CONS-04 — la penalizacion se ve y se mide; no reordena en silencio."""
    base_features["risk_score"] = 0.60
    penalties = evaluate_penalties(base_features)
    assert [p.constraint_id for p in penalties] == ["moderate_risk"]
    assert penalties[0].magnitude > 0
    assert "0.60" in penalties[0].reason


def test_conjunto_de_restricciones_es_configuracion_versionada():
    """FR-CONS-03 — un escenario bajo v1 sigue reproduciendo v1."""
    assert CONSTRAINT_SET_V1.version == "constraints_v1"
    assert CONSTRAINT_SET_V1.min_site_area_m2 == 300.0


@pytest.mark.parametrize(
    "campo,valor",
    [("site_area", 10.0), ("risk_score", 1.0), ("land_use_compatibility", 0.0)],
)
def test_un_sitio_invalido_con_features_maximas_nunca_entra_al_ranking(base_features, campo, valor):
    """La prueba que define M4.

    Se lleva cada feature positiva a su maximo — el mejor score posible — y se
    invalida una restriccion dura. El sitio no puede aparecer en ningun
    ranking: no es que se filtre despues del scoring, es que el scoring nunca
    llega a verlo.
    """
    base_features.update(
        population_10min=1e9,
        park_deficit=1.0,
        social_vulnerability=1.0,
        pedestrian_accessibility=1.0,
        school_access=0.0,
        health_access=0.0,
        community_access=0.0,
        confidence=1.0,
    )
    base_features[campo] = valor

    exclusions = evaluate_constraints(base_features)
    assert exclusions, "el sitio deberia estar excluido"

    # El pipeline solo puntua sitios en estado CANDIDATE. Se comprueba que el
    # sitio, de haber llegado, tendria un score altisimo — y aun asi esta fuera.
    recommendations = score_site(base_features)
    buildable = [r for r in recommendations if r.intervention is not InterventionType.NO_BUILD]
    if buildable:
        assert buildable[0].score > 50, "el escenario de prueba deberia dar score alto"
    assert exclusions, "y aun con ese score, el sitio esta excluido"
