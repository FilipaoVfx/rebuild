"""La entidad central del producto: una oportunidad de recuperación.

Un `site` dice *dónde*. Una oportunidad dice **qué problema hay ahí, qué lo
sustenta, qué se podría hacer, a quién beneficiaría, si es viable y cuánto
cuesta** — que es lo que hace falta para tomar una decisión.

El requerimiento de evolución lo plantea así: el sistema no debe competir por
mostrar más datos, sino por conectarlos. Esta entidad es donde se conectan.

**Nada aquí se inventa.** Cada campo o sale de una medición o se declara
ausente. `Feasibility` tiene un estado `UNKNOWN` explícito precisamente porque
el POT no es alcanzable hoy: decir «compatible» sin fuente sería exactamente
el error que el proyecto lleva toda su historia evitando.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field

from uri.contracts.enums import InterventionType


class FeasibilityStatus(StrEnum):
    """Estado de una condición de viabilidad.

    `UNKNOWN` no es un fallo del código: es la respuesta correcta cuando no
    hay fuente. Colapsarlo a `BLOCKED` frenaría proyectos viables; colapsarlo
    a `OK` afirmaría una compatibilidad que nadie ha comprobado.
    """

    OK = "OK"
    WARNING = "WARNING"
    BLOCKED = "BLOCKED"
    UNKNOWN = "UNKNOWN"


class FeasibilityCheck(BaseModel):
    """Una condición de viabilidad, con su razón en texto."""

    check_id: str
    label: str
    status: FeasibilityStatus
    detail: str
    #: De dónde sale el veredicto. `None` cuando el estado es UNKNOWN.
    source_id: str | None = None


class ProblemStatement(BaseModel):
    """Qué necesidad territorial existe, en una frase y con sus factores.

    El titular se compone de los factores que de verdad dominan el score, no
    de una plantilla fija: si en un sitio manda la población y en otro el
    déficit, los dos textos tienen que decir cosas distintas.
    """

    headline: str
    drivers: list[str] = Field(default_factory=list)
    #: Factores que el modelo declara ausentes en ESTE sitio. Van al lado del
    #: titular y no en una nota al pie, porque cambian cuánto se le puede
    #: creer.
    missing_factors: list[str] = Field(default_factory=list)


class EvidenceSummary(BaseModel):
    """Qué datos sostienen la conclusión (RF-04, RD-02).

    Separado del problema a propósito: el problema es una lectura, la
    evidencia es lo observado. Mezclarlos es como se acaba diciendo que un
    cambio satelital es un edificio destruido.
    """

    damage_observations: int
    damage_classes: dict[str, int] = Field(default_factory=dict)
    observation_date: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    #: Concordancia entre fuentes de daño, cuando hay más de una.
    agreement: float | None = None


class ImpactEstimate(BaseModel):
    """A quién beneficiaría, medido donde se puede y nulo donde no.

    `population_reached` sale del catchment de 10 minutos por red peatonal
    real, no de un buffer: es gente que puede llegar andando, no gente que
    cae dentro de un círculo.
    """

    population_reached: int
    #: Reducción del déficit de espacio público, en puntos de la métrica.
    deficit_reduction: float | None = None
    area_m2: float
    #: Personas por millón de COP. Es la comparación honesta entre
    #: alternativas de tamaño distinto.
    people_per_million_cop: float | None = None


class RecoveryOpportunity(BaseModel):
    """Lugar + problema + evidencia + intervención + impacto + viabilidad."""

    opportunity_id: str
    site_id: str
    zone: str | None = None

    problem: ProblemStatement
    evidence: EvidenceSummary
    intervention: InterventionType
    intervention_label: str
    impact: ImpactEstimate
    feasibility: list[FeasibilityCheck] = Field(default_factory=list)

    cost_cop: float
    #: Score del par (sitio, intervención). Se conserva porque es lo que
    #: ordena, pero deja de ser el titular: la vista técnica lo muestra, la
    #: principal muestra el problema.
    suitability: float
    confidence: float

    #: Procedencia completa (RD-01). Sin esto la oportunidad es una opinión.
    provenance: dict = Field(default_factory=dict)

    @property
    def blocked(self) -> bool:
        return any(c.status is FeasibilityStatus.BLOCKED for c in self.feasibility)

    @property
    def unknowns(self) -> list[str]:
        """Condiciones que nadie ha podido comprobar. La vista las muestra
        junto a las que sí, porque un proyecto con tres OK y dos UNKNOWN no
        es lo mismo que uno con cinco OK."""
        return [c.label for c in self.feasibility if c.status is FeasibilityStatus.UNKNOWN]
