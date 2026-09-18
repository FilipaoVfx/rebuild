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


#: Las tablas que contienen dato publicable y su version de dataset. Es la
#: definicion unica de "que alimenta el resultado": la puerta de publicacion,
#: la puerta de export y el panel de procedencia la comparten, porque tres
#: listas escritas a mano se desincronizan y la que se queda corta es la que
#: deja pasar una fuente sin evaluar.
PUBLISHED_LAYER_TABLES = (
    "rebuild_core.damage_evidence",
    "rebuild_core.site",
    "rebuild_core.population_cell",
    "rebuild_core.risk_zone",
    "rebuild_core.land_use",
    "rebuild_core.building_footprint",
    "rebuild_osm_raw.road",
    "rebuild_osm_raw.green_space",
    "rebuild_osm_raw.facility",
    "rebuild_osm_raw.admin_area",
    "rebuild_osm_raw.place_point",
    "rebuild_osm_raw.waterway",
    "rebuild_osm_raw.landmark",
    "rebuild_osm_raw.arterial_road",
    "rebuild_osm_derived.site_place",
    "rebuild_core.municipal_facility",
    "rebuild_core.municipal_public_space",
    "rebuild_core.reference_region",
    "rebuild_analytics.site_feature",
)

#: SQL que resuelve las fuentes que contribuyen al resultado.
#:
#: Dos vias, y hacen falta las dos. Por VERSION: cada capa referencia la
#: version de su propia fuente, asi que basta con seguir la referencia — sin
#: nombres magicos que alguien tenga que acordarse de añadir al cargar una capa
#: nueva. Por `original_source`: un agregador entrega dato que no produjo, y
#: mirar solo la version lo dejaria escondido detras de quien lo publico
#: (ADR-16). Quitar cualquiera de las dos reabre una fuga de licencia que ya
#: ocurrio una vez.
CONTRIBUTING_SOURCES_SQL = """
WITH referenciada AS (
    {unions}
),
contributing AS (
    SELECT DISTINCT dv.source_id
    FROM rebuild_core.dataset_version dv
    JOIN referenciada r USING (data_version)
    UNION
    SELECT DISTINCT original_source FROM rebuild_core.damage_evidence
)
""".format(
    unions="\n    UNION ".join(
        f"SELECT data_version FROM {table}" for table in PUBLISHED_LAYER_TABLES
    )
)
