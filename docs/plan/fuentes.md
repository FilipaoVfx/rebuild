# Fuentes de datos — consumo técnico y régimen de licencia

**Documento operativo.** Lo consume el equipo que escribe los adaptadores de ingesta y quien audite el origen de un número en un export.
**Traza:** `FR-ING-01` (fuentes registradas), `FR-LIC-01` (registro de licencias), `FR-EXT-01` (aislamiento de fallo), `FR-DEG-01` (modos degradados)
**Versión:** 0.1 — el estado de verificación de licencia de la mayoría de filas es `POR VERIFICAR`

---

## 0. Advertencia previa, y por qué está arriba

Este documento es un **registro de ingeniería**, no asesoría legal. Clasifica lo que el equipo ha comprobado y marca explícitamente lo que no.

Una regla gobierna todo lo demás:

> **Ninguna fuente entra al pipeline sin una fila en `source_register` con `license_class` distinto de `UNCLEAR`.**
> Mientras esté en `UNCLEAR`, la fuente puede explorarse en un entorno de análisis, pero no puede alimentar una feature, un score ni un export.

Esto no es burocracia. Es la única forma de que, doce meses después, se pueda responder "¿de dónde salió este número y teníamos derecho a publicarlo?" sin reconstruir arqueología.

Hay **un punto que sí requiere revisión legal real**, no criterio de ingeniería: la interacción entre el *share-alike* de ODbL (OpenStreetMap) y un producto comercial que sirve datos derivados por API. Está aislado en §8 para que no se diluya entre el resto.

---

## 1. Los cinco ejes de la clasificación

"Gratis" no significa nada por sí solo. Cada fuente se evalúa en cinco ejes independientes:

| Eje | Pregunta |
|---|---|
| **Descarga** | ¿Se puede obtener sin pago ni contrato? |
| **Open data** | ¿Está publicado bajo una licencia abierta reconocible, o solo "disponible"? |
| **Uso comercial** | ¿Se puede usar dentro de un producto que se cobra? |
| **Redistribución** | ¿Se pueden republicar los archivos, o solo consumirlos? |
| **Derivados** | ¿Se puede publicar lo que calculamos a partir de ello, y bajo qué condiciones? |

Los cinco colapsan en un único enum que vive en la base de datos y gobierna los controles automáticos de §6:

```sql
CREATE TYPE license_class AS ENUM (
  'COMMERCIAL_SAFE',   -- uso comercial, redistribución y derivados sin condición material
  'ATTRIBUTION',       -- lo anterior, condicionado a atribución explícita
  'SHARE_ALIKE',       -- lo anterior, y los derivados heredan obligaciones de licencia
  'NON_COMMERCIAL',    -- prohibido dentro de un producto comercial
  'UNCLEAR'            -- sin verificar, o términos ambiguos. Bloqueante.
);
```

`UNCLEAR` es el valor por defecto de toda fuente nueva. Se sale de él con evidencia archivada (§10), no con una lectura rápida de la página del portal.

---

## 2. Matriz de estado

Estado actual, con la distinción entre lo verificado y lo asumido marcada explícitamente. **Ninguna fila con `POR VERIFICAR` puede alimentar un export comercial.**

| Fuente | `license_class` | Comercial | Redistribuir | Derivados | Verificación |
|---|---|---|---|---|---|
| Datos.gov.co | `ATTRIBUTION` | ✅ | ✅ | ✅ | Verificado por el equipo — términos del portal |
| DANE (geoportal, MGN) | `ATTRIBUTION` | ✅ | ✅ | ✅ | **Parcial** — el portal es claro; falta confirmar dataset por dataset |
| OpenStreetMap | `SHARE_ALIKE` | ✅ | ✅ | ⚠️ condicionado | Verificado — ODbL. Ver §8, es el caso difícil |
| datosdelterremoto.org (derivados) | `ATTRIBUTION` | ✅ | ✅ | ✅ | Verificado — CC BY 4.0 declarado sobre *derivados* |
| datosdelterremoto.org (crudos) | hereda del original | — | — | — | Cada archivo conserva su licencia de origen |
| SGC | `UNCLEAR` | ? | ? | ? | **POR VERIFICAR** — por dataset |
| IDEAM | `UNCLEAR` | ? | ? | ? | **POR VERIFICAR** — por dataset |
| IDE AMCO | `UNCLEAR` | ? | ? | ? | **POR VERIFICAR** — por capa |
| CARDER | `UNCLEAR` | ? | ? | ? | **POR VERIFICAR** — por dataset |
| Megabús | `UNCLEAR` | ? | ? | ? | **POR VERIFICAR** |
| Copernicus EMS | `UNCLEAR` | ⚠️ | ⚠️ | ⚠️ | **POR VERIFICAR por producto**, no por programa |
| International Charter | `UNCLEAR` | ⚠️ | ❌ probable | ⚠️ | **POR VERIFICAR** — ver §7.11, hay un problema anterior al de licencia |
| SERTIT | `NON_COMMERCIAL` | ❌/⚠️ | ⚠️ | ⚠️ | Algunos productos con condición no comercial |
| UNOSAT | `UNCLEAR` | ⚠️ | ⚠️ | ⚠️ | **POR VERIFICAR por producto** |
| Generador sintético | `COMMERCIAL_SAFE` | ✅ | ✅ | ✅ | Producción propia |

