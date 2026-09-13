-- 003 — Evidencia de daño y sitios de oportunidad.
--
-- ADR-16: el daño es evidencia acumulada por sitio, no un atributo del sitio.
-- `source` (quien nos entrego la observacion) va separado de `original_source`
-- (quien la produjo), porque la licencia se resuelve contra el segundo.

CREATE TABLE core.damage_evidence (
    evidence_id      bigserial PRIMARY KEY,

    -- fuentes.md §7.9 — un agregador CC BY 4.0 no "lava" la licencia de lo
    -- que agrega. Por eso son dos columnas y no una.
    source           text NOT NULL REFERENCES core.source_register(source_id),
    original_source  text NOT NULL REFERENCES core.source_register(source_id),

    geometry         geometry(Geometry, 4326) NOT NULL,
    -- antes-de-empezar.md §4 / D5: el dato real es de punto, no de poligono.
    -- La precision posicional es lo que permite admitirlo sin fingir que es
    -- una huella de edificacion.
    positional_accuracy_m numeric CHECK (positional_accuracy_m > 0),

    -- FR-QUAL-01 — dos fechas, no una: una evidencia puede ser reciente para
    -- nosotros y vieja respecto al evento.
    observation_date date NOT NULL,
    acquisition_date date NOT NULL,

    damage_class     core.damage_class NOT NULL,
    raw_damage_label text NOT NULL,
    building_type    text,
    method           core.evidence_method NOT NULL,
    field_validated  boolean NOT NULL DEFAULT false,
    confidence       numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    is_synthetic     boolean NOT NULL,

    data_version     bigint NOT NULL REFERENCES core.dataset_version(data_version),
    notes            text,

    CONSTRAINT observation_precedes_acquisition CHECK (observation_date <= acquisition_date)
);

CREATE INDEX damage_evidence_geom_idx ON core.damage_evidence USING GIST (geometry);
CREATE INDEX damage_evidence_source_idx ON core.damage_evidence (original_source);

COMMENT ON TABLE core.damage_evidence IS
    'ADR-16. El sistema nunca afirma que un edificio esta destruido: acumula '
    'quien lo observo, con que metodo y en que fecha.';

-- SRS §7 — un sitio de oportunidad. La geometria se deriva de agrupar
-- evidencia cercana, porque el dato de origen son puntos sueltos.
CREATE TABLE core.site (
    site_id          text PRIMARY KEY,
    geometry         geometry(Polygon, 4326) NOT NULL,
    centroid         geometry(Point, 4326) NOT NULL,
    area_m2          numeric NOT NULL CHECK (area_m2 > 0),
    -- El area sale de la envolvente de la evidencia, no de un catastro.
    -- Decirlo es la diferencia entre un dato y una suposicion.
    area_is_estimated boolean NOT NULL DEFAULT true,

    neighborhood     text,
    commune          text,

    state            core.site_state NOT NULL DEFAULT 'INGESTED',
    evidence_count   integer NOT NULL DEFAULT 0,
    is_synthetic     boolean NOT NULL,
    data_version     bigint NOT NULL REFERENCES core.dataset_version(data_version),
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_geom_idx ON core.site USING GIST (geometry);
CREATE INDEX site_centroid_idx ON core.site USING GIST (centroid);
CREATE INDEX site_state_idx ON core.site (state);

-- Que evidencia sustenta que sitio. Es la trazabilidad que hace defendible
-- el sistema: nunca "la IA sabe", siempre "estas fuentes lo sustentan".
CREATE TABLE core.site_evidence (
    site_id      text   NOT NULL REFERENCES core.site(site_id) ON DELETE CASCADE,
    evidence_id  bigint NOT NULL REFERENCES core.damage_evidence(evidence_id),
    PRIMARY KEY (site_id, evidence_id)
);

-- ADR-16 — la fusion: de N observaciones a una clase y una confianza.
CREATE TABLE core.site_damage_fusion (
    site_id            text PRIMARY KEY REFERENCES core.site(site_id) ON DELETE CASCADE,
    damage_class       core.damage_class NOT NULL,
    damage_confidence  numeric NOT NULL CHECK (damage_confidence BETWEEN 0 AND 1),
    -- R9 / OI-F7: fuentes que clasifican las mismas imagenes no son
    -- confirmaciones independientes. Se guarda cuantas lo son de verdad.
    independent_sources integer NOT NULL,
    contributing_sources text[] NOT NULL,
    agreement_ratio    numeric NOT NULL CHECK (agreement_ratio BETWEEN 0 AND 1),
    any_field_validated boolean NOT NULL,
    observation_age_days integer NOT NULL,
    drivers            jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at        timestamptz NOT NULL DEFAULT now()
);
