"""Esquemas de respuesta.

FR-API-02: toda respuesta que lleve un score o un agregado lleva su
procedencia. No es un campo opcional que alguien pueda olvidar: el modelo
lo declara obligatorio, asi que serializar sin el falla.
"""

from __future__ import annotations

from pydantic import BaseModel

from uri.contracts import Provenance


class SiteSummary(BaseModel):
    site_id: str
    state: str
    area_m2: float
    area_is_estimated: bool
    evidence_count: int
    damage_class: str | None
    damage_confidence: float | None
    independent_sources: int | None
    confidence: float | None
    catchment_method: str | None
    population_10min: float | None
    park_deficit: float | None
    social_vulnerability: float | None
    risk_score: float | None
    land_use_compatibility: float | None
    pedestrian_accessibility: float | None
    top_intervention: str | None = None
    top_intervention_label: str | None = None
    top_score: float | None = None
    lon: float
    lat: float


class SiteListResponse(BaseModel):
    sites: list[SiteSummary]
    total: int
    provenance: Provenance


class ContributionOut(BaseModel):
    factor: str
    raw_value: float
    normalized: float
    weight: float
    affinity: float
    contribution: float


class PenaltyOut(BaseModel):
    constraint_id: str
    magnitude: float
    reason: str


class CounterfactualOut(BaseModel):
    factor: str
    current_value: float
    required_value: float
    delta: float
    note: str


class ExplanationOut(BaseModel):
    contributions: list[ContributionOut]
    penalties: list[PenaltyOut]
    base_score: float
    penalty_total: float
    final_score: float
    decomposition_is_exact: bool
    counterfactual: CounterfactualOut | None
    drivers_positive: list[str]
    drivers_negative: list[str]


class RecommendationOut(BaseModel):
    intervention: str
    display_name: str
    score: float
    cost_cop: float
    cost_is_estimated: bool
    explanation: ExplanationOut


class EvidenceOut(BaseModel):
    evidence_id: int
    source: str
    original_source: str
    license_class: str
    attribution: str | None
    damage_class: str
    raw_damage_label: str
    method: str
    field_validated: bool
    confidence: float
    observation_date: str
    acquisition_date: str
    is_synthetic: bool
    positional_accuracy_m: float | None


class ExclusionOut(BaseModel):
    constraint_id: str
    reason: str
    is_prohibited_risk: bool


class SiteDetail(BaseModel):
    site: SiteSummary
    features: dict
    confidence_drivers: dict
    evidence: list[EvidenceOut]
    fusion: dict | None
    exclusions: list[ExclusionOut]
    recommendations: list[RecommendationOut]
    provenance: Provenance


class ScenarioRequest(BaseModel):
    name: str
    budget_cop: float
    weights: dict[str, float] | None = None
    allowed_interventions: list[str] | None = None
    max_projects: int | None = None


class PortfolioItemOut(BaseModel):
    rank: int
    site_id: str
    intervention: str
    intervention_label: str
    score: float
    cost_cop: float
    marginal_population: float
    marginal_gain: float
    redundancy_ratio: float
    cumulative_population: float
    cumulative_cost: float


class ScenarioOut(BaseModel):
    scenario_id: str
    name: str
    budget_cop: float
    weights: dict[str, float]
    items: list[PortfolioItemOut]
    total_cost: float
    total_population: float
    objective_value: float
    considered: int
    #: `presupuesto`, `cobertura_saturada` o `limite_de_proyectos`. Con un
    #: objetivo de cobertura el presupuesto casi nunca es lo que limita: sin
    #: este campo, subirlo devuelve el mismo portafolio sin explicar por que.
    stop_reason: str
    budget_binding: bool
    skipped_over_budget: int
    equity_before: dict
    equity_after: dict
    candidate_set_hash: str
    feature_matrix_hash: str
    provenance: Provenance


class SourceOut(BaseModel):
    source_id: str
    display_name: str
    tier: str
    license_class: str
    license_name: str | None
    attribution_text: str | None
    redistribution_allowed: bool | None
    share_alike: bool
    terms_verified_at: str | None
    usable: bool
    verification_notes: str | None


class AlertOut(BaseModel):
    alert_id: int
    severity: str
    code: str
    message: str
    source_id: str | None
    raised_at: str
