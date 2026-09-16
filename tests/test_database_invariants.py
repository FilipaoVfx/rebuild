"""Invariantes que solo la base puede garantizar.

FR-ING-02 y FR-AUDIT-01 dicen "inmutable". Sin un trigger, "inmutable" es un
adjetivo en un documento. Estas pruebas comprueban que la base lo impone.
"""

from __future__ import annotations

import psycopg
import pytest


@pytest.fixture
def throwaway_version(db_conn) -> int:
    """Una fuente y una version de dataset propias de la prueba.

    Estas pruebas verifican invariantes del esquema, no del contenido: hacerlas
    depender de que alguien haya corrido el pipeline las convierte en pruebas
    que se saltan en CI, y un invariante que solo se comprueba en la maquina de
    quien lo escribio no esta comprobado.

    La version se marca `is_synthetic = false` a proposito. `dataset_version`
    es inmutable por trigger: una fila sintetica escrita aqui no se puede
    borrar despues, y quedaria contando como dependencia simulada en el
    diagnostico de señal sobre la base de trabajo.
    """
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.source_register
                (source_id, display_name, tier, source_url, access_method, spatial_reference)
            VALUES ('fixture_prueba', 'Fixture', 'A', 'urn:test', 'generated', 'EPSG:4326')
            ON CONFLICT (source_id) DO NOTHING
            """
        )
        cur.execute(
            """
            INSERT INTO rebuild_core.dataset_version
                (source_id, retrieved_at, record_count, content_hash, is_synthetic)
            VALUES ('fixture_prueba', now(), 1, %s, false)
            ON CONFLICT (source_id, content_hash) DO NOTHING
            RETURNING data_version
            """,
            (f"fixture-{id(db_conn)}",),
        )
        row = cur.fetchone()
        if row is None:
            cur.execute(
                "SELECT data_version FROM rebuild_core.dataset_version "
                "WHERE source_id = 'fixture_prueba' LIMIT 1"
            )
            row = cur.fetchone()
    db_conn.commit()
    return row["data_version"]


def test_una_version_de_dataset_no_se_puede_mutar(db_conn, throwaway_version):
    """FR-ING-02 — publicar n+1 nunca toca n."""
    version = throwaway_version

    with pytest.raises(psycopg.errors.RaiseException, match="FR-ING-02"), db_conn.cursor() as cur:
        cur.execute(
            "UPDATE rebuild_core.dataset_version SET record_count = 0 WHERE data_version = %s",
            (version,),
        )
    db_conn.rollback()

    with pytest.raises(psycopg.errors.RaiseException, match="FR-ING-02"), db_conn.cursor() as cur:
        cur.execute("DELETE FROM rebuild_core.dataset_version WHERE data_version = %s", (version,))
    db_conn.rollback()


def test_el_log_de_auditoria_no_se_edita_ni_se_borra(db_conn):
    """FR-AUDIT-01 — una entrada editable no es una auditoria."""
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO rebuild_core.audit_log (actor, action, entity) VALUES (%s, %s, %s) "
            "RETURNING audit_id",
            ("prueba", "test.write", "prueba"),
        )
        audit_id = cur.fetchone()["audit_id"]
    db_conn.commit()

    for sql in (
        "UPDATE rebuild_core.audit_log SET actor = 'otro' WHERE audit_id = %s",
        "DELETE FROM rebuild_core.audit_log WHERE audit_id = %s",
    ):
        with (
            pytest.raises(psycopg.errors.RaiseException, match="FR-AUDIT-01"),
            db_conn.cursor() as cur,
        ):
            cur.execute(sql, (audit_id,))
        db_conn.rollback()


def test_ninguna_columna_del_esquema_analitico_nombra_un_campo_prohibido(db_conn):
    """FR-PII-02 — la prueba que hace fallar el build si una migracion
    introduce una columna de datos personales."""
    from uri.contracts.evidence import prohibited_columns

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_schema, table_name, column_name
            FROM information_schema.columns
            WHERE table_schema IN ('rebuild_core', 'rebuild_analytics',
                                   'rebuild_osm_raw', 'rebuild_osm_derived')
            """
        )
        rows = cur.fetchall()

    # Una sola llamada por columna, no un dict indexado por nombre: varias
    # tablas comparten nombres de columna y un dict se queda con la ultima,
    # ocultando el resto.
    offending = [
        f"{row['table_schema']}.{row['table_name']}.{row['column_name']}"
        for row in rows
        if prohibited_columns([row["column_name"]])
    ]
    assert offending == [], f"columnas prohibidas en el esquema: {offending}"


