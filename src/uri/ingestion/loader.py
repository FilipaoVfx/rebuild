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
from uri.ingestion.synthetic import (
    generate_land_use,
    generate_population,
    generate_risk_zones,
)

#: AOI de trabajo: el area de Pereira cubierta por la evidencia satelital,
#: con margen para que los catchments no se corten en el borde.
PEREIRA_BBOX = (-75.725, 4.790, -75.670, 4.830)

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


def load_synthetic_layers(conn: psycopg.Connection, seed: int) -> tuple[int, dict[str, int]]:
    cells, pop_manifest = generate_population(PEREIRA_BBOX, seed)
    zones, risk_manifest = generate_risk_zones(PEREIRA_BBOX, seed)
    parcels, land_manifest = generate_land_use(PEREIRA_BBOX, seed)

    combined = {
        "population": pop_manifest.as_dict(),
        "risk": risk_manifest.as_dict(),
        "land_use": land_manifest.as_dict(),
    }
    content_hash = hashlib.sha256(
        "".join(m["content_hash"] for m in combined.values()).encode()
    ).hexdigest()
    version = _publish_version(
        conn,
        source_id="synthetic",
        record_count=len(cells) + len(zones) + len(parcels),
        content_hash=content_hash,
        is_synthetic=True,
        manifest=combined,
    )
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) AS n FROM core.population_cell WHERE data_version = %s", (version,)
        )
        if cur.fetchone()["n"]:
            return version, {
                "cells": len(cells),
                "risk_zones": len(zones),
                "land_use": len(parcels),
            }

        for cell in cells:
            cur.execute(
                """
                INSERT INTO core.population_cell
                    (geometry, population, households, vulnerability, is_synthetic, data_version)
                VALUES (ST_GeomFromText(%s, 4326), %s, %s, %s, true, %s)
                """,
                (cell.wkt, cell.population, cell.households, cell.vulnerability, version),
            )
        for zone in zones:
            cur.execute(
                """
                INSERT INTO core.risk_zone
                    (geometry, risk_level, risk_score, is_synthetic, data_version)
                VALUES (ST_GeomFromText(%s, 4326), %s, %s, true, %s)
                """,
                (zone.wkt, zone.level, zone.score, version),
            )
        for parcel in parcels:
            cur.execute(
                "INSERT INTO core.land_use (geometry, category, is_synthetic, data_version) "
                "VALUES (ST_GeomFromText(%s, 4326), %s, true, %s)",
                (parcel.wkt, parcel.level, version),
            )
    return version, {"cells": len(cells), "risk_zones": len(zones), "land_use": len(parcels)}


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
