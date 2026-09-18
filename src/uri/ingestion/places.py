"""Gazetteer: que barrio, comuna, esquina e hito le tocan a cada sitio (ADR-22).

Todo es SQL sobre `rebuild_core.site` y `rebuild_osm_raw.*`, y el resultado va
a `rebuild_osm_derived.site_place`: nombres derivados de OSM, regimen de OSM.
Se recalcula entero en cada corrida, porque `derive_sites` recrea los sitios.

Lo que no se encuentra queda NULL y se cuenta en una alerta. Un sitio sin
barrio dice "sin fuente"; no hereda el del vecino.
"""

from __future__ import annotations

import json

import psycopg

from uri.contracts.place import SQL_CALLE, SQL_CARRERA, SQL_OTRA_VIA
from uri.ingestion.loader import METRIC_SRID

#: Un barrio como punto vale si esta a menos de esto del sitio. Mas lejos,
#: el sitio puede estar en el barrio de al lado.
NEAREST_PLACE_M = 300.0
#: Una esquina se compone con vias a menos de esto. En el centro hay una cada
#: 80 m; en los bordes del AOI puede no haber ninguna con nombre.
CORNER_ROAD_M = 250.0
#: Un hito orienta si esta a menos de cinco minutos a pie.
LANDMARK_M = 400.0

#: Prefiltro por indice en grados (~330 m en el ecuador) antes de medir en
#: metros: `ST_DWithin` sobre una geometria transformada no usa el GIST.
_BBOX_DEG = 0.0035

_NAMED_ROADS = """
    SELECT display_name, geometry FROM rebuild_osm_raw.road WHERE display_name IS NOT NULL
    UNION ALL
    SELECT display_name, geometry FROM rebuild_osm_raw.arterial_road
    WHERE display_name IS NOT NULL
"""

_ROAD_CANDIDATES = f"""
    SELECT DISTINCT ON (display_name) display_name, axis, dist
    FROM (
        SELECT rr.display_name,
               CASE WHEN rr.display_name ~* %(calle)s THEN 'calle'
                    WHEN rr.display_name ~* %(carrera)s THEN 'carrera'
                    WHEN rr.display_name ~* %(otra_via)s THEN 'otra' END AS axis,
               ST_Distance(ST_Transform(rr.geometry, %(srid)s), m.g) AS dist
        FROM ({_NAMED_ROADS}) rr
        WHERE rr.geometry && ST_Expand(s.centroid, %(deg)s)
          AND ST_DWithin(ST_Transform(rr.geometry, %(srid)s), m.g, %(road_m)s)
    ) x
    WHERE axis IS NOT NULL
    ORDER BY display_name, dist
"""

