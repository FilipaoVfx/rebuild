-- La oportunidad de recuperacion, persistida (ADR-20, §14 del requerimiento).
--
-- Hasta ahora se calculaba al vuelo en cada peticion. Eso bastaba para
-- mostrarla y no bastaba para NADA MAS: sin fila no hay identificador estable
-- entre corridas, no se puede unir a un escenario, no se puede versionar y no
-- se puede auditar que decia la oportunidad #17 el dia que alguien decidio
-- sobre ella. Una recomendacion que no se puede citar despues no es una
-- recomendacion, es una pantalla.
CREATE TABLE rebuild_core.recovery_opportunity (
    opportunity_pk   bigserial PRIMARY KEY,
    opportunity_id   text NOT NULL,
    site_id          text NOT NULL REFERENCES rebuild_core.site(site_id),
    zone             text,

    -- Geometria propia: es lo que desacopla al consumidor de `site`. Una
    -- vista pide oportunidades y no necesita saber de que tabla salio el
    -- poligono.
    geometry         geometry(Geometry, 4326) NOT NULL,
    centroid         geometry(Point, 4326) NOT NULL,

    -- ── Problema ────────────────────────────────────────────────────────
    problem_headline text NOT NULL,
    problem_drivers  jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Lo que el modelo NO pudo mirar en este sitio. Se guarda porque cambia
    -- cuanto se le puede creer al resto, y en una nota al pie no cambia nada.
    missing_factors  jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- ── Evidencia (RD-02: separada del veredicto) ───────────────────────
    damage_observations integer NOT NULL DEFAULT 0
                        CHECK (damage_observations >= 0),
    damage_classes   jsonb NOT NULL DEFAULT '{}'::jsonb,
    evidence_sources text[] NOT NULL DEFAULT '{}',
    agreement        double precision
                     CHECK (agreement IS NULL OR agreement BETWEEN 0 AND 1),

    -- ── Intervencion e impacto ──────────────────────────────────────────
    intervention     rebuild_core.intervention_type NOT NULL,
    intervention_label text NOT NULL,
    population_reached integer NOT NULL DEFAULT 0
                       CHECK (population_reached >= 0),
    deficit_reduction double precision,
    area_m2          double precision NOT NULL CHECK (area_m2 >= 0),
    people_per_million_cop double precision,

    -- ── Viabilidad ──────────────────────────────────────────────────────
    -- El array completo, con el estado y la razon de cada condicion. Se
    -- guarda entero y no solo un resumen: "viable" sin el detalle es
    -- exactamente la afirmacion que este proyecto no puede permitirse.
    feasibility      jsonb NOT NULL DEFAULT '[]'::jsonb,
    unknown_count    smallint NOT NULL DEFAULT 0 CHECK (unknown_count >= 0),
    blocked          boolean NOT NULL DEFAULT false,

    cost_cop         double precision NOT NULL CHECK (cost_cop >= 0),
    suitability      double precision NOT NULL,
    confidence       double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),

    -- ── Procedencia (RD-01) ─────────────────────────────────────────────
    provenance       jsonb NOT NULL DEFAULT '{}'::jsonb,
    feature_version  text NOT NULL,
    scoring_version  text NOT NULL,
    generated_at     timestamptz NOT NULL DEFAULT now(),
    data_version     bigint NOT NULL
                     REFERENCES rebuild_core.dataset_version(data_version),

    UNIQUE (opportunity_id, data_version)
);
CREATE INDEX recovery_opportunity_geom_idx
    ON rebuild_core.recovery_opportunity USING GIST (geometry);
CREATE INDEX recovery_opportunity_rank_idx
    ON rebuild_core.recovery_opportunity (data_version, suitability DESC);

-- Una oportunidad sin procedencia es una opinion con formato de dato.
ALTER TABLE rebuild_core.recovery_opportunity
    ADD CONSTRAINT opportunity_states_its_provenance
    CHECK (provenance <> '{}'::jsonb);

-- Postgres no admite subconsultas en un CHECK, asi que el recuento se
-- delega a funciones IMMUTABLE. El efecto es el mismo y el motivo tambien:
-- que el resumen no pueda divergir del detalle.
CREATE FUNCTION rebuild_core.count_feasibility(checks jsonb, wanted text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT count(*)::integer
    FROM jsonb_array_elements(checks) AS c
    WHERE c->>'status' = wanted
$$;

-- El recuento de incognitas tiene que cuadrar con el detalle. Sin esto,
-- bastaria escribir unknown_count = 0 junto a un POT UNKNOWN para que la
-- tarjeta dijera que todo esta comprobado.
ALTER TABLE rebuild_core.recovery_opportunity
    ADD CONSTRAINT unknown_count_matches_the_detail
    CHECK (unknown_count = rebuild_core.count_feasibility(feasibility, 'UNKNOWN'));

-- Y el bloqueo igual: `blocked` no es una etiqueta suelta, es la lectura del
-- array. Divergir es como se publica un proyecto inviable como viable.
ALTER TABLE rebuild_core.recovery_opportunity
    ADD CONSTRAINT blocked_matches_the_detail
    CHECK (blocked = (rebuild_core.count_feasibility(feasibility, 'BLOCKED') > 0));

COMMENT ON TABLE rebuild_core.recovery_opportunity IS
    'Lugar + problema + evidencia + intervencion + impacto + viabilidad. La '
    'entidad central del producto (ADR-20). Persistida para que se pueda '
    'citar, versionar y auditar, no solo mostrar.';

COMMENT ON COLUMN rebuild_core.recovery_opportunity.suitability IS
    'Ordena la lista; NO la titula. "Idoneidad 68,3" no es una razon para '
    'intervenir en un sitio.';
