#!/usr/bin/env python3
"""Teselas de una ortofoto de Pereira, tesela a tesela y con puerta (ADR-22 §6).

    scripts/fetch_ortofoto.py igac_ortofoto
    scripts/fetch_ortofoto.py pereira_ortofoto_post --dry-run

Mientras la fuente siga en UNCLEAR, todo va a `data/ortofoto/.sandbox/`, que
no se versiona, no se sirve y no se empaqueta: se puede mirar en local, no se
puede publicar. Cuando la fila del registro cambie, el mismo comando escribe
en `data/ortofoto/<fuente>/` y el visor la enciende.

Las teselas no se versionan en git (unos 20 MB por fuente): se reconstruyen
desde el indice, que guarda los parametros de la peticion.

Los servidores estatales se caen: reintentos con espera, y el script se puede
relanzar — una tesela que ya esta en disco no se vuelve a pedir.
"""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
import time
import urllib.error
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from uri.db import worker_connection  # noqa: E402
from uri.ingestion import loader  # noqa: E402
from uri.ingestion.adapters import ortofoto, sentinel  # noqa: E402
from uri.ingestion.registry import SOURCES_BY_ID  # noqa: E402

RETRIES = 4


def download(url: str) -> bytes:
    delay = 2.0
    for attempt in range(1, RETRIES + 1):
        try:
            return ortofoto.fetch_bytes(url)
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == RETRIES:
                raise
            print(f"      reintento {attempt}: {exc}", file=sys.stderr)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("inalcanzable")


def main(source_id: str, *, dry_run: bool) -> int:
    source = ortofoto.SOURCES_BY_KEY.get(source_id)
    if source is None:
        print(
            f"{source_id}: no es una ortofoto registrada. Opciones: "
            f"{', '.join(ortofoto.SOURCES_BY_KEY)}",
            file=sys.stderr,
        )
        return 2

    publishable = ortofoto.is_publishable(source_id)
    out = ortofoto.output_dir(source_id)
    bbox = loader.PEREIRA_BBOX
    zooms = range(ortofoto.MIN_ZOOM, ortofoto.MAX_ZOOM + 1)
    tiles = [t for z in zooms for t in sentinel.tiles_covering(bbox, z)]

    print(f"{source.display_name}")
    print(f"   modo: {source.mode} · {len(tiles)} teselas z{ortofoto.MIN_ZOOM}-{ortofoto.MAX_ZOOM}")
    if publishable:
        print(f"   destino: {out.relative_to(ROOT)} (publicable)")
    else:
        fila = SOURCES_BY_ID[source_id]
        print(
            f"   destino: {out.relative_to(ROOT)} (SANDBOX — la fuente esta en "
            f"{fila.license_class.value}; no se publica)"
        )
        print("   que lo desbloquea:")
        for linea in textwrap.wrap(fila.verification_notes or "", width=90):
            print(f"      {linea}")
    if dry_run:
        print("\n--dry-run: no se descarga nada")
        return 0

    if source.mode == "tiles":
        service = ortofoto.fetch_json(f"{source.url}?f=json")
        ortofoto.check_tile_scheme(service)
        print("   esquema de teselas: Web Mercator estandar, 256 px — compatible XYZ")

    out.mkdir(parents=True, exist_ok=True)
    written = skipped = 0
    tile_format: str | None = None
    for z, x, y in tiles:
        existing = next(
            (
                out / str(z) / str(x) / f"{y}.{ext}"
                for ext in ("jpg", "png")
                if (out / str(z) / str(x) / f"{y}.{ext}").exists()
            ),
            None,
        )
        if existing is not None:
            skipped += 1
            tile_format = tile_format or existing.suffix.lstrip(".")
            continue
        payload = download(ortofoto.tile_url(source, z, x, y))
        # El cache de ArcGIS entrega JPEG aunque la URL no lo diga; la
        # extension sigue al contenido, no a la peticion.
        ext = ortofoto.image_format(payload)
        if tile_format is None:
            tile_format = ext
        elif tile_format != ext:
            raise SystemExit(f"formatos mezclados en el cache: {tile_format} y {ext}")
        destino = out / str(z) / str(x) / f"{y}.{ext}"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(payload)
        written += 1
        if written % 50 == 0:
            print(f"   {written} teselas…")
    print(f"   {written} teselas nuevas, {skipped} ya en disco · formato {tile_format}")

    attribution = None
    with worker_connection() as conn:
        loader.register_sources(conn)
        conn.commit()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT attribution_text FROM rebuild_core.source_register WHERE source_id = %s",
                (source_id,),
            )
            fila = cur.fetchone()
            attribution = fila["attribution_text"] if fila else None

    indice = {
        "source_id": source_id,
        "display_name": source.display_name,
        "aoi_bbox": list(bbox),
        "minzoom": ortofoto.MIN_ZOOM,
        "maxzoom": ortofoto.MAX_ZOOM,
        "tile_size": ortofoto.TILE_SIZE,
        "format": tile_format or "png",
        "mode": source.mode,
        "service_url": source.url,
        "acquisition": source.acquisition,
        "attribution": attribution,
        "status": "AVAILABLE" if publishable else "SANDBOX",
        "request_parameters": {
            "crs": "EPSG:3857",
            "tile_size": ortofoto.TILE_SIZE,
            "zooms": [ortofoto.MIN_ZOOM, ortofoto.MAX_ZOOM],
            "sample_url": ortofoto.tile_url(source, *tiles[0]),
        },
        "tiles": written + skipped,
        "retrieved_at": datetime.now(UTC).isoformat(),
    }
    (out / "ortofoto.json").write_text(
        json.dumps(indice, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"   indice: {(out / 'ortofoto.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_id", choices=sorted(ortofoto.SOURCES_BY_KEY))
    parser.add_argument(
        "--dry-run", action="store_true", help="Solo contar teselas y decir el destino"
    )
    args = parser.parse_args()
    raise SystemExit(main(args.source_id, dry_run=args.dry_run))
