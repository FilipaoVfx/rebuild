# SRS — Urban Recovery Intelligence Platform

**Document type:** Software Requirements Specification
**Parent document:** PRD — Urban Recovery Intelligence Platform v1.0
**Case:** Pereira, Colombia — recovery after the August 10, 2026 earthquake
**Delivery horizon:** Institutional pilot (months)
**Version:** 0.1 — draft for review
**Status:** Open items listed in §13

---

## 1. Purpose and Scope

### 1.1 Purpose

This document translates the PRD into verifiable requirements. The PRD defines *what the product is and why*. This SRS defines *what the system must do, under which constraints, and how each requirement is proven done*.

Every requirement here is:

- Uniquely identified (`FR-*`, `NFR-*`, `DC-*`, `CON-*`)
- Testable through a stated acceptance criterion
- Traceable to a PRD section

### 1.2 Scope of this version

In scope: the MVP defined in PRD §52, extended with the requirements an institutional pilot demands (roles, audit, provenance, legal compliance, degraded operation).

Out of scope: everything in PRD §5 (Non-Goals) and the long-term direction of PRD §57.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Opportunity Site | Geographically defined location that may become the subject of an intervention (PRD §7) |
| Candidate | Opportunity Site that survived all hard constraints |
| Intervention | A typed action from the intervention catalog (PRD §16) applicable to a site |
| Recommendation | A (site × intervention) pair with a score and an explanation |
| Scenario | A reproducible set of constraints, weights and budget, plus its resulting portfolio |
| Portfolio | The subset of (site × intervention) pairs selected by the optimizer within a scenario |
| Feature vector | Standardized spatial variables computed per site (PRD §12) |
| Provenance | The full chain: source → version → retrieval date → transformation → output |
| Synthetic damage layer | Generated stand-in for the unavailable dataset of PRD §9.1 |

### 1.4 References

- PRD — Urban Recovery Intelligence Platform v1.0 (all `PRD §n` citations)
- Ley 1581 de 2012 and Decreto 1377 de 2013 (Colombian personal data protection)
- Resolución 1519 de 2020, MinTIC (digital accessibility for public entities)
- OGC WMS / WFS specifications, for IDE AMCO and SGC consumption

---

## 2. Operating Assumptions and Constraints

These assumptions are load-bearing. If one breaks, the affected requirements must be re-examined.

| ID | Assumption / Constraint |
|---|---|
| CON-01 | The post-earthquake damage dataset (PRD §9.1) **does not exist and will not exist at development time**. The system is built against a frozen data contract (§6) and a synthetic generator (§7). |
| CON-02 | The pilot serves a single municipality (Pereira). Multi-tenancy is **not** a requirement; the schema must not actively prevent it. |
| CON-03 | Concurrent users are in the order of tens, not thousands. Availability targets are business-hours only. |
| CON-04 | No personally identifiable information enters the analytical database at any point, under any source. |
| CON-05 | The system never issues a legally binding decision. Every output is advisory (PRD §5, §55 *Human in the loop*). |
| CON-06 | The map interface must be usable on institutional desktop hardware with mid-range GPUs, over ordinary municipal network conditions. |
| CON-07 | The pilot must end with an exportable evidence package that survives without the platform running. |

---

## 3. Actors and Roles

Five user profiles from PRD §6 map to four system roles. The distinction that matters: **who can change the numbers** versus **who can interpret them**.

| Role | Derived from PRD §6 | Can |
|---|---|---|
| `viewer` | Public Administration, Infrastructure/Recovery Team | Read sites, recommendations, scenarios; export; read reports |
| `planner` | Urban Planner | All of `viewer` + create/edit/compare scenarios, adjust weights and budget within allowed ranges, annotate sites |
| `analyst` | GIS/Territorial Analyst, Data Scientist | All of `planner` + trigger feature recomputation, mark data quality issues, override site status with justification, access INTERNAL layers |
| `admin` | Platform operator | All of `analyst` + manage users, manage data source registrations, publish dataset versions, access audit log |

### FR-AUTH-01 — Authenticated access
The system shall require authentication for all endpoints except health checks and public static assets.
**Acceptance:** Given an unauthenticated request to any `/api/*` endpoint, when it is received, then the system returns `401` and writes no data.
**Traces:** PRD §49

