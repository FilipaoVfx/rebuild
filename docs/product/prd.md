# PRD — Urban Recovery Intelligence Platform

**Working name:** Urban Recovery Intelligence  
**Project:** Spatial Decision Intelligence for Post-Disaster Urban Decisions  
**Case:** Pereira, Colombia — recovery after the August 10, 2026 earthquake  
**Version:** 1.0  
**Audience:** Product, Backend, Data Engineering, GIS, ML/AI, Frontend and UX/UI teams

---

## 1. Executive Summary

Urban Recovery Intelligence is a spatial decision-support platform designed to answer:

> **Where should we intervene, what should we build there, why, how much value does it generate, and which combination of sites produces the best overall outcome?**

The platform combines:

- Post-disaster affected/demolished sites
- Population and demographic context
- Public-space and infrastructure deficits
- Accessibility and pedestrian connectivity
- Land use and territorial planning
- Environmental and geological risk
- Existing infrastructure and mobility
- Site characteristics
- Social vulnerability
- Cost and intervention constraints

The system transforms these inputs into:

1. Priority sites
2. Recommended interventions
3. Explainable scores
4. Population and territory served
5. Alternative uses
6. Budget scenarios
7. Portfolio optimization
8. Equity and redundancy analysis
9. Sensitivity and uncertainty analysis
10. Decision-ready maps and reports

The product is **not an autonomous AI deciding what a city should build**.

It is a **Spatial Decision Intelligence system** that allows planners and public institutions to compare evidence-based alternatives and understand the consequences of different investments.

---

# 2. Problem

After a disaster, damaged or demolished properties create a unique opportunity.

The obvious question is:

> "What was here before?"

The more valuable question is:

> "What does this territory need now?"

A damaged residential building does not necessarily need to be replaced with another residential building.

The site could potentially become:

- A park
- Public square
- Sports facility
- Community facility
- School
- Health facility
- Housing
- Commercial use
- Green corridor
- Open space
- Another compatible intervention
- Or remain unbuilt because of risk

The decision therefore depends on the relationship between:

**site + population + accessibility + deficits + infrastructure + risk + land use + cost + territorial strategy.**

---

# 3. Product Objective

Convert spatial and territorial data into a decision system capable of answering:

### WHERE?

Which affected sites are the highest-priority opportunities?

### WHAT?

What intervention would generate the greatest value at each site?

### WHY?

Which measurable territorial factors explain that recommendation?

### HOW MUCH?

How many people, households or facilities could benefit?

### WHAT IF?

How does the recommendation change under different budgets, priorities or constraints?

### WHICH COMBINATION?

Which portfolio of sites produces the best city-level outcome?

---

# 4. Core Product Principle

The fundamental unit of the platform is not simply the property.

It is the **decision**:

```text
WHERE + WHAT + WHY + HOW MUCH + WHAT IF + WHICH COMBINATION
```

This distinction is critical.

Ranking individual sites is insufficient because two individually excellent sites may serve the same population.

The system must therefore evolve from:

```text
Site Ranking
```

to:

```text
Portfolio Optimization
```

---

# 5. Non-Goals

The platform will NOT:

- Replace structural engineering inspections
- Certify buildings as safe or unsafe
- Issue construction permits
- Determine legal ownership
- Replace the POT
- Produce final architectural designs
- Guarantee construction costs
- Make legally binding public-policy decisions
- Automatically execute urban investments
- Expose personal disaster-victim information
- Present uncertain model outputs as facts

The system is a **decision-support layer**, not the legal or engineering authority.

---

# 6. Users

## Primary users

### Urban Planner

Needs to identify intervention opportunities and compare alternatives.

### Public Administration

Needs to allocate limited recovery budgets.

### GIS / Territorial Analyst

Needs to inspect spatial evidence and validate model outputs.

### Data Scientist

Needs reproducible spatial features and model evaluation.

### Infrastructure / Recovery Team

Needs prioritized projects and portfolio scenarios.

---

# 7. Core Entity: Opportunity Site

An **Opportunity Site** is a geographically defined location that can potentially become the subject of an intervention.

Examples:

- Demolished structure
- Severely damaged building
- Vacant lot
- Public property
- Underused property
- Strategic redevelopment site
- Potential acquisition site