> "Gratis" no aparece como columna a propósito. Las catorce lo son. La columna no discrimina nada y su presencia induce exactamente el error que este documento existe para evitar.

---

## 3. Tiers de uso

La clasificación dice qué se *puede* hacer. El tier dice qué *hacemos*.

### 🟢 Tier A — Núcleo comercialmente seguro

`DANE` · `Datos.gov.co` · `IDE AMCO`* · `SGC`* · `IDEAM`* · `CARDER`* · `OSM` (con las condiciones de §8)

Es el núcleo del producto. Toda feature que alimente un score de la V1 sale de aquí. El asterisco marca las que están en Tier A **condicionalmente**: son casi con certeza utilizables, pero hasta que la auditoría de §10 las mueva de `UNCLEAR`, su uso está bloqueado por el control de §6.

### 🟡 Tier B — Evidencia de desastre

`Copernicus EMS` · `International Charter` · `SERTIT` · `UNOSAT`

Se usan como **evidencia analítica con metadatos de licencia**, nunca como capa redistribuible. Concretamente:

- Entran a `damage_evidence` (§9) como observaciones atribuidas, no a una tabla de daño consolidada
- Nunca se incluyen en un export sin comprobar su `redistribution_allowed`
- Un producto Tier B puede *sustentar* una clase de daño y aparecer citado en la explicación; sus píxeles o polígonos originales no salen del sistema

La distinción operativa: **citar una fuente no es redistribuirla**. Decir "Copernicus EMS clasificó esta manzana como daño severo el 14/08/2026" es una afirmación factual con atribución. Adjuntar el GeoTIFF es redistribución.

### 🟢 Tier C — Dataset derivado de terceros

`datosdelterremoto.org`

Es la fuente más limpia disponible para el MVP: ya hace la normalización y el cruce, y publica sus **derivados** bajo CC BY 4.0. Se consume así, y solo así.

Lo que **no** se hace: asumir que por estar agregados ahí adquirimos derecho a redistribuir los archivos originales de Copernicus, SERTIT o quien sea. El proyecto lo dice explícitamente y el pipeline tiene que respetarlo — por eso `damage_evidence.original_source` existe como campo separado de `source` (§9).

---

## 4. Registro de fuentes

El `source_register` del `FR-ING-01` se extiende con el bloque de licencia. Esta es la tabla que hace cumplible todo lo anterior.

```sql
CREATE TABLE core.source_register (
  source_id              text PRIMARY KEY,
  display_name           text NOT NULL,
  tier                   char(1) NOT NULL CHECK (tier IN ('A','B','C')),

  -- FR-ING-01
  source_url             text NOT NULL,
  access_method          text NOT NULL,   -- wfs | wms | download | api | request | generated
  spatial_reference      text NOT NULL,
  update_frequency       interval,
  quality_score          numeric,

  -- FR-LIC-01
  license_class          license_class NOT NULL DEFAULT 'UNCLEAR',
  license_name           text,            -- 'CC BY 4.0', 'ODbL 1.0', ...
  license_url            text,
  attribution_text       text,            -- literal, tal como debe aparecer en exports
  redistribution_allowed boolean,
  derivatives_allowed    boolean,
  share_alike            boolean NOT NULL DEFAULT false,

  -- evidencia de la verificación
  terms_verified_at      date,
  terms_verified_by      text,
  terms_snapshot_path    text,            -- copia archivada de los términos en Storage
  verification_notes     text,

  created_at             timestamptz NOT NULL DEFAULT now()
);
```

`terms_snapshot_path` es el campo que la gente omite y luego echa de menos. Los términos de un portal cambian sin aviso y sin historial. Lo que importa legalmente es bajo qué condiciones se obtuvo el dato **en su fecha de obtención**, y eso solo se demuestra con una copia archivada.

