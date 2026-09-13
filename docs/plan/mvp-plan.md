# Plan de MVP — Urban Recovery Intelligence

**Documentos padre:** PRD v1.0, SRS v0.1, ARD v0.1
**Caso:** Pereira, Colombia — recuperación tras el sismo del 10 de agosto de 2026
**Versión:** 0.1 — borrador para revisión
**Horizonte:** piloto institucional
**Leer antes:** [antes-de-empezar.md](./antes-de-empezar.md) — contiene hallazgos que cambian premisas de este plan (escala real de Pereira, geometría del dato de daño, epicentro)

---

## 0. La decisión que define esta primera versión

**La primera versión no entrega una aplicación web de propósito general.**

El PRD describe un producto completo: mapa, panel de sitio, constructor de escenarios, comparador, sensibilidad, reportes. Construir todo eso en la V1 significa gastar la mitad del piloto en superficie de interfaz sobre números que todavía nadie ha validado. Y en un piloto institucional, lo que se juzga no es la interfaz: es si las recomendaciones resisten el escrutinio de un planificador que conoce el territorio mejor que el sistema.

Por eso la V1 se define por su **superficie de salida**, no por sus pantallas:

| Entrega V1 | Qué es |
|---|---|
| **API versionada** | Contrato REST completo del SRS §10.1, cada respuesta con procedencia (FR-API-02) |
| **Paquete de evidencia** | GeoJSON + CSV + scenario JSON + reporte PDF, autocontenidos e interpretables sin la plataforma (CON-07, FR-EXP-04) |
| **Visor de decisión** | Una sola vista cartográfica hecha a medida: mapa + panel de sitio + comparador de escenarios. Nada más. |

Y se define igual de explícitamente por lo que **no** construye:

- Ningún dashboard de KPIs, ninguna fila de tarjetas de métricas, ningún gráfico decorativo
- Ninguna plantilla de administración, ninguna pantalla CRUD sobre tablas
- Ninguna pantalla de "configuración" genérica, ningún onboarding, ningún perfil de usuario
- Ninguna vista que no responda directamente a una de las seis preguntas del PRD §4 (`DÓNDE + QUÉ + POR QUÉ + CUÁNTO + QUÉ PASA SI + QUÉ COMBINACIÓN`)

El razonamiento completo está en [ADR-15](../adr/ADR-15-sin-frontend-generico.md).

### Punto de decisión abierto

Hay un corte más duro disponible: **V1 sin ninguna interfaz web**, entregando solo API + paquete de evidencia, y validando las recomendaciones en sesiones de trabajo con el planificador sobre mapas exportados. Eso libera ~3-4 semanas de M6 y elimina por completo la auditoría WCAG del piloto.

Este plan asume el visor mínimo (M6), porque el flujo del PRD §39 —filtrar, seleccionar, inspeccionar, comparar— es difícil de validar sobre PDFs estáticos, y la exploración espacial es donde el planificador detecta que el modelo se equivocó. Si se prefiere el corte duro, M6 se reduce a exportes y el plan pierde una fase sin reordenarse.

---

## 1. Recorte de alcance

El SRS es el contrato del piloto completo. El MVP es un subconjunto de él. Esta sección dice cuál, y por qué el resto puede esperar sin volverse un rediseño.

### 1.1 Dentro de la V1

| Bloque | Requisitos SRS |
|---|---|
| Autenticación, roles, niveles de sensibilidad, auditoría | `FR-AUTH-01..03`, `FR-AUDIT-01` |
| Exclusión de PII y umbral mínimo de agregación | `FR-PII-01..03`, `FR-LIC-01` |
| Contrato de daño congelado + adaptador | `FR-DC-01..02` |
| Evidencia de daño multifuente y fusión (ADR-16) | `FR-DC-01`, `FR-QUAL-01`, `FR-SYN-05` |
| Registro de licencias y puerta de export por perfil | `FR-LIC-01`, `FR-ING-01` |
| Generador sintético de daño | `FR-SYN-01..06` |
| Ingesta versionada e inmutable | `FR-ING-01..05` |
| Motor de features (vector recortado, §1.3) | `FR-FEAT-01..06` |
| Restricciones duras y blandas versionadas | `FR-CONS-01..04` |
| Scoring ponderado sitio × intervención + explicación + contrafactual | `FR-REC-01..05` |
| Escenarios reproducibles, optimización con presupuesto, comparación, sensibilidad | `FR-SCEN-01..09` |
| Confianza por sitio, alertas de calidad, modos degradados | `FR-QUAL-01..02`, `FR-DEG-01..02` |
| Exportes y reporte ejecutivo | `FR-EXP-01..04` |
| API versionada, procedencia, tiles | `FR-API-01..03`, `FR-EXT-01` |
| Visor de decisión (mapa, panel de sitio, comparador, filtros) | `FR-UI-01..04`, `FR-UI-06..07` |

