"""Generador sintetico de capas de contexto.

CON-01: el dataset municipal de daño no existe. En esta version tampoco
existen como capa la poblacion a nivel de manzana, la microzonificacion de
Pereira (D6) ni el POT. Este modulo las genera.

Es un componente de primera clase, no un script de fixtures (SRS §7):

- FR-SYN-01: misma semilla y mismos parametros producen salida identica.
- FR-SYN-02: estructura espacial agrupada, no ruido uniforme.
- FR-SYN-03: cada dataset generado emite su manifiesto.
- FR-SYN-04: `is_synthetic` viaja en cada fila y no admite nulo.

La trampa que este modulo crea, y que conviene tener presente: el generador
se convierte en la especificacion de como es la realidad. Los pesos del
modelo de scoring NO se ajustan mirando resultados calculados sobre estas
capas (antes-de-empezar.md §5).
"""

from __future__ import annotations

import hashlib
import json
import math
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime

CELL_SIZE_M = 150.0


@dataclass(frozen=True)
class Cell:
    wkt: str
    population: float
    households: float
    vulnerability: float


@dataclass(frozen=True)
class Zone:
    wkt: str
    level: str
    score: float


@dataclass
class GenerationManifest:
    """FR-SYN-03 — sin esto, un dataset generado es un dato sin origen."""

    seed: int
    parameters: dict
    generated_at: str
    record_counts: dict[str, int]
    distribution: dict[str, float] = field(default_factory=dict)

    def content_hash(self) -> str:
        payload = json.dumps(
            {
                "seed": self.seed,
                "parameters": self.parameters,
                "record_counts": self.record_counts,
                "distribution": self.distribution,
            },
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def as_dict(self) -> dict:
        return {
            "seed": self.seed,
            "parameters": self.parameters,
            "generated_at": self.generated_at,
            "record_counts": self.record_counts,
            "distribution": self.distribution,
            "content_hash": self.content_hash(),
        }


def _meters_per_degree(lat: float) -> tuple[float, float]:
    return 111_320.0 * math.cos(math.radians(lat)), 110_540.0


def _cell_wkt(lon: float, lat: float, dlon: float, dlat: float) -> str:
    ring = [
        (lon, lat),
        (lon + dlon, lat),
        (lon + dlon, lat + dlat),
        (lon, lat + dlat),
        (lon, lat),
    ]
    return "POLYGON((" + ", ".join(f"{x} {y}" for x, y in ring) + "))"


def _gaussian_field(
    rng: random.Random, bbox: tuple[float, float, float, float], n_centres: int
) -> list[tuple[float, float, float, float]]:
    """Centros de densidad. La estructura agrupada de FR-SYN-02 sale de aqui:
    poblacion y daño se concentran, no se reparten uniformemente."""
    min_lon, min_lat, max_lon, max_lat = bbox
    centres = []
    for _ in range(n_centres):
        centres.append(
            (
                rng.uniform(min_lon, max_lon),
                rng.uniform(min_lat, max_lat),
                rng.uniform(0.004, 0.012),  # radio en grados
                rng.uniform(0.4, 1.0),  # intensidad
            )
        )
    return centres


def _intensity(lon: float, lat: float, centres: list[tuple[float, float, float, float]]) -> float:
    total = 0.0
    for clon, clat, radius, weight in centres:
        d2 = ((lon - clon) / radius) ** 2 + ((lat - clat) / radius) ** 2
        total += weight * math.exp(-d2)
    return total


def generate_population(
    bbox: tuple[float, float, float, float], seed: int
) -> tuple[list[Cell], GenerationManifest]:
    """Malla de poblacion sintetica.

    Sustituye al DANE mientras no se resuelva a que nivel esta disponible
    (OI-F4). La vulnerabilidad se correlaciona negativamente con la densidad
    y positivamente con la distancia al centro, que es una regularidad
    urbana plausible — y, precisamente por plausible, peligrosa: si el
    modelo se afina contra ella, aprende esta suposicion y no el territorio.
    """
    rng = random.Random(seed)
    min_lon, min_lat, max_lon, max_lat = bbox
    mid_lon, mid_lat = (min_lon + max_lon) / 2, (min_lat + max_lat) / 2
    mx, my = _meters_per_degree(mid_lat)
    dlon, dlat = CELL_SIZE_M / mx, CELL_SIZE_M / my

    centres = _gaussian_field(rng, bbox, n_centres=7)
    cells: list[Cell] = []
    lat = min_lat
    while lat < max_lat:
        lon = min_lon
        while lon < max_lon:
            clon, clat = lon + dlon / 2, lat + dlat / 2
            density = _intensity(clon, clat, centres)
            population = max(0.0, density * 260.0 * rng.uniform(0.7, 1.3))
            if population >= 1.0:
                dist = math.hypot((clon - mid_lon) / 0.02, (clat - mid_lat) / 0.02)
                vulnerability = min(1.0, max(0.05, 0.25 + 0.35 * dist - 0.12 * density))
                cells.append(
                    Cell(
                        wkt=_cell_wkt(lon, lat, dlon, dlat),
                        population=round(population, 1),
                        households=round(population / 3.2, 1),
                        vulnerability=round(vulnerability, 3),
                    )
                )
            lon += dlon
        lat += dlat

    total_pop = sum(c.population for c in cells)
    manifest = GenerationManifest(
        seed=seed,
        parameters={
            "layer": "population_cell",
            "bbox": list(bbox),
            "cell_size_m": CELL_SIZE_M,
            "n_centres": 7,
            "persons_per_household": 3.2,
        },
        generated_at=datetime.now(UTC).isoformat(),
        record_counts={"cells": len(cells)},
        distribution={
            "population_total": round(total_pop, 1),
            "population_mean": round(total_pop / len(cells), 2) if cells else 0.0,
            "vulnerability_mean": (
                round(sum(c.vulnerability for c in cells) / len(cells), 3) if cells else 0.0
            ),
        },
    )
    return cells, manifest


def generate_risk_zones(
    bbox: tuple[float, float, float, float], seed: int
) -> tuple[list[Zone], GenerationManifest]:
    """Zonas de riesgo sinteticas.

    Sustituye a la microzonificacion de Pereira, que no existe como capa
    publicada (D6). Lo que el SGC sirve es amenaza nacional a escala NSR-10,
    inservible para decidir sobre un predio. Mientras esto sea sintetico,
    `risk_score` no es una evaluacion de riesgo: es un marcador de posicion
    que el sistema debe declarar en cada salida.
    """
    rng = random.Random(seed + 1)
    min_lon, min_lat, max_lon, max_lat = bbox
    mx, my = _meters_per_degree((min_lat + max_lat) / 2)
    dlon, dlat = 300.0 / mx, 300.0 / my

    centres = _gaussian_field(rng, bbox, n_centres=4)
    zones: list[Zone] = []
    lat = min_lat
    while lat < max_lat:
        lon = min_lon
        while lon < max_lon:
            intensity = _intensity(lon + dlon / 2, lat + dlat / 2, centres)
            score = min(1.0, intensity * 0.55)
            if score >= 0.75:
                level = "prohibited"
            elif score >= 0.5:
                level = "high"
            elif score >= 0.25:
                level = "medium"
            else:
                level = "low"
            zones.append(
                Zone(wkt=_cell_wkt(lon, lat, dlon, dlat), level=level, score=round(score, 3))
            )
            lon += dlon
        lat += dlat

    counts: dict[str, int] = {}
    for zone in zones:
        counts[zone.level] = counts.get(zone.level, 0) + 1

    manifest = GenerationManifest(
        seed=seed + 1,
        parameters={"layer": "risk_zone", "bbox": list(bbox), "cell_size_m": 300.0, "n_centres": 4},
        generated_at=datetime.now(UTC).isoformat(),
        record_counts={"zones": len(zones)},
        distribution={f"level_{k}": v for k, v in counts.items()},
    )
    return zones, manifest


@dataclass(frozen=True)
class SyntheticDamage:
    wkt: str
    damage_class: str
    building_type: str
    accuracy_m: float


#: Clases de daño con su peso relativo. La distribucion imita la observada en
#: Pereira por ICube-SERTIT (121 dañados / 85 posibles / 46 destruidos) sin
#: copiar ni una sola de sus geometrias.
DAMAGE_MIX = (("DAMAGED", 48), ("POSSIBLY_DAMAGED", 34), ("DESTROYED", 18))

BUILDING_TYPES = ("Residential", "Commercial", "Educational", "Industrial")


def generate_damage(
    bbox: tuple[float, float, float, float],
    seed: int,
    *,
    count: int = 260,
) -> tuple[list[SyntheticDamage], GenerationManifest]:
    """Capa de daño sintetica (FR-SYN-01..03).

    Existe por dos razones distintas. La primera es CON-01: el dataset
    municipal no existe. La segunda apareció despues — es la unica capa de
    daño que se puede PUBLICAR, porque la evidencia satelital real viene con
    `redistribution_allowed = false` y un demo publico es redistribucion.

    FR-SYN-02 pide estructura agrupada, no ruido uniforme: el daño se
    concentra alrededor de focos, como en un sismo real.
    """
    rng = random.Random(seed + 3)
    centres = _gaussian_field(rng, bbox, n_centres=5)
    min_lon, min_lat, max_lon, max_lat = bbox

    labels = [label for label, weight in DAMAGE_MIX for _ in range(weight)]
    out: list[SyntheticDamage] = []
    attempts = 0
    while len(out) < count and attempts < count * 80:
        attempts += 1
        lon = rng.uniform(min_lon, max_lon)
        lat = rng.uniform(min_lat, max_lat)
        # Rechazo por intensidad: el punto entra con probabilidad proporcional
        # a la intensidad local, que es lo que produce el agrupamiento.
        if rng.random() > min(1.0, _intensity(lon, lat, centres) / 1.2):
            continue
        out.append(
            SyntheticDamage(
                wkt=f"POINT({lon} {lat})",
                damage_class=rng.choice(labels),
                building_type=rng.choices(BUILDING_TYPES, weights=[80, 10, 6, 4])[0],
                accuracy_m=5.0,
            )
        )

    counts: dict[str, int] = {}
    for item in out:
        counts[item.damage_class] = counts.get(item.damage_class, 0) + 1

    manifest = GenerationManifest(
        seed=seed + 3,
        parameters={
            "layer": "damage_evidence",
            "bbox": list(bbox),
            "target_count": count,
            "n_centres": 5,
            "damage_mix": dict(DAMAGE_MIX),
        },
        generated_at=datetime.now(UTC).isoformat(),
        record_counts={"observations": len(out)},
        distribution={f"class_{k}": v for k, v in counts.items()},
    )
    return out, manifest


LAND_USE_CATEGORIES = ("residential", "mixed", "commercial", "institutional", "green")


def generate_land_use(
    bbox: tuple[float, float, float, float], seed: int
) -> tuple[list[Zone], GenerationManifest]:
    """Uso de suelo sintetico. Sustituye al POT mientras no se confirme si
    IDE AMCO publica servicios OGC consumibles (OI-F3)."""
    rng = random.Random(seed + 2)
    min_lon, min_lat, max_lon, max_lat = bbox
    mx, my = _meters_per_degree((min_lat + max_lat) / 2)
    dlon, dlat = 400.0 / mx, 400.0 / my

    parcels: list[Zone] = []
    lat = min_lat
    while lat < max_lat:
        lon = min_lon
        while lon < max_lon:
            category = rng.choices(LAND_USE_CATEGORIES, weights=[52, 22, 14, 7, 5])[0]
            parcels.append(Zone(wkt=_cell_wkt(lon, lat, dlon, dlat), level=category, score=0.0))
            lon += dlon
        lat += dlat

    counts: dict[str, int] = {}
    for parcel in parcels:
        counts[parcel.level] = counts.get(parcel.level, 0) + 1

    manifest = GenerationManifest(
        seed=seed + 2,
        parameters={"layer": "land_use", "bbox": list(bbox), "cell_size_m": 400.0},
        generated_at=datetime.now(UTC).isoformat(),
        record_counts={"parcels": len(parcels)},
        distribution={f"category_{k}": v for k, v in counts.items()},
    )
    return parcels, manifest