Example:

```json
{
  "id": "site_087",
  "geometry": "...",
  "area_m2": 840,
  "neighborhood": "Example",
  "commune": "Example",
  "damage_status": "demolished",
  "land_use": "residential",
  "risk_level": "medium"
}
```

---

# 8. Functional Architecture

```text
                 EXTERNAL DATA SOURCES
                         │
        ┌────────────────┼────────────────┐
        │                │                │
      DANE             SGC             IDEAM
        │                │                │
     AMCO              OSM            CARDER
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  DATA INGESTION
                         │
                         ▼
                     RAW DATA
                         │
                         ▼
               VALIDATION / NORMALIZATION
                         │
                         ▼
                    POSTGRESQL
                     + POSTGIS
                         │
                         ▼
                SPATIAL FEATURE ENGINE
                         │
                         ▼
                   FEATURE STORE
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        SUITABILITY ENGINE     TERRITORIAL RULES
              │                     │
              └──────────┬──────────┘
                         ▼
                RECOMMENDATION ENGINE
                         │
                         ▼
                OPTIMIZATION ENGINE
                         │
                         ▼
                  DECISION LAYER
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
           MAP       SCENARIOS     REPORTS
```

---

# 9. Data Sources

## 9.1 Primary MVP Sources

### Post-earthquake damage / demolition

Required fields:

```text
site_id
geometry
address
neighborhood
commune
building_type
damage_level
habitability
demolition_authorized
demolition_status
inspection_date
area
source
```

This is the most important missing dataset.

If possible, obtain it directly from the relevant municipal authorities as an anonymized geospatial dataset.

Do NOT ingest:

- Names
- ID numbers
- Phone numbers
- Personal addresses when unnecessary
- Other personally identifiable information

---

## 9.2 DANE

Used for:

- Population
- Households
- Demographic structure
- Census geography
- Spatial population distribution

Potential spatial units:

- Manzanas
- Sectors
- Secciones
- Census areas

---

## 9.3 Public Space

Used for:

- Parks
- Green areas
- Sports facilities
- Public squares
- Recreation infrastructure

Main derived concept:

```text
Public-space deficit
```

---

## 9.4 OpenStreetMap

Used for:

- Roads
- Footways
- Pedestrian paths
- Buildings
- Parks
- Schools
- Health facilities
- POIs
- Transit stops

OSM should be treated as a supplementary geographic source, not as the legal authority for land ownership or planning regulations.

---

## 9.5 IDE AMCO

Potential layers:

- POT
- Urban boundaries
- Expansion areas
- Rural areas
- Land use
- Cadastral information
- Parcels
- Neighborhoods
- Communes
- Manzanas
- Address systems
- Mass-movement risk
- Territorial restrictions

The platform should prefer WFS/WMS/OGC interfaces when available.

---

## 9.6 SGC

Used for:

- Seismic hazard
- Geological conditions
- Landslide risk
- Mass movements
- Microzonation
- Historical seismicity

Risk should act primarily as a **constraint or penalty**, not simply as another ranking variable.

---

## 9.7 IDEAM

Potential uses:

- Hydrology
- Climate
- Environmental variables
- Flood-related information
- Environmental layers
- Water systems

---

## 9.8 CARDER

Potential uses:

- Ecological structure
- Protected areas
- Environmental restrictions
- Hydrology
- Regional environmental planning

---

## 9.9 Megabús

Potential uses:

- Transit accessibility
- Stations
- Routes
- Mobility connectivity
- Population access to public transport

---

## 9.10 Secondary Data

Potential future sources:

- SISBEN
- Sentinel satellite imagery
- Microsoft building footprints
- Pereira Cómo Vamos
- Infrastructure project datasets
- Utilities
- Economic activity
- Commercial data
- Historical interventions
- Property valuation
- Traffic and mobility data

---

# 10. Data Pipeline

The canonical pipeline is:

```text
SOURCE
   ↓
INGESTION
   ↓
RAW
   ↓
VALIDATION
   ↓
NORMALIZATION
   ↓
POSTGIS
   ↓
SPATIAL FEATURES
   ↓
FEATURE STORE
   ↓
MODEL
   ↓
OPTIMIZER
   ↓
API
   ↓
FRONTEND
```

