# Diseño: Recovery, de visor analítico a informe versionado de preparación

Generado por `/office-hours` el 2026-09-19  
Rama: `codex/recovery`  
Repositorio: `FilipaoVfx/rebuild`  
Estado: APPROVED  
Modo: Startup / producto institucional interno

## Diagnóstico ejecutivo

Recovery no es frágil por falta de ingeniería. Tiene una base técnica poco común para su etapa: datos reales versionados, procedencia, incertidumbre explícita, controles de licencia, arquitectura modular, pruebas y un visor espacial sustancial. Es frágil como producto porque todavía no existe un usuario institucional activo, un flujo observado, una fuente municipal acordada ni un responsable que pueda aceptar los criterios de decisión.

La aplicación actual empieza cuando los datos ya están preparados. El proceso real de recuperación empieza antes: múltiples equipos visitan, registran, corrigen, validan y consolidan evidencia. Mientras ese traspaso no esté entendido, un ranking mejor o un optimizador más completo aumentan la precisión aparente sin reducir el riesgo de producto.

La primera evolución no será una plataforma multiusuario. Será un **informe versionado de preparación para decisiones**: una publicación estática con corte explícito que muestra qué evidencia existe, qué territorio cubre, qué se contradice, qué falta y cuál es la próxima decisión que esa evidencia permite defender. Su función comercial e institucional es conseguir revisión, acceso y datos reales. “Versionado” significa que cada corte es inmutable; no promete actualización continua.

**Veredicto de madurez:** prototipo técnico avanzado; producto institucional aún no validado.

## Puntuación de madurez

| Dimensión | Puntuación | Evidencia | Qué impide llegar a 10 |
|---|---:|---|---|
| Problema observado | 6/10 | La caracterización mediante visitas es lenta frente al volumen de edificios y datos | Falta medir tiempos, retrabajo y consecuencias en un caso concreto |
| Usuario y demanda | 2/10 | Se identificaron Planeación, DIGER y equipos sectoriales | No hay usuario activo, compromiso, entrevista ni observación directa |
| Integridad y procedencia | 8/10 | Versionado, fuentes, licencias, incertidumbre y exportes están en el diseño y el código | Falta probarlos con el intercambio institucional real |
| Cobertura territorial | 3/10 | Recovery tiene evidencia geográfica verificable | 182 observaciones en un AOI de 6,91 km² no representan las más de 35.000 viviendas reportadas |
| Flujo de decisión | 2/10 | Hay escenarios, explicaciones y exportes | No existe recepción, reconciliación, revisión, aprobación ni seguimiento entre dependencias |
| Gobernanza metodológica | 3/10 | Los supuestos y ausencias se declaran | No hay dueño institucional de pesos, costos, equidad ni criterios de intervención |
| Experiencia de usuario | 6/10 | El visor organiza territorio, situación, oportunidades, escenarios y evidencia | La navegación explica análisis, pero no responde primero si la ciudad está lista para decidir |
| Seguridad y permisos | 2/10 | SRS y ARD definen autenticación, roles y sensibilidad | Supabase Auth no está conectado; la auditoría solo cubre parte de las acciones |
| Operación y confiabilidad | 3/10 | CI, chequeos y construcción estática existen | No hay telemetría operativa, restauración verificada, soporte ni objetivo de servicio demostrado |
| Distribución y adopción | 2/10 | Hay sitio estático y modo API; el túnel sirve para demostración | No hay canal institucional estable, onboarding, responsable de operación ni ciclo de feedback |

**Lectura:** la ingeniería central está por delante de la evidencia de producto. La siguiente inversión debe cerrar esa diferencia.

## Problema

Después del sismo, Pereira necesita caracterizar afectaciones y necesidades a una escala que supera la capacidad de las visitas y consolidaciones manuales. La información se produce en circuitos distintos: censos, EDAN, RUD, inspecciones sectoriales, programas de vivienda, infraestructura y reportes agregados. Cada circuito tiene alcance, fecha, geometría, definición y nivel de validación diferentes.

La persona responsable de planificar la recuperación no recibe una imagen única de la ciudad. Recibe piezas con duplicados, vacíos y ritmos de actualización distintos. Esto retrasa decisiones, dificulta justificar prioridades y puede confundir ausencia de evidencia con ausencia de necesidad.

La formulación más precisa del producto es:

> Recovery reduce el tiempo para convertir evidencia urbana fragmentada en una caracterización común, vigente y defendible, y declara qué decisiones pueden tomarse hoy y qué debe verificarse primero.

## Evidencia de demanda

La evidencia actual es observacional, no comercial ni institucional:

- El usuario describió que “el proceso de caracterización de la zona ha sido muy lento” y que el volumen de edificios y datos es muy alto.
- También señaló que “las necesidades de hoy son distintas de cuando se construyeron los edificios”, lo que desplaza el objetivo desde reconstruir lo anterior hacia entender necesidades actuales.
- No existe todavía un usuario institucional activo, una solicitud de piloto, una entrega de datos ni un compromiso de tiempo.
- No hay acceso actual para observar a Planeación, DIGER o un equipo sectorial.

La demanda sigue sin estar validada. El informe versionado es una cuña para obtener esa evidencia, no una prueba de que ya existe.

## Proceso actual y competidor real

El competidor no es otro visor. Es la combinación de visitas, formularios, hojas de cálculo, fotografías, informes sectoriales, correos, reuniones y consolidaciones del sistema público.

La investigación pública muestra:

- DIGER coordina el Sistema Municipal de Gestión del Riesgo y recibe solicitudes de visitas técnicas.
- El censo de edificaciones afectadas comenzó el 12 de agosto de 2026.
- Dos semanas después, el municipio reportaba más de 35.000 viviendas afectadas y unas 120.000 personas damnificadas.
- Veinte ingenieros habían avanzado en la inspección visual y diagnóstico preliminar de 92 sedes educativas.
- En Techos Dignos hubo registros repetidos hasta cinco, seis o siete veces; después de depuración quedaron aproximadamente 4.000 casos y se habían realizado cerca de 400 visitas técnicas.
- El proceso nacional exige EDAN, RUD, validación sectorial y posterior formulación y seguimiento de un Plan de Acción Específico.

Fuentes públicas:

