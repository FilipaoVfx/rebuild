# ADR-26 — El POT se lee de IDE AMCO, y la compatibilidad es un criterio declarado

**Estado:** aceptada. La tabla de compatibilidad de §4 está **en borrador** hasta
que Planeación la valide; la fuente, **bloqueada** hasta que el AMCO declare su
licencia.
**Fecha:** 2026-09-24
**Responde:** OI-F3 de [fuentes.md](../plan/fuentes.md) («¿Publica IDE AMCO WFS
operativo?»: sí) y D6 de [antes-de-empezar.md](../plan/antes-de-empezar.md)
(«¿Existe microzonificación oficial de Pereira como capa?»: sí, y en dos
versiones)
**Continúa:** [ADR-17](ADR-17-prohibicion-de-datos-sinteticos.md) (lo que no se
observó no se inventa), [ADR-18](ADR-18-retirada-de-la-capa-del-sgc.md)
(disponible no es permitido), [ADR-22](ADR-22-territorio-como-vista-de-entrada.md)
§6 (la puerta de licencia también se aplica al disco)
**Gobernada por:** [`URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md`](../URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md)
§17 (la viabilidad se separa del impacto), §32 (la licencia es parte de la
ontología), §34 (ninguna lógica escondida detrás de un número)
**Origen:** requerimiento del dueño del repositorio

---

## Contexto

Dos de las cuatro condiciones de viabilidad de cada oportunidad no tienen con
qué responder:

- **Compatibilidad con el POT:** UNKNOWN en 114 de 115 sitios. El proxy de OSM
  tiene 219 polígonos de uso de suelo y solo uno cae sobre un sitio.
- **Riesgo sísmico:** UNKNOWN en los 115 desde que la capa del SGC se retiró por
  licencia (ADR-18).

`estado-actual.md` daba el POT por bloqueado porque «el GeoServer de IDE AMCO
responde en el puerto 8443, fuera de la política de salida de este entorno». El
2026-09-24 ese bloqueo ya no existe: `geo.ideamco.gov.co:8443` responde WFS 2.0.0
y WMS con certificado válido y publica 399 capas en el espacio de trabajo `amco`.

Se consultaron sobre el AOI y se cruzaron con los 115 sitios:

| Capa | Qué es | Sitios cubiertos | ¿Distingue? |
|---|---|---|---|
| `pot_sectores_normativos` | Tratamiento y área de actividad del POT | 112 | **Sí**: 5 áreas de actividad, 5 tratamientos |
| `pot_microzonificacion_sismica` | Zona geotécnica del POT | 112 | **Sí**: zonas 1, 3, 5 y 6 |
| `pere_zonsism` | Otra versión de la anterior | 112 | Sí, y **no coincide** con la anterior en 11 sitios |
| `dosq_zonsism` | Microzonificación de Dosquebradas | los 3 restantes | Sí: zonas 1 y 4 |
| `uso_del_suelo_pereira` | Cobertura del suelo | 112 | **No**: «Zona Urbana» en 110 |
| `pot_clasificacion_suelo` | Clasificación del suelo | 112 | No: «Suelo Urbano» en los 112 |
| `pot_amenaza_mov_masa` | Amenaza por movimiento en masa | 0 | — |

Los 3 sitios sin sector normativo (`site_0054`, `site_0055`, `site_0114`) están
en **Dosquebradas**, según la propia capa de límites del AMCO. IDE AMCO no
publica la norma de Dosquebradas por sectores: su única capa de zonificación
(`dosq_zonampot2000`, del POT del 2000) dice «Zona Urbana» en los tres.

Dos distinciones gobiernan todo lo que sigue:

1. **Cobertura no es norma.** `uso_del_suelo_pereira` describe lo que hay sobre
   el suelo (bosque, guadua, pasto, ciudad). El POT dice lo que se puede hacer
   en él. Solo la segunda responde la pregunta de viabilidad.
2. **Zona no es riesgo.** La microzonificación clasifica el suelo por su
   respuesta sísmica («cenizas volcánicas de 20 a 25 m», «llenos antrópicos»).
   Traducir eso a un nivel de riesgo para un parque o un equipamiento exige los
   parámetros del estudio de microzonificación, que el servicio no publica.