### 1.2 Fuera de la V1, y por qué no es un rediseño después

| Diferido | Razón | Por qué encaja después sin rehacer |
|---|---|---|
| Ranking con ML (`FR-REC-06`, PRD §21) | No hay ground truth (PRD §22). Un modelo entrenado sobre etiquetas inexistentes es circularidad disfrazada (ADR-09) | Opera dentro del conjunto de candidatos ya producido por las restricciones duras; el baseline ponderado queda como comparador obligatorio |
| Clusters de oportunidad (PRD §36) | Es un análisis sobre el portafolio, no una entrada de él | Se calcula sobre `scenario_sites` ya persistidos |
| Corredores verdes y redes (PRD §37) | Requiere el grafo peatonal + una función objetivo de conectividad que todavía no está definida | El grafo de `pgRouting` de M3 es exactamente su insumo |
| Isócronas multimodales (PRD §9.9) | Ya resuelto por ADR-03: en el piloto el tránsito es proximidad a estación | El nombre y la interfaz de la feature están diseñados para que cambie la implementación, no el contrato |
| Optimizador MILP / multiobjetivo (PRD §27) | El greedy sobre un objetivo submodular tiene cota conocida y se explica a un planificador (ADR-08) | Misma interfaz `select(candidates, budget, objective, constraints)` |
| PMTiles de edificaciones y predios (ADR-10) | Capa pesada que la V1 no necesita para decidir | Es un artefacto estático en Storage, independiente del resto |
| Panel de administración de usuarios y fuentes | El piloto tiene un operador; `admin` opera por migración y CLI | Es UI sobre tablas que ya existen |
| Auditoría WCAG 2.1 AA completa (`FR-UI-05`) | Proporcional a la superficie de interfaz; con una sola vista, el alcance de la auditoría es otro | Se audita la vista que exista, cuando exista |

> `FR-UI-05` es obligación legal (Resolución 1519 de 2020), no una preferencia. Diferirlo significa **auditar menos superficie**, no auditar menos. La V1 se construye accesible por teclado y con codificación no dependiente del color desde el primer commit del visor; lo que se difiere es la auditoría formal cerrada del piloto.

### 1.3 Vector de features de la V1

El PRD §12 lista ~20 features. La V1 calcula 13. El criterio: una feature entra si (a) alimenta el score o una restricción, y (b) su fuente existe hoy.

```text
BLOQUEANTES  — su ausencia detiene el scoring (FR-DEG-01: parada total)
  risk_score                 SGC microzonificación + amenaza
  land_use_compatibility     POT / IDE AMCO
  site_area                  contrato de daño

NÚCLEO       — su ausencia omite la feature y penaliza la confianza
  population_10min           DANE + red peatonal (catchment de red)
  households_10min           DANE
  park_deficit               parques + estándar de espacio público
  park_area_per_capita_1km   parques + DANE
  pedestrian_accessibility   OSM + pgRouting
  social_vulnerability       proxy censal DANE (sin SISBEN en V1)
  building_density           OSM / catastro AMCO

CONTEXTO     — su ausencia solo omite la feature
  school_access              OSM + equipamientos AMCO
  health_access              OSM + equipamientos AMCO
  transit_proximity          Megabús (distancia a estación + frecuencia, ADR-03)
```

