# Backlog del MVP

Épicas y unidades de trabajo derivadas del [plan de MVP](./mvp-plan.md). Cada unidad traza a requisitos del SRS, de modo que el estado del backlog y el estado del contrato son la misma cosa.

Convención de tamaño: **S** ≤ 2 días · **M** 3-5 días · **L** 1-2 semanas · **XL** > 2 semanas (partir antes de empezar).

---

## E0 — Fundaciones · M0

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E0-1 | Repositorio, CI, estructura de paquetes, lint de fronteras de importación | ADR-01 | M |
| E0-2 | Proyecto Supabase, extensiones, migraciones del esquema `core` | ADR-04, ADR-11 | M |
| E0-3 | Roles de BD restringidos + políticas RLS iniciales + tests pgTAP | `FR-AUTH-01..03`, ADR-05 | M |
| E0-4 | Diccionario de campos prohibidos + test de regresión de PII en CI | `FR-PII-01..02` | S |
| E0-5 | Contrato de daño del SRS §6 como esquema validable, congelado | `FR-DC-01` | M |
| E0-6 | `source_register` con clasificación `license_class`, atribución y snapshot de términos | `FR-ING-01`, `FR-LIC-01` | M |
| E0-6b | **Auditoría de licencia dataset por dataset** (DANE, SGC, IDEAM, AMCO, CARDER, OSM, Megabús, Copernicus, SERTIT, UNOSAT, Datos del Terremoto) | OI-F2, fuentes.md §10 | L |
| E0-6c | Perfiles de export (`INTERNAL`/`INSTITUTIONAL`/`COMMERCIAL`) + puerta que aborta nombrando la fuente inadmisible | **R8**, fuentes.md §5-6 | M |
| E0-6d | Test en CI: fuente en uso en `UNCLEAR`, redistribución indebida, o verificación con más de 12 meses | **R8** | S |
| E0-6e | Modelo `damage_evidence` en migraciones de `core` | ADR-16 | M |
| E0-7 | Log de auditoría inmutable (creación/modificación de escenario, pesos, overrides, publicación, exportes) | `FR-AUDIT-01` | M |
| E0-8 | **Spike S1**: grafo peatonal de Pereira + cronometrar `pgr_drivingDistance` × 1.500 orígenes × 3 umbrales | R1, ADR-02 | M |
| E0-9 | `data_inventory.md` completado con disponibilidad real por fuente | PRD §53 | M |

**Puerta E0:** CI verde con E0-4 y E0-6d; contrato congelado y revisado; S1 con número documentado; OI-A1 y OI-A2 cerrados; **ninguna fuente Tier A en `UNCLEAR`**.

---

## E1 — Ingesta versionada · M1

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E1-1 | Marco de ingesta: versiones append-only, reejecución reproducible | `FR-ING-02..03`, ADR-06 | L |
| E1-2 | Normalización de geometría y CRS (4326 almacenado, 3116 métrico) | `FR-ING-04` | M |
| E1-3 | Adaptador DANE (población, hogares, geografía censal) | PRD §9.2 | M |
| E1-4 | Adaptador IDE AMCO vía WFS (POT, uso de suelo, barrios, comunas, predios) — **POT y microzonificación hechos, al sandbox** (ADR-26); falta la base cuando la licencia se declare | `FR-ING-05`, PRD §9.5 | L |
| E1-5 | Adaptador SGC (microzonificación, amenaza sísmica, movimientos en masa) | PRD §9.6 | M |
| E1-6 | Adaptador OSM (red peatonal, edificaciones, parques, equipamientos, POIs) | PRD §9.4 | L |
| E1-7 | Adaptador Megabús (estaciones + frecuencia de servicio) | ADR-03 | S |
| E1-8 | Alertas de calidad como tabla consultable + vista de panel | `FR-QUAL-02` | M |
| E1-9 | Aislamiento de fallo de fuente externa: sirve última versión + alerta de obsolescencia | `FR-EXT-01` | M |
| E1-10 | Umbral mínimo de agregación con marcador de supresión | `FR-PII-03` | S |
| E1-11 | **Aislamiento de OSM en esquemas `osm_raw` / `osm_derived`** y archivado del extracto por `data_version` | OI-F1, fuentes.md §8 | M |
| E1-12 | Propagación del conjunto de `source_id` contribuyentes en la estructura de procedencia | fuentes.md §6 (C2) | M |
| E1-13 | Bloque de atribución generado automáticamente desde `source_register` | `FR-LIC-01` (C4) | S |
| E1-14 | Adaptadores Tier B/C: datosdelterremoto.org, y Copernicus/SERTIT/UNOSAT hacia `damage_evidence` | ADR-16, fuentes.md §3 | L |

