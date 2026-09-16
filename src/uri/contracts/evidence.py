"""Contrato de evidencia de daño (ADR-16, SRS §6 revisado).

El SRS §6 congelo un contrato con geometria de poligono. El dato real es de
punto (antes-de-empezar.md §4). Este contrato admite ambos y obliga a
declarar la precision posicional cuando la geometria es un punto, que es la
diferencia entre admitir el dato real y fingir que tenemos una huella de
edificacion.
"""

from __future__ import annotations

import re
from datetime import date

from pydantic import BaseModel, Field, model_validator

from uri.contracts.enums import DamageClass, EvidenceMethod

#: FR-PII-01 — campos prohibidos, en dos regimenes distintos.
#:
#: `PROHIBITED_TOKENS` compara por TOKEN, porque un diccionario que compara la
#: columna entera deja pasar `nombre_completo`, `numero_cedula` o
#: `email_contacto`, que es justo como llegan los campos en la practica.
#: Estos terminos no aparecen como parte de nombres tecnicos legitimos.
PROHIBITED_TOKENS: frozenset[str] = frozenset(
    {
        "nombre",
        "nombres",
        "apellido",
        "apellidos",
        "cedula",
        "documento",
        "identificacion",
        "telefono",
        "celular",
        "email",
        "correo",
        "direccion",
        "propietario",
        "titular",
        "phone",
        "mobile",
    }
)

#: `PROHIBITED_EXACT` compara la columna COMPLETA, porque sus terminos si
#: aparecen dentro de nombres tecnicos legitimos: `display_name`,
#: `scenario.name` y `rebuild_osm_raw.road.name` nombran cosas, no personas. Meter
#: `name` entre los tokens haria fallar el control sobre su propio esquema, y
#: un control que grita en todo deja de leerse.
PROHIBITED_EXACT: frozenset[str] = frozenset(
    {
        "name",
        "full_name",
        "first_name",
        "last_name",
        "nit",
        "id_number",
        "national_id",
        "e_mail",
        "address",
        "street_address",
        "home_address",
        "jefe_hogar",
        "owner",
        "owner_name",
    }
)

#: Union, para quien solo necesita preguntar "esto esta prohibido".
PROHIBITED_FIELDS: frozenset[str] = PROHIBITED_TOKENS | PROHIBITED_EXACT

#: antes-de-empezar.md §3 — el test lexico no detecta reidentificacion.
#: Un punto a nivel de estructura mas un catastro publico identifica un
#: hogar concreto y su situacion tras el desastre. La unidad espacial minima
#: a la que se publica daño NO sintetico es una regla aparte, y esta es.
MIN_PUBLISHABLE_UNIT_M: float = 50.0


class PiiViolation(ValueError):
    """FR-PII-01. El mensaje nombra la columna: un error que no dice cual
    obliga a adivinar."""


def _normalize(column: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", column.strip().lower()).strip("_")


def prohibited_columns(columns: list[str]) -> list[str]:
    """Columnas que nombran un campo prohibido.

    Una sola implementacion, usada tanto por la ingesta como por el escaneo de
    esquema en CI: dos copias de esta regla se desincronizan y entonces una de
    las dos miente.
    """
    offending: list[str] = []
    for column in columns:
        normalized = _normalize(column)
        tokens = set(normalized.split("_"))
        if normalized in PROHIBITED_EXACT or tokens & PROHIBITED_TOKENS:
            offending.append(column)
    return sorted(offending)


def assert_no_prohibited_fields(
    columns: list[str], *, source: str, reviewed: dict[str, str] | None = None
) -> None:
    """Rechaza el lote entero si alguna columna nombra un campo prohibido.

    Rechaza el LOTE, no la columna: dejar entrar las demas filas de un archivo
    que contiene datos personales solo mueve el problema de sitio.

    `reviewed` admite excepciones que alguien miro una por una, mapeando cada
    columna a la razon por la que es segura. Existe porque el diccionario
    marca `name` a secas —y hace bien: es indistinguible de un campo personal—
    pero algunos esquemas lo usan para nombrar cosas. La excepcion se declara
    en el adaptador, junto al dato, con su justificacion escrita: un guardian
    que se debilita en abstracto deja de guardar, uno que exige justificar
    cada excepcion sigue haciendo su trabajo.
    """
    reviewed = reviewed or {}
    offending = [c for c in prohibited_columns(columns) if c not in reviewed]
    if offending:
        raise PiiViolation(
            f"{source}: la fuente trae campos prohibidos {offending}. "
            "FR-PII-01: no se escribe ninguna fila."
        )


class DamageEvidence(BaseModel):
    """Una observacion de daño. No un estado del sitio: una observacion."""

    source: str
    original_source: str
    geometry_wkt: str
    positional_accuracy_m: float | None = Field(default=None, gt=0)
    observation_date: date
    acquisition_date: date
    damage_class: DamageClass
    raw_damage_label: str
    building_type: str | None = None
    method: EvidenceMethod
    field_validated: bool = False
    confidence: float = Field(ge=0, le=1)
    is_synthetic: bool
    notes: str | None = None

    @model_validator(mode="after")
    def check_dates(self) -> DamageEvidence:
        if self.observation_date > self.acquisition_date:
            raise ValueError(
                f"{self.source}: observation_date posterior a acquisition_date "
                f"({self.observation_date} > {self.acquisition_date})"
            )
        return self

    @model_validator(mode="after")
    def points_declare_accuracy(self) -> DamageEvidence:
        """Si la geometria es un punto, la precision no es opcional."""
        if self.geometry_wkt.upper().startswith("POINT") and self.positional_accuracy_m is None:
            raise ValueError(
                f"{self.source}: geometria de punto sin positional_accuracy_m. "
                "Un punto sin precision declarada se lee como una huella y no lo es."
            )
        return self

    def staleness_days(self, as_of: date) -> int:
        return (as_of - self.observation_date).days
