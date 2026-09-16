#!/usr/bin/env python
"""Teselas de relieve del Copernicus DEM GLO-30, en Terrain-RGB.

Deja el modelo de elevacion del AOI en `data/terrain/{z}/{x}/{y}.png`, ya
codificado como lo lee MapLibre. Son 10 teselas: el AOI son ~5,6 x 3,9 km y el
DEM son 30 m por muestra, asi que por encima de z14 se remuestrearia detalle
que no existe.

DE DONDE SALE, y por que no de CDSE. El primer intento fue pedirlo por la API
de proceso con las mismas credenciales que sirven para las escenas: responde
403 COMMON_INSUFFICIENT_PERMISSIONS. El DEM es una Copernicus Contributing
Mission y no entra en el tier gratuito de Sentinel Hub. La licencia lo permite;
la cuenta no llega. El registro de datos abiertos de AWS sirve el MISMO
producto de forma anonima — cambia el transporte, no los terminos.

LICENCIA — leida, no supuesta. Auditoria en
`db/terms/copernicus_dem_glo30_licence_20260916.txt`. Pasa como ATTRIBUTION
redistribuible, sin restriccion comercial y sin share-alike, pero obliga a
publicar un aviso de no responsabilidad literal (art. 6c) que ninguna otra
fuente del registro pide. Ese aviso viaja en `liability_notice` hasta la
pantalla.

Dependencias: `pip install -e ".[terrain]"`. Van aparte a proposito — las
teselas se versionan, asi que ni el pipeline ni el despliegue las necesitan.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from uri.db import worker_connection  # noqa: E402
from uri.ingestion import loader  # noqa: E402
from uri.ingestion.adapters import sentinel  # noqa: E402

DEFAULT_BBOX = loader.PEREIRA_BBOX
OUT = ROOT / "data" / "terrain"
CACHE = ROOT / "data" / "terrain" / ".cog"


def cog_name(lat: int, lon: int) -> str:
    """Nombre de la tesela de 1x1 grado del GLO-30 que contiene esa esquina."""
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def download_cog(lat: int, lon: int) -> Path:
    """Baja (y cachea) la tesela de 1 grado. Acceso anonimo, sin credencial."""
    nombre = cog_name(lat, lon)
    destino = CACHE / f"{nombre}.tif"
    if destino.exists():
        print(f"   {nombre}: en cache")
        return destino
    url = f"{sentinel.DEM_BASE_URL}/{nombre}/{nombre}.tif"
    destino.parent.mkdir(parents=True, exist_ok=True)
    print(f"   {nombre}: descargando…")
    with urllib.request.urlopen(url, timeout=300) as respuesta:
        destino.write_bytes(respuesta.read())
    print(f"   {nombre}: {destino.stat().st_size / 1e6:.0f} MB")
    return destino


def load_dem(ruta: Path):
    """Array de elevacion y su georreferenciacion, leida de las etiquetas.

    El origen y el paso se leen del GeoTIFF y NO se asumen a partir del nombre
    del archivo: el nombre dice que esquina le toca, pero quien manda sobre
    donde cae cada pixel es la etiqueta.
    """
    import numpy as np
    import tifffile

    with tifffile.TiffFile(ruta) as tf:
        pagina = tf.pages[0]
        datos = pagina.asarray()
        escala = pagina.tags["ModelPixelScaleTag"].value
        tiepoint = pagina.tags["ModelTiepointTag"].value
    origen_lon, origen_lat = float(tiepoint[3]), float(tiepoint[4])
    paso_lon, paso_lat = float(escala[0]), float(escala[1])
    return np.asarray(datos, dtype="float64"), origen_lon, origen_lat, paso_lon, paso_lat


def render_tile(dem, origen_lon, origen_lat, paso_lon, paso_lat, z, x, y, size):
    """Una tesela XYZ en Terrain-RGB, muestreada del DEM.

    La formula es la de Mapbox, que MapLibre implementa igual:
    `altura = -10000 + (R * 65536 + G * 256 + B) * 0,1`. Da un paso de 10 cm,
    muy por debajo de lo que un DEM de 30 m distingue.
    """
    import numpy as np

    oeste, sur, este, norte = sentinel.tile_bounds(z, x, y)

    # Las columnas son lineales en longitud; las filas NO lo son en latitud,
    # porque XYZ es Mercator. Muestrear la fila por interpolacion lineal entre
    # norte y sur desplazaria el relieve respecto a las capas vectoriales, poco
    # en una tesela pequena y mucho en una de z11.
    n = 2.0**z
    y_merc = np.linspace(y, y + 1, size, endpoint=False) + 0.5 / size
    lats = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * y_merc / n))))
    lons = oeste + (este - oeste) * (np.arange(size) + 0.5) / size

    col = np.clip(((lons - origen_lon) / paso_lon).astype(int), 0, dem.shape[1] - 1)
    fila = np.clip(((origen_lat - lats) / paso_lat).astype(int), 0, dem.shape[0] - 1)
    alturas = dem[np.ix_(fila, col)]

    # Los huecos del DEM llegan muy negativos. Fijarlos en 0 evita un pozo
    # artificial; el AOI de Pereira esta a ~1.400 m, asi que no se pierde nada.
    v = np.rint((np.maximum(alturas, 0.0) + 10000.0) / 0.1).astype("int64")
    rgb = np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], axis=-1)
    return rgb.astype("uint8")


def main(bbox: tuple[float, float, float, float], *, dry_run: bool) -> int:
    zooms = range(sentinel.TERRAIN_MIN_ZOOM, sentinel.TERRAIN_MAX_ZOOM + 1)
    teselas = [t for z in zooms for t in sentinel.tiles_covering(bbox, z)]
    print(f"AOI: {bbox}")
    print(f"zooms {sentinel.TERRAIN_MIN_ZOOM}-{sentinel.TERRAIN_MAX_ZOOM}: {len(teselas)} teselas")
    for z in zooms:
        print(f"   z{z}: {len(sentinel.tiles_covering(bbox, z))}")
    if dry_run:
        print("\n--dry-run: no se descarga nada")
        return 0

    try:
        from PIL import Image
    except ImportError:
        print(
            '\nFaltan dependencias. Instala con: pip install -e ".[terrain]"',
            file=sys.stderr,
        )
        return 2

    # El AOI puede caer sobre varias teselas de 1 grado; hoy cae sobre una.
    esquinas = {
        (math.floor(lat), math.floor(lon))
        for lat in (bbox[1], bbox[3])
        for lon in (bbox[0], bbox[2])
    }
    if len(esquinas) > 1:
        print(
            f"\nAOI sobre {len(esquinas)} teselas de 1 grado: {sorted(esquinas)}",
            file=sys.stderr,
        )
        print("Este script cubre una sola. Amplialo antes de mover el AOI.", file=sys.stderr)
        return 1
    lat, lon = esquinas.pop()

    print("\nDEM de origen:")
    ruta = download_cog(lat, lon)
    dem, o_lon, o_lat, p_lon, p_lat = load_dem(ruta)
    print(f"   {dem.shape[0]}x{dem.shape[1]}, origen ({o_lon}, {o_lat}), paso {p_lon}")
    print(f"   altitud {dem.min():.0f}–{dem.max():.0f} m")

    escritas, total = 0, 0
    for z, x, y in teselas:
        rgb = render_tile(dem, o_lon, o_lat, p_lon, p_lat, z, x, y, sentinel.TILE_SIZE)
        destino = OUT / str(z) / str(x) / f"{y}.png"
        destino.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgb, mode="RGB").save(destino, optimize=True)
        escritas += 1
        total += destino.stat().st_size
    print(f"\n{escritas} teselas escritas, {total / 1024:.0f} KB")

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

    # El indice es lo unico que el visor lee. Lleva la atribucion Y el aviso de
    # no responsabilidad, porque el art. 6c los exige a los dos y por separado.
    indice = {
        "aoi_bbox": list(bbox),
        "minzoom": sentinel.TERRAIN_MIN_ZOOM,
        "maxzoom": sentinel.TERRAIN_MAX_ZOOM,
        "tile_size": sentinel.TILE_SIZE,
        "encoding": "mapbox",
        "dem_instance": sentinel.DEM_INSTANCE,
        "source_cog": cog_name(lat, lon),
        "source_url": sentinel.DEM_BASE_URL,
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
