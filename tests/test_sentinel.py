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


# ── El motivo tiene que describir la escena que quedó elegida ────────────


def test_el_motivo_guardado_describe_la_escena_elegida_y_no_otra():
    """El motivo sale de la llamada que eligió, no de una recalculada después.

    La selección de radar depende de la escena pre. Recalcular el motivo sin
    ese contexto elige la escena más cercana al evento sin mirar la geometría
    y devuelve SU motivo, que se guardaría junto a una escena distinta. La
    fila diría, con toda la apariencia de procedencia, por qué se eligió algo
    que no se eligió.
    """
    pre = scene(
        "s1_pre", collection=sentinel.S1, cloud=None, day=8, orbit="DESCENDING", relative_orbit=142
    )
    # La más cercana al evento va por otra órbita: es la que un recálculo sin
    # contexto habría descrito.
    otra_geometria = scene(
        "s1_post_cerca",
        collection=sentinel.S1,
        cloud=None,
        day=11,
        orbit="ASCENDING",
        relative_orbit=48,
    )
    compatible = scene(
        "s1_post_igual",
        collection=sentinel.S1,
        cloud=None,
        day=14,
        orbit="DESCENDING",
        relative_orbit=142,
    )
    found = {
        (sentinel.S1, "PRE"): [pre],
        (sentinel.S1, "POST"): [otra_geometria, compatible],
        (sentinel.S2, "PRE"): [scene("s2_pre", cloud=10.0, day=8)],
        (sentinel.S2, "POST"): [scene("s2_post", cloud=20.0, day=14)],
    }
    chosen, avisos = sentinel.select_pairs(found)
    assert avisos == []

    elegida, razon = chosen[(sentinel.S1, "POST")]
    assert elegida.scene_id == "s1_post_igual"
    # El motivo nombra la geometría de la elegida, no la de la descartada.
    assert "DESCENDING" in razon and "142" in razon
    assert "ASCENDING" not in razon and "48" not in razon


def test_una_ventana_sin_escena_utilizable_avisa_sin_tumbar_las_demas():
    found = {
        (sentinel.S2, "PRE"): [scene("nublada", cloud=99.0)],
        (sentinel.S2, "POST"): [scene("despejada", cloud=8.0)],
        (sentinel.S1, "PRE"): [scene("radar", collection=sentinel.S1, cloud=None)],
        (sentinel.S1, "POST"): [scene("radar_post", collection=sentinel.S1, cloud=None, day=14)],
    }
    chosen, avisos = sentinel.select_pairs(found)
    assert (sentinel.S2, "PRE") not in chosen
    assert any("SIN ESCENA" in a and sentinel.S2 in a for a in avisos)
    # Las otras tres ventanas siguen resolviéndose.
    assert len(chosen) == 3


# ── Re-catalogar no puede perder lo que ya se descargó ───────────────────


def _considerada(scene_obj, window, selected, reason, params):
    return (scene_obj, window, selected, reason, params)


def test_recatalogar_actualiza_la_escena_en_vez_de_ignorarla(db_conn):
    """Con `DO NOTHING` la segunda corrida descargaba y descartaba la fila.

    El recorte quedaba en disco y la base seguía diciendo que esa escena
    nunca se procesó: dos versiones de la verdad, y la corrida terminaba en
    verde.
    """
    from uri.ingestion.loader import record_satellite_scenes, register_sources

    register_sources(db_conn)
    s1 = scene("S2A_RECATALOGO", cloud=15.0, day=7)
    manifest = {"prueba": "recatalogo"}

    # Primera pasada: catálogo en seco, sin parámetros de recorte.
    record_satellite_scenes(
        db_conn, [_considerada(s1, "PRE", True, "la menos nublada", {})], manifest=manifest
    )
    # Segunda: la descarga real, con la procedencia del recorte.
    params = {"width": 560, "height": 390, "asset_path": "data/sentinel/s2/pre/x.tif"}
    _, escritas = record_satellite_scenes(
        db_conn,
        [_considerada(s1, "PRE", True, "la menos nublada", params)],
        manifest={"prueba": "recatalogo-real"},
    )
    assert escritas == 1, "la segunda pasada no puede descartarse en silencio"

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT asset_path, request_parameters, processing_date "
            "FROM rebuild_core.satellite_scene WHERE scene_id = 'S2A_RECATALOGO'"
        )
        fila = cur.fetchone()
    assert fila["asset_path"] == "data/sentinel/s2/pre/x.tif"
    assert fila["request_parameters"]["width"] == 560
    assert fila["processing_date"] is not None
    db_conn.rollback()


