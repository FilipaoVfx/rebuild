-- 005 — Feature store, restricciones, escenarios y auditoria.
--
-- ADR-11: `analytics` es el esquema de lo derivado. Sólo lee de `core` y
-- `osm_*`; las migraciones nunca crean objetos de dominio aqui.

-- FR-FEAT-05 — todo vector de features lleva su version de feature y de datos.
CREATE TABLE rebuild_analytics.site_feature (
    site_id           text NOT NULL REFERENCES rebuild_core.site(site_id) ON DELETE CASCADE,
    feature_version   text NOT NULL,
    data_version      bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version),

    -- Bloqueantes (plan de MVP §1.3)
    risk_score              numeric,
    land_use_compatibility  numeric,
    site_area               numeric,

    -- Nucleo
    population_10min        numeric,
    households_10min        numeric,
    park_deficit            numeric,
    park_area_per_capita    numeric,
    pedestrian_accessibility numeric,
    social_vulnerability    numeric,
    building_density        numeric,

    -- Contexto
    school_access           numeric,
    health_access           numeric,
    community_access        numeric,

    -- FR-FEAT-03 — como se calculo el catchment, y que se perdio si fue buffer.
    catchment_method  rebuild_core.catchment_method NOT NULL,
    catchment_area_m2 numeric,

    -- FR-FEAT-01 — una feature no calculada se declara, no se deja en NULL mudo.
    unavailable       jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- FR-QUAL-01 — confianza y sus drivers, no un numero suelto.
    confidence        numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    confidence_drivers jsonb NOT NULL DEFAULT '{}'::jsonb,

    is_synthetic      boolean NOT NULL,
    computed_at       timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (site_id, feature_version)
);

-- Catchments precalculados (ADR-02: se computan en batch, no por peticion).
CREATE TABLE rebuild_analytics.site_catchment (
    site_id          text NOT NULL REFERENCES rebuild_core.site(site_id) ON DELETE CASCADE,
    minutes          integer NOT NULL,
    method           rebuild_core.catchment_method NOT NULL,
    geometry         geometry(Geometry, 4326) NOT NULL,
    population       numeric NOT NULL DEFAULT 0,
    households       numeric NOT NULL DEFAULT 0,
    feature_version  text NOT NULL,
    PRIMARY KEY (site_id, minutes, feature_version)
);
CREATE INDEX site_catchment_geom_idx ON rebuild_analytics.site_catchment USING GIST (geometry);

-- FR-CONS-03 — las restricciones son configuracion versionada, no logica.
CREATE TABLE rebuild_core.constraint_set (
    constraint_set_version text PRIMARY KEY,
    definition             jsonb NOT NULL,
    published_at           timestamptz NOT NULL DEFAULT now()
);

-- FR-CONS-02 — cada sitio excluido registra TODAS las restricciones que
-- violo, no la primera que alguien evaluo.
CREATE TABLE rebuild_analytics.site_exclusion (
    site_id                text NOT NULL REFERENCES rebuild_core.site(site_id) ON DELETE CASCADE,
    constraint_set_version text NOT NULL REFERENCES rebuild_core.constraint_set(constraint_set_version),
    constraint_id          text NOT NULL,
    reason                 text NOT NULL,
    is_prohibited_risk     boolean NOT NULL DEFAULT false,
    PRIMARY KEY (site_id, constraint_set_version, constraint_id)
);

-- PRD §16 — catalogo de intervenciones, configuracion versionada.
CREATE TABLE rebuild_core.intervention (
    intervention_type   rebuild_core.intervention_type PRIMARY KEY,
    display_name        text NOT NULL,
    minimum_area_m2     numeric NOT NULL,
    preferred_area_m2   numeric NOT NULL,
    service_radius_m    numeric NOT NULL,
    unit_cost_per_m2    numeric NOT NULL,
    -- OI-05: no hay fuente oficial de costos todavia. Decirlo en la columna
    -- evita que un estimado viaje a un reporte como si fuera un presupuesto.
    cost_is_estimated   boolean NOT NULL DEFAULT true,
    max_risk_score      numeric NOT NULL,
    allowed_land_use    text[] NOT NULL
);

-- FR-SCEN-01 — un escenario fija pesos, restricciones, presupuesto y las
-- versiones en vigor. ADR-06: ademas ancla un hash de lo que produjo su
-- resultado, para que la reproducibilidad sea comprobable y no una promesa.
CREATE TABLE rebuild_core.scenario (
    scenario_id            text PRIMARY KEY,
    display_name                   text NOT NULL,
    weights                jsonb NOT NULL,
    budget_cop             numeric NOT NULL CHECK (budget_cop >= 0),
    allowed_interventions  rebuild_core.intervention_type[] NOT NULL,
    constraint_set_version text NOT NULL REFERENCES rebuild_core.constraint_set(constraint_set_version),
    feature_version        text NOT NULL,
    data_version           bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version),
    scoring_version        text NOT NULL,
    candidate_set_hash     text NOT NULL,
    feature_matrix_hash    text NOT NULL,
    is_synthetic           boolean NOT NULL,
    created_by             text NOT NULL,
    created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rebuild_core.scenario_site (
    scenario_id       text NOT NULL REFERENCES rebuild_core.scenario(scenario_id) ON DELETE CASCADE,
    site_id           text NOT NULL REFERENCES rebuild_core.site(site_id),
    intervention_type rebuild_core.intervention_type NOT NULL,
    rank              integer NOT NULL,
    score             numeric NOT NULL,
    cost_cop          numeric NOT NULL,
    marginal_population numeric NOT NULL,
    marginal_gain     numeric NOT NULL,
    redundancy_ratio  numeric NOT NULL CHECK (redundancy_ratio BETWEEN 0 AND 1),
    PRIMARY KEY (scenario_id, site_id)
);

-- FR-AUDIT-01 — registro inmutable. Sin trigger, "inmutable" es un adjetivo.
CREATE TABLE rebuild_core.audit_log (
    audit_id    bigserial PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor       text NOT NULL,
    action      text NOT NULL,
    entity      text NOT NULL,
    entity_id   text,
    before      jsonb,
    after       jsonb,
    justification text
);

CREATE OR REPLACE FUNCTION rebuild_core.forbid_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'FR-AUDIT-01: el log de auditoria no se edita ni se borra';
END;
$$;

CREATE TRIGGER audit_log_is_immutable
    BEFORE UPDATE OR DELETE ON rebuild_core.audit_log
    FOR EACH ROW EXECUTE FUNCTION rebuild_core.forbid_audit_mutation();

-- FR-QUAL-02 — las alertas son filas consultables, no correos.
CREATE TABLE rebuild_core.quality_alert (
    alert_id   bigserial PRIMARY KEY,
    raised_at  timestamptz NOT NULL DEFAULT now(),
    severity   text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    source_id  text REFERENCES rebuild_core.source_register(source_id),
    code       text NOT NULL,
    message    text NOT NULL,
    payload    jsonb NOT NULL DEFAULT '{}'::jsonb
);
