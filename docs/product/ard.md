# ARD — Urban Recovery Intelligence Platform

**Document type:** Architecture Requirements & Decisions
**Parent documents:** PRD v1.0, SRS v0.1
**Delivery horizon:** Institutional pilot (months)
**Data plane:** Supabase (managed PostgreSQL)
**Version:** 0.1 — draft for review

---

## 1. Purpose

The PRD defines the product. The SRS defines what must be true. This document records **how the system is built and why**, decision by decision, so that each choice can be revisited against its stated reasoning rather than rediscovered.

Each decision follows: context → decision → consequences → alternatives rejected. Decisions marked **REVISIT** carry a named trigger condition.

---

## 2. Architectural Drivers

The drivers that actually shape this architecture, in order of force:

| # | Driver | Source | Shapes |
|---|---|---|---|
| D1 | Reproducibility of a scenario at 12 months | NFR-REPRO-01, PRD §48 | Versioning, storage model, migrations |
| D2 | Hard constraints must precede scoring, structurally | FR-CONS-01, PRD §55 | Pipeline stage ordering, module boundaries |
| D3 | Zero PII in the analytical database | CON-04, FR-PII-01 | Ingestion, schema, hosting acceptability |
| D4 | Damage data is synthetic and must be replaceable by adapter alone | CON-01, FR-DC-02 | Ingestion boundary |
| D5 | Small volume, small user count, institutional pilot | CON-02, CON-03 | Rules out distributed architecture |
| D6 | Optimization may exceed the synchronous threshold | NFR-PERF-06, FR-SCEN-09 | Job queue is mandatory, not optional |
| D7 | Every output must be explainable and attributable | FR-REC-03, FR-AUDIT-01 | Scoring must stay decomposable |

D5 is the driver most often ignored in systems like this. The volumes here (~1,500 sites, ~10,000 census blocks) are small. Most complexity in this design exists to serve D1, D2 and D7, not scale.

---

## 3. System Overview

```text
┌──────────────────────────────────────────────────────┐
│ CLIENT                                               │
│ React + MapLibre GL + deck.gl                        │
└───────────────┬──────────────────────────────────────┘
                │ HTTPS, Supabase JWT
                ▼
┌──────────────────────────────────────────────────────┐
│ APPLICATION  (container, single deployable)          │
│                                                      │
│  FastAPI                                             │
│   ├── api/          REST + vector tiles              │
│   ├── ingestion/    adapters, validation, versioning │
│   ├── features/     spatial feature engine           │
│   ├── constraints/  hard + soft evaluation           │
│   ├── scoring/      suitability, explanation         │
│   ├── optimizer/    portfolio selection              │
│   └── reporting/    exports, executive report        │
│                                                      │
│  Worker (same image, different entrypoint)           │
│   └── consumes job queue                             │
└───────────────┬──────────────────────────────────────┘
                │ Postgres protocol (Supavisor)
                ▼
┌──────────────────────────────────────────────────────┐
│ SUPABASE                                             │
│  PostgreSQL 15/17                                    │
│   ├── PostGIS        geometry, spatial ops           │
│   ├── pgRouting      pedestrian network, catchments  │
│   ├── pg_cron        nightly batch trigger           │
│   ├── pgmq           job queue                       │
│   ├── pgAudit        DB-level audit                  │
│   └── pgTAP          DB-level invariant tests        │
│  Auth (GoTrue)       identity, JWT, roles            │
│  Storage             exports, report artifacts       │
└──────────────────────────────────────────────────────┘
                ▲
                │ scheduled pulls, never client-side
┌───────────────┴──────────────────────────────────────┐
│ EXTERNAL SOURCES                                     │
│ DANE · IDE AMCO (WFS) · SGC · IDEAM · CARDER · OSM   │
│ Megabús · synthetic damage generator                 │
└──────────────────────────────────────────────────────┘
```

---

## 4. Decision Record

### ADR-01 — Modular monolith, not microservices

**Context.** Seven functional modules (ingestion, features, constraints, scoring, optimizer, reporting, API) with a tiny user base (D5) and a hard requirement that stages execute in a fixed order (D2).

**Decision.** One FastAPI application, one deployable image, seven packages with enforced import boundaries. The worker is the same image with a different entrypoint. Cross-module calls go through explicit interfaces; a lint rule forbids `scoring` importing from `optimizer`, and forbids anything importing `ingestion` internals.

