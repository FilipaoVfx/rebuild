"""Fase 1 del pipeline de evidencia de cambio.

Sin credenciales de CDSE no hay llamadas reales, y eso NO es una excusa para
no probar: lo que decide si el resultado es honesto es el criterio de
seleccion y las restricciones de la base, y ambos se comprueban sin red.
"""

from __future__ import annotations

from datetime import UTC, datetime

import psycopg
import pytest

from uri.ingestion.adapters import sentinel

AOI = (-75.7251, 4.7878, -75.6748, 4.8229)


def scene(
    scene_id: str,
    *,
    collection: str = sentinel.S2,
    day: int = 5,
    month: int = 8,
    cloud: float | None = 10.0,
    orbit: str | None = "DESCENDING",
    relative_orbit: int | None = 18,
    bbox: tuple[float, float, float, float] = (-76.5, 4.0, -75.0, 5.5),
) -> sentinel.Scene:
    return sentinel.Scene(
        scene_id=scene_id,
        collection=collection,
        acquisition=datetime(2026, month, day, 15, 30, tzinfo=UTC),
        bbox=bbox,
        geometry={},
        cloud_cover=cloud,
        orbit_direction=orbit,
        relative_orbit=relative_orbit,
    )


# ── Cobertura del AOI ───────────────────────────────────────────────────


def test_una_escena_que_no_contiene_el_aoi_se_descarta():
    """Media escena sobre el AOI produce medio recorte, y el borde vacio se
    leeria como cambio."""
    assert sentinel.covers_aoi(scene("completa"), AOI)
    parcial = scene("parcial", bbox=(-75.70, 4.80, -75.60, 4.90))
    assert not sentinel.covers_aoi(parcial, AOI)


# ── Seleccion optica ────────────────────────────────────────────────────


def test_la_escena_optica_elegida_es_la_menos_nublada():
    escenas = [
        scene("nublada", cloud=72.0, day=9),
        scene("despejada", cloud=4.0, day=2),
        scene("media", cloud=31.0, day=8),
    ]
    elegida, razon = sentinel.select_optical(escenas, window_label="PRE")
    assert elegida.scene_id == "despejada"
    # La razon es parte del resultado: sin ella "la mejor" no es auditable.
    assert "4.0%" in razon and "3 escenas" not in razon
    assert "2 escenas utilizables" in razon


def test_sin_escena_bajo_el_umbral_de_nube_se_dice_cual_era_la_mejor():
    """Un fallo que no dice cuanto falto obliga a repetir la consulta a mano."""
    escenas = [scene("a", cloud=88.0), scene("b", cloud=61.5)]
    with pytest.raises(sentinel.NoUsableScene, match="61.5"):
        sentinel.select_optical(escenas, window_label="POST")


def test_una_escena_optica_sin_nubosidad_declarada_no_se_usa():
    """`None` es "no lo sabemos", y tratarlo como 0 seria darle la mejor nota
    posible a la escena de la que menos se sabe."""
    with pytest.raises(sentinel.NoUsableScene):
        sentinel.select_optical([scene("sin_metadato", cloud=None)], window_label="PRE")


# ── Seleccion radar ─────────────────────────────────────────────────────


def test_la_escena_radar_elegida_es_la_mas_cercana_al_evento():
    escenas = [
        scene("lejos", collection=sentinel.S1, cloud=None, day=20, month=7),
        scene("cerca", collection=sentinel.S1, cloud=None, day=8, month=8),
    ]
    elegida, razon = sentinel.select_radar(escenas, window_label="PRE")
    assert elegida.scene_id == "cerca"
    assert "2 dias del evento" in razon


def test_el_radar_post_exige_la_misma_geometria_que_el_pre():
    """Comparar una pasada ascendente con una descendente mide el angulo de
    observacion, no el terreno. El pipeline se detiene en vez de producir un
    cambio que no ocurrio."""
    pre = scene("pre", collection=sentinel.S1, cloud=None, orbit="DESCENDING", relative_orbit=18)
    post_incompatible = [
        scene(
            "otra_orbita", collection=sentinel.S1, cloud=None, orbit="ASCENDING", relative_orbit=40
        )
    ]
    with pytest.raises(sentinel.NoUsableScene, match="geometria"):
        sentinel.select_radar(post_incompatible, window_label="POST", match=pre)

    compatible = [
        scene(
            "misma",
            collection=sentinel.S1,
            cloud=None,
            day=14,
            orbit="DESCENDING",
            relative_orbit=18,
        ),
        scene(
            "distinta",
            collection=sentinel.S1,
            cloud=None,
            day=12,
            orbit="ASCENDING",
            relative_orbit=40,
        ),
    ]
    elegida, razon = sentinel.select_radar(compatible, window_label="POST", match=pre)
    assert elegida.scene_id == "misma"
    assert "misma geometria" in razon


