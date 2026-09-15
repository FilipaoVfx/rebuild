#!/usr/bin/env python3
"""Ejecuta el pipeline completo: ingesta -> features -> restricciones -> score -> optimizacion."""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from uri import pipeline  # noqa: E402
from uri.db import worker_connection  # noqa: E402

RAW = ROOT / "data" / "raw"
SEED = ROOT / "db" / "seed"


def osm_extract() -> Path:
    """El extracto archivado manda; `data/raw/` solo si alguien lo puso ahí."""
    for candidate in (SEED / "osm_pereira.json.gz", RAW / "osm_pereira.json"):
        if candidate.exists():
            return candidate
    raise SystemExit(
        "No se encontró el extracto de OSM. Debería estar versionado en "
        f"{SEED / 'osm_pereira.json.gz'} — ver db/seed/README.md"
    )


def main() -> int:
    started = time.time()
    with worker_connection() as conn:
        print("== ingesta ==")
        report = pipeline.run_ingestion(conn, osm_path=osm_extract())
        conn.commit()
        print(f"   versiones: {report.versions}")
        print(f"   conteos  : {report.counts}")
        for alert in report.alerts:
            print(f"   [alerta] {alert}")

        print("== features (grafo peatonal + catchments de red) ==")
        t0 = time.time()
        stats = pipeline.run_features(conn, data_version=report.versions["damage"])
        conn.commit()
        print(f"   {stats}  ({time.time() - t0:.1f}s)")

        print("== restricciones duras (antes del scoring) ==")
        constraint_stats = pipeline.apply_constraints(conn)
        conn.commit()
        print(f"   {constraint_stats}")

        print("== scoring ==")
        rows = pipeline.candidate_features(conn)
        scored = pipeline.score_candidates(rows)
        candidate_hash, matrix_hash = pipeline.hash_candidate_set(rows)
        print(f"   candidatos puntuados: {len(scored)}")
        print(f"   hash candidatos: {candidate_hash[:16]}…  matriz: {matrix_hash[:16]}…")

        top = sorted(
            ((sid, recs[0]) for sid, recs in scored.items() if recs),
            key=lambda kv: kv[1].score,
            reverse=True,
        )[:5]
        for site_id, rec in top:
            exp = rec.explanation
            print(
                f"   {site_id}  {rec.intervention.value:<20} {rec.score:6.2f}  "
                f"suma_ok={exp.sums_to_score(1e-6)}  drivers={exp.drivers_positive}"
            )
            if exp.counterfactual:
                print(f"      contrafactual: {exp.counterfactual.note}")

        print("== optimizacion de portafolio ==")
        candidates = pipeline.build_candidates_for_optimizer(conn, scored)
        baseline = pipeline.baseline_public_space_access(conn)
        result = pipeline.optimize(candidates, budget=25_000_000_000, baseline_access=baseline)
        print(
            f"   seleccionados={len(result.items)} de {result.considered}  "
            f"costo={result.total_cost / 1e9:.2f}B  poblacion={result.total_population:.0f}"
        )
        for item in result.items[:6]:
            print(
                f"   #{item.rank} {item.site_id} {item.intervention.value:<20} "
                f"marginal={item.marginal_population:8.0f}  redundancia={item.redundancy_ratio:.2%}"
            )
        print(f"   equidad antes={result.equity_before}  despues={result.equity_after}")

    print(f"\ntotal {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