**Consequences.** Single deployment, single version, trivially consistent. Module boundaries are enforced by convention and CI rather than network, which is cheaper but requires discipline. Extraction of a module later is a refactor, not a rewrite, because the interfaces already exist.

**Rejected.** Microservices — adds network failure modes, deployment coordination and version skew to buy scaling nobody needs at 15 concurrent users. Serverless functions per stage — breaks the long-running batch and optimizer work, and fragments the reproducibility story.

---

### ADR-02 — pgRouting inside Supabase for pedestrian catchments

**Context.** FR-FEAT-02 requires network-based walking catchments, not buffers. The pedestrian network comes from OSM. Options: pgRouting in the database, or an external routing service (Valhalla, OSRM, R5).

**Decision.** Build the pedestrian graph as PostGIS tables and compute catchments with `pgr_drivingDistance` inside Supabase. Catchments are precomputed in the nightly batch, not on request.

**Consequences.** No additional service to deploy, secure or keep in sync with the network version. Catchments live beside the population data they intersect, so the whole feature computation is one SQL pipeline with a single version stamp — which serves D1 directly. Walking-cost modeling is cruder than Valhalla's (no slope, no crossing penalties, no sidewalk quality); for a comparative city-scale analysis this is acceptable, and the limitation is documented rather than hidden.

**Rejected.** Valhalla/OSRM — better isochrones, but a second service, a second data version to pin, and no path to reproducibility without also versioning its graph build. R5/OpenTripPlanner — justified only for true multimodal isochrones, which the pilot does not need (see ADR-03).

