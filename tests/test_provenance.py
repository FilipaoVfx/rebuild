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
