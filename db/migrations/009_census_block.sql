-- Manzanas censales del DANE (Censo 2018). La primera fuente del proyecto que
-- MIDE poblacion en vez de repartirla.
--
-- Hasta ahora el 67,2 % del score colgaba de una sola cadena: un total de
-- 190.000 personas publicado por Copernicus, repartido sobre 15.024 huellas
-- de Microsoft asumiendo densidad uniforme por area construida. Esto sustituye
-- el supuesto por un conteo: 2.348 manzanas, 179.954 personas, a un 5,3 % del
-- total que se venia usando — lo que ademas corrobora aquel total por una via
-- independiente.
CREATE TABLE rebuild_core.census_block (
    block_pk       bigserial PRIMARY KEY,
    -- El identificador del DANE. Es la clave por la que alguien ajeno al
    -- proyecto puede volver a pedir exactamente esta manzana.
    block_id       text NOT NULL,
    municipality   text,
    geometry       geometry(Geometry, 4326) NOT NULL,

    population     integer NOT NULL CHECK (population >= 0),

    -- Insumos de vulnerabilidad. NULL significa suprimido o ausente, nunca
    -- cero: un cero aqui se leeria como "ninguna persona analfabeta" cuando
    -- lo que pasa es que no se puede publicar.
    illiterate     integer CHECK (illiterate IS NULL OR illiterate >= 0),
    over_70        integer CHECK (over_70 IS NULL OR over_70 >= 0),
    disabled       integer CHECK (disabled IS NULL OR disabled >= 0),
    no_education   integer CHECK (no_education IS NULL OR no_education >= 0),
    -- Estrato socioeconomico colombiano: 1 el mas bajo, 6 el mas alto.
    stratum        smallint CHECK (stratum IS NULL OR stratum BETWEEN 1 AND 6),

    vulnerability  double precision
                   CHECK (vulnerability IS NULL OR vulnerability BETWEEN 0 AND 1),

    -- FR-PII-03. Marcador de supresion, no un silencio.
    pii_suppressed boolean NOT NULL DEFAULT false,

    data_version   bigint NOT NULL REFERENCES rebuild_core.dataset_version(data_version),
    UNIQUE (block_id, data_version)
);
CREATE INDEX census_block_geom_idx ON rebuild_core.census_block USING GIST (geometry);

-- Una manzana suprimida no publica los atributos que la harian identificable.
--
-- El riesgo NO es teorico: en el AOI hay 64 manzanas de menos de 20 personas
-- donde al menos una tiene condicion fisica registrada. Una de 15 habitantes
-- con un caso senala a una persona concreta para cualquiera que conozca el
-- barrio. La poblacion si se conserva: un conteo de personas por manzana no
-- identifica a nadie; el cruce de atributos, si.
ALTER TABLE rebuild_core.census_block
    ADD CONSTRAINT suppressed_block_publishes_no_attributes
    CHECK (
        pii_suppressed = false
        OR (illiterate IS NULL AND disabled IS NULL AND no_education IS NULL
            AND stratum IS NULL AND vulnerability IS NULL)
    );

-- Y al reves: una manzana por debajo del umbral TIENE que estar marcada. Sin
-- esto, bastaria olvidar el marcador en un adaptador nuevo para publicar los
-- atributos de una manzana de tres habitantes.
ALTER TABLE rebuild_core.census_block
    ADD CONSTRAINT small_block_must_be_suppressed
    CHECK (population >= 20 OR pii_suppressed = true);

COMMENT ON TABLE rebuild_core.census_block IS
    'Censo 2018 del DANE agregado por manzana. Conteos, no microdato '
    '(CON-04, FR-PII-01). Los atributos que permitirian reidentificar en '
    'manzanas pequenas se suprimen con marcador (FR-PII-03).';

COMMENT ON COLUMN rebuild_core.census_block.vulnerability IS
    'Compuesto DECLARADO, no un indice validado: media de estrato invertido, '
    'analfabetismo, mayores de 70 y condicion fisica, cada uno normalizado a '
    '0-1. Los pesos son una eleccion explicita del proyecto, igual que los '
    'del score, y no una medida oficial del DANE.';
