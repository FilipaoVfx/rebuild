#!/usr/bin/env python3
"""Genera el paquete estático del visor para GitHub Pages.

GitHub Pages sirve archivos, no procesos: no hay optimizador que correr ni
consultas que filtrar. El paquete vuelca lo que la API devolveria y el visor
lo consume en modo estatico.

Dos consecuencias que el propio visor declara en pantalla:

- Los escenarios van PRECALCULADOS a presupuestos fijos. Pedir uno distinto
  devuelve el mas cercano y lo dice, en lugar de fingir que optimizo.
- Los exportes no estan: la puerta de licencia por perfil (fuentes.md §6) es
  logica de servidor, y publicarla como descarga estatica la eliminaria.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from fastapi.testclient import TestClient  # noqa: E402

from uri.api.app import app  # noqa: E402

VIEWER = ROOT / "apps" / "viewer"
DIST = ROOT / "dist"

#: Presupuestos precalculados, en miles de millones de COP.
BUDGETS_MMM = (10, 25, 50, 100)

LAYERS = ("sites", "evidence", "green", "facilities", "risk", "population", "catchments")


def write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"  {path.relative_to(DIST)}  {path.stat().st_size / 1024:.0f} KB")


def main() -> int:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    print("copiando el visor")
    for name in ("index.html", "styles.css", "app.js"):
        shutil.copy2(VIEWER / name, DIST / name)
    shutil.copytree(VIEWER / "vendor", DIST / "vendor")

    # El modo estatico se activa desde el HTML publicado, no con una bandera
    # en el codigo: el mismo app.js sirve para ambos despliegues.
    index = (DIST / "index.html").read_text(encoding="utf-8")
    index = index.replace(
        '<script src="vendor/maplibre-gl.js"></script>',
        '<script>window.URI_STATIC_BASE = "data";</script>\n'
        '<script src="vendor/maplibre-gl.js"></script>',
    )
    (DIST / "index.html").write_text(index, encoding="utf-8")

    data = DIST / "data"
    client = TestClient(app)

    print("volcando datos")
    sites = client.get("/api/v1/sites").json()
    write(data / "sites.json", sites)

    details = {}
    for site in sites["sites"]:
        details[site["site_id"]] = client.get(f"/api/v1/sites/{site['site_id']}").json()
    write(data / "details.json", details)

    write(data / "sources.json", client.get("/api/v1/data-sources").json())
    write(data / "alerts.json", client.get("/api/v1/quality/alerts").json())

    for layer in LAYERS:
        response = client.get(f"/api/v1/geojson/{layer}")
        if response.status_code == 200:
            write(data / "geojson" / f"{layer}.json", response.json())

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

    total = sum(f.stat().st_size for f in DIST.rglob("*") if f.is_file())
    print(f"\ndist/ listo — {total / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
