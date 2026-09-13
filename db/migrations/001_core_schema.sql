-- 001 — Esquemas, extensiones y vocabularios controlados.
--
-- ADR-11: `core` pertenece a las migraciones; `analytics` a los modelos derivados.
-- fuentes.md §8: `osm_raw` y `osm_derived` estan aislados por el share-alike de ODbL.
--   El aislamiento es estructural, no una convencion: sostiene la lectura de
--   Collective Database y hace que ofrecer la base derivada bajo ODbL sea un
--   volcado de dos esquemas y no una negociacion sobre todo el sistema.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS osm_raw;
CREATE SCHEMA IF NOT EXISTS osm_derived;

-- fuentes.md §1 — los cinco ejes de licencia colapsan en un unico enum que
-- gobierna los controles automaticos. UNCLEAR es el valor seguro: bloquea.
CREATE TYPE core.license_class AS ENUM (
    'COMMERCIAL_SAFE',
    'ATTRIBUTION',
    'SHARE_ALIKE',
    'NON_COMMERCIAL',
    'UNCLEAR'
);

-- fuentes.md §5 — un export no es un archivo, es un archivo con destinatario.
CREATE TYPE core.export_profile AS ENUM ('INTERNAL', 'INSTITUTIONAL', 'COMMERCIAL');

-- ADR-16 — vocabulario normalizado de daño. Ordinal: el orden importa.
CREATE TYPE core.damage_class AS ENUM (
    'NO_DAMAGE',
    'POSSIBLY_DAMAGED',
    'DAMAGED',
    'DESTROYED'
);

-- ADR-16 — como se observó el daño. Gobierna la fiabilidad en la fusion.
CREATE TYPE core.evidence_method AS ENUM (
    'REMOTE_SENSING',
    'FIELD_INSPECTION',
    'CITIZEN_REPORT',
    'OFFICIAL_REGISTRY',
    'SYNTHETIC'
);

-- SRS §5.2 — ciclo de vida del sitio de oportunidad.
CREATE TYPE core.site_state AS ENUM (
    'INGESTED',
    'EVALUATED',
    'EXCLUDED',
    'CANDIDATE',
    'SHORTLISTED',
    'ENDORSED'
);

-- PRD §16, recortado a los 6 tipos de la V1 (plan de MVP §1.4).
CREATE TYPE core.intervention_type AS ENUM (
    'PARK',
    'SPORTS',
    'PUBLIC_SQUARE',
    'COMMUNITY_FACILITY',
    'OPEN_SPACE',
    'NO_BUILD'
);

-- FR-FEAT-03 — como se calculo un catchment. `BUFFER` implica degradacion.
CREATE TYPE core.catchment_method AS ENUM ('NETWORK', 'BUFFER');