---

## 5. Perfiles de export

Un export no es un archivo: es un archivo con un destinatario. El destinatario decide qué fuentes pueden contribuir.

| Perfil | Destinatario | Clases admitidas |
|---|---|---|
| `INTERNAL` | Equipo, análisis interno | todas, incluida `UNCLEAR` |
| `INSTITUTIONAL` | Contraparte municipal del piloto | `COMMERCIAL_SAFE`, `ATTRIBUTION`, `SHARE_ALIKE`, `NON_COMMERCIAL` |
| `COMMERCIAL` | Producto comercial, cliente de pago | `COMMERCIAL_SAFE`, `ATTRIBUTION`, `SHARE_ALIKE` (con §8 resuelto) |

`NON_COMMERCIAL` es admisible en el perfil institucional porque el piloto no es un producto comercial: es un trabajo para la entidad, que a su vez suele ser usuaria autorizada de esas fuentes. No es admisible en `COMMERCIAL` bajo ninguna lectura.

---

## 6. Controles automáticos

Las reglas de arriba no se cumplen por disciplina. Se cumplen porque el sistema falla si no se cumplen.

**C1 — Bloqueo de ingesta.** Una fuente con `license_class = 'UNCLEAR'` no puede registrarse como insumo de una feature. La ingesta exploratoria escribe en un esquema `sandbox` que el motor de features no puede leer.

**C2 — Propagación de contribución.** Toda feature, score y elemento de portafolio arrastra el conjunto de `source_id` que contribuyó. Viaja en la misma estructura de procedencia que `is_synthetic`, `data_version` y `feature_version` (ARD §5.2). No es un campo aparte que alguien pueda olvidar de rellenar: la serialización falla sin él.

**C3 — Puerta de export.** Antes de generar un export, se resuelve el conjunto de fuentes contribuyentes y se compara contra las clases admitidas del perfil. Una fuente inadmisible **aborta el export nombrándola**, no la omite en silencio.

**C4 — Bloque de atribución generado.** El `attribution_text` de cada fuente contribuyente se compone automáticamente en todo export (`FR-LIC-01`). No hay una plantilla escrita a mano que se desincronice del registro.

**C5 — Test en CI.** Un test recorre `source_register` y falla si: una fuente en uso está en `UNCLEAR`; una fuente con `redistribution_allowed = false` aparece en el grafo de contribución de un perfil que redistribuye; una fuente carece de `terms_snapshot_path` con `terms_verified_at` a menos de 12 meses.

C5 es el que convierte este documento en algo vivo. Sin él, la matriz de §2 envejece en silencio.

---

## 7. Ficha por fuente

### 7.1 DANE — población, hogares, geografía censal · Tier A

| | |
|---|---|
| **Aporta** | `population_10min`, `households_10min`, `social_vulnerability`, base de la imputación poblacional |
| **Acceso** | Geoportal DANE (MGN — Marco Geoestadístico Nacional) y Datos.gov.co. Descarga directa; endpoint exacto a confirmar en E0-9 |
| **Formato / CRS** | Shapefile / GPKG, MAGNA-SIRGAS. Reproyectar a EPSG:4326 almacenado, EPSG:3116 para métrica |
| **Cadencia** | Censal / irregular. `update_frequency` alto; las alertas de obsolescencia no deben dispararse por diseño |
| **Campos consumidos** | Geometría de manzana/sector, totales de población y hogares, estructura demográfica agregada |
| **Campos prohibidos** | Ninguno a nivel de unidad censal. **No se ingiere microdato**, en ninguna circunstancia (`FR-PII-01`, CON-04) |
| **Riesgo de reidentificación** | Real en unidades censales pequeñas. Mitigado por `FR-PII-03` — umbral mínimo de 20 hogares con marcador de supresión |
| **Modo degradado** | Geografía censal: **parada total**. Atributos de población: omisión + penalización de confianza |
| **Licencia** | `ATTRIBUTION`. Verificación parcial: los términos de Datos.gov.co son claros; los datasets del geoportal DANE hay que confirmarlos uno a uno |
| **Adaptador** | `packages/ingestion/adapters/dane.py` |

> Pregunta abierta que decide precisión, no solo licencia: si la población está disponible a nivel de manzana o solo de sector. Cambia la calidad de la imputación dasimétrica (OI-07) y el umbral efectivo de `FR-PII-03`.

---

### 7.2 Datos.gov.co — portal nacional de datos abiertos · Tier A

