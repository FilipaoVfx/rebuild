"""El pipeline completo sobre los datos reales cargados.

Estas pruebas leen el estado que dejo `scripts/run_pipeline.py`. No lo
recalculan: comprueban invariantes del resultado, que es lo que un revisor
querria verificar sin volver a correr media hora de batch.
"""

from __future__ import annotations

import pytest

from uri import pipeline
from uri.db import fetch_all, fetch_one


@pytest.fixture
def loaded(db_conn):
    row = fetch_one(db_conn, "SELECT count(*) AS n FROM core.site")
    if not row or row["n"] == 0:
        pytest.skip("sin pipeline ejecutado: corra scripts/run_pipeline.py")
    return db_conn


def test_la_evidencia_de_punto_declara_su_precision(loaded):
    """D5 — admitir geometria de punto sin declarar precision seria leerla
    como una huella de edificacion, que no es."""
    row = fetch_one(
        loaded,
        "SELECT count(*) AS n FROM core.damage_evidence "
        "WHERE ST_GeometryType(geometry) = 'ST_Point' AND positional_accuracy_m IS NULL",
    )
    assert row["n"] == 0


def test_ningun_sitio_excluido_tiene_score(loaded):
    """FR-CONS-01, estructuralmente: el scoring solo ve candidatos."""
    rows = pipeline.candidate_features(loaded)
    assert rows
    assert all(row["state"] == "CANDIDATE" for row in rows)


def test_todo_sitio_excluido_registra_sus_motivos(loaded):
    """FR-CONS-02 — una exclusion sin motivo no se puede discutir."""
    row = fetch_one(
        loaded,
        """
        SELECT count(*) AS n FROM core.site s
        WHERE s.state = 'EXCLUDED'
          AND NOT EXISTS (SELECT 1 FROM analytics.site_exclusion x WHERE x.site_id = s.site_id)
        """,
    )
    assert row["n"] == 0


def test_la_fusion_de_evidencia_no_inventa_una_clase(loaded):
    """ADR-16 — la clase resultante es una de las observadas.

    Promediar "destruido" con "posiblemente dañado" produciria un valor que
    nadie observo.
    """
    rows = fetch_all(
        loaded,
        """
        SELECT f.site_id, f.damage_class::text AS fused,
               array_agg(DISTINCT e.damage_class::text) AS observed
        FROM core.site_damage_fusion f
        JOIN core.site_evidence se USING (site_id)
        JOIN core.damage_evidence e USING (evidence_id)
        GROUP BY f.site_id, f.damage_class
        """,
    )
    assert rows
    for row in rows:
        assert row["fused"] in row["observed"], row["site_id"]


def test_la_confianza_nunca_llega_a_uno(loaded):
    """Ninguna fuente de este evento esta validada en campo, y las capas de
    contexto son sinteticas. Una confianza de 1 seria una mentira comoda."""
    row = fetch_one(loaded, "SELECT max(confidence) AS m FROM analytics.site_feature")
    assert row["m"] < 1.0


def test_las_fuentes_dependientes_de_red_declaran_su_metodo(loaded):
    """FR-FEAT-03 — el fallback a buffer se marca, no se omite en silencio."""
    rows = fetch_all(
        loaded,
        "SELECT DISTINCT catchment_method::text AS m FROM analytics.site_feature",
    )
    methods = {row["m"] for row in rows}
    assert methods <= {"NETWORK", "BUFFER"}


def test_los_catchments_de_red_son_distintos_de_un_buffer(loaded):
    """Si el catchment de red coincidiera con un circulo, pgRouting no
    estaria aportando nada y ADR-02 no se sostendria."""
    row = fetch_one(
        loaded,
        """
        SELECT count(*) AS n
        FROM analytics.site_catchment
        WHERE minutes = 10 AND method = 'NETWORK'
          AND ST_NPoints(geometry) > 8
        """,
    )
    assert row["n"] > 0, "ningun catchment de red tiene forma irregular"


def test_el_hash_del_conjunto_de_candidatos_es_estable(loaded):
    """ADR-06 — dos lecturas del mismo estado producen el mismo ancla."""
    first = pipeline.hash_candidate_set(pipeline.candidate_features(loaded))
    second = pipeline.hash_candidate_set(pipeline.candidate_features(loaded))
    assert first == second


def test_toda_evidencia_apunta_a_una_fuente_registrada(loaded):
    """FR-ING-01 — nada entra por una fuente sin registrar."""
    row = fetch_one(
        loaded,
        """
        SELECT count(*) AS n FROM core.damage_evidence e
        WHERE NOT EXISTS (SELECT 1 FROM core.source_register s WHERE s.source_id = e.source)
           OR NOT EXISTS (SELECT 1 FROM core.source_register s
                          WHERE s.source_id = e.original_source)
        """,
    )
    assert row["n"] == 0


def test_se_levanto_la_alerta_de_cobertura(loaded):
    """FR-QUAL-02 — sin esta alerta, el area fotografiada se lee como el area
    afectada y la recuperacion se concentra ahi."""
    row = fetch_one(
        loaded, "SELECT count(*) AS n FROM core.quality_alert WHERE code = 'AOI_COVERAGE'"
    )
    assert row["n"] >= 1
