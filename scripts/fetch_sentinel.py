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

#: Por defecto, el AOI que el resto del sistema ya usa: el poligono que
#: Copernicus EMS declaro haber observado (EMSR916/AOI02), no un rectangulo
#: dibujado a mano. El limite municipal oficial del DANE seria mejor, pero no
#: es alcanzable desde este entorno (403/404), y aproximarlo con un bbox
#: inventado seria meter por la puerta de atras el dato sin fuente que ADR-17
#: prohibe. Se puede sobrescribir con --bbox cuando haya un limite con fuente.
DEFAULT_BBOX = loader.PEREIRA_BBOX

WINDOWS = (("PRE", sentinel.PRE_WINDOW), ("POST", sentinel.POST_WINDOW))


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
    except sentinel.CdseAuthMissing as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 2

    considered: list[tuple] = []
    chosen: dict[tuple[str, str], sentinel.Scene] = {}

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
    for label, _ in WINDOWS:
        try:
            scene, reason = sentinel.select_optical(found[(sentinel.S2, label)], window_label=label)
        except sentinel.NoUsableScene as exc:
            print(f"   {sentinel.S2} {label}: SIN ESCENA — {exc}")
            continue
        chosen[(sentinel.S2, label)] = scene
        print(f"   {sentinel.S2} {label}: {scene.scene_id[:48]} — {reason}")

    # La post de radar se ata a la geometria de la pre; sin eso la diferencia
    # mediria el angulo de observacion.
    radar_pre = None
    for label, _ in WINDOWS:
        try:
            scene, reason = sentinel.select_radar(
                found[(sentinel.S1, label)],
                window_label=label,
                match=radar_pre if label == "POST" else None,
            )
        except sentinel.NoUsableScene as exc:
            print(f"   {sentinel.S1} {label}: SIN ESCENA — {exc}")
            continue
        if label == "PRE":
            radar_pre = scene
        chosen[(sentinel.S1, label)] = scene
        print(f"   {sentinel.S1} {label}: {scene.scene_id[:48]} — {reason}")

    # ── Recorte del AOI ─────────────────────────────────────────────────
    for (collection, label), scenes in found.items():
        best = chosen.get((collection, label))
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
            reason = None
            if selected:
                reason = (
                    sentinel.select_optical(scenes, window_label=label)[1]
                    if collection == sentinel.S2
                    else sentinel.select_radar(scenes, window_label=label)[1]
                )
            considered.append((scene, label, selected, reason, params))

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
