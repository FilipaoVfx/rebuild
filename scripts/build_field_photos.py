#!/usr/bin/env python3
"""Fotos de campo de pereiramap en el paquete estático, enlazadas al daño (ADR-24).

    URI_FIELD_URL=https://<proyecto>.supabase.co URI_FIELD_KEY=<clave publicable> \\
        scripts/build_field_photos.py --data dist/data

Lee la vista pública `pereiramap_observacion_publica` y copia **solo las
APROBADAS** (la revisión humana filtra caras, placas y números de casa). Cada
imagen se descarga y se comprueba contra su `image_sha256`: si no coincide, la
foto no entra. Escribe `field_photos.json` y `field/<id>/{full,thumb}.jpg`.

El enlace a los sitios de daño (regla `campo-v2`, ADR-24 §6) es espacial y
conservador. La posición es la del teléfono, no la del edificio: el operador
fotografía desde la calle, a una distancia, y el GPS tiene error. Por eso:

- La distancia es al **polígono** del sitio (0 si el teléfono está dentro), no
  a su centro.
- La incertidumbre efectiva es la mayor entre la precisión que reporta el
  teléfono y el desacuerdo entre el GPS del teléfono y el de la foto
  (`exif_device_offset_m`): cuando las dos fuentes discrepan 40 m, la
  precisión de 3 m que dice el teléfono no es creíble.
- `LINKED` exige el sitio a ≤ 75 m (`LINK_M`) y que ningún otro esté dentro
  del margen `max(20 m, 2 × incertidumbre)`. Si otro lo está: `AMBIGUOUS`, con
  los dos candidatos a la vista. Nunca se elige en silencio.
- Con rumbo de cámara, el sitio tiene que caer dentro del encuadre (campo de
  visión horizontal de 70°, más el ángulo que abre la incertidumbre). Un sitio
  cercano pero a espaldas de la cámara no es lo fotografiado.
- Fuera del sector de estudio no hay observación de Copernicus con qué
  cruzar: `UNLINKED` con esa razón, no un enlace forzado al sitio del borde.
- `UNLINKED` en la categoría de daño es información: daño que el satélite no
  registró.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import urllib.request
from pathlib import Path

LINK_M = 75.0
MARGIN_MIN_M = 20.0
FOV_DEG = 70.0
METHOD = "campo-v2"
VIEW = "pereiramap_observacion_publica"
FIELDS = (
    "observation_id,captured_at,category,damage_visible,observed_feature_type,accessibility,"
    "lat,lon,accuracy_m,location_source,heading_deg,exif_gps,exif_device_offset_m,"
    "image_path,thumb_path,image_sha256,width,height,review_status"
)


# ── Geometría en metros, alrededor del sector ───────────────────────────


class Proj:
    def __init__(self, lat0: float) -> None:
        self.mx = 111_320.0 * math.cos(math.radians(lat0))
        self.my = 110_540.0

    def xy(self, lon: float, lat: float) -> tuple[float, float]:
        return lon * self.mx, lat * self.my

    def lonlat(self, x: float, y: float) -> tuple[float, float]:
        return round(x / self.mx, 7), round(y / self.my, 7)


def _seg_dist(p, a, b) -> tuple[float, tuple[float, float]]:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    t = (
        0.0
        if dx == dy == 0
        else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    )
    q = (ax + t * dx, ay + t * dy)
    return math.hypot(px - q[0], py - q[1]), q


def _inside(p, ring) -> bool:
    x, y = p
    ins = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


def polygon_distance(p, ring) -> tuple[float, tuple[float, float]]:
    """Distancia del punto al polígono (0 dentro) y el punto más cercano."""
    if _inside(p, ring):
        return 0.0, p
    best = (math.inf, p)
    for i in range(len(ring) - 1):
        best = min(best, _seg_dist(p, ring[i], ring[i + 1]), key=lambda r: r[0])
    return best


def bearing(p, q) -> float:
    """Rumbo de p a q en grados desde el norte, horario (x este, y norte)."""
    return math.degrees(math.atan2(q[0] - p[0], q[1] - p[1])) % 360


def angle_diff(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


# ── Enlace ──────────────────────────────────────────────────────────────


def uncertainty(obs: dict) -> float:
    acc = float(obs.get("accuracy_m") or 0)
    off = float(obs.get("exif_device_offset_m") or 0)
    return max(acc, off, 1.0)


def link(obs: dict, sites: list[dict], proj: Proj, aoi: tuple[float, float, float, float]) -> dict:
    """El enlace de una foto a los sitios, con su rastro completo."""
    lon, lat = float(obs["lon"]), float(obs["lat"])
    u = uncertainty(obs)
    margin = max(MARGIN_MIN_M, 2 * u)
    base = {
        "method": METHOD,
        "link_max_m": LINK_M,
        "uncertainty_m": round(u, 1),
        "margin_m": round(margin, 1),
        "heading_deg": obs.get("heading_deg"),
    }
    if not (aoi[0] <= lon <= aoi[2] and aoi[1] <= lat <= aoi[3]):
        return {
            **base,
            "status": "UNLINKED",
            "reason": "OUTSIDE_STUDY_AREA",
            "site_id": None,
            "candidates": [],
        }

    p = proj.xy(lon, lat)
    h = obs.get("heading_deg")
    cands = []
    for s in sites:
        d, q = polygon_distance(p, s["ring"])
        if d > LINK_M + margin:
            continue
        # El punto del polígono que da la distancia: el visor dibuja la medida.
        # 0 solo si está dentro: 4 cm fuera no se redondea a «dentro».
        dist = 0.0 if d == 0 else max(0.1, round(d, 1))
        c = {"site_id": s["site_id"], "distance_m": dist, "nearest": proj.lonlat(*q)}
        if h is not None and d > 0:
            off = angle_diff(float(h), bearing(p, q))
            tol = FOV_DEG / 2 + math.degrees(math.atan2(u, max(d, 1.0)))
            c["off_axis_deg"] = round(off, 1)
            c["in_view"] = off <= tol
        elif h is not None:
            c["off_axis_deg"] = 0.0
            c["in_view"] = True
        cands.append(c)
    cands.sort(key=lambda c: c["distance_m"])

    # Con rumbo, solo cuenta lo que cae en el encuadre; sin él, todo.
    visible = [c for c in cands if c.get("in_view")] if h is not None else cands
    # Solo puede ganar un sitio a <= LINK_M; pero rival es cualquiera dentro
    # del margen, aunque pase de LINK_M: si la incertidumbre lo alcanza, es
    # igual de plausible que el ganador.
    pool = [c for c in visible if c["distance_m"] <= LINK_M]
    if not pool:
        reason = (
            "NO_SITE_IN_VIEW"
            if (h is not None and any(c["distance_m"] <= LINK_M for c in cands))
            else "NO_SITE_WITHIN_RANGE"
        )
        return {
            **base,
            "status": "UNLINKED",
            "reason": reason,
            "site_id": None,
            "candidates": cands[:3],
        }

    best = pool[0]
    rivals = [
        c for c in visible if c is not best and c["distance_m"] <= best["distance_m"] + margin
    ]
    if rivals:
        return {
            **base,
            "status": "AMBIGUOUS",
            "reason": "RUNNER_UP_WITHIN_MARGIN",
            "site_id": None,
            "runner_up_distance_m": rivals[0]["distance_m"],
            "candidates": [best, *rivals][:3],
        }
    nxt = next((c for c in cands if c["site_id"] != best["site_id"]), None)
    return {
        **base,
        "status": "LINKED",
        "reason": "HEADING_CONFIRMED" if h is not None else "NEAREST_WITHIN_RANGE",
        "site_id": best["site_id"],
        "distance_m": best["distance_m"],
        "runner_up_distance_m": nxt["distance_m"] if nxt else None,
        "candidates": cands[:3],
    }


def nearest_evidence(obs: dict, evidence: list[dict], proj: Proj) -> dict | None:
    p = proj.xy(float(obs["lon"]), float(obs["lat"]))
    best = None
    for e in evidence:
        d = math.dist(p, e["xy"])
        if best is None or d < best["distance_m"]:
            best = {"damage_class": e["damage_class"], "distance_m": round(d, 1)}
    return best


# ── Entrada y salida ────────────────────────────────────────────────────


def fetch(url: str, key: str, path: str) -> bytes:
    req = urllib.request.Request(
        f"{url}{path}", headers={"apikey": key, "Authorization": f"Bearer {key}"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def load_sites(data: Path, proj: Proj) -> list[dict]:
    out = []
    for f in json.loads((data / "geojson" / "sites.json").read_text())["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        # Un anillo exterior y nada más: medir solo a una parte de un sitio
        # con varias, o ignorar un hueco, daría distancias falsas.
        if len(polys) != 1 or len(polys[0]) != 1:
            raise SystemExit(f"{f['properties']['site_id']}: geometría con varias partes o huecos")
        ring = polys[0][0]
        out.append(
            {"site_id": f["properties"]["site_id"], "ring": [proj.xy(x, y) for x, y in ring]}
        )
    return out


def load_evidence(data: Path, proj: Proj) -> list[dict]:
    return [
        {"xy": proj.xy(*f["geometry"]["coordinates"]), "damage_class": f["properties"]["label"]}
        for f in json.loads((data / "geojson" / "evidence.json").read_text())["features"]
    ]


def main(a: argparse.Namespace) -> int:
    url, key = os.environ.get("URI_FIELD_URL"), os.environ.get("URI_FIELD_KEY")
    data = Path(a.data)
    if not url or not key:
        print("sin URI_FIELD_URL/URI_FIELD_KEY: la fuente no está; no se publica foto (ADR-24)")
        return 0
    aoi = tuple(json.loads((data / "territory.json").read_text())["aoi"]["bbox"])
    proj = Proj((aoi[1] + aoi[3]) / 2)
    sites = load_sites(data, proj)
    evidence = load_evidence(data, proj)

    rows = json.loads(
        fetch(
            url, key, f"/rest/v1/{VIEW}?select={FIELDS}&review_status=eq.APROBADA&order=captured_at"
        )
    )
    photos, skipped = [], []
    for r in rows:
        if r.get("review_status") != "APROBADA":
            continue
        oid = r["observation_id"]
        full = fetch(url, key, f"/storage/v1/object/public/field-photos/{r['image_path']}")
        if hashlib.sha256(full).hexdigest() != r["image_sha256"]:
            skipped.append({"observation_id": oid, "reason": "SHA256_MISMATCH"})
            continue
        thumb = fetch(url, key, f"/storage/v1/object/public/field-photos/{r['thumb_path']}")
        out = data / "field" / oid
        out.mkdir(parents=True, exist_ok=True)
        (out / "full.jpg").write_bytes(full)
        (out / "thumb.jpg").write_bytes(thumb)
        photos.append(
            {
                "observation_id": oid,
                "captured_at": r["captured_at"],
                "category": r["category"],
                "damage_visible": r["damage_visible"],
                "observed_feature_type": r["observed_feature_type"],
                "accessibility": r["accessibility"],
                "lon": round(float(r["lon"]), 7),
                "lat": round(float(r["lat"]), 7),
                "accuracy_m": r["accuracy_m"],
                "location_source": r["location_source"],
                "exif_device_offset_m": r["exif_device_offset_m"],
                "image": f"field/{oid}/full.jpg",
                "thumb": f"field/{oid}/thumb.jpg",
                "image_sha256": r["image_sha256"],
                "width": r["width"],
                "height": r["height"],
                "match": link(r, sites, proj, aoi),
                "nearest_evidence": nearest_evidence(r, evidence, proj),
            }
        )

    status = {}
    for p in photos:
        status[p["match"]["status"]] = status.get(p["match"]["status"], 0) + 1
    payload = {
        "source_id": "pereiramap",
        "attribution": "Fotos de campo — pereiramap (colaboradores), CC BY 4.0",
        "method": METHOD,
        "rule": {
            "link_max_m": LINK_M,
            "margin_min_m": MARGIN_MIN_M,
            "fov_deg": FOV_DEG,
            "uncertainty": "max(accuracy_m, exif_device_offset_m)",
            "distance": "al polígono del sitio (0 dentro)",
        },
        "published": len(photos),
        "skipped": skipped,
        "status": status,
        "photos": photos,
    }
    (data / "field_photos.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    print(
        json.dumps(
            {"published": len(photos), "skipped": skipped, "status": status}, ensure_ascii=False
        )
    )
    for p in photos:
        m = p["match"]
        cands = [(c["site_id"], c["distance_m"], c.get("in_view")) for c in m["candidates"]]
        print(
            f"  {p['observation_id'][:8]} {m['status']:<9} {m['reason']:<22} "
            f"sitio={m['site_id'] or '—':<10} d={m.get('distance_m', '—')} "
            f"2º={m.get('runner_up_distance_m', '—')} u={m['uncertainty_m']} "
            f"rumbo={m['heading_deg']} cands={cands}"
        )
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--data", required=True, help="carpeta data/ del paquete estático")
    sys.exit(main(ap.parse_args()))
