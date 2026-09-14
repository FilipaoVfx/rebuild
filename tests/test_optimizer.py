"""FR-SCEN-03..06 — presupuesto, marginalidad y redundancia."""

from __future__ import annotations

import pytest

from uri.contracts import InterventionType
from uri.optimizer.greedy import Candidate, select_portfolio


def make(site_id: str, cells: dict[int, float], cost: float, score: float = 60.0) -> Candidate:
    return Candidate(
        site_id=site_id,
        intervention=InterventionType.PARK,
        score=score,
        cost_cop=cost,
        population_cells=cells,
        vulnerability=0.5,
    )


def test_se_respeta_el_presupuesto():
    candidates = [make(f"s{i}", {i: 1000.0}, 100.0) for i in range(10)]
    result = select_portfolio(candidates, budget=350.0)
    assert result.total_cost <= 350.0
    assert len(result.items) == 3


def test_las_ganancias_marginales_no_crecen():
    """Propiedad del objetivo submodular. Si creciera, el greedy dejaria de
    tener cota de aproximacion y pasaria a ser una heuristica cualquiera."""
    candidates = [make(f"s{i}", {i: 1000.0 * (10 - i)}, 100.0) for i in range(8)]
    result = select_portfolio(candidates, budget=1000.0)
    gains = [item.marginal_gain for item in result.items]
    assert gains == sorted(gains, reverse=True)


def test_un_sitio_totalmente_redundante_nunca_se_selecciona():
    """FR-SCEN-04, caso limite.

    Si un sitio sirve exactamente a la misma poblacion que otro ya elegido,
    su ganancia marginal es cero y no entra — aunque quede presupuesto. Eso
    cae de la forma del objetivo de cobertura, no de una penalizacion
    atornillada (ADR-08).
    """
    result = select_portfolio(
        [
            make("a", {1: 500.0, 2: 500.0}, 100.0),
            make("duplicado", {1: 500.0, 2: 500.0}, 100.0),
            make("c", {3: 400.0}, 100.0),
        ],
        budget=1000.0,
    )
    selected = {item.site_id for item in result.items}
    assert selected == {"a", "c"}, "el duplicado no aporta cobertura nueva"


def test_la_redundancia_parcial_se_cuantifica():
    """Un solapamiento parcial si entra, y su redundancia queda medida para
    que un planificador pueda verla y discutirla."""
    result = select_portfolio(
        [
            make("a", {1: 500.0, 2: 500.0}, 100.0),
            make("parcial", {2: 500.0, 3: 100.0}, 100.0),
        ],
        budget=1000.0,
    )
    by_site = {item.site_id: item for item in result.items}
    assert by_site["a"].redundancy_ratio == pytest.approx(0.0)
    # 500 de 600 personas ya estaban cubiertas.
    assert by_site["parcial"].redundancy_ratio == pytest.approx(500 / 600, abs=1e-4)


def test_una_intervencion_por_sitio():
    """No se puede construir un parque y una plaza en el mismo predio."""
    candidates = [
        make("a", {1: 900.0}, 100.0, score=50.0),
        Candidate("a", InterventionType.SPORTS, 80.0, 100.0, {1: 900.0}, 0.5),
        make("b", {2: 400.0}, 100.0),
    ]
    result = select_portfolio(candidates, budget=1000.0)
    assert len(result.items) == 2
    assert {item.site_id for item in result.items} == {"a", "b"}
    assert next(i for i in result.items if i.site_id == "a").score == 80.0


def test_instancia_de_optimo_conocido():
    """Con presupuesto para uno solo, el greedy elige el de mayor cobertura
    por peso invertido: aqui, el barato que cubre mucho."""
    candidates = [
        make("caro", {1: 1000.0}, 900.0),
        make("eficiente", {2: 800.0}, 100.0),
    ]
    result = select_portfolio(candidates, budget=900.0)
    assert [item.site_id for item in result.items] == ["eficiente"]


def test_se_reporta_equidad_antes_y_despues():
    """FR-SCEN-06 — sin el 'antes', el numero de despues no dice si el
    portafolio mejoro algo."""
    candidates = [make("a", {1: 500.0}, 100.0), make("b", {2: 500.0}, 100.0)]
    baseline = {1: 5.0, 2: 0.0, 3: 0.0}
    result = select_portfolio(candidates, budget=500.0, baseline_access=baseline)
    assert "gini_access" in result.equity_before
    assert "gini_delta" in result.equity_after
    assert result.equity_before["cells_total"] == 3


def test_presupuesto_cero_no_selecciona_nada():
    result = select_portfolio([make("a", {1: 100.0}, 10.0)], budget=0.0)
    assert result.items == []
    assert result.total_cost == 0.0
