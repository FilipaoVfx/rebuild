-- 010 — Lugares: lo que hace que el mapa se lea como Pereira (ADR-22).
--
-- Comunas, barrios, rios, hitos y arterias salen de OSM y viven en
-- `rebuild_osm_raw`, con el mismo aislamiento share-alike que las vias
-- (fuentes.md §8). Lo que un sitio hereda de ellos —su barrio, su comuna, su
-- esquina, su hito mas cercano— es dato DERIVADO de OSM y por eso va en
-- `rebuild_osm_derived.site_place`, no en `rebuild_core.site`: escribir un
-- nombre ODbL en `core` es exactamente la fuga de regimen que el aislamiento
-- por esquema existe para impedir. `site.neighborhood` y `site.commune`
-- quedan reservadas a un catalogo oficial no-ODbL, si algun dia lo hay.
--
-- `display_name` y no `name`, por la misma razon que en 004: una columna
-- llamada `name` es indistinguible de un campo personal para FR-PII-02.

-- Perimetro urbano (7), comunas (8) y barrios (9). Multipoligonos armados en
-- PostGIS a partir de los miembros de la relacion; una relacion que no cierra
-- se cuenta en el manifiesto de la version y no se parchea.
CREATE TABLE rebuild_osm_raw.admin_area (
    osm_id        bigint PRIMARY KEY,
    admin_level   smallint NOT NULL CHECK (admin_level IN (7, 8, 9)),
    display_name  text NOT NULL,
    wikidata      text,
    geometry      geometry(MultiPolygon, 4326) NOT NULL,
    data_version  bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_admin_area_geom_idx ON rebuild_osm_raw.admin_area USING GIST (geometry);
CREATE INDEX osm_admin_area_level_idx ON rebuild_osm_raw.admin_area (admin_level);

-- Nombres de lugar sin poligono: la ciudad, sectores y barrios que OSM tiene
-- como punto. Sirven de respaldo cuando ningun barrio (9) contiene el sitio.
CREATE TABLE rebuild_osm_raw.place_point (
    osm_id        bigint PRIMARY KEY,
    place         text NOT NULL,
    display_name  text NOT NULL,
    wikidata      text,
    population    integer,
    geometry      geometry(Point, 4326) NOT NULL,
    data_version  bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_place_point_geom_idx ON rebuild_osm_raw.place_point USING GIST (geometry);

CREATE TABLE rebuild_osm_raw.waterway (
    osm_id        bigint PRIMARY KEY,
    waterway      text NOT NULL,
    display_name  text NOT NULL,
    geometry      geometry(LineString, 4326) NOT NULL,
    data_version  bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_waterway_geom_idx ON rebuild_osm_raw.waterway USING GIST (geometry);

-- Hitos con nombre. `priority` ordena que se etiqueta primero cuando no cabe
-- todo: 1 = gobierno y plazas, 4 = iglesias y bibliotecas.
CREATE TABLE rebuild_osm_raw.landmark (
    osm_id        bigint PRIMARY KEY,
    kind          text NOT NULL,
    subkind       text NOT NULL,
    display_name  text NOT NULL,
    wikidata      text,
    priority      smallint NOT NULL CHECK (priority BETWEEN 1 AND 4),
    geometry      geometry(Point, 4326) NOT NULL,
    data_version  bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_landmark_geom_idx ON rebuild_osm_raw.landmark USING GIST (geometry);

-- Arterias que el extracto peatonal excluye a proposito (nadie camina por una
-- autopista) y que aqui solo orientan. Tabla aparte de `road` para que el
-- grafo peatonal no las vea.
CREATE TABLE rebuild_osm_raw.arterial_road (
    osm_id        bigint PRIMARY KEY,
    highway       text NOT NULL,
    display_name  text,
    geometry      geometry(LineString, 4326) NOT NULL,
    data_version  bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX osm_arterial_road_geom_idx ON rebuild_osm_raw.arterial_road USING GIST (geometry);

-- Lo que cada sitio hereda del territorio. Sin FK a `site`: los sitios se
-- borran y se recrean en cada corrida, y esta tabla se recalcula entera.
CREATE TABLE rebuild_osm_derived.site_place (
    site_id                text PRIMARY KEY,
    neighborhood           text,
    neighborhood_osm_id    bigint,
    neighborhood_method    text CHECK (neighborhood_method IN ('ADMIN_POLYGON', 'NEAREST_PLACE')),
    commune                text,
    commune_osm_id         bigint,
    corner_label           text,
    corner_road_a          text,
    corner_road_b          text,
    nearest_landmark       text,
    nearest_landmark_osm_id bigint,
    nearest_landmark_m     numeric CHECK (nearest_landmark_m >= 0),
    data_version           bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);

-- Capas municipales con licencia declarada (pereira_sig). No derivan de OSM:
-- distinto regimen, distinto esquema.
CREATE TABLE rebuild_core.municipal_facility (
    facility_id    bigserial PRIMARY KEY,
    source_ref     text,
    display_name   text,
    facility_type  text,
    origin_note    text,
    area_m2        numeric,
    geometry       geometry(MultiPolygon, 4326) NOT NULL,
    data_version   bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX municipal_facility_geom_idx ON rebuild_core.municipal_facility USING GIST (geometry);

CREATE TABLE rebuild_core.municipal_public_space (
    space_id       bigserial PRIMARY KEY,
    source_ref     text,
    display_name   text,
    space_type     text,
    origin_note    text,
    area_m2        numeric,
    geometry       geometry(MultiPolygon, 4326) NOT NULL,
    data_version   bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX municipal_public_space_geom_idx
    ON rebuild_core.municipal_public_space USING GIST (geometry);

-- Contornos de referencia para el localizador (Natural Earth, dominio
-- publico): el pais y el departamento. No alimentan ninguna feature.
CREATE TABLE rebuild_core.reference_region (
    region_id      text PRIMARY KEY,
    level          text NOT NULL CHECK (level IN ('country', 'state')),
    display_name   text NOT NULL,
    geometry       geometry(MultiPolygon, 4326) NOT NULL,
    data_version   bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);

COMMENT ON TABLE rebuild_osm_derived.site_place IS
    'ADR-22. Barrio, comuna, esquina e hito de cada sitio, derivados de OSM. '
    'NULL significa que no hay dato, y el visor lo dice; nunca se rellena.';
