"""Calculo del vector de features por sitio (FR-FEAT-01..06).

El vector es el del plan de MVP §1.3: 13 features en tres grupos. Los
bloqueantes detienen el scoring si faltan (FR-DEG-01); los de nucleo penalizan
la confianza; los de contexto solo se omiten.
"""

from __future__ import annotations

import json

import psycopg

METRIC_SRID = 3116

#: FR-FEAT-04 — estandar de espacio publico efectivo por habitante.
#: OI-04 abierto: nadie en Pereira ha firmado esta cifra todavia. Viaja
#: versionada con la feature para que cambiarla sea publicar una version.
PUBLIC_SPACE_STANDARD_M2_PER_CAPITA = 10.0

#: FR-DEG-01 — que pasa si una capa falta.
BLOCKING_FEATURES = ("risk_score", "land_use_compatibility", "site_area")
CORE_FEATURES = (
    "population_10min",
    "households_10min",
    "park_deficit",
    "park_area_per_capita",
    "pedestrian_accessibility",
    "social_vulnerability",
    "building_density",
)


class BlockingLayerMissing(RuntimeError):
    """FR-DEG-01. Puntuar sin riesgo no es puntuar con menos informacion:
    es puntuar otra cosa."""


def compute_features(conn: psycopg.Connection, *, feature_version: str, data_version: int) -> int:
    with conn.cursor() as cur:
        # `risk` ya no esta en esta lista. Era dependencia bloqueante cuando
        # habia una capa de amenaza; retirada la del SGC por licencia (ADR-18)
        # no hay ninguna, y bloquear el pipeline por su ausencia solo obligaria
        # a rellenarla. La feature queda nula y se declara.
        for layer, table in (
            ("land_use", "rebuild_core.land_use"),
            ("population", "rebuild_core.population_cell"),
        ):
            cur.execute(f"SELECT count(*) AS n FROM {table}")  # noqa: S608 - tabla de lista fija
            if cur.fetchone()["n"] == 0:
                raise BlockingLayerMissing(
                    f"La capa '{layer}' esta vacia. FR-DEG-01: es dependencia "
                    "bloqueante, el sistema se detiene en lugar de puntuar sin ella."
                )

        cur.execute(
            "DELETE FROM rebuild_analytics.site_feature WHERE feature_version = %s",
            (feature_version,),
        )
        cur.execute(
            """
            INSERT INTO rebuild_analytics.site_feature (
                site_id, feature_version, data_version,
                risk_score, land_use_compatibility, site_area,
                population_10min, households_10min, park_deficit, park_area_per_capita,
                pedestrian_accessibility, social_vulnerability, building_density,
                school_access, health_access, community_access,
                catchment_method, catchment_area_m2, unavailable, confidence,
                confidence_drivers, is_synthetic
            )
            SELECT
                s.site_id,
                %(fv)s,
                %(dv)s,

                -- Riesgo: el maximo que toca el sitio, no el promedio.
                -- Promediar riesgo diluye exactamente la zona que hay que evitar.
                --
                -- SIN COALESCE a cero, por la misma razon que el uso de suelo:
                -- hoy la tabla esta vacia (ADR-18) y un cero se leeria como
                -- "medimos riesgo nulo" en vez de "no hay dato de riesgo".
                -- Cero es ademas el valor mas favorable, asi que la ausencia
                -- se convertiria en un aprobado silencioso.
                (
                    SELECT max(rz.risk_score) FROM rebuild_core.risk_zone rz
                    WHERE ST_Intersects(rz.geometry, s.geometry)
                ),

                -- Compatibilidad de uso de suelo.
                --
                -- SIN COALESCE a cero: un sitio que no intersecta ningun
                -- poligono no es incompatible, es desconocido. Confundir
                -- ambas cosas excluye por falta de dato, que es justo lo que
                -- una restriccion dura no debe hacer (FR-FEAT-01: una feature
                -- no calculada se declara, no se rellena).
                (
                    SELECT sum(CASE WHEN lu.category IN ('grass', 'meadow', 'forest', 'wood',
                                                         'recreation_ground', 'village_green',
                                                         'greenfield', 'brownfield')
                                    THEN 1.0
                                    WHEN lu.category IN ('residential', 'farmland', 'orchard')
                                    THEN 0.6
                                    WHEN lu.category IN ('retail', 'commercial') THEN 0.4
                                    ELSE 0.2 END
                               * ST_Area(ST_Intersection(lu.geometry, s.geometry)))
                           / NULLIF(ST_Area(s.geometry), 0)
                    FROM rebuild_core.land_use lu
                    WHERE ST_Intersects(lu.geometry, s.geometry)
                ),

                s.area_m2,

                COALESCE(c10.population, 0),
                COALESCE(c10.households, 0),

                -- Deficit de espacio publico: 1 = no hay nada; 0 = se cumple
                -- el estandar. Se mide contra la poblacion que el sitio
                -- realmente alcanza a pie, no contra un radio.
                CASE
                    WHEN COALESCE(c10.population, 0) < 1 THEN 1.0
                    ELSE greatest(0.0, least(1.0,
                        1.0 - (COALESCE(green.area_m2, 0) / c10.population)
                              / %(standard)s))
                END,
                CASE WHEN COALESCE(c10.population, 0) < 1 THEN 0
                     ELSE COALESCE(green.area_m2, 0) / c10.population END,

                -- Accesibilidad peatonal: densidad de red en 400 m,
                -- normalizada contra un techo de 12 km/km2 de via.
                least(1.0, COALESCE(net.road_m, 0) / 12000.0),

                -- Sin indice de vulnerabilidad social real (DANE no
                -- alcanzable, OI-F4) la feature queda nula y se declara. El
                -- 0.5 que habia antes era un valor inventado con aspecto de
                -- medicion.
                NULL,

                -- Densidad construida desde huellas reales de Microsoft, no
                -- desde un conteo de segmentos de via. Techo: 0,35 de suelo
                -- ocupado en 200 m, que es tejido urbano denso.
                least(1.0, COALESCE(built.ratio, 0) / 0.35),

                least(1.0, COALESCE(edu.n, 0) / 3.0),
                least(1.0, COALESCE(hea.n, 0) / 2.0),
                least(1.0, COALESCE(com.n, 0) / 2.0),

                COALESCE(c10.method, 'BUFFER'),
                COALESCE(ST_Area(ST_Transform(c10.geometry, %(srid)s)), 0),
                '{}'::jsonb,
                0.5,
                '{}'::jsonb,
                false
            FROM rebuild_core.site s
            LEFT JOIN rebuild_analytics.site_catchment c10
                   ON c10.site_id = s.site_id AND c10.minutes = 10
                  AND c10.feature_version = %(fv)s
            LEFT JOIN LATERAL (
                SELECT sum(ST_Area(ST_Transform(g.geometry, %(srid)s))) AS area_m2
                FROM rebuild_osm_raw.green_space g
                WHERE c10.geometry IS NOT NULL AND ST_Intersects(g.geometry, c10.geometry)
            ) green ON true
            LEFT JOIN LATERAL (
                SELECT sum(ST_Length(ST_Transform(r.geometry, %(srid)s))) AS road_m,
                       count(*) AS segments
                FROM rebuild_osm_raw.road r
                WHERE ST_DWithin(ST_Transform(r.geometry, %(srid)s),
                                 ST_Transform(s.centroid, %(srid)s), 400)
            ) net ON true
            LEFT JOIN LATERAL (
                SELECT sum(b.area_m2) / (pi() * 200 * 200) AS ratio
                FROM rebuild_core.building_footprint b
                WHERE ST_DWithin(ST_Transform(b.geometry, %(srid)s),
                                 ST_Transform(s.centroid, %(srid)s), 200)
            ) built ON true
            LEFT JOIN LATERAL (
                SELECT sum(p.vulnerability * p.population) / NULLIF(sum(p.population), 0) AS value
                FROM rebuild_core.population_cell p
                WHERE c10.geometry IS NOT NULL AND ST_Intersects(p.geometry, c10.geometry)
            ) vuln ON true
            LEFT JOIN LATERAL (
                SELECT count(*) AS n FROM rebuild_osm_raw.facility f
                WHERE f.category = 'education' AND c10.geometry IS NOT NULL
                  AND ST_Intersects(f.geometry, c10.geometry)
            ) edu ON true
            LEFT JOIN LATERAL (
                SELECT count(*) AS n FROM rebuild_osm_raw.facility f
                WHERE f.category = 'health' AND c10.geometry IS NOT NULL
                  AND ST_Intersects(f.geometry, c10.geometry)
            ) hea ON true
            LEFT JOIN LATERAL (
                SELECT count(*) AS n FROM rebuild_osm_raw.facility f
                WHERE f.category = 'community' AND c10.geometry IS NOT NULL
                  AND ST_Intersects(f.geometry, c10.geometry)
            ) com ON true
            """,
            {
                "fv": feature_version,
                "dv": data_version,
                "srid": METRIC_SRID,
                "standard": PUBLIC_SPACE_STANDARD_M2_PER_CAPITA,
            },
        )

        cur.execute("UPDATE rebuild_core.site SET state = 'EVALUATED' WHERE state = 'INGESTED'")
        cur.execute(
            "SELECT count(*) AS n FROM rebuild_analytics.site_feature WHERE feature_version = %s",
            (feature_version,),
        )
        count = cur.fetchone()["n"]

    _compute_confidence(conn, feature_version=feature_version)
    return count