**Puerta E1:** dos ingestas sobre la misma versión de fuente producen salidas idénticas; pgTAP demuestra que publicar *n+1* no muta *n*; una fuente caída degrada solo sus features.

---

## E2 — Daño sintético · M2

> **DEROGADO por [ADR-17](../adr/ADR-17-prohibicion-de-datos-sinteticos.md) (2026-09-15).** El generador sintético se retiró: la prueba de estabilidad ante la semilla dio 15 % y el ranking resultó ser una propiedad del generador. La migración 006 prohíbe `is_synthetic = true` en la base. Esta sección queda como registro de lo que se planeó, no de lo que se hace.

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E2-1 | Generador determinista por semilla | `FR-SYN-01` | M |
| E2-2 | Estructura espacial plausible: agrupamiento + correlación con microzonificación y tipología | `FR-SYN-02` | L |
| E2-3 | Manifiesto de generación inmutable | `FR-SYN-03` | S |
| E2-4 | Estructura de procedencia obligatoria en serialización (`is_synthetic` no nulo, propagado) | `FR-SYN-04`, ARD §5.2 | M |
| E2-5 | Etiquetado de procedencia mixta por capa | `FR-SYN-05` | S |
| E2-6 | Bloqueo de `ENDORSED` mientras exista daño sintético | `FR-SYN-06` | S |
| E2-8 | **Función de fusión de evidencia** → confianza de daño, versionada y documentada | ADR-16 | L |
| E2-9 | Modelado explícito de independencia entre fuentes que comparten insumo satelital | **R9**, OI-F7 | M |
| E2-10 | El generador sintético emite a `damage_evidence` con `method='sintético'`, no a un `damage_level` de sitio | ADR-16 | S |
| E2-7 | Un test de procedencia por formato de salida | R3 | M |

**Puerta E2:** misma semilla → mismos checksums; autocorrelación por encima del umbral documentado; manifiesto completo; marca sintética sobrevive en los cuatro formatos.

---

## E3 — Motor de features · M3

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E3-1 | Construcción del grafo peatonal en tablas PostGIS | ADR-02 | L |
| E3-2 | Catchments de red precomputados en batch nocturno (5/10/15 min) | `FR-FEAT-02`, ADR-02, ADR-07 | L |
| E3-3 | Fallback a buffer con marca de degradación y penalización de confianza | `FR-FEAT-03` | M |
| E3-4 | Imputación poblacional declarada y versionada (dasimétrica por huella residencial) | `FR-FEAT-06`, OI-07 | L |
| E3-5 | Déficit de espacio público contra estándar configurable versionado | `FR-FEAT-04`, OI-04 | M |
| E3-6 | Features de riesgo y compatibilidad de uso de suelo (bloqueantes) | `FR-FEAT-01` | M |
| E3-7 | Features de acceso a equipamientos y proximidad a tránsito | `FR-FEAT-01`, ADR-03 | M |
| E3-8 | Proxy de vulnerabilidad social desde censo DANE | PRD §12 | M |
| E3-9 | `feature_version` + `data_version` en cada vector; linaje consultable | `FR-FEAT-05` | M |
| E3-10 | Confianza por sitio con drivers explícitos, incluida la concordancia de evidencia de daño | `FR-QUAL-01`, ADR-16 | M |
| E3-11 | **Densidad de red peatonal por comuna** como driver de confianza | **R5** | M |
| E3-12 | Modos degradados por capa, incluido el sitio sin ninguna evidencia de daño | `FR-DEG-01..02`, ADR-16 | M |
| E3-13 | Dataset golden por feature + comparación en CI | ARD §5.3 | M |
| E3-14 | **Sesión de validación con planificador sobre features exportadas** | **R7** | S |

