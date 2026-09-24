# MANIFESTO — URBAN RECOVERY INTELLIGENCE
## Ontology, Evidence, Data & Product Experience

**Version:** 1.0  
**Status:** Foundational

> **The system does not exist to display data. It exists to help humans understand a changing territory and make better-informed urban decisions.**

## 1. North Star

The product must answer:

- **WHERE?** Where should attention or intervention be concentrated?
- **WHAT?** What could be done there?
- **WHY?** What evidence and relationships justify it?
- **WHO?** Who is affected or served?
- **HOW MUCH?** What resources are required?
- **WHAT IF?** What changes under another intervention, budget or priority?
- **WHAT DO WE NOT KNOW?** Where is uncertainty blocking a decision?

Uncertainty is a first-class concept.

---

## 2. Ontology Before UI

The system is built around:

```text
OBJECTS
EVENTS
RELATIONSHIPS
EVIDENCE
ACTIONS
```

The frontend is a projection of this ontology:

```text
ONTOLOGY
  ↓
DOMAIN MODEL
  ↓
API
  ↓
APPLICATION STATE
  ↓
UI
```

Not the reverse.

---

## 3. Objects — What Exists

### Territorial objects

```text
Building
Parcel
Block
Road
Intersection
PublicSpace
Park
School
HealthFacility
CommunityFacility
TransitNode
Neighborhood
Commune
Zone
PopulationArea
RiskZone
POTZone
```

### Recovery objects

```text
RecoveryOpportunity
Intervention
Scenario
Portfolio
Project
```

### Evidence objects

```text
Evidence
EvidenceAsset
FieldObservation
SatelliteObservation
MunicipalRecord
Inspection
CitizenReport
Document
```

### Operational objects

```text
FieldMission
Decision
Recommendation
Constraint
DataSource
ModelVersion
```

Objects should have identity, provenance, temporal validity and geometry when applicable.

---

## 4. Objects Are Not Features

Never collapse these concepts:

```text
OBJECT
  ↓
OBSERVATION
  ↓
EVIDENCE
  ↓
ASSESSMENT
  ↓
FEATURE
  ↓
DECISION
```

For example:

```text
Building
```

is an object.

```text
building_density = 0.73
```

is a feature.

```text
damage_confidence = 0.84
```

is an assessment.

The distinction preserves traceability.

---

## 5. Events — What Happens

Events represent observations, changes or actions:

```text
Earthquake
FieldObservation
SatelliteCapture
Inspection
DamageAssessment
DemolitionOrder
Demolition
Construction
LandAcquisition
PlanningDecision
InterventionProposal
PortfolioSelection
```

Events must preserve:

```text
timestamp
source/actor
related_objects
payload
version
```

Do not turn historical events into unexplained static fields.

---

## 6. Relationships Are First-Class

Examples:

```text
Building ── LOCATED_ON ──→ Parcel
Building ── AFFECTED_BY ──→ Earthquake
FieldObservation ── OBSERVES ──→ Building
Evidence ── SUPPORTS ──→ Assessment
Evidence ── CONTRADICTS ──→ Assessment
Parcel ── CANDIDATE_FOR ──→ Intervention
Opportunity ── PROPOSES ──→ Intervention
Intervention ── PRODUCES ──→ Impact
Opportunity ── CONSTRAINED_BY ──→ POTRule
```

Relationships may carry:

```text
confidence
source
method
valid_from
valid_to
verification_status
algorithm_version
```

The relationship can be as important as the entities themselves.

---

## 7. Spatial Relationships

Use explicit spatial concepts:

```text
CONTAINS
WITHIN
INTERSECTS
ADJACENT_TO
CONNECTED_TO
NEAR
OVERLAPS
LOCATED_ON
SERVES
```

PostGIS calculates them; the frontend communicates their meaning.

Example:

```text
Parcel P-1837
   ↓ WITHIN
POT Zone Z-14
   ↓ PERMITS
Public Space
```

This is more useful than exposing a polygon without context.

---

## 8. Time Is Fundamental

Territory is not static.

Important entities and relationships need:

```text
valid_from
valid_to
observed_at
created_at
updated_at
```

A building can evolve:

```text
BEFORE EVENT
 ↓
EARTHQUAKE
 ↓
DAMAGE
 ↓
FIELD VERIFICATION
 ↓
LEGAL STATUS
 ↓
DEMOLITION
 ↓
VACANT PARCEL
 ↓
RECOVERY OPPORTUNITY
 ↓
INTERVENTION
```

The system must answer **what changed, when and according to whom**.

---

## 9. Evidence Before Score

Never expose a consequential score without an explanation.

Instead of:

```text
damage_score = 0.91
```

show:

```text
Satellite observation → severe
Field observation    → severe visible damage
Municipal inspection → pending

Evidence agreement → high
Confidence          → 0.87
```

The score is a conclusion.

**Evidence is the explanation.**

---

## 10. Preserve Provenance

Never overwrite source observations.

Bad:

```text
building.damage = severe
```

Better:

```text
DamageAssessment
├── SatelliteEvidence
├── FieldEvidence
├── MunicipalEvidence
└── CitizenEvidence
```

Contradictions must remain visible:

```text
SATELLITE → Severe
FIELD     → No visible structural damage

STATUS → CONFLICTING EVIDENCE
```

---

## 11. Source Hierarchy

Every source needs:

```text
source_type
authority
capture_method
observation_date
license
provenance
verification_status
```

Distinguish:

```text
OBSERVED
REPORTED
DERIVED
MODELED
SIMULATED
```

Synthetic and modeled data must never look identical to official observations.

---

## 12. Confidence Is Not Truth

Confidence represents the strength of available evidence under a defined methodology.

Every confidence value should retain:

```text
confidence
drivers
sources
algorithm_version
calculation_date
```

The user must be able to ask:

> Why is confidence high or low?

---

## 13. RecoveryOpportunity Is the Central Object

The central product object is not the building or the damage.

It is:

# RecoveryOpportunity

Defined as:

```text
LUGAR
+
PROBLEMA
+
INTERVENCIÓN
+
IMPACTO
+
VIABILIDAD
+
EVIDENCIA
```

Example:

```text
OPPORTUNITY #017
Cuba Norte

PROBLEM
High population concentration
+ public-space deficit
+ post-earthquake disruption

PROPOSAL
Urban park + pedestrian connection

IMPACT
6,240 people
18% deficit reduction
7 min access improvement

FEASIBILITY
POT ✓
Area ✓
Accessibility ✓
Risk ⚠ review required
```

This is what the frontend should make understandable.

---

## 14. One Place Can Have Many Opportunities

Never assume:

```text
Parcel → one solution
```

Use:

```text
Parcel P-1837
├── Rebuild housing
├── Housing + commerce
├── Public space
├── Community facility
└── No-build / ecological
```

The system evaluates alternatives instead of prematurely selecting one.

---

## 15. Intervention ≠ Opportunity

An opportunity describes a situation and potential.

An intervention describes an action.

Examples:

```text
PARK
PUBLIC_SQUARE
HOUSING
HEALTH_FACILITY
SCHOOL
COMMUNITY_FACILITY
GREEN_CORRIDOR
PEDESTRIAN_CONNECTION
COMMERCIAL
NO_BUILD
RELOCATE
```

Each intervention can have:

```text
cost
area
capacity
beneficiaries
risk
POT compatibility
implementation_time
environmental_effect
```

---

## 16. Impact Must Be Explicit

Never expose only:

```text
score = 92
```

Show:

```text
+6,240 people served
+18% public-space deficit reduction
-4 min average access
+2,100 m² public space
```

Possible impact dimensions:

```text
PopulationCoverage
DeficitReduction
AccessibilityGain
RiskReduction
Equity
EnvironmentalValue
Connectivity
EconomicActivity
HousingCapacity
PublicSpaceGain
```

---

## 17. Feasibility Is Separate From Impact

A high-impact intervention can still be infeasible.

Therefore:

```text
IMPACT ≠ FEASIBILITY
```

Feasibility includes:

```text
POT compatibility
land availability
risk
minimum area
accessibility
infrastructure
ownership/acquisition
environmental constraints
implementation constraints
```

Use:

```text
✓ FEASIBLE
⚠ REQUIRES REVIEW
✕ INCOMPATIBLE
```

Do not hide all of this behind one opaque score.

---

## 18. Frontend Must Follow the Ontology

Navigation should be organized around:

```text
SITUATION
 ↓
PRIORITIES
 ↓
OPPORTUNITY
 ↓
EVIDENCE
 ↓
ALTERNATIVES
 ↓
SCENARIO
 ↓
ACTION
```

Not merely:

```text
Map
Dashboard
Charts
Layers
```

---

## 19. The Map Is a Lens, Not the Product

The map answers spatial questions.

It must not become a container for every dataset.

When an opportunity is selected:

```text
camera → opportunity
related objects → highlight
irrelevant layers → fade
context → appear
```

Recommended:

```text
MapLibre GL JS
react-map-gl
deck.gl
```

Use analytical layers only when they communicate something meaningful.

---

## 20. Object-Centric UI

Every important object should have a consistent view.

### Building

```text
Status
Evidence
Location
Relationships
History
Constraints
Opportunities
Actions
```

### Opportunity

```text
Problem
Evidence
Impact
Feasibility
Alternatives
Relationships
History
Actions
```

The object becomes the unit of interaction.

---

## 21. The WHY Panel Is Mandatory

Every prioritization must answer:

```text
WHY THIS OPPORTUNITY?

+ High affected population
+ High public-space deficit
+ Good accessibility
+ POT-compatible
+ Strong independent evidence

− Moderate risk
− Land acquisition unresolved
```

Then:

```text
VIEW TECHNICAL EVIDENCE
```

Raw feature vectors belong here, not in the primary experience.

---

## 22. React Flow Is for Explanation

Use graphs to answer questions.

Good:

```text
Damage
   ↓
Need
   ↓
Opportunity
   ↓
Intervention
   ↓
Impact
```

Good:

```text
Evidence
├── Satellite
├── Field
└── Municipal
       ↓
Damage assessment
```

Bad:

```text
47 nodes
120 edges
decorative animation
```

Every graph must explain something.

---

## 23. Actions Are First-Class

The platform must allow:

```text
CREATE FIELD MISSION
COMPARE OPPORTUNITIES
ADD TO SCENARIO
RUN SIMULATION
EXPORT EVIDENCE
REQUEST VERIFICATION
FLAG CONFLICT
MARK AS REVIEWED
```

The experience should move:

```text
OBSERVE
 ↓
UNDERSTAND
 ↓
COMPARE
 ↓
ACT
```

---

## 24. Field Evidence Closes the Loop

The PWA is a sensor layer of the ontology:

```text
RECOVERY OPPORTUNITY
 ↓
FIELD MISSION
 ↓
FIELD OBSERVATION
 ↓
EVIDENCE ASSET
 ↓
SPATIAL MATCH
 ↓
EVIDENCE ASSESSMENT
 ↓
FEATURE UPDATE
 ↓
OPPORTUNITY UPDATE
```

The PWA observes, documents, locates and validates evidence.

It does not autonomously decide.

---

## 25. GPS Is Not Entity Identity

Critical rule:

```text
GPS LOCATION ≠ BUILDING
```

GPS generates candidates.

Matching considers:

```text
distance
geometry
heading
context
operator confirmation
```

Possible states:

```text
CANDIDATE
CONFIRMED
REJECTED
AMBIGUOUS
UNDETERMINABLE
```

If uncertain:

> Do not force a relationship.

---

## 26. Spatial Matching Must Be Auditable

Every association must retain:

```text
entity_id
distance_m
method
match_score
algorithm_version
operator_confirmation
timestamp
```

The system must answer:

> Why was this photograph associated with this building?

Lineage:

```text
Photo
 ↓
GPS
 ↓
Candidate generation
 ↓
Spatial filter
 ↓
Context/heading
 ↓
Candidate ranking
 ↓
Human confirmation
 ↓
Building
```

---

## 27. Scenarios Are First-Class

Examples:

```text
Balanced Recovery
Equity First
Fastest Recovery
Public Space
Housing Capacity
```

A scenario contains:

```text
objectives
weights
constraints
budget
project_limit
interventions
selected_opportunities
version
```

Users should be able to change priorities and immediately understand the consequences.

---

## 28. Portfolio ≠ Ranking

Do not simply show:

```text
1. Site A
2. Site B
3. Site C
```

A portfolio must consider overlap and marginal benefit:

```text
Portfolio
A + C + F + J
```

Show:

```text
Budget
Projects
Population served
Deficit reduction
Territorial coverage
Redundancy
Equity
Risk
```

---

## 29. Uncertainty Must Drive Field Work

Conceptually:

```text
Mission Priority
=
Decision Impact
×
Uncertainty
×
Value of Information
```

Therefore:

```text
HIGH IMPACT
+
HIGH UNCERTAINTY
=
HIGH FIELD PRIORITY
```

Field work should target the uncertainty with the greatest decision value.

---

## 30. Data Quality Is Visible

Use:

```text
HIGH
MEDIUM
LOW
UNKNOWN
CONFLICTING
```

Never hide missing data behind zeroes.

Use:

```text
UNKNOWN
NOT_AVAILABLE
NOT_VERIFIED
```

instead of invented values.

---

## 31. Synthetic Data Must Look Synthetic

Always label:

```text
SIMULATED
```

Synthetic context must never be visually indistinguishable from official observations.

---

## 32. Licensing Is Part of the Ontology

A DataSource is incomplete without legal/provenance metadata:

```text
license
commercial_use
redistribution
attribution
restrictions
source_url
retrieved_at
version
```

Possible states:

```text
COMMERCIAL_ALLOWED
COMMERCIAL_ALLOWED_WITH_ATTRIBUTION
NON_COMMERCIAL
RESTRICTED
UNKNOWN
```

Unknown licensing means the original product should not be redistributed.

---

## 33. Models Are Versioned Objects

Every model-generated value should reference:

```text
model_version
feature_version
data_version
run_id
created_at
```

Example:

```text
Priority = 92

model: scoring-v3
features: features-v7
data: 2026-09-24
run: RUN-184
```

This makes outputs reproducible.

---

## 34. Never Hide Model Logic Behind a Number

Bad:

```text
Priority = 92
```

Good:

```text
Priority = 92

Population impact       +24
Public-space deficit    +21
Accessibility           +18
Evidence strength       +15
Risk                    -8
Cost                    -6
```

And:

```text
WHY?
```

must be available in plain language.

---

## 35. Decision Intelligence ≠ Automated Decision

The platform provides:

```text
evidence
alternatives
tradeoffs
impact
constraints
uncertainty
```

Humans make final decisions.

Prefer:

```text
HIGH POTENTIAL
REQUIRES REVIEW
LOW FEASIBILITY
HIGH UNCERTAINTY
```

over authoritative commands.

---

## 36. Frontend Design Balance

Target:

```text
70% INTELLIGENCE
20% SPATIAL CONTEXT
10% DATA DETAIL
```

Not:

```text
70% MAP
20% CHARTS
10% EXPLANATION
```

The map should support the decision, not compete with it.

---

## 37. Recommended Frontend Stack

```text
React
Vite
Tailwind
shadcn/ui
Motion

MapLibre GL JS
react-map-gl
deck.gl

Apache ECharts

React Flow

TanStack Query
Zustand

Workbox
IndexedDB
```

Backend:

```text
FastAPI
PostgreSQL
PostGIS
pgvector only where semantic retrieval is useful
Martin / PMTiles
```

Avoid infrastructure that does not solve a real product problem.

---

## 38. Ontology-Aware Search

A query such as:

> "Muéstrame lugares afectados con alto déficit de espacio público donde sea viable crear parques y que atiendan población vulnerable."

should resolve into structured concepts:

```text
affected
→ DamageAssessment

high public-space deficit
→ DeficitFeature

parks
→ Intervention.PARK

viable
→ Feasibility

vulnerable population
→ Population/Vulnerability relationship
```

Then combine:

```text
PostGIS
+
structured filters
+
full text
+
optional vector retrieval
```

Semantic retrieval complements structured spatial reasoning. It does not replace it.

---

## 39. Every View Must Answer a Question

Before implementing a component:

> **What question does this answer?**

Examples:

```text
Map              → WHERE?
Opportunity      → WHAT COULD HAPPEN HERE?
Evidence         → WHY DO WE BELIEVE THIS?
Comparison       → WHAT ALTERNATIVES EXIST?
Scenario         → WHAT CHANGES IF PRIORITIES CHANGE?
Portfolio        → WHICH COMBINATION CREATES IMPACT?
Field Mission    → WHAT SHOULD WE VERIFY NEXT?
```

