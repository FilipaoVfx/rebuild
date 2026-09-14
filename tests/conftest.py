"""Fixtures compartidas.

Las pruebas de dominio (restricciones, scoring, optimizador) no tocan la base:
son deterministas y corren en cualquier entorno. Las que necesitan PostGIS se
saltan explicitamente si no hay base, en vez de fallar con un error de
conexion que no dice nada.
"""

from __future__ import annotations

import pytest

from uri.contracts import CatchmentMethod


@pytest.fixture
def base_features() -> dict:
    """Vector de features de un sitio candidato razonable."""
    return {
        "site_id": "site_test",
        "site_area": 1200.0,
        "risk_score": 0.10,
        "land_use_compatibility": 0.80,
        "population_10min": 3000.0,
        "households_10min": 940.0,
        "park_deficit": 0.70,
        "park_area_per_capita": 3.0,
        "pedestrian_accessibility": 0.65,
        "social_vulnerability": 0.55,
        "building_density": 0.40,
        "school_access": 0.33,
        "health_access": 0.0,
        "community_access": 0.0,
        "catchment_method": CatchmentMethod.NETWORK.value,
        "confidence": 0.70,
    }


@pytest.fixture
def db_conn():
    """Conexion a PostGIS, o skip si no hay base disponible."""
    import psycopg
    from psycopg.rows import dict_row

    from uri.settings import settings

    try:
        # Mismo row_factory que la aplicacion: una fixture que devuelve tuplas
        # prueba un acceso a datos que el codigo real nunca hace.
        conn = psycopg.connect(settings.database_url, connect_timeout=3, row_factory=dict_row)
    except psycopg.OperationalError as exc:  # pragma: no cover - depende del entorno
        pytest.skip(f"sin base de datos: {exc}")
    with conn:
        yield conn