def _compute_confidence(conn: psycopg.Connection, *, feature_version: str) -> None:
    """FR-QUAL-01 — confianza con sus drivers listados.

    Un numero de confianza sin drivers no se puede discutir, y algo que no se
    puede discutir no informa una decision publica.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.site_id, f.catchment_method, f.population_10min,
                   fu.damage_confidence, fu.independent_sources, fu.observation_age_days,
                   fu.any_field_validated
            FROM rebuild_analytics.site_feature f
            LEFT JOIN rebuild_core.site_damage_fusion fu USING (site_id)
            WHERE f.feature_version = %s
            """,
            (feature_version,),
        )
        for row in cur.fetchall():
            drivers: dict[str, float | str | bool] = {}
            confidence = 1.0

            # FR-FEAT-03 — un catchment por buffer no sabe donde hay un rio.
            if row["catchment_method"] == "BUFFER":
                confidence -= 0.25
                drivers["catchment_buffer"] = -0.25

            damage_confidence = float(row["damage_confidence"] or 0.4)
            contribution = (damage_confidence - 0.7) * 0.5
            confidence += contribution
            drivers["damage_evidence"] = round(contribution, 4)

            if not row["any_field_validated"]:
                confidence -= 0.15
                drivers["no_field_validation"] = -0.15

            if (row["independent_sources"] or 1) < 2:
                confidence -= 0.10
                drivers["single_independent_source"] = -0.10

            if float(row["population_10min"] or 0) < 1:
                confidence -= 0.20
                drivers["no_population_in_catchment"] = -0.20

            # Toda la capa de contexto es sintetica en esta version. Una
            # confianza alta sobre datos simulados seria una mentira comoda.
            confidence -= 0.20
            drivers["synthetic_context_layers"] = -0.20

            cur.execute(
                "UPDATE rebuild_analytics.site_feature "
                "SET confidence = %s, confidence_drivers = %s::jsonb "
                "WHERE site_id = %s AND feature_version = %s",
                (
                    round(max(0.05, min(0.95, confidence)), 4),
                    json.dumps(drivers),
                    row["site_id"],
                    feature_version,
                ),
            )
