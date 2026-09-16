"""Grafo peatonal y catchments de red (ADR-02).

FR-FEAT-02 exige catchments de red, no buffers. La diferencia no es
cosmetica: un sitio separado de la poblacion por un rio sin puente tiene un
buffer lleno de gente a la que no puede servir.

OI-A3 sigue abierto (velocidad plana o ajustada por pendiente). Aqui es
plana, y eso queda escrito en el nombre de la constante para que nadie lo
confunda con una decision tomada.
"""

from __future__ import annotations

import psycopg

#: Velocidad peatonal plana. Pereira tiene topografia fuerte y esto la
#: ignora: es el defecto documentado de OI-A3, no una medicion.
WALKING_SPEED_M_PER_MIN = 75.0  # 4,5 km/h

METRIC_SRID = 3116

#: Umbrales del PRD §13.
CATCHMENT_MINUTES = (5, 10, 15)


def build_pedestrian_graph(conn: psycopg.Connection) -> dict[str, int]:
    """Construye la topologia del grafo desde `rebuild_osm_raw.road`.

    El resultado vive en `osm_derived`, separado de `core`: deriva de OSM y
    por tanto hereda su regimen de licencia (fuentes.md §8).
    """
    with conn.cursor() as cur:
        cur.execute("TRUNCATE rebuild_osm_derived.pedestrian_edge RESTART IDENTITY")
        cur.execute(
            """
            INSERT INTO rebuild_osm_derived.pedestrian_edge
                (osm_id, cost, reverse_cost, length_m, geometry)
            SELECT
                osm_id,
                ST_Length(ST_Transform(geometry, %(srid)s)) / %(speed)s,
                ST_Length(ST_Transform(geometry, %(srid)s)) / %(speed)s,
                ST_Length(ST_Transform(geometry, %(srid)s)),
                geometry
            FROM rebuild_osm_raw.road
            WHERE foot_access
              AND ST_Length(ST_Transform(geometry, %(srid)s)) > 0
            """,
            {"srid": METRIC_SRID, "speed": WALKING_SPEED_M_PER_MIN},
        )
        # pgr_createTopology asigna source/target a partir de los extremos.
        cur.execute(
            "SELECT pgr_createTopology('rebuild_osm_derived.pedestrian_edge', 0.00001, "
            "'geometry', 'id', 'source', 'target', clean := true)"
        )
        cur.execute("SELECT count(*) AS n FROM rebuild_osm_derived.pedestrian_edge")
        edges = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM rebuild_osm_derived.pedestrian_edge_vertices_pgr")
        vertices = cur.fetchone()["n"]
    return {"edges": edges, "vertices": vertices}