Diferidas: `population_500m`, `population_1km`, `households_500m/1km` (redundantes con el catchment de red, que es la métrica que el PRD §13 llama preferible), `park_count_500m`, `sports_facility_access`, `road_connectivity`, `green_space_ratio`.

### 1.4 Catálogo de intervenciones de la V1

De las 11 del PRD §16, la V1 implementa 6:

```text
PARK  ·  SPORTS  ·  PUBLIC_SQUARE  ·  COMMUNITY_FACILITY  ·  OPEN_SPACE  ·  NO_BUILD
```

Fuera: `EDUCATION`, `HEALTH`, `HOUSING`, `COMMERCIAL`, `GREEN_CORRIDOR`.

La razón no es esfuerzo de implementación —el catálogo es configuración— sino que **el objetivo del optimizador deja de estar bien definido**. Las seis incluidas comparten una función de valor de cobertura poblacional sobre un radio de servicio, que es submodular y por tanto justifica el greedy de ADR-08. Educación y salud requieren modelos de demanda sectorial (matrícula, cobertura de red asistencial) que el piloto no tiene; vivienda y comercio requieren supuestos de mercado y tenencia que el PRD §5 excluye explícitamente del alcance; los corredores verdes son un problema de red, no de selección de sitios (PRD §37).

`NO_BUILD` se mantiene: es la recomendación correcta en sitios de riesgo prohibido, y su ausencia forzaría al sistema a recomendar siempre algo.

---

## 2. Decisiones que hay que cerrar, y qué asumimos si no se cierran

Los puntos abiertos del SRS §13 y ARD §7 no pueden bloquear el arranque. Cada uno tiene aquí un **valor por defecto documentado** que entra en vigor si la respuesta no llega antes del hito indicado. Todos son configuración versionada, así que cambiarlos después es publicar una versión nueva, no reescribir código.

| ID | Pregunta | Bloquea | Defecto si no hay respuesta | Costo de cambiarlo después |
|---|---|---|---|---|
| OI-A1 | Host del contenedor de aplicación | M0 | Fly.io en la región más cercana al proyecto Supabase | Bajo — redeploy |
| OI-A2 | Plan Supabase (PITR, retención) | M0 | Plan con PITR de 7 días; validar contra `NFR-OPS-02` | Bajo |
| OI-04 | Estándar de espacio público en Pereira y quién lo firma | M3 | 10 m²/hab efectivo, configurable y versionado con `feature_version` | Bajo — recomputar features |
| OI-07 / OI-A6 | Método de imputación poblacional | M3 | Dasimétrico simple ponderado por huella residencial OSM; fallback proporcional por área donde no haya huellas | Medio — cambia todas las features de población |
| OI-A3 | Modelo de costo peatonal | M3 | Velocidad plana 4,5 km/h; la pendiente queda como `REVISIT` de ADR-02 | Medio — recomputar catchments |
| OI-03 / OI-A4 | Medida de equidad institucionalmente aceptable | M5 | Reportar **dos**: Gini sobre acceso per cápita a espacio público, y brecha de déficit entre comunas. Que la institución elija sobre resultados reales, no en abstracto | Bajo — es reporte, no objetivo |
| OI-05 / OI-A5 | Costos unitarios de intervención y su fuente oficial | M5 | Costos paramétricos por m² con rango, marcados `is_estimate=true`; el optimizador reporta sensibilidad al costo (`FR-SCEN-08`) | Bajo — es configuración de escenario |
| OI-08 | Retención del log de auditoría | M6 | 5 años tras el cierre del piloto | Bajo |
| OI-F1 | ODbL *share-alike* sobre base derivada servida por API | Comercialización, **no** el piloto | OSM aislado en esquema propio; atribución siempre; `share_alike = true` | Alto si se descubre tarde |
| OI-F2 | Licencia de SGC, IDEAM, AMCO, CARDER, Megabús | M0 (puerta) | `UNCLEAR` — que es bloqueante por diseño | Bajo |
| OI-F7 | Independencia entre fuentes de evidencia de daño | M2 | Penalizar concordancia entre fuentes que comparten insumo satelital | Medio |
| OI-06 | Quién tiene autoridad para `ENDORSE` | — | **No bloquea la V1.** `FR-SYN-06` prohíbe endosar mientras exista daño sintético, y en la V1 todo el daño es sintético (CON-01). El estado `ENDORSED` es inalcanzable por construcción | — |

