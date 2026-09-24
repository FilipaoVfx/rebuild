# ADR-25 — La ontología es un artefacto declarado, no una convención

**Estado:** aceptada
**Fecha:** 2026-09-24
**Enmienda:** [ADR-20](ADR-20-la-oportunidad-es-la-entidad-central.md) — la entidad
central deja de ser solo un módulo de Python y pasa a ser una declaración
versionada
**Implementa:** [`URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md`](../URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md)
§2 «Ontology Before UI»
**Recoge:** la capa de contrato del [diseño de office-hours](../designs/recovery-informe-versionado-preparacion.md),
separándola del informe al que servía
**Origen:** autoridad delegada por el dueño del repositorio sobre el corpus de ADR

---

## Contexto

El diseño de `/office-hours` del 2026-09-19 especificó, y nunca implementó, una
capa de contrato: seis entidades con campos obligatorios y una regla cada una,
identificadores enlazados en arreglos no nulos, cuatro familias de estados
cerrados, códigos de limitación estructurados verificados por chequeos
automáticos —*«los chequeos automáticos verifican códigos, no frases libres»*—
y un esquema JSON Schema 2020-12 que declara tipos, cardinalidad, nulabilidad y
enumeraciones.

Esa capa **es una declaración de ontología**. El error del diseño no fue
construirla: fue apuntarla a un artefacto de un solo uso —un informe estático
cuya conclusión el repositorio ya tenía escrita el día anterior en
[`cobertura-de-dano-ciudad.md`](../plan/cobertura-de-dano-ciudad.md)— en lugar de
apuntarla al dominio. La revisión externa está en
[`hallazgos.md`](../plan/hallazgos.md) §2.

Mientras tanto, el dominio real está en este estado:

- **38 tablas** en cuatro esquemas, y ninguna declaración de objeto.
- **8 enumeraciones cerradas** en `src/uri/contracts/enums.py` (`LicenseClass`,
  `ExportProfile`, `DamageClass`, `EvidenceMethod`, `SiteState`,
  `InterventionType`, `CatchmentMethod`, `FeasibilityStatus`). Bien hechas.
- **338 líneas de tipos TypeScript y 221 de esquemas Pydantic mantenidas a
  mano**, sin ninguna generación. Añadir las fotos de campo obligó a tocar
  `types.ts`, `data/index.ts`, `schemas.py` y `app.py` a la vez.
- **Texto libre donde debería haber código.** `site_exclusion.reason`,
  `satellite_scene.selection_reason` y, el peor, `stop_reason`:

  ```python
  stop_reason: str = "cobertura_saturada"
  def is_budget_limited(self): return self.stop_reason == "presupuesto"
  ```

  Una errata devuelve `False` en silencio y el visor afirma que el presupuesto
  no es el límite cuando sí lo es. Está en el optimizador, que
  [ADR-23](ADR-23-menos-portafolio-mas-explicacion.md) ya identificó como la
  parte con menos sustento.
- `quality_alert` **ya tiene columna `code`**, y su `severity` sí está
  restringido por `CHECK`. Alguien empezó a hacerlo bien y se quedó a medias.

[ADR-20](ADR-20-la-oportunidad-es-la-entidad-central.md) ya definió
`RecoveryOpportunity` como entidad semántica compuesta —lugar, problema,
evidencia, intervención, impacto, viabilidad, costo, confianza— y declaró su
consecuencia: *«la UI deja de conocer la estructura de la base»*. Eso es una
ontología en intención. Nunca se declaró como artefacto.

### El manifiesto

El [manifiesto de ontología](../URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md), en estado
`Foundational`, fija en su §2 exactamente esta dirección:

```
ONTOLOGY → DOMAIN MODEL → API → APPLICATION STATE → UI
```

> *«Not the reverse.»*

Este ADR es el primer paso ejecutable de ese principio: convierte «la ontología
va antes que la interfaz» en un artefacto que se puede versionar, verificar en
CI y del que se pueden generar tipos. El manifiesto dice qué debe ser verdad;
un ADR dice qué se cambia, cuándo y a cambio de qué.

Se alinean sin fricción sus §6 (relaciones de primera clase), §10 (preservar
procedencia), §32 (la licencia es parte de la ontología), §33 (los modelos son
objetos versionados) y §34 (nunca esconder la lógica del modelo tras un número)
— este último ya implementado por ADR-20 regla 3.