**Puerta E3:** el caso del río sin cruce excluye la población del otro lado; recómputo completo dentro de `NFR-PERF-04`; golden dataset en verde.

---

## E4 — Restricciones, scoring y explicación · M4

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E4-1 | Conjunto de restricciones como configuración versionada | `FR-CONS-03` | M |
| E4-2 | Evaluación dura previa al scoring, con separación estructural del conjunto de candidatos | `FR-CONS-01`, ARD §5.1 | M |
| E4-3 | Atribución completa de exclusión (todas las restricciones violadas) | `FR-CONS-02` | S |
| E4-4 | Restricciones blandas como penalizaciones visibles y cuantificadas | `FR-CONS-04` | M |
| E4-5 | Catálogo de intervenciones V1 (6 tipos) con áreas, radios, costos y requisitos de riesgo | PRD §16 | M |
| E4-6 | Normalización de features versionada | ADR-09 | M |
| E4-7 | Scoring ponderado lineal sitio × intervención, descomponible exactamente | `FR-REC-01..02` | L |
| E4-8 | Explicación obligatoria en toda respuesta con score | `FR-REC-03` | M |
| E4-9 | Contrafactual: cambio mínimo que altera la recomendación | `FR-REC-04` | L |
| E4-10 | Ciclo de vida del sitio y transiciones deterministas | `FR-LIFE-01` | M |
| E4-11 | Override justificado por `analyst` (mín. 40 caracteres, versionado, visible aguas abajo) | `FR-LIFE-02` | M |
| E4-12 | Bloqueo de override sobre riesgo prohibido | `FR-LIFE-03` | S |
| E4-13 | Auditoría del registro de features contra circularidad | `FR-REC-05` | S |
| E4-14 | Property-based testing de descomposición del score | ARD §5.3 | M |
| E4-15 | **Sesión de validación con planificador sobre recomendaciones exportadas** | **R7** | S |

**Puerta E4:** un sitio inválido con score máximo no aparece en ningún ranking; las contribuciones suman el score dentro de tolerancia; registro de features sin circularidad.

---

## E5 — Escenarios y optimización · M5

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E5-1 | Modelo de escenario: pesos, restricciones, presupuesto, objetivo, versiones fijadas | `FR-SCEN-01` | M |
| E5-2 | Anclaje por hash del conjunto de candidatos y la matriz de features; discrepancia = error visible | ADR-06 | M |
| E5-3 | Reproducibilidad sobre publicación de datos nueva | `FR-SCEN-02` | M |
| E5-4 | Cola de trabajos pgmq + `pg_cron` + heartbeat del worker | ADR-07 | M |
| E5-5 | Optimizador greedy por ganancia marginal sobre coste, tras interfaz `select(...)` | `FR-SCEN-03`, ADR-08 | L |
| E5-6 | Objetivo de cobertura poblacional submodular (la redundancia cae de su forma) | `FR-SCEN-04` | M |
| E5-7 | Impacto marginal por elemento del portafolio | `FR-SCEN-05` | S |
| E5-8 | Reporte de equidad: Gini sobre acceso + brecha de déficit entre comunas | `FR-SCEN-06`, OI-03 | M |
| E5-9 | Comparación de 3 escenarios en una vista de datos | `FR-SCEN-07` | M |
| E5-10 | Análisis de sensibilidad sobre pesos, presupuesto y costos | `FR-SCEN-08` | L |
| E5-11 | Optimización asíncrona por encima del umbral de 10 s, con estado consultable | `FR-SCEN-09`, `NFR-PERF-06` | M |
| E5-12 | Suite de regresión de escenarios almacenados en CI | `NFR-REPRO-01` | M |