def compute_catchments(conn: psycopg.Connection, *, feature_version: str) -> dict[str, int]:
    """Catchments por sitio y umbral, precomputados (ADR-02).

    Cada sitio se ancla al vertice mas cercano del grafo. Si no hay vertice
    dentro del radio de anclaje, el catchment cae a buffer y queda marcado
    como degradado (FR-FEAT-03) — no se omite en silencio ni se finge red.
    """
    network = buffer = 0
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM rebuild_analytics.site_catchment WHERE feature_version = %s",
            (feature_version,),
        )
        cur.execute(
            "SELECT site_id, ST_AsText(centroid) AS centroid "
            "FROM rebuild_core.site ORDER BY site_id"
        )
        sites = cur.fetchall()

        for site in sites:
            cur.execute(
                """
                SELECT v.id, ST_Distance(
                           ST_Transform(v.the_geom, %(srid)s),
                           ST_Transform(ST_GeomFromText(%(centroid)s, 4326), %(srid)s)
                       ) AS dist
                FROM rebuild_osm_derived.pedestrian_edge_vertices_pgr v
                ORDER BY v.the_geom <-> ST_GeomFromText(%(centroid)s, 4326)
                LIMIT 1
                """,
                {"srid": METRIC_SRID, "centroid": site["centroid"]},
            )
            anchor = cur.fetchone()
            # 150 m es el limite de lo que se puede llamar "el sitio esta en
            # esta calle". Mas alla, anclar es inventar conectividad.
            has_network = anchor is not None and anchor["dist"] <= 150.0

            for minutes in CATCHMENT_MINUTES:
                if has_network:
                    cur.execute(
                        """
                        INSERT INTO rebuild_analytics.site_catchment
                            (site_id, minutes, method, geometry, feature_version)
                        SELECT %(site_id)s, %(minutes)s, 'NETWORK',
                               ST_Transform(
                                   ST_ConcaveHull(
                                   ST_Collect(ST_Transform(v.the_geom, %(srid)s)), 0.85),
                               4326),
                               %(fv)s
                        FROM pgr_drivingDistance(
                                 'SELECT id, source, target, cost, reverse_cost
                                    FROM rebuild_osm_derived.pedestrian_edge
                                   WHERE source IS NOT NULL',
                                 %(anchor)s, %(minutes)s, false) d
                        JOIN rebuild_osm_derived.pedestrian_edge_vertices_pgr v ON v.id = d.node
                        HAVING count(*) >= 3
                        """,
                        {
                            "site_id": site["site_id"],
                            "minutes": minutes,
                            "srid": METRIC_SRID,
                            "fv": feature_version,
                            "anchor": anchor["id"],
                        },
                    )
                    if cur.rowcount:
                        network += 1
                        continue

                # FR-FEAT-03 — fallback explicito y marcado.
                cur.execute(
                    """
                    INSERT INTO rebuild_analytics.site_catchment
                        (site_id, minutes, method, geometry, feature_version)
                    SELECT %(site_id)s, %(minutes)s, 'BUFFER',
                           ST_Transform(
                               ST_Buffer(ST_Transform(centroid, %(srid)s), %(radius)s), 4326),
                           %(fv)s
                    FROM rebuild_core.site WHERE site_id = %(site_id)s
                    """,
                    {
                        "site_id": site["site_id"],
                        "minutes": minutes,
                        "srid": METRIC_SRID,
                        "radius": minutes * WALKING_SPEED_M_PER_MIN,
                        "fv": feature_version,
                    },
                )
                buffer += 1

        # Poblacion servida por catchment, por reparto proporcional de area.
        # OI-07 sigue abierto: cuando haya poblacion real a nivel de manzana,
        # esto pasa a dasimetrico y el metodo queda declarado en la feature.
        cur.execute(
            """
            UPDATE rebuild_analytics.site_catchment c
            SET population = COALESCE(agg.pop, 0), households = COALESCE(agg.hh, 0)
            FROM (
                SELECT c2.site_id, c2.minutes,
                       sum(p.population * ST_Area(ST_Intersection(p.geometry, c2.geometry))
                                        / NULLIF(ST_Area(p.geometry), 0)) AS pop,
                       sum(p.households * ST_Area(ST_Intersection(p.geometry, c2.geometry))
                                        / NULLIF(ST_Area(p.geometry), 0)) AS hh
                FROM rebuild_analytics.site_catchment c2
                JOIN rebuild_core.population_cell p ON ST_Intersects(p.geometry, c2.geometry)
                WHERE c2.feature_version = %s
                GROUP BY c2.site_id, c2.minutes
            ) agg
            WHERE c.site_id = agg.site_id AND c.minutes = agg.minutes
              AND c.feature_version = %s
            """,
            (feature_version, feature_version),
        )

    return {"network": network, "buffer": buffer}


def network_density_by_area(conn: psycopg.Connection) -> list[dict]:
    """R5 — densidad de red peatonal, expuesta como driver de confianza.

    Un analisis de equidad construido sobre una red desigualmente mapeada
    favorece a los barrios que ya estaban mejor documentados en OSM, e
    invierte su propia conclusion. No es una molestia de calidad de datos:
    es un problema de correccion, y por eso se mide y se publica.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH grid AS (
                SELECT (ST_SquareGrid(0.005, ST_Extent(geometry))).geom AS cell
                FROM rebuild_core.site
            )
            SELECT row_number() OVER () AS cell_id,
                   ST_AsGeoJSON(g.cell) AS geojson,
                   COALESCE(sum(ST_Length(ST_Transform(r.geometry, 3116))), 0) AS road_m,
                   count(r.osm_id) AS segments
            FROM grid g
            LEFT JOIN rebuild_osm_raw.road r ON ST_Intersects(r.geometry, g.cell)
            GROUP BY g.cell
            ORDER BY 1
            """
        )
        return cur.fetchall()
