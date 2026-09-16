"""API de Urban Recovery Intelligence (SRS §10.1).

Contrato versionado bajo `/api/v1`. Toda respuesta con score o agregado
lleva su procedencia (FR-API-02), y las capas sinteticas se declaran una por
una en lugar de con una etiqueta global (FR-SYN-05).
"""

from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.staticfiles import StaticFiles

from uri import pipeline
from uri.api import schemas
from uri.contracts import (
    CONTRIBUTING_SOURCES_SQL,
    InterventionType,
    LayerProvenance,
    Provenance,
)
from uri.contracts.enums import PROFILE_ALLOWS, ExportProfile, LicenseClass
from uri.db import api_connection, close_pool, fetch_all, fetch_one, open_pool
from uri.reporting.exports import (
    ExportBlocked,
    attribution_block,
    scenario_to_csv,
    scenario_to_geojson,
)
from uri.scoring.model import INTERVENTION_CATALOG

API_PREFIX = "/api/v1"
VIEWER_DIR = Path(__file__).resolve().parents[3] / "apps" / "viewer"


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Conectar al arrancar: si la base no esta, el proceso lo dice ahora y no
    en la primera peticion de un usuario."""
    open_pool()
    yield
    close_pool()


app = FastAPI(
    lifespan=lifespan,
    title="Urban Recovery Intelligence",
    version="0.1.0",
    description=(
        "Plataforma de soporte a decisiones de recuperacion urbana. "
        "Toda salida es consultiva: el sistema no emite decisiones vinculantes."
    ),
)


def conn_dep():
    with api_connection() as conn:
        yield conn


Conn = Annotated[object, Depends(conn_dep)]


def build_provenance(conn, *, include_constraints: bool = False) -> Provenance:
    """Procedencia del RESULTADO, no inventario de lo cargado.

    FR-API-02 pide la procedencia de lo que se esta devolviendo. Listar toda
    version de dataset que exista en la base incluye cosas que no contribuyen
    a ninguna fila —residuo de pruebas, cargas abandonadas— y convierte el
    panel de procedencia en un catalogo en lugar de una declaracion.
    """
    rows = fetch_all(
        conn,
        CONTRIBUTING_SOURCES_SQL
        + """
        SELECT DISTINCT ON (sr.source_id)
               sr.source_id, sr.display_name, sr.license_class, sr.attribution_text,
               dv.data_version, dv.is_synthetic, dv.retrieved_at
        FROM rebuild_core.dataset_version dv
        JOIN rebuild_core.source_register sr USING (source_id)
        WHERE sr.source_id IN (SELECT source_id FROM contributing)
        ORDER BY sr.source_id, dv.data_version DESC
        """,
    )
    layers = [
        LayerProvenance(
            layer=row["display_name"],
            source_id=row["source_id"],
            is_synthetic=row["is_synthetic"],
            license_class=row["license_class"],
            attribution=row["attribution_text"],
            retrieved_at=row["retrieved_at"],
        )
        for row in rows
    ]
    max_version = max((row["data_version"] for row in rows), default=0)
    return Provenance(
        data_version=max_version,
        feature_version=pipeline.FEATURE_VERSION,
        constraint_set_version="constraints_v1" if include_constraints else None,
        scoring_version=pipeline.SCORING,
        # FR-SYN-04: basta una capa sintetica para que el resultado lo sea.
        is_synthetic=any(layer.is_synthetic for layer in layers),
        layers=layers,
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get(f"{API_PREFIX}/sites", response_model=schemas.SiteListResponse)
def list_sites(
    conn: Conn,
    bbox: str | None = Query(None, description="min_lon,min_lat,max_lon,max_lat"),
    state: str | None = None,
    min_score: float | None = None,
    max_risk: float | None = None,
    intervention: str | None = None,
    limit: int = Query(500, le=2000),
) -> schemas.SiteListResponse:
    where = ["f.feature_version = %(fv)s"]
    params: dict = {"fv": pipeline.FEATURE_VERSION, "limit": limit}

    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
        except ValueError as exc:
            raise HTTPException(422, "bbox debe ser min_lon,min_lat,max_lon,max_lat") from exc
        # NFR-PERF-02: el predicado de bbox con indice GIST no es negociable.
        where.append(
            "s.geometry && ST_MakeEnvelope(%(min_lon)s, %(min_lat)s, "
            "%(max_lon)s, %(max_lat)s, 4326)"
        )
        params |= {"min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat}
    if state:
        where.append("s.state = %(state)s::rebuild_core.site_state")
        params["state"] = state
    if max_risk is not None:
        where.append("f.risk_score <= %(max_risk)s")
        params["max_risk"] = max_risk

    rows = fetch_all(
        conn,
        f"""
        SELECT s.site_id, s.state::text, s.area_m2, s.area_is_estimated, s.evidence_count,
               ST_X(s.centroid) AS lon, ST_Y(s.centroid) AS lat,
               fu.damage_class::text AS damage_class, fu.damage_confidence,
               fu.independent_sources,
               f.confidence, f.catchment_method::text AS catchment_method,
               f.population_10min, f.park_deficit, f.social_vulnerability,
               f.risk_score, f.land_use_compatibility, f.pedestrian_accessibility,
               f.households_10min, f.park_area_per_capita, f.building_density,
               f.school_access, f.health_access, f.community_access, f.site_area
        FROM rebuild_core.site s
        JOIN rebuild_analytics.site_feature f USING (site_id)
        LEFT JOIN rebuild_core.site_damage_fusion fu USING (site_id)
        WHERE {" AND ".join(where)}
        ORDER BY s.site_id
        LIMIT %(limit)s
        """,  # noqa: S608 - fragmentos de WHERE construidos desde una lista fija
        params,
    )

    allowed = [InterventionType(intervention)] if intervention else None
    summaries: list[schemas.SiteSummary] = []
    for row in rows:
        top_intervention = top_label = top_score = None
        if row["state"] == "CANDIDATE":
            recommendations = pipeline.score_candidates([row], allowed=allowed).get(
                row["site_id"], []
            )
            buildable = [
                r for r in recommendations if r.intervention is not InterventionType.NO_BUILD
            ]
            if buildable:
                top_intervention = buildable[0].intervention.value
                top_label = INTERVENTION_CATALOG[buildable[0].intervention]["display_name"]
                top_score = buildable[0].score
        if min_score is not None and (top_score is None or top_score < min_score):
            continue
        summaries.append(
            schemas.SiteSummary(
                **{k: row[k] for k in schemas.SiteSummary.model_fields if k in row},
                top_intervention=top_intervention,
                top_intervention_label=top_label,
                top_score=top_score,
            )
        )

    return schemas.SiteListResponse(
        sites=summaries,
        total=len(summaries),
        provenance=build_provenance(conn, include_constraints=True),
    )


@app.get(f"{API_PREFIX}/sites/{{site_id}}", response_model=schemas.SiteDetail)
def site_detail(conn: Conn, site_id: str) -> schemas.SiteDetail:
    row = fetch_one(
        conn,
        """
        SELECT s.site_id, s.state::text, s.area_m2, s.area_is_estimated, s.evidence_count,
               ST_X(s.centroid) AS lon, ST_Y(s.centroid) AS lat,
               fu.damage_class::text AS damage_class, fu.damage_confidence,
               fu.independent_sources, fu.contributing_sources, fu.agreement_ratio,
               fu.any_field_validated, fu.observation_age_days, fu.drivers AS fusion_drivers,
               f.*
        FROM rebuild_core.site s
        JOIN rebuild_analytics.site_feature f USING (site_id)
        LEFT JOIN rebuild_core.site_damage_fusion fu USING (site_id)
        WHERE s.site_id = %s AND f.feature_version = %s
        """,
        (site_id, pipeline.FEATURE_VERSION),
    )
    if row is None:
        raise HTTPException(404, f"sitio {site_id} no encontrado")

    evidence = fetch_all(
        conn,
        """
        SELECT e.evidence_id, e.source, e.original_source, e.damage_class::text AS damage_class,
               e.raw_damage_label, e.method::text AS method, e.field_validated, e.confidence,
               e.observation_date::text AS observation_date,
               e.acquisition_date::text AS acquisition_date,
               e.is_synthetic, e.positional_accuracy_m,
               sr.license_class::text AS license_class, sr.attribution_text AS attribution
        FROM rebuild_core.site_evidence se
        JOIN rebuild_core.damage_evidence e USING (evidence_id)
        JOIN rebuild_core.source_register sr ON sr.source_id = e.original_source
        WHERE se.site_id = %s
        ORDER BY e.observation_date
        """,
        (site_id,),
    )
    exclusions = fetch_all(
        conn,
        "SELECT constraint_id, reason, is_prohibited_risk FROM rebuild_analytics.site_exclusion "
        "WHERE site_id = %s ORDER BY constraint_id",
        (site_id,),
    )

    # FR-CONS-01 — un sitio excluido no llega al scoring. No es que se filtre
    # despues: no entra.
    recommendations: list[schemas.RecommendationOut] = []
    if row["state"] == "CANDIDATE":
        for rec in pipeline.score_candidates([row])[site_id]:
            spec = INTERVENTION_CATALOG[rec.intervention]
            exp = rec.explanation
            recommendations.append(
                schemas.RecommendationOut(
                    intervention=rec.intervention.value,
                    display_name=spec["display_name"],
                    score=rec.score,
                    cost_cop=rec.cost_cop,
                    cost_is_estimated=True,
                    explanation=schemas.ExplanationOut(
                        contributions=[c.__dict__ for c in exp.contributions],
                        penalties=[p.__dict__ for p in exp.penalties],
                        base_score=exp.base_score,
                        penalty_total=exp.penalty_total,
                        final_score=exp.final_score,
                        decomposition_is_exact=exp.sums_to_score(1e-6),
                        counterfactual=exp.counterfactual.__dict__ if exp.counterfactual else None,
                        drivers_positive=exp.drivers_positive,
                        drivers_negative=exp.drivers_negative,
                    ),
                )
            )

    feature_keys = (
        "risk_score",
        "land_use_compatibility",
        "site_area",
        "population_10min",
        "households_10min",
        "park_deficit",
        "park_area_per_capita",
        "pedestrian_accessibility",
        "social_vulnerability",
        "building_density",
        "school_access",
        "health_access",
        "community_access",
        "catchment_area_m2",
    )
    fusion = None
    if row["damage_class"]:
        fusion = {
            "damage_class": row["damage_class"],
            "damage_confidence": float(row["damage_confidence"]),
            "independent_sources": row["independent_sources"],
            "contributing_sources": row["contributing_sources"],
            "agreement_ratio": float(row["agreement_ratio"]),
            "any_field_validated": row["any_field_validated"],
            "observation_age_days": row["observation_age_days"],
            "drivers": row["fusion_drivers"],
        }

    return schemas.SiteDetail(
        site=schemas.SiteSummary(
            **{k: row[k] for k in schemas.SiteSummary.model_fields if k in row},
            top_intervention=recommendations[0].intervention if recommendations else None,
            top_intervention_label=(recommendations[0].display_name if recommendations else None),
            top_score=recommendations[0].score if recommendations else None,
        ),
        features={k: (float(row[k]) if row.get(k) is not None else None) for k in feature_keys},
        confidence_drivers=row["confidence_drivers"],
        evidence=[schemas.EvidenceOut(**e) for e in evidence],
        fusion=fusion,
        exclusions=[schemas.ExclusionOut(**e) for e in exclusions],
        recommendations=recommendations,
        provenance=build_provenance(conn, include_constraints=True),
    )


@app.post(f"{API_PREFIX}/scenarios", response_model=schemas.ScenarioOut)
def create_scenario(conn: Conn, request: schemas.ScenarioRequest) -> schemas.ScenarioOut:
    from uri.scoring.model import DEFAULT_WEIGHTS

    weights = request.weights or DEFAULT_WEIGHTS
    allowed = (
        [InterventionType(i) for i in request.allowed_interventions]
        if request.allowed_interventions
        else None
    )

    rows = pipeline.candidate_features(conn)
    scored = pipeline.score_candidates(rows, weights=weights, allowed=allowed)
    candidate_hash, matrix_hash = pipeline.hash_candidate_set(rows)

    candidates = pipeline.build_candidates_for_optimizer(conn, scored)
    baseline = pipeline.baseline_public_space_access(conn)
    result = pipeline.optimize(
        candidates,
        budget=request.budget_cop,
        max_projects=request.max_projects,
        baseline_access=baseline,
    )

    provenance = build_provenance(conn, include_constraints=True)
    scenario_id = f"scn_{uuid.uuid4().hex[:10]}"

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rebuild_core.scenario (
                scenario_id, display_name, weights, budget_cop, allowed_interventions,
                constraint_set_version, feature_version, data_version, scoring_version,
                candidate_set_hash, feature_matrix_hash, is_synthetic, created_by
            ) VALUES (%s, %s, %s::jsonb, %s, %s::rebuild_core.intervention_type[], %s, %s, %s, %s,
                      %s, %s, %s, %s)
            """,
            (
                scenario_id,
                request.name,
                json.dumps(weights),
                request.budget_cop,
                [i.value for i in (allowed or list(InterventionType))],
                "constraints_v1",
                pipeline.FEATURE_VERSION,
                provenance.data_version,
                pipeline.SCORING,
                candidate_hash,
                matrix_hash,
                provenance.is_synthetic,
                "api",
            ),
        )
        for item in result.items:
            cur.execute(
                """
                INSERT INTO rebuild_core.scenario_site (
                    scenario_id, site_id, intervention_type, rank, score, cost_cop,
                    marginal_population, marginal_gain, redundancy_ratio
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    scenario_id,
                    item.site_id,
                    item.intervention.value,
                    item.rank,
                    item.score,
                    item.cost_cop,
                    item.marginal_population,
                    item.marginal_gain,
                    item.redundancy_ratio,
                ),
            )
        # FR-AUDIT-01
        cur.execute(
            "INSERT INTO rebuild_core.audit_log (actor, action, entity, entity_id, after) "
            "VALUES (%s, %s, %s, %s, %s::jsonb)",
            (
                "api",
                "scenario.create",
                "scenario",
                scenario_id,
                json.dumps({"weights": weights, "budget_cop": request.budget_cop}),
            ),
        )
    conn.commit()

    return schemas.ScenarioOut(
        scenario_id=scenario_id,
        name=request.name,
        budget_cop=request.budget_cop,
        weights=weights,
        items=[
            schemas.PortfolioItemOut(
                **{
                    **i.__dict__,
                    "intervention": i.intervention.value,
                    "intervention_label": INTERVENTION_CATALOG[i.intervention]["display_name"],
                }
            )
            for i in result.items
        ],
        total_cost=result.total_cost,
        total_population=result.total_population,
        objective_value=result.objective_value,
        considered=result.considered,
        stop_reason=result.stop_reason,
        budget_binding=result.budget_binding,
        skipped_over_budget=result.skipped_over_budget,
        equity_before=result.equity_before,
        equity_after=result.equity_after,
        candidate_set_hash=candidate_hash,
        feature_matrix_hash=matrix_hash,
        provenance=provenance,
    )


@app.get(f"{API_PREFIX}/scenarios", response_model=list[dict])
def list_scenarios(conn: Conn) -> list[dict]:
    return fetch_all(
        conn,
        """
        SELECT s.scenario_id, s.display_name AS name, s.budget_cop, s.weights,
               s.created_at::text AS created_at, s.candidate_set_hash, s.is_synthetic,
               count(ss.site_id) AS projects,
               COALESCE(sum(ss.cost_cop), 0) AS total_cost,
               COALESCE(sum(ss.marginal_population), 0) AS population_served
        FROM rebuild_core.scenario s
        LEFT JOIN rebuild_core.scenario_site ss USING (scenario_id)
        GROUP BY s.scenario_id
        ORDER BY s.created_at DESC
        """,
    )


@app.get(f"{API_PREFIX}/data-sources", response_model=list[schemas.SourceOut])
def data_sources(conn: Conn) -> list[schemas.SourceOut]:
    rows = fetch_all(
        conn,
        """
        SELECT source_id, display_name, tier, license_class::text AS license_class,
               license_name, attribution_text, redistribution_allowed, share_alike,
               terms_verified_at::text AS terms_verified_at, verification_notes
        FROM rebuild_core.source_register ORDER BY tier, source_id
        """,
    )
    return [
        schemas.SourceOut(**row, usable=row["license_class"] != LicenseClass.UNCLEAR.value)
        for row in rows
    ]


@app.get(f"{API_PREFIX}/quality/alerts", response_model=list[schemas.AlertOut])
def quality_alerts(conn: Conn) -> list[schemas.AlertOut]:
    return [
        schemas.AlertOut(**row)
        for row in fetch_all(
            conn,
            "SELECT alert_id, severity, code, message, source_id, raised_at::text AS raised_at "
            "FROM rebuild_core.quality_alert ORDER BY alert_id DESC LIMIT 50",
        )
    ]


@app.get(f"{API_PREFIX}/audit", response_model=list[dict])
def audit(conn: Conn, limit: int = 100) -> list[dict]:
    return fetch_all(
        conn,
        "SELECT audit_id, occurred_at::text AS occurred_at, actor, action, entity, entity_id, "
        "before, after, justification FROM rebuild_core.audit_log ORDER BY audit_id DESC LIMIT %s",
        (limit,),
    )


@app.get(f"{API_PREFIX}/exports/{{scenario_id}}")
def export_scenario(
    conn: Conn,
    scenario_id: str,
    format: str = Query("geojson", pattern="^(geojson|csv|json)$"),
    profile: str = Query("INTERNAL", pattern="^(INTERNAL|INSTITUTIONAL|COMMERCIAL)$"),
) -> Response:
    """Control C3 de fuentes.md §6.

    La puerta de export resuelve las fuentes contribuyentes y las compara
    contra el perfil. Una fuente inadmisible **aborta el export nombrandola**;
    omitirla en silencio produciria un archivo que parece completo y no lo es.
    """
    try:
        payload, media_type = _build_export(conn, scenario_id, format, ExportProfile(profile))
    except ExportBlocked as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return Response(content=payload, media_type=media_type)


def _build_export(conn, scenario_id: str, format: str, profile: ExportProfile):
    scenario = fetch_one(
        conn, "SELECT * FROM rebuild_core.scenario WHERE scenario_id = %s", (scenario_id,)
    )
    if scenario is None:
        raise HTTPException(404, f"escenario {scenario_id} no encontrado")

    # La licencia se resuelve contra `original_source`, no contra quien nos
    # entrego el dato (ADR-16). Un agregador CC BY 4.0 no convierte en
    # redistribuible lo que agrega: mirar solo `dataset_version` dejaria pasar
    # a SERTIT, que es NON_COMMERCIAL, escondido detras del monitor.
    contributing = fetch_all(
        conn,
        """
        WITH contributing_sources AS (
            SELECT source_id FROM rebuild_core.dataset_version
            UNION
            SELECT DISTINCT e.original_source
            FROM rebuild_core.scenario_site ss
            JOIN rebuild_core.site_evidence se ON se.site_id = ss.site_id
            JOIN rebuild_core.damage_evidence e USING (evidence_id)
            WHERE ss.scenario_id = %s
            UNION
            SELECT DISTINCT e.source
            FROM rebuild_core.scenario_site ss
            JOIN rebuild_core.site_evidence se ON se.site_id = ss.site_id
            JOIN rebuild_core.damage_evidence e USING (evidence_id)
            WHERE ss.scenario_id = %s
        )
        SELECT sr.source_id, sr.license_class::text AS license_class,
               sr.attribution_text, sr.license_name
        FROM rebuild_core.source_register sr
        JOIN contributing_sources cs USING (source_id)
        ORDER BY 1
        """,
        (scenario_id, scenario_id),
    )
    blocked = [
        row["source_id"]
        for row in contributing
        if LicenseClass(row["license_class"]) not in PROFILE_ALLOWS[profile]
    ]
    if blocked:
        raise ExportBlocked(
            f"El perfil {profile.value} no admite las fuentes {blocked}. "
            "El export se aborta en lugar de omitirlas en silencio "
            "(fuentes.md §6, control C3)."
        )

    items = fetch_all(
        conn,
        """
        SELECT ss.*, ST_AsGeoJSON(s.geometry) AS geojson, ST_X(s.centroid) AS lon,
               ST_Y(s.centroid) AS lat, s.area_m2
        FROM rebuild_core.scenario_site ss JOIN rebuild_core.site s USING (site_id)
        WHERE ss.scenario_id = %s ORDER BY ss.rank
        """,
        (scenario_id,),
    )
    provenance = build_provenance(conn, include_constraints=True)
    attribution = attribution_block(contributing)

    if format == "csv":
        return scenario_to_csv(scenario, items, provenance, attribution), "text/csv; charset=utf-8"
    if format == "json":
        return (
            json.dumps(
                {
                    "scenario": {k: str(v) for k, v in scenario.items()},
                    "items": [{k: str(v) for k, v in i.items() if k != "geojson"} for i in items],
                    "provenance": provenance.model_dump(mode="json"),
                    "attribution": attribution,
                },
                ensure_ascii=False,
                indent=2,
            ),
            "application/json",
        )
    return scenario_to_geojson(scenario, items, provenance, attribution), "application/geo+json"


@app.get(f"{API_PREFIX}/tiles/sites/{{z}}/{{x}}/{{y}}.mvt")
def site_tiles(conn: Conn, z: int, x: int, y: int) -> Response:
    """ADR-10 — tiles dinamicos via ST_AsMVT, filtrables por el estado del
    escenario. El predicado de bbox y el indice GIST son lo que sostiene
    NFR-PERF-02."""
    row = fetch_one(
        conn,
        """
        WITH bounds AS (SELECT ST_TileEnvelope(%(z)s, %(x)s, %(y)s) AS geom),
        mvtgeom AS (
            SELECT ST_AsMVTGeom(ST_Transform(s.geometry, 3857), bounds.geom) AS geom,
                   s.site_id, s.state::text AS state, s.area_m2,
                   f.confidence, f.risk_score, f.population_10min
            FROM rebuild_core.site s
            JOIN rebuild_analytics.site_feature f USING (site_id)
            CROSS JOIN bounds
            WHERE ST_Transform(s.geometry, 3857) && bounds.geom
              AND f.feature_version = %(fv)s
        )
        SELECT ST_AsMVT(mvtgeom.*, 'sites') AS tile FROM mvtgeom
        """,
        {"z": z, "x": x, "y": y, "fv": pipeline.FEATURE_VERSION},
    )
    return Response(content=bytes(row["tile"]), media_type="application/vnd.mapbox-vector-tile")


@app.get(f"{API_PREFIX}/scenarios/{{scenario_id}}/coverage")
def scenario_coverage(conn: Conn, scenario_id: str) -> dict:
    """Quien queda dentro del alcance del portafolio, y quien no.

    Es la vista que hace visible la saturacion que `stop_reason` solo nombra.
    Devuelve dos cosas, y la segunda es la interesante:

    - `cells`: las celdas de poblacion con su altura real y si algun proyecto
      del escenario las alcanza. Las que nadie alcanza son el dato.
    - `arcs`: UN arco por proyecto, no uno por par sitio-celda. El destino es
      el centroide ponderado por poblacion de las celdas que ese proyecto
      aporta POR PRIMERA VEZ, en el orden en que el greedy las eligio. Un
      arco por par serian miles de lineas cruzadas que no dicen nada; uno por
      proyecto dice exactamente lo que el optimizador decidio.
    """
    scenario = fetch_one(
        conn, "SELECT scenario_id FROM rebuild_core.scenario WHERE scenario_id = %s", (scenario_id,)
    )
    if scenario is None:
        raise HTTPException(404, f"escenario {scenario_id} no encontrado")

    cells = fetch_all(
        conn,
        """
        SELECT p.cell_id, p.population,
               ST_X(ST_Centroid(p.geometry)) AS lon,
               ST_Y(ST_Centroid(p.geometry)) AS lat
        FROM rebuild_core.population_cell p
        ORDER BY p.cell_id
        """,
    )
    # Pares sitio-celda de los proyectos del escenario, en orden de seleccion.
    pairs = fetch_all(
        conn,
        """
        SELECT ss.site_id, ss.rank, p.cell_id, p.population,
               ST_X(s.centroid) AS site_lon, ST_Y(s.centroid) AS site_lat,
               ST_X(ST_Centroid(p.geometry)) AS cell_lon,
               ST_Y(ST_Centroid(p.geometry)) AS cell_lat
        FROM rebuild_core.scenario_site ss
        JOIN rebuild_core.site s USING (site_id)
        JOIN rebuild_analytics.site_catchment c
          ON c.site_id = ss.site_id AND c.minutes = 10 AND c.feature_version = %s
        JOIN rebuild_core.population_cell p ON ST_Intersects(p.geometry, c.geometry)
        WHERE ss.scenario_id = %s
        ORDER BY ss.rank
        """,
        (pipeline.FEATURE_VERSION, scenario_id),
    )

    # El mismo criterio de marginalidad que el optimizador: una celda ya
    # cubierta no vuelve a contar. Recorrer por `rank` reproduce el orden del
    # greedy, asi que "primera vez" aqui significa lo mismo que alli.
    claimed: dict[int, str] = {}
    accrual: dict[str, dict] = {}
    for row in pairs:
        site_id = row["site_id"]
        slot = accrual.setdefault(
            site_id,
            {
                "site_id": site_id,
                "rank": row["rank"],
                "from": [float(row["site_lon"]), float(row["site_lat"])],
                "_lon": 0.0,
                "_lat": 0.0,
                "population": 0.0,
                "cells": 0,
            },
        )
        if row["cell_id"] in claimed:
            continue
        claimed[row["cell_id"]] = site_id
        population = float(row["population"])
        slot["_lon"] += float(row["cell_lon"]) * population
        slot["_lat"] += float(row["cell_lat"]) * population
        slot["population"] += population
        slot["cells"] += 1

    arcs = []
    for slot in sorted(accrual.values(), key=lambda s: s["rank"]):
        if slot["population"] <= 0:
            # Un proyecto que no aporta cobertura nueva no dibuja arco: su
            # aporte fue cero y una linea sugeriria lo contrario.
            continue
        arcs.append(
            {
                "site_id": slot["site_id"],
                "rank": slot["rank"],
                "from": slot["from"],
                "to": [slot["_lon"] / slot["population"], slot["_lat"] / slot["population"]],
                "population": round(slot["population"], 2),
                "cells": slot["cells"],
            }
        )

    return {
        "scenario_id": scenario_id,
        "cells": [
            {
                "cell_id": row["cell_id"],
                "lon": float(row["lon"]),
                "lat": float(row["lat"]),
                "population": float(row["population"]),
                "covered_by": claimed.get(row["cell_id"]),
            }
            for row in cells
        ],
        "arcs": arcs,
        "reached": len(claimed),
        "total_cells": len(cells),
        "provenance": build_provenance(conn, include_constraints=True),
    }


@app.get(f"{API_PREFIX}/geojson/{{layer}}")
def layer_geojson(conn: Conn, layer: str) -> Response:
    """Capas ligeras para el visor. Las pesadas van por tiles (FR-API-03).

    La capa `sites` lleva las propiedades que el mapa necesita para colorear y
    para el tooltip. Se calculan aqui, no en el navegador: ADR-13 — el cliente
    no puede discrepar del servidor porque no computa ningun numero.
    """
    if layer == "sites":
        rows = fetch_all(
            conn,
            """
            SELECT s.site_id, s.state::text AS state, s.area_m2, s.evidence_count,
                   fu.damage_class::text AS damage_class, f.confidence,
                   ST_AsGeoJSON(s.geometry) AS g,
                   f.risk_score, f.land_use_compatibility, f.site_area,
                   f.population_10min, f.park_deficit, f.social_vulnerability,
                   f.pedestrian_accessibility, f.school_access, f.health_access,
                   f.community_access
            FROM rebuild_core.site s
            JOIN rebuild_analytics.site_feature f USING (site_id)
            LEFT JOIN rebuild_core.site_damage_fusion fu USING (site_id)
            WHERE f.feature_version = %s
            """,
            (pipeline.FEATURE_VERSION,),
        )
        features = []
        for row in rows:
            score = label = None
            if row["state"] == "CANDIDATE":
                recommendations = pipeline.score_candidates([row])[row["site_id"]]
                buildable = [
                    r for r in recommendations if r.intervention is not InterventionType.NO_BUILD
                ]
                if buildable:
                    score = buildable[0].score
                    label = INTERVENTION_CATALOG[buildable[0].intervention]["display_name"]
            features.append(
                {
                    "type": "Feature",
                    "id": row["site_id"],
                    "properties": {
                        "site_id": row["site_id"],
                        "state": row["state"],
                        "area_m2": float(row["area_m2"]),
                        "evidence_count": row["evidence_count"],
                        "damage_class": row["damage_class"],
                        "confidence": float(row["confidence"]),
                        "score": score,
                        "intervention_label": label,
                    },
                    "geometry": json.loads(row["g"]),
                }
            )
        return Response(
            content=json.dumps({"type": "FeatureCollection", "features": features}),
            media_type="application/geo+json",
        )

    queries = {
        # Tejido urbano. Son las dos capas que hacen que el mapa se lea como
        # una ciudad y no como puntos sobre papel en blanco, y llevaban todo
        # este tiempo en la base sin publicarse.
        #
        # No contradicen ADR-10 ni fuentes.md §11: lo que esas reglas prohiben
        # es un tile de un tercero, que no tiene `data_version` y rompe la
        # reproducibilidad. Esto es dato propio, ya ingerido, ya sellado con su
        # version y ya redistribuible (Microsoft y OSM, ambos SHARE_ALIKE).
        #
        # 6 decimales son ~11 cm en el ecuador: mas precision que la que tiene
        # una huella de edificio derivada por teledeteccion, y un tercio menos
        # de bytes que el doble completo.
        "buildings": (
            "SELECT footprint_id::text AS id, ST_AsGeoJSON(geometry, 6) AS g "
            "FROM rebuild_core.building_footprint"
        ),
        "roads": (
            "SELECT osm_id::text AS id, highway AS label, "
            "ST_AsGeoJSON(geometry, 6) AS g FROM rebuild_osm_raw.road"
        ),
        "evidence": (
            "SELECT evidence_id::text AS id, damage_class::text AS label, "
            "ST_AsGeoJSON(geometry) AS g FROM rebuild_core.damage_evidence"
        ),
        "green": (
            "SELECT osm_id::text AS id, leisure AS label, ST_AsGeoJSON(geometry) AS g "
            "FROM rebuild_osm_raw.green_space"
        ),
        "facilities": (
            "SELECT osm_id::text AS id, category AS label, ST_AsGeoJSON(geometry) AS g "
            "FROM rebuild_osm_raw.facility"
        ),
        "risk": (
            "SELECT zone_id::text AS id, risk_level AS label, ST_AsGeoJSON(geometry) AS g "
            "FROM rebuild_core.risk_zone WHERE risk_level IN ('high','prohibited')"
        ),
        "population": (
            "SELECT cell_id::text AS id, round(population)::text AS label, "
            "population, ST_AsGeoJSON(geometry) AS g FROM rebuild_core.population_cell"
        ),
        "catchments": (
            "SELECT site_id AS id, minutes::text AS label, ST_AsGeoJSON(geometry) AS g "
            "FROM rebuild_analytics.site_catchment WHERE minutes = 10 AND feature_version = %s"
        ),
    }
    if layer not in queries:
        raise HTTPException(404, f"capa {layer} desconocida")

    params = (pipeline.FEATURE_VERSION,) if layer == "catchments" else None
    rows = fetch_all(conn, queries[layer], params)
    features = [
        {
            "type": "Feature",
            "id": row["id"],
            "properties": {
                # psycopg devuelve `numeric` como Decimal, que json no serializa.
                key: (float(value) if isinstance(value, Decimal) else value)
                for key, value in row.items()
                if key != "g"
            },
            "geometry": json.loads(row["g"]),
        }
        for row in rows
    ]
    return Response(
        content=json.dumps({"type": "FeatureCollection", "features": features}),
        media_type="application/geo+json",
    )


if VIEWER_DIR.exists():
    app.mount("/", StaticFiles(directory=VIEWER_DIR, html=True), name="viewer")
