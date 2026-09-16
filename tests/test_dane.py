"""Censo 2018 del DANE por manzana.

Lo que se prueba aqui no es que los numeros sean bonitos: es que el dato
sensible no se publique y que la ausencia no se confunda con un cero.
"""

from __future__ import annotations

import psycopg
import pytest

from uri.ingestion.adapters import dane


def test_el_extracto_archivado_cubre_el_aoi():
    manzanas = dane.load_blocks()
    assert len(manzanas) > 2000
    assert all(m["block_id"] for m in manzanas)
    assert sum(m["population"] for m in manzanas) > 150_000


def test_una_manzana_pequena_no_publica_sus_atributos():
    """FR-PII-03. El riesgo es medido, no teorico: en el AOI hay 64 manzanas
    de menos de 20 personas donde alguien tiene condicion fisica registrada.
    Una de 15 habitantes con un caso senala a una persona concreta."""
    manzanas = dane.load_blocks()
    pequenas = [m for m in manzanas if m["population"] < dane.PII_THRESHOLD]
    assert pequenas, "sin manzanas bajo el umbral no hay nada que probar"
    for m in pequenas:
        assert m["pii_suppressed"] is True
        assert m["disabled"] is None
        assert m["stratum"] is None
        assert m["illiterate"] is None
        assert m["vulnerability"] is None
        # La poblacion SI se conserva: un conteo de personas no identifica a
        # nadie; el cruce de atributos, si.
        assert m["population"] is not None


def test_una_manzana_grande_si_publica_su_vulnerabilidad():
    manzanas = dane.load_blocks()
    grandes = [m for m in manzanas if m["population"] >= dane.PII_THRESHOLD]
    con_dato = [m for m in grandes if m["vulnerability"] is not None]
    assert len(con_dato) > 1000
    assert all(0.0 <= m["vulnerability"] <= 1.0 for m in con_dato)


def test_la_vulnerabilidad_discrimina_de_verdad():
    """La leccion de `risk_score`: cobertura del 100 % con un solo valor es
    cobertura sin informacion. Entraba al score sin ordenar nada."""
    manzanas = dane.load_blocks()
    valores = {m["vulnerability"] for m in manzanas if m["vulnerability"] is not None}
    assert len(valores) > 500, "un compuesto que no varia no aporta al ranking"


def test_una_manzana_vacia_no_tiene_vulnerabilidad_cero():
    """Cero es el valor MENOS vulnerable. Una manzana sin habitantes marcada
    con cero se colaria entre las mejores del AOI."""
    assert dane.vulnerability({"SEXO_TOTAL": 0, "ESTRATO_PREDOMINANTE": 1}) is None
    assert dane.vulnerability({"SEXO_TOTAL": None}) is None


def test_el_estrato_se_invierte_para_apuntar_a_mayor_vulnerabilidad():
    """En Colombia el estrato 1 es el mas bajo. Sin invertir, el compuesto
    diria que los barrios ricos son los mas vulnerables."""
    bajo = dane.vulnerability({"SEXO_TOTAL": 100, "ESTRATO_PREDOMINANTE": 1})
    alto = dane.vulnerability({"SEXO_TOTAL": 100, "ESTRATO_PREDOMINANTE": 6})
    assert bajo > alto
    assert alto == pytest.approx(0.0)


def test_la_base_rechaza_una_manzana_pequena_sin_marcar(db_conn):
    """El CHECK es el cinturon del tirante: el adaptador impide que el dato
    sensible entre, y esto impide que entre por otra puerta que alguien anada
    despues."""
    from uri.ingestion.loader import register_sources

    register_sources(db_conn)
    db_conn.commit()
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.dataset_version
                (source_id, retrieved_at, record_count, content_hash, is_synthetic)
            VALUES ('dane_censo_2018', now(), 1, 'fixture-pii', false)
            ON CONFLICT (source_id, content_hash) DO NOTHING
            RETURNING data_version
            """
        )
        fila = cur.fetchone()
        if fila is None:
            cur.execute(
                "SELECT data_version FROM rebuild_core.dataset_version "
                "WHERE source_id = 'dane_censo_2018' AND content_hash = 'fixture-pii'"
            )
            fila = cur.fetchone()
    db_conn.commit()
    version = fila["data_version"]

    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.census_block
                (block_id, geometry, population, stratum, pii_suppressed, data_version)
            VALUES ('MANZANA_PRUEBA', ST_GeomFromText(
                        'POLYGON((-75.7 4.8, -75.69 4.8, -75.69 4.81, '
                        '-75.7 4.81, -75.7 4.8))', 4326),
                    3, 1, false, %s)
            """,
            (version,),
        )
    db_conn.rollback()