def test_una_fuente_clasificada_exige_evidencia_archivada(db_conn):
    """El mismo invariante que el modelo, tambien en la base: nada impide
    escribir directamente por SQL."""
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.source_register
                (source_id, display_name, tier, source_url, access_method,
                 spatial_reference, license_class)
            VALUES ('prueba_sin_evidencia', 'Prueba', 'A', 'https://x', 'download',
                    'EPSG:4326', 'COMMERCIAL_SAFE')
            """
        )
    db_conn.rollback()


def test_las_geometrias_de_sitio_son_validas(db_conn):
    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM rebuild_core.site WHERE NOT ST_IsValid(geometry)")
        assert cur.fetchone()["n"] == 0


def test_la_evidencia_no_puede_observarse_despues_de_adquirirse(db_conn, throwaway_version):
    """Una observacion posterior a su propia adquisicion no es una observacion.

    La version de dataset viene de la fixture y no de `min(...)` sobre la
    tabla: con la base vacia ese `min` devuelve NULL, la insercion falla por
    NOT NULL antes de llegar al CHECK, y la prueba pasa a comprobar otra cosa.
    """
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.damage_evidence
                (source, original_source, geometry, observation_date, acquisition_date,
                 damage_class, raw_damage_label, method, confidence, is_synthetic,
                 data_version)
            VALUES ('fixture_prueba', 'fixture_prueba',
                    ST_GeomFromText('POINT(-75.69 4.81)', 4326),
                    '2026-09-30', '2026-08-11', 'DAMAGED', 'x', 'REMOTE_SENSING',
                    0.5, false, %s)
            """,
            (throwaway_version,),
        )
    db_conn.rollback()


def test_la_base_rechaza_una_capa_sintetica(db_conn, throwaway_version):
    """La prohibición de datos sintéticos no es una convención.

    Está en la base: `is_synthetic = true` en una capa de contexto viola un
    CHECK. Sin esto, "prohibido usar datos sintéticos" sería una frase en un
    documento que nada obliga a cumplir.
    """
    with (
        pytest.raises(psycopg.errors.CheckViolation),
        db_conn.cursor() as cur,
    ):
        cur.execute(
            """
            INSERT INTO rebuild_core.population_cell
                (geometry, population, households, vulnerability, is_synthetic, data_version)
            VALUES (ST_GeomFromText('POLYGON((-75.7 4.8, -75.69 4.8, -75.69 4.81,
                                              -75.7 4.81, -75.7 4.8))', 4326),
                    100, 30, 0.5, true, %s)
            """,
            (throwaway_version,),
        )
    db_conn.rollback()


def test_la_base_rechaza_evidencia_de_dano_sintetica(db_conn, throwaway_version):
    with (
        pytest.raises(psycopg.errors.CheckViolation),
        db_conn.cursor() as cur,
    ):
        cur.execute(
            """
            INSERT INTO rebuild_core.damage_evidence
                (source, original_source, geometry, positional_accuracy_m,
                 observation_date, acquisition_date, damage_class, raw_damage_label,
                 method, confidence, is_synthetic, data_version)
            VALUES ('fixture_prueba', 'fixture_prueba',
                    ST_GeomFromText('POINT(-75.69 4.81)', 4326), 5,
                    '2026-08-11', '2026-08-12', 'DAMAGED', 'x', 'SYNTHETIC',
                    0.5, true, %s)
            """,
            (throwaway_version,),
        )
    db_conn.rollback()
