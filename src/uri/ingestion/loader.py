"""Carga a PostGIS: versionado, derivacion de sitios y fusion de evidencia.

Cada capa entra como una `dataset_version` inmutable con su hash de
contenido, de modo que re-ejecutar la ingesta sobre la misma fuente produce
la misma version y no una duplicada (FR-ING-02, FR-ING-03).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import psycopg

from uri.contracts import DamageEvidence, LicenseClass
from uri.contracts.enums import DAMAGE_ORDER, METHOD_RELIABILITY, DamageClass, EvidenceMethod
from uri.ingestion.adapters import osm as osm_adapter
from uri.ingestion.registry import SOURCES

#: AOI de trabajo. Ya no es un bbox elegido a mano: es el area que Copernicus
#: EMS declaro haber observado en EMSR916/AOI02. El alcance del analisis lo
#: fija quien produjo la evidencia, no nosotros.
PEREIRA_BBOX = (-75.7251, 4.7878, -75.6748, 4.8229)

#: Poblacion estimada del AOI, publicada en las estadisticas del producto
#: EMSR916/AOI02. Es el total que se reparte dasimetricamente (FR-FEAT-06).
AOI_POPULATION = 190_000

SEED = Path(__file__).resolve().parents[3] / "db" / "seed"

#: Radio de agrupamiento de evidencia en sitios. Dos puntos a menos de esto
#: se leen como el mismo predio o predios contiguos.
SITE_CLUSTER_RADIUS_M = 40.0

#: Huella minima asumida para una unica observacion. El area resultante es
#: estimada y se marca como tal: no viene de un catastro.
SINGLE_EVIDENCE_BUFFER_M = 12.0

#: Metrico local para Colombia (MAGNA-SIRGAS / Bogota). Toda operacion en
#: metros pasa por aqui; nada se mide en grados.
METRIC_SRID = 3116


@dataclass
class LoadReport:
    versions: dict[str, int]
    counts: dict[str, int]
    alerts: list[str]


def _hash_rows(rows: list[str]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        digest.update(row.encode())
    return digest.hexdigest()


def register_sources(conn: psycopg.Connection) -> None:
    """Escribe el registro de fuentes. Idempotente."""
    with conn.cursor() as cur:
        for source in SOURCES:
            cur.execute(
                """
                INSERT INTO core.source_register (
                    source_id, display_name, tier, source_url, access_method,
                    spatial_reference, license_class, license_name, license_url,
                    attribution_text, redistribution_allowed, derivatives_allowed,
                    share_alike, quality_score, terms_verified_at, terms_verified_by,
                    terms_snapshot_path, verification_notes
                ) VALUES (
                    %(source_id)s, %(display_name)s, %(tier)s, %(source_url)s,
                    %(access_method)s, %(spatial_reference)s, %(license_class)s,
                    %(license_name)s, %(license_url)s, %(attribution_text)s,
                    %(redistribution_allowed)s, %(derivatives_allowed)s, %(share_alike)s,
                    %(quality_score)s, %(terms_verified_at)s, %(terms_verified_by)s,
                    %(terms_snapshot_path)s, %(verification_notes)s
                )
                ON CONFLICT (source_id) DO UPDATE SET
                    license_class = EXCLUDED.license_class,
                    attribution_text = EXCLUDED.attribution_text,
                    verification_notes = EXCLUDED.verification_notes
                """,
                source.model_dump(mode="json"),
            )


def _publish_version(
    conn: psycopg.Connection,
    *,
    source_id: str,
    record_count: int,
    content_hash: str,
    is_synthetic: bool,
    manifest: dict | None = None,
) -> int:
    """ADR-06 — publica una version, o devuelve la existente si el contenido
    no cambio. Re-ingerir lo mismo no crea una version nueva."""
    import json

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO core.dataset_version (
                source_id, retrieved_at, record_count, content_hash, is_synthetic, manifest
            ) VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_id, content_hash) DO NOTHING
            RETURNING data_version
            """,
            (
                source_id,
                datetime.now(UTC),
                record_count,
                content_hash,
                is_synthetic,
                json.dumps(manifest or {}),
            ),
        )
        row = cur.fetchone()
        if row:
            return row["data_version"]
        cur.execute(
            "SELECT data_version FROM core.dataset_version "
            "WHERE source_id = %s AND content_hash = %s",
            (source_id, content_hash),
        )
        return cur.fetchone()["data_version"]


