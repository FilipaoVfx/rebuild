"""ADR-22 §6 — las ortofotos tienen puerta, y la puerta esta cerrada.

La imagen mas valiosa que existe para este producto (la ortofoto municipal del
14-08-2026) no declara terminos, y la del IGAC tiene licencia condicionada a
una titularidad sin confirmar. Estas pruebas existen para que publicarlas
cueste cambiar una fila del registro con su auditoria, no mover una carpeta.
"""

from __future__ import annotations

import pytest

from uri.ingestion.adapters import ortofoto


@pytest.mark.parametrize("source_id", sorted(ortofoto.SOURCES_BY_KEY))
def test_ninguna_ortofoto_es_publicable_todavia(source_id):
    assert ortofoto.is_publishable(source_id) is False
    destino = ortofoto.output_dir(source_id)
    assert destino.parent == ortofoto.SANDBOX, destino
    assert ".sandbox" in destino.parts


def test_una_ortofoto_no_registrada_no_tiene_destino():
    with pytest.raises(ValueError, match="no es una ortofoto registrada"):
        ortofoto.output_dir("ortofoto_fantasma")


def test_el_sandbox_esta_fuera_de_git():
    gitignore = (ortofoto.ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "data/ortofoto/" in gitignore


def test_las_teselas_se_piden_en_web_mercator_estandar():
    """Una tesela z0 es el mundo entero; z1/0/0 el cuadrante noroeste."""
    west, south, east, north = ortofoto.mercator_bounds(0, 0, 0)
    assert west == pytest.approx(-20037508.34, abs=1)
    assert east == pytest.approx(20037508.34, abs=1)
    assert north == pytest.approx(20037508.34, abs=1)
    assert south == pytest.approx(-20037508.34, abs=1)
    west, south, east, north = ortofoto.mercator_bounds(1, 0, 0)
    assert east == pytest.approx(0, abs=1)
    assert south == pytest.approx(0, abs=1)


def test_el_wms_se_pide_por_tesela_y_en_3857():
    source = ortofoto.SOURCES_BY_KEY["igac_ortofoto"]
    url = ortofoto.tile_url(source, 14, 4746, 7970)
    assert "REQUEST=GetMap" in url
    assert "CRS=EPSG%3A3857" in url
    assert "WIDTH=256" in url and "HEIGHT=256" in url


def test_el_cache_municipal_se_pide_como_z_y_x():
    source = ortofoto.SOURCES_BY_KEY["pereira_ortofoto_post"]
    assert ortofoto.tile_url(source, 15, 100, 200).endswith("/tile/15/200/100")


def test_un_cache_que_no_sea_web_mercator_se_rechaza():
    ok = {
        "tileInfo": {
            "rows": 256,
            "cols": 256,
            "origin": {"x": -20037508.342787, "y": 20037508.342787},
            "spatialReference": {"wkid": 102100, "latestWkid": 3857},
        }
    }
    ortofoto.check_tile_scheme(ok)
    with pytest.raises(ValueError, match="WKID 9377"):
        ortofoto.check_tile_scheme(
            {"tileInfo": {**ok["tileInfo"], "spatialReference": {"wkid": 9377}}}
        )
    with pytest.raises(ValueError, match="512x512"):
        ortofoto.check_tile_scheme({"tileInfo": {**ok["tileInfo"], "rows": 512, "cols": 512}})


def test_el_formato_de_la_imagen_sale_de_los_bytes_no_de_la_url():
    assert ortofoto.image_format(b"\xff\xd8\xff\xe0" + b"\x00" * 20) == "jpg"
    assert ortofoto.image_format(b"\x89PNG\r\n\x1a\n" + b"\x00" * 20) == "png"
    with pytest.raises(ValueError, match="no es una imagen"):
        ortofoto.image_format(b"<html>mantenimiento</html>")