Every dataset should maintain:

```text
source
source_url
retrieved_at
version
license
spatial_reference
update_frequency
quality_score
```

---

# 11. Spatial Database

Recommended:

```text
PostgreSQL + PostGIS
```

Core tables:

```text
sites
parcels
buildings
population_areas
parks
facilities
roads
transit
risk_zones
land_use
interventions
site_features
site_scores
scenarios
scenario_sites
```

---

# 12. Feature Store

For every site, calculate a standardized spatial feature vector.

Example:

```text
population_500m
population_1km
population_10min

households_500m
households_1km

park_count_500m
park_area_1km
park_deficit

sports_facility_access
school_access
health_access

pedestrian_accessibility
transit_accessibility

social_vulnerability

building_density
road_connectivity
green_space_ratio

risk_score
land_use_compatibility

site_area
```

---

# 13. Accessibility

Euclidean distance is insufficient.

The preferred metric is **network-based accessibility**.

Instead of:

```text
distance = straight_line(site, population)
```

use:

```text
walking_network
      ↓
travel_time
      ↓
reachable_population
```

Possible thresholds:

```text
5 minutes
10 minutes
15 minutes
```

Example:

```text
population_10min = 4,820
```

This is much more useful than:

```text
population within 1 km = 6,300
```

---

# 14. Catchment Areas

Every intervention should have a service area.

Example:

```json
{
  "intervention": "park",
  "service_radius_m": 800,
  "minimum_area_m2": 500,
  "preferred_area_m2": 1500
}
```

Prefer network-based catchments when possible.

The catchment should calculate:

- Population served
- Households served
- Existing facilities
- Competing facilities
- Overlap with other candidate sites
- Accessibility
- Vulnerability
- Deficit

---

# 15. Urban Deficit Engine

The system must identify what the territory lacks.

Example:

```text
Population
    +
Existing services
    +
Accessibility
    +
Territorial standards
    =
Urban deficit
```

Possible deficits:

- Green space
- Parks
- Sports
- Education
- Health
- Community facilities
- Mobility
- Pedestrian infrastructure

The core conceptual shift is:

```text
"What can we build here?"
```

to:

```text
"What does this territory need?"
```

---

# 16. Intervention Catalog

Initial intervention types:

```text
PARK
SPORTS
PUBLIC_SQUARE
GREEN_CORRIDOR
COMMUNITY_FACILITY
EDUCATION
HEALTH
HOUSING
COMMERCIAL
OPEN_SPACE
NO_BUILD
```

Each intervention should define:

```text
minimum_area
preferred_area
service_radius
population_capacity
estimated_cost
allowed_land_use
risk_requirements
impact_features
```

Example:

```json
{
  "type": "park",
  "service_radius_m": 800,
  "minimum_area_m2": 500,
  "preferred_area_m2": 1500
}
```

---

# 17. Hard Constraints

Hard constraints eliminate candidates before ranking.

Examples:

```text
land_use incompatible
OR
prohibited risk
OR
site area below minimum
OR
legal restriction
OR
environmental restriction
```

Then:

```text
candidate = false
```

This should happen before ML ranking.

---

# 18. Soft Constraints

Soft constraints affect the score.

Examples:

- Cost
- Accessibility
- Population
- Moderate risk
- Connectivity
- Social vulnerability
- Environmental benefit

These become penalties or positive contributions.

---

# 19. Suitability Engine

For every:

```text
site × intervention
```

calculate a suitability score.

Example:

| Intervention | Score |
|---|---:|
| Park | 94.2 |
| Sports | 82.4 |
| Community | 76.1 |
| Housing | 61.8 |
| Commercial | 48.7 |

Example components:

```text
Population need
Public-space deficit
Accessibility
Social vulnerability
Connectivity
Environmental value
Risk
Land-use compatibility
Site capacity
```

---

# 20. Recommendation Formula

Initial MVP can use a weighted model:

```text
Score(site, intervention)
=
w1 * Need
+
w2 * Accessibility
+
w3 * Deficit
+
w4 * Vulnerability
+
w5 * Connectivity
+
w6 * EnvironmentalValue
-
w7 * Risk
-
w8 * ConstraintPenalty
```

