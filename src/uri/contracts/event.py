"""El evento, declarado una sola vez (ADR-22).

Los hechos del sismo se citan de su fuente oficial en vez de escribirse en
cada panel. Citar no es redistribuir (fuentes.md §3): esto es una afirmacion
factual con su referencia, no una capa.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class SeismicEvent:
    event_id: str
    magnitude: float
    magnitude_type: str
    occurred_at: str
    depth_km: float
    epicentre_lon: float
    epicentre_lat: float
    epicentre_label: str
    activation_id: str
    activation_url: str
    source: str
    source_url: str
    retrieved_at: str
    #: Copernicus EMS activo la cartografia rapida sobre 409 municipios.
    municipalities_affected: int

    def distance_km(self, lon: float, lat: float) -> float:
        """Distancia de gran circulo al epicentro, redondeada al kilometro."""
        r = 6371.0088
        phi1, phi2 = math.radians(self.epicentre_lat), math.radians(lat)
        dphi = phi2 - phi1
        dlmb = math.radians(lon - self.epicentre_lon)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
        return round(2 * r * math.asin(math.sqrt(a)))


#: Ficha USGS leida el 2026-09-18: "M 7.4 - 2 km SE of San José del Palmar,
#: Colombia", origen 2026-08-10T12:34:28Z, 4.8836 N / 76.2182 W, 108 km de
#: profundidad, magnitud Mww. La activacion EMSR916 es la fuente del dano.
EVENT = SeismicEvent(
    event_id="us6000tjl2",
    magnitude=7.4,
    magnitude_type="Mww",
    occurred_at="2026-08-10T12:34:28Z",
    depth_km=108.2,
    epicentre_lon=-76.2182,
    epicentre_lat=4.8836,
    epicentre_label="2 km al sureste de San José del Palmar, Chocó",
    activation_id="EMSR916",
    activation_url="https://mapping.emergency.copernicus.eu/activations/EMSR916",
    source="USGS Earthquake Hazards Program",
    source_url="https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2",
    retrieved_at="2026-09-18",
    municipalities_affected=409,
)