Y un hecho que gobierna la publicación: **el servicio no declara licencia.**
`Fees` y `AccessConstraints` valen `NONE`, el valor por defecto de GeoServer; el
proveedor está vacío; las capas no tienen descripción, fecha ni acto de
adopción; las páginas de geoservicios y de datos abiertos de ideamco.gov.co no
dicen nada de reutilización. Auditoría completa en
[`db/terms/ide_amco_20260924.txt`](../../db/terms/ide_amco_20260924.txt).

## Decisión

### 1. La fuente entra al registro como UNCLEAR, y lo que descarga va al sandbox

`ide_amco` se registra con `license_class = UNCLEAR`. El control C1
(`assert_source_usable`) la bloquea para cualquier feature de la base. El
adaptador (`src/uri/ingestion/adapters/ide_amco.py`) escribe en
`data/ide_amco/.sandbox/`, que está en `.gitignore`, la API no sirve y
`build_static.py` no copia. Es la puerta de las ortofotos (ADR-22 §6), y la
función que la decide (`registry.is_publishable`) es ahora la misma para las dos.

Usar la información para análisis interno es legítimo: es pública por defecto
(Ley 1712 de 2014) y consultarla no es redistribuirla. Publicarla sí lo sería, y
el manifiesto §32 es explícito: *«Unknown licensing means the original product
should not be redistributed.»*

### 2. Se piden cuatro capas por nombre, nunca el espacio de trabajo entero

El espacio `amco` mezcla el POT con capas cuyo nombre indica datos personales
(`dosquebradas_personas_naturales`, entre otras). El adaptador pide solo las
capas de `LAYERS`, una por una, y una prueba impide que se añada una de ellas
sin que alguien lo vea. Cada consulta se archiva con su URL exacta, su hora y su
hash (`FR-ING-05`), y se comprueba antes de guardarse: una respuesta truncada
por el límite del servidor o con los ejes invertidos se rechaza, porque ninguno
de los dos fallos rompería un cruce — simplemente no cruzaría nada.

### 3. El cruce dice cuánto del sitio cae en cada sector

Cada sitio se muestrea con una rejilla de 7×7 puntos y se asigna al sector que
cubre la mayor parte. Si ese sector cubre menos del 95 %, la viabilidad lo dice
(«Ese sector cubre el 54 % del sitio; el resto cae en otro»). Son 8 sitios.
Decidirlo por el centroide habría escondido que están partidos.

Un sitio fuera de la capa recibe la clave con `None`; un sitio cuya capa no se
consultó no la recibe. La viabilidad distingue los dos casos: «el sitio está en
Dosquebradas, y IDE AMCO publica los sectores normativos de Pereira» no es lo
mismo que «el POT de IDE AMCO está pendiente de licencia».

### 4. La compatibilidad es un criterio declarado, por intervención, en borrador

El POT da tratamiento y área de actividad. No dice si un parque «es compatible»:
eso lo dicen las fichas normativas, que asignan a cada área de actividad usos
principales, complementarios, restringidos y prohibidos. **Este sistema no tiene
las fichas.** Así que la compatibilidad se declara como lo que es, un criterio,
en `src/uri/constraints/pot.py`:

**Por área de actividad**

| Área de actividad | Parque | Deportivo | Plaza | Equipamiento | Espacio abierto | No construir |
|---|---|---|---|---|---|---|
| Residencial | ✓ | ✓ | ✓ | **⚠** escala e impacto: lo decide la ficha | ✓ | ✓ |
| Actividad múltiple | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Centralidad metropolitana | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Equipamiento | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Suelo de protección | ✓ | **⚠** endurece el suelo | **⚠** endurece el suelo | **✕** Ley 388 de 1997, art. 35 | ✓ | ✓ |

**Por tratamiento** (aplica a toda intervención que construye; «no construir»
no necesita plan parcial)