Weights must be configurable.

The system should never hide them.

---

# 21. Machine Learning Strategy

Do NOT begin with a neural network.

The MVP should use:

```text
GIS rules
+
Spatial features
+
Weighted scoring
+
Optimization
```

Then introduce interpretable ML.

Recommended candidates:

- Random Forest
- Gradient Boosting
- XGBoost

Conceptually:

```text
P(site, intervention | urban_context)
```

However, until sufficient ground truth exists, this should be described as:

```text
Suitability
```

or:

```text
Estimated utility
```

rather than a true probability.

---

# 22. Ground Truth Problem

The biggest ML challenge is not the model.

It is the training data.

Initially there may be insufficient examples of:

```text
site → intervention → measured impact
```

Therefore:

### Phase 1

Use expert-weighted spatial decision rules.

### Phase 2

Collect historical interventions and observed outcomes.

### Phase 3

Train models using:

```text
historical context
+
intervention
+
observed outcome
```

Possible outcomes:

- Usage
- Accessibility improvement
- Population served
- Satisfaction
- Property-value change
- Environmental improvement
- Public-space utilization
- Equity improvement

---

# 23. Avoid Circularity

The model should not simply learn:

```text
cities built parks here
→ therefore build parks here
```

Instead, features should represent:

```text
territorial need
+
potential impact
+
constraints
```

Historical interventions can be used as evidence, but should not automatically become ground truth for optimal decisions.

---

# 24. Explainability

Every recommendation must answer:

> Why?

Example:

```text
Recommended: PARK

Score: 94.2

Main drivers:
+ High population within 10 minutes
+ Severe public-space deficit
+ High pedestrian accessibility
+ High social vulnerability
+ Compatible land use
- Moderate geological risk
```

The interface should show contribution by factor.

Possible techniques:

- Feature importance
- SHAP
- Counterfactual explanations

---

# 25. Counterfactuals

A powerful future feature:

> "What would need to change for this site to enter the top 20?"

Example:

```text
Current rank: #27

To reach top 20:
- Population catchment must increase by 14%
OR
- Park deficit must increase from 0.64 to 0.78
OR
- Risk constraint must be resolved
```

This converts the model from a black-box ranking into a strategic analysis tool.

---

# 26. Portfolio Optimization

This is one of the most important capabilities.

The platform should optimize combinations of sites.

Objective:

```text
maximize:
    population coverage
    accessibility
    equity
    deficit reduction
    environmental value

minimize:
    risk
    cost
    redundancy
```

Conceptual objective function:

```text
F(X) =
w1 * PopulationCoverage
+
w2 * Equity
+
w3 * Accessibility
+
w4 * DeficitReduction
+
w5 * EnvironmentalValue
-
w6 * Risk
-
w7 * Cost
-
w8 * Redundancy
```

---

# 27. Optimization Algorithms

Possible approaches:

### MVP

Greedy optimization.

### Intermediate

MILP / OR-Tools.

### Multi-objective

NSGA-II / NSGA-III.

The system should initially implement the simplest explainable baseline before adding more complex algorithms.

---

# 28. Marginal Impact

A site should not only be evaluated individually.

It should be evaluated relative to the current portfolio.

Example:

```text
Portfolio:
Site A
Site B
Site C
```

Adding Site D:

```text
+ 2,400 people served
+ 18% deficit reduction
+ 7% equity improvement
+ $3.2B estimated investment
- 4% redundancy
```

This is:

```text
Marginal Impact
```

It is often more valuable than the absolute site score.

---

# 29. Redundancy Analysis

If two sites serve the same population, selecting both may be inefficient.

Calculate:

```text
catchment overlap
population overlap
facility overlap
service overlap
```

Example:

```text
Site A ↔ Site B

Population overlap: 42%
```

The optimizer should penalize unnecessary overlap.

---

# 30. Territorial Equity

The system should prevent all investment from concentrating in already advantaged zones.

Possible variables:

```text
vulnerability
service deficit
population
accessibility
income proxy
existing infrastructure
historical investment
```