### Sobre el marco

Esta decisión se tomó mirando el
[Ontology SDK de Palantir](https://github.com/palantir/osdk-ts), y conviene
precisar qué se toma y qué no. Se toma **ontology-first, UI-derivada**: la
interfaz es rica porque el modelo semántico es rico. **No** se toma *UI-first*,
que significa que la interfaz manda y el modelo la sigue. Aplicado aquí, eso
desharía medio corpus: ADR-21 regla 3 desactiva el estiramiento de la rampa
cuando un eje no discrimina —la interfaz renunciando a verse mejor—, ADR-18
muestra `sin fuente` en vez de una barra, ADR-20 regla 1 impide que `UNKNOWN`
colapse. Este producto declara sus límites en pantalla; una interfaz que manda
los borraría.

## Decisión

### 1. La ontología se declara como artefacto versionado del repositorio

Tipos de objeto, propiedades, enlaces, estados cerrados y qué propiedades
admiten `UNKNOWN`. Empezando por `RecoveryOpportunity`, `Site`,
`DamageEvidence`, `Source` y `DatasetVersion`.

La declaración es la fuente de verdad. El esquema SQL la implementa; no la
sustituye.

### 2. Estado cerrado donde hoy hay texto libre

`stop_reason`, `site_exclusion.reason`, `satellite_scene.selection_reason` y
`quality_alert.code` pasan a enumeraciones declaradas, con `CHECK` en la base
igual que hicieron [ADR-17](ADR-17-prohibicion-de-datos-sinteticos.md) y
[ADR-19](ADR-19-cambio-satelital-no-es-dano.md). Una convención no impide una
errata; una restricción sí.

El texto libre no desaparece: acompaña al código como mensaje legible. Lo que
desaparece es que la **lógica** dependa de comparar cadenas.

### 3. Los tipos del visor se generan, no se escriben

`apps/viewer/src/types.ts` deja de mantenerse a mano y se deriva del contrato.
FastAPI ya emite OpenAPI y hoy no se aprovecha. Un campo nuevo pasa de tocar
cuatro archivos a ejecutar un comando.

### 4. La procedencia es un enlace del objeto, no un payload lateral

Hoy vive en una barra de cromo alimentada por una respuesta específica. Pasa a
ser recorrible desde cualquier objeto: `opportunity → site → damage_evidence →
source → dataset_version`. Es la ventaja competitiva del producto; merece ser
estructura, no panel.

### 5. Las reglas se versionan con hash, como ya se versionan los datos

`scoring_v1_weighted` aparece en la barra de procedencia sin nada que lo ancle.
El vector de pesos, el catálogo de intervenciones y los umbrales de restricción
se sellan con su hash y ese hash viaja en la respuesta, igual que
`dataset_version`. Es la idea de `ruleset_id` del diseño de office-hours,
aplicada al dominio en vez de a un informe.

### 6. No se adopta ninguna plataforma de terceros

Se toma el patrón, no el producto. Foundry queda descartado por una razón que no
es de gusto: los términos del SGC, archivados verbatim en
`db/terms/sgc_terminos_20260915.txt`, prohíben que su contenido sea

> «copiado, reproducido, recopilado, **cargado**, publicado, transmitido,
> distribuido»

*Cargado.* Subir esas capas a una plataforma ajena está prohibido de forma
explícita, y lo mismo aplica a ICube-SERTIT y a toda fuente en `UNCLEAR`. La
arquitectura de perfiles de export existe precisamente para impedirlo, y
[ADR-22](ADR-22-territorio-como-vista-de-entrada.md) §8 llegó a auto-servir la
cartografía base para no depender de un servidor ajeno en tiempo de ejecución.

### 7. Lo que se retira del diseño de office-hours

No se implementa el informe versionado como artefacto: TAR determinista,
reconstrucción byte a byte, GitHub Release, índice de retractación y flujo
editorial de dos personas. Tampoco las cuatro métricas de preparación —dos de
sus seis temas requeridos son vacíos falsos: uso del suelo (219 polígonos de
OSM) e infraestructura crítica (58 equipamientos) ya están cargados y
publicados—. Ni `theme-owners-v1.csv` como artefacto público, que nombraría
entidades responsables de ausencias en abierto durante una emergencia.

## Consecuencias

**El contrato deja de estar en tres sitios.** Hoy vive repartido entre las
migraciones, los esquemas Pydantic y los tipos de TypeScript, y los tres se
desincronizan por separado. Es la misma forma de fallo que
[ADR-18](ADR-18-retirada-de-la-capa-del-sgc.md) describió para las fuentes
contribuyentes: *«tres listas escritas a mano se desincronizan, y la que se
queda corta es la que deja pasar una fuente sin evaluar»*.

**Un bug real se cierra.** `is_budget_limited()` deja de depender de que nadie
escriba mal una cadena.

**Coste asumido:** una declaración que mantener y un paso de generación en CI.
Se paga una vez y se cobra en cada cambio del modelo.

**Lo que este ADR no autoriza.** No habilita escrituras. El sistema sigue siendo
`SALIDA CONSULTIVA` (CON-05): no hay ruta de escritura, ni cola de validación,
ni estados de aprobación. Cuando esa fase se active —y su disparador sigue
siendo el del diseño de office-hours: dos revisiones institucionales o una
entrega de datos autorizada— la forma correcta serán escrituras tipadas con
validación y auditoría, no CRUD sobre las tablas.

**Conflicto abierto con el manifiesto, §31.** El manifiesto pide que los datos
sintéticos *«se etiqueten como `SIMULATED`»* y que nunca sean visualmente
indistinguibles de una observación oficial. Eso presupone que el dato sintético
existe. [ADR-17](ADR-17-prohibicion-de-datos-sinteticos.md) **lo prohíbe**, y no
por criterio: la prueba de estabilidad ante la semilla midió que, regenerando
las capas con otra semilla, el top-20 conservaba **3 de 20 sitios**. El orden era
una propiedad del generador. Etiquetar no arregla eso.

**ADR-17 prevalece.** Una medición no es una decisión que este ADR pueda
revocar. §31 queda acotado a un único uso legítimo: el esquema de sandbox no
publicable propuesto en [`hallazgos.md`](../plan/hallazgos.md) §3.2 (E1), donde
sirve para maquetar interfaz de fuentes que aún no existen y donde la etiqueta
`SIMULATED` es exactamente la garantía que hace falta. Fuera del sandbox, la
prohibición es un `CHECK` en cinco tablas y sigue en pie.

**Nota de numeración.** `ADR-24` se cita diez veces en el código —`.env.example`,
`.gitignore`, migración 011, `pipeline.py`, `registry.py`, el adaptador de
`pereiramap`, `build_static.py`, `browser_check.py` y `schemas.py`— y el archivo
nunca se escribió. La decisión sobre las fotos de campo existe en el código y no
en el corpus; hay que escribirla o corregir las referencias.

## Alternativas rechazadas

**Adoptar Foundry y `osdk-ts` tal cual.** Resuelve de fábrica los cinco puntos
de arriba. Se descarta por el §6 —la prohibición de carga es explícita y
archivada— y porque `osdk-ts` es solo el cliente: sin una instancia de Foundry
no hay ontología con la que hablar. Añadir una plataforma propietaria y cara a
un proyecto sin contraparte institucional ni presupuesto es el mismo sobrealcance
que construir el informe antes de las entrevistas.

**Dejar la declaración implícita en el esquema SQL.** Es el estado actual. El
esquema dice cómo se guarda, no qué significa ni qué puede faltar. `UNKNOWN` no
es `NULL`: es un estado declarado con su razón, y esa distinción —que ADR-20
regla 1 defiende— no cabe en una columna anulable.

**Generar los tipos desde OpenAPI sin declarar ontología.** Es el 60 % del
beneficio por el 20 % del trabajo, y merece hacerse primero. Se rechaza como
destino porque OpenAPI describe la forma de la API, no el modelo: no tiene
enlaces recorribles ni distingue ausencia declarada de campo opcional. Sirve
como primer paso, no como sustituto.

**Implementar las seis entidades del diseño de office-hours tal como están.**
`finding`, `limitation`, `gap`, `conflict` y `decision` están modeladas para un
informe editorial, no para el dominio: un `finding` es una afirmación de una
publicación, no una propiedad del territorio. Lo que se recoge es el método
—campos obligatorios, enlaces por identificador, estados cerrados, códigos
verificables— no el modelo.