**Puerta E5:** instancias de óptimo conocido resueltas; presupuesto respetado; ganancias marginales no crecientes; escenario guardado reproducible tras publicar datos nuevos.

---

## E6 — API, evidencia y visor · M6

### E6a — API y evidencia (primero)

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E6-1 | Contrato REST completo del SRS §10.1, versionado | `FR-API-01` | L |
| E6-2 | Procedencia obligatoria en serialización; falla a nivel de esquema si falta | `FR-API-02` | M |
| E6-3 | Tiles MVT dinámicos desde `ST_AsMVT`, con índice GIST y predicado bbox | `FR-API-03`, ADR-10 | L |
| E6-4 | Conexiones diferenciadas API (transaction) / worker (session) | ADR-12 | S |
| E6-5 | Exportes GeoJSON, CSV y scenario JSON | `FR-EXP-01` | M |
| E6-6 | Round-trip del scenario JSON reproduciendo portafolio idéntico | `FR-EXP-02` | M |
| E6-7 | Reporte ejecutivo "Estrategia de Recuperación Urbana" en PDF | `FR-EXP-03` | L |
| E6-8 | Metadatos autocontenidos en todo export (procedencia, versiones, estado sintético, licencias, timestamp) | `FR-EXP-04`, `FR-LIC-01`, CON-07 | M |
| E6-8b | Citación de evidencia de daño en panel y exports, con fuente, método y fecha de observación | ADR-16, `FR-REC-03` | M |
| E6-9 | Fixture compartido de matriz de roles entre tests de API y pgTAP | **R4** | S |
| E6-10 | Medición de `NFR-PERF-01..06` sobre volumen de referencia | ARD §6 | M |

### E6b — Visor de decisión (después, y solo esto)

| # | Trabajo | Traza | Tamaño |
|---|---|---|---|
| E6-11 | Vista cartográfica MapLibre con capas base y sitios | `FR-UI-01`, ADR-13 | L |
| E6-12 | Panel de sitio: atributos, features, estado, recomendaciones, explicación, confianza | `FR-UI-02` | L |
| E6-13 | Filtros por bbox, comuna, barrio, riesgo, daño, intervención y rango de score | `FR-UI-04` | M |
| E6-14 | Constructor de escenarios: pesos, presupuesto, restricciones, ejecutar, guardar | `FR-UI-03` | L |
| E6-15 | Comparador de escenarios | `FR-SCEN-07` | M |
| E6-16 | Confianza codificada en el mapa, no solo en el panel | `FR-UI-07` | M |
| E6-17 | Español con terminología POT y DANE en toda la superficie | `FR-UI-06` | M |
| E6-18 | Operabilidad por teclado + codificación no dependiente del color (base de `FR-UI-05`) | Resolución 1519 | M |

**Puerta E6:** `NFR-PERF-01..06` medidos y cumplidos; paquete de evidencia de CON-07 producido y revisado por la contraparte institucional.

---

## Trabajo explícitamente no planificado en la V1

Vive aquí para que no se cuele por acumulación. Entra solo por decisión consciente, no por deriva.

`FR-REC-06` ML · PRD §36 clusters · PRD §37 corredores verdes · isócronas multimodales · optimizador MILP/NSGA-II · PMTiles de edificaciones y predios · panel de administración de usuarios y fuentes · auditoría WCAG formal cerrada · SISBEN e imágenes satelitales (PRD §9.10) · multi-tenencia (CON-02)
