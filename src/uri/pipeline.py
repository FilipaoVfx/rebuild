"""Orquestacion del pipeline (ARD §5.1).

    ingest -> validate -> version -> features -> constraints -> candidates
           -> score -> explain -> optimize

El orden es estructural, no una convencion de nombres: `score_candidates`
recibe el conjunto de candidatos que produce `apply_constraints`, y no tiene
forma de ver los sitios excluidos.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import psycopg

from uri.constraints import CONSTRAINT_SET_V1, evaluate_constraints
from uri.contracts import InterventionType
from uri.features.engine import compute_features
from uri.features.network import build_pedestrian_graph, compute_catchments
from uri.ingestion import loader
from uri.optimizer.greedy import Candidate, PortfolioResult, select_portfolio
from uri.scoring import score_site
from uri.scoring.model import SCORING_VERSION

FEATURE_VERSION = "features_v1"


@dataclass
class PipelineReport:
    versions: dict[str, int]
    counts: dict[str, int]
    alerts: list[str]


def run_ingestion(conn: psycopg.Connection, *, osm_path: Path) -> PipelineReport:
    """Ingesta completa sobre fuentes reales.

    Ya no hay parametro de daño sintetico ni semilla: el generador esta
    retirado y la base rechaza una fila simulada (migracion 006).
    """
    from uri.ingestion.adapters import copernicus

    loader.register_sources(conn)

    seed = loader.SEED / "copernicus_emsr916_aoi02.json.gz"
    evidence = copernicus.load_damage(seed)
    damage_version = loader.load_damage_evidence(conn, evidence, source_id="copernicus_ems")
    osm_version, osm_counts = loader.load_osm(conn, osm_path)
    context_version, context_counts = loader.load_context_layers(conn)
    # Censo 2018 del DANE por manzana. Va ANTES de las features porque
    # `social_vulnerability` lo lee: cargarlo despues dejaria la feature nula
    # una corrida mas y el fallo pasaria por "el DANE no alcanza".
    census_version, census_blocks = loader.load_census_blocks(conn)

    sites = loader.derive_sites(conn, damage_version)
    fused = loader.fuse_damage_evidence(conn, as_of=date(2026, 9, 15))
    alerts = loader.raise_coverage_alerts(conn)

    return PipelineReport(
        versions={
            "damage": damage_version,
            "osm": osm_version,
            "context": context_version,
            "census": census_version,
        },
        counts={
            "evidence": len(evidence),
            "sites": sites,
            "fused": fused,
            **osm_counts,
            **context_counts,
            "census_blocks": census_blocks,
        },
        alerts=alerts,
    )


def run_features(conn: psycopg.Connection, *, data_version: int) -> dict[str, int]:
    graph = build_pedestrian_graph(conn)
    catchments = compute_catchments(conn, feature_version=FEATURE_VERSION)
    features = compute_features(conn, feature_version=FEATURE_VERSION, data_version=data_version)
    return {**graph, **catchments, "features": features}


def apply_constraints(
    conn: psycopg.Connection, *, constraint_set=CONSTRAINT_SET_V1
) -> dict[str, int]:
    """FR-CONS-01 — esto corre ANTES del scoring y decide quien entra."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO rebuild_core.constraint_set (constraint_set_version, definition) "
            "VALUES (%s, %s::jsonb) ON CONFLICT (constraint_set_version) DO NOTHING",
            (
                constraint_set.version,
                json.dumps(
                    {
                        "min_site_area_m2": constraint_set.min_site_area_m2,
                        "max_risk_score": constraint_set.max_risk_score,
                        "prohibited_risk_threshold": constraint_set.prohibited_risk_threshold,
                        "min_land_use_compatibility": constraint_set.min_land_use_compatibility,
                        "soft": constraint_set.soft,
                    }
                ),
            ),
        )
        cur.execute(
            "DELETE FROM rebuild_analytics.site_exclusion WHERE constraint_set_version = %s",
            (constraint_set.version,),
        )
        cur.execute(
            "SELECT * FROM rebuild_analytics.site_feature WHERE feature_version = %s",
            (FEATURE_VERSION,),
        )
        rows = cur.fetchall()

        excluded = 0
        for row in rows:
            exclusions = evaluate_constraints(row, constraint_set)
            if not exclusions:
                continue
            excluded += 1
            for exclusion in exclusions:
                cur.execute(
                    "INSERT INTO rebuild_analytics.site_exclusion "
                    "(site_id, constraint_set_version, "
                    "constraint_id, reason, is_prohibited_risk) VALUES (%s, %s, %s, %s, %s)",
                    (
                        row["site_id"],
                        constraint_set.version,
                        exclusion.constraint_id,
                        exclusion.reason,
                        exclusion.is_prohibited_risk,
                    ),
                )

        cur.execute(
            """
            UPDATE rebuild_core.site s SET state = CASE
                WHEN EXISTS (SELECT 1 FROM rebuild_analytics.site_exclusion x
                              WHERE x.site_id = s.site_id
                                AND x.constraint_set_version = %s)
                THEN 'EXCLUDED'::rebuild_core.site_state
                ELSE 'CANDIDATE'::rebuild_core.site_state
            END
            WHERE s.state IN ('EVALUATED', 'EXCLUDED', 'CANDIDATE')
            """,
            (constraint_set.version,),
        )
        cur.execute("SELECT count(*) AS n FROM rebuild_core.site WHERE state = 'CANDIDATE'")
        candidates = cur.fetchone()["n"]

    return {"excluded": excluded, "candidates": candidates}