> OI-07 y OI-A3 son los dos que de verdad duelen si cambian tarde: ambos invalidan el cálculo completo de catchments y población. Conviene forzar la respuesta durante M1, no esperar a M3.

---

## 3. Hitos

Cada hito tiene una **puerta de salida verificable**. No se pasa al siguiente sin ella. Las estimaciones asumen un equipo pequeño (1 backend/datos, 1 GIS, apoyo de producto) y son rangos, no compromisos.

### M0 — Fundaciones y medición temprana de riesgo · ~2 semanas

Lo que se construye:

- Repositorio, CI, estructura de paquetes con fronteras de importación forzadas por lint (ADR-01)
- Proyecto Supabase: extensiones (`postgis`, `pgrouting`, `pg_cron`, `pgmq`, `pgaudit`, `pgtap`), migraciones del esquema `core`, roles y políticas RLS iniciales (ADR-05)
- Diccionario de campos prohibidos + test de regresión de PII en CI (`FR-PII-02`)
- Contrato de daño del SRS §6 congelado como esquema validable, y modelo `damage_evidence` de [ADR-16](../adr/ADR-16-evidencia-de-dano-multifuente.md)
- Registro de fuentes con clasificación de licencia y controles de export ([fuentes.md](./fuentes.md) §4-6)
- `data_inventory.md` completado (PRD §53, Fase 0)

**Spike S1 — el riesgo que hay que medir ahora, no en M3.** R1 del ARD dice que el cálculo de catchments con `pgRouting` puede exceder la ventana de batch. Medirlo al final del proyecto es descubrir tarde que ADR-02 no se sostiene. En M0 se construye el grafo peatonal de Pereira desde OSM y se cronometra `pgr_drivingDistance` sobre 1.500 orígenes sintéticos a 3 umbrales. Si excede la ventana de `NFR-PERF-04`, la mitigación (menos umbrales, precómputo por comuna, o revisar ADR-02) se decide con dos semanas de proyecto, no con dos meses.

**Puerta:** CI en verde con el test de PII; contrato congelado y revisado; S1 medido y documentado con su número; OI-A1 y OI-A2 cerrados; **ninguna fuente Tier A en `UNCLEAR`** ([fuentes.md](./fuentes.md) §10).

---

### M1 — Plano de datos e ingesta versionada · ~3 semanas

- Adaptadores por fuente: DANE, IDE AMCO (WFS preferente, `FR-ING-05`), SGC, OSM, parques y equipamientos, Megabús
- Normalización de geometría y CRS (`FR-ING-04`): almacenamiento EPSG:4326, operaciones métricas en EPSG:3116
- Versionado append-only de datasets (`FR-ING-02`, ADR-06)
- Alertas de calidad como filas consultables, no correos (`FR-QUAL-02`, ARD §5.4)
- Aislamiento de fallo de fuente externa (`FR-EXT-01`)

**Puerta:** dos ejecuciones de ingesta sobre la misma versión de fuente producen salidas idénticas (`FR-ING-03`); test pgTAP que demuestra que publicar la versión *n+1* no muta la *n*; una fuente caída degrada solo sus features y levanta alerta de obsolescencia.

---

### M2 — Generador sintético de daño · ~2 semanas

Es un componente de primera clase, no un script de fixtures (SRS §7). Todo el piloto se apoya en él.

- Generación determinista por semilla (`FR-SYN-01`)
- Estructura espacial plausible: agrupamiento, correlación con microzonificación y proxies de tipología (`FR-SYN-02`)
- Manifiesto de generación inmutable (`FR-SYN-03`)
- `is_synthetic` no nulo, propagado por construcción (`FR-SYN-04..05`)

**Puerta:** dos ejecuciones con la misma semilla producen checksums idénticos; la autocorrelación espacial medida supera el umbral documentado; el manifiesto está completo; un test por formato de salida (mapa, CSV, GeoJSON, PDF) verifica que la marca sintética sobrevive (mitigación de R3).

