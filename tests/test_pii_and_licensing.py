"""FR-PII-01..02, FR-LIC-01 y los controles de fuentes.md §6.

Estas pruebas no protegen una funcionalidad: protegen un compromiso legal.
Un fallo aqui no es un bug de producto, es una fuente sin licencia dentro de
un export o un dato personal dentro de la base analitica.
"""

from __future__ import annotations

import pytest

from uri.contracts import LicenseClass, SourceRegistration
from uri.contracts.enums import PROFILE_ALLOWS, ExportProfile
from uri.contracts.evidence import (
    PROHIBITED_FIELDS,
    PiiViolation,
    assert_no_prohibited_fields,
)
from uri.ingestion.loader import assert_source_usable
from uri.ingestion.registry import SOURCES, SOURCES_BY_ID


@pytest.mark.parametrize("campo", ["nombre", "cedula", "telefono", "email", "direccion"])
def test_la_ingesta_rechaza_campos_prohibidos(campo):
    """FR-PII-01 — el error nombra la columna: uno que no lo haga obliga a
    adivinar cual de cuarenta es."""
    with pytest.raises(PiiViolation, match=campo):
        assert_no_prohibited_fields(["site_id", campo, "geometry"], source="prueba")


@pytest.mark.parametrize(
    "columna",
    [
        "Nombre Completo",
        "nombre_completo",
        "numero_cedula",
        "email_contacto",
        "E-Mail",
        "TELEFONO",
        "direccion.residencia",
        "jefe_hogar_nombre",
    ],
)
def test_la_comparacion_es_por_token_no_por_nombre_exacto(columna):
    """Un diccionario que compara la columna entera deja pasar
    `nombre_completo`, que es justo como llegan los campos en la practica."""
    with pytest.raises(PiiViolation):
        assert_no_prohibited_fields(["site_id", columna], source="prueba")


@pytest.mark.parametrize(
    "columna",
    ["site_id", "geometry", "damage_level", "inspection_date", "area_m2", "commune"],
)
def test_las_columnas_legitimas_no_disparan_falsos_positivos(columna):
    assert_no_prohibited_fields([columna], source="prueba")


def test_un_lote_limpio_pasa():
    assert_no_prohibited_fields(
        ["site_id", "geometry", "damage_level", "inspection_date"], source="prueba"
    )


def test_el_diccionario_cubre_las_categorias_del_prd():
    for termino in ("nombre", "cedula", "telefono", "email", "direccion"):
        assert termino in PROHIBITED_FIELDS


def test_una_fuente_clasificada_sin_evidencia_es_rechazada():
    """fuentes.md §10 — una clasificacion optimista sin evidencia archivada es
    peor que ninguna: desactiva los controles sin que nadie se entere."""
    with pytest.raises(ValueError, match="sin terms_verified_at"):
        SourceRegistration(
            source_id="inventada",
            display_name="Inventada",
            tier="A",
            source_url="https://example.org",
            access_method="download",
            spatial_reference="EPSG:4326",
            license_class=LicenseClass.COMMERCIAL_SAFE,
        )


def test_unclear_bloquea_el_uso_de_la_fuente():
    """Control C1 — `UNCLEAR` no alimenta una feature."""
    with pytest.raises(ValueError, match="UNCLEAR"):
        assert_source_usable("unosat")
    assert_source_usable("osm")


def test_una_fuente_no_registrada_no_puede_usarse():
    with pytest.raises(ValueError, match="no registrada"):
        assert_source_usable("fuente_fantasma")


def test_el_perfil_comercial_excluye_lo_no_comercial():
    """fuentes.md §5 — el cruce de 'gratuito' y 'no comercial' es el que
    rompe un producto comercial."""
    assert LicenseClass.NON_COMMERCIAL not in PROFILE_ALLOWS[ExportProfile.COMMERCIAL]
    assert LicenseClass.NON_COMMERCIAL in PROFILE_ALLOWS[ExportProfile.INSTITUTIONAL]
    assert LicenseClass.UNCLEAR not in PROFILE_ALLOWS[ExportProfile.COMMERCIAL]
    assert LicenseClass.UNCLEAR not in PROFILE_ALLOWS[ExportProfile.INSTITUTIONAL]


def test_sertit_esta_clasificada_como_no_comercial():
    """La correccion mas importante frente a 'todo esto es gratis'."""
    assert SOURCES_BY_ID["sertit"].license_class is LicenseClass.NON_COMMERCIAL
    assert SOURCES_BY_ID["sertit"].redistribution_allowed is False


def test_el_sgc_no_es_redistribuible():
    """OI-F2 cerrado, y en la direccion restrictiva.

    Los terminos del portal del SGC prohiben reproducir, publicar o distribuir
    sin consentimiento previo por escrito. Clasificarlo asi es lo que hace que
    la puerta de publicacion lo vea; mientras estuvo en `UNCLEAR` y sellado con
    la version de otra fuente, se publicaba sin que nadie lo evaluara.
    """
    sgc = SOURCES_BY_ID["sgc"]
    assert sgc.license_class is LicenseClass.NON_COMMERCIAL
    assert sgc.redistribution_allowed is False
    assert sgc.terms_snapshot_path