### FR-AUTH-02 — Role enforcement at the API
The system shall enforce role permissions server-side, independently of frontend state.
**Acceptance:** Given a `viewer` token, when a `POST /api/scenarios` request is issued, then the system returns `403` and creates no scenario.
**Traces:** PRD §49

### FR-AUTH-03 — Sensitivity tiers
Every layer, table and API response field shall carry one classification: `PUBLIC`, `INTERNAL`, `SENSITIVE`. `SENSITIVE` fields are never serialized to a `viewer` or `planner` response.
**Acceptance:** Given a layer classified `INTERNAL`, when a `viewer` requests it, then the response omits it entirely rather than returning an empty or masked object.
**Traces:** PRD §49

### FR-AUDIT-01 — Decision audit trail
The system shall record, immutably: scenario creation and modification, weight changes, manual status overrides, dataset version publication, and export generation. Each record stores actor, timestamp, before/after values and justification where required.
**Acceptance:** Given a `planner` changes a scenario weight, when the audit log is queried by `admin`, then the entry shows the prior and new weight, the actor and the timestamp, and the entry cannot be edited or deleted through any API.
**Traces:** PRD §48, institutional pilot requirement

---

## 4. Data Classification and Legal Requirements

### FR-PII-01 — PII exclusion at ingestion
The ingestion layer shall reject any record containing name, identification number, phone number, email or unit-level personal address fields, regardless of source.
**Acceptance:** Given an input file with a column matching the prohibited-field dictionary, when ingestion runs, then the job fails with an explicit error naming the offending column, and no row is written to the database.
**Traces:** PRD §9.1, §49, CON-04

### FR-PII-02 — Automated PII regression test
A test in the CI pipeline shall assert that no table in the analytical schema contains a column matching the prohibited-field dictionary.
**Acceptance:** Given a migration adding a prohibited column, when CI runs, then the build fails.
**Traces:** CON-04

### FR-PII-03 — Minimum aggregation threshold
Any population or vulnerability figure displayed or exported shall be derived from a spatial unit containing at least a configurable minimum of households (default: 20). Below the threshold, the figure is suppressed and labeled as such.
**Acceptance:** Given a catchment intersecting a unit below the threshold, when a site detail panel is rendered, then the population figure shows a suppression marker instead of a number.
**Traces:** PRD §49, Ley 1581

### FR-LIC-01 — Source licensing register
Each registered data source shall store its license, attribution text and redistribution permission. Exports shall include the attribution of every source that contributed to them.
**Acceptance:** Given a PDF report generated from a scenario, when it is opened, then it lists every contributing source with license and retrieval date.
**Traces:** PRD §10

---

## 5. Domain Model and Site Lifecycle

### 5.1 Core entities

Entities follow PRD §11. This SRS adds the state model, which PRD does not define.

### 5.2 Opportunity Site lifecycle

```text
            ┌──────────────┐
            │  INGESTED    │  geometry loaded, not yet evaluated
            └──────┬───────┘
                   ▼
            ┌──────────────┐
            │  EVALUATED   │  feature vector computed
            └──────┬───────┘
          ┌────────┴────────┐
          ▼                 ▼
  ┌──────────────┐   ┌──────────────┐
  │  EXCLUDED    │   │  CANDIDATE   │
  │ hard         │   │ eligible for │
  │ constraint   │   │ ranking      │
  └──────┬───────┘   └──────┬───────┘
         │                  ▼
         │           ┌──────────────┐
         │           │  SHORTLISTED │  present in ≥1 saved scenario
         │           └──────┬───────┘
         │                  ▼
         │           ┌──────────────┐
         │           │  ENDORSED    │  institutionally accepted in pilot
         │           └──────────────┘
         └──► reinstatement only via analyst override with justification
```

### FR-LIFE-01 — Deterministic state transitions
Site state shall be a pure function of (feature vector, constraint set, scenario membership, recorded overrides). No state is set by manual edit alone except through FR-LIFE-02.
**Acceptance:** Given the same inputs, when state is recomputed, then the resulting state is identical.
**Traces:** PRD §17