ENRICH_SQL = f"""
INSERT INTO rebuild_osm_derived.site_place (
    site_id, neighborhood, neighborhood_osm_id, neighborhood_method,
    commune, commune_osm_id, corner_label, corner_road_a, corner_road_b,
    nearest_landmark, nearest_landmark_osm_id, nearest_landmark_m, data_version
)
SELECT s.site_id,
       COALESCE(b.display_name, np.display_name),
       COALESCE(b.osm_id, np.osm_id),
       CASE WHEN b.osm_id IS NOT NULL THEN 'ADMIN_POLYGON'
            WHEN np.osm_id IS NOT NULL THEN 'NEAREST_PLACE' END,
       c.display_name, c.osm_id,
       CASE WHEN r1.display_name IS NOT NULL AND r2.display_name IS NOT NULL
                 THEN r1.display_name || ' con ' || r2.display_name
            WHEN r1.display_name IS NOT NULL THEN 'sobre ' || r1.display_name END,
       r1.display_name, r2.display_name,
       lm.display_name, lm.osm_id,
       CASE WHEN lm.dist IS NULL THEN NULL ELSE greatest(10, round(lm.dist / 10.0) * 10) END,
       %(version)s
FROM rebuild_core.site s
CROSS JOIN LATERAL (SELECT ST_Transform(s.centroid, %(srid)s) AS g) m
LEFT JOIN LATERAL (
    SELECT a.osm_id, a.display_name
    FROM rebuild_osm_raw.admin_area a
    WHERE a.admin_level = 8 AND ST_Intersects(a.geometry, s.centroid)
    ORDER BY ST_Area(a.geometry) LIMIT 1
) c ON true
LEFT JOIN LATERAL (
    SELECT a.osm_id, a.display_name
    FROM rebuild_osm_raw.admin_area a
    WHERE a.admin_level = 9 AND ST_Intersects(a.geometry, s.centroid)
    ORDER BY ST_Area(a.geometry) LIMIT 1
) b ON true
LEFT JOIN LATERAL (
    SELECT p.osm_id, p.display_name
    FROM rebuild_osm_raw.place_point p
    WHERE b.osm_id IS NULL
      AND p.place IN ('neighbourhood', 'quarter', 'suburb')
      AND p.geometry && ST_Expand(s.centroid, %(deg)s)
      AND ST_DWithin(ST_Transform(p.geometry, %(srid)s), m.g, %(place_m)s)
    ORDER BY ST_Transform(p.geometry, %(srid)s) <-> m.g LIMIT 1
) np ON true
LEFT JOIN LATERAL (
    SELECT r.display_name, r.axis FROM ({_ROAD_CANDIDATES}) r ORDER BY r.dist LIMIT 1
) r1 ON true
LEFT JOIN LATERAL (
    SELECT r.display_name FROM ({_ROAD_CANDIDATES}) r
    WHERE r1.display_name IS NOT NULL
      AND (r.axis <> r1.axis OR (r.axis = 'otra' AND r.display_name <> r1.display_name))
    ORDER BY r.dist LIMIT 1
) r2 ON true
LEFT JOIN LATERAL (
    SELECT l.osm_id, l.display_name, ST_Distance(ST_Transform(l.geometry, %(srid)s), m.g) AS dist
    FROM rebuild_osm_raw.landmark l
    WHERE l.geometry && ST_Expand(s.centroid, %(deg)s * 1.5)
      AND ST_DWithin(ST_Transform(l.geometry, %(srid)s), m.g, %(landmark_m)s)
    ORDER BY ST_Transform(l.geometry, %(srid)s) <-> m.g LIMIT 1
) lm ON true
"""


def enrich_site_places(conn: psycopg.Connection, *, data_version: int) -> dict[str, int]:
    """Recalcula `site_place` para todos los sitios y levanta la alerta de cobertura."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM rebuild_osm_derived.site_place")
        cur.execute(
            ENRICH_SQL,
            {
                "version": data_version,
                "srid": METRIC_SRID,
                "deg": _BBOX_DEG,
                "place_m": NEAREST_PLACE_M,
                "road_m": CORNER_ROAD_M,
                "landmark_m": LANDMARK_M,
                "calle": SQL_CALLE,
                "carrera": SQL_CARRERA,
                "otra_via": SQL_OTRA_VIA,
            },
        )
        cur.execute(
            """
            SELECT count(*) AS total,
                   count(*) FILTER (WHERE commune IS NULL) AS sin_comuna,
                   count(*) FILTER (WHERE neighborhood IS NULL) AS sin_barrio,
                   count(*) FILTER (WHERE neighborhood_method = 'NEAREST_PLACE') AS aproximados,
                   count(*) FILTER (WHERE corner_label IS NULL) AS sin_esquina,
                   count(*) FILTER (WHERE nearest_landmark IS NULL) AS sin_hito
            FROM rebuild_osm_derived.site_place
            """
        )
        stats = {k: int(v) for k, v in cur.fetchone().items()}
        if stats["sin_comuna"] or stats["sin_barrio"]:
            cur.execute(
                "INSERT INTO rebuild_core.quality_alert "
                "(severity, source_id, code, message, payload) "
                "VALUES ('warning', 'osm', 'PLACE_COVERAGE', %s, %s::jsonb)",
                (
                    f"{stats['sin_barrio']} de {stats['total']} sitios sin barrio y "
                    f"{stats['sin_comuna']} sin comuna en OSM. Se muestran como 'sin fuente', "
                    "no heredan el del vecino.",
                    json.dumps(stats),
                ),
            )
    return stats