def load_damage_evidence(
    conn: psycopg.Connection, evidence: list[DamageEvidence], *, source_id: str
) -> int:
    content_hash = _hash_rows(
        [
            f"{e.original_source}|{e.geometry_wkt}|{e.damage_class}|{e.observation_date}"
            for e in evidence
        ]
    )
    version = _publish_version(
        conn,
        source_id=source_id,
        record_count=len(evidence),
        content_hash=content_hash,
        is_synthetic=any(e.is_synthetic for e in evidence),
    )
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) AS n FROM core.damage_evidence WHERE data_version = %s", (version,)
        )
        if cur.fetchone()["n"]:
            return version
        for item in evidence:
            cur.execute(
                """
                INSERT INTO core.damage_evidence (
                    source, original_source, geometry, positional_accuracy_m,
                    observation_date, acquisition_date, damage_class, raw_damage_label,
                    building_type, method, field_validated, confidence, is_synthetic,
                    data_version, notes
                ) VALUES (
                    %s, %s, ST_GeomFromText(%s, 4326), %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s
                )
                """,
                (
                    item.source,
                    item.original_source,
                    item.geometry_wkt,
                    item.positional_accuracy_m,
                    item.observation_date,
                    item.acquisition_date,
                    item.damage_class.value,
                    item.raw_damage_label,
                    item.building_type,
                    item.method.value,
                    item.field_validated,
                    item.confidence,
                    item.is_synthetic,
                    version,
                    item.notes,
                ),
            )
    return version


def load_osm(conn: psycopg.Connection, overpass_path: Path) -> tuple[int, dict[str, int]]:
    roads, greens, facilities = osm_adapter.load_overpass(overpass_path)
    content_hash = _hash_rows(
        [f"{r.osm_id}" for r in roads]
        + [f"{g.osm_id}" for g in greens]
        + [f"{f.osm_id}" for f in facilities]
    )
    version = _publish_version(
        conn,
        source_id="osm",
        record_count=len(roads) + len(greens) + len(facilities),
        content_hash=content_hash,
        is_synthetic=False,
    )
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM osm_raw.road WHERE data_version = %s", (version,))
        if cur.fetchone()["n"]:
            return version, {
                "roads": len(roads),
                "greens": len(greens),
                "facilities": len(facilities),
            }

        for road in roads:
            cur.execute(
                "INSERT INTO osm_raw.road (osm_id, highway, display_name, geometry, data_version) "
                "VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326), %s) ON CONFLICT DO NOTHING",
                (road.osm_id, road.highway, road.name, road.wkt, version),
            )
        for green in greens:
            cur.execute(
                """
                INSERT INTO osm_raw.green_space
                    (osm_id, leisure, display_name, geometry, area_m2, data_version)
                VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (green.osm_id, green.leisure, green.name, green.wkt, green.area_m2, version),
            )
        for facility in facilities:
            cur.execute(
                """
                INSERT INTO osm_raw.facility
                    (osm_id, amenity, category, display_name, geometry, data_version)
                VALUES (%s, %s, %s, %s, ST_GeomFromText(%s, 4326), %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    facility.osm_id,
                    facility.amenity,
                    facility.category,
                    facility.name,
                    facility.wkt,
                    version,
                ),
            )
    return version, {"roads": len(roads), "greens": len(greens), "facilities": len(facilities)}


