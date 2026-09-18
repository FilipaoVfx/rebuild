"""ADR-22 — identidad de lugar: adaptador de lugares, gazetteer y formato.

Las pruebas de adaptador y formato son deterministas y corren sin base. Las
del gazetteer leen lo que dejo `scripts/run_pipeline.py` y se saltan sin el.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from uri.contracts.place import corner_label, format_place_line, road_axis
from uri.db import fetch_all, fetch_one
from uri.ingestion.adapters import osm, pereira_sig

FIXTURE = Path(__file__).parent / "fixtures" / "osm_places_sample.json"


# ── Adaptador ───────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def places() -> osm.OsmPlaces:
    return osm.load_places(FIXTURE)


def test_los_limites_administrativos_traen_sus_miembros_como_lineas(places):
    """El multipoligono se arma en PostGIS; el adaptador solo entrega el linework."""
    barrio = next(a for a in places.admin_areas if a.admin_level == 9)
    assert barrio.name == "Barrio Prueba"
    assert len(barrio.member_wkts) == 3
    assert all(w.startswith("LINESTRING(") for w in barrio.member_wkts)


def test_del_nivel_7_solo_entra_el_perimetro_urbano_de_pereira(places):
    """El AMCO tambien es nivel 7 y cubre cuatro municipios."""
    nivel7 = [a.name for a in places.admin_areas if a.admin_level == 7]
    assert nivel7 == ["Perimetro Urbano Pereira"]


def test_la_ciudad_trae_poblacion_y_wikidata(places):
    ciudad = next(p for p in places.places if p.place == "city")
    assert ciudad.population == 477027
    assert ciudad.wikidata == "Q51111"
    assert ciudad.wkt.startswith("POINT(")


def test_un_rio_sin_nombre_no_es_un_rio_para_el_visor(places):
    assert [w.name for w in places.waterways] == ["Río Prueba"]


def test_las_prioridades_de_los_hitos(places):
    """1 gobierno, 2 lo que orienta a cualquiera, 4 lo que solo orienta a su
    feligresia. Una entrada en Wikidata sube a 2; una catedral tambien."""
    por_nombre = {lm.name: lm for lm in places.landmarks}
    assert por_nombre["Alcaldía de Prueba"].priority == 1
    assert por_nombre["Monumento Prueba"].priority == 2  # wikidata
    assert por_nombre["Catedral de Prueba"].priority == 2
    assert por_nombre["Capilla Prueba"].priority == 4
    assert por_nombre["Parque Chico"].priority == 4  # < 1 ha
    assert por_nombre["Terminal de Prueba"].priority == 2
    assert por_nombre["Expreso Prueba"].priority == 3  # taquilla, no terminal


def test_un_puente_con_nombre_de_calle_no_es_un_hito(places):
    nombres = {lm.name for lm in places.landmarks}
    assert "Calle 14" not in nombres
    assert "Viaducto Prueba" in nombres
    # Una arteria con nombre propio de puente es arteria Y hito.
    assert "El Puente Prueba" in nombres
    assert any(a.highway == "trunk" and a.name == "El Puente Prueba" for a in places.arterials)


def test_las_arterias_son_solo_las_clases_que_el_grafo_peatonal_excluye(places):
    assert {a.highway for a in places.arterials} <= osm.ARTERIAL
    assert "Avenida Prueba" in {a.name for a in places.arterials}


def test_el_extracto_real_esta_archivado_y_se_lee():
    """fuentes.md §11, regla 3: el artefacto versionado es la unica forma de
    reconstruir la data_version sin depender de Overpass."""
    real = osm.load_places(Path(__file__).parents[1] / "db" / "seed" / "osm_places_pereira.json.gz")
    counts = real.counts()
    assert counts["admin_areas"] >= 200
    assert counts["landmarks"] >= 100
    assert counts["waterways"] >= 20
    assert any(p.place == "city" and p.name == "Pereira" for p in real.places)


# ── Capas municipales ───────────────────────────────────────────────────


def test_el_extracto_municipal_se_mapea_antes_del_control_de_pii():
    """`NOMBRE` tokeniza a `nombre` y el diccionario lo prohibe: por eso el
    adaptador mapea a `display_name` ANTES de correr el control. Si alguien
    invierte el orden, esta prueba falla con PiiViolation."""
    seed = Path(__file__).parents[1] / "db" / "seed"
    facilities = pereira_sig.load_layer(
        seed / "pereira_sig_equipamientos.geojson.gz", pereira_sig.LAYERS_BY_KEY["facilities"]
    )
    assert len(facilities) >= 300
    assert all(f.geometry["type"] in {"Polygon", "MultiPolygon"} for f in facilities)
    assert any(f.kind == "EDUCACIÓN" for f in facilities)


def test_el_extracto_municipal_no_archiva_la_direccion():
    """`Espacio Público actual` trae DIRECCION y no se pide ni se archiva."""
    import gzip
    import json

    seed = Path(__file__).parents[1] / "db" / "seed" / "pereira_sig_espacio_publico.geojson.gz"
    with gzip.open(seed, "rt", encoding="utf-8") as handle:
        collection = json.load(handle)
    campos = {k for f in collection["features"] for k in (f.get("properties") or {})}
    assert "DIRECCION" not in campos
    assert campos <= set(pereira_sig.LAYERS_BY_KEY["public_space"].out_fields)


# ── Formato ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("nombre", "eje"),
    [
        ("Calle 19", "calle"),
        ("Cl. 19", "calle"),
        ("Carrera 8", "carrera"),
        ("Cra 7 Bis", "carrera"),
        ("Kr 12", "carrera"),
        ("Avenida 30 de Agosto", "otra"),
        ("Av. Circunvalar", "otra"),
        ("Vía Cerritos", "otra"),
        ("El Guaducto", None),
        ("Megabus", None),
        (None, None),
    ],
)
def test_el_eje_de_una_via_se_lee_de_su_nombre(nombre, eje):
    assert road_axis(nombre) == eje


def test_una_esquina_es_una_via_con_otra():
    assert corner_label("Calle 19", "Carrera 8") == "Calle 19 con Carrera 8"
    assert corner_label("Avenida Circunvalar", None) == "sobre Avenida Circunvalar"
    assert corner_label(None, None) is None


def test_la_linea_de_lugar_omite_lo_que_falta_y_nunca_lo_rellena():
    assert (
        format_place_line("San Nicolás", "Centro", "Calle 19 con Carrera 8", "Parque El Lago", 180)
        == "Barrio San Nicolás · Comuna Centro · Calle 19 con Carrera 8 · a 180 m de Parque El Lago"
    )
    assert format_place_line(None, "Centro", None, None, None) == "Comuna Centro"
    assert format_place_line(None, None, None, "Catedral", None) == "cerca de Catedral"
    assert format_place_line(None, None, None, None, None) is None


# ── Gazetteer sobre la base cargada ────────────────────────────────────


@pytest.fixture
def con_lugares(db_conn):
    row = fetch_one(db_conn, "SELECT count(*) AS n FROM rebuild_osm_derived.site_place")
    if not row or row["n"] == 0:
        pytest.skip("sin pipeline ejecutado: corra scripts/run_pipeline.py")
    return db_conn


def test_los_limites_cargados_son_multipoligonos_validos(con_lugares):
    row = fetch_one(
        con_lugares,
        """
        SELECT count(*) AS n,
               count(*) FILTER (WHERE NOT ST_IsValid(geometry)) AS invalidos,
               count(*) FILTER (WHERE admin_level = 7) AS perimetro,
               count(*) FILTER (WHERE admin_level = 8) AS comunas
        FROM rebuild_osm_raw.admin_area
        """,
    )
    assert row["invalidos"] == 0
    assert row["perimetro"] == 1
    assert row["comunas"] >= 10


def test_todo_sitio_tiene_fila_de_lugar_y_la_mayoria_tiene_comuna(con_lugares):
    """La fila existe siempre; el contenido puede faltar, y entonces es NULL
    declarado — no el barrio del vecino."""
    row = fetch_one(
        con_lugares,
        """
        SELECT (SELECT count(*) FROM rebuild_core.site) AS sitios,
               (SELECT count(*) FROM rebuild_osm_derived.site_place) AS lugares,
               (SELECT count(*) FROM rebuild_osm_derived.site_place
                 WHERE commune IS NOT NULL) AS con_comuna
        """,
    )
    assert row["lugares"] == row["sitios"]
    assert row["con_comuna"] >= 0.9 * row["sitios"]


def test_las_esquinas_tienen_la_forma_de_una_esquina(con_lugares):
    rows = fetch_all(
        con_lugares,
        "SELECT corner_label FROM rebuild_osm_derived.site_place WHERE corner_label IS NOT NULL",
    )
    assert rows
    for row in rows:
        assert " con " in row["corner_label"] or row["corner_label"].startswith("sobre ")


def test_una_esquina_nunca_junta_dos_calles(con_lugares):
    """Dos calles paralelas no se cruzan: si aparece, el eje se leyo mal."""
    rows = fetch_all(
        con_lugares,
        "SELECT corner_road_a AS a, corner_road_b AS b FROM rebuild_osm_derived.site_place "
        "WHERE corner_road_b IS NOT NULL",
    )
    for row in rows:
        eje_a, eje_b = road_axis(row["a"]), road_axis(row["b"])
        assert not (eje_a == eje_b and eje_a in {"calle", "carrera"}), row


def test_la_cobertura_de_lugar_se_declara_en_una_alerta_si_falta(con_lugares):
    faltan = fetch_one(
        con_lugares,
        "SELECT count(*) AS n FROM rebuild_osm_derived.site_place "
        "WHERE commune IS NULL OR neighborhood IS NULL",
    )["n"]
    alertas = fetch_one(
        con_lugares,
        "SELECT count(*) AS n FROM rebuild_core.quality_alert WHERE code = 'PLACE_COVERAGE'",
    )["n"]
    assert (alertas >= 1) == (faltan > 0)


def test_la_api_de_sitios_lleva_la_linea_de_lugar(con_lugares):
    from uri.api.app import list_sites

    respuesta = list_sites(
        con_lugares,
        bbox=None,
        state=None,
        min_score=None,
        max_risk=None,
        intervention=None,
        limit=20,
    )
    assert respuesta.sites
    con_linea = [s for s in respuesta.sites if s.place_line]
    assert con_linea, "ningun sitio trae place_line"
    primero = con_linea[0]
    if primero.neighborhood:
        assert primero.place_line.startswith(f"Barrio {primero.neighborhood}")


def test_el_territorio_responde_con_ciudad_evento_y_comunas(con_lugares):
    from uri.api.app import territory

    payload = territory(con_lugares)
    assert payload["city"]["display_name"] == "Pereira"
    assert payload["event"]["magnitude"] == 7.4
    assert payload["event"]["distance_km"] and 30 < payload["event"]["distance_km"] < 120
    assert payload["urban_perimeter"]["area_km2"] > 0
    assert payload["comunas"] and payload["comunas"][0]["sites"] >= 1
    assert payload["imagery"]["sentinel"]["available"] in (True, False)
    for orto in payload["imagery"]["ortofotos"]:
        # Ninguna ortofoto se publica mientras su fuente siga en UNCLEAR.
        assert orto["status"] == "UNAVAILABLE"
        assert orto["reason"]