| | |
|---|---|
| **Aporta** | Vía de acceso a datasets del DANE y de entidades territoriales; equipamientos, inventarios sectoriales |
| **Acceso** | API Socrata (SODA) + descarga directa. Permite consulta incremental, preferible a la descarga completa |
| **Formato / CRS** | CSV / GeoJSON / Shapefile según dataset. CRS declarado por dataset — **no asumir**, leer de metadatos |
| **Licencia** | `ATTRIBUTION`. Verificado: el portal permite usar, aprovechar y transformar libremente los datos publicados, incluida la creación de aplicaciones de terceros |
| **Matiz importante** | Los términos del **portal** no sustituyen a la licencia de un **dataset** concreto que declare la suya. Cuando hay conflicto, gana la del dataset. El adaptador lee el bloque de licencia del metadato de cada dataset, no asume el del portal |
| **Modo degradado** | Depende de la capa concreta que sirva |
| **Adaptador** | `packages/ingestion/adapters/datos_gov.py` |

---

### 7.3 OpenStreetMap — red peatonal, edificaciones, parques, equipamientos, POIs · Tier A

| | |
|---|---|
| **Aporta** | Grafo peatonal (catchments de red, ADR-02), `pedestrian_accessibility`, `building_density`, complemento de parques y equipamientos, huellas para la imputación dasimétrica |
| **Acceso** | **Extracto regional de Geofabrik** (`download.geofabrik.de/south-america/colombia.html`) o extracto propio desde un planet dump. **Nunca la API de edición (`api.openstreetmap.org`) para descarga masiva** — es para editar, no para consumir |
| **Formato / CRS** | PBF → importado a PostGIS con `osm2pgsql` u `osmium`. EPSG:4326 nativo |
| **Cadencia** | Continua aguas arriba; nosotros congelamos un extracto por `data_version` (ADR-06). La reproducibilidad exige que el extracto sea un artefacto versionado y archivado, no una descarga repetida |
| **Modo degradado** | Red peatonal ausente: fallback a catchment por buffer con marca de degradación (`FR-FEAT-03`). Resto: omisión |
| **Licencia** | `SHARE_ALIKE` — ODbL 1.0. Uso comercial permitido, atribución obligatoria, y obligaciones de share-alike sobre bases derivadas. **Ver §8** |
| **Adaptador** | `packages/ingestion/adapters/osm.py` |

**Reglas operativas no negociables:**

1. **No se usan los tiles públicos de `tile.openstreetmap.org` en ningún entorno desplegado.** La política de uso de la OSMF los destina a usos ligeros y no a producción de terceros. Servimos nuestra propia infraestructura de tiles desde nuestro PostGIS (ADR-10). Esto es además lo que hace reproducible el mapa: un tile servido por un tercero no tiene `data_version`.
2. La atribución "© OpenStreetMap contributors" aparece en el visor y en todo export que contenga geometría derivada de OSM.
3. El extracto de cada `data_version` se archiva. Sin eso, `NFR-REPRO-01` es falso para toda feature que dependa de la red peatonal, que son casi todas.

**R5 vive aquí.** La calidad de la red peatonal de OSM varía por barrio. Un análisis de equidad construido sobre una red desigualmente mapeada favorece a los barrios que ya estaban mejor documentados, e invierte su propia conclusión. La densidad de red por comuna es un entregable de M3 y un driver de confianza (`FR-QUAL-01`), no una nota al pie.

---

### 7.4 IDE AMCO — POT, uso de suelo, límites administrativos, predios · Tier A condicional

| | |
|---|---|
| **Aporta** | `land_use_compatibility` (**bloqueante**), barrios y comunas para resolución de referencias administrativas, predios para `building_density` |
| **Acceso** | WFS/WMS si está operativo — preferente por `FR-ING-05`, que obliga a registrar endpoint y parámetros de consulta en la procedencia. Si no, descarga manual versionada |
| **Formato / CRS** | GML/GeoJSON vía WFS. CRS a confirmar; probable MAGNA-SIRGAS origen Bogotá u origen occidente |
| **Modo degradado** | Uso de suelo: **parada total** — no se puede puntuar sin saber si la intervención es compatible. Límites administrativos: **parada total** (`FR-DC-01` exige resolver barrio y comuna). Predios: omisión |
| **Licencia** | `UNCLEAR` — auditar **por capa**, no por portal. Una IDE municipal puede publicar capas con regímenes distintos |
| **Adaptador** | `packages/ingestion/adapters/amco.py` |

> Esta es la fuente de la que más depende el sistema y sobre la que menos se sabe hoy. Si AMCO no publica WFS operativo, `FR-ING-05` pierde su caso principal y E1-4 cambia de tamaño. Es la primera pregunta que hay que resolver en E0-9.

