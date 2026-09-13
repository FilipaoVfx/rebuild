"""Invariantes que solo la base puede garantizar.

FR-ING-02 y FR-AUDIT-01 dicen "inmutable". Sin un trigger, "inmutable" es un
adjetivo en un documento. Estas pruebas comprueban que la base lo impone.
"""

from __future__ import annotations

import psycopg
import pytest


def test_una_version_de_dataset_no_se_puede_mutar(db_conn):
    """FR-ING-02 — publicar n+1 nunca toca n."""
    with db_conn.cursor() as cur:
        cur.execute("SELECT data_version FROM core.dataset_version ORDER BY data_version LIMIT 1")
        row = cur.fetchone()
        if row is None:
            pytest.skip("sin datos cargados")
        version = row["data_version"]

    with pytest.raises(psycopg.errors.RaiseException, match="FR-ING-02"), db_conn.cursor() as cur:
        cur.execute(
            "UPDATE core.dataset_version SET record_count = 0 WHERE data_version = %s",
            (version,),
        )
    db_conn.rollback()

    with pytest.raises(psycopg.errors.RaiseException, match="FR-ING-02"), db_conn.cursor() as cur:
        cur.execute("DELETE FROM core.dataset_version WHERE data_version = %s", (version,))
    db_conn.rollback()


def test_el_log_de_auditoria_no_se_edita_ni_se_borra(db_conn):
    """FR-AUDIT-01 — una entrada editable no es una auditoria."""
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO core.audit_log (actor, action, entity) VALUES (%s, %s, %s) "
            "RETURNING audit_id",
            ("prueba", "test.write", "prueba"),
        )
        audit_id = cur.fetchone()["audit_id"]
    db_conn.commit()

    for sql in (
        "UPDATE core.audit_log SET actor = 'otro' WHERE audit_id = %s",
        "DELETE FROM core.audit_log WHERE audit_id = %s",
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
            WHERE table_schema IN ('core', 'analytics', 'osm_raw', 'osm_derived')
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
            INSERT INTO core.source_register
                (source_id, display_name, tier, source_url, access_method,
                 spatial_reference, license_class)
            VALUES ('prueba_sin_evidencia', 'Prueba', 'A', 'https://x', 'download',
                    'EPSG:4326', 'COMMERCIAL_SAFE')
            """
        )
    db_conn.rollback()


def test_las_geometrias_de_sitio_son_validas(db_conn):
    with db_conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM core.site WHERE NOT ST_IsValid(geometry)")
        assert cur.fetchone()["n"] == 0


def test_la_evidencia_no_puede_observarse_despues_de_adquirirse(db_conn):
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO core.damage_evidence
                (source, original_source, geometry, observation_date, acquisition_date,
                 damage_class, raw_damage_label, method, confidence, is_synthetic,
                 data_version)
            SELECT 'sertit', 'sertit', ST_GeomFromText('POINT(-75.69 4.81)', 4326),
                   '2026-09-30', '2026-08-11', 'DAMAGED', 'x', 'REMOTE_SENSING',
                   0.5, false, min(data_version)
            FROM core.dataset_version
            """
        )
    db_conn.rollback()
