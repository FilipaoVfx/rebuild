-- 004 — Capas de referencia.
--
-- Las capas derivadas de OSM viven en `osm_raw` y `osm_derived`, aisladas
-- del resto del modelo (fuentes.md §8). No es organizacion: es lo que hace
-- acotable la obligacion de share-alike de ODbL.

-- `display_name` y no `name`: una columna llamada `name` a secas es
-- indistinguible de un campo de datos personales, y el escaneo de esquema de
-- FR-PII-02 la marca con razon. Nombrar la cosa cuesta nada.
CREATE TABLE rebuild_osm_raw.road (
    osm_id      bigint PRIMARY KEY,
    highway     text NOT NULL,
    display_name        text,
    foot_access boolean NOT NULL DEFAULT true,
    geometry    geometry(LineString, 4326) NOT NULL,
    data_version bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_road_geom_idx ON rebuild_osm_raw.road USING GIST (geometry);

CREATE TABLE rebuild_osm_raw.green_space (
    osm_id      bigint PRIMARY KEY,
    leisure     text NOT NULL,
    display_name        text,
    geometry    geometry(Geometry, 4326) NOT NULL,
    area_m2     numeric NOT NULL,
    data_version bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_green_geom_idx ON rebuild_osm_raw.green_space USING GIST (geometry);

CREATE TABLE rebuild_osm_raw.facility (
    osm_id      bigint PRIMARY KEY,
    amenity     text NOT NULL,
    category    text NOT NULL CHECK (category IN ('education', 'health', 'community')),
    display_name        text,
    geometry    geometry(Point, 4326) NOT NULL,
    data_version bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_facility_geom_idx ON rebuild_osm_raw.facility USING GIST (geometry);

-- osm_derived — el grafo peatonal. Deriva de OSM, luego hereda su regimen.
CREATE TABLE rebuild_osm_derived.pedestrian_edge (
    id        bigserial PRIMARY KEY,
    osm_id    bigint NOT NULL,
    source    bigint,
    target    bigint,
    cost      double precision NOT NULL,
    reverse_cost double precision NOT NULL,
    length_m  double precision NOT NULL,
    geometry  geometry(LineString, 4326) NOT NULL
);
CREATE INDEX pedestrian_edge_geom_idx ON rebuild_osm_derived.pedestrian_edge USING GIST (geometry);
CREATE INDEX pedestrian_edge_source_idx ON rebuild_osm_derived.pedestrian_edge (source);
CREATE INDEX pedestrian_edge_target_idx ON rebuild_osm_derived.pedestrian_edge (target);

-- Capas de contexto que NO derivan de OSM viven en core: distinto regimen.
CREATE TABLE rebuild_core.population_cell (
    cell_id      bigserial PRIMARY KEY,
    geometry     geometry(Polygon, 4326) NOT NULL,
    population   numeric NOT NULL CHECK (population >= 0),
    households   numeric NOT NULL CHECK (households >= 0),
    vulnerability numeric NOT NULL CHECK (vulnerability BETWEEN 0 AND 1),
    is_synthetic boolean NOT NULL,
    data_version bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX population_cell_geom_idx ON rebuild_core.population_cell USING GIST (geometry);

CREATE TABLE rebuild_core.risk_zone (
    zone_id      bigserial PRIMARY KEY,
    geometry     geometry(Polygon, 4326) NOT NULL,
    risk_level   text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'prohibited')),
    risk_score   numeric NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
    is_synthetic boolean NOT NULL,
    data_version bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX risk_zone_geom_idx ON rebuild_core.risk_zone USING GIST (geometry);

CREATE TABLE rebuild_core.land_use (
    land_use_id  bigserial PRIMARY KEY,
    geometry     geometry(Polygon, 4326) NOT NULL,
    category     text NOT NULL,
    is_synthetic boolean NOT NULL,
    data_version bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX land_use_geom_idx ON rebuild_core.land_use USING GIST (geometry);

-- Referencia administrativa (datos.gov.co ebsr-7cb7). Sin geometria en la
-- fuente: es un catalogo de barrio -> comuna, no una capa.
CREATE TABLE rebuild_core.reference_neighborhood (
    neighborhood_code text PRIMARY KEY,
    neighborhood      text NOT NULL,
    commune_code      text NOT NULL,
    commune           text NOT NULL,
    data_version      bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