### FR-LIFE-02 — Justified override
An `analyst` may move a site from `EXCLUDED` to `CANDIDATE`, or force `EXCLUDED`, only with a free-text justification of at least 40 characters. The override is versioned, attributed and visible in every downstream view of that site.
**Acceptance:** Given an override without justification, when submitted, then the API returns `422`. Given a valid override, when the site appears in any ranking, then an override marker and its justification are present in the response.
**Traces:** PRD §55 *Human in the loop*

### FR-LIFE-03 — Overrides never bypass risk
An override shall not be permitted for sites excluded by a prohibited-risk constraint.
**Acceptance:** Given a site excluded by prohibited risk, when an `analyst` attempts an override, then the API returns `409` with the blocking constraint identified.
**Traces:** PRD §9.6, §55 *Hard constraints before ML*

---

## 6. Data Contract — Damage Layer (frozen)

This contract is the interface the real municipal dataset must satisfy. It is frozen now so that the synthetic generator and the real dataset are interchangeable through an adapter only.

| Field | Type | Required | Notes |
|---|---|---|---|
| `site_id` | string | yes | Stable, opaque, non-derivable from any personal identifier |
| `geometry` | Polygon/MultiPolygon | yes | Valid, EPSG:4326 stored, EPSG:3116 for metric operations |
| `neighborhood` | string | yes | Must resolve against the neighborhoods reference layer |
| `commune` | string | yes | Must resolve against the communes reference layer |
| `building_type` | enum | yes | Controlled vocabulary |
| `damage_level` | enum | yes | Controlled vocabulary, ordinal |
| `habitability` | enum | yes | Controlled vocabulary |
| `demolition_authorized` | boolean | no | Null means unknown, not false |
| `demolition_status` | enum | no | Null means unknown |
| `inspection_date` | date | yes | Used for staleness assessment |
| `area_m2` | number | yes | Must be consistent with geometry within tolerance |
| `source` | string | yes | Registered source identifier |
| `is_synthetic` | boolean | yes | **Non-nullable. Propagates to every derived artifact.** |

Explicitly forbidden: `address` at unit level, and every field listed in FR-PII-01.

### FR-DC-01 — Contract validation
Ingestion shall validate every incoming record against this contract and reject the batch on schema violation, invalid geometry, unresolvable administrative reference, or area inconsistency beyond tolerance.
**Acceptance:** Given a batch where 1 of 800 records has an invalid geometry, when ingestion runs, then the batch is rejected with a per-record error report and nothing is committed.
**Traces:** PRD §10

### FR-DC-02 — Adapter isolation
Source-specific parsing shall live in an adapter module. Replacing the synthetic source with the municipal source shall require changes only inside that module and the source register.
**Acceptance:** Given a new adapter implementing the contract, when it is registered, then the feature engine, scoring, optimizer and API run unchanged.
**Traces:** CON-01

---

## 7. Synthetic Damage Layer

Because CON-01 holds, the generator is a first-class component with its own requirements, not a fixture script.

### FR-SYN-01 — Deterministic generation
The generator shall accept a seed and produce byte-identical output for identical (seed, parameters, base layers).
**Acceptance:** Given the same seed twice, when the generator runs, then output checksums match.
**Traces:** PRD §48

### FR-SYN-02 — Plausible spatial structure
Generated damage shall be spatially clustered rather than uniformly random, and shall correlate with building age/typology proxies and seismic microzonation where those layers are available.
**Acceptance:** Given a generated layer, when spatial autocorrelation is measured, then it exceeds a documented minimum threshold, and the correlation with microzonation is reported in the generation manifest.
**Traces:** PRD §9.6

### FR-SYN-03 — Generation manifest
Every generated dataset shall emit a manifest: seed, parameters, base layers and versions, generation timestamp, record count, and distributional summary.
**Acceptance:** Given a published synthetic version, when the manifest is requested, then all listed fields are present and the version is immutable.
**Traces:** PRD §10, §48

### FR-SYN-04 — Provenance propagation
The `is_synthetic` flag shall propagate through features, scores, scenarios, maps, reports and exports. No derived artifact may lose it.
**Acceptance:** Given a scenario built entirely on synthetic damage, when a PDF report is exported, then a non-removable banner on every page states that damage data is simulated.
**Traces:** CON-01, PRD §34

