"""Fotos de campo (ADR-24): de la vista publica de pereiramap a la ficha del sitio.

Tres pasos, en este orden: leer y validar las filas, copiar y verificar las
imagenes, sellar una version y cargar. Despues, enlazar cada foto al sitio
mas cercano a <= FIELD_LINK_M. El enlace se recalcula en cada corrida porque
`derive_sites` recrea los sitios.
"""

from __future__ import annotations

import json
import urllib.error
from datetime import UTC, datetime
from pathlib import Path

import psycopg

from uri.ingestion import loader
from uri.ingestion.adapters import pereiramap

#: Distancia maxima foto → sitio para considerar que la foto es DE ese sitio.
#: 75 m = un minuto a pie, la constante de las captaciones (75 m/min). Una foto
#: mas lejos queda sin sitio y se muestra igual: es dano que el satelite no
#: vio, no ruido.
FIELD_LINK_M = 75.0

LINK_SQL = """
UPDATE rebuild_core.field_observation fo
SET site_id = nearest.site_id, site_distance_m = nearest.dist
FROM (
    SELECT fo2.observation_id, s.site_id,
           round(ST_Distance(fo2.geometry::geography, s.geometry::geography)::numeric, 1) AS dist
    FROM rebuild_core.field_observation fo2
    JOIN LATERAL (
        SELECT s.site_id, s.geometry
        FROM rebuild_core.site s
        WHERE ST_DWithin(fo2.geometry::geography, s.geometry::geography, %(max_m)s)
        ORDER BY fo2.geometry <-> s.geometry
        LIMIT 1
    ) s ON true
) nearest
WHERE fo.observation_id = nearest.observation_id
"""


def load_field_observations(
    conn: psycopg.Connection, *, url: str, key: str, dest: Path = pereiramap.DATA
) -> tuple[int | None, dict]:
    """Devuelve (data_version | None si la fuente no respondio, conteos)."""
    loader.assert_source_usable(pereiramap.SOURCE_ID)
    counts: dict = {"fetched": 0, "loaded": 0, "rejected": 0, "pending": 0, "approved": 0}
    try:
        raw_rows = pereiramap.fetch_rows(url, key)
    except (urllib.error.URLError, TimeoutError, OSError, pereiramap.FieldRowRejected) as exc:
        counts["error"] = f"{type(exc).__name__}: {exc}"
        return None, counts
    counts["fetched"] = len(raw_rows)

    parsed: list[pereiramap.FieldObservation] = []
    rejected: dict[str, str] = {}
    for raw in raw_rows:
        try:
            parsed.append(pereiramap.parse_row(raw))
        except pereiramap.FieldRowRejected as exc:
            rejected[str(raw.get("observation_id", "?"))] = str(exc)
    verified, download_rejected = pereiramap.download_images(url, parsed, dest=dest)
    rejected.update(download_rejected)
    counts["rejected"] = len(rejected)
    counts["pending"] = sum(1 for o in verified if o.review_status == "PENDIENTE")
    counts["approved"] = sum(1 for o in verified if o.review_status == "APROBADA")

    # El hash incluye el estado de revision: aprobar una foto ES una version
    # nueva, porque cambia lo que el paquete publico contiene.
    version = loader._publish_version(
        conn,
        source_id=pereiramap.SOURCE_ID,
        record_count=len(verified),
        content_hash=loader._hash_rows(
            sorted(f"{o.observation_id}:{o.image_sha256}:{o.review_status}" for o in verified)
        ),
        is_synthetic=False,
        manifest={
            "view": pereiramap.VIEW,
            "endpoint": url,
            "fetched_at": datetime.now(UTC).isoformat(),
            "counts": {k: v for k, v in counts.items() if k != "error"},
            "rejected": rejected,
            "link_max_m": FIELD_LINK_M,
        },
    )
    with conn.cursor() as cur:
        # La tabla refleja la ultima lectura, no un historico: una foto que
        # dejo de estar en la vista (rechazada despues) sale de aqui tambien.
        cur.execute("DELETE FROM rebuild_core.field_observation")
        for o in verified:
            cur.execute(
                """
                INSERT INTO rebuild_core.field_observation (
                    observation_id, captured_at, received_at, category, location_source,
                    accuracy_m, heading_deg, exif_gps, exif_device_offset_m, review_status,
                    image_path, thumb_path, image_sha256, width, height, geometry, data_version
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                          ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)
                """,
                (
                    o.observation_id,
                    o.captured_at,
                    o.received_at,
                    o.category,
                    o.location_source,
                    o.accuracy_m,
                    o.heading_deg,
                    o.exif_gps,
                    o.exif_device_offset_m,
                    o.review_status,
                    o.image_path,
                    o.thumb_path,
                    o.image_sha256,
                    o.width,
                    o.height,
                    o.lon,
                    o.lat,
                    version,
                ),
            )
    counts["loaded"] = len(verified)
    return version, counts


def link_field_observations(conn: psycopg.Connection) -> dict[str, int]:
    """Enlaza cada foto al sitio mas cercano a <= FIELD_LINK_M y declara las
    que quedan sin sitio en una alerta (no se esconden: son la parte del dano
    que el satelite no vio)."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE rebuild_core.field_observation SET site_id = NULL, site_distance_m = NULL"
        )
        cur.execute(LINK_SQL, {"max_m": FIELD_LINK_M})
        cur.execute(
            """
            SELECT count(*) AS total,
                   count(*) FILTER (WHERE site_id IS NOT NULL) AS linked
            FROM rebuild_core.field_observation
            """
        )
        row = cur.fetchone()
        stats = {"total": int(row["total"]), "linked": int(row["linked"])}
        stats["unlinked"] = stats["total"] - stats["linked"]
        cur.execute("DELETE FROM rebuild_core.quality_alert WHERE code = 'FIELD_UNLINKED'")
        if stats["unlinked"]:
            cur.execute(
                """
                INSERT INTO rebuild_core.quality_alert
                    (code, severity, source_id, message, payload)
                VALUES ('FIELD_UNLINKED', 'warning', 'pereiramap', %s, %s::jsonb)
                """,
                (
                    f"{stats['unlinked']} de {stats['total']} fotos de campo no tienen un sitio "
                    f"a menos de {FIELD_LINK_M:.0f} m: se muestran sin ficha.",
                    json.dumps({**stats, "link_max_m": FIELD_LINK_M}),
                ),
            )
    return stats