def load_context_layers(conn: psycopg.Connection) -> tuple[int, dict[str, int]]:
    """Carga poblacion, edificacion, riesgo y uso de suelo desde fuentes reales.

    Una version de dataset POR FUENTE, no una por corrida. Sellar el uso de
    suelo de OSM con la version de Microsoft lo deja atribuido a quien no lo
    produjo, y es la misma falla de forma que ADR-16 existe para evitar: la
    puerta de publicacion resuelve por fuente, y una fuente escondida detras
    de otra no se puede evaluar. Fue asi como la capa del SGC se publico sin
    que la puerta llegara a verla (ADR-18).

    No hay capa de amenaza sismica: la del SGC se retiro por licencia, y
    ninguna otra la sustituye. `risk_score` queda nulo y las restricciones de
    riesgo se saltan declarandolo, en vez de leerse como riesgo cero.

    Ninguna capa inventa un valor; cada una declara su metodo y su limitacion
    en el manifiesto de su propia version.
    """
    import json as _json

    from uri.ingestion.adapters import context as ctx
    from uri.ingestion.adapters import osm as osm_adapter

    footprints = ctx.load_building_footprints(SEED / "ms_buildings_pereira.geojson.gz")
    cells, apportionment = ctx.dasymetric_population(
        footprints, PEREIRA_BBOX, total_population=AOI_POPULATION
    )
    landuse = osm_adapter.load_landuse(SEED / "osm_landuse_pereira.json.gz")

    def _version(source_id: str, records: int, payload: dict) -> int:
        return _publish_version(
            conn,
            source_id=source_id,
            record_count=records,
            content_hash=hashlib.sha256(
                _json.dumps({"source": source_id, **payload}, sort_keys=True).encode()
            ).hexdigest(),
            is_synthetic=False,
            manifest=payload,
        )

    # Microsoft: las huellas, y la poblacion repartida sobre ellas. El total
    # que se reparte lo publica Copernicus, y el manifiesto lo declara; la
    # geometria que lo soporta es de Microsoft, y por eso la capa se sella con
    # su version. Copernicus entra a la puerta por su propia via (la evidencia
    # de daño), asi que ninguna de las dos queda sin evaluar.
    ms_version = _version(
        "microsoft_buildings",
        len(footprints) + len(cells),
        {"buildings": {"footprints": len(footprints)}, "population": apportionment},
    )
    # OSM: el uso de suelo, extracto aparte del de vias y equipamientos.
    osm_landuse_version = _version(
        "osm",
        len(landuse),
        {
            "landuse": {
                "polygons": len(landuse),
                "limitation": (
                    "Proxy del POT. IDE AMCO publica la capa normativa en un "
                    "GeoServer no alcanzable desde este entorno (OI-F3)."
                ),
            }
        },
    )

    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) AS n FROM core.population_cell WHERE data_version = %s", (ms_version,)
        )
        if cur.fetchone()["n"]:
            return ms_version, {
                "cells": len(cells),
                "landuse": len(landuse),
                "footprints": len(footprints),
            }

        for cell in cells:
            cur.execute(
                """
                INSERT INTO core.population_cell
                    (geometry, population, households, vulnerability, is_synthetic, data_version)
                VALUES (ST_GeomFromText(%s, 4326), %s, %s, %s, false, %s)
                """,
                # Sin indice de vulnerabilidad social real (DANE no alcanzable,
                # OI-F4), la feature se marca no disponible en lugar de
                # rellenarse con un numero inventado. 0.5 es el marcador que el
                # motor de features reconoce como "sin dato".
                (cell.wkt, cell.population, cell.households, 0.5, ms_version),
            )

        for parcel in landuse:
            cur.execute(
                """
                INSERT INTO core.land_use (geometry, category, is_synthetic, data_version)
                VALUES (ST_MakeValid(ST_GeomFromText(%s, 4326)), %s, false, %s)
                """,
                (parcel.wkt, parcel.category, osm_landuse_version),
            )

        for footprint in footprints:
            cur.execute(
                """
                INSERT INTO core.building_footprint (geometry, area_m2, data_version)
                VALUES (ST_MakeValid(ST_GeomFromText(%s, 4326)), %s, %s)
                """,
                (footprint.wkt, footprint.area_m2, ms_version),
            )

    return ms_version, {
        "cells": len(cells),
        "landuse": len(landuse),
        "footprints": len(footprints),
    }