| Tratamiento | | Razón |
|---|---|---|
| Consolidación simple / con densificación | ✓ | No exige instrumento adicional |
| Consolidación con densificación (mayor 1 ha) | ⚠ | La subcategoría por tamaño sugiere un instrumento; por confirmar |
| Renovación urbana — redesarrollo | ⚠ | Se ejecuta por plan parcial |
| Renovación urbana — reactivación | ✓ | Admite intervención predio a predio |
| Desarrollo en suelo de expansión | ⚠ | Se incorpora por plan parcial |
| Suelo de protección | ✓ | La restricción la da su área de actividad |

Reglas:

- **Se lee lo peor de las dos tablas.** Un parque cabe en el área de actividad
  múltiple, pero en un sector de redesarrollo queda sujeto al plan parcial.
- **Los tres estados son los del manifiesto §17:** compatible → `OK`
  (*FEASIBLE*), condicionada → `WARNING` (*REQUIRES REVIEW*), no compatible →
  `BLOCKED` (*INCOMPATIBLE*).
- **Cada celda lleva su razón escrita**, y la razón llega a la ficha. Ninguna es
  un número: un 0,6 como los de `OSM_LANDUSE_COMPATIBILITY` es exactamente la
  lógica escondida que el manifiesto §34 prohíbe.
- **Un valor que las tablas no contemplan es UNKNOWN.** Nunca se toma el caso
  más parecido.
- **`ESTADO_CRITERIO = "BORRADOR"`**, y mientras lo sea cada respuesta termina
  en «Criterio en borrador (ADR-26), por validar con Planeación». Pasa a
  `VALIDADO` cuando la Secretaría de Planeación de Pereira contraste la tabla con
  las fichas normativas y el acta quede citada aquí. Cambiar el valor sin esa
  acta es inventar una validación.

Esto no choca con ADR-17. Lo que ADR-17 prohíbe es fabricar observaciones que
nadie hizo. Aquí el dato (sector, tratamiento, actividad) es real; lo que se
declara es la regla que lo lee, con su estado y sus razones a la vista.

### 5. La zona sísmica no es un nivel de riesgo

Con la zona, la condición de riesgo **sigue en UNKNOWN**, pero ahora dice lo que
se sabe: «Microzonificación de Pereira: zona 3 (Cenizas Volcanicas de 20 a
25 m). Falta la tabla que traduce la zona a un nivel de riesgo, que sale del
estudio de microzonificación.»

- **No se infiere un nivel desde la leyenda.** «Llenos antrópicos = riesgo
  alto» suena razonable y es justamente el tipo de valor que nadie observó. La
  tabla zona→nivel sale del estudio, con sus parámetros, o no sale.
- **La discrepancia se declara, no se resuelve eligiendo.** Donde
  `pere_zonsism` asigna otra zona, la ficha lo dice: «La otra versión que
  publica IDE AMCO la pone en zona 6». Son 11 sitios. Cuál está vigente es una
  pregunta para el AMCO, no una decisión de ingeniería.
- **Cada zona viaja con su municipio.** La zona 1 de Dosquebradas («cenizas
  volcánicas de 10 a 20 m») no es la zona 1 de Pereira («de 2 a 10 m»).

D6 queda respondida: la microzonificación oficial existe como capa. Lo que
falta no es la capa sino su lectura.

### 6. Para publicar hacen falta dos puertas, no una

| Puerta | La abre | Mientras tanto |
|---|---|---|
| Licencia de la fuente | La respuesta al [derecho de petición](../plan/derecho-de-peticion-amco.md) (10 días hábiles) cambia la fila de `ide_amco` en el registro | Sandbox e informe interno |
| Criterio de compatibilidad | El acta de Planeación cambia `ESTADO_CRITERIO` | Toda respuesta dice «borrador» |

Con las dos abiertas, la integración es mecánica y queda fuera de esta
decisión: una migración con las capas y su `data_version`, el cargador con
`assert_source_usable("ide_amco")`, y un `LEFT JOIN` en `/api/v1/opportunities`
que llene `pot_sector`, `pot_municipio` y `pot_zona_sismica`. La viabilidad ya
lee esas claves.

## Lo que se midió (informe interno del 2026-09-24)

`scripts/fetch_ide_amco.py` sobre los 115 sitios publicados:

| Intervención | ✓ OK | ⚠ Condicionada | ✕ Bloqueada | Sin información |
|---|---|---|---|---|
| Parque | 92 | 20 | 0 | 3 |
| Escenario deportivo | 90 | 22 | 0 | 3 |
| Plaza pública | 90 | 22 | 0 | 3 |
| Equipamiento comunitario | 55 | 55 | 2 | 3 |
| Espacio abierto | 92 | 20 | 0 | 3 |
| No construir | 112 | 0 | 0 | 3 |

- **Área de actividad:** actividad múltiple 43 · residencial 35 · centralidad
  metropolitana 31 · suelo de protección 2 · equipamiento 1.
- **Tratamiento:** consolidación con densificación 65 · renovación urbana,
  redesarrollo 20 · renovación urbana, reactivación 13 · consolidación simple
  12 · suelo de protección 2.
- **Zona sísmica:** Pereira zona 3: 89 · zona 6 (llenos antrópicos): 16 ·
  zona 1: 5 · zona 5: 2 · Dosquebradas zona 4: 2 · zona 1: 1.

Hoy las dos condiciones sin fuente son las mismas en todas las oportunidades.
Con esto, la compatibilidad pasa a tener respuesta en 112 sitios y distingue
entre intervenciones; el riesgo sigue sin nivel, pero con la zona de los 115.

## Consecuencias

**Lo que gana el producto.** 33 sitios están en renovación urbana, es decir, en
suelo que el POT ya destina a transformarse, y 20 de ellos quedan sujetos a plan
parcial. Eso es exactamente lo que un funcionario necesita saber antes de
recomendar una obra, y hoy la ficha no puede decirlo. Los 2 sitios en suelo de
protección no admiten un equipamiento.

**Lo que no cambia hoy.** El producto publicado sigue igual: ninguna capa de
IDE AMCO llega a la base, a la API ni al paquete estático. Cambia un texto: el
UNKNOWN de compatibilidad deja de decir «Sin POT de IDE AMCO» y dice «El POT de
IDE AMCO está pendiente de licencia (ADR-26)», que es la verdad.

**Riesgos que se aceptan:**

- **Que el criterio esté mal en alguna celda.** Para eso es borrador y lo dice
  en cada respuesta. Las celdas condicionadas son, a propósito, las dudosas.
- **Que las capas estén desactualizadas.** No declaran fecha ni acto de
  adopción. El derecho de petición lo pregunta.
- **Que un sitio partido quede evaluado solo por su sector dominante.** Se
  declara el porcentaje. Evaluar cada parte es trabajo para cuando un sitio
  partido cambie una decisión.

## Alternativas descartadas

- **Publicar ya, porque el servicio es abierto.** Es el error que ADR-18 corrigió
  con el SGC.
- **Usar `uso_del_suelo_pereira`.** Es cobertura, y dice «Zona Urbana» en 110 de
  112 sitios: no cambia ninguna decisión.
- **Un número de 0 a 1 por área de actividad**, como el proxy de OSM. No depende
  de la intervención, que es lo que importa, y esconde la razón (manifiesto
  §34).
- **Quedarse con una de las dos microzonificaciones.** Elegir la que convenga es
  decidir sin decirlo.
- **Inferir un nivel de riesgo desde la leyenda.** Sería un valor inventado con
  apariencia de dato.
- **Cruzar por centroide.** Escondería los 8 sitios partidos.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/uri/ingestion/registry.py` | Fila `ide_amco` (UNCLEAR) y `is_publishable`, compartida con las ortofotos |
| `src/uri/ingestion/adapters/ide_amco.py` | Capas, consulta, comprobaciones, lectura y cruce |
| `src/uri/constraints/pot.py` | El criterio de §4 y su estado |
| `src/uri/opportunities/feasibility.py` | Compatibilidad por intervención; riesgo con la zona |
| `scripts/fetch_ide_amco.py` | Descarga al sandbox e informe por sitio |
| `db/terms/ide_amco_20260924.txt` | La auditoría de términos |
| `docs/plan/derecho-de-peticion-amco.md` | La solicitud que abre la primera puerta |
| `tests/test_ide_amco.py` | Puerta, cruce y criterio |
