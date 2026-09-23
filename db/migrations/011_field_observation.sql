-- 011 — Fotos de campo (ADR-24): la evidencia visual del sitio.
--
-- Cada fila es una observación de pereiramap: una foto tomada en el terreno,
-- con su ubicación resuelta y su hora. Entra por el pipeline como cualquier
-- otra fuente (registro `pereiramap`, version de dataset, imagenes copiadas a
-- `data/field/`) y se enlaza al sitio mas cercano a <= 75 m. No alimenta
-- ninguna feature ni el scoring: respalda con imagen lo que las cifras dicen
-- de un lugar, y muestra dano donde el satelite no vio ninguno.
--
-- Sin datos personales por construccion: la app no pide nombre, no admite
-- texto libre, sube la imagen sin EXIF y la vista publica de la que se lee no
-- expone el identificador del dispositivo. Lo que si puede haber en una foto
-- (una cara, una placa, un numero de casa) lo filtra la revision humana:
-- `review_status` viaja con la fila y el paquete PUBLIC solo copia APROBADA.
--
-- `site_id` no lleva clave foranea: `derive_sites` recrea los sitios en cada
-- corrida y el enlace se recalcula despues (`link_field_observations`).
CREATE TABLE rebuild_core.field_observation (
    observation_id        uuid PRIMARY KEY,
    captured_at           timestamptz NOT NULL,
    received_at           timestamptz NOT NULL,
    category              text,
    location_source       text NOT NULL CHECK (location_source IN ('DEVICE', 'EXIF', 'MANUAL')),
    accuracy_m            numeric(7,1),
    heading_deg           numeric(5,1),
    exif_gps              boolean NOT NULL DEFAULT false,
    exif_device_offset_m  numeric(8,1),
    review_status         text NOT NULL CHECK (review_status IN ('PENDIENTE', 'APROBADA')),
    image_path            text NOT NULL,        -- relativo a data/field/
    thumb_path            text NOT NULL,
    image_sha256          text NOT NULL,
    width                 integer NOT NULL,
    height                integer NOT NULL,
    geometry              geometry(Point, 4326) NOT NULL,
    site_id               text,
    site_distance_m       numeric(7,1),
    data_version          bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version)
);
CREATE INDEX field_observation_geom_idx ON rebuild_core.field_observation USING GIST (geometry);
CREATE INDEX field_observation_site_idx ON rebuild_core.field_observation (site_id);