---

### M3 — Motor de features · ~4 semanas

El hito más pesado, y el que decide si los números tienen sentido.

- Grafo peatonal en tablas PostGIS; catchments de red precomputados en el batch nocturno (ADR-02)
- Fallback a buffer con marca de degradación donde la red no cubre (`FR-FEAT-03`)
- Imputación poblacional declarada y versionada (`FR-FEAT-06`)
- Déficits contra estándar configurable, versionado con la feature (`FR-FEAT-04`)
- `feature_version` y `data_version` en cada vector (`FR-FEAT-05`)
- Confianza por sitio con sus drivers explícitos (`FR-QUAL-01`)
- Densidad de red peatonal por comuna expuesta como driver de confianza (mitigación de **R5**)

> **R5 merece su propio entregable.** Un análisis de equidad construido sobre una red desigualmente mapeada puede invertir su propia conclusión: favorece a los barrios que ya estaban mejor documentados en OSM. No es un problema de calidad de datos, es un problema de corrección. La métrica de densidad de red por comuna no es opcional en M3.

**Puerta:** el caso de prueba del SRS (`FR-FEAT-02`): un sitio separado de la población por un río sin cruce excluye esa población del catchment de 10 minutos; recómputo completo dentro de `NFR-PERF-04`; comparación contra dataset golden por feature.

---

### M4 — Restricciones, scoring y explicación · ~3 semanas

- Conjunto de restricciones como configuración versionada, no lógica en código (`FR-CONS-03`)
- Restricciones duras evaluadas **antes** del scoring, estructuralmente: el módulo `scoring` recibe el conjunto de candidatos y no tiene acceso a los sitios excluidos (ARD §5.1)
- Atribución completa de exclusión: todas las restricciones violadas, no la primera (`FR-CONS-02`)
- Penalizaciones blandas visibles y cuantificadas (`FR-CONS-04`)
- Scoring ponderado lineal sobre features normalizadas, descomponible exactamente (`FR-REC-02`, ADR-09)
- Explicación obligatoria en toda respuesta con score (`FR-REC-03`)
- Contrafactual: el cambio mínimo que altera la recomendación (`FR-REC-04`)
- Override justificado por `analyst`, que nunca puede saltarse una restricción de riesgo prohibido (`FR-LIFE-02..03`)

**Puerta:** el test que define el hito — un sitio inválido con el score máximo posible no aparece en ningún ranking (`FR-CONS-01`); las contribuciones por feature suman el score dentro de tolerancia, verificado con property-based testing; auditoría del registro de features confirma que ninguna deriva de un score o endoso previo del propio sistema (`FR-REC-05`).

---

### M5 — Escenarios y optimización · ~3 semanas

- Escenario que fija pesos, conjunto de restricciones, presupuesto, objetivo y las versiones en vigor (`FR-SCEN-01`)
- Anclaje por hash del conjunto de candidatos y la matriz de features; una discrepancia al re-ejecutar es un error visible, nunca un recálculo silencioso (ADR-06)
- Optimizador greedy por ganancia marginal sobre coste (ADR-08); redundancia como consecuencia de la forma del objetivo de cobertura, no como penalización añadida (`FR-SCEN-04`)
- Impacto marginal por elemento del portafolio (`FR-SCEN-05`)
- Equidad antes y después, con las dos medidas de §2 (`FR-SCEN-06`)
- Comparación de 3 escenarios y análisis de sensibilidad (`FR-SCEN-07..08`)
- Trabajos asíncronos sobre `pgmq` con heartbeat (`FR-SCEN-09`, ADR-07)

**Puerta:** optimización sobre instancias pequeñas de óptimo conocido; presupuesto respetado; ganancias marginales monótonamente no crecientes; un escenario guardado se reproduce idéntico tras publicar versiones nuevas de datos (`FR-SCEN-02`), verificado como suite de regresión en CI (`NFR-REPRO-01`).

---

### M6 — Superficie de decisión · ~4 semanas

**API y evidencia (primero):**

