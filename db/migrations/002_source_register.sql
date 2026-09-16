-- 002 — Registro de fuentes y versionado inmutable de datasets.
--
-- FR-ING-01, FR-LIC-01, fuentes.md §4. Esta tabla es la que hace cumplible
-- todo el regimen de licencia: sin una fila aqui, una fuente no entra.

CREATE TABLE rebuild_core.source_register (
    source_id              text PRIMARY KEY,
    display_name           text NOT NULL,
    tier                   char(1) NOT NULL CHECK (tier IN ('A', 'B', 'C')),

    -- FR-ING-01
    source_url             text NOT NULL,
    access_method          text NOT NULL
        CHECK (access_method IN ('wfs', 'wms', 'download', 'api', 'request', 'generated')),
    spatial_reference      text NOT NULL,
    update_frequency       interval,
    quality_score          numeric CHECK (quality_score BETWEEN 0 AND 1),

    -- FR-LIC-01
    license_class          rebuild_core.license_class NOT NULL DEFAULT 'UNCLEAR',
    license_name           text,
    license_url            text,
    attribution_text       text,
    redistribution_allowed boolean,
    derivatives_allowed    boolean,
    share_alike            boolean NOT NULL DEFAULT false,

    -- Evidencia de la verificacion. terms_snapshot_path es el campo que
    -- la gente omite y luego echa de menos: los portales cambian sus
    -- terminos sin historial, y lo que importa legalmente es bajo que
    -- condiciones se obtuvo el dato en su fecha de obtencion.
    terms_verified_at      date,
    terms_verified_by      text,
    terms_snapshot_path    text,
    verification_notes     text,

    created_at             timestamptz NOT NULL DEFAULT now(),

    -- Una fuente clasificada no puede quedarse sin la evidencia que la respalda.
    CONSTRAINT verified_sources_carry_evidence CHECK (
        license_class = 'UNCLEAR' OR terms_verified_at IS NOT NULL
    )
);

COMMENT ON TABLE rebuild_core.source_register IS
    'fuentes.md §4. UNCLEAR es el valor por defecto y bloquea el uso de la fuente.';

-- fuentes.md §5 — que clases de licencia admite cada perfil de export.
CREATE TABLE rebuild_core.export_profile_policy (
    profile        rebuild_core.export_profile NOT NULL,
    allowed_class  rebuild_core.license_class  NOT NULL,
    PRIMARY KEY (profile, allowed_class)
);

INSERT INTO rebuild_core.export_profile_policy (profile, allowed_class) VALUES
    ('INTERNAL',      'COMMERCIAL_SAFE'),
    ('INTERNAL',      'ATTRIBUTION'),
    ('INTERNAL',      'SHARE_ALIKE'),
    ('INTERNAL',      'NON_COMMERCIAL'),
    ('INTERNAL',      'UNCLEAR'),
    ('INSTITUTIONAL', 'COMMERCIAL_SAFE'),
    ('INSTITUTIONAL', 'ATTRIBUTION'),
    ('INSTITUTIONAL', 'SHARE_ALIKE'),
    ('INSTITUTIONAL', 'NON_COMMERCIAL'),
    ('COMMERCIAL',    'COMMERCIAL_SAFE'),
    ('COMMERCIAL',    'ATTRIBUTION'),
    ('COMMERCIAL',    'SHARE_ALIKE');

-- ADR-06 — los datasets son append-only. Una actualizacion crea la version
-- n+1; la version n no se muta nunca.
CREATE TABLE rebuild_core.dataset_version (
    data_version   bigserial PRIMARY KEY,
    source_id      text NOT NULL REFERENCES rebuild_core.source_register(source_id),
    retrieved_at   timestamptz NOT NULL,
    published_at   timestamptz NOT NULL DEFAULT now(),
    record_count   integer NOT NULL CHECK (record_count >= 0),
    content_hash   text NOT NULL,
    is_synthetic   boolean NOT NULL,
    manifest       jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (source_id, content_hash)
);

CREATE INDEX dataset_version_source_idx ON rebuild_core.dataset_version (source_id, data_version DESC);

-- FR-ING-02 — la inmutabilidad no es una convencion, es un trigger.
CREATE OR REPLACE FUNCTION rebuild_core.forbid_dataset_version_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'FR-ING-02: dataset_version % es inmutable; publique una version nueva',
        OLD.data_version;
END;
$$;

CREATE TRIGGER dataset_version_is_immutable
    BEFORE UPDATE OR DELETE ON rebuild_core.dataset_version
    FOR EACH ROW EXECUTE FUNCTION rebuild_core.forbid_dataset_version_mutation();