# ── Credenciales ────────────────────────────────────────────────────────


def test_sin_credenciales_el_cliente_lo_dice_y_no_llama(monkeypatch):
    monkeypatch.delenv("CDSE_CLIENT_ID", raising=False)
    monkeypatch.delenv("CDSE_CLIENT_SECRET", raising=False)
    with pytest.raises(sentinel.CdseAuthMissing, match="CDSE_CLIENT_ID"):
        sentinel.CdseClient()


def test_la_procedencia_no_lleva_la_credencial(monkeypatch):
    """`request_parameters` va a la base y sale en los exports. Un secreto ahi
    queda registrado para siempre en una tabla que ademas es inmutable."""
    monkeypatch.setenv("CDSE_CLIENT_ID", "id-de-prueba")
    monkeypatch.setenv("CDSE_CLIENT_SECRET", "secreto-que-no-debe-salir")
    client = sentinel.CdseClient()

    capturado: dict = {}

    def falso_post(url, payload, *, accept):
        capturado["payload"] = payload
        return b"GeoTIFF simulado"

    monkeypatch.setattr(client, "_post", falso_post)
    _, params = client.fetch_aoi(scene("x"), AOI, evalscript=sentinel.s2_evalscript())
    serializado = f"{params}{capturado['payload']}"
    assert "secreto-que-no-debe-salir" not in serializado
    assert "id-de-prueba" not in serializado
    # Y si lleva lo que hace falta para reproducir la peticion.
    assert params["evalscript_sha256"] and params["bbox"] == list(AOI)
    assert params["resolution_m"] == sentinel.RESOLUTION_M


def test_el_recorte_del_aoi_cabe_en_los_limites_del_servicio():
    ancho, alto = sentinel._pixel_size(AOI, sentinel.RESOLUTION_M)
    assert 0 < ancho <= 2500 and 0 < alto <= 2500
    # A 10 m, ~5,6 km de ancho son ~560 px: si esto se desvia un orden de
    # magnitud, la conversion de grados a metros se rompio.
    assert 400 < ancho < 700


# ── Invariantes en la base ──────────────────────────────────────────────


