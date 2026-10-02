#!/usr/bin/env python3
"""Datos derivados de la película "por qué" (public/porque.json).

- Año de urbanización (WSF Evolution, DLR, 30 m, CC BY 4.0) en el centroide de
  cada huella de Microsoft y de cada observación de daño de Copernicus EMS.
  Es el año en que el suelo aparece urbanizado (1985 = en 1985 o antes), no el
  año de construcción de cada edificio.
- Censo DANE 2018 por manzana, agregado a una malla de 300 m: la película no
  publica manzanas sueltas (FR-PII-03). Solo celdas con 100 personas o más.

    python3 prepare_data.py --wsf WSFevolution_v1_-76_4.tif --data <paquete>/data
    # la tesela: https://download.geoservice.dlr.de/WSF_EVO/files/WSFevolution_v1_-76_4.tif
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path

import tifffile

AOI = (-75.7251, 4.7878, -75.6748, 4.8229)
CENSO = Path(__file__).resolve().parents[2] / "db" / "seed" / "dane_censo2018_manzanas_pereira.json.gz"


def main(a: argparse.Namespace) -> None:
    img = tifffile.TiffFile(a.wsf)
    page = img.pages[0]
    x0, y0 = page.tags[33922].value[3], page.tags[33922].value[4]
    px = page.tags[33550].value[0]
    arr = page.asarray()

    def year(lon: float, lat: float) -> int:
        return int(arr[int((y0 - lat) / px), int((lon - x0) / px)])

    ring = lambda g: g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
    cen = lambda r: (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
    inside = lambda x, y: AOI[0] <= x <= AOI[2] and AOI[1] <= y <= AOI[3]
    geo = Path(a.data) / "geojson"

    bld = json.loads((geo / "buildings.json").read_text())["features"]
    years = [year(*cen(ring(f["geometry"]))) for f in bld]
    in_aoi = [inside(*cen(ring(f["geometry"]))) for f in bld]
    ys = [y for y, i in zip(years, in_aoi) if i and y]

    ev = json.loads((geo / "evidence.json").read_text())["features"]
    ev_years = [year(*f["geometry"]["coordinates"]) for f in ev]
    ev_known = [y for y in ev_years if y]

    # Censo a malla de 300 m.
    mx = 111_320 * math.cos(math.radians((AOI[1] + AOI[3]) / 2))
    my = 110_540
    step = 300
    cells: dict[tuple[int, int], list[float]] = defaultdict(lambda: [0, 0, 0, 0.0, 0])
    groups = defaultdict(lambda: [0, 0, 0])
    for f in json.load(gzip.open(CENSO))["features"]:
        x, y = cen(ring(f["geometry"]))
        p = f["properties"]
        if not inside(x, y) or p.get("SEXO_TOTAL") is None:
            continue
        tot, kids, old = p["SEXO_TOTAL"] or 0, (p["EDAD_0_4"] or 0) + (p["EDAD_5_9"] or 0), p["TOTAL_MAYORES_70"] or 0
        k = (int((x - AOI[0]) * mx // step), int((y - AOI[1]) * my // step))
        c = cells[k]
        c[0] += tot; c[1] += kids; c[2] += old
        yr = year(x, y)
        if yr:
            c[3] += yr * tot; c[4] += tot
            g = "antes_1985" if yr <= 1985 else ("1986_1999" if yr < 2000 else "2000_2015")
            groups[g][0] += tot; groups[g][1] += kids; groups[g][2] += old
    grid = []
    for (i, j), (tot, kids, old, ysum, yw) in cells.items():
        if tot < 100:
            continue
        lon = AOI[0] + (i + 0.5) * step / mx
        lat = AOI[1] + (j + 0.5) * step / my
        grid.append({"lon": round(lon, 6), "lat": round(lat, 6), "personas": tot, "ninos_0_9": kids,
                     "mayores_70": old, "anio_medio": round(ysum / yw) if yw else None})

    stats = {
        "edificios_en_sector": sum(in_aoi),
        "edificios_con_anio": len(ys),
        "edificios_urbanizado_hasta_1985": round(sum(y <= 1985 for y in ys) / len(ys), 4),
        "edificios_urbanizado_hasta_1995": round(sum(y <= 1995 for y in ys) / len(ys), 4),
        "observaciones_dano": len(ev),
        "observaciones_con_anio": len(ev_known),
        "dano_urbanizado_hasta_1985": round(sum(y <= 1985 for y in ev_known) / len(ev_known), 4),
        "censo_por_epoca": {
            g: {"personas": v[0], "ninos_0_9": v[1], "mayores_70": v[2],
                "mayores_70_por_10_ninos": round(10 * v[2] / v[1], 1)}
            for g, v in groups.items()
        },
    }
    out = {
        "fuentes": {
            "epoca": "World Settlement Footprint Evolution, DLR, 30 m, CC BY 4.0 — año en que el suelo aparece urbanizado (1985 = en 1985 o antes)",
            "censo": "DANE, Censo Nacional de Población y Vivienda 2018, agregado a malla de 300 m",
        },
        "stats": stats,
        "anio_edificio": years,
        "anio_dano": ev_years,
        "censo_malla_300m": grid,
    }
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    print("celdas de censo:", len(grid))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--wsf", required=True)
    p.add_argument("--data", required=True)
    p.add_argument("--out", default=str(Path(__file__).parent / "public" / "porque.json"))
    main(p.parse_args())
