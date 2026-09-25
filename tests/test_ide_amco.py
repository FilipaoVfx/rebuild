"""ADR-26 — el POT se lee de IDE AMCO, con puerta y con criterio declarado.

Tres cosas que estas pruebas sostienen:

1. La fuente responde, y responder no es permitir: sigue en UNCLEAR y todo
   lo que descarga va al sandbox.
2. El cruce con los sitios dice cuánto del sitio cae en cada sector y
   distingue "fuera de la capa" de "capa no consultada".
3. El criterio de compatibilidad es una tabla con razones, completa para lo
   que el POT publica, y nunca adivina un caso que no contempla.

Las geometrías de aquí son cuadrados de prueba, no el POT: el POT no se
versiona mientras su licencia no esté declarada.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from uri.constraints import pot
from uri.contracts.enums import InterventionType
from uri.contracts.opportunity import FeasibilityStatus
from uri.ingestion import registry
from uri.ingestion.adapters import ide_amco
from uri.ingestion.loader import PEREIRA_BBOX, assert_source_usable
from uri.opportunities.feasibility import check_land_use, check_risk

ROOT = Path(__file__).resolve().parents[1]


def cuadrado(x0: float, y0: float, lado: float, huecos: list | None = None) -> dict:
    anillo = [[x0, y0], [x0 + lado, y0], [x0 + lado, y0 + lado], [x0, y0 + lado], [x0, y0]]
    return {"type": "Polygon", "coordinates": [anillo, *(huecos or [])]}


def coleccion(*rasgos: tuple[dict, dict], **extra) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": g, "properties": p} for g, p in rasgos],
        **extra,
    }


SECTOR_RESIDENCIAL = {
    "sectnorm": 3,
    "cattrat": "Consolidación",
    "subcattrat": "Consolidación con densificación",
    "actividad": "Residencial",
}
SECTOR_REDESARROLLO = {
    "sectnorm": "10",
    "cattrat": "Renovación urbana",
    "subcattrat": "Renovación urbana modalidad Redesarrollo",
    "actividad": "  Actividad Multiple ",
}


# ── 1. Disponible no es lo mismo que permitido ──────────────────────────


def test_ide_amco_esta_registrada_y_bloqueada_por_no_declarar_licencia():
    """El servicio responde y cubre 112 de 115 sitios. Lo que no tiene es una
    frase de términos: NONE es el valor por defecto de GeoServer."""
    fila = registry.SOURCES_BY_ID["ide_amco"]
    assert fila.license_class.value == "UNCLEAR"
    assert fila.redistribution_allowed is None
    assert fila.terms_snapshot_path
    snapshot = ROOT / "db" / "terms" / Path(fila.terms_snapshot_path).name
    assert snapshot.exists(), "un UNCLEAR sin auditoría escrita es una corazonada"
    with pytest.raises(ValueError, match="UNCLEAR"):
        assert_source_usable("ide_amco")


def test_todo_lo_que_descarga_va_al_sandbox():
    assert ide_amco.is_publishable() is False
    assert ide_amco.output_dir() == ide_amco.SANDBOX
    assert "data/ide_amco/" in (ROOT / ".gitignore").read_text(encoding="utf-8")


def test_solo_se_piden_las_capas_declaradas():
    """El espacio de trabajo mezcla capas con datos personales; se piden una
    por una, nunca el espacio entero."""
    nombres = {layer.type_name for layer in ide_amco.LAYERS}
    assert nombres == {
        "amco:pot_sectores_normativos",
        "amco:pot_microzonificacion_sismica",
        "amco:pere_zonsism",
        "amco:dosq_zonsism",
    }
    assert not any("personas" in n for n in nombres)


def test_la_consulta_archivada_es_la_procedencia():
    url = ide_amco.getfeature_url(ide_amco.LAYERS_BY_KEY["sectores_normativos"], PEREIRA_BBOX)
    assert url.startswith(ide_amco.WFS_URL + "?")
    assert "request=GetFeature" in url
    assert "typeNames=amco%3Apot_sectores_normativos" in url
    assert "bbox=-75.7251%2C4.7878%2C-75.6748%2C4.8229%2CEPSG%3A4326" in url


def test_una_respuesta_truncada_se_rechaza():
    payload = coleccion((cuadrado(-75.70, 4.80, 0.01), {}), numberMatched=2000, numberReturned=1000)
    with pytest.raises(ValueError, match="truncada"):
        ide_amco.check_collection(payload, PEREIRA_BBOX)


def test_unos_ejes_invertidos_se_rechazan():
    """lat/lon en vez de lon/lat no rompe ningún cruce: simplemente no cruza
    nada. Por eso se comprueba antes de archivar."""
    invertido = cuadrado(4.80, -75.70, 0.01)
    with pytest.raises(ValueError, match="ejes invertidos"):
        ide_amco.check_collection(coleccion((invertido, {})), PEREIRA_BBOX)
    ide_amco.check_collection(coleccion((cuadrado(-75.70, 4.80, 0.01), {})), PEREIRA_BBOX)


# ── 2. El cruce ─────────────────────────────────────────────────────────


def test_los_atributos_se_limpian_al_leer():
    [sector] = ide_amco.parse_sectors(coleccion((cuadrado(0, 0, 1), SECTOR_REDESARROLLO)))
    assert sector.attrs.sector == 10
    assert sector.attrs.actividad == "Actividad Multiple"
    [zona] = ide_amco.parse_zones(
        coleccion((cuadrado(0, 0, 1), {"zona": "ZONA 4", "leyenda": "Zona 4 Cenizas volcanicas"})),
        municipio="Dosquebradas",
    )
    assert zona.attrs.leyenda == "Cenizas volcanicas", "la leyenda no repite la zona"
    assert zona.attrs.municipio == "Dosquebradas"


def test_un_hueco_no_cuenta_como_dentro():
    hueco = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]
    g = cuadrado(0, 0, 1, [hueco])
    assert ide_amco.contains(g, 0.2, 0.2)
    assert not ide_amco.contains(g, 0.5, 0.5)
    assert not ide_amco.contains(g, 1.5, 0.5)


def test_un_sitio_entre_dos_sectores_dice_cuanto_cae_en_cada_uno():
    """Decidirlo por el centroide escondería que el sitio está partido."""
    sectores = ide_amco.parse_sectors(
        coleccion(
            (cuadrado(0, 0, 1), SECTOR_RESIDENCIAL),
            (cuadrado(1, 0, 1), SECTOR_REDESARROLLO),
        )
    )
    sitio = {
        "type": "Polygon",
        "coordinates": [[[0.3, 0.2], [1.1, 0.2], [1.1, 0.8], [0.3, 0.8], [0.3, 0.2]]],
    }
    match = ide_amco.match_site(sitio, sectores)
    assert match.attrs.actividad == "Residencial"
    assert 0.7 < match.share < 0.95
    assert match.covered == pytest.approx(1.0)


def test_fuera_de_la_capa_no_es_lo_mismo_que_capa_no_consultada():
    sectores = ide_amco.parse_sectors(coleccion((cuadrado(0, 0, 1), SECTOR_RESIDENCIAL)))
    zonas = ide_amco.parse_zones(
        coleccion((cuadrado(5, 5, 1), {"zona": "ZONA 4", "leyenda": "x"})), municipio="Dosquebradas"
    )
    [(_, fuera)] = ide_amco.site_attributes(
        [("site_x", cuadrado(5.2, 5.2, 0.2))], sectors=sectores, zones=zonas
    ).items()
    assert fuera["pot_sector"] is None, "la clave está: se consultó y el sitio cae fuera"
    assert fuera["pot_municipio"] == "Dosquebradas"

    uso = check_land_use(fuera, InterventionType.PARK)
    assert uso.status is FeasibilityStatus.UNKNOWN
    assert "Dosquebradas" in uso.detail and uso.source_id is None

    sin_consultar = check_land_use({"land_use_compatibility": None}, InterventionType.PARK)
    assert "pendiente de licencia" in sin_consultar.detail


def test_la_discrepancia_entre_versiones_se_declara():
    sectores = ide_amco.parse_sectors(coleccion((cuadrado(0, 0, 1), SECTOR_RESIDENCIAL)))
    zonas = ide_amco.parse_zones(
        coleccion((cuadrado(0, 0, 1), {"zona": "ZONA 3", "leyenda": "Cenizas"})),
        municipio="Pereira",
    )
    alternas = ide_amco.parse_zones(
        coleccion((cuadrado(0, 0, 1), {"zona": "ZONA 6", "leyenda": "Llenos"})), municipio="Pereira"
    )
    attrs = ide_amco.site_attributes(
        [("s", cuadrado(0.2, 0.2, 0.3))], sectors=sectores, zones=zonas, zones_alt=alternas
    )["s"]
    riesgo = check_risk(attrs, InterventionType.PARK)
    assert riesgo.status is FeasibilityStatus.UNKNOWN, "una zona no es un nivel de riesgo"
    assert "zona 3" in riesgo.detail and "zona 6" in riesgo.detail
    assert riesgo.source_id is None


# ── 3. El criterio ──────────────────────────────────────────────────────


def test_el_criterio_esta_en_borrador_y_lo_dice():
    assert pot.ESTADO_CRITERIO == "BORRADOR"
    check = check_land_use(
        {"pot_sector": {**_sector(SECTOR_RESIDENCIAL), "cobertura": 1.0}}, InterventionType.PARK
    )
    assert check.status is FeasibilityStatus.OK
    assert check.source_id == "ide_amco"
    assert "borrador" in check.detail


@pytest.mark.parametrize("actividad", sorted(pot.POR_ACTIVIDAD))
def test_cada_area_de_actividad_responde_por_las_seis_intervenciones(actividad):
    fila = pot.POR_ACTIVIDAD[actividad]
    assert set(fila) == set(InterventionType)
    for compatibilidad, razon in fila.values():
        assert isinstance(compatibilidad, pot.Compatibilidad)
        assert len(razon) > 20, "cada celda lleva su razón escrita"


def test_las_tablas_cubren_lo_que_el_pot_publica_en_el_aoi():
    """Los valores que devolvió el servicio el 2026-09-24. Si el POT publica
    uno nuevo, la viabilidad dirá UNKNOWN hasta que alguien lo escriba aquí."""
    for actividad in (
        "Actividad Multiple",
        "Residencial",
        "Centralidad Metropolitana",
        "Equipamiento",
        "Suelo de protección",
    ):
        assert pot._clave(actividad) in pot.POR_ACTIVIDAD, actividad
    for tratamiento in (
        "Consolidación simple",
        "Consolidación con densificación",
        "Consolidación con densificación (Mayor 1 ha)",
        "Renovación urbana modalidad Redesarrollo",
        "Renovación urbana modalidad Reactivación",
        "Desarrollo en suelo de expansión urbana",
        "Suelo de protección",
    ):
        assert pot._clave(tratamiento) in pot.POR_TRATAMIENTO, tratamiento


def test_el_redesarrollo_condiciona_toda_obra_pero_no_el_no_construir():
    for tipo in InterventionType:
        veredicto = pot.evaluar(
            actividad="Actividad Multiple",
            tratamiento="Renovación urbana",
            subtratamiento="Renovación urbana modalidad Redesarrollo",
            intervention=tipo,
        )
        esperado = (
            pot.Compatibilidad.COMPATIBLE
            if tipo is InterventionType.NO_BUILD
            else pot.Compatibilidad.CONDICIONADA
        )
        assert veredicto.compatibilidad is esperado, tipo


def test_un_equipamiento_no_cabe_en_suelo_de_proteccion():
    check = check_land_use(
        {
            "pot_sector": {
                "sector": 17,
                "tratamiento": "Suelo de protección",
                "subtratamiento": "Suelo de protección",
                "actividad": "Suelo de protección",
                "cobertura": 0.54,
            }
        },
        InterventionType.COMMUNITY_FACILITY,
    )
    assert check.status is FeasibilityStatus.BLOCKED
    assert "Ley 388" in check.detail
    assert "54 %" in check.detail, "un sitio partido lo dice"


def test_un_valor_que_el_criterio_no_contempla_es_desconocido():
    """Nunca se toma el caso más parecido."""
    assert (
        pot.evaluar(
            actividad="Industrial",
            tratamiento="Consolidación",
            subtratamiento=None,
            intervention=InterventionType.PARK,
        )
        is None
    )
    check = check_land_use(
        {
            "pot_sector": {
                "sector": 1,
                "tratamiento": "Mejoramiento integral",
                "actividad": "Residencial",
                "cobertura": 1.0,
            }
        },
        InterventionType.PARK,
    )
    assert check.status is FeasibilityStatus.UNKNOWN
    assert check.source_id is None


def test_las_claves_no_dependen_de_tildes_ni_mayusculas():
    assert pot._clave("  Actividad  Múltiple ") == pot._clave("actividad multiple")


def _sector(props: dict) -> dict:
    return {
        "sector": props["sectnorm"],
        "tratamiento": props["cattrat"],
        "subtratamiento": props["subcattrat"],
        "actividad": props["actividad"],
    }
