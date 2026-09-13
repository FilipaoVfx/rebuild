#!/usr/bin/env python3
"""¿El sistema produce señal o ruido?

Un ranking siempre sale. La pregunta es si significa algo. Esta herramienta
mide cinco cosas, y cada una puede invalidar el resultado por si sola:

1. DISPERSION  — si todos los sitios puntuan casi igual, el orden es arbitrario.
2. DISCRIMINACION — si el score es una funcion del area, no aporta nada que no
   diera un `ORDER BY area_m2`.
3. ESTABILIDAD ANTE PESOS — si mover los pesos un poco reordena el top, lo que
   se esta leyendo es la opinion de quien fijo los pesos.
4. ESTABILIDAD ANTE LA SEMILLA — el examen decisivo. Se regeneran las capas
   sinteticas con otra semilla y se recalcula todo. Si el portafolio cambia,
   el sistema esta describiendo la simulacion y no el territorio.
5. DEPENDENCIA DE LO SINTETICO — que fraccion del score proviene de features
   derivadas de capas simuladas.
"""

from __future__ import annotations

import random
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from uri import pipeline  # noqa: E402
from uri.db import worker_connection  # noqa: E402
from uri.ingestion import loader  # noqa: E402
from uri.scoring.model import DEFAULT_WEIGHTS  # noqa: E402
from uri.settings import settings  # noqa: E402

TOP_N = 20
PORTFOLIO_BUDGET = 25_000_000_000

#: De que capa proviene cada factor del modelo. `deficit` es mixto: el area
#: verde es real (OSM) pero se divide por poblacion simulada.
FACTOR_ORIGIN = {
    "need": "sintetico",
    "deficit": "mixto",
    "vulnerability": "sintetico",
    "accessibility": "real",
    "facility_gap": "real",
}


def top_sites(scored: dict, n: int = TOP_N) -> list[str]:
    ranked = sorted(
        ((sid, recs[0].score) for sid, recs in scored.items() if recs),
        key=lambda kv: kv[1],
        reverse=True,
    )
    return [sid for sid, _ in ranked[:n]]


def overlap(a: list[str], b: list[str]) -> float:
    return len(set(a) & set(b)) / len(a) if a else 0.0


