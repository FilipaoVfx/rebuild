"""Acceso a PostgreSQL.

ADR-12 distingue dos caminos de conexion: la API usa pooling en modo
transaccion con prepared statements desactivados; el worker usa conexion
directa con statement_timeout largo, porque el trabajo de batch y pgRouting
corre durante minutos. Aqui estan los dos, explicitos.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from uri.settings import settings

_pool: ConnectionPool | None = None

#: Si la base no responde, es mejor fallar en segundos y decirlo que dejar
#: una peticion colgada medio minuto.
POOL_TIMEOUT_S = 5.0

# Camino API: consultas cortas. Un timeout bajo protege del cliente que
# lanza una consulta sin bbox.
API_STATEMENT_TIMEOUT_MS = 15_000
# Camino worker: batch y pgRouting. Con el limite de la API, el batch nocturno
# muere a mitad — ADR-12 lo advierte y aqui es una constante distinta.
WORKER_STATEMENT_TIMEOUT_MS = 30 * 60 * 1000


def pool() -> ConnectionPool:
    """El pool de la API.

    Se abre explicitamente en el arranque de la aplicacion (`open_pool`), no
    de forma perezosa dentro de la primera peticion: abrirlo ahi hace que ese
    primer request pague la conexion y, si la base tarda, expire contra el
    timeout del pool en vez de contra algo que se pueda diagnosticar.
    """
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            settings.database_url,
            min_size=2,
            max_size=8,
            open=False,
            timeout=POOL_TIMEOUT_S,
            # Supavisor en modo transaccion no soporta prepared statements
            # como los espera un driver de larga vida (ADR-12).
            kwargs={"prepare_threshold": None, "row_factory": dict_row},
        )
        _pool.open(wait=True, timeout=30.0)
    return _pool


def open_pool() -> None:
    """Abre el pool y verifica la base. Se llama al arrancar la aplicacion."""
    with pool().connection() as conn:
        conn.execute("SELECT 1")


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def api_connection() -> Iterator[psycopg.Connection]:
    with pool().connection() as conn:
        conn.execute(f"SET statement_timeout = {API_STATEMENT_TIMEOUT_MS}")
        yield conn


@contextmanager
def worker_connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=False) as conn:
        conn.execute(f"SET statement_timeout = {WORKER_STATEMENT_TIMEOUT_MS}")
        yield conn


def fetch_all(conn: psycopg.Connection, sql: str, params: Any = None) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_one(conn: psycopg.Connection, sql: str, params: Any = None) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()
