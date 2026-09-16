#!/usr/bin/env python
"""Teselas de terreno del Copernicus DEM GLO-30, en Terrain-RGB.

Baja el modelo de elevacion del AOI ya codificado como lo lee MapLibre y lo
deja en `data/terrain/{z}/{x}/{y}.png`. Son pocas teselas: el AOI son ~5,6 x
3,9 km y el DEM son 30 m, asi que por encima de z14 se remuestrearia dato que
no existe.

LICENCIA — leida, no supuesta. El WorldDEM-30 es un producto de Airbus que la
UE sublicencia, y NO comparte los terminos de Sentinel aunque lleve Copernicus
en el nombre. Auditoria completa en
`db/terms/copernicus_dem_glo30_licence_20260916.txt`. Pasa como ATTRIBUTION
redistribuible, pero obliga a publicar un aviso de no responsabilidad literal
(art. 6c) que ninguna otra fuente del registro pide, y que viaja en la columna
`liability_notice` hasta la pantalla.

Las credenciales se leen del entorno y nunca llegan al visor.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from uri.db import worker_connection  # noqa: E402
from uri.ingestion import loader  # noqa: E402
from uri.ingestion.adapters import sentinel  # noqa: E402

DEFAULT_BBOX = loader.PEREIRA_BBOX
OUT = ROOT / "data" / "terrain"


def main(bbox: tuple[float, float, float, float], *, dry_run: bool) -> int:
    zooms = range(sentinel.TERRAIN_MIN_ZOOM, sentinel.TERRAIN_MAX_ZOOM + 1)
    teselas = [t for z in zooms for t in sentinel.tiles_covering(bbox, z)]
    print(f"AOI: {bbox}")
    print(f"zooms {sentinel.TERRAIN_MIN_ZOOM}-{sentinel.TERRAIN_MAX_ZOOM}: {len(teselas)} teselas")
    for z in zooms:
        n = len(sentinel.tiles_covering(bbox, z))
        print(f"   z{z}: {n}")

    if dry_run:
        print("\n--dry-run: no se descarga nada")
        return 0

    try:
        client = sentinel.CdseClient()
        client.token()
    except sentinel.CdseAuthMissing as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 2
    except sentinel.CdseError as exc:
        print(f"\nCDSE no acepto las credenciales.\n{exc}", file=sys.stderr)
        return 2

    evalscript = sentinel.terrain_evalscript()
    escritas, total_bytes = 0, 0
    for z, x, y in teselas:
        contenido, _ = client.fetch_terrain_tile(z, x, y, evalscript=evalscript)
        destino = OUT / str(z) / str(x) / f"{y}.png"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(contenido)
        escritas += 1
        total_bytes += len(contenido)
    print(f"\n{escritas} teselas escritas, {total_bytes / 1024:.0f} KB")

    # El indice es lo que el visor lee. Lleva la atribucion Y el aviso de no
    # responsabilidad, porque el art. 6c los exige a los dos y por separado.
    with worker_connection() as conn:
        loader.register_sources(conn)
        conn.commit()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT attribution_text, liability_notice FROM rebuild_core.source_register "
                "WHERE source_id = %s",
                (sentinel.DEM_SOURCE_ID,),
            )
            fila = cur.fetchone()

    indice = {
        "aoi_bbox": list(bbox),
        "minzoom": sentinel.TERRAIN_MIN_ZOOM,
        "maxzoom": sentinel.TERRAIN_MAX_ZOOM,
        "tile_size": sentinel.TILE_SIZE,
        "encoding": "mapbox",
        "dem_instance": sentinel.DEM_INSTANCE,
        "evalscript_sha256": sentinel._sha256(evalscript),
        "attribution": fila["attribution_text"],
        "liability_notice": fila["liability_notice"],
        "tiles": escritas,
        "retrieved_at": datetime.now(UTC).isoformat(),
    }
    (OUT / "terrain.json").write_text(
        json.dumps(indice, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"indice: {(OUT / 'terrain.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", help="min_lon,min_lat,max_lon,max_lat en EPSG:4326")
    parser.add_argument("--dry-run", action="store_true", help="Solo contar teselas")
    args = parser.parse_args()
    box = DEFAULT_BBOX
    if args.bbox:
        partes = [float(v) for v in args.bbox.split(",")]
        if len(partes) != 4:
            parser.error("--bbox necesita cuatro numeros")
        box = (partes[0], partes[1], partes[2], partes[3])
    raise SystemExit(main(box, dry_run=args.dry_run))