### FR-SYN-05 — Mixed-provenance labeling
Where a scenario combines real and synthetic inputs, the interface shall state which layers are synthetic rather than applying a single global label.
**Acceptance:** Given a scenario with real population and synthetic damage, when the scenario summary is displayed, then the provenance panel lists each layer with its provenance.
**Traces:** PRD §34

### FR-SYN-06 — No silent promotion to production
The system shall refuse to mark a scenario as `ENDORSED` while any contributing damage record is synthetic.
**Acceptance:** Given a scenario containing synthetic sites, when endorsement is attempted, then the API returns `409` naming the synthetic dependency.
**Traces:** CON-05, CON-07

---

## 8. Functional Requirements

### 8.1 Ingestion and Data Management

**FR-ING-01 — Registered sources.** Every dataset shall be ingested through a registered source carrying `source`, `source_url`, `retrieved_at`, `version`, `license`, `spatial_reference`, `update_frequency`, `quality_score`.
*Acceptance:* Given an ingestion attempt from an unregistered source, when it runs, then it fails before any write. *Traces:* PRD §10

**FR-ING-02 — Immutable versions.** Publishing a new dataset version shall never mutate a prior version.
*Acceptance:* Given a scenario referencing version *n*, when version *n+1* is published, then the scenario continues to resolve version *n*. *Traces:* PRD §48

**FR-ING-03 — Reproducible runs.** Re-running ingestion on a fixed source version shall produce an identical normalized dataset.
*Acceptance:* Given two runs on the same source version, when outputs are compared, then they are identical. *Traces:* PRD §10

**FR-ING-04 — Geometry normalization.** All geometries shall be validated, repaired where safely possible, and stored in a single declared CRS, with metric operations performed in a projected CRS.
*Acceptance:* Given a self-intersecting input polygon, when ingestion runs, then it is either repaired and flagged, or rejected with reason. *Traces:* PRD §10

**FR-ING-05 — OGC consumption.** Where a source publishes WFS/WMS, ingestion shall prefer it over manual file handling and shall record the request parameters used.
*Acceptance:* Given IDE AMCO WFS availability, when a layer is refreshed, then the stored provenance includes the endpoint and query. *Traces:* PRD §9.5

### 8.2 Spatial Feature Engine

**FR-FEAT-01 — Standard feature vector.** The system shall compute, for every site, the feature vector of PRD §12.
*Acceptance:* Given a site in `INGESTED` state, when the feature engine runs, then all declared features are populated or explicitly marked unavailable with reason. *Traces:* PRD §12

**FR-FEAT-02 — Catchments.** Catchments shall be computed as network-based walking areas, not straight-line buffers, wherever the pedestrian network covers the site.
*Acceptance:* Given a site separated from nearby population by a river with no crossing, when the 10-minute catchment is computed, then the population across the river is excluded. *Traces:* PRD §13, §14

**FR-FEAT-03 — Buffer fallback with flag.** Where network coverage is insufficient, the system shall fall back to buffer-based catchment and flag the feature as degraded.
*Acceptance:* Given a site outside network coverage, when features are computed, then the catchment method is recorded as `buffer` and the site's confidence is reduced. *Traces:* PRD §34

**FR-FEAT-04 — Deficit computation.** Public-space and facility deficits shall be computed against a configurable standard, with the standard stored per feature version.
*Acceptance:* Given a change to the public-space standard, when features are recomputed, then the new feature version records the standard used and prior versions remain intact. *Traces:* PRD §15

**FR-FEAT-05 — Feature versioning.** Every feature vector shall be stamped with `feature_version` and `data_version`.
*Acceptance:* Given a score, when its lineage is queried, then the exact feature and data versions are returned. *Traces:* PRD §46, §48

**FR-FEAT-06 — Population apportionment is declared.** The method used to distribute census population into catchments shall be explicit, documented and versioned.
*Acceptance:* Given a population figure, when its derivation is requested, then the apportionment method is named in the response. *Traces:* PRD §9.2

### 8.3 Constraints

**FR-CONS-01 — Hard constraints precede scoring.** Hard constraints shall be evaluated before any ranking or model inference, and shall not be expressible as weights.
*Acceptance:* Given a site violating a hard constraint, when ranking runs, then the site is absent from all rankings regardless of its feature values. *Traces:* PRD §17, §55