def derive_sites(conn: psycopg.Connection, data_version: int) -> int:
    """Agrupa evidencia cercana en sitios de oportunidad.

    El dato de origen son puntos sueltos de foto-interpretacion. Un punto no
    es un sitio: varios puntos contiguos describen un predio o un conjunto de
    predios afectados. El agrupamiento espacial es lo que convierte
    observaciones en unidades sobre las que se puede decidir — y el area
    resultante queda marcada como estimada, porque lo es.
    """
    with conn.cursor() as cur:
        cur.execute("DELETE FROM core.site_evidence")
        cur.execute("DELETE FROM core.site_damage_fusion")
        cur.execute("DELETE FROM core.site")

        cur.execute(
            """
            WITH clustered AS (
                SELECT evidence_id,
                       ST_ClusterDBSCAN(ST_Transform(geometry, %(srid)s),
                                        eps := %(eps)s, minpoints := 1)
                           OVER () AS cluster_id
                FROM core.damage_evidence
            ),
            grouped AS (
                SELECT c.cluster_id,
                       count(*) AS evidence_count,
                       ST_Collect(ST_Transform(e.geometry, %(srid)s)) AS geom_metric
                FROM clustered c
                JOIN core.damage_evidence e USING (evidence_id)
                GROUP BY c.cluster_id
            ),
            shaped AS (
                SELECT cluster_id,
                       evidence_count,
                       -- Una sola observacion no define una huella: se le da
                       -- un buffer minimo. Varias definen su envolvente.
                       CASE WHEN evidence_count = 1
                            THEN ST_Buffer(geom_metric, %(single_buffer)s)
                            ELSE ST_Buffer(ST_ConvexHull(geom_metric), %(single_buffer)s / 2.0)
                       END AS footprint_metric
                FROM grouped
            )
            INSERT INTO core.site (
                site_id, geometry, centroid, area_m2, area_is_estimated,
                state, evidence_count, is_synthetic, data_version
            )
            SELECT
                'site_' || lpad(cluster_id::text, 4, '0'),
                ST_Transform(footprint_metric, 4326),
                ST_Transform(ST_Centroid(footprint_metric), 4326),
                ST_Area(footprint_metric),
                true,
                'INGESTED',
                evidence_count,
                false,
                %(data_version)s
            FROM shaped
            """,
            {
                "srid": METRIC_SRID,
                "eps": SITE_CLUSTER_RADIUS_M,
                "single_buffer": SINGLE_EVIDENCE_BUFFER_M,
                "data_version": data_version,
            },
        )

        cur.execute(
            """
            INSERT INTO core.site_evidence (site_id, evidence_id)
            SELECT s.site_id, e.evidence_id
            FROM core.site s
            JOIN core.damage_evidence e
              ON ST_Intersects(s.geometry, e.geometry)
            ON CONFLICT DO NOTHING
            """
        )
        cur.execute("SELECT count(*) AS n FROM core.site")
        return cur.fetchone()["n"]


#: R9 / OI-F7 — productos que comparten sensor e insumo no son
#: confirmaciones independientes. Copernicus y SERTIT pueden estar
#: clasificando las mismas imagenes Pleiades: contarlos como dos confirma
#: la confianza justo donde menos evidencia real hay.
SHARED_INPUT_GROUPS: dict[str, str] = {
    "sertit": "pleiades_photointerpretation",
    "unosat": "pleiades_photointerpretation",
    "copernicus_ems": "pleiades_photointerpretation",
}


