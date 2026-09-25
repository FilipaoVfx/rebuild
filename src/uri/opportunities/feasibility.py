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

from uri.constraints import pot
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


def _risk_from_pot(zona: dict | None) -> FeasibilityCheck:
    """La zona de la microzonificación, sin nivel de riesgo: ADR-26 §5."""
    if zona is None:
        return FeasibilityCheck(
            check_id="risk",
            label="Riesgo sísmico",
            status=FeasibilityStatus.UNKNOWN,
            detail=(
                "El sitio cae fuera de las microzonificaciones que publica IDE "
                "AMCO, así que aquí no hay con qué responder."
            ),
        )
    alterna = zona.get("zona_alterna")
    discrepancia = (
        f" La otra versión que publica IDE AMCO la pone en {alterna.lower()}."
        if alterna and alterna != zona.get("zona")
        else ""
    )
    leyenda = f" ({zona['leyenda']})" if zona.get("leyenda") else ""
    return FeasibilityCheck(
        check_id="risk",
        label="Riesgo sísmico",
        status=FeasibilityStatus.UNKNOWN,
        detail=(
            f"Microzonificación de {zona.get('municipio')}: "
            f"{str(zona.get('zona')).lower()}{leyenda}. Falta la tabla que "
            "traduce la zona a un nivel de riesgo, que sale del estudio de "
            f"microzonificación (ADR-26).{discrepancia}"
        ),
    )


def check_risk(features: dict, intervention: InterventionType) -> FeasibilityCheck:
    """Riesgo sísmico. Hoy SIEMPRE desconocido, y eso se dice.

    La capa del SGC se retiró por licencia (ADR-18). Además, cuando existía
    publicaba un valor por municipio: cobertura del 100 % con un solo valor,
    que no excluía ni penalizaba a nadie.

    La microzonificación del POT (IDE AMCO, ADR-26) sí distingue sitios, pero
    da una zona geotécnica, no un nivel de riesgo. La tabla que traduce una en
    otro sale del estudio de microzonificación y nadie la ha escrito todavía:
    con la zona, la condición sigue siendo UNKNOWN, ahora con lo que se sabe.
    """
    riesgo = features.get("risk_score")
    if riesgo is None and "pot_zona_sismica" in features:
        return _risk_from_pot(features["pot_zona_sismica"])
    if riesgo is None:
        return FeasibilityCheck(
            check_id="risk",
            label="Riesgo sísmico",
            status=FeasibilityStatus.UNKNOWN,
            detail=(
                "Sin microzonificación publicable. La capa del SGC se retiró "
                "por licencia, y la de IDE AMCO está pendiente de la suya (ADR-26)."
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


_POR_COMPATIBILIDAD = {
    pot.Compatibilidad.COMPATIBLE: FeasibilityStatus.OK,
    pot.Compatibilidad.CONDICIONADA: FeasibilityStatus.WARNING,
    pot.Compatibilidad.NO_COMPATIBLE: FeasibilityStatus.BLOCKED,
}


def _land_use_from_pot(
    sector: dict | None, intervention: InterventionType, municipio: str | None
) -> FeasibilityCheck:
    """El POT de IDE AMCO leído con el criterio declarado de ADR-26."""
    if sector is None:
        donde = (
            f"El sitio está en {municipio}, y IDE AMCO publica los sectores "
            f"normativos de Pereira, no los de {municipio}"
            if municipio and municipio != "Pereira"
            else "El sitio cae fuera de los sectores normativos que publica IDE AMCO"
        )
        return FeasibilityCheck(
            check_id="land_use",
            label="Compatibilidad con el POT",
            status=FeasibilityStatus.UNKNOWN,
            detail=f"{donde}, así que aquí no hay con qué responder.",
        )
    numero = f"sector normativo {sector['sector']}: " if sector.get("sector") is not None else ""
    tratamiento = sector.get("subtratamiento") or sector.get("tratamiento")
    lectura = (
        f"POT de Pereira, {numero}actividad «{sector.get('actividad')}», "
        f"tratamiento «{tratamiento}»."
    )
    cobertura = float(sector.get("cobertura") or 0)
    parcial = (
        f" Ese sector cubre el {cobertura * 100:.0f} % del sitio; el resto cae en otro."
        if cobertura < 0.95
        else ""
    )
    veredicto = pot.evaluar(
        actividad=sector.get("actividad"),
        tratamiento=sector.get("tratamiento"),
        subtratamiento=sector.get("subtratamiento"),
        intervention=intervention,
    )
    if veredicto is None:
        return FeasibilityCheck(
            check_id="land_use",
            label="Compatibilidad con el POT",
            status=FeasibilityStatus.UNKNOWN,
            detail=(
                f"{lectura} El criterio de ADR-26 no contempla ese caso, y no se "
                f"toma el más parecido.{parcial}"
            ),
        )
    borrador = (
        " Criterio en borrador (ADR-26), por validar con Planeación."
        if veredicto.estado_criterio == "BORRADOR"
        else ""
    )
    razon = veredicto.razon[0].upper() + veredicto.razon[1:]
    return FeasibilityCheck(
        check_id="land_use",
        label="Compatibilidad con el POT",
        status=_POR_COMPATIBILIDAD[veredicto.compatibilidad],
        detail=f"{lectura} {razon}.{parcial}{borrador}",
        source_id="ide_amco",
    )


def check_land_use(features: dict, intervention: InterventionType) -> FeasibilityCheck:
    """Compatibilidad con el POT. Desconocida en casi todo el AOI publicado.

    OSM tiene 219 polígonos de uso de suelo, pero casi ninguno cae sobre un
    sitio dañado: la feature existe en 1 de 115 sitios. El POT de IDE AMCO sí
    cubre 112, y responde por intervención (ADR-26); mientras su licencia siga
    sin declarar, solo llega aquí desde el informe interno del sandbox.
    """
    if "pot_sector" in features:
        return _land_use_from_pot(
            features["pot_sector"], intervention, features.get("pot_municipio")
        )
    uso = features.get("land_use_compatibility")
    if uso is None:
        return FeasibilityCheck(
            check_id="land_use",
            label="Compatibilidad con el POT",
            status=FeasibilityStatus.UNKNOWN,
            detail=(
                "El POT de IDE AMCO está pendiente de licencia (ADR-26). OSM "
                "cubre el uso de suelo en 1 de 115 sitios, así que aquí no hay "
                "con qué responder."
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
        check_land_use(features, intervention),
        check_risk(features, intervention),
        check_accessibility(features),
    ]