- [Balance de la emergencia, Alcaldía de Pereira](https://www.pereira.gov.co/publicaciones/11295/la-alcaldia-de-pereira-trabaja-sin-descanso-para-la-atencion-de-la-emergencia-y-entrega-de-ayudas-tras-cumplirse-14-dias-del-terremoto/)
- [Programa Techos Dignos, Alcaldía de Pereira](https://www.pereira.gov.co/publicaciones/11300/las-tejas-que-vuelven-a-cubrir-de-esperanza-a-pereira/)
- [Circulares EDAN y RUD, UNGRD](https://portal.gestiondelriesgo.gov.co/Paginas/Circulares.aspx?ID=3465)
- [Secretaría de Planeación de Pereira](https://www.pereira.gov.co/publicaciones/3488/secretaria-de-planeacion/)

## Usuario, participantes y traspaso

No se asume un único usuario diario sin observación. El flujo inicial tiene tres funciones:

| Función | Actor probable | Responsabilidad |
|---|---|---|
| Productor | DIGER y equipos sectoriales | Registrar visitas, adjuntar evidencia, declarar alcance y actualizar resultados |
| Validador | Especialistas técnicos y responsables sectoriales | Confirmar, devolver o conciliar observaciones y explicar conflictos |
| Integrador/aprobador | Equipo técnico de Planeación y responsable institucional | Construir la caracterización común, formular acciones y defender prioridades |

Para el informe versionado, Recovery opera como compilador independiente de evidencia pública. La distribución del trabajo anterior sigue siendo una hipótesis hasta observar dos jornadas reales.

## Causas de fragilidad

### 1. Cobertura presentada como ciudad

La evidencia espacial cargada cubre un sector limitado. La interfaz puede declarar sus límites, pero la forma general del producto todavía invita a leer oportunidades como si fueran una priorización urbana completa. El informe debe abrir con cobertura y limitaciones antes de mostrar oportunidades.

### 2. Variables que no sostienen la decisión

Riesgo, vulnerabilidad, uso normativo del suelo, costos oficiales y medida de equidad están ausentes, incompletos o sin dueño. El sistema es honesto sobre estas ausencias, pero el ranking continúa siendo el objeto más visible. La salida correcta es una decisión condicionada, no una lista priorizada.

### 3. Flujo institucional inexistente

No hay entrada de visitas, reconciliación de duplicados, estados de validación, responsables, revisión ni aprobación. El producto muestra resultados de un pipeline, pero no acompaña el trabajo que produce una decisión.

### 4. Contrato de seguridad no implementado

El [SRS](../../docs/product/srs.md) exige autenticación, permisos por rol y sensibilidad. El [estado actual](../../docs/plan/estado-actual.md) reconoce que Auth no está conectado y que la auditoría es parcial. Esto bloquea cualquier uso con información interna o acciones mutables.

### 5. Operación orientada a demostración

El túnel permite revisar el producto, pero no constituye un canal institucional. El paquete estático es reproducible y publicable, aunque pierde funciones del servidor. No existen acuerdos de servicio, responsable de soporte, verificación de recuperación ni observabilidad del uso.

### 6. Ausencia de un ciclo de aprendizaje

No hay una métrica que conecte el producto con el trabajo real: tiempo ahorrado, duplicados resueltos, territorio pendiente, decisiones sustentadas o correcciones solicitadas. Las pruebas demuestran comportamiento del software, no utilidad institucional.

## Premisas acordadas

1. Recovery debe organizar evidencia defendible antes de optimizar inversiones.
2. El problema inicial es convertir censos, visitas y reportes fragmentados en una caracterización común y actual.
3. El flujo cruza productores, validadores e integradores; Planeación no se asume como único operador.
4. Ingesta, procedencia, licencias, mapa, evidencia y exportes se conservan como activos centrales.
5. Scoring y optimización permanecen disponibles, pero dejan de ser la portada hasta que una contraparte valide criterios, costos y pesos.
6. El informe versionado no se presentará como herramienta operativa ni como diagnóstico completo de la ciudad.

## Perspectiva externa

La revisión fría coincidió en que Recovery debe convertirse primero en un espacio común para transformar visitas y reportes en una caracterización trazable. Cuestionó correctamente que Planeación sea el único usuario diario: DIGER y los equipos sectoriales probablemente producen y validan gran parte de la información.

Su prototipo propuesto fue una cola geográfica de validación: importar, detectar duplicados, mostrar vacíos, validar y exportar. Esa opción se conserva como la siguiente etapa. No se construirá hasta obtener evidencia institucional suficiente para modelar estados, responsables y permisos.

## Alternativas consideradas

### A. Informe versionado de preparación — elegido

Entrega periódica y compartible que presenta cobertura, contradicciones, vacíos, antigüedad, fuentes y próxima decisión defendible. Puede funcionar con datos públicos y obtener feedback sin acceso a sistemas internos.

### B. Cola geográfica de validación — siguiente etapa condicionada

Flujo operativo para importar observaciones, detectar duplicados, asignar responsables, validar o devolver registros y exportar una caracterización auditable.

Se activa cuando se cumpla al menos uno de estos disparadores:

- Dos usuarios institucionales revisan el informe y confirman el flujo propuesto.
- Una dependencia comparte datos representativos de visitas con permiso de uso.
- Un responsable solicita seguimiento de estados, responsables o conflictos dentro de Recovery.

### C. Sistema operativo de recuperación — visión posterior

Captura de campo, integración multisectorial, formulación del PAE, ejecución, seguimiento presupuestal y optimización. Se descarta ahora porque multiplica supuestos antes de observar el proceso.

## Enfoque recomendado

### Decisión de la primera publicación

La primera versión solo soporta esta decisión:

> **Con corte al 19 de septiembre de 2026, ¿hacia qué zonas del AOI debe dirigirse la próxima solicitud de evidencia o verificación antes de formular prioridades de inversión?**

| Elemento | Contrato V1 |
|---|---|
| Responsable de emitir el informe | Equipo editorial de Recovery |
| Receptor buscado | Equipo técnico de Planeación, DIGER o sectorial |
| Horizonte | Siguiente ciclo de verificación, máximo 7 días |
| Resultado | Lista de bloques censales con cobertura insuficiente, fuente faltante y solicitud concreta |
| Decisión excluida | No prioriza obras, beneficiarios, presupuestos ni demoliciones |
| Evidencia mínima | Límite del AOI, observaciones elegibles, registro de fuentes, fechas y limitaciones |

Ejemplo normativo: “Recovery permite solicitar verificación adicional en los bloques censales identificados dentro de Boston porque no tienen observaciones elegibles para el tema requerido. No permite concluir que Boston tenga más o menos daño que Centro. La solicitud debe dirigirse al productor probable de la fuente faltante y revisarse dentro de siete días”.

### Contrato narrativo

Cada publicación debe responder, en este orden:

1. **¿Qué versión estoy viendo?** Fecha de corte, identificador y estado de publicación.
2. **¿Cuál es la única decisión evaluada?** Pregunta, responsable, horizonte y exclusiones.
3. **¿Qué parte del AOI está caracterizada?** Cobertura espacial, temática, temporal y de validación.
4. **¿Qué puede afirmarse?** Hallazgos respaldados por reglas estructuradas.
5. **¿Qué no puede afirmarse?** Limitaciones que bloquean extrapolación o inversión.
6. **¿Dónde hay discrepancias o vacíos?** Solo los declarados por reglas V1; no se promete deduplicación automática.
7. **¿Qué acción es defendible ahora?** Una solicitud de evidencia o verificación.
8. **¿Cómo se audita?** Fuentes, versiones, reglas y paquete descargable.

### Métricas de preparación

Todas usan el AOI publicado como universo. Las cifras oficiales de ciudad se muestran como contexto separado y nunca entran en los denominadores.

| Métrica | Fórmula V1 | Desconocidos | Umbral editorial |
|---|---|---|---|
| Área de bloques con evidencia | Área recortada de bloques censales `WITH_EVIDENCE` / área recortada total de los bloques que intersectan el AOI | Fuera del AOI se etiqueta `FUERA_DE_ALCANCE`; dentro sin observación es `SIN_EVIDENCIA`; no mide severidad ni caracterización completa | <80 % obliga a estado condicionado y genera solicitud de verificación |
| Cobertura temática | Pares `(block_id, theme_id)` presentes / bloques elegibles × 6 temas requeridos: daño, población, infraestructura crítica, uso del suelo, riesgo y validación de campo | Tema sin fuente cuenta como ausente, nunca como cero; se publica también el valor por tema | Cada par ausente genera un vacío; riesgo o validación ausentes se solicitan primero |
| Vigencia temporal | Fuentes requeridas dentro de su `max_age_days` / fuentes requeridas del `ruleset_id` | Una fuente requerida permanece en el denominador aunque esté `MISSING`, `STALE` o `BLOCKED`; fecha desconocida es `STALE` | Cualquier fuente marcada `critical=true` que esté vencida genera solicitud de actualización |
| Cobertura de validación | Observaciones elegibles con método oficial o confirmación de campo / observaciones elegibles | `UNKNOWN` queda separado de confirmado y rechazado | <100 % se muestra como porcentaje y bloquea lenguaje de daño confirmado |

Una **observación candidata** pertenece a una fuente inventariada. Se vuelve **elegible** solo si intersecta el AOI, pasa la puerta `PUBLIC`, contiene fecha y método, cumple el perfil espacial permitido y no tiene errores de geometría bloqueantes. El número 182 describe candidatas actuales y no se presenta como elegible hasta ejecutar esas puertas. V1 no calcula duplicados. Una discrepancia existe solo cuando dos fuentes compatibles comparten bloque censal, tema y ventana temporal, pero reportan categorías incompatibles según el `crosswalk_id` versionado. Si no comparten universo, se presentan lado a lado y se prohíbe compararlas como tasas.

La siguiente solicitud se construye sin un puntaje opaco. Primero agrupa los pares bloque-tema sin evidencia por `theme_id` y productor probable: cuando falta un tema completo emite una sola solicitud con la lista de bloques afectados, no una fila por cada par. Después ordena grupos con esta precedencia fija: validación de campo, riesgo, daño, población, infraestructura crítica y uso del suelo. Dentro de cada grupo ordena los `block_id`. Si el mapeo dice `UNKNOWN`, la acción es identificar al responsable. Las prioridades de inversión permanecen prohibidas en toda V1, con independencia de los porcentajes.

### Modelo mínimo de publicación

| Entidad | Campos obligatorios | Regla principal |
|---|---|---|
| `source` | `source_id`, título, entidad, corte, alcance, método, licencia, perfil, URL, `max_age_days` | Sin licencia y alcance documentados no se publica |
| `finding` | `finding_id`, afirmación, `source_ids`, AOI, regla, confianza, `limitation_ids` | Toda afirmación enlaza evidencia y regla reproducible |
| `limitation` | `limitation_id`, tipo, texto, impacto, `blocks[]` | Una limitación bloqueante suprime la decisión indicada |
| `gap` | `gap_id`, zona, tema, motivo, fuente requerida, acción solicitada | Un vacío no representa ausencia de necesidad |
| `conflict` | `conflict_id`, fuentes compatibles, regla, valores, estado | V1 solo registra discrepancias deterministas, no similitud probabilística |
| `decision` | `decision_id`, pregunta, responsable, horizonte, resultado, exclusiones, requisitos | Solo puede referirse a hallazgos y limitaciones publicados |

Identificadores y vocabularios son estables. Las limitaciones críticas tienen códigos estructurados, por ejemplo `COVERAGE_SPATIAL_LOW`, `RISK_SOURCE_MISSING` y `FIELD_VALIDATION_MISSING`; los chequeos automáticos verifican códigos, no frases libres.

El contrato serializable vive en `schemas/report-manifest-v1.schema.json` y declara JSON Schema 2020-12, `schema_version="1.0.0"`, tipos, cardinalidad, nulabilidad y enumeraciones. `source_ids`, `limitation_ids` y `blocks` son arreglos no nulos de identificadores únicos; los campos opcionales se omiten y nunca alternan entre `null`, cadena vacía y valor. Los estados cerrados son:

- Fuente: `AVAILABLE`, `MISSING`, `STALE`, `BLOCKED`.
- Cobertura: `WITH_EVIDENCE`, `SIN_EVIDENCIA`, `FUERA_DE_ALCANCE`, `SUPPRESSED`.
- Validación: `FIELD_CONFIRMED`, `OFFICIAL_METHOD`, `UNCONFIRMED`, `REJECTED`, `UNKNOWN`.
- Publicación: `DRAFT`, `PUBLISHED_CONDITIONED`, `REVIEWED_EXTERNAL`, `RETRACTED`.

Las reglas son artefactos del informe, no configuración implícita. `rules/report-ruleset-v1.json` fija temas, fuentes requeridas, criticidad, antigüedad, precedencia y `theme_owner_id`; `rules/damage-crosswalk-v1.csv` fija compatibilidades; `rules/theme-owners-v1.csv` relaciona cada tema con una entidad probable y permite `UNKNOWN`. El manifiesto registra `ruleset_id`, `crosswalk_id`, sus rutas y SHA-256. Cambiar cualquiera crea un nuevo `report_id`.

### Definiciones operativas

- **AOI:** polígono versionado que delimita el universo espacial del informe.
- **Cobertura:** fracción medible del AOI o del conjunto requerido que cumple una regla; siempre muestra numerador y denominador.
- **Tema requerido:** una de las seis familias de información enumeradas en la métrica temática.
- **Validación:** estado declarado por el método de la fuente; Recovery no eleva foto-interpretación a confirmación de campo.
- **Hallazgo:** afirmación generada por una regla reproducible sobre fuentes elegibles.
- **Limitación crítica:** código estructurado que impide una afirmación o decisión específica.
- **Solicitud de evidencia:** acción dirigida a obtener o verificar una fuente faltante; es la única recomendación permitida en V1.
- **Chequeo de señal:** prueba existente que mide cobertura, discriminación y dependencia de supuestos; informa el reporte, pero no reemplaza las reglas editoriales de esta especificación.

### Unidad espacial canónica

La unidad de decisión V1 es el bloque censal DANE disponible en `rebuild_core.census_block`, identificado por `(data_version, block_id)`. “Zona” en la interfaz significa uno o más de estos bloques; barrio o comuna solo sirven como rótulos de orientación y nunca cambian el denominador ni la decisión.

- Universo: todos los bloques cuya geometría intersecta el AOI versionado.
- Geometría publicada: `ST_Intersection(census_block.geometry, AOI)`.
- Asignación de observaciones: el punto representativo `ST_PointOnSurface(observation.geometry)` se asigna con `ST_Covers`; un empate de borde se resuelve por el menor `block_id`.
- Estado `WITH_EVIDENCE`: el bloque contiene al menos una observación elegible; el estado significa presencia de evidencia, no caracterización completa ni severidad.
- Agregación: solo se publican conteos y estados por bloque. Las geometrías y atributos de observaciones a nivel de edificio no se redistribuyen.
- Trazabilidad: el manifiesto registra tabla de origen, `data_version`, CRS de cálculo, CRS de publicación, regla de intersección y precisión de coordenadas.

### Entradas V1

La primera publicación inventaría únicamente:

1. El AOI versionado de Copernicus EMS.
2. Las 182 observaciones candidatas actuales de Copernicus EMS; el pipeline determina cuántas son elegibles.
3. Los bloques censales DANE que intersectan el AOI y su campo de supresión; su licencia debe superar la puerta de redistribución.
4. Cifras agregadas oficiales de la Alcaldía como contexto narrativo, con fecha y alcance `CIUDAD`, sin dividirlas por el AOI ni compararlas como proporción.

Las únicas capas visuales son el límite del AOI y los bloques censales recortados con estados agregados, sobre un fondo neutro sin teselas ni datos cartográficos de terceros. No se incluyen edificios, vías, predios, registros personales, RUD, direcciones, formularios de visitas ni datos sectoriales no publicados. Tampoco se infieren duplicados entre fuentes con universos incompatibles.

El inventario se controla por `source_id`, no por cantidad informal de entradas:

| `source_id` | Uso V1 | Publicación |
|---|---|---|
| `copernicus_ems` | AOI y observaciones candidatas de daño | Solo AOI y conteos agregados por bloque |
| `dane_censo_2018` | Unidad espacial, población y marcador de supresión | Geometría, población y atributos permitidos por la regla de supresión |
| `pereira_emergency_balance` | Cifras oficiales agregadas de ciudad | Texto contextual con URL, fecha y alcance `CIUDAD` |
| `pereira_techos_dignos` | Evidencia pública de depuración y visitas | Texto contextual con URL, fecha y alcance del programa |

Los seis temas siguen siendo el universo requerido aunque no tengan fuente disponible. Cada requisito vive en el ruleset con `requirement_id`, `theme_id`, `critical`, `max_age_days`, `resolved_source_id` opcional y estado. Una ausencia se conserva como `MISSING`; no se elimina del denominador.

### Pantalla principal

El boceto aprobado y versionado está en [assets/recovery-informe-versionado-wireframe.png](assets/recovery-informe-versionado-wireframe.png).

La jerarquía visual es:

- Decisión evaluada, corte y estado.
- Advertencia de alcance.
- Cuatro métricas de preparación con denominadores visibles.
- Mapa de cobertura de caracterización, no mapa de severidad.
- Panel de lo afirmable, lo desconocido, evidencia faltante y próxima solicitud.
- Registro de fuentes con fecha, alcance, validación y limitación.
- Descarga del paquete mínimo.

### Aceptación por sección

| Sección | Prueba verificable |
|---|---|
| Encabezado | A 1440 × 900 CSS px y zoom 100 %, muestra `report_id`, corte, AOI, estado y pregunta de decisión sin desplazamiento vertical |
| Cobertura | Las cuatro métricas muestran numerador, denominador, unidad y código de limitación aplicable |
| Mapa | Solo dibuja el AOI y estados de cobertura; la leyenda prohíbe interpretarlos como severidad |
| Afirmable/no afirmable | Cada elemento enlaza `finding_id` o `limitation_id`; no admite texto editorial sin identificador |
| Próxima solicitud | Nombra zona, tema, evidencia requerida, receptor probable y plazo de siete días |
| Fuentes | Cada fila muestra entidad, corte, alcance, método, licencia y limitaciones |
| Descarga | El SHA-256 del archivo coincide con las notas del GitHub Release |

### Flujo editorial y correcciones

| Estado | Responsable | Canal | Transición |
|---|---|---|---|
| `DRAFT` | Editor de Recovery | Archivo local; CI solo si un administrador verifica que el repositorio y el artefacto requieren acceso autenticado | Pasa a `PUBLISHED_CONDITIONED` cuando todos los chequeos y la revisión editorial aprueban |
| `PUBLISHED_CONDITIONED` | Editor + revisor de Recovery distintos | Ruta pública versionada | Se mantiene inmutable; una corrección crea una nueva versión |
| `REVIEWED_EXTERNAL` | Editor registra confirmación recibida | Nueva versión pública con referencia a fecha, rol y notas de revisión | Solo después de una revisión documentada; no equivale a aprobación oficial |

Si se descubre un error metodológico o factual sin exposición sensible, el directorio y el archivo histórico permanecen byte por byte intactos. Un índice mutable externo, `/reports/index.json`, cambia el estado visible a `RETRACTED`, registra motivo y `superseded_by`, y `/reports/latest/` deja de apuntar a esa versión. Las notas del Release enlazan el índice de retractación sin reemplazar el archivo.

Un incidente de privacidad o licencia sigue otro procedimiento: se retiran de Pages tanto la ruta versionada como cualquier enlace o copia pública, se elimina el archivo descargable del Release y se publica una nota sin el contenido afectado. Recovery conserva internamente el hash, `report_id`, motivo, fecha y registro de acciones; solo conserva una copia restringida si existe base legal. La retirada rompe deliberadamente la disponibilidad histórica para contener el incidente. La evidencia de revisión externa se conserva como nota redactada sin datos personales; el documento original permanece fuera del repositorio si contiene información sensible.

Durante el experimento de 21 días se publica como máximo una versión semanal, y solo si cambia una fuente, regla o limitación material. Cada versión declara la próxima fecha de revisión; no hay actualización silenciosa.

### Privacidad y publicación geográfica

- Solo se exportan campos incluidos en una allowlist `PUBLIC`; cualquier campo desconocido bloquea la construcción.
- Se prohíben nombres, documentos, teléfonos, correos, direcciones personales y texto libre procedente de visitas.
- Daño y vulnerabilidad se agregan al bloque censal DANE. Si `population < 20`, `pii_suppressed=true` o falta el denominador necesario, el feature solo contiene `block_id`, `data_version`, geometría, `coverage_status=SUPPRESSED` y códigos de limitación no sensibles. Un chequeo rechaza cualquier otra propiedad.
- El pipeline comprueba sensibilidad por campo, licencia por fuente, resolución espacial y geometrías antes de construir.
- Cada versión publica un contacto de retirada. Un reporte válido provoca retractación inmediata y revisión antes de cualquier nueva publicación.

### Paquete mínimo

Cada versión es un directorio estático `reports/{report_id}/` y un archivo de GitHub Release llamado `recovery-{report_id}.tar`. `report_id` usa `recovery-YYYYMMDD-NN`.

Contenido obligatorio:

- `index.html`: la única superficie humana.
- `manifest.json`: versión de esquema, commit, corte, AOI, unidad espacial, decisión, métricas, hallazgos, limitaciones, fuentes, reglas y lista con SHA-256 de cada archivo de carga excepto el propio manifiesto.
- `reports-index.schema.json`: contrato del índice externo; exige `report_id`, estado, URL pública opcional, `retracted_at`, código de motivo y `superseded_by`, con las condiciones requeridas para cada estado.
- `sources.csv`: `source_id,title,organization,cutoff,scope,method,license,profile,url,limitation_codes`.
- `schemas/report-manifest-v1.schema.json`, `rules/report-ruleset-v1.json`, `rules/damage-crosswalk-v1.csv` y `rules/theme-owners-v1.csv`.
- `aoi.geojson` y `coverage-blocks.geojson`; este último admite `block_id,data_version,coverage_status,eligible_observation_count,theme_statuses,validation_status,limitation_codes`. Para `SUPPRESSED` aplica la allowlist reducida de privacidad y se omiten los demás campos.

La construcción es determinista: texto UTF-8 con LF y salto final; JSON con claves ordenadas, sin espacios ni `NaN`, y decimales como cadenas de precisión fija; GeoJSON ordenado por `block_id`, propiedades ordenadas y coordenadas redondeadas a siete decimales; CSV RFC 4180 con encabezado fijo y filas ordenadas por `source_id`. `generated_at` deriva del corte declarado, nunca del reloj de construcción. El TAR contiene rutas en orden lexicográfico, `mtime=0`, `uid/gid=0`, usuario/grupo vacíos y modos fijos `0644`/`0755`. El SHA-256 del TAR se publica en las notas y el manifiesto registra los hashes de sus archivos internos; la prueba reconstruye dos veces y compara bytes.

No se crea PDF, analítica web ni un segundo formato narrativo. Una firma criptográfica se difiere hasta que una contraparte la requiera.

## Alcance y límites

### Incluido

- Una decisión: dirigir la siguiente solicitud de evidencia dentro de un AOI.
- Un conjunto pequeño de fuentes compatibles y publicables.
- Una página versionada con cobertura, hallazgos, limitaciones y solicitud.
- Contrato de datos, reglas deterministas y paquete mínimo reproducible.
- Flujo editorial interno con revisión por dos personas y retractación.
- Perfil `PUBLIC`, allowlist de campos y control de resolución espacial.

### Excluido

- Formularios de campo, datos privados, usuarios, colaboración y aprobaciones dentro de la aplicación.
- Detección automática de duplicados o conciliación probabilística.
- Scoring como portada, nuevos indicadores u optimización adicional.
- Integraciones EDAN/RUD, aplicación móvil, modo sin conexión y multi-municipio.
- PDF, analítica de aperturas, descargas o compartidos.

Este límite es deliberado. El producto no avanza a operaciones multiusuario sin cumplir el disparador de acceso institucional.

## Criterios de éxito

### Éxito de construcción

- Una reconstrucción desde el mismo commit y versiones de datos produce archivos con hashes idénticos.
- Los chequeos bloquean fuente sin licencia, campo fuera de allowlist, geometría prohibida y limitación crítica ausente.
- El validador rechaza cualquier bloque `SUPPRESSED` que contenga conteos, estados temáticos, estado de validación u otra propiedad fuera de su allowlist reducida.
- `manifest.json`, pantalla y GeoJSON declaran el mismo `report_id`, corte y códigos de limitación.
- La publicación vive en una ruta versionada y no depende del túnel.

### Éxito de comprensión

Se realizan sesiones individuales con dos participantes ajenos al proyecto. Cada persona recibe el enlace sin demostración y tiene cinco minutos para responder cinco tareas: identificar AOI, corte, porcentaje de cobertura, una conclusión prohibida y la próxima solicitud de evidencia. Éxito: cada participante responde al menos 4 de 5 correctamente y ninguno interpreta las 182 observaciones como diagnóstico de toda Pereira. Se conservan respuestas y tiempos sin datos personales.

### Validación de demanda

Durante 21 días se contactan diez personas relevantes de Planeación, DIGER, Vivienda, infraestructura, academia o gestión del riesgo, con el mismo enlace y una solicitud de revisión de 30 minutos. Antes del contacto cada persona se clasifica como `INSTITUTIONAL` —funcionario o contratista autorizado de una entidad responsable—, `PRODUCER_PROXY` —profesional o académico que conoce el proceso pero no puede comprometer a la entidad— o `EXPERT`. Las conversaciones con academia y expertos sirven para corregir comprensión y método; no cuentan como revisión institucional ni validación de demanda.

- **Validada para avanzar a B:** dos revisiones institucionales, una entrega de datos representativos o una solicitud explícita de estados/responsables.
- **Señal débil:** una conversación sin segunda acción; se corrige el informe y se repite una vez.
- **No validada:** cero revisiones después de diez contactos por al menos dos canales en 21 días. Se pausa la ampliación, se documenta el rechazo o silencio y se replantean usuario y distribución.

El éxito de construcción no se presenta como validación de demanda.

## Distribución y conservación

El túnel se usa solo para revisión de desarrollo. Antes de implementar se ejecuta una prueba de canal: confirmar que GitHub Pages está habilitado y que una ruta versionada persiste después de publicar una versión posterior.

Flujo:

1. Construir `report_id` desde fuentes versionadas.
2. Ejecutar señal, privacidad, licencias y consistencia del manifiesto.
3. Mantener `DRAFT` como archivo local. Solo subirlo a CI si un administrador documenta que el repositorio y el artefacto requieren autenticación; si no puede verificarlo, CI queda bloqueado.
4. Crear commit de código, reglas y referencias de versión, y tag `report-{report_id}`; el artefacto construido no entra al historial Git.
5. Publicar el artefacto de despliegue en Pages bajo `/reports/{report_id}/` y actualizar `/reports/latest/` como enlace, no copia.
6. Crear GitHub Release con el archivo del reporte y SHA-256 en las notas.
7. Probar la URL versionada, el archivo y el checksum.

Los artefactos temporales de Actions no son el archivo histórico. La persistencia ordinaria la dan el commit etiquetado, la ruta versionada en Pages y el GitHub Release; un incidente de privacidad o licencia activa la excepción de retirada definida arriba. Si Pages no está habilitado o no conserva rutas antiguas, el release es la entrega inicial y Pages queda bloqueado hasta configurar el canal.

Si entra información institucional interna, este modelo deja de ser válido. Esa transición exige autenticación, permisos, alojamiento del modo API, política de privacidad y operación formal.

## Dependencias

- Verificar Pages y Releases con una publicación desechable sin datos del producto.
- Completar el inventario por `source_id` y verificar licencia, alcance y fecha de cada fuente resuelta; una página pública no implica derecho de redistribución.
- Aprobar AOI, seis temas requeridos, `max_age_days`, allowlist y resolución espacial.
- Designar editor y revisor diferentes dentro del equipo Recovery.
- Preparar la lista de diez contactos para el experimento de 21 días.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El informe parece otro dashboard | Abrir con decisión condicionada, límites y solicitud concreta de evidencia |
| Se interpreta el AOI como toda Pereira | Mostrar cobertura antes de cualquier mapa temático y repetirla en cada exporte |
| El informe envejece sin que nadie lo note | Fecha de corte y estado visibles; versiones anteriores inmutables |
| Se sigue ampliando el ranking | Congelar cambios de scoring hasta recibir criterios institucionales |
| No se consigue acceso | Aplicar el experimento de diez contactos y 21 días; si no hay revisiones, pausar y replantear usuario y distribución |
| Una fuente pública cambia o desaparece | Archivar la copia solo si la licencia permite redistribuirla; en caso contrario conservar metadatos, parámetros y hash del material obtenido legítimamente |

## La asignación

Completar el experimento de demanda: publicar una primera versión condicionada y contactar diez personas clasificadas antes del contacto entre Planeación, DIGER, Vivienda, infraestructura, academia o gestión del riesgo durante 21 días. A cada persona se le solicita una sesión de 30 minutos. En la sesión no se hace una demostración guiada; se le pide identificar alcance, afirmación prohibida, dato faltante y siguiente acción. El resultado que habilita la siguiente fase es dos revisiones de participantes `INSTITUTIONAL`, una entrega de datos representativos autorizada por una entidad o una solicitud institucional explícita de flujo operativo. Las revisiones `PRODUCER_PROXY` y `EXPERT` solo corrigen el informe.

## Lo que noté sobre cómo piensas

- Dijiste que Recovery “aún se siente frágil” aun cuando el repositorio ya tiene una base técnica amplia. Esa frase separó calidad de código de calidad de producto.
- Señalaste que “las necesidades de hoy son distintas de cuando se construyeron los edificios”. Esa es la razón para no confundir recuperación con reposición de lo anterior.
- Reconociste que no tienes suficiente información sobre el proceso de Pereira y pediste investigación. Eso permitió reemplazar una narrativa genérica por actores, cifras y pasos verificables.
- Elegiste conseguir evidencia antes de ampliar la plataforma. El disparador hacia la cola operativa evita que esa prudencia se convierta en una pausa indefinida.