def fuse_damage_evidence(conn: psycopg.Connection, *, as_of: date) -> int:
    """ADR-16 — de N observaciones a una clase y una confianza.

    La confianza sube con el acuerdo entre fuentes *independientes*, con la
    fiabilidad del metodo y con la validacion de campo; baja con la
    antiguedad de la observacion. Nunca llega a 1: ninguna de estas fuentes
    esta validada en campo.
    """
    with conn.cursor() as cur:
        cur.execute("DELETE FROM core.site_damage_fusion")
        cur.execute(
            """
            SELECT se.site_id, e.original_source, e.damage_class, e.method,
                   e.field_validated, e.confidence, e.observation_date
            FROM core.site_evidence se
            JOIN core.damage_evidence e USING (evidence_id)
            """
        )
        rows = cur.fetchall()

        by_site: dict[str, list[dict]] = {}
        for row in rows:
            by_site.setdefault(row["site_id"], []).append(row)

        for site_id, observations in by_site.items():
            classes = [DamageClass(o["damage_class"]) for o in observations]
            # La clase resultante es la peor observada, no la media: promediar
            # "destruido" con "posiblemente dañado" produce un valor que nadie
            # observo.
            worst = max(classes, key=lambda c: DAMAGE_ORDER[c])
            agreement = classes.count(worst) / len(classes)

            sources = sorted({o["original_source"] for o in observations})
            independent_groups = {SHARED_INPUT_GROUPS.get(s, s) for s in sources}
            independent = len(independent_groups)

            reliability = max(METHOD_RELIABILITY[EvidenceMethod(o["method"])] for o in observations)
            validated = any(o["field_validated"] for o in observations)
            age_days = min((as_of - o["observation_date"]).days for o in observations)

            # El acuerdo solo suma si viene de fuentes que no comparten insumo.
            independence_bonus = 0.10 * (independent - 1)
            staleness_penalty = min(0.20, age_days / 365.0 * 0.20)
            confidence = reliability * (0.55 + 0.45 * agreement)
            confidence += independence_bonus + (0.10 if validated else 0.0)
            confidence = max(0.05, min(0.95, confidence - staleness_penalty))

            cur.execute(
                """
                INSERT INTO core.site_damage_fusion (
                    site_id, damage_class, damage_confidence, independent_sources,
                    contributing_sources, agreement_ratio, any_field_validated,
                    observation_age_days, drivers
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    site_id,
                    worst.value,
                    round(confidence, 4),
                    independent,
                    sources,
                    round(agreement, 4),
                    validated,
                    age_days,
                    __import__("json").dumps(
                        {
                            "method_reliability": reliability,
                            "agreement_ratio": round(agreement, 4),
                            "independence_bonus": round(independence_bonus, 4),
                            "staleness_penalty": round(staleness_penalty, 4),
                            "field_validated": validated,
                            "observations": len(observations),
                        }
                    ),
                ),
            )
        return len(by_site)


def raise_coverage_alerts(conn: psycopg.Connection) -> list[str]:
    """FR-QUAL-02 — la cobertura satelital no es el daño.

    Si nadie levanta esta alerta, el sistema presenta el area fotografiada
    como si fuera el area afectada, y concentra la recuperacion ahi.
    """
    import json

    alerts: list[str] = []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT ST_Area(ST_Transform(ST_ConvexHull(ST_Collect(geometry)), %s)) / 1e6 AS aoi_km2,
                   count(*) AS n
            FROM core.damage_evidence
            """,
            (METRIC_SRID,),
        )
        row = cur.fetchone()
        if row and row["aoi_km2"]:
            message = (
                f"La evidencia de daño cubre {row['aoi_km2']:.2f} km2 "
                f"({row['n']} observaciones). La cobertura satelital es donde se "
                "apunto un sensor, no donde esta el daño: los sitios de "
                "oportunidad fuera de esta ventana son invisibles para el sistema."
            )
            cur.execute(
                "INSERT INTO core.quality_alert (severity, source_id, code, message, payload) "
                "VALUES ('warning', 'sertit', 'AOI_COVERAGE', %s, %s::jsonb)",
                (
                    message,
                    json.dumps({"aoi_km2": round(row["aoi_km2"], 3), "observations": row["n"]}),
                ),
            )
            alerts.append(message)

        cur.execute("SELECT count(*) AS n FROM core.damage_evidence WHERE field_validated = false")
        unvalidated = cur.fetchone()["n"]
        if unvalidated:
            message = (
                f"{unvalidated} observaciones de daño sin validacion de campo. "
                "Toda la evidencia disponible es foto-interpretacion."
            )
            cur.execute(
                "INSERT INTO core.quality_alert (severity, source_id, code, message, payload) "
                "VALUES ('warning', NULL, 'NO_FIELD_VALIDATION', %s, %s::jsonb)",
                (message, json.dumps({"unvalidated": unvalidated})),
            )
            alerts.append(message)

        cur.execute(
            "SELECT source_id FROM core.source_register WHERE license_class = 'UNCLEAR' ORDER BY 1"
        )
        unclear = [r["source_id"] for r in cur.fetchall()]
        if unclear:
            message = f"Fuentes sin licencia verificada (bloqueadas para features): {unclear}"
            cur.execute(
                "INSERT INTO core.quality_alert (severity, source_id, code, message, payload) "
                "VALUES ('error', NULL, 'UNCLEAR_LICENSE', %s, %s::jsonb)",
                (message, json.dumps({"sources": unclear})),
            )
            alerts.append(message)
    return alerts