@pytest.fixture
def sentinel_version(db_conn) -> int:
    """Una version de dataset de Sentinel sobre la que probar el esquema.

    Registra la fuente primero. En CI la base solo tiene migraciones —nadie
    corre el pipeline— asi que `source_register` esta vacia y la clave ajena
    de `dataset_version` falla. Estas pruebas comprueban invariantes del
    ESQUEMA y tienen que correr ahi: un invariante que solo se verifica en la
    maquina de quien lo escribio no esta verificado.
    """
    from uri.ingestion.loader import register_sources

    register_sources(db_conn)
    db_conn.commit()
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.dataset_version
                (source_id, retrieved_at, record_count, content_hash, is_synthetic)
            VALUES ('copernicus_sentinel', now(), 1, %s, false)
            ON CONFLICT (source_id, content_hash) DO NOTHING
            RETURNING data_version
            """,
            ("sentinel-fixture",),
        )
        row = cur.fetchone()
        if row is None:
            cur.execute(
                "SELECT data_version FROM rebuild_core.dataset_version "
                "WHERE source_id = 'copernicus_sentinel' AND content_hash = 'sentinel-fixture'"
            )
            row = cur.fetchone()
    db_conn.commit()
    return row["data_version"]


def insertar_escena(cur, version, **overrides):
    campos = {
        "scene_id": "S2A_PRUEBA",
        "collection": "sentinel-2-l2a",
        "event_window": "PRE",
        "cloud_cover": 12.0,
        "selected": False,
        "selection_reason": None,
    }
    campos.update(overrides)
    cur.execute(
        """
        INSERT INTO rebuild_core.satellite_scene
            (scene_id, collection, event_window, acquisition_date, footprint,
             cloud_cover, selected, selection_reason, data_version)
        VALUES (%(scene_id)s, %(collection)s, %(event_window)s, '2026-08-05',
                ST_GeomFromText('POLYGON((-76 4, -75 4, -75 5, -76 5, -76 4))', 4326),
                %(cloud_cover)s, %(selected)s, %(selection_reason)s, %(version)s)
        """,
        {**campos, "version": version},
    )


def test_una_escena_elegida_tiene_que_decir_por_que(db_conn, sentinel_version):
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        insertar_escena(cur, sentinel_version, selected=True, selection_reason=None)
    db_conn.rollback()


def test_el_radar_no_puede_declarar_nubosidad(db_conn, sentinel_version):
    """Un 0 en la nubosidad de una escena S1 se leeria como 'despejado' en vez
    de 'no aplica': el radar atraviesa la nube."""
    with pytest.raises(psycopg.errors.CheckViolation), db_conn.cursor() as cur:
        insertar_escena(
            cur,
            sentinel_version,
            scene_id="S1_PRUEBA",
            collection="sentinel-1-grd",
            cloud_cover=0.0,
        )
    db_conn.rollback()


def test_ninguna_banda_puede_llamarse_como_un_veredicto(db_conn, sentinel_version):
    """La instruccion es explicita: un cambio satelital no es un damage_score.

    Esta en la base y no en revision de codigo porque bastaria un adaptador
    nuevo para que el resto del sistema empezara a tratar un cambio de
    reflectancia como daño confirmado.
    """
    with db_conn.cursor() as cur:
        insertar_escena(cur, sentinel_version, scene_id="S2_BANDAS")
        cur.execute(
            "SELECT scene_pk FROM rebuild_core.satellite_scene WHERE scene_id = 'S2_BANDAS'"
        )
        scene_pk = cur.fetchone()["scene_pk"]

        for prohibida in ("damage_score", "DAMAGE_probability", "dano_estimado"):
            with pytest.raises(psycopg.errors.CheckViolation):
                cur.execute(
                    """
                    INSERT INTO rebuild_core.satellite_observation
                        (geometry, band, value, event_window, scene_pk,
                         observation_date, data_version)
                    VALUES (ST_GeomFromText('POINT(-75.69 4.81)', 4326), %s, 0.5,
                            'PRE', %s, '2026-08-05', %s)
                    """,
                    (prohibida, scene_pk, sentinel_version),
                )
            db_conn.rollback()
            insertar_escena(cur, sentinel_version, scene_id="S2_BANDAS")
            cur.execute(
                "SELECT scene_pk FROM rebuild_core.satellite_scene WHERE scene_id = 'S2_BANDAS'"
            )
            scene_pk = cur.fetchone()["scene_pk"]

        # Lo que si se admite: la medicion, con su nombre de medicion.
        for permitida in ("VV", "VH", "NDVI", "NDBI", "delta_backscatter", "change_score"):
            cur.execute(
                """
                INSERT INTO rebuild_core.satellite_observation
                    (geometry, band, value, event_window, scene_pk,
                     observation_date, data_version)
                VALUES (ST_GeomFromText('POINT(-75.69 4.81)', 4326), %s, 0.5,
                        'PRE', %s, '2026-08-05', %s)
                """,
                (permitida, scene_pk, sentinel_version),
            )
    db_conn.rollback()


def test_la_base_rechaza_una_escena_de_version_sintetica(db_conn):
    """ADR-17 tambien aqui, y por trigger: lo que hay que comprobar vive en
    otra tabla (`dataset_version.is_synthetic`), asi que un CHECK no alcanza."""
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.source_register
                (source_id, display_name, tier, source_url, access_method, spatial_reference)
            VALUES ('fixture_sintetica', 'Fixture', 'A', 'urn:test', 'generated', 'EPSG:4326')
            ON CONFLICT (source_id) DO NOTHING
            """
        )
        cur.execute(
            """
            INSERT INTO rebuild_core.dataset_version
                (source_id, retrieved_at, record_count, content_hash, is_synthetic)
            VALUES ('fixture_sintetica', now(), 1, 'sintetica-sentinel', true)
            ON CONFLICT (source_id, content_hash) DO NOTHING
            RETURNING data_version
            """
        )
        row = cur.fetchone()
        if row is None:
            cur.execute(
                "SELECT data_version FROM rebuild_core.dataset_version "
                "WHERE content_hash = 'sintetica-sentinel'"
            )
            row = cur.fetchone()
        sintetica = row["data_version"]
    db_conn.commit()

    with pytest.raises(psycopg.errors.RaiseException, match="ADR-17"), db_conn.cursor() as cur:
        insertar_escena(cur, sintetica, scene_id="S2_SINTETICA")
    db_conn.rollback()