---

### 7.5 SGC — microzonificación sísmica, amenaza, movimientos en masa · Tier A condicional

| | |
|---|---|
| **Aporta** | `risk_score` (**bloqueante**), restricciones duras de riesgo prohibido, correlación espacial del generador sintético (`FR-SYN-02`) |
| **Acceso** | Geoportal SGC. Servicios OGC probables; a confirmar |
| **Modo degradado** | **Parada total.** `FR-DEG-01` es explícito: si la capa de riesgo no está, el sistema se detiene y lo dice, en lugar de puntuar sin riesgo |
| **Licencia** | `UNCLEAR` — auditar por dataset |
| **Adaptador** | `packages/ingestion/adapters/sgc.py` |

> El riesgo actúa como restricción, no como una variable más del ranking (PRD §9.6). Un sitio en riesgo prohibido no se rescata con un score alto, y `FR-LIFE-03` impide incluso el override manual. Eso hace que la disponibilidad de esta capa sea una precondición del producto, no una feature más.

---

### 7.6 IDEAM — hidrología, clima, inundación · Tier A condicional

| | |
|---|---|
| **Aporta** | Restricciones blandas ambientales; contexto de inundación |
| **Modo degradado** | Omisión + penalización de confianza |
| **Licencia** | `UNCLEAR` — auditar por dataset |
| **Prioridad** | Baja para la V1. Ninguna feature del vector de §1.3 del plan depende de ella |

---

### 7.7 CARDER — estructura ecológica, áreas protegidas, restricciones ambientales · Tier A condicional

| | |
|---|---|
| **Aporta** | Restricciones duras ambientales (áreas protegidas), complemento de amenaza por movimientos en masa |
| **Modo degradado** | Áreas protegidas: **parada total** si se usan como restricción dura — una restricción que a veces no se evalúa no es una restricción |
| **Licencia** | `UNCLEAR` — auditar por dataset |

---

### 7.8 Megabús — estaciones y frecuencia de servicio · Tier A condicional

| | |
|---|---|
| **Aporta** | `transit_proximity` |
| **Acceso** | A confirmar. GTFS si existe; si no, inventario de estaciones + atributo de frecuencia |
| **Alcance V1** | Proximidad peatonal a estación más frecuencia, **no** isócrona multimodal (ADR-03). El nombre y la interfaz de la feature están diseñados para que cambie la implementación sin cambiar el contrato |
| **Modo degradado** | Omisión |
| **Licencia** | `UNCLEAR` |

---

### 7.9 datosdelterremoto.org — dataset derivado · Tier C

| | |
|---|---|
| **Aporta** | La mejor vía disponible hacia evidencia de daño real: ya normaliza y cruza fuentes heterogéneas |
| **Acceso** | A documentar en E0-9 |
| **Licencia de derivados** | `ATTRIBUTION` — **CC BY 4.0**, declarado sobre los datos derivados del proyecto |
| **Licencia de crudos** | **Hereda la licencia de cada fuente original.** El proyecto lo declara explícitamente |
| **Consecuencia de diseño** | Los dos regímenes conviven en el mismo dataset, así que el pipeline tiene que distinguirlos fila por fila. Por eso `damage_evidence` separa `source` (quién nos lo entregó: este proyecto) de `original_source` (quién lo produjo: Copernicus, SERTIT, reportes ciudadanos, inspección municipal) — y `license_class` se resuelve contra `original_source`, no contra `source` |

> Es el error más fácil de cometer en todo el documento: asumir que un agregador CC BY 4.0 "lava" la licencia de lo que agrega. No lo hace, y el propio proyecto avisa de ello. Un registro consolidado que pierda `original_source` pierde también la capacidad de decidir si puede salir en un export.

---

### 7.10 Copernicus EMS — cartografía rápida de emergencia · Tier B

| | |
|---|---|
| **Aporta** | Evidencia de daño derivada de observación de la Tierra, por activación |
| **Acceso** | Portal de Copernicus Emergency Management Service, por activación |
| **Licencia** | `UNCLEAR` — **se verifica por producto, no por programa.** Los términos viajan en el paquete de entrega de cada activación; ahí es donde hay que mirar, no en la página institucional del servicio |
| **Uso permitido en la V1** | Tier B: evidencia citada en `damage_evidence`, con atribución. **No redistribuible** hasta que el producto concreto se verifique |
| **Trampa** | "Gratuito para gestión de desastres" y "libre para incorporar a un producto comercial" son afirmaciones distintas. La primera no implica la segunda |

