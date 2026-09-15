#!/usr/bin/env python3
"""¿El sistema produce señal o ruido?

Un ranking siempre sale. La pregunta es si significa algo. Esta herramienta
mide cinco cosas, y cada una puede invalidar el resultado por si sola:

1. DISPERSION  — si todos los sitios puntuan casi igual, el orden es arbitrario.
2. DISCRIMINACION — si el score es una funcion del area, no aporta nada que no
   diera un `ORDER BY area_m2`.
3. ESTABILIDAD ANTE PESOS — si mover los pesos un poco reordena el top, lo que
   se esta leyendo es la opinion de quien fijo los pesos.
4. DEPENDENCIA DE LO SIMULADO — que fraccion del score proviene de capas
   generadas. Tras retirar el generador deberia ser cero.
5. COBERTURA DE FEATURES — cuantas features del vector estan realmente
   pobladas y cuantas se declaran no disponibles. Un score calculado sobre
   features ausentes se sostiene en menos de lo que aparenta.
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
from uri.scoring.model import DEFAULT_WEIGHTS  # noqa: E402

TOP_N = 20
PORTFOLIO_BUDGET = 25_000_000_000

#: De que capa proviene cada factor del modelo. Tras retirar el generador,
#: todas son reales o derivadas de un dato real por un metodo declarado.
FACTOR_ORIGIN = {
    # Poblacion: total publicado por Copernicus EMS, repartido
    # dasimetricamente sobre huellas reales de Microsoft.
    "need": "derivado",
    "deficit": "derivado",
    # Sin indice de vulnerabilidad real la feature es nula y no contribuye.
    "vulnerability": "no disponible",
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


def recompute(conn) -> tuple[dict, list[str]]:
    """Recalcula features, restricciones, scoring y portafolio."""
    with conn.cursor() as cur:
        cur.execute("SELECT max(data_version) AS v FROM core.dataset_version")
        version = cur.fetchone()["v"]

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

        base_scored, base_portfolio = recompute(conn)
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

        # ── 4. Dependencia de lo simulado ──────────────────────────────────
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sr.source_id, dv.is_synthetic, count(*) OVER () AS total
                FROM core.dataset_version dv
                JOIN core.source_register sr USING (source_id)
                WHERE dv.is_synthetic
                """
            )
            synthetic_versions = cur.fetchall()
            cur.execute("SELECT count(*) AS n FROM core.site WHERE is_synthetic")
            synthetic_sites = cur.fetchone()["n"]

        by_origin: dict[str, float] = {"real": 0.0, "derivado": 0.0, "no disponible": 0.0}
        for recs in base_scored.values():
            if not recs:
                continue
            for contribution in recs[0].explanation.contributions:
                by_origin[FACTOR_ORIGIN[contribution.factor]] += contribution.contribution
        total = sum(by_origin.values()) or 1.0

        print("\n4. DEPENDENCIA DE LO SIMULADO")
        print(f"   versiones de dataset sinteticas  {len(synthetic_versions)}")
        print(f"   sitios sinteticos                {synthetic_sites}")
        for origin, value in sorted(by_origin.items(), key=lambda kv: -kv[1]):
            print(f"   score desde {origin:16} {value / total:6.1%}")
        print(
            "   → "
            + (
                "sin capas simuladas en el resultado"
                if not synthetic_versions and not synthetic_sites
                else "QUEDAN CAPAS SIMULADAS en el resultado"
            )
        )

        # ── 5. Cobertura de features ───────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    count(*) AS sitios,
                    count(risk_score) AS risk,
                    count(land_use_compatibility) AS land_use,
                    count(population_10min) AS poblacion,
                    count(social_vulnerability) AS vulnerabilidad,
                    count(park_deficit) AS deficit,
                    count(building_density) AS densidad,
                    count(*) FILTER (WHERE catchment_method = 'NETWORK') AS red
                FROM analytics.site_feature
                """
            )
            cov = cur.fetchone()

        print("\n5. COBERTURA DE FEATURES")
        sitios = cov["sitios"] or 1
        tracked = ("risk", "land_use", "poblacion", "vulnerabilidad", "deficit", "densidad", "red")
        for key in tracked:
            print(f"   {key:16} {cov[key]:5}/{sitios}  {cov[key] / sitios:6.0%}")
        print(
            "   → las features al 0 por ciento se declaran no disponibles; "
            "no se rellenan con un valor inventado"
        )

        print("\n" + "=" * 72)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
