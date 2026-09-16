"""El motor de oportunidades.

Lo que se prueba no es que los textos queden bonitos: es que una oportunidad
no afirme nada que no pueda sostener. Un "POT compatible" sin POT es
exactamente el fallo que este proyecto lleva toda su historia evitando.
"""

from __future__ import annotations

import psycopg
import pytest

from uri.contracts.enums import InterventionType
from uri.contracts.opportunity import EvidenceSummary, FeasibilityStatus
from uri.opportunities import build_opportunity, generate_opportunities

EVIDENCIA = EvidenceSummary(
    damage_observations=6,
    damage_classes={"DAMAGED": 4, "DESTROYED": 2},
    observation_date="2026-08-11",
    source_ids=["copernicus_ems"],
)


def features(**overrides) -> dict:
    base = {
        "site_area_m2": 4000.0,
        "population_10min": 6240.0,
        "park_deficit": 0.8,
        "social_vulnerability": 0.31,
        "pedestrian_accessibility": 0.62,
        "building_density": 0.4,
        "school_access": 0.2,
        "health_access": 0.1,
        "community_access": 0.0,
        # Sin fuente, y asi se queda: es el estado real del proyecto.
        "risk_score": None,
        "land_use_compatibility": None,
    }
    base.update(overrides)
    return base


def construir(**kw):
    return build_opportunity(
        site_id="site_0017",
        features=features(**kw.pop("features", {})),
        evidence=kw.pop("evidence", EVIDENCIA),
        intervention=kw.pop("intervention", InterventionType.PARK),
        **kw,
    )


# ── Lo que NO se puede afirmar ──────────────────────────────────────────


def test_sin_pot_la_viabilidad_dice_desconocido_y_no_compatible():
    """Colapsar UNKNOWN a OK afirmaria una compatibilidad que nadie ha
    comprobado. Es el mismo fallo que el COALESCE(riesgo, 0) de ADR-18, que
    dejaba los 115 sitios en el valor mas favorable sin que nadie se
    enterara."""
    op = construir()
    pot = next(c for c in op.feasibility if c.check_id == "land_use")
    assert pot.status is FeasibilityStatus.UNKNOWN
    assert pot.source_id is None, "un UNKNOWN no puede citar fuente: no la tiene"
    assert "IDE AMCO" in pot.detail


def test_sin_microzonificacion_el_riesgo_tambien_es_desconocido():
    op = construir()
    riesgo = next(c for c in op.feasibility if c.check_id == "risk")
    assert riesgo.status is FeasibilityStatus.UNKNOWN
    assert "SGC" in riesgo.detail


def test_las_condiciones_sin_comprobar_se_pueden_contar():
    """Un proyecto con tres OK y dos UNKNOWN no es lo mismo que uno con cinco
    OK, y la vista tiene que poder decirlo."""
    op = construir()
    assert set(op.unknowns) == {"Compatibilidad con el POT", "Riesgo sísmico"}


def test_un_area_insuficiente_bloquea_en_vez_de_penalizar():
    """Una restriccion dura no se compensa con un score alto."""
    op = construir(features={"site_area_m2": 100.0})
    area = next(c for c in op.feasibility if c.check_id == "area")
    assert area.status is FeasibilityStatus.BLOCKED
    assert op.blocked is True


# ── El problema se compone, no se rellena ───────────────────────────────


def test_el_titular_nombra_los_factores_que_dominan_ese_sitio():
    op = construir()
    assert op.problem.headline.startswith("Zona con ")
    assert op.problem.drivers, "un titular sin factores es una plantilla"


def test_dos_sitios_distintos_no_reciben_el_mismo_titular():
    """Si el texto no cambia con los datos, no explica: decora."""
    poblado = construir(features={"population_10min": 12000.0, "park_deficit": 0.05})
    deficitario = construir(features={"population_10min": 200.0, "park_deficit": 0.95})
    assert poblado.problem.headline != deficitario.problem.headline


def test_una_feature_ausente_se_declara_junto_al_titular():
    op = construir(features={"social_vulnerability": None})
    assert "Vulnerabilidad social" in op.problem.missing_factors


# ── Impacto y confianza ─────────────────────────────────────────────────


def test_el_impacto_se_puede_comparar_entre_alternativas_de_distinto_tamano():
    """Personas por millon de COP: un parque grande que alcanza a poca gente
    y uno pequeno que alcanza a mucha no se distinguen mirando el coste."""
    op = construir()
    assert op.impact.people_per_million_cop is not None
    assert op.impact.people_per_million_cop > 0
    assert op.cost_cop > 0


def test_la_reduccion_de_deficit_no_supera_al_deficit_existente():
    """Una intervencion no puede reducir mas de lo que hay."""
    op = construir(features={"park_deficit": 0.2, "site_area_m2": 50000.0})
    assert op.impact.deficit_reduction <= 0.2


def test_la_confianza_baja_cuando_faltan_features():
    completo = construir()
    incompleto = construir(
        features={"social_vulnerability": None, "park_deficit": None, "building_density": None}
    )
    assert incompleto.confidence < completo.confidence


