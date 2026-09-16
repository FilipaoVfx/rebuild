#!/usr/bin/env python3
"""Fase 1 del pipeline de evidencia de cambio: catalogar y recortar Sentinel.

Busca escenas Sentinel-1 GRD y Sentinel-2 L2A en las ventanas pre y post del
sismo, elige la mejor de cada una con un criterio que queda escrito, recorta
el AOI y registra la procedencia completa.

**Lo que este script NO hace, a proposito:** no clasifica edificios, no
calcula un `damage_score` y no entrena nada. Un cambio de retrodispersion o de
NDVI es un cambio en la señal; llamarlo daño afirmaria una causa que el dato
no contiene.

Credenciales por entorno, nunca en disco ni en el frontend:

    export CDSE_CLIENT_ID=...
    export CDSE_CLIENT_SECRET=...
    .venv/bin/python scripts/fetch_sentinel.py

Sin credenciales el script explica que falta y sale con codigo 2, en vez de
escribir nada a medias.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from uri.db import worker_connection  # noqa: E402
from uri.ingestion import loader  # noqa: E402
from uri.ingestion.adapters import sentinel  # noqa: E402

# El adaptador lee `os.environ` directamente, no `Settings`: son credenciales
# de un servicio externo, no configuracion de la aplicacion, y no llevan el
# prefijo URI_. Pero el proyecto ya documenta `.env` como el sitio donde van
# los secretos locales, asi que se carga aqui — sin el, pegar las claves en
# `.env` fallaria en silencio con un mensaje de "faltan credenciales".
try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:  # pragma: no cover - python-dotenv es dependencia directa
    pass

#: Por defecto, el AOI que el resto del sistema ya usa: el poligono que
#: Copernicus EMS declaro haber observado (EMSR916/AOI02), no un rectangulo
#: dibujado a mano. El limite municipal oficial del DANE seria mejor, pero no
#: es alcanzable desde este entorno (403/404), y aproximarlo con un bbox
#: inventado seria meter por la puerta de atras el dato sin fuente que ADR-17
#: prohibe. Se puede sobrescribir con --bbox cuando haya un limite con fuente.
DEFAULT_BBOX = loader.PEREIRA_BBOX

WINDOWS = (("PRE", sentinel.PRE_WINDOW), ("POST", sentinel.POST_WINDOW))

#: Forma de dato modificado del art. 8 del Reg. UE 1159/2013: todo se recorta
#: al AOI, asi que la imagen publicada NO es el producto original.
ATTRIBUTION = "Contains modified Copernicus Sentinel data 2026"

#: Viaja con las imagenes hasta la pantalla. Una mancha oscura en un PNG
#: invita a leerse como edificio caido, y no lo es.
LIMITATION = (
    "Reflectancia y retrodispersion observadas, no dano. Una diferencia entre "
    "las dos fechas puede ser sombra, agua, obra nueva, cosecha o un tejado "
    "repintado. Evidencia para mirar, no veredicto."
)


def out_dir(collection: str, window: str) -> Path:
    family = "sentinel1" if collection == sentinel.S1 else "sentinel2"
    return ROOT / "data" / "sentinel" / family / window.lower()


def main(bbox: tuple[float, float, float, float], *, dry_run: bool) -> int:
    print(f"AOI: {bbox}")
    print(f"evento: {sentinel.EVENT_DATE}")
    for label, (start, end) in WINDOWS:
        print(f"  ventana {label}: {start} → {end}")

    try:
        client = sentinel.CdseClient()
        # Se pide el token ANTES de empezar: una credencial mal pegada tiene
        # que fallar aqui, con un mensaje, y no a mitad del catalogo con un
        # traceback de 30 lineas que parece un fallo del programa.
        client.token()
    except sentinel.CdseAuthMissing as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 2
    except sentinel.CdseError as exc:
        print(
            f"\nCDSE no acepto las credenciales.\n{exc}\n\n"
            "Revisa CDSE_CLIENT_ID y CDSE_CLIENT_SECRET (entorno o .env). "
            "El secreto solo se muestra una vez al crear el cliente OAuth; "
            "si se perdio, crea otro en Dashboard -> User Settings -> OAuth clients.",
            file=sys.stderr,
        )
        return 2

    considered: list[tuple] = []
    previews: list[dict] = []

    # ── Catalogo ────────────────────────────────────────────────────────
    found: dict[tuple[str, str], list[sentinel.Scene]] = {}
    for collection in (sentinel.S2, sentinel.S1):
        for label, window in WINDOWS:
            scenes = client.search(collection, bbox, window)
            covering = [s for s in scenes if sentinel.covers_aoi(s, bbox)]
            found[(collection, label)] = covering
            print(f"\n{collection} {label}: {len(scenes)} escenas, {len(covering)} cubren el AOI")
            for scene in covering:
                nube = "—" if scene.cloud_cover is None else f"{scene.cloud_cover:5.1f}%"
                print(
                    f"   {scene.acquisition:%Y-%m-%d} {scene.scene_id[:48]:48} "
                    f"nube {nube}  {scene.orbit_direction or ''} {scene.relative_orbit or ''}"
                )

    # ── Seleccion ───────────────────────────────────────────────────────
    print("\nseleccion")
    chosen, avisos = sentinel.select_pairs(found, windows=tuple(w[0] for w in WINDOWS))
    for aviso in avisos:
        print(f"   {aviso}")
    for (collection, label), (scene, reason) in sorted(chosen.items()):
        print(f"   {collection} {label}: {scene.scene_id[:48]} — {reason}")

    # ── Recorte del AOI ─────────────────────────────────────────────────
    for (collection, label), scenes in found.items():
        best, best_reason = chosen.get((collection, label), (None, None))
        for scene in scenes:
            selected = best is not None and scene.scene_id == best.scene_id
            params: dict = {}
            if selected and not dry_run:
                evalscript = sentinel.EVALSCRIPTS[collection]()
                content, params = client.fetch_aoi(scene, bbox, evalscript=evalscript)
                directory = out_dir(collection, label)
                directory.mkdir(parents=True, exist_ok=True)
                path = directory / f"{scene.scene_id}.tif"
                path.write_bytes(content)
                params["asset_path"] = str(path.relative_to(ROOT))
                params["bands"] = list(
                    sentinel.S1_BANDS if collection == sentinel.S1 else sentinel.S2_BANDS
                )
                print(f"   escrito {path.relative_to(ROOT)}  ({len(content) / 1024:.0f} KB)")

                # La vista es un producto APARTE: PNG de 8 bits ya estirado,
                # con su propio evalscript y su propio hash. El GeoTIFF de
                # arriba sigue en float32 sin reescalar, porque es el que
                # alimenta los indices y un estiramiento ahi seria contraste
                # inventado midiendose como si fuera senal.
                vista = sentinel.PREVIEW_EVALSCRIPTS[collection]()
                imagen, vista_params = client.fetch_aoi(
                    scene, bbox, evalscript=vista, image_format="image/png"
                )
                png = directory / f"{scene.scene_id}.png"
                png.write_bytes(imagen)
                params["preview"] = {
                    "path": str(png.relative_to(ROOT)),
                    "evalscript_sha256": vista_params["evalscript_sha256"],
                    "width": vista_params["width"],
                    "height": vista_params["height"],
                    "bytes": len(imagen),
                }
                previews.append(
                    {
                        "collection": collection,
                        "window": label,
                        "scene_id": scene.scene_id,
                        "acquisition": scene.acquisition.date().isoformat(),
                        "cloud_cover": scene.cloud_cover,
                        "orbit_direction": scene.orbit_direction,
                        "relative_orbit": scene.relative_orbit,
                        "file": png.name,
                        "bbox": list(bbox),
                        "reason": best_reason,
                    }
                )
                print(f"   escrito {png.relative_to(ROOT)}  ({len(imagen) / 1024:.0f} KB)")
            considered.append((scene, label, selected, best_reason if selected else None, params))

    if not considered:
        print("\nEl catalogo no devolvio ninguna escena que cubra el AOI.", file=sys.stderr)
        return 1

    # ── Procedencia ─────────────────────────────────────────────────────
    manifest = {
        "aoi_bbox": list(bbox),
        "event_date": sentinel.EVENT_DATE.isoformat(),
        "windows": {label: [w[0].isoformat(), w[1].isoformat()] for label, w in WINDOWS},
        "collections": [sentinel.S1, sentinel.S2],
        "bands": {sentinel.S1: list(sentinel.S1_BANDS), sentinel.S2: list(sentinel.S2_BANDS)},
        "resolution_m": sentinel.RESOLUTION_M,
        "max_cloud_cover": sentinel.MAX_CLOUD_COVER,
        "retrieved_at": datetime.now(UTC).isoformat(),
        "limitation": (
            "Escenas e indices, no daño. Un cambio de retrodispersion o de NDVI "
            "no distingue una demolicion de una obra nueva, una cosecha o un "
            "suelo mojado."
        ),
        "dry_run": dry_run,
    }
    # El manifiesto de vistas es lo unico que el visor lee: nombres de
    # archivo, limites y por que se eligio cada escena. No lleva credencial
    # ninguna, y sin el las imagenes serian cuatro PNG sin fecha ni motivo.
    if previews:
        indice = ROOT / "data" / "sentinel" / "previews.json"
        indice.parent.mkdir(parents=True, exist_ok=True)
        indice.write_text(
            json.dumps(
                {
                    "aoi_bbox": list(bbox),
                    "event_date": sentinel.EVENT_DATE.isoformat(),
                    "attribution": ATTRIBUTION,
                    "limitation": LIMITATION,
                    "scenes": sorted(previews, key=lambda x: (x["collection"], x["window"])),
                },
                indent=1,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"\nindice de vistas: {indice.relative_to(ROOT)} ({len(previews)} imagenes)")

    with worker_connection() as conn:
        loader.register_sources(conn)
        version, written = loader.record_satellite_scenes(conn, considered, manifest=manifest)
        conn.commit()
    print(f"\ndata_version {version}: {written} escenas registradas de {len(considered)}")
    print(json.dumps({k: v for k, v in manifest.items() if k != "retrieved_at"}, indent=1)[:400])
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bbox",
        help="min_lon,min_lat,max_lon,max_lat en EPSG:4326. Por defecto el AOI de EMSR916.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Cataloga y selecciona sin descargar ni escribir GeoTIFF.",
    )
    args = parser.parse_args()
    box = DEFAULT_BBOX
    if args.bbox:
        parts = [float(x) for x in args.bbox.split(",")]
        if len(parts) != 4:
            parser.error("--bbox necesita cuatro numeros")
        box = (parts[0], parts[1], parts[2], parts[3])
    raise SystemExit(main(box, dry_run=args.dry_run))
