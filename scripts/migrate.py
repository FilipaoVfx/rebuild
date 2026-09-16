#!/usr/bin/env python3
"""Aplica las migraciones en orden. Sin herramienta externa: el piloto no
necesita una, y el orden lexicografico del nombre de archivo es el contrato."""

from __future__ import annotations

import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from uri.settings import settings  # noqa: E402

MIGRATIONS = Path(__file__).resolve().parents[1] / "db" / "migrations"


def main(reset: bool = False) -> int:
    with psycopg.connect(settings.database_url, autocommit=True) as conn:
        if reset:
            conn.execute(
                "DROP SCHEMA IF EXISTS rebuild_core, rebuild_analytics, "
                "rebuild_osm_raw, rebuild_osm_derived CASCADE"
            )
            # El registro vive DENTRO de rebuild_core, asi que el DROP SCHEMA
            # de arriba ya se lo lleva. Se borra tambien el de `public` por si
            # queda de una version anterior: sin eso, el registro seguiria
            # diciendo que todo esta aplicado y `--reset` dejaria una base
            # vacia que se cree migrada.
            conn.execute("DROP TABLE IF EXISTS public.schema_migration")
            for type_name in (
                "license_class",
                "export_profile",
                "damage_class",
                "evidence_method",
                "site_state",
                "intervention_type",
                "catchment_method",
            ):
                conn.execute(f"DROP TYPE IF EXISTS rebuild_core.{type_name} CASCADE")

        # El registro va en `rebuild_core`, no en `public`. La base de
        # produccion es compartida con otro producto que vive entero en
        # `public`; dejar ahi una tabla de este proyecto seria justo lo que el
        # prefijo de esquema existe para evitar. El `CREATE SCHEMA` de aqui
        # rompe el huevo y la gallina: la 001 lo vuelve a declarar, y es
        # idempotente.
        conn.execute("CREATE SCHEMA IF NOT EXISTS rebuild_core")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS rebuild_core.schema_migration ("
            "  filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        applied = {
            row[0]
            for row in conn.execute("SELECT filename FROM rebuild_core.schema_migration").fetchall()
        }

        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in applied:
                continue
            print(f"aplicando {path.name}")
            conn.execute(path.read_text(encoding="utf-8"))
            conn.execute(
                "INSERT INTO rebuild_core.schema_migration (filename) VALUES (%s)", (path.name,)
            )
    print("migraciones al dia")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(reset="--reset" in sys.argv))