If a visualization cannot answer a meaningful question, remove it.

---

## 40. Golden UX Loop

```text
DISCOVER
   ↓
SELECT
   ↓
UNDERSTAND
   ↓
VERIFY
   ↓
COMPARE
   ↓
SIMULATE
   ↓
ACT
```

Example:

```text
Discover Opportunity
 ↓
Select Opportunity #017
 ↓
Understand WHY
 ↓
Inspect evidence
 ↓
Compare interventions
 ↓
Simulate budget
 ↓
Add to portfolio
 ↓
Create field mission
```

---

## 41. Golden Data Loop

```text
SOURCE
 ↓
INGEST
 ↓
NORMALIZE
 ↓
ENTITY RESOLUTION
 ↓
RELATIONSHIPS
 ↓
EVIDENCE
 ↓
ASSESSMENT
 ↓
FEATURES
 ↓
OPPORTUNITIES
 ↓
SCENARIOS
 ↓
DECISIONS
 ↓
FIELD ACTION
 ↓
NEW EVIDENCE
 ↓
UPDATE
```

The system continuously updates its understanding of the territory.

---

## 42. The System Must Explain Itself

For every consequential output:

```text
Where did this come from?
When?
Which source?
Which entity?
Which relationship?
Which algorithm?
Which version?
What evidence?
What uncertainty?
What contradicts it?
```

If it cannot answer, the result must not be presented as high-confidence decision intelligence.

---

## 43. Visual Language

The interface should communicate:

```text
PRECISION
CLARITY
CONTEXT
DEPTH
CONTROL
```

Avoid:

```text
cyberpunk noise
neon overload
decorative graphs
random animations
dashboard clutter
```

The interface can be cinematic while remaining operational.

---

## 44. The Map Should Feel Alive, Not Loud

Use motion for:

```text
selection
transition
causal relationship
spatial focus
temporal change
scenario change
```

When an opportunity is selected:

```text
camera moves
related objects highlight
irrelevant layers fade
evidence appears
impact updates
```

The territory should feel responsive to the user's question.

---

# 45. THE MANIFESTO

> **We do not build a map.**  
> We build a model of a changing territory.
>
> **We do not display data.**  
> We expose relationships that matter.
>
> **We do not hide uncertainty.**  
> We make uncertainty actionable.
>
> **We do not produce unexplained scores.**  
> We expose evidence, assumptions and tradeoffs.
>
> **We do not confuse proximity with identity.**  
> Spatial relationships must be verified.
>
> **We do not confuse observations with truth.**  
> Every claim has provenance.
>
> **We do not optimize isolated sites.**  
> We evaluate opportunities and portfolios.
>
> **We do not force one solution.**  
> We expose alternatives and consequences.
>
> **We do not make the map the product.**  
> The decision is the product.
>
> **We do not make AI the decision-maker.**  
> Algorithms augment human judgment.
>
> **We do not treat recovery as reconstruction by default.**  
> We evaluate rebuilding, transforming, relocating and preserving according to evidence, constraints and territorial impact.
>
> **We do not build interfaces for datasets.**  
> We build interfaces for questions, decisions and actions.

---

# 46. ONE SENTENCE

> **Urban Recovery Intelligence converts a changing physical territory into an auditable network of objects, relationships, evidence, alternatives and impacts so humans can understand where intervention matters, what could be done, why, and what would change.**

---

# 47. NON-NEGOTIABLE RULES

Before shipping a feature:

```text
[ ] Does it represent a real domain concept?
[ ] Is its relationship to other entities explicit?
[ ] Does it preserve provenance?
[ ] Is its temporal context known?
[ ] Is uncertainty represented?
[ ] Can the user understand why it matters?
[ ] Does it answer a concrete question?
[ ] Can the user act on it?
[ ] Does it avoid duplicating existing ontology?
[ ] Does it improve the decision loop?
```

If most answers are no:

> **Do not build the feature.**

---

# 48. NORTH STAR

The final experience should make a user feel:

> **"I am not looking at a database of Pereira. I am understanding what is happening in Pereira, why it matters, what evidence supports that understanding, what alternatives exist, and what I can do next."**

That is the product.

**Not the map.  
Not the model.  
Not the database.  
The decision intelligence connecting them.**