Example output:

```text
Equity score: 91 / 100
```

---

# 31. Scenario Engine

Users should be able to define:

```text
Budget
Priority weights
Allowed interventions
Maximum risk
Minimum equity
Maximum number of projects
```

Example:

```text
Budget: $50B
Priority:
    35% population
    25% equity
    20% accessibility
    20% environment
```

The optimizer returns a portfolio.

---

# 32. Scenario Comparison

Example:

| Scenario | Budget | Population | Equity | Green Impact | Risk |
|---|---:|---:|---:|---:|---:|
| Recovery A | $20B | 18,400 | 71 | 54 | Low |
| Recovery B | $35B | 31,200 | 83 | 68 | Medium |
| Recovery C | $50B | 42,700 | 91 | 82 | Medium |

The user should be able to compare scenarios spatially.

---

# 33. Sensitivity Analysis

A recommendation is stronger when it remains stable under reasonable changes in assumptions.

Test:

```text
weight changes
budget changes
risk assumptions
population estimates
cost assumptions
```

Example:

```text
Site #3

Rank under default weights: #3
Rank under equity-heavy: #4
Rank under accessibility-heavy: #2
Rank under environment-heavy: #3

Decision sensitivity: LOW
```

Or:

```text
Decision sensitivity: HIGH
```

when small weight changes radically alter the result.

---

# 34. Confidence and Data Quality

Do not display a fake "AI confidence" number.

Instead calculate a decision-confidence indicator based on:

```text
Data completeness
+
Source reliability
+
Model stability
+
Spatial uncertainty
+
Sensitivity
```

Example:

```text
Decision confidence: HIGH

Data completeness: 94%
Model stability: High
Spatial uncertainty: Low
Sensitivity: Low
```

---

# 35. Data Quality Alerts

The system should surface:

```text
Missing cadastral data
Outdated risk layer
Incomplete damage layer
Low-resolution population data
Conflicting land-use information
Insufficient intervention evidence
```

Example:

```text
⚠ Damage dataset covers only 68% of known affected sites.
Recommendation confidence reduced.
```

---

# 36. Urban Opportunity Clusters

Sites should not only be analyzed independently.

The system should detect clusters.

Example:

```text
Cluster A

8 opportunity sites
3,420 m² total area
14,800 population within catchments

Potential strategy:
2 parks
1 sports facility
1 community facility
2 green connections
```

---

# 37. Green Corridors and Networks

The platform should detect opportunities to connect:

```text
existing park
     ↓
new park
     ↓
sports facility
     ↓
school
```

using:

- Pedestrian network
- Green infrastructure
- Shortest paths
- Existing parks
- Public facilities
- Terrain
- Environmental constraints

This allows the system to recommend **networks**, not only isolated projects.

---

# 38. Map-First Interface

The interface should prioritize spatial exploration.

Main layers:

```text
Sites
Population
Parks
Facilities
Roads
Transit
Risk
Land Use
Accessibility
Recommendations
Scenario
```

Recommended stack:

```text
React
MapLibre GL
deck.gl
Tailwind CSS
```

---

# 39. Main User Flow

```text
Open platform
      ↓
Map of Pereira
      ↓
Activate post-earthquake sites
      ↓
Filter sites
      ↓
Select priority site
      ↓
Inspect territorial context
      ↓
View recommendations
      ↓
Compare interventions
      ↓
Add sites to scenario
      ↓
Optimize portfolio
      ↓
Compare alternatives
      ↓
Export decision
```

---

# 40. Site Detail Panel

Example:

```text
SITE 087

Status
Demolished

Area
840 m²

Population
4,820 within 10 min

Park deficit
0.91

Accessibility
0.88

Social vulnerability
0.84

Risk
0.21
```

Then:

```text
RECOMMENDATIONS

1. Park       94.2
2. Sports     82.4
3. Community  76.1
4. Housing    61.8
5. Commercial 48.7
```

---

# 41. Intervention Detail

For each intervention:

```text
Recommended intervention: PARK

Suitability: 94.2

Population served:
4,820

Estimated catchment:
10 minutes walking

Equity:
High

Deficit reduction:
High

Risk:
Moderate

Redundancy:
Low

WHY?

- High population demand
- Significant public-space deficit
- Strong pedestrian accessibility
- High social vulnerability
- Compatible land use
```