def test_la_confianza_baja_con_menos_evidencia_de_dano():
    mucha = construir()
    poca = construir(evidence=EvidenceSummary(damage_observations=1, damage_classes={"DAMAGED": 1}))
    assert poca.confidence < mucha.confidence


# ── Selección de la intervención ────────────────────────────────────────


def test_una_intervencion_bloqueada_no_puede_ser_la_recomendada():
    sitios = [{"site_id": "site_0001", "features": features(), "evidence": EVIDENCIA}]
    (op,) = generate_opportunities(sitios)
    assert not op.blocked


def test_un_sitio_donde_no_cabe_nada_recomienda_NO_BUILD():
    """La respuesta honesta a "aqui no cabe nada" es NO_BUILD, no un parque
    de 10 m2 ni un hueco en la lista.

    El sitio se emite igualmente: tiene dano documentado, y ocultarlo seria
    esconder el problema. Lo que cambia es la recomendacion.
    """
    minusculo = features(site_area_m2=10.0)
    sitios = [{"site_id": "site_0002", "features": minusculo, "evidence": EVIDENCIA}]
    (op,) = generate_opportunities(sitios)
    assert op.site_id == "site_0002"
    assert op.intervention is InterventionType.NO_BUILD
    assert not op.blocked, "NO_BUILD no se bloquea a si mismo: es la salida"


def test_se_emite_una_oportunidad_por_sitio_y_no_cinco():
    """El requerimiento pide pocas decisiones comprensibles. Cinco por sitio
    sobre 115 sitios son 575 filas: un visor GIS con otro nombre."""
    sitios = [
        {"site_id": f"site_{i:04d}", "features": features(), "evidence": EVIDENCIA}
        for i in range(10)
    ]
    ops = generate_opportunities(sitios)
    assert len(ops) == 10
    assert len({o.opportunity_id for o in ops}) == 10


def test_la_oportunidad_conserva_procedencia():
    op = construir(provenance={"data_version": 4, "feature_version": "features_v1"})
    assert op.provenance["data_version"] == 4


@pytest.mark.parametrize("tipo", list(InterventionType))
def test_toda_intervencion_del_catalogo_produce_una_oportunidad_valida(tipo):
    op = construir(intervention=tipo, features={"site_area_m2": 20000.0})
    assert op.cost_cop > 0
    assert 0.0 <= op.confidence <= 1.0
    assert len(op.feasibility) == 4


# ── Persistencia: la oportunidad tiene que poder CITARSE ────────────────


