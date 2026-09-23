"""Identidad de lugar de un sitio (ADR-22).

Un sitio se presenta como "Barrio X · Comuna Y · Calle 19 con Carrera 8 · a
180 m de Parque El Lago": nivel de cuadra, nunca de predio (SRS §6). Lo que
falta se omite; nunca se rellena.
"""

from __future__ import annotations

import re

#: Ejes de la nomenclatura de Pereira. Una esquina es una calle CON una
#: carrera; dos calles no hacen esquina.
_CALLE = re.compile(r"^(calle|cl|cll)\.?\s", re.IGNORECASE)
_CARRERA = re.compile(r"^(carrera|cra|cr|kr|kra)\.?\s", re.IGNORECASE)

#: Una via que no es calle ni carrera solo hace esquina si se llama como una
#: via: "Avenida 30 de Agosto con Calle 19" orienta; "Carrera 30 con El
#: Guaducto" (un puente) o "Calle 25 con Megabus" (la troncal) no.
_OTRA_VIA = re.compile(
    r"^(avenida|av|autopista|v[ií]a|transversal|tv|diagonal|dg|circunvalar|variante|troncal)\b\.?",
    re.IGNORECASE,
)

#: Los mismos patrones, en la sintaxis POSIX que entiende PostgreSQL. El SQL
#: del gazetteer se genera desde aqui para que la regla exista una sola vez.
SQL_CALLE = r"^(calle|cl|cll)\.?\s"
SQL_CARRERA = r"^(carrera|cra|cr|kr|kra)\.?\s"
SQL_OTRA_VIA = (
    r"^(avenida|av|autopista|v[ií]a|transversal|tv|diagonal|dg|circunvalar|variante|troncal)\M"
)


def road_axis(display_name: str | None) -> str | None:
    """`calle`, `carrera`, `otra` (avenidas y vias con nombre de via) o None
    si el nombre no es de una via con la que se pueda hacer esquina."""
    if not display_name:
        return None
    if _CALLE.match(display_name):
        return "calle"
    if _CARRERA.match(display_name):
        return "carrera"
    if _OTRA_VIA.match(display_name):
        return "otra"
    return None


def corner_label(road_a: str | None, road_b: str | None) -> str | None:
    """ "Calle 19 con Carrera 8", "sobre Avenida Circunvalar" o None."""
    if road_a and road_b:
        return f"{road_a} con {road_b}"
    if road_a:
        return f"sobre {road_a}"
    return None


def format_place_line(
    neighborhood: str | None,
    commune: str | None,
    corner: str | None,
    landmark: str | None,
    landmark_m: float | None,
) -> str | None:
    """Una linea, con lo que hay. Sin nada, None: el visor dice "sin fuente"."""
    parts: list[str] = []
    if neighborhood:
        parts.append(f"Barrio {neighborhood}")
    if commune:
        parts.append(f"Comuna {commune}")
    if corner:
        parts.append(corner)
    if landmark:
        if landmark_m is not None:
            parts.append(f"a {int(round(landmark_m))} m de {landmark}")
        else:
            parts.append(f"cerca de {landmark}")
    return " · ".join(parts) if parts else None