---

### 7.11 International Charter Space and Major Disasters · Tier B

| | |
|---|---|
| **Aporta** | Productos de observación para respuesta a desastres |
| **Licencia** | `UNCLEAR`, con redistribución probablemente restringida |
| **Problema anterior al de licencia** | El Charter se activa a petición de **usuarios autorizados** — organismos designados de gestión de riesgo, no empresas. La pregunta operativa no es "¿podemos redistribuirlo?" sino **"¿podemos siquiera obtenerlo directamente?"**. Lo más probable es que lleguemos a estos productos a través de la entidad municipal o de un agregador, y entonces las condiciones aplicables son las de esa cadena de entrega, no las del Charter en abstracto |
| **Uso permitido en la V1** | Evidencia citada, nunca redistribuida. Y con la cadena de custodia documentada en `damage_evidence.verification_notes` |

---

### 7.12 SERTIT · Tier B

| | |
|---|---|
| **Licencia** | `NON_COMMERCIAL` por defecto — algunos productos tienen condiciones explícitamente no comerciales |
| **Uso permitido** | Perfil `INSTITUTIONAL` únicamente. El control C3 aborta cualquier export `COMMERCIAL` en el que aparezca |
| **Nota** | Es la corrección más importante frente a la lectura inicial de "todo esto es gratis": gratuito y no comercial son compatibles entre sí, y ese cruce es precisamente el que rompe un SaaS |

---

### 7.13 UNOSAT · Tier B

| | |
|---|---|
| **Licencia** | `UNCLEAR` — verificar por producto. Parte del catálogo UNOSAT se publica bajo licencias Creative Commons con atribución, pero no se asume de forma general |
| **Uso permitido en la V1** | Evidencia citada, con verificación previa a cualquier redistribución |

---

### 7.14 Generador sintético de daño · producción propia

| | |
|---|---|
| **Aporta** | La capa de daño completa de la V1 (CON-01 — el dataset municipal no existe a tiempo de desarrollo) |
| **Licencia** | `COMMERCIAL_SAFE` — producción propia |
| **Obligación específica** | `is_synthetic` no nulo, propagado a toda feature, score, escenario, mapa, reporte y export (`FR-SYN-04`). Ningún artefacto derivado puede perderlo, y hay un test por formato de salida que lo verifica (mitigación de R3) |
| **Restricción** | Un escenario no puede marcarse `ENDORSED` mientras contribuya un registro de daño sintético (`FR-SYN-06`). En la V1 eso hace ese estado inalcanzable por construcción |

---

## 8. ODbL y share-alike: el caso que necesita revisión legal

Este es el único punto del documento que la ingeniería no puede cerrar sola, y conviene entender por qué antes de pedir la revisión.

ODbL distingue tres cosas, y de la distinción depende todo:

| Concepto ODbL | Qué es en nuestro sistema | Obligación |
|---|---|---|
| **Produced Work** | Un mapa renderizado, un PDF, una cifra de población servida | Atribución |
| **Derivative Database** | Nuestras tablas PostGIS que contienen o transforman datos OSM: el grafo peatonal, las huellas de edificación | Si hay *public use*, la base derivada se ofrece bajo ODbL |
| **Collective Database** | OSM junto a nuestros datos, manteniéndose separables | Solo la parte OSM queda bajo ODbL |

Lo que importa: **servir una API sobre una base derivada plausiblemente constituye *public use***, y eso activa el share-alike sobre esa base. No sobre nuestro código, ni sobre las features que no derivan de OSM — sobre la base derivada.

La arquitectura que reduce la exposición, y que hay que adoptar desde M1 porque después es un rediseño:

1. **Aislamiento por esquema.** Los datos OSM y todo lo derivado directamente de ellos viven en `osm_raw` y `osm_derived`, separados del resto del modelo. Eso sostiene la lectura de *Collective Database* sobre el conjunto, y hace que ofrecer la base derivada bajo ODbL —si hay que hacerlo— sea un volcado de dos esquemas y no una negociación sobre todo el sistema.
2. **Las features son cifras, no geometría.** `population_10min` es un número calculado usando OSM. Un número agregado se defiende como *Produced Work* mucho mejor que una tabla de aristas del grafo. La frontera del riesgo está en dónde acaba la geometría derivada y empieza la cifra.
3. **Atribución siempre**, sea cual sea la lectura. No cuesta nada y es obligatoria bajo cualquier interpretación.

