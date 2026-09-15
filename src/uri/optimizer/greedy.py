"""Seleccion greedy por ganancia marginal sobre costo (ADR-08).

El objetivo es de cobertura poblacional, por tanto submodular, y el greedy
lleva una cota de aproximacion conocida en vez de ser una heuristica
cualquiera. Dos consecuencias que el ARD ya anticipaba:

- FR-SCEN-05, impacto marginal: es un subproducto natural de la seleccion,
  no un calculo aparte.
- FR-SCEN-04, redundancia: cae de la FORMA del objetivo. Un segundo sitio
  que sirve a la misma poblacion aporta poca cobertura marginal por
  construccion; no hace falta una penalizacion atornillada.

La interfaz es `select_portfolio(...)` para que una implementacion MILP pueda
sustituirla sin tocar la capa de escenarios.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from uri.contracts import InterventionType


@dataclass(frozen=True)
class Candidate:
    site_id: str
    intervention: InterventionType
    score: float
    cost_cop: float
    #: Poblacion alcanzable. La superposicion entre candidatos se mide sobre
    #: estas celdas: dos sitios que sirven a las mismas personas comparten
    #: identificadores, y el segundo aporta poco.
    population_cells: dict[int, float]
    vulnerability: float
    commune: str | None = None


@dataclass
class PortfolioItem:
    rank: int
    site_id: str
    intervention: InterventionType
    score: float
    cost_cop: float
    marginal_population: float
    marginal_gain: float
    redundancy_ratio: float
    cumulative_population: float
    cumulative_cost: float


@dataclass
class PortfolioResult:
    items: list[PortfolioItem]
    total_cost: float
    total_population: float
    objective_value: float
    budget: float
    considered: int
    equity_before: dict[str, float] = field(default_factory=dict)
    equity_after: dict[str, float] = field(default_factory=dict)
    skipped_over_budget: int = 0
    #: Por que se detuvo la seleccion. Un objetivo de cobertura satura: cuando
    #: ningun candidato restante alcanza a nadie nuevo, el greedy para aunque
    #: sobre presupuesto. Sin declararlo, subir el presupuesto devuelve el
    #: mismo portafolio y el control parece roto en vez de saturado.
    stop_reason: str = "cobertura_saturada"

    @property
    def budget_binding(self) -> bool:
        """El presupuesto es lo que limita el portafolio, no la cobertura."""
        return self.stop_reason == "presupuesto"


def _gini(values: list[float]) -> float:
    """Gini sobre acceso per capita. OI-03 sigue abierto: el plan reporta
    dos medidas y deja que la institucion elija sobre resultados reales, no
    en abstracto."""
    if not values:
        return 0.0
    ordered = sorted(values)
    n = len(ordered)
    total = sum(ordered)
    if total <= 0:
        return 0.0
    weighted = sum((i + 1) * value for i, value in enumerate(ordered))
    return round((2 * weighted) / (n * total) - (n + 1) / n, 4)


def select_portfolio(
    candidates: list[Candidate],
    *,
    budget: float,
    max_projects: int | None = None,
    vulnerability_weight: float = 0.35,
    baseline_access: dict[int, float] | None = None,
) -> PortfolioResult:
    """Selecciona el portafolio que maximiza cobertura ponderada bajo presupuesto.

    Solo se considera la mejor intervencion por sitio: no se puede construir
    un parque y una plaza en el mismo predio.
    """
    best_per_site: dict[str, Candidate] = {}
    for candidate in candidates:
        current = best_per_site.get(candidate.site_id)
        if current is None or candidate.score > current.score:
            best_per_site[candidate.site_id] = candidate
    pool = list(best_per_site.values())

    covered: dict[int, float] = {}
    items: list[PortfolioItem] = []
    spent = 0.0
    objective = 0.0
    skipped = 0

    def marginal(candidate: Candidate) -> tuple[float, float, float]:
        """Cobertura nueva que aporta el candidato dado lo ya cubierto."""
        new_population = 0.0
        total_population = 0.0
        for cell_id, population in candidate.population_cells.items():
            total_population += population
            already = covered.get(cell_id, 0.0)
            if population > already:
                new_population += population - already
        redundancy = 0.0 if total_population <= 0 else 1.0 - new_population / total_population
        weighted = new_population * (1.0 + vulnerability_weight * candidate.vulnerability)
        return new_population, weighted, redundancy

    stop_reason = "cobertura_saturada"
    while pool:
        if max_projects is not None and len(items) >= max_projects:
            stop_reason = "limite_de_proyectos"
            break

        scored: list[tuple[float, float, float, float, Candidate]] = []
        for candidate in pool:
            if spent + candidate.cost_cop > budget:
                continue
            new_population, weighted, redundancy = marginal(candidate)
            if weighted <= 0:
                continue
            # Ganancia marginal POR PESO invertido: es lo que hace que el
            # portafolio responda a la pregunta del PRD §56 (valor urbano
            # por unidad de inversion) y no a "cual es el mejor sitio".
            efficiency = weighted * (candidate.score / 100.0) / max(candidate.cost_cop, 1.0)
            scored.append((efficiency, weighted, new_population, redundancy, candidate))

        if not scored:
            skipped = sum(1 for c in pool if spent + c.cost_cop > budget)
            # Si lo que queda fuera cabe en el presupuesto, lo que se agoto no
            # fue el dinero sino la poblacion por alcanzar.
            stop_reason = "presupuesto" if skipped else "cobertura_saturada"
            break

        scored.sort(key=lambda row: row[0], reverse=True)
        efficiency, weighted, new_population, redundancy, chosen = scored[0]

        for cell_id, population in chosen.population_cells.items():
            covered[cell_id] = max(covered.get(cell_id, 0.0), population)

        spent += chosen.cost_cop
        objective += weighted
        items.append(
            PortfolioItem(
                rank=len(items) + 1,
                site_id=chosen.site_id,
                intervention=chosen.intervention,
                score=chosen.score,
                cost_cop=chosen.cost_cop,
                marginal_population=round(new_population, 2),
                marginal_gain=round(weighted, 4),
                redundancy_ratio=round(redundancy, 4),
                cumulative_population=round(sum(covered.values()), 2),
                cumulative_cost=round(spent, 2),
            )
        )
        pool.remove(chosen)

    # FR-SCEN-06 — equidad antes y despues.
    #
    # "Antes" es el acceso a espacio publico que cada celda YA tiene; sin ese
    # punto de partida, una medida de equidad post-intervencion no dice si el
    # portafolio mejoro algo o solo repartio lo que ya estaba repartido.
    baseline_access = baseline_access or {}
    universe = sorted(
        {cell for c in candidates for cell in c.population_cells} | set(baseline_access)
    )
    before_values = [baseline_access.get(cell, 0.0) for cell in universe] or [0.0]
    after_values = [
        baseline_access.get(cell, 0.0) + (1.0 if cell in covered else 0.0) for cell in universe
    ] or [0.0]

    gini_before = _gini(before_values)
    gini_after = _gini(after_values)

    return PortfolioResult(
        items=items,
        total_cost=round(spent, 2),
        total_population=round(sum(covered.values()), 2),
        objective_value=round(objective, 4),
        budget=budget,
        considered=len(best_per_site),
        stop_reason=stop_reason,
        equity_before={
            "gini_access": gini_before,
            "cells_with_access": sum(1 for v in before_values if v > 0),
            "cells_total": len(universe),
        },
        equity_after={
            "gini_access": gini_after,
            "cells_with_access": sum(1 for v in after_values if v > 0),
            "cells_total": len(universe),
            # Un Gini que baja significa acceso mas repartido. Reportar el
            # delta evita que alguien lea dos numeros sueltos al reves.
            "gini_delta": round(gini_after - gini_before, 4),
        },
        skipped_over_budget=skipped,
    )