**FR-CONS-02 — Constraint attribution.** Each excluded site shall record every constraint it violated, not just the first.
*Acceptance:* Given a site violating land use and minimum area, when its exclusion is inspected, then both constraints are listed. *Traces:* PRD §24

**FR-CONS-03 — Configurable constraint set.** Constraints shall be data-driven configuration, versioned with the scenario, not hardcoded logic.
*Acceptance:* Given a scenario created under constraint set *v1*, when *v2* is published, then re-opening the scenario reproduces *v1* results. *Traces:* PRD §48

**FR-CONS-04 — Soft constraints as penalties.** Soft constraints shall reduce score with a visible, quantified penalty rather than silently reordering results.
*Acceptance:* Given a site with a soft-constraint penalty, when its explanation is shown, then the penalty magnitude and cause appear as a distinct line item. *Traces:* PRD §18, §24

### 8.4 Suitability and Recommendation

**FR-REC-01 — Site × intervention scoring.** The system shall score every (candidate site, applicable intervention) pair, not sites alone.
*Acceptance:* Given a candidate site and five applicable interventions, when recommendations are requested, then five scored pairs are returned, ordered. *Traces:* PRD §19, §20

**FR-REC-02 — Transparent baseline.** The MVP scoring function shall be an explicit weighted model whose contributions are decomposable per feature.
*Acceptance:* Given any score, when decomposition is requested, then the per-feature contributions sum to the score within rounding tolerance. *Traces:* PRD §20, §24

**FR-REC-03 — Explanation is mandatory.** No score shall be exposed through any interface without an accompanying explanation.
*Acceptance:* Given an API response containing a score, when it is inspected, then an explanation object is present. *Traces:* PRD §24, §55

**FR-REC-04 — Counterfactual.** For each recommendation, the system shall state the smallest change that would alter the recommended intervention.
*Acceptance:* Given a recommendation, when a counterfactual is requested, then at least one feature and threshold is returned, or an explicit statement that none was found. *Traces:* PRD §25

**FR-REC-05 — No circularity.** Features used to produce a recommendation shall not include targets derived from prior recommendations of the same system.
*Acceptance:* Given the feature register, when it is audited, then no feature derives from a system-generated score or endorsement. *Traces:* PRD §23

**FR-REC-06 — ML is additive, not authoritative.** Any ML ranking introduced later shall operate strictly within the candidate set produced by hard constraints, and shall be comparable against the weighted baseline.
*Acceptance:* Given ML ranking enabled, when results are produced, then no non-candidate site appears, and the baseline comparison is available. *Traces:* PRD §21, §55

### 8.5 Scenarios and Optimization

**FR-SCEN-01 — Scenario definition.** A scenario shall capture weights, constraint set, budget, objective configuration, and the data/feature/model versions in force.
*Acceptance:* Given a saved scenario, when it is fetched, then all listed fields are present. *Traces:* PRD §31, §48

**FR-SCEN-02 — Reproducibility over time.** Re-running a stored scenario shall produce identical results irrespective of later data publication.
*Acceptance:* Given a scenario stored today, when it is re-run after new data versions are published, then results are identical and no silent recomputation occurs. *Traces:* PRD §48

**FR-SCEN-03 — Portfolio optimization under budget.** The optimizer shall select a portfolio maximizing the configured objective subject to budget and constraints.
*Acceptance:* Given a budget insufficient for all candidates, when optimization runs, then the returned portfolio respects the budget and reports the objective value achieved. *Traces:* PRD §26, §27

**FR-SCEN-04 — Redundancy penalty.** The optimizer shall account for overlapping catchments so that two sites serving the same population are not both selected on individual merit alone.
*Acceptance:* Given two high-scoring sites with largely overlapping catchments and a constrained budget, when optimization runs, then the portfolio explanation shows the marginal contribution of the second site reduced by overlap. *Traces:* PRD §26, §29

**FR-SCEN-05 — Marginal impact reporting.** Each portfolio member shall report its marginal contribution to the objective.
*Acceptance:* Given an optimized portfolio, when it is inspected, then each element carries a marginal impact value. *Traces:* PRD §28

**FR-SCEN-06 — Equity reporting.** Each portfolio shall report a territorial equity measure before and after the proposed interventions.
*Acceptance:* Given an optimized portfolio, when the summary is rendered, then baseline and post-intervention equity values are shown with the measure named. *Traces:* PRD §30