**Lo que hay que preguntar a un abogado, en estos términos:** si servimos por API cifras calculadas sobre un grafo peatonal derivado de OSM, sin exponer ese grafo, ¿constituye *public use* de una *Derivative Database* a efectos de ODbL, y qué hay que ofrecer en consecuencia?

Hasta que haya respuesta, OSM se marca `SHARE_ALIKE` con `share_alike = true`, el perfil `COMMERCIAL` lo admite, y §12 lo mantiene como punto abierto bloqueante para la comercialización — no para el piloto.

---

## 9. El modelo de evidencia de daño

Esto **modifica el contrato congelado del SRS §6**, y por eso queda registrado como [ADR-16](../adr/ADR-16-evidencia-de-dano-multifuente.md).

El SRS §6 modela el daño como un atributo del sitio: `sites.damage_level`, un valor, una fuente. Eso funciona cuando hay un dataset municipal autoritativo. No es lo que vamos a tener. Vamos a tener varias fuentes parciales, con licencias distintas, fechas de observación distintas y fiabilidades distintas, que a veces se contradicen.

Un único `damage_level` obliga a resolver esa contradicción en la ingesta, en silencio, sin registrar quién dijo qué. Y produce exactamente la afirmación que el PRD §5 prohíbe: *"el sistema sabe que el edificio está destruido"*.

El modelo correcto separa observación de conclusión:

```sql
CREATE TABLE core.damage_evidence (
  evidence_id      uuid PRIMARY KEY,
  site_id          text NOT NULL REFERENCES core.sites(site_id),

  source           text NOT NULL REFERENCES core.source_register(source_id),  -- quién nos lo entregó
  original_source  text REFERENCES core.source_register(source_id),           -- quién lo produjo
  source_license   license_class NOT NULL,      -- resuelto contra original_source

  geometry         geometry(MultiPolygon, 4326) NOT NULL,
  observation_date date NOT NULL,               -- cuándo se observó el daño
  acquisition_date date NOT NULL,               -- cuándo lo obtuvimos nosotros

  damage_class     damage_class NOT NULL,       -- vocabulario controlado, ordinal
  confidence       numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  method           text NOT NULL,               -- teledetección | inspección | reporte ciudadano | sintético
  is_synthetic     boolean NOT NULL,

  data_version     bigint NOT NULL,
  notes            text
);
```

Un sitio acumula evidencia en lugar de tener un valor:

```text
SITIO 087

  Copernicus EMS      severo            teledetección     14/08/2026   conf. 0,72
  SERTIT              severo            teledetección     16/08/2026   conf. 0,68
  Reportes ciudadanos 4 reportes        reporte           11-18/08     conf. 0,30
  Inspección municipal demolición autorizada  inspección  02/09/2026   conf. 0,95
```

Y el pipeline gana una etapa, antes de todo lo demás:

```text
  ┌──────────────────┐
  │ FUSIÓN DE        │   acuerdo entre fuentes, antigüedad de la observación,
  │ EVIDENCIA        │   fiabilidad del método, independencia de las fuentes
  └────────┬─────────┘
           ▼
  CONFIANZA DE DAÑO ──────► entra como driver de FR-QUAL-01
           ▼
     OPORTUNIDAD  ────────► el ciclo de vida del SRS §5.2, sin cambios
           ▼
  INTERVENCIÓN URBANA
```

Lo que esto compra, más allá de la corrección:

- **Defendibilidad.** El sistema nunca afirma que un edificio está destruido. Muestra qué fuentes lo sustentan, con qué método y en qué fecha. Es exactamente el principio de *human in the loop* del PRD §55 aplicado al insumo, no solo a la salida.
- **La licencia se resuelve por observación, no por sitio.** Una evidencia `NON_COMMERCIAL` puede sustentar una confianza de daño sin contaminar el export: contribuye al cálculo y se cita, pero el control C3 la bloquea si alguien intenta redistribuirla.
- **La sustitución de CON-01 deja de ser un evento.** El dataset municipal real no reemplaza al sintético: entra como una fila más de `damage_evidence`, con `method = 'inspección'` y confianza alta, y la fusión reordena sola. El adaptador de `FR-DC-02` sigue siendo el único punto de cambio.
- **La staleness se vuelve medible.** `observation_date` separado de `acquisition_date` permite decir que una evidencia es reciente para nosotros pero vieja respecto al sismo, que es una distinción que `FR-QUAL-01` necesita y que un campo único no puede expresar.

El contrato del SRS §6 no desaparece: sigue siendo el contrato del **adaptador de inspección municipal**, que es la fuente de máxima confianza. Lo que cambia es que deja de ser el único modelo de daño del sistema.

