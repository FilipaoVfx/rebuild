/** Formas del contrato que sirve la API y que `build_static.py` vuelca a JSON. */

export type FeasibilityStatus = 'OK' | 'WARNING' | 'BLOCKED' | 'UNKNOWN';

export interface ProvenanceLayer {
  layer: string;
  source_id: string;
  is_synthetic: boolean;
  license_class: string;
  attribution: string;
  retrieved_at: string;
}

export interface Provenance {
  data_version: number;
  feature_version: string;
  constraint_set_version?: string;
  scoring_version?: string;
  is_synthetic: boolean;
  layers?: ProvenanceLayer[];
}

export interface Site {
  site_id: string;
  state: string;
  area_m2: number;
  area_is_estimated: boolean;
  evidence_count: number;
  damage_class: string | null;
  damage_confidence: number | null;
  independent_sources: number;
  confidence: number;
  catchment_method: string;
  population_10min: number;
  park_deficit: number | null;
  social_vulnerability: number | null;
  risk_score: number | null;
  land_use_compatibility: number | null;
  pedestrian_accessibility: number | null;
  top_intervention: string | null;
  top_intervention_label: string | null;
  top_score: number | null;
  lon: number;
  lat: number;
}

export interface FeasibilityCheck {
  check_id: string;
  label: string;
  status: FeasibilityStatus;
  detail: string;
  source_id: string | null;
}

export interface Opportunity {
  opportunity_id: string;
  site_id: string;
  zone: string | null;
  problem: { headline: string; drivers: string[]; missing_factors: string[] };
  evidence: {
    damage_observations: number;
    damage_classes: Record<string, number>;
    observation_date: string | null;
    source_ids: string[];
    agreement: number | null;
  };
  intervention: string;
  intervention_label: string;
  impact: {
    population_reached: number;
    deficit_reduction: number | null;
    area_m2: number;
    people_per_million_cop: number | null;
  };
  feasibility: FeasibilityCheck[];
  cost_cop: number | null;
  suitability: number;
  confidence: number;
  provenance: { feature_version: string };
  lon: number;
  lat: number;
  unknowns: string[];
  blocked: boolean;
}

export interface Contribution {
  factor: string;
  raw_value: number | null;
  normalized: number | null;
  weight: number;
  affinity: number;
  contribution: number;
}

export interface Explanation {
  contributions: Contribution[];
  penalties: { constraint_id: string; magnitude: number; reason: string }[];
  base_score: number;
  penalty_total: number;
  final_score: number;
  decomposition_is_exact: boolean;
  counterfactual: {
    factor: string; current_value: number; required_value: number;
    delta: number; note: string;
  } | null;
  drivers_positive: string[];
  drivers_negative: string[];
}

export interface Recommendation {
  intervention: string;
  display_name: string;
  score: number;
  cost_cop: number | null;
  cost_is_estimated: boolean;
  explanation: Explanation;
}

export interface EvidenceRecord {
  evidence_id: number;
  source: string;
  original_source: string;
  license_class: string;
  attribution: string;
  damage_class: string;
  raw_damage_label: string;
  method: string;
  field_validated: boolean;
  confidence: number;
  observation_date: string | null;
  acquisition_date: string | null;
  is_synthetic: boolean;
  positional_accuracy_m: number | null;
}

export interface SiteDetail {
  site: Site;
  features: Record<string, number | null>;
  confidence_drivers: Record<string, number>;
  evidence: EvidenceRecord[];
  fusion: {
    damage_class: string | null;
    damage_confidence: number | null;
    independent_sources: number;
    contributing_sources: string[];
    agreement_ratio: number | null;
    any_field_validated: boolean;
    observation_age_days: number | null;
    drivers: Record<string, number | boolean>;
  };
  exclusions: { constraint_id: string; reason: string }[];
  recommendations: Recommendation[];
  provenance: Provenance;
}

export interface ScenarioItem {
  rank: number;
  site_id: string;
  intervention: string;
  intervention_label: string;
  score: number;
  cost_cop: number;
  marginal_population: number;
  marginal_gain: number;
  redundancy_ratio: number;
  cumulative_population: number;
  cumulative_cost: number;
}

export interface Scenario {
  scenario_id: string;
  name: string;
  budget_cop: number;
  weights: Record<string, number>;
  items: ScenarioItem[];
  total_cost: number;
  total_population: number;
  objective_value: number;
  considered: number;
  stop_reason: string;
  budget_binding: boolean;
  skipped_over_budget: number;
  equity_before: { gini_access: number; cells_with_access: number; cells_total: number };
  equity_after: {
    gini_access: number; cells_with_access: number; cells_total: number; gini_delta: number;
  };
  candidate_set_hash: string;
  feature_matrix_hash: string;
  provenance: Provenance;
}

export interface CoverageCell {
  cell_id: number; lon: number; lat: number; population: number; covered_by: string | null;
}

export interface CoverageArc {
  site_id: string; rank: number; from: [number, number]; to: [number, number];
  population: number; cells: number;
}

export interface Coverage {
  scenario_id: string;
  cells: CoverageCell[];
  arcs: CoverageArc[];
  reached: number;
  total_cells: number;
  provenance: Provenance;
}

export interface Source {
  source_id: string;
  display_name: string;
  tier: string;
  license_class: string | null;
  license_name: string | null;
  attribution_text: string | null;
  redistribution_allowed: boolean | null;
  share_alike: boolean | null;
  terms_verified_at: string | null;
  usable: boolean;
  verification_notes: string | null;
}

export interface Alert {
  alert_id: number;
  severity: string;
  code: string;
  message: string;
  source_id: string | null;
  raised_at: string;
}

export type GeoJSON = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }[];
};

export type ViewKey = 'situacion' | 'oportunidades' | 'escenarios' | 'portafolio' | 'evidencia';