**FR-SCEN-07 — Scenario comparison.** The system shall compare at least three scenarios side by side across objective, cost, population served, deficit reduction, equity and risk exposure.
*Acceptance:* Given three saved scenarios, when comparison is requested, then a single view presents all listed dimensions. *Traces:* PRD §32

**FR-SCEN-08 — Sensitivity analysis.** The system shall report how the portfolio changes under perturbation of weights and budget.
*Acceptance:* Given a scenario, when sensitivity is run, then the system reports which portfolio members are stable and which are sensitive, with the perturbation range used. *Traces:* PRD §33

**FR-SCEN-09 — Asynchronous optimization above threshold.** Optimization runs exceeding the synchronous threshold (NFR-PERF-06) shall execute as jobs with queryable status.
*Acceptance:* Given an optimization exceeding the threshold, when it is requested, then the API returns a job identifier and the client can poll status to completion or failure. *Traces:* PRD §27

### 8.6 Confidence and Degraded Operation

**FR-QUAL-01 — Per-site confidence.** Each site shall carry a confidence value derived from input completeness, data staleness, catchment method and constraint certainty.
*Acceptance:* Given a site with stale inspection date and buffer-based catchment, when confidence is computed, then it is lower than an equivalent site with current data and network catchment, and the drivers are listed. *Traces:* PRD §34

**FR-QUAL-02 — Data quality alerts.** The system shall raise alerts for missing layers, stale sources, geometry anomalies and distributional shifts.
*Acceptance:* Given a source past its declared update frequency, when the quality check runs, then an alert is visible to `analyst` and `admin`. *Traces:* PRD §35

**FR-DEG-01 — Defined degraded modes.** For each required layer, the system shall define whether its absence causes: full stop, feature omission with confidence penalty, or documented fallback.
*Acceptance:* Given the risk layer is unavailable, when scoring is attempted, then the system stops and states that risk is a blocking dependency, rather than scoring without it. *Traces:* PRD §34, §55

**FR-DEG-02 — Degradation is visible, never silent.** Any result produced under degraded conditions shall be labeled in the interface and in every export.
*Acceptance:* Given a scenario computed with an omitted optional layer, when a report is exported, then the omission and its effect are stated in the report. *Traces:* PRD §34

### 8.7 Map and Interface

**FR-UI-01 — Map-first.** The primary interface shall be an interactive map with site selection, filtering and layer control.
*Acceptance:* Given the application loads, when the user takes no action, then a map with base layers and sites is the primary view. *Traces:* PRD §38

**FR-UI-02 — Site detail panel.** Selecting a site shall present its attributes, feature vector, state, recommendations, explanation and confidence.
*Acceptance:* Given a selected site, when the panel opens, then all listed elements are present. *Traces:* PRD §40

**FR-UI-03 — Scenario builder.** Users with `planner` role shall configure weights, budget and constraints, run optimization, and save the scenario.
*Acceptance:* Given a `planner`, when a scenario is configured and saved, then it is retrievable and reproducible. *Traces:* PRD §31

**FR-UI-04 — Filters.** The map shall filter by bbox, commune, neighborhood, risk level, damage status, intervention type and score range.
*Acceptance:* Given a filter combination, when applied, then the map, list and counters update consistently. *Traces:* PRD §42

**FR-UI-05 — Accessibility.** The interface shall meet WCAG 2.1 level AA, including keyboard operability and a non-color-dependent encoding for every map-based categorical distinction.
*Acceptance:* Given an automated and manual audit, when it is run, then no level A or AA violation remains open. *Traces:* Resolución 1519 de 2020

**FR-UI-06 — Spanish interface.** All user-facing text, exports and reports shall be in Spanish, with terminology matching POT and DANE usage.
*Acceptance:* Given any screen or export, when reviewed, then no untranslated string is present. *Traces:* CON-02

**FR-UI-07 — Uncertainty is visible in the map.** Confidence shall be encoded in the map itself, not only in detail panels.
*Acceptance:* Given sites of differing confidence, when the map renders, then their confidence is visually distinguishable. *Traces:* PRD §55 *Uncertainty is a feature*

### 8.8 Exports and Reporting

