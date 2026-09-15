"""FR-API-02, FR-SYN-04..05 — la procedencia no es opcional."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from uri.contracts import LayerProvenance, Provenance


def test_serializar_sin_procedencia_falla():
    """ARD §5.2 — falla a nivel de esquema en vez de pasar en silencio."""
    with pytest.raises(ValidationError):
        Provenance(feature_version="features_v1", is_synthetic=False)


def test_una_capa_sintetica_marca_todo_el_resultado():
    """FR-SYN-04 — basta una."""
    provenance = Provenance(
        data_version=3,
        feature_version="features_v1",
        is_synthetic=True,
        layers=[
            LayerProvenance(
                layer="Daño", source_id="sertit", is_synthetic=False, license_class="NON_COMMERCIAL"
            ),
            LayerProvenance(
                layer="Poblacion",
                source_id="synthetic",
                is_synthetic=True,
                license_class="COMMERCIAL_SAFE",
            ),
        ],
    )
    assert provenance.is_synthetic
    # FR-SYN-05: se nombra la capa simulada, no se etiqueta todo en bloque.
    assert provenance.synthetic_layers == ["Poblacion"]


def test_procedencia_mixta_se_declara_capa_por_capa():
    """Un escenario con poblacion real y daño sintetico no se describe con
    una etiqueta global."""
    provenance = Provenance(
        data_version=1,
        feature_version="v1",
        is_synthetic=True,
        layers=[
            LayerProvenance(layer="A", source_id="a", is_synthetic=True, license_class="X"),
            LayerProvenance(layer="B", source_id="b", is_synthetic=False, license_class="X"),
            LayerProvenance(layer="C", source_id="c", is_synthetic=True, license_class="X"),
        ],
    )
    assert provenance.synthetic_layers == ["A", "C"]


def test_la_cobertura_reproduce_la_marginalidad_del_optimizador(db_conn):
    """El endpoint de cobertura no puede contar distinto que el optimizador.

    Si una celda se atribuyera a dos proyectos, la suma de aportes marginales
    superaria a la poblacion alcanzada y el relieve 3D mostraria mas cobertura
    de la que el portafolio produce — exactamente la clase de discrepancia que
    ADR-13 existe para impedir.

    Se llama a las funciones, no al cliente HTTP: es el mismo codigo sin
    montar un transporte para comprobar aritmetica.
    """
    from uri.api import schemas
    from uri.api.app import create_scenario, scenario_coverage

    scenario = create_scenario(
        db_conn, schemas.ScenarioRequest(name="prueba cobertura", budget_cop=25e9)
    )
    coverage = scenario_coverage(db_conn, scenario.scenario_id)

    # Cada celda pertenece a un solo proyecto: es lo que hace que los aportes
    # marginales sumen en vez de solaparse.
    cubiertas = [c for c in coverage["cells"] if c["covered_by"]]
    assert len(cubiertas) == coverage["reached"]

    suma_arcos = sum(a["population"] for a in coverage["arcs"])
    suma_celdas = sum(c["population"] for c in cubiertas)
    assert abs(suma_arcos - suma_celdas) < 1.0, (
        f"los arcos suman {suma_arcos} y las celdas cubiertas {suma_celdas}"
    )
    # Y esa suma es la poblacion que el optimizador reporto.
    assert abs(suma_celdas - scenario.total_population) < 1.0

    # Un proyecto sin aporte nuevo no dibuja arco.
    assert all(a["population"] > 0 for a in coverage["arcs"])
    assert len(coverage["arcs"]) <= len(scenario.items)
