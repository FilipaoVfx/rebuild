"""Viabilidad: qué se ha comprobado, qué no, y por qué.

La regla que gobierna este archivo: **una condición sin fuente se declara
`UNKNOWN`, nunca se colapsa a OK ni a BLOCKED.** Colapsarla a OK afirmaría una
compatibilidad que nadie ha comprobado; colapsarla a BLOCKED frenaría
proyectos viables por falta de dato ajeno.

Es la misma lección de ADR-18: antes de retirarla, la capa de riesgo se
envolvía en `COALESCE(..., 0)` y los 115 sitios puntuaban riesgo cero —el
valor más favorable— sin que nadie se enterara.
"""

from __future__ import annotations

from uri.contracts.enums import InterventionType
from uri.contracts.opportunity import FeasibilityCheck, FeasibilityStatus
from uri.scoring.model import INTERVENTION_CATALOG


def check_area(features: dict, intervention: InterventionType) -> FeasibilityCheck:
    """Área disponible frente al mínimo del catálogo."""
    spec = INTERVENTION_CATALOG[intervention]
    minimo = float(spec["minimum_area_m2"])
    preferida = float(spec["preferred_area_m2"])
    area = float(features.get("site_area_m2") or 0)

    if area <= 0:
        return FeasibilityCheck(
            check_id="area",
            label="Área disponible",
            status=FeasibilityStatus.UNKNOWN,
            detail="El sitio no declara área.",
        )
    if area < minimo:
        return FeasibilityCheck(
            check_id="area",
            label="Área disponible",
            status=FeasibilityStatus.BLOCKED,
            detail=f"{area:,.0f} m² frente a {minimo:,.0f} m² mínimos para {spec['display_name']}.",
            source_id="copernicus_ems",
        )
    if area < preferida:
        return FeasibilityCheck(
            check_id="area",
            label="Área disponible",
            status=FeasibilityStatus.WARNING,
            detail=(
                f"{area:,.0f} m²: por encima del mínimo pero por debajo "
                f"de los {preferida:,.0f} m² recomendados."
            ),
            source_id="copernicus_ems",
        )
    return FeasibilityCheck(
        check_id="area",
        label="Área disponible",
        status=FeasibilityStatus.OK,
        detail=f"{area:,.0f} m², por encima de los {preferida:,.0f} m² recomendados.",
        source_id="copernicus_ems",
    )


def check_risk(features: dict, intervention: InterventionType) -> FeasibilityCheck:
    """Riesgo sísmico. Hoy SIEMPRE desconocido, y eso se dice.

    La capa del SGC se retiró por licencia (ADR-18) y ninguna la sustituye.
    Además, cuando existía publicaba un valor por municipio: cobertura del
    100 % con un solo valor, que no excluía ni penalizaba a nadie.
    """
    riesgo = features.get("risk_score")
    if riesgo is None:
        return FeasibilityCheck(
            check_id="risk",
            label="Riesgo sísmico",
            status=FeasibilityStatus.UNKNOWN,
            detail=(
                "Sin fuente de microzonificación. La capa del SGC se retiró "
                "por licencia y ninguna la sustituye."
            ),
        )
    techo = float(INTERVENTION_CATALOG[intervention]["max_risk_score"])
    if float(riesgo) > techo:
        return FeasibilityCheck(
            check_id="risk",
            label="Riesgo sísmico",
            status=FeasibilityStatus.BLOCKED,
            detail=f"Riesgo {float(riesgo):.2f} sobre un techo de {techo:.2f}.",
            source_id="sgc",
        )
    return FeasibilityCheck(
        check_id="risk",
        label="Riesgo sísmico",
        status=FeasibilityStatus.OK,
        detail=f"Riesgo {float(riesgo):.2f}, bajo el techo de {techo:.2f}.",
        source_id="sgc",
    )


def check_land_use(features: dict) -> FeasibilityCheck:
    """Compatibilidad con el POT. Desconocida en casi todo el AOI.

    OSM tiene 219 polígonos de uso de suelo, pero casi ninguno cae sobre un
    sitio dañado: la feature existe en 1 de 115 sitios. El POT del IDE AMCO
    no es alcanzable (WFS caído en los dos puertos).
    """
    uso = features.get("land_use_compatibility")
    if uso is None:
        return FeasibilityCheck(
            check_id="land_use",
            label="Compatibilidad con el POT",
            status=FeasibilityStatus.UNKNOWN,
            detail=(
                "Sin POT de IDE AMCO. OSM cubre el uso de suelo en 1 de 115 "
                "sitios, así que aquí no hay con qué responder."
            ),
        )
    if float(uso) <= 0:
        return FeasibilityCheck(
            check_id="land_use",
            label="Compatibilidad con el POT",
            status=FeasibilityStatus.BLOCKED,
            detail="El uso declarado no admite esta intervención.",
            source_id="osm",
        )
    return FeasibilityCheck(
        check_id="land_use",
        label="Compatibilidad con el POT",
        status=FeasibilityStatus.OK,
        detail="Uso de suelo compatible según OSM. No sustituye al POT oficial.",
        source_id="osm",
    )


def check_accessibility(features: dict) -> FeasibilityCheck:
    """Conectividad peatonal, desde la red real de OSM."""
    acceso = features.get("pedestrian_accessibility")
    if acceso is None:
        return FeasibilityCheck(
            check_id="accessibility",
            label="Accesibilidad peatonal",
            status=FeasibilityStatus.UNKNOWN,
            detail="Sin densidad de red calculada para este sitio.",
        )
    valor = float(acceso)
    if valor < 0.25:
        return FeasibilityCheck(
            check_id="accessibility",
            label="Accesibilidad peatonal",
            status=FeasibilityStatus.WARNING,
            detail=f"Red peatonal escasa ({valor:.2f}): el alcance real sería menor.",
            source_id="osm",
        )
    return FeasibilityCheck(
        check_id="accessibility",
        label="Accesibilidad peatonal",
        status=FeasibilityStatus.OK,
        detail=f"Densidad de red {valor:.2f} en 400 m.",
        source_id="osm",
    )


def assess(features: dict, intervention: InterventionType) -> list[FeasibilityCheck]:
    """Las cuatro condiciones, en el orden en que un planificador las mira."""
    return [
        check_area(features, intervention),
        check_land_use(features),
        check_risk(features, intervention),
        check_accessibility(features),
    ]