def _version_de_prueba(db_conn) -> int:
    from uri.ingestion.loader import register_sources

    register_sources(db_conn)
    db_conn.commit()
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.dataset_version
                (source_id, retrieved_at, record_count, content_hash, is_synthetic)
            VALUES ('copernicus_ems', now(), 1, 'fixture-opp', false)
            ON CONFLICT (source_id, content_hash) DO NOTHING
            RETURNING data_version
            """
        )
        fila = cur.fetchone()
        if fila is None:
            cur.execute(
                "SELECT data_version FROM rebuild_core.dataset_version "
                "WHERE source_id = 'copernicus_ems' AND content_hash = 'fixture-opp'"
            )
            fila = cur.fetchone()
    db_conn.commit()
    return fila["data_version"]


def _insertar(cur, version, **overrides):
    campos = {
        "opportunity_id": "opp_prueba",
        "site_id": None,
        "headline": "Zona con déficit",
        "feasibility": '[{"status": "UNKNOWN"}, {"status": "OK"}]',
        "unknowns": 1,
        "blocked": False,
        "cost": 1_000_000.0,
        "area": 1000.0,
        "intervention": "PARK",
        "provenance": '{"feature_version": "features_v1"}',
    }
    campos.update(overrides)
    cur.execute(
        """
        INSERT INTO rebuild_core.recovery_opportunity (
            opportunity_id, site_id, geometry, centroid, problem_headline,
            intervention, intervention_label, area_m2, feasibility,
            unknown_count, blocked, cost_cop, suitability, confidence,
            provenance, feature_version, scoring_version, data_version
        )
        SELECT %(opportunity_id)s, s.site_id, s.geometry, s.centroid, %(headline)s,
               %(intervention)s, 'Prueba', %(area)s, %(feasibility)s::jsonb,
               %(unknowns)s, %(blocked)s, %(cost)s, 50.0, 0.7,
               %(provenance)s::jsonb, 'features_v1', 'scoring_v1', %(version)s
        FROM rebuild_core.site s LIMIT 1
        """,
        {**campos, "version": version},
    )


def test_el_recuento_de_incognitas_no_puede_divergir_del_detalle(db_conn):
    """Sin este candado bastaria escribir unknown_count = 0 junto a un POT
    UNKNOWN para que la tarjeta dijera que todo esta comprobado."""
    version = _version_de_prueba(db_conn)
    with db_conn.cursor() as cur:
        cur.execute("SELECT 1 FROM rebuild_core.site LIMIT 1")
        if cur.fetchone() is None:
            pytest.skip("sin sitios cargados")
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        _insertar(cur, version, unknowns=0)
    db_conn.rollback()


def test_el_bloqueo_no_puede_divergir_del_detalle(db_conn):
    """`blocked` es la lectura del array, no una etiqueta suelta. Divergir es
    como se publica un proyecto inviable como viable."""
    version = _version_de_prueba(db_conn)
    with db_conn.cursor() as cur:
        cur.execute("SELECT 1 FROM rebuild_core.site LIMIT 1")
        if cur.fetchone() is None:
            pytest.skip("sin sitios cargados")
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        _insertar(
            cur,
            version,
            feasibility='[{"status": "BLOCKED"}]',
            unknowns=0,
            blocked=False,
        )
    db_conn.rollback()


def test_una_intervencion_construible_no_puede_costar_cero(db_conn):
    """Las primeras 105 oportunidades se persistieron con area 0 y coste 0
    porque el generador leia `site_area_m2` y el pipeline devolvia
    `site_area`. Ningun paso fallo: multiplicar un area ausente por un coste
    unitario da cero, y cero es valido para todas las capas de arriba.

    Ese es el modo de fallo que este proyecto no puede permitirse — no
    revienta, publica. Un parque de 0 COP encabezaria cualquier ranking de
    personas por millon invertido.
    """
    version = _version_de_prueba(db_conn)
    with db_conn.cursor() as cur:
        cur.execute("SELECT 1 FROM rebuild_core.site LIMIT 1")
        if cur.fetchone() is None:
            pytest.skip("sin sitios cargados")
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        _insertar(cur, version, cost=0.0)
    db_conn.rollback()


def test_una_oportunidad_sin_procedencia_no_entra(db_conn):
    """Una oportunidad sin procedencia es una opinion con formato de dato."""
    version = _version_de_prueba(db_conn)
    with db_conn.cursor() as cur:
        cur.execute("SELECT 1 FROM rebuild_core.site LIMIT 1")
        if cur.fetchone() is None:
            pytest.skip("sin sitios cargados")
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        _insertar(cur, version, provenance="{}")
    db_conn.rollback()


# ── El optimizador selecciona oportunidades, no sitios ──────────────────


def test_el_portafolio_cita_la_oportunidad_que_eligio():
    """ADR-20 afirma que el optimizador selecciona un portafolio de
    oportunidades. Esta prueba es lo que hace que esa frase sea cierta."""
    from uri.optimizer.greedy import Candidate, select_portfolio

    candidatos = [
        Candidate(
            site_id=f"site_{i:04d}",
            opportunity_id=f"opp_{i:04d}_park",
            intervention=InterventionType.PARK,
            score=90.0 - i,
            cost_cop=1e9,
            population_cells={i * 10 + j: 100.0 for j in range(5)},
            vulnerability=0.4,
            unknown_count=2,
        )
        for i in range(4)
    ]
    resultado = select_portfolio(candidatos, budget=10e9)
    assert resultado.items
    assert all(item.opportunity_id for item in resultado.items)
    assert resultado.items[0].opportunity_id == "opp_0000_park"


def test_el_portafolio_declara_cuantas_condiciones_quedan_sin_comprobar():
    """Un portafolio de 19 proyectos con 38 incognitas no es lo mismo que uno
    con ninguna, y el numero tiene que salir junto al total de poblacion."""
    from uri.optimizer.greedy import Candidate, select_portfolio

    candidatos = [
        Candidate(
            site_id=f"site_{i:04d}",
            opportunity_id=f"opp_{i:04d}_park",
            intervention=InterventionType.PARK,
            score=90.0 - i,
            cost_cop=1e9,
            population_cells={i * 10 + j: 100.0 for j in range(5)},
            vulnerability=0.4,
            unknown_count=2,
        )
        for i in range(3)
    ]
    resultado = select_portfolio(candidatos, budget=10e9)
    assert resultado.unknown_checks == 2 * len(resultado.items)


def test_las_incognitas_no_penalizan_el_orden():
    """No se puede castigar a un sitio por un dato que el proyecto no tiene.
    Las incognitas se arrastran para declararlas, no para ordenar."""
    from uri.optimizer.greedy import Candidate, select_portfolio

    def candidato(i, incognitas):
        return Candidate(
            site_id=f"site_{i:04d}",
            opportunity_id=f"opp_{i:04d}_park",
            intervention=InterventionType.PARK,
            score=80.0,
            cost_cop=1e9,
            population_cells={i * 10 + j: 100.0 for j in range(5)},
            vulnerability=0.4,
            unknown_count=incognitas,
        )

    sin_dudas = select_portfolio([candidato(0, 0), candidato(1, 0)], budget=10e9)
    con_dudas = select_portfolio([candidato(0, 4), candidato(1, 4)], budget=10e9)
    assert [i.opportunity_id for i in sin_dudas.items] == [
        i.opportunity_id for i in con_dudas.items
    ]