**FR-EXP-01 — Export formats.** The system shall export GeoJSON, CSV, scenario JSON and PDF.
*Acceptance:* Given a scenario, when each format is exported, then the file opens in its standard tooling with the expected content. *Traces:* PRD §51

**FR-EXP-02 — Scenario JSON round-trip.** An exported scenario JSON shall re-import and reproduce identical results.
*Acceptance:* Given an exported scenario, when re-imported, then the resulting portfolio is identical. *Traces:* PRD §48

**FR-EXP-03 — Executive report.** The system shall generate the Urban Recovery Strategy summary of PRD §50.
*Acceptance:* Given an optimized scenario, when the report is generated, then it contains sites analyzed, priority sites, intervention mix, population served, investment, equity change, deficit reduction and average confidence. *Traces:* PRD §50

**FR-EXP-04 — Self-contained evidence.** Every export shall embed provenance, versions, synthetic-data status and generation timestamp, so it remains interpretable without platform access.
*Acceptance:* Given an export opened a year later with no system access, when inspected, then all listed metadata is present. *Traces:* CON-07

---

## 9. Non-Functional Requirements

| ID | Requirement | Target | Verification |
|---|---|---|---|
| NFR-PERF-01 | Map first meaningful render | < 2 s | Measured on reference hardware, cold cache, reference dataset |
| NFR-PERF-02 | Bounding-box site query | < 300 ms p95 | Load test at reference volume |
| NFR-PERF-03 | Site detail (features + score + explanation) | < 500 ms p95 | Load test |
| NFR-PERF-04 | Full feature recomputation | < 30 min | Timed batch run |
| NFR-PERF-05 | Scenario comparison view | < 1.5 s for 3 scenarios | Load test |
| NFR-PERF-06 | Synchronous optimization threshold | 10 s; beyond this, asynchronous job (FR-SCEN-09) | Timed run at reference volume |
| NFR-SCALE-01 | Reference volume | ~1,500 sites; ~10,000 census blocks; < 5M features per layer | Dataset fixture |
| NFR-SCALE-02 | Concurrency | 15 simultaneous users without target degradation | Load test |
| NFR-AVAIL-01 | Availability | 99% during business hours; no high-availability topology required | Uptime monitoring |
| NFR-REPRO-01 | Scenario reproducibility | Identical results at 12 months | Stored-scenario regression suite |
| NFR-SEC-01 | PII in analytical database | Zero, enforced by CI test | FR-PII-02 |
| NFR-SEC-02 | Transport | TLS on all endpoints; secrets never in source control | Configuration review |
| NFR-OPS-01 | Batch recomputation window | Nightly, outside business hours | Scheduler configuration |
| NFR-OPS-02 | Recovery point objective | 24 h | Backup verification, restore drill |
| NFR-MAINT-01 | Test coverage on scoring, constraints and optimizer | Deterministic unit tests for all three, with fixed fixtures | CI |
| NFR-PORT-01 | Deployment | Reproducible from a documented environment definition; no undocumented manual steps | Clean-environment rebuild |

**Interpretation note on NFR-PERF-06.** The 10-second threshold is an architectural fork, not a tuning parameter: below it the scenario is an ordinary request; above it the system needs a queue, job state and frontend polling. FR-SCEN-09 assumes the asynchronous path exists from the start.

---

## 10. External Interface Requirements

### 10.1 API

Base contract per PRD §42, extended:

```http
GET  /api/sites
GET  /api/sites/:id
GET  /api/sites/:id/recommendations
GET  /api/sites/:id/explanation
POST /api/scenarios
GET  /api/scenarios/:id
POST /api/scenarios/:id/optimize
GET  /api/scenarios/:id/optimize/:job_id
GET  /api/scenarios/compare
POST /api/scenarios/:id/sensitivity
GET  /api/exports/:scenario_id?format=
GET  /api/data-sources
GET  /api/quality/alerts
GET  /api/audit
```

**FR-API-01 — Versioned contract.** Breaking changes shall require a new API version; existing clients shall continue to function against the prior version for the duration of the pilot.
*Acceptance:* Given a breaking change, when it ships, then the prior version remains reachable and documented.

**FR-API-02 — Every payload carries provenance.** Responses containing scores or aggregates shall include data version, feature version, model version and synthetic status.
*Acceptance:* Given any scored response, when inspected, then all four fields are present. *Traces:* PRD §48, FR-SYN-04