# ── Escenas satelitales ─────────────────────────────────────────────────

SENTINEL_DIR = Path(__file__).resolve().parents[3] / "data" / "sentinel"


def record_satellite_scenes(
    conn: psycopg.Connection,
    scenes: list[tuple],
    *,
    manifest: dict,
) -> tuple[int, int]:
    """Escribe el catalogo de escenas consideradas, elegidas o no.

    Se guardan TODAS, no solo las seleccionadas. Las descartadas son lo que
    convierte "la mejor escena" en una decision entre alternativas que alguien
    puede auditar; sin ellas es una afirmacion sin respaldo.

    `scenes` son tuplas (scene, collection, window, selected, reason, params).
    """
    import json as _json

    content_hash = hashlib.sha256(
        _json.dumps(
            {"scenes": sorted(s.scene_id for s, *_ in scenes), "manifest": manifest},
            sort_keys=True,
        ).encode()
    ).hexdigest()
    version = _publish_version(
        conn,
        source_id="copernicus_sentinel",
        record_count=len(scenes),
        content_hash=content_hash,
        is_synthetic=False,
        manifest=manifest,
    )

    written = 0
    with conn.cursor() as cur:
        for scene, window, selected, reason, params in scenes:
            cur.execute(
                """
                INSERT INTO core.satellite_scene (
                    scene_id, collection, event_window, acquisition_date, footprint,
                    cloud_cover, platform, processing_baseline, orbit_direction,
                    relative_orbit, selected, selection_reason, request_parameters,
                    processing_date, asset_path, data_version
                ) VALUES (
                    %s, %s, %s, %s, ST_GeomFromGeoJSON(%s), %s, %s, %s, %s, %s,
                    %s, %s, %s::jsonb, %s, %s, %s
                )
                ON CONFLICT (scene_id, collection) DO NOTHING
                """,
                (
                    scene.scene_id,
                    scene.collection,
                    window,
                    scene.acquisition,
                    _json.dumps(scene.geometry or _bbox_polygon(scene.bbox)),
                    scene.cloud_cover,
                    scene.platform,
                    scene.processing_baseline,
                    scene.orbit_direction,
                    scene.relative_orbit,
                    selected,
                    reason,
                    _json.dumps(params or {}),
                    datetime.now(UTC) if selected else None,
                    params.get("asset_path") if params else None,
                    version,
                ),
            )
            written += cur.rowcount
    return version, written


def _bbox_polygon(bbox: tuple[float, float, float, float]) -> dict:
    """GeoJSON de respaldo cuando el catalogo no trae geometria."""
    min_lon, min_lat, max_lon, max_lat = bbox
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [min_lon, min_lat],
                [max_lon, min_lat],
                [max_lon, max_lat],
                [min_lon, max_lat],
                [min_lon, min_lat],
            ]
        ],
    }


def assert_source_usable(source_id: str) -> None:
    """Control C1 de fuentes.md §6 — `UNCLEAR` no alimenta una feature."""
    from uri.ingestion.registry import SOURCES_BY_ID

    source = SOURCES_BY_ID.get(source_id)
    if source is None:
        raise ValueError(f"{source_id}: fuente no registrada (FR-ING-01)")
    if source.license_class is LicenseClass.UNCLEAR:
        raise ValueError(
            f"{source_id}: licencia UNCLEAR. No puede alimentar una feature "
            "hasta que la auditoria de fuentes.md §10 la clasifique."
        )