def test_un_catalogo_en_seco_no_borra_la_procedencia_de_un_recorte_hecho(db_conn):
    """Correr --dry-run después de una descarga dejaría el GeoTIFF en disco y
    la fila sin nada que diga con qué parámetros se produjo."""
    from uri.ingestion.loader import record_satellite_scenes, register_sources

    register_sources(db_conn)
    s1 = scene("S2A_SECO_DESPUES", cloud=15.0, day=7)
    params = {"width": 560, "height": 390, "asset_path": "data/sentinel/s2/pre/y.tif"}
    record_satellite_scenes(
        db_conn, [_considerada(s1, "PRE", True, "motivo", params)], manifest={"p": 1}
    )
    record_satellite_scenes(
        db_conn, [_considerada(s1, "PRE", True, "motivo", {})], manifest={"p": 2}
    )

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT asset_path, request_parameters FROM rebuild_core.satellite_scene "
            "WHERE scene_id = 'S2A_SECO_DESPUES'"
        )
        fila = cur.fetchone()
    assert fila["asset_path"] == "data/sentinel/s2/pre/y.tif"
    assert fila["request_parameters"]["width"] == 560
    db_conn.rollback()


# ── Teselado del terreno ────────────────────────────────────────────────


def test_las_teselas_calculadas_cubren_el_aoi_entero():
    """Una tesela de menos deja un agujero en el relieve, y se ve."""
    for zoom in (11, 12, 13, 14):
        teselas = sentinel.tiles_covering(AOI, zoom)
        assert teselas, f"z{zoom} no devolvio ninguna tesela"
        oeste = min(sentinel.tile_bounds(*t)[0] for t in teselas)
        sur = min(sentinel.tile_bounds(*t)[1] for t in teselas)
        este = max(sentinel.tile_bounds(*t)[2] for t in teselas)
        norte = max(sentinel.tile_bounds(*t)[3] for t in teselas)
        assert oeste <= AOI[0] and sur <= AOI[1]
        assert este >= AOI[2] and norte >= AOI[3]


def test_cada_zoom_cuadruplica_el_area_de_la_tesela():
    """Si el eje y se invirtiera, el terreno saldria del reves y en silencio."""
    for zoom in (11, 12, 13):
        (o1, s1, e1, n1) = sentinel.tile_bounds(zoom, 0, 0)
        (o2, s2, e2, n2) = sentinel.tile_bounds(zoom + 1, 0, 0)
        assert e2 - o2 == pytest.approx((e1 - o1) / 2)
        # La fila 0 empieza arriba en el esquema XYZ: el norte no se mueve.
        assert n2 == pytest.approx(n1)
        assert s2 > s1


def test_el_terreno_no_se_pide_por_encima_de_la_resolucion_del_dem():
    """El DEM son 30 m. A z14 una tesela de 256 px ya va a ~9,5 m/pixel: por
    encima seria inventar detalle y multiplicar las llamadas por cuatro."""
    assert sentinel.TERRAIN_MAX_ZOOM == 14
    o, s, e, n = sentinel.tile_bounds(sentinel.TERRAIN_MAX_ZOOM, 0, 0)
    metros_por_pixel = (e - o) * 111_320 / sentinel.TILE_SIZE
    assert metros_por_pixel < 30, "ya se remuestrea por encima del dato"


def test_el_evalscript_de_terreno_codifica_como_espera_maplibre():
    guion = sentinel.terrain_evalscript()
    # La formula de Mapbox que MapLibre implementa:
    # altura = -10000 + (R*65536 + G*256 + B) * 0.1
    assert "(h + 10000) / 0.1" in guion
    assert "bands: 3" in guion and 'sampleType: "UINT8"' in guion
    # Los huecos del DEM llegan muy negativos; sin la pinza saldria un pozo.
    assert "Math.max(s.DEM, 0)" in guion


def test_el_dem_se_comprueba_como_fuente_propia_y_no_como_sentinel():
    """Son licencias distintas. Si el terreno pasara por el control de
    Sentinel, una de las dos podria caer a UNCLEAR sin que la otra se
    enterase."""
    import inspect

    codigo = inspect.getsource(sentinel.CdseClient.fetch_terrain_tile)
    assert "_assert_usable_source(DEM_SOURCE_ID)" in codigo
    assert sentinel.DEM_SOURCE_ID != sentinel.SOURCE_ID


def test_la_licencia_del_dem_obliga_a_un_aviso_que_llega_a_la_pagina(db_conn):
    """El art. 6c del WorldDEM-30 exige publicar una exencion literal, que es
    una obligacion DISTINTA de la nota de fuente. La capa del SGC se publico
    incumpliendo sus terminos porque la obligacion vivia en un comentario."""
    from uri.ingestion.loader import register_sources

    register_sources(db_conn)
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT license_class::text AS lc, redistribution_allowed, share_alike, "
            "attribution_text, liability_notice FROM rebuild_core.source_register "
            "WHERE source_id = 'copernicus_dem'"
        )
        fila = cur.fetchone()
    assert fila is not None, "el DEM no esta registrado"
    assert fila["lc"] == "ATTRIBUTION"
    assert fila["redistribution_allowed"] is True
    assert fila["share_alike"] is False
    assert "Copernicus WorldDEM-30" in fila["attribution_text"]
    assert "do not incur any liability" in fila["liability_notice"]
    db_conn.rollback()