def candidate_features(conn: psycopg.Connection) -> list[dict]:
    """El conjunto de candidatos. Es lo unico que el scoring llega a ver."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.*, s.state, s.area_m2, s.evidence_count,
                   fu.damage_class, fu.damage_confidence, fu.independent_sources,
                   fu.contributing_sources, fu.agreement_ratio
            FROM rebuild_analytics.site_feature f
            JOIN rebuild_core.site s USING (site_id)
            LEFT JOIN rebuild_core.site_damage_fusion fu USING (site_id)
            WHERE f.feature_version = %s AND s.state = 'CANDIDATE'
            ORDER BY f.site_id
            """,
            (FEATURE_VERSION,),
        )
        return cur.fetchall()


def hash_candidate_set(rows: list[dict]) -> tuple[str, str]:
    """ADR-06 — ancla de reproducibilidad.

    El hash convierte D1 de una promesa en algo comprobable: al re-ejecutar
    un escenario, una discrepancia es un error visible y nunca un recalculo
    silencioso.
    """
    candidate_digest = hashlib.sha256()
    matrix_digest = hashlib.sha256()
    for row in sorted(rows, key=lambda r: r["site_id"]):
        candidate_digest.update(row["site_id"].encode())
        matrix_digest.update(
            json.dumps(
                {
                    key: (float(value) if isinstance(value, (int, float)) else str(value))
                    for key, value in sorted(row.items())
                    if key
                    in {
                        "site_id",
                        "risk_score",
                        "land_use_compatibility",
                        "site_area",
                        "population_10min",
                        "park_deficit",
                        "social_vulnerability",
                        "pedestrian_accessibility",
                    }
                },
                sort_keys=True,
            ).encode()
        )
    return candidate_digest.hexdigest(), matrix_digest.hexdigest()


def score_candidates(
    rows: list[dict],
    *,
    weights: dict[str, float] | None = None,
    allowed: list[InterventionType] | None = None,
) -> dict[str, list]:
    return {row["site_id"]: score_site(row, weights=weights, allowed=allowed) for row in rows}


def build_candidates_for_optimizer(
    conn: psycopg.Connection, scored: dict[str, list]
) -> list[Candidate]:
    """Traduce recomendaciones a candidatos con su cobertura poblacional.

    Las celdas de poblacion son el mecanismo de redundancia: dos sitios que
    alcanzan las mismas celdas comparten identificadores, y el optimizador
    lo ve sin necesidad de una penalizacion explicita.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.site_id, p.cell_id, p.population, p.vulnerability
            FROM rebuild_analytics.site_catchment c
            JOIN rebuild_core.population_cell p ON ST_Intersects(p.geometry, c.geometry)
            WHERE c.minutes = 10 AND c.feature_version = %s
            """,
            (FEATURE_VERSION,),
        )
        coverage: dict[str, dict[int, float]] = {}
        vulnerability: dict[str, list[float]] = {}
        for row in cur.fetchall():
            coverage.setdefault(row["site_id"], {})[row["cell_id"]] = float(row["population"])
            vulnerability.setdefault(row["site_id"], []).append(float(row["vulnerability"]))

    out: list[Candidate] = []
    for site_id, recommendations in scored.items():
        buildable = [r for r in recommendations if r.intervention is not InterventionType.NO_BUILD]
        if not buildable:
            continue
        best = buildable[0]
        cells = coverage.get(site_id, {})
        if not cells:
            continue
        vulns = vulnerability.get(site_id, [0.5])
        out.append(
            Candidate(
                site_id=site_id,
                intervention=best.intervention,
                score=best.score,
                cost_cop=best.cost_cop,
                population_cells=cells,
                vulnerability=sum(vulns) / len(vulns),
            )
        )
    return out


def baseline_public_space_access(conn: psycopg.Connection) -> dict[int, float]:
    """Acceso a espacio publico que cada celda ya tiene, antes de intervenir.

    Es el "antes" de FR-SCEN-06. Sin el, la equidad post-intervencion es un
    numero sin referencia.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.cell_id,
                   COALESCE(sum(ST_Area(ST_Transform(g.geometry, 3116))), 0)
                       / NULLIF(p.population, 0) AS m2_per_capita
            FROM rebuild_core.population_cell p
            LEFT JOIN rebuild_osm_raw.green_space g
                   ON ST_DWithin(ST_Transform(g.geometry, 3116),
                                 ST_Transform(p.geometry, 3116), 800)
            GROUP BY p.cell_id, p.population
            """
        )
        return {row["cell_id"]: float(row["m2_per_capita"] or 0.0) for row in cur.fetchall()}


def optimize(
    candidates: list[Candidate],
    *,
    budget: float,
    max_projects: int | None = None,
    baseline_access: dict[int, float] | None = None,
) -> PortfolioResult:
    return select_portfolio(
        candidates, budget=budget, max_projects=max_projects, baseline_access=baseline_access
    )


SCORING = SCORING_VERSION
