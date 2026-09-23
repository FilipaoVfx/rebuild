"""Adaptador de pereiramap: fotos de campo con ubicacion y hora (ADR-24).

Producto hermano, misma base Supabase. Se lee la vista publica
`public.pereiramap_observacion_publica` por PostgREST —sin identificador de
dispositivo, sin coordenadas crudas, sin rechazadas— y se copian las
imagenes del bucket publico a `data/field/`, que es de donde el visor las
sirve. El visor nunca habla con Supabase (fuentes.md §11).

Las dos cosas que se comprueban antes de que una foto entre:
  - que el SHA-256 de la imagen descargada sea el que la fila declara: es lo
    que ata la fila a los bytes que se van a publicar;
  - que la fila sea lo que dice ser (estado de revision conocido, categoria
    conocida, coordenadas dentro de la caja del municipio). Lo que no cumple
    se cuenta en el manifiesto y no entra.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

SOURCE_ID = "pereiramap"
VIEW = "pereiramap_observacion_publica"
BUCKET = "field-photos"
PAGE = 500

#: Donde caen las imagenes copiadas. Mismo criterio que Sentinel y ortofotos:
#: `data/`, servido por `/data/field/...` y copiado por `build_static.py`.
DATA = Path(__file__).resolve().parents[4] / "data" / "field"

#: Configuracion por entorno. Sin las dos, el paso se salta y el reporte lo
#: dice: un pipeline que falla porque no hay fotos configuradas es peor que
#: uno que las omite y avisa.
ENV_URL = "URI_FIELD_URL"
ENV_KEY = "URI_FIELD_KEY"

CATEGORIES = frozenset(
    {
        "COLAPSO",
        "DANO_ESTRUCTURAL",
        "DANO_LEVE",
        "ESCOMBROS",
        "VIA_AFECTADA",
        "EQUIPAMIENTO_AFECTADO",
        "SIN_DANO_VISIBLE",
        "OTRO",
    }
)
REVIEW_STATES = frozenset({"PENDIENTE", "APROBADA"})
LOCATION_SOURCES = frozenset({"DEVICE", "EXIF", "MANUAL"})

#: La misma caja generosa que la base de pereiramap: rechaza (0,0) y
#: coordenadas invertidas, no decide que es Pereira.
MUNICIPALITY_BOX = (-76.10, 4.55, -75.35, 5.05)


@dataclass(frozen=True)
class FieldObservation:
    observation_id: str
    captured_at: str
    received_at: str
    category: str | None
    lon: float
    lat: float
    location_source: str
    accuracy_m: float | None
    heading_deg: float | None
    exif_gps: bool
    exif_device_offset_m: float | None
    image_path: str
    thumb_path: str
    image_sha256: str
    width: int
    height: int
    review_status: str


class FieldRowRejected(ValueError):
    """Una fila de la vista que no es lo que dice ser. El mensaje dice por que."""


def configured() -> tuple[str, str] | None:
    url, key = os.environ.get(ENV_URL, "").strip().rstrip("/"), os.environ.get(ENV_KEY, "").strip()
    if url.startswith("https://") and key:
        return url, key
    return None


def parse_row(raw: dict) -> FieldObservation:
    """Valida y tipa una fila de la vista. Lanza `FieldRowRejected` con la razon."""
    try:
        oid = str(raw["observation_id"])
        lon, lat = float(raw["lon"]), float(raw["lat"])
        status = str(raw["review_status"])
        source = str(raw["location_source"])
        sha = str(raw["image_sha256"]).lower()
        width, height = int(raw["width"]), int(raw["height"])
        category = raw.get("category")
        image_path, thumb_path = str(raw["image_path"]), str(raw["thumb_path"])
        captured_at, received_at = str(raw["captured_at"]), str(raw["received_at"])
    except (KeyError, TypeError, ValueError) as exc:
        raise FieldRowRejected(f"fila incompleta o mal tipada: {exc}") from exc
    if status not in REVIEW_STATES:
        raise FieldRowRejected(f"{oid}: review_status {status!r} no se ingiere")
    if source not in LOCATION_SOURCES:
        raise FieldRowRejected(f"{oid}: location_source {source!r} desconocido")
    if category is not None and category not in CATEGORIES:
        raise FieldRowRejected(f"{oid}: categoria {category!r} desconocida")
    if len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
        raise FieldRowRejected(f"{oid}: image_sha256 no es hex de 64")
    min_lon, min_lat, max_lon, max_lat = MUNICIPALITY_BOX
    if not (min_lon <= lon <= max_lon and min_lat <= lat <= max_lat):
        raise FieldRowRejected(f"{oid}: ({lon}, {lat}) fuera de la caja del municipio")
    if image_path != f"{oid}/full.jpg" or thumb_path != f"{oid}/thumb.jpg":
        raise FieldRowRejected(f"{oid}: rutas de imagen con forma inesperada")
    for label, value in (("captured_at", captured_at), ("received_at", received_at)):
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise FieldRowRejected(f"{oid}: {label} no es una fecha ISO") from exc
    return FieldObservation(
        observation_id=oid,
        captured_at=captured_at,
        received_at=received_at,
        category=category,
        lon=lon,
        lat=lat,
        location_source=source,
        accuracy_m=_num(raw.get("accuracy_m")),
        heading_deg=_num(raw.get("heading_deg")),
        exif_gps=bool(raw.get("exif_gps")),
        exif_device_offset_m=_num(raw.get("exif_device_offset_m")),
        image_path=image_path,
        thumb_path=thumb_path,
        image_sha256=sha,
        width=width,
        height=height,
        review_status=status,
    )


def _num(value) -> float | None:
    return None if value is None else float(value)


def _headers(key: str) -> dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}", "User-Agent": "uri-pipeline/1.0"}


def fetch_rows(url: str, key: str, *, timeout: float = 30.0) -> list[dict]:
    """Lee la vista entera, paginando con `Range` (PostgREST corta a 1000)."""
    rows: list[dict] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({"select": "*", "order": "captured_at.asc"})
        req = urllib.request.Request(
            f"{url}/rest/v1/{VIEW}?{query}",
            headers={
                **_headers(key),
                "Range": f"{offset}-{offset + PAGE - 1}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 - URL de configuracion
            page = json.loads(res.read().decode("utf-8"))
        if not isinstance(page, list):
            raise FieldRowRejected(f"respuesta inesperada de {VIEW}: {type(page).__name__}")
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def image_url(url: str, path: str) -> str:
    return f"{url}/storage/v1/object/public/{BUCKET}/{path}"


def download_images(
    url: str, observations: list[FieldObservation], *, dest: Path = DATA, timeout: float = 60.0
) -> tuple[list[FieldObservation], dict[str, str]]:
    """Copia full+thumb de cada observacion a `dest/<id>/`. Devuelve las que
    quedaron completas y verificadas, y las razones de las que no.

    La imagen grande se verifica contra `image_sha256`: si no coincide, la
    fila no entra. Una miniatura que falta no descarta la foto: se anota."""
    ok: list[FieldObservation] = []
    rejected: dict[str, str] = {}
    for obs in observations:
        folder = dest / obs.observation_id
        full, thumb = folder / "full.jpg", folder / "thumb.jpg"
        try:
            if not (full.exists() and _sha256(full) == obs.image_sha256):
                folder.mkdir(parents=True, exist_ok=True)
                _get(image_url(url, obs.image_path), full, timeout)
                if _sha256(full) != obs.image_sha256:
                    full.unlink(missing_ok=True)
                    rejected[obs.observation_id] = "sha256 de la imagen no coincide con la fila"
                    continue
            if not thumb.exists():
                _get(image_url(url, obs.thumb_path), thumb, timeout)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            rejected[obs.observation_id] = f"descarga fallida: {exc}"
            continue
        ok.append(obs)
    return ok, rejected


def _get(url: str, target: Path, timeout: float) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "uri-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 - URL de configuracion
        data = res.read()
    if data[:2] != b"\xff\xd8":
        raise OSError(f"{url}: no es JPEG")
    target.write_bytes(data)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