def test_odbl_se_clasifica_share_alike_venga_de_donde_venga():
    """Microsoft Building Footprints se publica bajo ODbL, igual que OSM.

    Clasificarla `ATTRIBUTION` dejaba pasar la obligacion de compartir igual
    por la puerta de perfiles: dos fuentes con la MISMA licencia no pueden
    tener clases distintas.
    """
    for source_id in ("osm", "microsoft_buildings"):
        source = SOURCES_BY_ID[source_id]
        assert "ODbL" in (source.license_name or ""), source_id
        assert source.license_class is LicenseClass.SHARE_ALIKE, source_id
        assert source.share_alike is True, source_id


def test_osm_arrastra_share_alike():
    """OI-F1 sigue abierto; mientras tanto la marca viaja en el registro."""
    osm = SOURCES_BY_ID["osm"]
    assert osm.license_class is LicenseClass.SHARE_ALIKE
    assert osm.share_alike is True
    assert osm.attribution_text == "© OpenStreetMap contributors"


def test_toda_fuente_clasificada_tiene_atribucion_literal():
    """FR-LIC-01 — el texto exacto que aparece en el export, no una
    descripcion de lo que habria que poner."""
    for source in SOURCES:
        if source.usable:
            assert source.attribution_text, source.source_id


def test_las_fuentes_sin_verificar_siguen_en_unclear():
    """Si alguna de estas cambia, es porque alguien hizo la auditoria de
    fuentes.md §10 — y entonces esta prueba debe actualizarse a mano."""
    sin_verificar = {s.source_id for s in SOURCES if s.license_class is LicenseClass.UNCLEAR}
    # igac_catastro entro el 2026-09-16 TRAS auditarla, no por no mirarla: la
    # capa cubre el AOI con 47.443 predios y no declara licencia ninguna.
    assert sin_verificar == {"unosat", "igac_catastro"}


def test_copernicus_es_redistribuible_y_sertit_no():
    """El cruce que decide qué se puede publicar.

    Ambos son teledetección del mismo evento y se parecen en todo menos en lo
    único que importa aquí: Copernicus EMS publica bajo CC BY 4.0; SERTIT
    prohíbe la reproducción sin autorización escrita previa.
    """
    assert SOURCES_BY_ID["copernicus_ems"].redistribution_allowed is True
    assert SOURCES_BY_ID["sertit"].redistribution_allowed is False


def test_el_generador_sintetico_esta_retirado():
    """Solo el diagnóstico puede invocarlo, y únicamente para medir la
    dependencia histórica que motivó retirarlo."""
    from uri.ingestion.synthetic import SyntheticDataProhibited, _guard

    with pytest.raises(SyntheticDataProhibited, match="retirado"):
        _guard("pipeline")
    _guard("signal_check")


def test_copernicus_sustituye_a_sertit_como_fuente_de_dano():
    """La capa de daño publicable es la de Copernicus, no la de SERTIT."""
    copernicus = SOURCES_BY_ID["copernicus_ems"]
    assert copernicus.license_class is LicenseClass.ATTRIBUTION
    assert copernicus.redistribution_allowed is True
    assert "European Union" in copernicus.attribution_text


def test_el_generador_ya_no_esta_registrado_como_fuente():
    assert "synthetic" not in SOURCES_BY_ID
    assert "microsoft_buildings" in SOURCES_BY_ID


# ── IGAC: disponible no es lo mismo que permitido ───────────────────────


def test_el_catastro_de_igac_esta_bloqueado_por_no_declarar_licencia():
    """La capa cubre el AOI con 47.443 predios y se descarga en un minuto.
    Lo que no tiene es una sola frase que diga que se puede hacer con ella.

    Esta prueba existe para que desbloquearla cueste borrarla, y borrarla
    obligue a releer db/terms/igac_catastro_20260916.txt. Asi se publico la
    capa del SGC durante semanas incumpliendo sus terminos: no por mala fe,
    sino porque "esta disponible" se confundio con "se puede usar".
    """
    igac = SOURCES_BY_ID["igac_catastro"]
    assert igac.license_class is LicenseClass.UNCLEAR
    assert igac.redistribution_allowed is None, (
        "sin licencia no se afirma que se pueda redistribuir"
    )
    assert igac.terms_snapshot_path, "un UNCLEAR sin auditoria escrita es una corazonada"

    with pytest.raises(ValueError, match="UNCLEAR"):
        assert_source_usable("igac_catastro")


def test_las_fuentes_auditadas_de_esta_tanda_si_pasan_el_control():
    """El control tiene que discriminar, no bloquear todo por igual."""
    for source_id in ("dane_censo_2018", "copernicus_dem", "copernicus_sentinel"):
        assert_source_usable(source_id)