---

# 42. API

## Sites

```http
GET /api/sites
GET /api/sites/:id
```

Filters:

```text
bbox
commune
neighborhood
risk
damage_status
intervention
score
```

---

## Recommendations

```http
GET /api/sites/:id/recommendations
```

---

## Scenarios

```http
POST /api/scenarios
GET /api/scenarios/:id
POST /api/scenarios/:id/optimize
```

---

# 43. Backend

Recommended:

```text
Python
FastAPI
PostgreSQL
PostGIS
```

Workers can initially be:

```text
cron
simple background workers
RQ
Celery
```

Use the simplest infrastructure that supports the required workload.

---

# 44. Frontend Architecture

The frontend should NOT directly consume ten external data sources.

Correct:

```text
External sources
       ↓
Data pipeline
       ↓
PostGIS
       ↓
API
       ↓
React
```

Incorrect:

```text
React
 ├── DANE
 ├── SGC
 ├── IDEAM
 ├── OSM
 ├── AMCO
 ├── CARDER
 └── ...
```

Centralizing the data layer improves:

- Performance
- Reproducibility
- Data quality
- Caching
- Versioning
- Security

---

# 45. Performance

Key principles:

- Vector tiles for large spatial layers
- Spatial indexes
- PostGIS `GIST` indexes
- Bounding-box filtering
- Server-side aggregation
- Precomputed features
- Cached scenario results
- Lazy loading of heavy layers
- Progressive map rendering

Potential spatial index:

```sql
CREATE INDEX sites_geom_idx
ON sites
USING GIST (geometry);
```

---

# 46. ML Pipeline

```text
PostGIS
   ↓
Feature extraction
   ↓
Training dataset
   ↓
Training
   ↓
Validation
   ↓
Model registry
   ↓
Inference
   ↓
Site scores
```

Every model should maintain:

```text
model_version
feature_version
training_data_version
created_at
metrics
```

---

# 47. Model Evaluation

Technical metrics:

```text
NDCG
MAP
Calibration
Feature importance stability
Spatial cross-validation
```

Decision metrics:

```text
Population coverage
Deficit reduction
Equity
Accessibility
Cost efficiency
Risk exposure
Redundancy
```

Use **spatial cross-validation** rather than only random train/test splits to reduce spatial memorization.

---

# 48. Reproducibility

Every scenario should store:

```text
scenario_id
data_version
model_version
feature_version
weights
constraints
budget
interventions
created_at
```

A scenario must be reproducible.

Historical scenarios should never silently change when source data is updated.

---

# 49. Security and Privacy

Separate data into:

```text
PUBLIC
INTERNAL
SENSITIVE
```

Personal disaster information should not be exposed in the decision interface unless explicitly required and legally justified.

The analytical model should prefer aggregated spatial information.

---

# 50. Executive Output

The platform should be capable of generating an:

# Urban Recovery Strategy

Example:

```text
SITES ANALYZED
1,284

PRIORITY SITES
42

RECOMMENDED INTERVENTIONS
18 parks
8 sports facilities
7 community facilities
5 green connections
4 other interventions

POPULATION SERVED
87,400

ESTIMATED INVESTMENT
$XXB

EQUITY IMPROVEMENT
+14%

PUBLIC-SPACE DEFICIT REDUCTION
-22%

AVERAGE DECISION CONFIDENCE
High
```

---

# 51. Export Formats

Support:

```text
GeoJSON
CSV
PDF
Scenario JSON
```

Future:

```text
Shapefile
GeoPackage
Web map
API access
```

---

# 52. MVP Definition

The MVP answers:

> **Among available affected sites, which are the best opportunities and what intervention would generate the greatest measurable territorial value?**

### MVP Data

```text
Affected sites
Population
Parks
Public facilities
Pedestrian network
POT / land use
Risk
```

### MVP Features

```text
Population served
Park deficit
Accessibility
Risk
Land-use compatibility
Density
Facility proximity
```

### MVP Outputs

```text
Priority ranking
Recommended intervention
Score
Explanation
Map
Basic scenario
Portfolio comparison
```

