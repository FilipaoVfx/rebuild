"""Capas de contexto derivadas de fuentes reales.

Sustituyen al generador sintético. Ninguna inventa un valor: cada una toma un
dato publicado y declara qué transformación se le aplicó, que es lo que
`FR-FEAT-06` exige para la imputación poblacional y lo que hace la diferencia
entre un dato derivado y uno simulado.
"""

from __future__ import annotations

import gzip
import json
import math
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BuildingFootprint:
    wkt: str
    area_m2: float
    lon: float
    lat: float


@dataclass(frozen=True)
class PopulationCell:
    wkt: str
    population: float
    households: float
    building_area_m2: float


#: Personas por hogar. DANE reporta ~3,2 para cabeceras del Eje Cafetero.
#: Es un parámetro declarado, no una estimación oculta.
PERSONS_PER_HOUSEHOLD = 3.2

#: Lado de la celda de la malla de población, en metros.
CELL_SIZE_M = 150.0


def _load(path: Path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def _meters_per_degree(lat: float) -> tuple[float, float]:
    return 111_320.0 * math.cos(math.radians(lat)), 110_540.0


def _polygon_area_m2(ring: list, lat0: float) -> float:
    mx, my = _meters_per_degree(lat0)
    pts = [(p[0] * mx, p[1] * my) for p in ring]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    area = sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1))
    return abs(area) / 2.0


def load_building_footprints(path: Path) -> list[BuildingFootprint]:
    """Huellas de edificación de Microsoft Building Footprints.

    Datos reales derivados de imagen satelital, publicados por Microsoft para
    uso abierto. Sustituyen al proxy de densidad construida que se calculaba
    contando segmentos de vía.
    """
    out: list[BuildingFootprint] = []
    for feature in _load(path)["features"]:
        ring = feature["geometry"]["coordinates"][0]
        lon = sum(p[0] for p in ring) / len(ring)
        lat = sum(p[1] for p in ring) / len(ring)
        inner = ", ".join(f"{p[0]} {p[1]}" for p in ring)
        out.append(
            BuildingFootprint(
                wkt=f"POLYGON(({inner}))",
                area_m2=_polygon_area_m2(ring, lat),
                lon=lon,
                lat=lat,
            )
        )
    return out


def dasymetric_population(
    footprints: list[BuildingFootprint],
    bbox: tuple[float, float, float, float],
    *,
    total_population: float,
) -> tuple[list[PopulationCell], dict]:
    """Distribuye una población total conocida sobre huellas reales.

    Esto NO es una capa simulada: el total es un dato publicado y las huellas
    son observaciones. Lo que se declara es el método — reparto proporcional
    al área construida de cada celda — que es exactamente lo que `FR-FEAT-06`
    pide nombrar en cada respuesta.

    Su limitación, que viaja en el manifiesto y no en una nota al pie: reparte
    por superficie construida, así que sobreestima donde hay naves o bodegas e
    infraestima donde hay edificios altos. Sustituirlo por manzanas del DANE
    cuando estén disponibles cambia este módulo y nada más.
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    mx, my = _meters_per_degree((min_lat + max_lat) / 2)
    dlon, dlat = CELL_SIZE_M / mx, CELL_SIZE_M / my

    buckets: dict[tuple[int, int], float] = {}
    for footprint in footprints:
        ix = int((footprint.lon - min_lon) / dlon)
        iy = int((footprint.lat - min_lat) / dlat)
        buckets[(ix, iy)] = buckets.get((ix, iy), 0.0) + footprint.area_m2

    total_area = sum(buckets.values())
    if total_area <= 0:
        return [], {"method": "dasymetric_building_area", "cells": 0}

    cells: list[PopulationCell] = []
    for (ix, iy), area in buckets.items():
        lon = min_lon + ix * dlon
        lat = min_lat + iy * dlat
        ring = [
            (lon, lat),
            (lon + dlon, lat),
            (lon + dlon, lat + dlat),
            (lon, lat + dlat),
            (lon, lat),
        ]
        share = area / total_area
        population = total_population * share
        cells.append(
            PopulationCell(
                wkt="POLYGON((" + ", ".join(f"{x} {y}" for x, y in ring) + "))",
                population=round(population, 2),
                households=round(population / PERSONS_PER_HOUSEHOLD, 2),
                building_area_m2=round(area, 1),
            )
        )

    manifest = {
        "method": "dasymetric_building_area",
        "description": (
            "Población total publicada, repartida proporcionalmente al área de "
            "huella construida de Microsoft Building Footprints en cada celda."
        ),
        "total_population": total_population,
        "persons_per_household": PERSONS_PER_HOUSEHOLD,
        "cell_size_m": CELL_SIZE_M,
        "cells": len(cells),
        "footprints": len(footprints),
        "built_area_m2": round(total_area, 1),
        "limitation": (
            "Reparte por superficie construida: sobreestima donde hay naves o "
            "bodegas e infraestima donde hay edificios altos. Sustituir por "
            "manzanas censales del DANE cuando estén disponibles (OI-F4)."
        ),
    }
    return cells, manifest


def load_seismic_hazard(path: Path) -> dict:
    """Amenaza sísmica del SGC para Pereira.

    Es **un punto por municipio**: un valor de PGA para toda la ciudad, sin
    variación intraurbana. No es una limitación del adaptador, es lo que el
    SGC publica — la microzonificación de Pereira no existe como capa (D6).

    La consecuencia importa y no se esconde: con un riesgo constante, la
    restricción dura de riesgo prohibido no discrimina entre sitios. El
    sistema lo declara en lugar de fabricar una variación que nadie observó.
    """
    feature = _load(path)["features"][0]
    props = feature["properties"]
    # PGA con periodo de retorno de 475 años, el de referencia de la NSR-10.
    pga_475 = float(props.get("PGA475") or 0)
    return {
        "municipality": props.get("NOMMUN"),
        "department": props.get("NOMDEPTO"),
        # El servicio entrega PGA en cm/s²; se normaliza a g contra un techo
        # de 500 cm/s², por encima del cual la amenaza ya es la máxima de la
        # escala nacional.
        "pga_475_cms2": pga_475,
        "risk_score": round(min(1.0, pga_475 / 500.0), 4),
        "spatial_resolution": "municipio",
        "has_intraurban_variation": False,
    }


#: Usos de suelo de OSM que sirven como proxy del POT mientras IDE AMCO no sea
#: alcanzable. Es dato real con una limitación declarada, no una simulación.
OSM_LANDUSE_COMPATIBILITY: dict[str, float] = {
    "grass": 1.0,
    "meadow": 1.0,
    "forest": 1.0,
    "recreation_ground": 1.0,
    "village_green": 1.0,
    "cemetery": 0.3,
    "residential": 0.6,
    "retail": 0.4,
    "commercial": 0.4,
    "industrial": 0.15,
    "railway": 0.1,
    "construction": 0.5,
    "education": 0.8,
    "institutional": 0.8,
    "brownfield": 0.9,
    "greenfield": 0.9,
    "farmland": 0.7,
}
