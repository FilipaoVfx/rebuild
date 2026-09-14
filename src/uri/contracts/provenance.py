"""Procedencia.

ARD §5.2: `is_synthetic`, `data_version`, `feature_version` y
`constraint_set_version` viajan juntos y se adjuntan a toda fila calculada
y a toda respuesta de la API. Serializar un objeto con score sin su
procedencia falla a nivel de esquema en vez de pasar en silencio: por eso
los campos son obligatorios y no tienen valor por defecto.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LayerProvenance(BaseModel):
    """FR-SYN-05 — procedencia por capa.

    Un escenario con poblacion real y daño sintetico no se describe con una
    etiqueta global: se describe capa por capa.
    """

    layer: str
    source_id: str
    is_synthetic: bool
    license_class: str
    attribution: str | None = None
    retrieved_at: datetime | None = None


class Provenance(BaseModel):
    """FR-API-02 — toda respuesta con score o agregado lleva esto."""

    data_version: int
    feature_version: str
    constraint_set_version: str | None = None
    scoring_version: str | None = None
    is_synthetic: bool
    layers: list[LayerProvenance] = Field(default_factory=list)

    @property
    def synthetic_layers(self) -> list[str]:
        return [layer.layer for layer in self.layers if layer.is_synthetic]