---

## 10. Procedimiento de auditoría dataset por dataset

Para cada fuente en `UNCLEAR`, en este orden:

1. **Localizar los términos aplicables.** No la página institucional del organismo: el bloque de licencia del **dataset o del producto concreto**. Cuando el dataset declara la suya, prevalece sobre la del portal.
2. **Archivar la evidencia.** PDF o captura completa de los términos, con fecha de obtención, a Supabase Storage. La ruta va a `terms_snapshot_path`. Los portales cambian términos sin historial; lo que importa es bajo qué condiciones se obtuvo el dato.
3. **Responder los cinco ejes de §1** por separado. "Es público" no responde ninguno de los cinco.
4. **Clasificar** en el enum, con `terms_verified_at`, `terms_verified_by` y las notas de lo que quedó ambiguo.
5. **Ante duda, `UNCLEAR`.** Es el valor seguro: bloquea, no habilita. Una clasificación optimista sin evidencia es peor que ninguna clasificación, porque desactiva los controles de §6 sin que nadie se entere.
6. **Escribir el `attribution_text` literal**, tal como debe aparecer en un export. No una descripción de lo que hay que poner: el texto exacto.

Salida de la auditoría: `source_register` poblado, snapshots archivados, y esta matriz de §2 actualizada con la fecha de verificación.

Es trabajo de E0-6 y condiciona la puerta de M0. Una fuente Tier A sin auditar es un hito M3 que no puede empezar.

---

## 11. Reglas operativas permanentes

1. **Ningún consumo desde el navegador.** El frontend no habla con ninguna fuente externa (PRD §44). Todo pasa por el pipeline. Es rendimiento, caché y versionado, pero sobre todo es que una capa consumida desde el cliente no tiene `data_version` y rompe `NFR-REPRO-01`.
2. **Ningún servicio de terceros en el camino crítico de renderizado.** Ni tiles de OSM, ni geocodificadores externos, ni basemaps de proveedores. Servimos lo nuestro (ADR-10).
3. **Extractos archivados por `data_version`.** Cada refresco crea una versión nueva e inmutable; la anterior nunca se muta (`FR-ING-02`, ADR-06). Para fuentes que no versionan aguas arriba —OSM es el caso— el artefacto descargado se archiva, porque es la única forma de reconstruir la versión.
4. **Fallo aislado.** Una fuente externa caída degrada solo sus features y levanta alerta de obsolescencia; nunca deja la plataforma indisponible (`FR-EXT-01`).
5. **Los parámetros de consulta son procedencia.** En acceso OGC se registran endpoint y parámetros exactos (`FR-ING-05`). Un WFS sin los parámetros registrados no es reproducible.
6. **Cero PII, en toda fuente, sin excepción** (CON-04, `FR-PII-01`). El diccionario de campos prohibidos se aplica en ingesta y se verifica en CI (`FR-PII-02`). Una fuente que solo se distribuye con microdato no se ingiere: se pide agregada o no se usa.

---

## 12. Puntos abiertos

| ID | Pregunta | Bloquea | Responsable |
|---|---|---|---|
| OI-F1 | ODbL share-alike sobre base derivada servida por API en un producto comercial | Comercialización. **No** el piloto | Legal |
| OI-F2 | Auditoría de licencia de SGC, IDEAM, AMCO, CARDER y Megabús, dataset por dataset | M0 (puerta), y M3 por dependencia | Datos |
| OI-F3 | ¿Publica IDE AMCO WFS operativo? | E1-4, y el caso principal de `FR-ING-05` | GIS |
| OI-F4 | ¿Población DANE a nivel de manzana o de sector? | OI-07 (imputación), umbral efectivo de `FR-PII-03` | Datos |
| OI-F5 | Vía de acceso y términos exactos de datosdelterremoto.org | Tier C, M2 | Datos |
| OI-F6 | Cadena de custodia real de los productos Copernicus / Charter: ¿directa, o vía entidad municipal? | Tier B, y las condiciones que de verdad aplican | Producto |
| OI-F7 | Función de fusión de evidencia: pesos por método, tratamiento de fuentes no independientes | M2, ADR-16 | Datos + GIS |

> OI-F7 merece atención temprana. Copernicus y SERTIT pueden estar clasificando **las mismas imágenes**. Dos fuentes que coinciden porque miran el mismo píxel no son dos confirmaciones independientes, y tratarlas como tales infla la confianza de daño exactamente donde menos evidencia real hay. Es el mismo tipo de error que R5: no es ruido, es una conclusión invertida.
