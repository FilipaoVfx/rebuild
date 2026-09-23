#!/usr/bin/env python3
"""Genera el paquete estático del visor para GitHub Pages.

GitHub Pages sirve archivos, no procesos: no hay optimizador que correr ni
consultas que filtrar. El paquete vuelca lo que la API devolveria y el visor
lo consume en modo estatico.

El visor se construye aparte (`cd apps/viewer && npm run build`) y este script
empaqueta su `dist/`. Los assets van con hash y sin ninguna referencia a un
CDN: MapLibre y deck.gl entran al bundle desde npm en tiempo de construccion.

Dos consecuencias que el propio visor declara en pantalla:

- Los escenarios van PRECALCULADOS a presupuestos fijos. Pedir uno distinto
  devuelve el mas cercano y lo dice, en lugar de fingir que optimizo.
- Los exportes no estan: la puerta de licencia por perfil (fuentes.md §6) es
  logica de servidor, y publicarla como descarga estatica la eliminaria.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from fastapi.testclient import TestClient  # noqa: E402

from uri.api.app import app  # noqa: E402
from uri.contracts import CONTRIBUTING_SOURCES_SQL  # noqa: E402
from uri.db import worker_connection  # noqa: E402

#: El visor es una aplicacion con build propio; lo que se publica es su `dist`.
VIEWER_DIST = ROOT / "apps" / "viewer" / "dist"
DIST = ROOT / "dist"

#: Presupuestos precalculados, en miles de millones de COP.
BUDGETS_MMM = (10, 25, 50, 100)

#: Sin "risk": retirada la capa del SGC por licencia (ADR-18) no hay
#: amenaza que servir, y publicar una coleccion vacia solo produce un
#: control de capa que no enciende nada.
LAYERS = (
    # `buildings` y `roads` son el tejido urbano: pesan ~1 MB comprimidos
    # entre los dos y son la diferencia entre un mapa y unos puntos sobre
    # papel en blanco.
    "buildings",
    "roads",
    "sites",
    "evidence",
    "green",
    "facilities",
    "population",
    "catchments",
    # Lugares (ADR-22): lo que hace que el mapa se lea como Pereira.
    "admin_areas",
    "places",
    "waterways",
    "landmarks",
    "road_labels",
    "municipal_facilities",
    "municipal_public_space",
    "reference_regions",
    # Fotos de campo (ADR-24). En PUBLIC se filtran a las APROBADA.
    "field_photos",
)


def photo_publishable(profile: str, review_status: str) -> bool:
    """La puerta de las fotos de campo: el paquete PUBLIC solo lleva lo que
    una persona revisó (caras, placas, números de casa); INTERNAL lleva las
    pendientes con su etiqueta a la vista."""
    return profile == "INTERNAL" or review_status == "APROBADA"


class PublicationBlocked(RuntimeError):
    """Una fuente que contribuye no permite redistribucion."""


class ViewerNotBuilt(RuntimeError):
    """El visor no esta construido: falta `npm run build` en apps/viewer."""


def assert_publishable(profile: str) -> None:
    """La misma puerta que los exports, aplicada a la publicacion.

    Publicar un sitio web ES redistribuir. Saltarse aqui el control que el
    endpoint de exports aplica seria construir la puerta y dejar la ventana
    abierta: el perfil `INTERNAL` existe para el paquete que no sale de casa.
    """
    if profile == "INTERNAL":
        return
    with worker_connection() as conn, conn.cursor() as cur:
        cur.execute(
            CONTRIBUTING_SOURCES_SQL
            + """
            SELECT sr.source_id, sr.license_class::text AS license_class
            FROM rebuild_core.source_register sr
            JOIN contributing c USING (source_id)
            WHERE sr.redistribution_allowed IS DISTINCT FROM true
            ORDER BY 1
            """
        )
        blocked = [(r["source_id"], r["license_class"]) for r in cur.fetchall()]
    if blocked:
        names = ", ".join(f"{sid} ({cls})" for sid, cls in blocked)
        raise PublicationBlocked(
            f"El perfil {profile} no puede publicarse: contribuyen fuentes que no "
            f"permiten redistribucion — {names}.\n"
            "Publicar un sitio web es redistribuir. La capa de daño publicable "
            "es la de Copernicus EMS (EMSR916), no la de SERTIT."
        )


def write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"  {path.relative_to(DIST)}  {path.stat().st_size / 1024:.0f} KB")


def main(profile: str) -> int:
    print(f"perfil de publicacion: {profile}")
    assert_publishable(profile)

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    if not (VIEWER_DIST / "index.html").exists():
        raise ViewerNotBuilt(
            f"No existe {VIEWER_DIST / 'index.html'}.\n"
            "El visor se construye antes de empaquetar:\n"
            "  cd apps/viewer && npm ci && npm run build"
        )

    print("copiando el visor construido")
    shutil.copytree(VIEWER_DIST, DIST, dirs_exist_ok=True)

    # El modo estatico se activa desde el HTML publicado, no con una bandera en
    # el codigo: el mismo bundle sirve para ambos despliegues. Se inyecta justo
    # despues de `<head>` y no junto a una etiqueta concreta porque los assets
    # llevan hash en el nombre y cambian en cada build.
    index_path = DIST / "index.html"
    index = index_path.read_text(encoding="utf-8")
    if "<head>" not in index:
        raise ViewerNotBuilt(
            "El index.html del visor no tiene <head>: no se puede inyectar el modo estatico."
        )
    index = index.replace(
        "<head>",
        '<head>\n    <script>window.URI_STATIC_BASE = "data";</script>',
        1,
    )
    index_path.write_text(index, encoding="utf-8")

    data = DIST / "data"
    client = TestClient(app)

    print("volcando datos")
    sites = client.get("/api/v1/sites").json()
    write(data / "sites.json", sites)

    details = {}
    for site in sites["sites"]:
        detail = client.get(f"/api/v1/sites/{site['site_id']}").json()
        detail["photos"] = [
            p for p in detail.get("photos", []) if photo_publishable(profile, p["review_status"])
        ]
        details[site["site_id"]] = detail
    write(data / "details.json", details)

    # Las oportunidades son la entidad central del producto: la vista las
    # consume sin saber que la poblacion viene del DANE, el dano de Copernicus
    # y la red peatonal de OSM.
    write(data / "opportunities.json", client.get("/api/v1/opportunities").json())

    write(data / "sources.json", client.get("/api/v1/data-sources").json())
    write(data / "alerts.json", client.get("/api/v1/quality/alerts").json())

    published_photos: list[dict] = []
    for layer in LAYERS:
        response = client.get(f"/api/v1/geojson/{layer}")
        if response.status_code != 200:
            continue
        payload = response.json()
        if layer == "field_photos":
            payload["features"] = [
                f
                for f in payload["features"]
                if photo_publishable(profile, f["properties"]["review_status"])
            ]
            published_photos = payload["features"]
        write(data / "geojson" / f"{layer}.json", payload)

    print("precalculando escenarios")
    scenarios = []
    for mmm in BUDGETS_MMM:
        scenario = client.post(
            "/api/v1/scenarios",
            json={"name": f"Presupuesto {mmm} MM COP", "budget_cop": mmm * 1e9},
        ).json()
        scenarios.append(scenario)
        print(f"  {mmm} MM COP → {len(scenario['items'])} proyectos")
    write(data / "scenarios.json", scenarios)

    # La cobertura del relieve 3D: que celdas alcanza cada escenario y cual
    # es el aporte marginal de cada proyecto. Sin backend no se puede pedir
    # bajo demanda, asi que se vuelca junto al escenario que la produjo.
    print("volcando cobertura")
    coverage = {}
    for scenario in scenarios:
        response = client.get(f"/api/v1/scenarios/{scenario['scenario_id']}/coverage")
        response.raise_for_status()
        coverage[scenario["scenario_id"]] = response.json()
    write(data / "coverage.json", coverage)

    # ¿Dónde estamos? Se vuelca DESPUES de los escenarios para que el conteo
    # de proyectos del ultimo escenario exista.
    write(data / "territory.json", client.get("/api/v1/territory").json())

    # Las vistas Sentinel van versionadas en el repositorio, no se descargan
    # aqui. Es el mismo criterio que con el extracto de OSM: atar cada
    # despliegue a que CDSE este en pie ese dia ya fallo una vez con Overpass.
    # Un checkout sin ellas sigue construyendo; el visor no pinta la capa.
    # El terreno: 10 teselas Terrain-RGB y su indice. Versionadas por el
    # mismo motivo que las vistas — atar cada despliegue a que CDSE responda
    # ese dia ya fallo una vez con Overpass.
    terreno = ROOT / "data" / "terrain"
    if (terreno / "terrain.json").exists():
        # Solo las teselas y el indice. `copytree` a secas se llevaba tambien
        # `.cog/`, el GeoTIFF de origen de 43 MB, y multiplicaba por diez el
        # peso del sitio publicado sin que nadie lo pidiera.
        destino = data / "terrain"
        destino.mkdir(parents=True, exist_ok=True)
        shutil.copy2(terreno / "terrain.json", destino / "terrain.json")
        n = 0
        for tesela in sorted(terreno.glob("[0-9]*/*/*.png")):
            salida = destino / tesela.relative_to(terreno)
            salida.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(tesela, salida)
            n += 1
        print(f"terreno: {n} teselas")
    else:
        print("terreno: sin teselas versionadas — el relieve no se publica")

    previews = ROOT / "data" / "sentinel" / "previews.json"
    if previews.exists():
        destino = data / "sentinel"
        destino.mkdir(parents=True, exist_ok=True)
        shutil.copy2(previews, destino / "previews.json")
        indice = json.loads(previews.read_text(encoding="utf-8"))
        for escena in indice["scenes"]:
            familia = "sentinel1" if escena["collection"] == "sentinel-1-grd" else "sentinel2"
            origen = ROOT / "data" / "sentinel" / familia / escena["window"].lower()
            shutil.copy2(origen / escena["file"], destino / escena["file"])
        print(f"vistas Sentinel: {len(indice['scenes'])} imagenes")
    else:
        print("vistas Sentinel: ninguna versionada — la capa no se publica")

    # Cartografia base (ADR-22 §8): el extracto vectorial de OSM y su indice.
    # GitHub Pages responde a `Range`, que es lo unico que PMTiles necesita.
    basemap = ROOT / "data" / "basemap"
    if (basemap / "basemap.json").exists():
        destino = data / "basemap"
        destino.mkdir(parents=True, exist_ok=True)
        for archivo in ("basemap.json", "pereira_basemap.pmtiles"):
            if (basemap / archivo).exists():
                shutil.copy2(basemap / archivo, destino / archivo)
        print("cartografia base: extracto PMTiles copiado")
    else:
        print("cartografia base: sin extracto — el mapa de calles no se publica")

    # Fotos de campo (ADR-24): solo las imagenes de las observaciones que
    # pasaron la puerta de arriba, desde `data/field/<uuid>/`.
    campo = ROOT / "data" / "field"
    copiadas = 0
    for feature in published_photos:
        origen = campo / feature["id"]
        if not (origen / "full.jpg").exists():
            continue
        destino = data / "field" / feature["id"]
        destino.mkdir(parents=True, exist_ok=True)
        for archivo in ("full.jpg", "thumb.jpg"):
            if (origen / archivo).exists():
                shutil.copy2(origen / archivo, destino / archivo)
        copiadas += 1
    print(f"fotos de campo ({profile}): {copiadas} de {len(published_photos)} publicables copiadas")

    # Ortofotos (ADR-22 §6): solo las de `data/ortofoto/<fuente>/`, que es
    # donde `fetch_ortofoto.py` escribe cuando el registro dice que la fuente
    # se puede redistribuir. El sandbox no se mira. La comprobacion contra el
    # registro se repite aqui a proposito: una carpeta movida a mano no
    # convierte una fuente UNCLEAR en publicable.
    from uri.ingestion.adapters import ortofoto as ortofoto_adapter

    for source in ortofoto_adapter.SOURCES:
        origen = ortofoto_adapter.DATA / source.source_id
        if not (origen / "ortofoto.json").exists():
            continue
        if not ortofoto_adapter.is_publishable(source.source_id):
            print(f"ortofoto {source.source_id}: en disco pero NO redistribuible — no se publica")
            continue
        destino = data / "ortofoto" / source.source_id
        n = 0
        for tesela in sorted(origen.glob("[0-9]*/*/*.*")):
            salida = destino / tesela.relative_to(origen)
            salida.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(tesela, salida)
            n += 1
        shutil.copy2(origen / "ortofoto.json", destino / "ortofoto.json")
        print(f"ortofoto {source.source_id}: {n} teselas")

    total = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
    print(f"\ndist/ listo — {total / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--profile",
        default="PUBLIC",
        choices=("PUBLIC", "INSTITUTIONAL", "INTERNAL"),
        help="PUBLIC aplica la puerta de licencia; INTERNAL la omite (paquete local)",
    )
    args = parser.parse_args()
    try:
        raise SystemExit(main(args.profile))
    except PublicationBlocked as exc:
        print(f"\nBLOQUEADO\n{exc}", file=sys.stderr)
        raise SystemExit(2) from exc
    except ViewerNotBuilt as exc:
        print(f"\nVISOR SIN CONSTRUIR\n{exc}", file=sys.stderr)
        raise SystemExit(3) from exc
