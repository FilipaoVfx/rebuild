-- 006 — Huellas de edificación y retirada de las capas simuladas.
--
-- El sistema deja de admitir datos sintéticos. Las capas de contexto pasan a
-- fuentes reales: Microsoft Building Footprints, SGC, OSM y el total de
-- población publicado por Copernicus EMS, repartido dasimétricamente.

CREATE TABLE core.building_footprint (
    footprint_id bigserial PRIMARY KEY,
    geometry     geometry(Geometry, 4326) NOT NULL,
    area_m2      numeric NOT NULL CHECK (area_m2 > 0),
    data_version bigint NOT NULL REFERENCES core.dataset_version(data_version)
);
CREATE INDEX building_footprint_geom_idx ON core.building_footprint USING GIST (geometry);

COMMENT ON TABLE core.building_footprint IS
    'Microsoft Building Footprints. Base dasimétrica del reparto de población '
    'y fuente de la densidad construida, que antes se aproximaba contando '
    'segmentos de vía.';

-- Las capas de contexto ya no pueden ser sintéticas. La restricción es la
-- forma de que "prohibido usar datos sintéticos" deje de ser una convención:
-- una inserción simulada falla en la base, no en revisión de código.
ALTER TABLE core.population_cell
    ADD CONSTRAINT population_cell_is_not_synthetic CHECK (is_synthetic = false);
ALTER TABLE core.risk_zone
    ADD CONSTRAINT risk_zone_is_not_synthetic CHECK (is_synthetic = false);
ALTER TABLE core.land_use
    ADD CONSTRAINT land_use_is_not_synthetic CHECK (is_synthetic = false);
ALTER TABLE core.damage_evidence
    ADD CONSTRAINT damage_evidence_is_not_synthetic CHECK (is_synthetic = false);
ALTER TABLE core.site
    ADD CONSTRAINT site_is_not_synthetic CHECK (is_synthetic = false);