- Contrato REST completo del SRS §10.1, versionado (`FR-API-01`)
- Estructura de procedencia obligatoria en serialización: un objeto con score sin ella falla a nivel de esquema, no pasa en silencio (`FR-API-02`, ARD §5.2)
- Tiles MVT dinámicos desde `ST_AsMVT` con predicado bbox e índice GIST (`FR-API-03`, ADR-10)
- Exportes GeoJSON, CSV, scenario JSON y PDF, autocontenidos (`FR-EXP-01`, `FR-EXP-04`)
- Round-trip del scenario JSON: reimportar reproduce el portafolio idéntico (`FR-EXP-02`)
- Reporte ejecutivo "Estrategia de Recuperación Urbana" (`FR-EXP-03`, PRD §50)

**Visor de decisión (después, y solo esto):**

- Una vista: mapa MapLibre + panel de sitio + comparador de escenarios
- Filtros por bbox, comuna, barrio, riesgo, estado de daño, tipo de intervención y rango de score (`FR-UI-04`)
- Confianza codificada **en el mapa**, no solo en el panel (`FR-UI-07`)
- Constructor de escenarios: pesos, presupuesto, restricciones, ejecutar, guardar (`FR-UI-03`)
- Todo en español, con terminología POT y DANE (`FR-UI-06`)
- Cero cómputo espacial en el navegador: cada número viene de la API con su procedencia (ADR-13)

**Puerta:** las mediciones de `NFR-PERF-01..06` sobre el volumen de referencia; el paquete de evidencia de CON-07 producido y revisado por la contraparte institucional.

---

### Recorrido completo

```text
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──► M5 ──► M6
 │              │      │                    │
 │              │      └── R5 medido        └── evidencia CON-07
 │              └── base sintética
 └── S1: R1 medido con dos semanas de proyecto
```

Suma ~21 semanas de trabajo secuencial. M1 y M2 se solapan parcialmente (el generador depende del contrato de M0 y de las capas base de M1, pero no de todas las fuentes). Con solapamiento realista: **~18 semanas**.

---

## 4. Estructura del repositorio

Un monolito modular con fronteras verificadas por CI (ADR-01). El orden de los paquetes refleja el orden del pipeline; el lint prohíbe las importaciones que romperían D2.

```text
apps/
  api/                 FastAPI: endpoints REST + tiles MVT
  worker/              misma imagen, otro entrypoint; consume pgmq
  viewer/              visor de decisión (React + MapLibre) — solo M6
packages/
  contracts/           contrato de daño congelado, esquemas de procedencia
  ingestion/           adaptadores por fuente, validación, versionado
  synthetic/           generador de daño sintético
  features/            motor de features espaciales
  constraints/         evaluación dura y blanda
  scoring/             idoneidad, descomposición, contrafactuales
  optimizer/           selección de portafolio
  reporting/           exportes, reporte ejecutivo
db/
  migrations/          esquema core (Supabase CLI) — ADR-11
  dbt/                 esquema analytics (features derivadas) — ADR-11
  tests/               invariantes pgTAP: RLS, inmutabilidad de versiones
docs/
  product/             PRD, SRS, ARD
  plan/                este plan, backlog, inventario de datos
  adr/                 decisiones posteriores al ARD
```

Regla de importación, forzada por lint: cada paquete solo puede importar de los que le preceden en el pipeline. `scoring` no importa `optimizer`. Nada importa internos de `ingestion`.

---

## 5. Estrategia de verificación

La tabla del ARD §5.3 se traduce en compromisos de CI por hito.

| Qué se prueba | Cómo | Desde |
|---|---|---|
| PII ausente del esquema analítico | Escaneo contra el diccionario de campos prohibidos | M0 |
| Inmutabilidad de versiones y políticas RLS | pgTAP | M1 |
| Determinismo del generador | Checksum sobre semilla fija | M2 |
| Features | Comparación contra dataset golden por `feature_version` | M3 |
| Restricciones | Fixtures fijos + el test del sitio inválido con score máximo | M4 |
| Scoring | Descomposición suma el score, property-based sobre vectores generados | M4 |
| Optimizador | Instancias pequeñas de óptimo conocido; presupuesto; monotonía marginal | M5 |
| Reproducibilidad | Suite de regresión sobre escenarios almacenados | M5 |
| Procedencia sintética | Un test por formato de salida | M2, ampliado en M6 |
| Autorización | Matriz de roles compartida entre tests de API y pgTAP (mitigación R4) | M6 |