---

# 53. MVP Development Phases

## Phase 0 — Data Discovery

Identify and validate:

```text
Damage layer
Cadastral layer
Population
Parks
Facilities
Road network
Risk
Land use
```

Deliverable:

```text
data_inventory.md
```

---

## Phase 1 — GIS Foundation

Build:

```text
PostGIS
Data ingestion
Normalization
Spatial queries
Map
Base layers
Site explorer
```

Deliverable:

```text
Working spatial data platform
```

---

## Phase 2 — Feature Engine

Implement:

```text
Catchments
Accessibility
Park deficit
Risk
Land-use compatibility
Vulnerability
Facility coverage
```

Deliverable:

```text
site_features
```

---

## Phase 3 — Recommendation Engine

Implement:

```text
Hard constraints
Weighted scoring
Site × intervention
Explainability
```

ML can be added after establishing the baseline.

---

## Phase 4 — Optimization

Implement:

```text
Budget
Portfolio selection
Marginal impact
Redundancy
Equity
Multi-objective optimization
```

---

## Phase 5 — Decision Interface

Implement:

```text
Scenario builder
Scenario comparison
Sensitivity analysis
Explainability
Reports
Exports
```

---

# 54. MVP Definition of Done

## Data

- [ ] Georeferenced affected sites
- [ ] Valid geometries
- [ ] Population data
- [ ] Pedestrian network
- [ ] Parks/facilities
- [ ] Risk
- [ ] Territorial constraints

## Backend

- [ ] PostGIS
- [ ] Reproducible ingestion
- [ ] Spatial feature engine
- [ ] Sites API
- [ ] Recommendations API
- [ ] Scenarios API

## Intelligence

- [ ] Site ranking
- [ ] Intervention suitability
- [ ] Hard constraints
- [ ] Explainability
- [ ] Basic optimization

## Frontend

- [ ] Interactive map
- [ ] Site panel
- [ ] Recommendation panel
- [ ] Filters
- [ ] Scenario builder
- [ ] Comparison view

---

# 55. Product Principles

## Evidence over opinion

Every recommendation must be supported by measurable spatial evidence.

## Spatial first

The map is not decoration.

The territory is the data model.

## Explain everything

Users should understand why a recommendation exists.

## Optimize portfolios

Do not optimize sites independently when decisions interact.

## Hard constraints before ML

Invalid candidates should never be rescued by a high model score.

## Uncertainty is a feature

The system should explicitly communicate uncertainty and data quality.

## Human in the loop

The platform supports public decisions; it does not replace them.

---

# 56. North Star Metric

The primary product metric should be:

> **Potential Urban Value Generated per Unit of Investment**

Supported by:

```text
Population served
Deficit reduction
Equity improvement
Accessibility improvement
Environmental impact
Risk reduction
```

---

# 57. Long-Term Product Direction

The platform should evolve beyond post-earthquake recovery.

The long-term product becomes:

# Urban Development Intelligence

The same infrastructure can support:

```text
Infrastructure planning
Mobility
Housing
Public space
Climate adaptation
Commercial development
Population growth
Demographic change
Investment planning
Risk management
```

Future question:

> "What happens to Pereira if we invest $50B in these areas over the next five years?"

The system could simulate:

```text
Investment
   ↓
Spatial allocation
   ↓
Infrastructure
   ↓
Accessibility
   ↓
Population impact
   ↓
Equity
   ↓
Environment
   ↓
Risk
   ↓
Economic activity
   ↓
Urban outcome
```

---

# 58. Final Product Definition

Urban Recovery Intelligence is not:

> "An AI that tells the city what to build."

It is:

> **A spatial intelligence platform that converts territorial, demographic, infrastructure, risk and land-availability data into explainable and optimized scenarios for urban investment decisions.**

Its core unit is the decision:

```text
WHERE
+
WHAT
+
WHY
+
HOW MUCH
+
WHAT IF
+
WHICH COMBINATION
```

The ultimate objective is to transform post-disaster reconstruction from:

```text
Replace what was lost
```

into:

```text
Use the recovery opportunity to build a better-connected,
more equitable, accessible and resilient city.
```