**REVISIT if:** slope becomes a stated planning criterion (Pereira's topography makes this plausible), or catchment computation exceeds the NFR-PERF-04 batch window.

---

### ADR-03 — Transit as proximity, not as multimodal isochrone

**Context.** PRD §9.9 wants transit accessibility from Megabús. Full multimodal isochrones require GTFS, a schedule-aware router, and a time-of-day dimension in every feature.

**Decision.** For the pilot, transit accessibility is modeled as walking distance to the nearest station plus a service-frequency attribute on that station. The feature name and interface are designed so a multimodal computation can replace the implementation later.

**Consequences.** Removes an entire dimension (time of day) from the feature store and keeps every feature a single scalar. Loses the ability to answer "how many people can reach this site in 30 minutes by bus at 7am". That question is not in the MVP.

**Rejected.** GTFS + R5 now — cost is a routing service, a schedule dimension across the feature store, and a substantially larger validation surface, for a question the pilot does not ask.

---

### ADR-04 — Supabase as data plane, separate container for compute

**Context.** Supabase provides managed PostgreSQL with PostGIS, pgRouting, pg_cron, pgmq, pgAudit and pgTAP, plus Auth and Storage. It does not host Python application code. The system needs a long-running Python process for the feature engine and optimizer.

**Decision.** Supabase holds the data plane (database, auth, storage). The FastAPI application and worker run in a container on a separate host, deployed in the region closest to the Supabase project. Edge Functions are not used for core logic.

**Consequences.** Two things to operate instead of one, but each is boring. All heavy spatial work runs where the data is (inside Postgres, via SQL and pgRouting), with Python orchestrating rather than transporting geometries — which keeps the network out of the hot path. Region pairing matters: a mismatched region adds latency to every query in the nightly batch.

**Rejected.** Edge Functions for the pipeline — Deno runtime, execution time limits, and no fit for a 30-minute batch. Self-hosted Postgres — recovers control but costs backup, PITR, upgrade and monitoring work the pilot has no budget for.

---

### ADR-05 — Supabase Auth for identity, restricted DB role + RLS for enforcement

**Context.** FR-AUTH-01..03 require authentication, server-side role enforcement, and sensitivity tiers. The default Supabase pattern gives clients direct database access through PostgREST with RLS. That pattern does not fit here: the API is not CRUD, it is a computation pipeline.

**Decision.** Supabase Auth issues identity and JWTs. The React client never talks to PostgREST for domain data; it talks to FastAPI. FastAPI verifies the JWT, resolves the role from `app_metadata`, and connects to Postgres **with a restricted role, not `service_role`**. RLS policies remain active as defense in depth, so a bug in the API layer cannot leak an `INTERNAL` layer to a `viewer`.

**Consequences.** Two enforcement layers that must agree, which is deliberate: the SRS treats sensitivity as a data property, not a presentation choice. Using a non-`service_role` connection is the decision that makes RLS meaningful — with `service_role` all policies are bypassed and the second layer is theater.

**Rejected.** PostgREST direct from client — would push scoring and optimization logic into SQL views and RPCs, destroying the module boundaries of ADR-01 and the explainability of D7. `service_role` from the API — simpler, and silently removes the only structural defense against an authorization bug.

---

### ADR-06 — Reproducibility by immutable versions plus input pinning

**Context.** D1 requires that a scenario stored today reproduces identically in twelve months, across data refreshes, feature changes and model changes.

**Decision.** Three mechanisms together:
1. Datasets are append-only. A refresh creates `dataset_version n+1`; version *n* is never mutated.
2. Features and scores carry `feature_version`, `data_version`, `constraint_set_version`.
3. A scenario pins the exact version identifiers it used and stores a content hash of the candidate set and feature matrix that produced its result.

Re-running a scenario resolves the pinned versions. The hash is verified on re-run; a mismatch is an error surfaced to the user, never a silent recomputation.

**Consequences.** Storage grows with every refresh, which at this volume is irrelevant. The hash converts D1 from a promise into something the system can test, and NFR-REPRO-01 becomes a regression suite rather than a claim. Deleting old versions requires checking scenario references first.

**Rejected.** Full bitemporal modeling (`valid_from`/`valid_to` on every row) — correct and considerably more expensive to build and query, for a system where refreshes are infrequent and batch-shaped. Recomputing scenarios on refresh — directly violates PRD §48.

---

### ADR-07 — pgmq for jobs, pg_cron for schedule

**Context.** D6 makes a queue mandatory. The nightly batch (NFR-OPS-01) needs a scheduler. Both would normally mean Redis plus a scheduler service.

**Decision.** Job queue on pgmq inside Supabase; schedule on pg_cron. The worker container polls the queue. Job state, results and history live in Postgres alongside everything else.

**Consequences.** No Redis, no separate scheduler, no additional failure mode. Job history is queryable with the same SQL as the domain data, which makes the audit story (FR-AUDIT-01) uniform. Throughput ceiling is far above what 15 users generate. Long jobs must heartbeat so a crashed worker's message returns to the queue rather than stalling.

**Rejected.** Celery + Redis — standard, and adds a component whose only justification would be throughput the pilot will never reach. Synchronous optimization only — violates FR-SCEN-09 the first time a scenario exceeds ten seconds.

---

### ADR-08 — Greedy marginal-gain optimizer, MILP behind the same interface

**Context.** FR-SCEN-03..05 require budget-constrained portfolio selection with redundancy penalties and marginal impact per selection.

**Decision.** The pilot optimizer is greedy selection by marginal gain per unit cost. The objective is population-coverage based, therefore submodular, so greedy carries a known approximation bound rather than being a heuristic guess. The optimizer exposes a single interface (`select(candidates, budget, objective, constraints) -> portfolio`) so a CP-SAT/MILP implementation can be substituted without touching the scenario layer.

**Consequences.** Marginal impact (FR-SCEN-05) is a natural byproduct of greedy selection, not an extra computation. Redundancy (FR-SCEN-04) falls out of the coverage objective, since a second overlapping site contributes little marginal coverage by construction — the requirement is satisfied by the objective's shape rather than by a bolted-on penalty. Greedy will not find the true optimum under complex side constraints, and the gap is not reported unless a MILP run is available to compare against.

**Rejected.** MILP from the start — better solutions, slower to build, and harder to explain to a planner who needs to understand why a site was chosen. Multi-objective NSGA-II — the right tool once objectives genuinely conflict and a Pareto front is wanted; premature while the objective is a single weighted function.

**REVISIT if:** side constraints multiply (spatial quotas per commune, phasing across years), or a stakeholder asks how far from optimal the portfolio is.

---

### ADR-09 — Transparent weighted scoring; ML deferred and bounded

**Context.** D7 and FR-REC-02 require decomposable scores. PRD §22 acknowledges there is no ground truth for "correct" interventions.

**Decision.** The scoring function is an explicit weighted linear model over normalized features. Contributions decompose exactly and sum to the score. No ML in the pilot. When ML arrives (PRD §21), it ranks strictly within the candidate set produced by hard constraints and is always benchmarked against this baseline.

**Consequences.** Explanations are exact rather than approximated — no SHAP, no surrogate model, no explanation that can disagree with the score. Normalization becomes a versioned decision, since it determines what a weight means. The system cannot discover non-linear relationships, which matters less than it sounds given there is no label to learn from.

**Rejected.** Gradient boosting with SHAP now — produces an explanation layer that approximates a model trained on labels that do not exist. That is circularity (PRD §23) wearing a technical costume.

---

### ADR-10 — Vector tiles from ST_AsMVT via FastAPI; PMTiles for heavy static layers

**Context.** FR-API-03 and NFR-PERF-01/02 rule out shipping full GeoJSON of city-scale layers.

**Decision.** Sites, scores and scenario layers are served as dynamic MVT tiles from a FastAPI endpoint wrapping `ST_AsMVT`, so tiles reflect the user's filters and the scenario in view. Static heavy layers (buildings, parcels) are pregenerated as PMTiles and served from Supabase Storage.

**Consequences.** One tile path is live and filterable; the other is cheap and cached. Dynamic tiles need a GIST index and a bbox predicate on every query — non-negotiable for NFR-PERF-02. Filter-dependent tiles are cache-unfriendly by nature, so cache keys must include the filter set.

**Rejected.** martin/pg_tileserv sidecar — capable, but a second service that must replicate the API's authorization rules; with role-dependent layer visibility (FR-AUTH-03) that duplication is a security liability. All-static tiles — cannot express scenario state.

---

### ADR-11 — Supabase migrations own DDL; dbt owns derived models

**Context.** Both the Supabase CLI and dbt want to manage database objects. Uncontrolled, they collide.

**Decision.** A clean split by schema. Supabase migrations own `core` (sources, sites, geometries, scenarios, audit, RLS policies, extensions). dbt owns `analytics` (feature tables, deficit models, derived aggregates) and may only read from `core`. dbt never writes to `core`; migrations never create objects in `analytics`.

**Consequences.** Feature logic lives in versioned SQL with lineage and tests, which serves D1. The boundary must be enforced in review, since nothing in Postgres prevents a violation. Feature recomputation is a dbt run triggered by the worker, making `feature_version` a natural dbt artifact.

**Rejected.** dbt for everything — loses Supabase's migration and RLS tooling. Raw SQL migrations for everything — loses lineage and testing on exactly the layer where D1 is hardest to hold.

---

### ADR-12 — Connection handling through Supavisor, session-aware

**Context.** Supabase fronts Postgres with the Supavisor pooler. Transaction-mode pooling does not support prepared statements the way a long-lived Python driver expects, and long analytical queries behave differently from short API queries.

**Decision.** Two connection paths. The API uses transaction-mode pooling with prepared statements disabled in the driver. The worker uses a session-mode/direct connection with a longer statement timeout, since batch and pgRouting work runs for minutes.

**Consequences.** Two configurations to keep straight, and a class of bug that appears only under load if the API path is misconfigured. Statement timeouts must be set per path, or the nightly batch dies against an API-appropriate limit.

---

### ADR-13 — React, MapLibre GL, deck.gl only where needed

**Context.** FR-UI-01..07. The frontend must render a map-first interface and must not consume external sources directly (PRD §44).

**Decision.** React with MapLibre GL for base map and vector tiles; deck.gl layered on top only for heavy overlays (catchment surfaces, coverage heatmaps). Server state through TanStack Query. No spatial computation in the browser — every number the user sees comes from the API with its provenance attached (FR-API-02).

**Consequences.** The client cannot drift from the server's numbers, because it never computes any. deck.gl is introduced only where MapLibre's styling is insufficient, keeping the bundle and the rendering model simple for the common case.

---

### ADR-14 — Region selection and the public-entity hosting question

**Context.** A Colombian public institution will be asked to accept a system whose data lives in managed infrastructure outside the country.

**Decision.** Deploy the Supabase project in the closest available region and pair the application container to it. Document explicitly that the analytical database contains no personal data (D3, FR-PII-01..03), since that is the fact that makes the arrangement defensible rather than merely convenient. Preserve a self-hosting exit path: no dependency on a Supabase-proprietary feature that lacks an open-source equivalent in the self-hosted distribution.

**Consequences.** The exit path constrains feature adoption — it is the reason core logic stays in FastAPI and standard Postgres extensions rather than in Supabase-specific services. If the institution requires domestic hosting, the migration is a database restore and a container redeploy, not a redesign.

**REVISIT if:** the institution states a data residency requirement, or any real (non-synthetic) damage data with residual re-identification risk is ever ingested.

---

## 5. Cross-Cutting Concerns

### 5.1 Pipeline execution order

The stage order is enforced structurally, not by convention (D2):

```text
ingest → validate → version → features → constraints → candidates → score → explain → optimize
```

`scoring` receives a candidate set as input and has no access to excluded sites. A high score therefore cannot resurrect an invalid site, because the invalid site is not present in the data structure scoring operates on. This is the architectural expression of PRD §55 *Hard constraints before ML*.

### 5.2 Provenance propagation

`is_synthetic`, `data_version`, `feature_version` and `constraint_set_version` travel together as a provenance struct attached to every computed row and every API response (FR-API-02). Serialization of a scored object without its provenance struct fails at the schema level rather than passing silently.

### 5.3 Testing strategy

| Layer | Approach |
|---|---|
| Constraints | Deterministic unit tests with fixed fixtures; one test asserts a maximum-score invalid site never appears in any ranking |
| Scoring | Contribution decomposition sums to the score within tolerance, property-based across generated feature vectors |
| Optimizer | Known-optimum small instances; budget respected; marginal gains monotonically non-increasing |
| Features | Golden-dataset comparison per feature version |
| Reproducibility | Stored-scenario regression suite run in CI (NFR-REPRO-01) |
| PII | Schema scan against the prohibited-field dictionary (FR-PII-02) |
| Database invariants | pgTAP tests on RLS policies and version immutability |

### 5.4 Observability

Structured logs with correlation IDs spanning API request → job → SQL. Batch runs emit duration per stage against the NFR-PERF-04 budget. Data quality alerts (FR-QUAL-02) are rows in a table with a dashboard view, not emails — an alert nobody can query is an alert nobody acts on.

---

## 6. Architectural Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | pgRouting catchment computation exceeds the nightly batch window at full site count | Measure early on the reference dataset; precompute per threshold; fall back to fewer thresholds before abandoning ADR-02 |
| R2 | Supabase compute tier undersized for batch spatial work | Size against the reference dataset in Phase 1, not at pilot end; batch runs off-hours so tier can be raised temporarily |
| R3 | Synthetic provenance lost in a code path nobody tested | Provenance struct mandatory at serialization; one test per output format (map, CSV, GeoJSON, PDF) |
| R4 | RLS and API authorization drift apart | pgTAP tests for policies; API authorization tests reference the same role matrix fixture |
| R5 | OSM pedestrian network quality varies by neighborhood, biasing catchments toward well-mapped areas | Measure network density per commune; expose it as a confidence driver (FR-QUAL-01) rather than letting it silently distort equity results |
| R6 | The institution rejects offshore hosting late in the pilot | ADR-14 exit path; raise the question in the first institutional session, not the last |

R5 deserves emphasis: an equity analysis built on unevenly mapped infrastructure can invert its own conclusion, favoring the neighborhoods that were already better documented. This is a correctness risk, not a data quality nuisance.

---

## 7. Open Items

| ID | Question | Decision owner | Blocks |
|---|---|---|---|
| OI-A1 | Container host for the application (Fly.io / Railway / Render / institutional infra) | Felipe | ADR-04 region pairing |
| OI-A2 | Supabase plan — PITR and backup retention adequate for NFR-OPS-02 | Felipe | R2, NFR-OPS-02 |
| OI-A3 | Pedestrian cost model: flat speed or slope-adjusted | GIS | ADR-02, R1 |
| OI-A4 | Equity measure (Gini on access, deficit gap, other) — institutionally acceptable form | Institution | FR-SCEN-06, SRS OI-03 |
| OI-A5 | Intervention unit costs and their official source | Institution | ADR-08 objective, FR-EXP-03 |
| OI-A6 | Population apportionment method | Data | FR-FEAT-06, SRS OI-07 |

SRS OI-01 and OI-02 are resolved here by ADR-02 and ADR-08.