R4 merece la nota: si RLS y la autorización de la API divergen, la segunda capa de defensa de ADR-05 deja de existir sin que nada falle. La mitigación es que **ambas prueben contra el mismo fixture de matriz de roles**, no contra dos copias que se desincronizan.

---

## 6. Definition of Done de la V1

Derivado del SRS §11, restringido al alcance de §1.1 de este plan.

- [ ] `FR-PII-01..03`, `FR-AUTH-01..03` y `FR-AUDIT-01` pasan
- [ ] El contrato de daño está congelado e implementado tras un adaptador (`FR-DC-02`)
- [ ] El generador sintético satisface `FR-SYN-01..06`
- [ ] El motor de features produce el vector de §1.3 con imputación declarada y versionado
- [ ] Las restricciones duras preceden al scoring de forma demostrable (`FR-CONS-01`), verificado con el caso del sitio inválido de score máximo
- [ ] Todo score expuesto lleva explicación y contrafactual
- [ ] La optimización con presupuesto corre con reporte de redundancia y equidad
- [ ] Tres escenarios se construyen, comparan, exportan y reproducen desde el export
- [ ] Los modos degradados están definidos para cada capa requerida y se ejercitan al menos una vez
- [ ] `NFR-PERF-01..06` medidos y cumplidos sobre el volumen de referencia
- [ ] Un escenario almacenado al inicio del piloto se reproduce idéntico al final (`NFR-REPRO-01`)
- [ ] El visor cumple `FR-UI-01..04`, `FR-UI-06..07`, es operable por teclado y no codifica ninguna distinción categórica solo por color
- [ ] El paquete de evidencia de CON-07 está producido y revisado por la contraparte institucional

Fuera del DoD de la V1, y explícitamente diferido: `FR-UI-05` (auditoría WCAG formal cerrada), `FR-REC-06` (ML).

---

## 7. Riesgos vivos

Los del ARD §6, con lo que este plan hace al respecto.

| ID | Riesgo | Qué hace el plan |
|---|---|---|
| R1 | Catchments con pgRouting exceden la ventana de batch | Spike S1 en M0, no medición al final |
| R2 | Tier de cómputo de Supabase insuficiente | Dimensionar contra el dataset de referencia en M1; el batch corre fuera de horario, así que el tier puede subirse temporalmente |
| R3 | Procedencia sintética perdida en un camino sin test | Estructura de procedencia obligatoria en serialización + un test por formato, desde M2 |
| R4 | RLS y autorización de API divergen | Fixture de matriz de roles compartido entre ambas suites |
| R5 | Calidad desigual de la red OSM sesga los catchments y puede invertir el análisis de equidad | Densidad de red por comuna como entregable de M3 y driver de confianza |
| R6 | La institución rechaza el hosting offshore tarde en el piloto | La pregunta va en la primera sesión institucional, con el argumento de D3: la base analítica no contiene datos personales. Ruta de salida de ADR-14 preservada |
| **R7** | **El planificador no reconoce el territorio en los resultados** | Riesgo nuevo, y el más probable. Sesión de validación con un planificador al cierre de M3 (features) y de M4 (recomendaciones), sobre exportes, antes de que exista visor |
| **R8** | **Una fuente sin licencia verificada llega a un export comercial** | Clasificación obligatoria en `source_register`, `UNCLEAR` bloqueante, puerta de export por perfil y test en CI ([fuentes.md](./fuentes.md) §6) |
| **R9** | **Fuentes de evidencia de daño no independientes inflan la confianza** | Copernicus y SERTIT pueden clasificar las mismas imágenes; la función de fusión modela independencia explícitamente (OI-F7) |

R7 es la razón por la que este plan pone la API y el paquete de evidencia antes que la interfaz. Si las recomendaciones no resisten la revisión de alguien que conoce Pereira, ninguna pantalla lo arregla.