**FR-API-03 — Tiled delivery for heavy layers.** Large spatial layers shall be delivered as vector tiles, not as full GeoJSON payloads.
*Acceptance:* Given the buildings layer at city scale, when the map loads, then no single response exceeds the declared payload ceiling. *Traces:* PRD §45

### 10.2 External sources

**FR-EXT-01 — Source failure isolation.** Failure of any external source shall degrade only the features depending on it, per FR-DEG-01, and shall never render the platform unavailable.
*Acceptance:* Given an unreachable WFS endpoint, when the application loads, then it serves the last published version of that layer and raises a staleness alert. *Traces:* PRD §35

---

## 11. Pilot Definition of Done

The pilot is complete when all of the following hold:

- [ ] All `FR-PII-*`, `FR-AUTH-*` and `FR-AUDIT-01` pass
- [ ] The damage data contract (§6) is frozen and implemented behind an adapter (FR-DC-02)
- [ ] The synthetic generator satisfies FR-SYN-01 through FR-SYN-06
- [ ] Feature engine produces the PRD §12 vector with declared apportionment and versioning
- [ ] Hard constraints demonstrably precede scoring (FR-CONS-01), verified by a test case a high-scoring invalid site cannot pass
- [ ] Every exposed score carries an explanation and a counterfactual
- [ ] Budget-constrained portfolio optimization runs with redundancy and equity reporting
- [ ] Three scenarios can be built, compared, exported and reproduced from export
- [ ] Degraded modes defined for every required layer and exercised at least once
- [ ] NFR-PERF-01 through NFR-PERF-06 measured and met at reference volume
- [ ] WCAG 2.1 AA audit closed
- [ ] A scenario stored at pilot start reproduces identically at pilot end (NFR-REPRO-01)
- [ ] The evidence package of CON-07 is produced and reviewed by the institutional counterpart

---

## 12. Traceability Summary

| PRD section | Requirements |
|---|---|
| §7 Opportunity Site | FR-LIFE-01..03, §5 |
| §9.1 Damage source | §6, FR-DC-01..02, FR-SYN-01..06 |
| §10 Pipeline | FR-ING-01..05 |
| §12 Feature store | FR-FEAT-01..06 |
| §13–15 Accessibility, catchments, deficits | FR-FEAT-02..04 |
| §17–18 Constraints | FR-CONS-01..04 |
| §19–20 Suitability, formula | FR-REC-01..02 |
| §21–23 ML, ground truth, circularity | FR-REC-05..06 |
| §24–25 Explainability, counterfactuals | FR-REC-03..04 |
| §26–30 Optimization, marginal, redundancy, equity | FR-SCEN-03..06 |
| §31–33 Scenarios, comparison, sensitivity | FR-SCEN-01..02, 07..08 |
| §34–35 Confidence, alerts | FR-QUAL-01..02, FR-DEG-01..02 |
| §38–41 Interface | FR-UI-01..07 |
| §42 API | FR-API-01..03 |
| §45 Performance | NFR-PERF-*, FR-API-03 |
| §48 Reproducibility | FR-ING-02, FR-SCEN-02, NFR-REPRO-01 |
| §49 Security and privacy | FR-AUTH-01..03, FR-PII-01..03 |
| §50–51 Output, exports | FR-EXP-01..04 |

---

## 13. Open Items

| ID | Question | Blocks |
|---|---|---|
| OI-01 | Which pedestrian routing engine underlies catchments? | FR-FEAT-02, NFR-PERF-04 — resolved in ARD |
| OI-02 | Which optimization algorithm family for the pilot? | FR-SCEN-03, NFR-PERF-06 — resolved in ARD |
| OI-03 | Which equity measure is institutionally acceptable? | FR-SCEN-06 |
| OI-04 | Which public-space standard applies in Pereira, and who owns it? | FR-FEAT-04 |
| OI-05 | Which intervention unit costs, and from which official source? | FR-SCEN-03, FR-EXP-03 |
| OI-06 | Who at the institution holds authority to `ENDORSE` a site? | FR-LIFE-01, §5.2 |
| OI-07 | Is population apportionment dasymetric or proportional-by-area? | FR-FEAT-06 |
| OI-08 | Retention period for audit log after pilot close | FR-AUDIT-01 |
