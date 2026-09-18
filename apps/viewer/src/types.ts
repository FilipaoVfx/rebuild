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
  /** ADR-22 — identidad de lugar derivada de OSM. `null` es "sin fuente". */
  neighborhood?: string | null;
  neighborhood_method?: 'ADMIN_POLYGON' | 'NEAREST_PLACE' | null;
  commune?: string | null;
  corner_label?: string | null;
  nearest_landmark?: string | null;
  nearest_landmark_m?: number | null;
  place_line?: string | null;
}

/** Lo que un sitio hereda del territorio (rebuild_osm_derived.site_place). */
export interface Place {
  neighborhood: string | null;
  neighborhood_method: 'ADMIN_POLYGON' | 'NEAREST_PLACE' | null;
  commune: string | null;
  corner_label: string | null;
  nearest_landmark: string | null;
  nearest_landmark_m: number | null;
  place_line: string | null;
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
  place?: Place | null;
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

export type ViewKey =
  | 'territorio' | 'situacion' | 'oportunidades' | 'escenarios' | 'portafolio' | 'evidencia';

/** `GET /api/v1/territory` — ¿Dónde estamos? (ADR-22). */
export interface Territory {
  city: {
    display_name: string; wikidata: string | null; population: number | null;
    population_source: string; lon: number; lat: number; department: string; country: string;
  } | null;
  urban_perimeter: {
    osm_id: number; display_name: string; bbox: [number, number, number, number]; area_km2: number;
  } | null;
  aoi: {
    bbox: [number, number, number, number]; bbox_km2: number; evidence_km2: number | null;
    share_of_perimeter: number | null; source: string;
  };
  event: {
    event_id: string; magnitude: number; magnitude_type: string; occurred_at: string;
    depth_km: number; epicentre: { lon: number; lat: number; label: string };
    distance_km: number | null; municipalities_affected: number;
    activation_id: string; activation_url: string; source: string; source_url: string;
  };
  counts: {
    evidence: number; sites: number; candidates: number; landmarks: number; buildings: number;
    population_measured: number | null; communes_with_sites: number; neighborhoods_in_aoi: number;
    projects: number | null; population_served: number | null;
  };
  comunas: { osm_id: number; display_name: string; bbox: [number, number, number, number]; sites: number }[];
  rivers: { display_name: string; waterway: string; length_m: number }[];
  imagery: {
    sentinel: { available: boolean; scenes: number };
    basemap?: {
      available: boolean; osm_replication_time: string | null; maxzoom: number | null;
      attribution: string | null;
    };
    ortofotos: {
      source_id: string; display_name: string; license_class: string;
      status: 'AVAILABLE' | 'UNAVAILABLE'; reason: string | null; attribution: string | null;
      index?: OrtofotoIndex;
    }[];
  };
  provenance: Provenance;
}

export interface OrtofotoIndex {
  source_id: string;
  aoi_bbox: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  tile_size: number;
  format?: 'png' | 'jpg';
  attribution: string | null;
  acquisition?: string | null;
  tiles: number;
}
