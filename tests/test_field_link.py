"""ADR-24 §6 — el enlace de una foto de campo a un sitio, regla `campo-v2`.

Geometrías de prueba (cuadrados en metros), no datos urbanos: lo que se
prueba es la regla, no Pereira.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "build_field_photos", Path(__file__).resolve().parents[1] / "scripts" / "build_field_photos.py"
)
bfp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bfp)


class Metric(bfp.Proj):
    """Proyección identidad: las coordenadas de prueba ya están en metros."""

    def __init__(self) -> None:
        pass

    def xy(self, lon, lat):
        return lon, lat

    def lonlat(self, x, y):
        return x, y


AOI = (-1000.0, -1000.0, 1000.0, 1000.0)
P = Metric()


def square(site_id: str, x: float, y: float, side: float = 10.0) -> dict:
    ring = [(x, y), (x + side, y), (x + side, y + side), (x, y + side), (x, y)]
    return {"site_id": site_id, "ring": ring}


def obs(lon=0.0, lat=0.0, accuracy=3.0, offset=None, heading=None) -> dict:
    return {
        "lon": lon,
        "lat": lat,
        "accuracy_m": accuracy,
        "exif_device_offset_m": offset,
        "heading_deg": heading,
    }


def test_dentro_del_poligono_enlaza_a_distancia_cero():
    m = bfp.link(obs(5, 5), [square("a", 0, 0)], P, AOI)
    assert m["status"] == "LINKED" and m["site_id"] == "a" and m["distance_m"] == 0


def test_la_distancia_es_al_borde_no_al_centro():
    m = bfp.link(obs(-30, 5), [square("a", 0, 0, side=100)], P, AOI)
    assert m["distance_m"] == pytest.approx(30, abs=0.1)
    # y el punto medido es el del borde, que es lo que el visor dibuja
    assert m["candidates"][0]["nearest"] == pytest.approx((0, 5))


def test_mas_alla_de_75_m_no_se_enlaza():
    m = bfp.link(obs(-80, 5), [square("a", 0, 0)], P, AOI)
    assert m["status"] == "UNLINKED" and m["reason"] == "NO_SITE_WITHIN_RANGE"


def test_un_rival_dentro_del_margen_vuelve_ambigua_la_foto():
    sites = [square("a", 30, 0), square("b", -45, 0)]  # a 30 m y a ~35 m
    m = bfp.link(obs(0, 5), sites, P, AOI)
    assert m["status"] == "AMBIGUOUS" and m["site_id"] is None
    assert {c["site_id"] for c in m["candidates"]} == {"a", "b"}


def test_el_rival_cuenta_aunque_pase_de_75_m():
    """Ganador a 60 m, segundo a 80 m, incertidumbre 15 m: margen 30 m."""
    sites = [square("a", 60, 0), square("b", -90, 0)]
    m = bfp.link(obs(0, 5, accuracy=15), sites, P, AOI)
    assert m["status"] == "AMBIGUOUS"


def test_la_incertidumbre_incluye_el_desacuerdo_gps_exif():
    """El teléfono dice 3 m, pero su GPS y el de la foto discrepan 40 m."""
    sites = [square("a", 30, 0), square("b", -100, 0)]  # 30 m y 90 m
    assert bfp.link(obs(0, 5, accuracy=3), sites, P, AOI)["status"] == "LINKED"
    m = bfp.link(obs(0, 5, accuracy=3, offset=40), sites, P, AOI)
    assert m["uncertainty_m"] == 40 and m["status"] == "AMBIGUOUS"


def test_con_rumbo_lo_que_queda_a_espaldas_no_es_lo_fotografiado():
    """La cámara mira al norte; el único sitio cercano está al sur."""
    m = bfp.link(obs(0, 0, heading=0), [square("sur", -5, -40)], P, AOI)
    assert m["status"] == "UNLINKED" and m["reason"] == "NO_SITE_IN_VIEW"


def test_con_rumbo_gana_el_que_esta_en_el_encuadre():
    sites = [square("sur", -5, -25), square("norte", -5, 40)]
    m = bfp.link(obs(0, 0, heading=0), sites, P, AOI)
    assert (
        m["status"] == "LINKED" and m["site_id"] == "norte" and m["reason"] == "HEADING_CONFIRMED"
    )


def test_fuera_del_sector_no_se_fuerza_un_enlace():
    m = bfp.link(obs(5000, 0), [square("a", 4990, 0)], P, AOI)
    assert m["status"] == "UNLINKED" and m["reason"] == "OUTSIDE_STUDY_AREA"


def test_cero_solo_si_esta_dentro():
    m = bfp.link(obs(-0.04, 5), [square("a", 0, 0)], P, AOI)
    assert m["distance_m"] == 0.1
