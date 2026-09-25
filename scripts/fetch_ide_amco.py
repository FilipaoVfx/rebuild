#!/usr/bin/env python3
"""POT de Pereira desde IDE AMCO, con puerta, y su cruce con los sitios (ADR-26).

    scripts/fetch_ide_amco.py                       # descarga + informe
    scripts/fetch_ide_amco.py --dry-run             # solo las consultas
    scripts/fetch_ide_amco.py --offline             # informe con lo ya descargado
    scripts/fetch_ide_amco.py --sites ruta/sites.json

Mientras `ide_amco` siga en UNCLEAR todo va a `data/ide_amco/.sandbox/`: las
capas, su índice de procedencia y el informe por sitio. Nada de eso se
versiona, se sirve ni se empaqueta. El informe responde en local lo que la
ficha publicada todavía no puede decir: qué dice el POT de cada sitio y qué
saldría de la viabilidad con el criterio en borrador.

Los sitios se leen del paquete estático (`dist/data/geojson/sites.json`, lo
que produce `build_static.py`): es la geometría que ya se publica. No hace
falta la base.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import textwrap
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from uri.constraints import pot  # noqa: E402
from uri.contracts.enums import InterventionType  # noqa: E402
from uri.ingestion.adapters import ide_amco  # noqa: E402
from uri.ingestion.loader import PEREIRA_BBOX  # noqa: E402
from uri.ingestion.registry import SOURCES_BY_ID  # noqa: E402
from uri.opportunities.feasibility import check_land_use, check_risk  # noqa: E402

DEFAULT_SITES = ROOT / "dist" / "data" / "geojson" / "sites.json"
ADR = "docs/adr/ADR-26-el-pot-se-lee-de-ide-amco-con-criterio-declarado.md"


def descargar(out: Path, *, dry_run: bool, offline: bool) -> dict[str, dict]:
    capas: dict[str, dict] = {}
    indice = []
    for layer in ide_amco.LAYERS:
        url = ide_amco.getfeature_url(layer, PEREIRA_BBOX)
        destino = out / f"{layer.key}.geojson"
        print(f"   {layer.type_name}")
        if dry_run:
            print(f"      {url}")
            continue
        if offline:
            if not destino.exists():
                raise SystemExit(f"--offline: falta {destino.relative_to(ROOT)}")
            payload = json.loads(destino.read_text(encoding="utf-8"))
        else:
            payload = ide_amco.fetch_json(url)
            ide_amco.check_collection(payload, PEREIRA_BBOX)
            destino.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            indice.append(
                {
                    "layer": layer.key,
                    "type_name": layer.type_name,
                    "description": layer.description,
                    "query": url,
                    "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
                    "features": len(payload.get("features", [])),
                    "sha256": hashlib.sha256(destino.read_bytes()).hexdigest(),
                }
            )
        print(f"      {len(payload.get('features', []))} rasgos en el AOI")
        capas[layer.key] = payload
    if indice:
        fila = SOURCES_BY_ID[ide_amco.SOURCE_ID]
        (out / "index.json").write_text(
            json.dumps(
                {
                    "source_id": ide_amco.SOURCE_ID,
                    "license_class": fila.license_class.value,
                    "publishable": ide_amco.is_publishable(),
                    "aoi_bbox": list(PEREIRA_BBOX),
                    "decision": ADR,
                    "layers": indice,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    return capas


def informe(capas: dict[str, dict], sites_path: Path, out: Path) -> None:
    sitios = [
        (f["properties"]["site_id"], f["geometry"])
        for f in json.loads(sites_path.read_text(encoding="utf-8"))["features"]
    ]

    def zonas(key: str) -> list:
        return ide_amco.parse_zones(capas[key], municipio=ide_amco.LAYERS_BY_KEY[key].municipio)

    atributos = ide_amco.site_attributes(
        sitios,
        sectors=ide_amco.parse_sectors(capas["sectores_normativos"]),
        zones=zonas("microzonificacion_sismica") + zonas("microzonificacion_sismica_dosquebradas"),
        zones_alt=zonas("microzonificacion_sismica_alterna"),
    )

    filas = []
    veredictos: dict[str, Counter] = {t.value: Counter() for t in InterventionType}
    for site_id, attrs in sorted(atributos.items()):
        uso = {t.value: check_land_use(attrs, t) for t in InterventionType}
        riesgo = check_risk(attrs, InterventionType.PARK)
        for tipo, check in uso.items():
            veredictos[tipo][check.status.value] += 1
        filas.append(
            {
                "site_id": site_id,
                **attrs,
                "land_use": {
                    t: {"status": c.status.value, "detail": c.detail} for t, c in uso.items()
                },
                "risk": {"status": riesgo.status.value, "detail": riesgo.detail},
            }
        )

    total = len(atributos)
    con_sector = [a["pot_sector"] for a in atributos.values() if a["pot_sector"]]
    con_zona = [a["pot_zona_sismica"] for a in atributos.values() if a["pot_zona_sismica"]]
    sin_pot = sorted(
        f"{s} ({a['pot_municipio'] or 'sin municipio'})"
        for s, a in atributos.items()
        if not a["pot_sector"]
    )
    partidos = sum(1 for s in con_sector if s["cobertura"] < 0.95)
    discrepan = sum(1 for z in con_zona if z["zona_alterna"] and z["zona_alterna"] != z["zona"])

    resumen = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sites": total,
        "sites_source": str(sites_path),
        "criterio": pot.ESTADO_CRITERIO,
        "con_sector_normativo": len(con_sector),
        "sin_pot": sin_pot,
        "sitios_entre_dos_sectores": partidos,
        "actividad": Counter(s["actividad"] for s in con_sector),
        "tratamiento": Counter(s["subtratamiento"] or s["tratamiento"] for s in con_sector),
        "con_zona_sismica": len(con_zona),
        "zona": Counter(f"{z['municipio']} {z['zona']}" for z in con_zona),
        "zona_discrepa_entre_versiones": discrepan,
        "veredicto_por_intervencion": veredictos,
    }
    (out / "informe.json").write_text(
        json.dumps({"resumen": resumen, "sitios": filas}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    origen = sites_path.relative_to(ROOT) if sites_path.is_relative_to(ROOT) else sites_path
    print(f"\n   Sitios: {total} ({origen})")
    print(
        f"   Con sector normativo: {len(con_sector)} · sin POT: {', '.join(sin_pot) or 'ninguno'}"
    )
    print(f"   Entre dos sectores (<95 % en el dominante): {partidos}")
    print(
        "   Actividad:   " + " · ".join(f"{k} {v}" for k, v in resumen["actividad"].most_common())
    )
    print(
        "   Tratamiento: " + " · ".join(f"{k} {v}" for k, v in resumen["tratamiento"].most_common())
    )
    print(
        f"   Con zona sísmica: {len(con_zona)} · "
        + " · ".join(f"{k} {v}" for k, v in resumen["zona"].most_common())
    )
    print(f"   La zona discrepa entre las dos versiones publicadas en {discrepan} sitios")
    print(f"\n   Compatibilidad con el POT (criterio {pot.ESTADO_CRITERIO}):")
    for tipo, cuenta in veredictos.items():
        print(f"      {tipo:<20} " + " · ".join(f"{k} {v}" for k, v in sorted(cuenta.items())))
    print(f"\n   Informe: {(out / 'informe.json').relative_to(ROOT)}")


def main(*, dry_run: bool, offline: bool, sites: Path) -> int:
    fila = SOURCES_BY_ID[ide_amco.SOURCE_ID]
    out = ide_amco.output_dir()
    print(fila.display_name)
    if ide_amco.is_publishable():
        print(f"   destino: {out.relative_to(ROOT)} (publicable)")
    else:
        print(
            f"   destino: {out.relative_to(ROOT)} (SANDBOX — la fuente está en "
            f"{fila.license_class.value}; no se publica)"
        )
        print("   qué lo desbloquea:")
        for linea in textwrap.wrap(fila.verification_notes or "", width=90):
            print(f"      {linea}")
    if not dry_run:
        out.mkdir(parents=True, exist_ok=True)

    capas = descargar(out, dry_run=dry_run, offline=offline)
    if dry_run:
        print("\n--dry-run: no se descarga nada")
        return 0
    if not sites.exists():
        print(f"\n   sin sitios en {sites}: capas descargadas, informe omitido")
        return 0
    informe(capas, sites, out)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--offline", action="store_true", help="usa las capas ya descargadas")
    parser.add_argument("--sites", type=Path, default=DEFAULT_SITES)
    args = parser.parse_args()
    raise SystemExit(main(dry_run=args.dry_run, offline=args.offline, sites=args.sites))