def run_with_seed(conn, seed: int) -> tuple[dict, list[str]]:
    """Regenera las capas sinteticas con `seed` y recalcula todo aguas abajo."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM core.population_cell")
        cur.execute("DELETE FROM core.risk_zone")
        cur.execute("DELETE FROM core.land_use")
    version, _ = loader.load_synthetic_layers(conn, seed)
    conn.commit()

    pipeline.run_features(conn, data_version=version)
    pipeline.apply_constraints(conn)
    conn.commit()

    rows = pipeline.candidate_features(conn)
    scored = pipeline.score_candidates(rows)
    candidates = pipeline.build_candidates_for_optimizer(conn, scored)
    baseline = pipeline.baseline_public_space_access(conn)
    portfolio = pipeline.optimize(candidates, budget=PORTFOLIO_BUDGET, baseline_access=baseline)
    return scored, [item.site_id for item in portfolio.items]


def main() -> int:
    rng = random.Random(7)
    with worker_connection() as conn:
        print("=" * 72)
        print("DIAGNOSTICO DE SEÑAL")
        print("=" * 72)

        base_scored, base_portfolio = run_with_seed(conn, settings.synthetic_seed)
        rows = {r["site_id"]: r for r in pipeline.candidate_features(conn)}
        base_top = top_sites(base_scored)

        # ── 1. Dispersion ──────────────────────────────────────────────────
        scores = [recs[0].score for recs in base_scored.values() if recs]
        spread = max(scores) - min(scores)
        print(f"\n1. DISPERSION  ({len(scores)} candidatos)")
        print(f"   rango {min(scores):.1f} – {max(scores):.1f}   amplitud {spread:.1f}")
        print(f"   media {statistics.mean(scores):.1f}   desv {statistics.pstdev(scores):.1f}")
        quartiles = statistics.quantiles(scores, n=4)
        print(f"   cuartiles {quartiles[0]:.1f} / {quartiles[1]:.1f} / {quartiles[2]:.1f}")
        veredicto_1 = "separa" if statistics.pstdev(scores) > 5 else "NO separa"
        print(f"   → el modelo {veredicto_1} los sitios entre si")

        # ── 2. Discriminacion: ¿es el score una funcion del area? ──────────
        pairs = [
            (float(rows[sid]["site_area"]), recs[0].score)
            for sid, recs in base_scored.items()
            if recs and sid in rows
        ]
        areas = [p[0] for p in pairs]
        vals = [p[1] for p in pairs]
        corr_area = statistics.correlation(areas, vals) if len(pairs) > 2 else 0.0
        pobl = [float(rows[sid]["population_10min"]) for sid in base_scored if sid in rows]
        corr_pop = statistics.correlation(pobl, vals) if len(pairs) > 2 else 0.0
        print("\n2. DISCRIMINACION")
        print(f"   correlacion score~area      {corr_area:+.3f}")
        print(f"   correlacion score~poblacion {corr_pop:+.3f}")
        print(
            "   → "
            + (
                "el score es casi el area: no aporta"
                if abs(corr_area) > 0.8
                else "el score no es un proxy del area"
            )
        )

        # ── 3. Estabilidad ante los pesos ──────────────────────────────────
        overlaps = []
        for _ in range(12):
            perturbed = {k: max(0.0, v * rng.uniform(0.8, 1.2)) for k, v in DEFAULT_WEIGHTS.items()}
            total = sum(perturbed.values())
            perturbed = {k: v / total for k, v in perturbed.items()}
            alt = pipeline.score_candidates(list(rows.values()), weights=perturbed)
            overlaps.append(overlap(base_top, top_sites(alt)))
        print(f"\n3. ESTABILIDAD ANTE LOS PESOS  (±20%, 12 perturbaciones, top-{TOP_N})")
        print(f"   solapamiento medio {statistics.mean(overlaps):.0%}   minimo {min(overlaps):.0%}")
        print(
            "   → "
            + (
                "el top es estable frente a la eleccion de pesos"
                if statistics.mean(overlaps) > 0.8
                else "el top DEPENDE de los pesos elegidos"
            )
        )

        # ── 4. Estabilidad ante la semilla — el examen decisivo ────────────
        alt_scored, alt_portfolio = run_with_seed(conn, settings.synthetic_seed + 999)
        alt_top = top_sites(alt_scored)
        top_overlap = overlap(base_top, alt_top)
        port_overlap = overlap(base_portfolio, alt_portfolio)
        print("\n4. ESTABILIDAD ANTE LA SEMILLA SINTETICA  (el examen decisivo)")
        print(f"   solapamiento del top-{TOP_N}  {top_overlap:.0%}")
        print(f"   solapamiento del portafolio   {port_overlap:.0%}")
        print(f"   portafolio A: {base_portfolio[:6]}")
        print(f"   portafolio B: {alt_portfolio[:6]}")
        print(
            "   → "
            + (
                "el resultado sobrevive a cambiar la simulacion"
                if top_overlap > 0.7
                else "el resultado ES la simulacion: cambia con la semilla"
            )
        )

        # restaurar la semilla de trabajo
        run_with_seed(conn, settings.synthetic_seed)

        # ── 5. Dependencia de lo sintetico ─────────────────────────────────
        by_origin = {"real": 0.0, "sintetico": 0.0, "mixto": 0.0}
        for recs in base_scored.values():
            if not recs:
                continue
            for contribution in recs[0].explanation.contributions:
                by_origin[FACTOR_ORIGIN[contribution.factor]] += contribution.contribution
        total = sum(by_origin.values()) or 1.0
        print("\n5. DE DONDE VIENE EL SCORE")
        for origin, value in sorted(by_origin.items(), key=lambda kv: -kv[1]):
            print(f"   {origin:10} {value / total:6.1%}")
        synthetic_share = (by_origin["sintetico"] + by_origin["mixto"]) / total
        print(f"   → {synthetic_share:.0%} del score depende de capas simuladas")

        print("\n" + "=" * 72)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
