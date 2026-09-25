"""Compatibilidad con el POT: un criterio declarado, en borrador (ADR-26).

El POT de Pereira da, para cada sector normativo, un tratamiento urbanístico
y un área de actividad. No dice si un parque "es compatible": eso lo dicen
las fichas normativas, que asignan a cada área de actividad usos principales,
complementarios, restringidos y prohibidos. Este sistema no tiene esas fichas.

Así que las tablas de abajo son un criterio, no un dato, y se declaran así:

- Cada celda lleva su razón escrita. Ninguna es un número.
- `ESTADO_CRITERIO` vale `BORRADOR` hasta que la Secretaría de Planeación de
  Pereira lo valide contra las fichas (ADR-26 §4). Mientras tanto, cada
  respuesta lo dice.
- Un valor del POT que las tablas no contemplan devuelve `None`, que la
  viabilidad convierte en UNKNOWN. Nunca se toma el caso más parecido.
- Se lee lo peor de las dos tablas: un parque es compatible con el área de
  actividad residencial, pero en un sector de redesarrollo queda sujeto al
  plan parcial igual que cualquier otra obra.

Es el mismo tipo de objeto que `OSM_LANDUSE_COMPATIBILITY` —una lectura
declarada de un dato real—, con una diferencia: aquel es un proxy del POT y
este lee el POT.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from enum import StrEnum

from uri.contracts.enums import InterventionType


class Compatibilidad(StrEnum):
    COMPATIBLE = "COMPATIBLE"
    CONDICIONADA = "CONDICIONADA"
    NO_COMPATIBLE = "NO_COMPATIBLE"


ESTADO_CRITERIO = "BORRADOR"
"""Pasa a `VALIDADO` solo con el acta de Planeación que cita ADR-26 §4."""

_GRAVEDAD = {
    Compatibilidad.COMPATIBLE: 0,
    Compatibilidad.CONDICIONADA: 1,
    Compatibilidad.NO_COMPATIBLE: 2,
}

C = Compatibilidad.COMPATIBLE
W = Compatibilidad.CONDICIONADA
X = Compatibilidad.NO_COMPATIBLE
I = InterventionType  # noqa: E741

_NO_CONSTRUIR = (
    C,
    "no construir no requiere licencia urbanística ni contradice el área de actividad",
)


def _espacio_publico(area: str) -> dict[InterventionType, tuple[Compatibilidad, str]]:
    """Parque, plaza, cancha y espacio abierto son espacio público, y el
    espacio público cabe en toda área de actividad urbana."""
    razon = f"espacio público en área de actividad {area}"
    return {
        I.PARK: (C, razon),
        I.SPORTS: (C, razon),
        I.PUBLIC_SQUARE: (C, razon),
        I.OPEN_SPACE: (C, razon),
        I.NO_BUILD: _NO_CONSTRUIR,
    }


POR_ACTIVIDAD: dict[str, dict[InterventionType, tuple[Compatibilidad, str]]] = {
    "residencial": {
        **_espacio_publico("residencial"),
        I.COMMUNITY_FACILITY: (
            W,
            "un equipamiento en área residencial depende de su escala y su "
            "impacto, y eso lo decide la ficha normativa",
        ),
    },
    "actividad multiple": {
        **_espacio_publico("múltiple"),
        I.COMMUNITY_FACILITY: (C, "el área de actividad múltiple admite equipamientos"),
    },
    "centralidad metropolitana": {
        **_espacio_publico("de centralidad"),
        I.COMMUNITY_FACILITY: (C, "una centralidad existe para concentrar equipamientos"),
    },
    "equipamiento": {
        **_espacio_publico("de equipamiento"),
        I.COMMUNITY_FACILITY: (C, "el sector está destinado a equipamiento"),
    },
    "suelo de proteccion": {
        I.PARK: (C, "un parque no urbaniza el suelo de protección"),
        I.OPEN_SPACE: (C, "un espacio abierto no urbaniza el suelo de protección"),
        I.NO_BUILD: _NO_CONSTRUIR,
        I.PUBLIC_SQUARE: (
            W,
            "una plaza endurece suelo de protección; depende de lo que proteja",
        ),
        I.SPORTS: (
            W,
            "un escenario deportivo endurece suelo de protección; depende de lo que proteja",
        ),
        I.COMMUNITY_FACILITY: (
            X,
            "el suelo de protección tiene restringida la posibilidad de "
            "urbanizarse (Ley 388 de 1997, art. 35)",
        ),
    },
}

POR_TRATAMIENTO: dict[str, tuple[Compatibilidad, str]] = {
    "consolidacion simple": (C, "la consolidación no exige instrumento adicional"),
    "consolidacion con densificacion": (C, "la consolidación no exige instrumento adicional"),
    "consolidacion con densificacion (mayor 1 ha)": (
        W,
        "la subcategoría por tamaño sugiere un instrumento adicional; está por confirmar",
    ),
    "renovacion urbana modalidad redesarrollo": (
        W,
        "el redesarrollo se ejecuta por plan parcial, y la obra queda sujeta a él",
    ),
    "renovacion urbana modalidad reactivacion": (
        C,
        "la reactivación admite intervención predio a predio",
    ),
    "desarrollo en suelo de expansion urbana": (
        W,
        "el suelo de expansión se incorpora por plan parcial",
    ),
    "suelo de proteccion": (C, "la restricción del suelo de protección la da su área de actividad"),
}
"""Aplica a toda intervención que construye o transforma. `NO_BUILD` queda
fuera: no construir no necesita plan parcial."""


def _clave(texto: str | None) -> str | None:
    """Minúsculas, sin tildes, espacios simples: el servicio escribe
    "Actividad Multiple" sin tilde y nadie debería depender de eso."""
    if not texto:
        return None
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )
    return " ".join(sin_tildes.lower().split())


@dataclass(frozen=True)
class Veredicto:
    compatibilidad: Compatibilidad
    razon: str
    estado_criterio: str = ESTADO_CRITERIO


def evaluar(
    *,
    actividad: str | None,
    tratamiento: str | None,
    subtratamiento: str | None,
    intervention: InterventionType,
) -> Veredicto | None:
    """El veredicto del criterio, o `None` si el criterio no cubre el caso."""
    fila = POR_ACTIVIDAD.get(_clave(actividad) or "")
    if fila is None or intervention not in fila:
        return None
    candidatos = [fila[intervention]]
    if intervention is not InterventionType.NO_BUILD:
        por_tratamiento = POR_TRATAMIENTO.get(_clave(subtratamiento or tratamiento) or "")
        if por_tratamiento is None:
            return None
        candidatos.append(por_tratamiento)
    compatibilidad, razon = max(candidatos, key=lambda v: _GRAVEDAD[v[0]])
    return Veredicto(compatibilidad=compatibilidad, razon=razon)
