-- 007 — Escenas e índices satelitales Sentinel-1 / Sentinel-2.
--
-- Primera fase del pipeline de evidencia de cambio: catalogar escenas y
-- guardar los índices espectrales/radar recortados al AOI. NADA aquí es daño.
--
-- La distinción no es de estilo, es la que decide si el sistema miente. Un
-- cambio de retrodispersión o de NDVI entre dos fechas es un CAMBIO OBSERVADO
-- en la señal; llamarlo `damage_score` afirmaría una causa que el dato no
-- contiene. Un edificio demolido, una obra nueva, un cultivo cosechado, un
-- suelo mojado y un techo repintado producen cambios comparables. Por eso la
-- columna es `change_score` y la clase de evidencia que se derive de ella
-- será DAMAGE_EVIDENCE, nunca CONFIRMED_DAMAGE.

CREATE TYPE rebuild_core.satellite_collection AS ENUM ('sentinel-1-grd', 'sentinel-2-l2a');

-- Pre y post respecto al evento. Se guarda explícito en vez de deducirse
-- comparando fechas en cada consulta: la ventana es una decisión del análisis
-- (documentada en el manifiesto), no una propiedad de la escena.
CREATE TYPE rebuild_core.event_window AS ENUM ('PRE', 'POST');

CREATE TABLE rebuild_core.satellite_scene (
    scene_pk         bigserial PRIMARY KEY,
    -- El identificador que da el catálogo. Es la clave por la que alguien
    -- ajeno al proyecto puede volver a pedir exactamente esta escena.
    scene_id         text NOT NULL,
    collection       rebuild_core.satellite_collection NOT NULL,
    event_window     rebuild_core.event_window NOT NULL,
    acquisition_date timestamptz NOT NULL,
    -- Huella de la escena tal como la publica el catálogo, no el AOI.
    footprint        geometry(Geometry, 4326) NOT NULL,
    cloud_cover      numeric CHECK (cloud_cover IS NULL OR cloud_cover BETWEEN 0 AND 100),
    platform         text,
    processing_baseline text,
    -- Sentinel-1: sin órbita y dirección, dos escenas no son comparables.
    -- Comparar una ascendente con una descendente produce una diferencia de
    -- geometría de adquisición que se leería como cambio en el terreno.
    orbit_direction  text CHECK (orbit_direction IN ('ASCENDING', 'DESCENDING')),
    relative_orbit   integer,
    -- Procedencia: qué se pidió y cuándo, además de qué se recibió.
    selected         boolean NOT NULL DEFAULT false,
    selection_reason text,
    request_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    retrieved_at     timestamptz NOT NULL DEFAULT now(),
    processing_date  timestamptz,
    asset_path       text,
    data_version     bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version),
    UNIQUE (scene_id, collection)
);
CREATE INDEX satellite_scene_footprint_idx ON rebuild_core.satellite_scene USING GIST (footprint);
CREATE INDEX satellite_scene_window_idx ON rebuild_core.satellite_scene (collection, event_window);

-- Una escena seleccionada tiene que decir por qué lo fue. El criterio es
-- parte del resultado: sin él, "la mejor escena" es una afirmación que nadie
-- puede auditar ni reproducir.
ALTER TABLE rebuild_core.satellite_scene
    ADD CONSTRAINT selected_scene_states_its_reason
    CHECK (selected = false OR selection_reason IS NOT NULL);

-- Sentinel-2 trae nubosidad; Sentinel-1 no, porque el radar atraviesa la nube.
-- Un 0 en la columna de una escena S1 se leería como "despejado" en vez de
-- "no aplica", así que la base exige que sea NULL.
ALTER TABLE rebuild_core.satellite_scene
    ADD CONSTRAINT radar_has_no_cloud_cover
    CHECK (collection <> 'sentinel-1-grd' OR cloud_cover IS NULL);

COMMENT ON TABLE rebuild_core.satellite_scene IS
    'Catálogo de escenas Sentinel consideradas, no solo las elegidas. Las '
    'descartadas son la evidencia de que la selección fue una decisión entre '
    'alternativas y no la única opción disponible.';

CREATE TABLE rebuild_core.satellite_observation (
    observation_pk bigserial PRIMARY KEY,
    -- Rejilla de observación recortada al AOI. La geometría es la celda, no
    -- el edificio: cruzar con huellas es la etapa siguiente y no se adelanta.
    geometry     geometry(Geometry, 4326) NOT NULL,
    -- `band` nombra lo que se midió: VV, VH, B02..B12, NDVI, NDBI, NDWI,
    -- delta_backscatter, ratio_pre_post, spectral_change.
    band         text NOT NULL,
    value        double precision NOT NULL,
    event_window rebuild_core.event_window NOT NULL,
    scene_pk     bigint NOT NULL REFERENCES rebuild_core.satellite_scene(scene_pk),
    observation_date timestamptz NOT NULL,
    data_version bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX satellite_observation_geom_idx ON rebuild_core.satellite_observation USING GIST (geometry);
CREATE INDEX satellite_observation_band_idx ON rebuild_core.satellite_observation (band, event_window);

-- Ninguna banda puede llamarse como un veredicto. La prohibición está en la
-- base porque en revisión de código se pasa: bastaría un adaptador nuevo que
-- escriba `damage_score` para que el resto del sistema empiece a tratar un
-- cambio de reflectancia como daño confirmado.
ALTER TABLE rebuild_core.satellite_observation
    ADD CONSTRAINT band_is_a_measurement_not_a_verdict
    CHECK (lower(band) NOT LIKE '%damage%' AND lower(band) NOT LIKE '%destroy%'
           AND lower(band) NOT LIKE '%dano%' AND lower(band) NOT LIKE '%destru%');

COMMENT ON COLUMN rebuild_core.satellite_observation.band IS
    'Qué se midió. Nunca un veredicto: un cambio de retrodispersión no es '
    'daño, y el CHECK de esta tabla impide que una banda se llame como si lo '
    'fuera.';

-- Ni escenas ni observaciones pueden ser sintéticas (ADR-17).
--
-- Un CHECK no sirve: lo que hay que comprobar vive en otra tabla
-- (`dataset_version.is_synthetic`), y un CHECK sobre `data_version IS NOT
-- NULL` sería una tautología con su propio NOT NULL — la clase de restricción
-- que parece proteger algo y no protege nada. Va como trigger, igual que la
-- inmutabilidad de FR-ING-02.
CREATE OR REPLACE FUNCTION rebuild_core.reject_synthetic_satellite_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM rebuild_core.dataset_version
        WHERE data_version = NEW.data_version AND is_synthetic
    ) THEN
        RAISE EXCEPTION
            'ADR-17: % no admite una version de dataset sintetica (data_version=%)',
            TG_TABLE_NAME, NEW.data_version;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER satellite_scene_rejects_synthetic
    BEFORE INSERT OR UPDATE ON rebuild_core.satellite_scene
    FOR EACH ROW EXECUTE FUNCTION rebuild_core.reject_synthetic_satellite_version();

CREATE TRIGGER satellite_observation_rejects_synthetic
    BEFORE INSERT OR UPDATE ON rebuild_core.satellite_observation
    FOR EACH ROW EXECUTE FUNCTION rebuild_core.reject_synthetic_satellite_version();

COMMENT ON TABLE rebuild_core.satellite_observation IS
    'Índices espectrales y de radar recortados al AOI. Materia prima de la '
    'evidencia de cambio; no es evidencia de daño y no se llama así.';
