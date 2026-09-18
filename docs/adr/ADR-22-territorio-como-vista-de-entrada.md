# ADR-22 — El territorio es la vista de entrada, y cada dato dice dónde está

**Estado:** aceptada
**Fecha:** 2026-09-18
**Enmienda:** [ADR-21](ADR-21-el-visor-como-superficie-principal.md) (cinco vistas → seis; seis contextos → siete; reglas de etiquetas, imagen e identidad de lugar)
**Continúa:** [ADR-20](ADR-20-la-oportunidad-es-la-entidad-central.md), [ADR-21](ADR-21-el-visor-como-superficie-principal.md)
**Origen:** decisión de producto del dueño del repositorio

---

## Contexto

ADR-21 reescribió el visor con cinco vistas y seis contextos, y la estructura
quedó honesta. Lo que no quedó fue el lugar. El dueño, al abrirlo:

> Aún se siente muy desconectado, parece solo un mapa con datos. El usuario
> quiere ver la ciudad: ubicación, imágenes, calles, dirección. Todos los datos
> deben estar relacionados con un lugar que el usuario pueda identificar. Las
> recomendaciones de sitios serán algo secundario, no el home principal.

El diagnóstico se comprueba en el código. El mapa no tiene una sola etiqueta:
ni calles, ni barrios, ni ríos, ni hitos, ni norte, ni escala. Las huellas de
edificios se dibujan en dos de seis contextos; en los otros cuatro la "ciudad"
son líneas de un píxel sobre negro. Un sitio se identifica como `#017` más un
tipo de intervención: `Site` y `Opportunity` no tienen barrio, comuna, calle ni
hito, y `Opportunity.zone` es siempre `null`. La base ya tenía `site.neighborhood`
y `site.commune` (nunca escritas), una tabla `reference_neighborhood` (vacía) y
`display_name` en vías, parques y equipamientos de OSM — que la API descartaba
al serializar. Las cuatro vistas Sentinel antes/después estaban descargadas,
permitidas, cargadas en el estado del visor y nunca dibujadas. El arranque
decía "CARGANDO TERRITORIO" y caía en un panel de cifras.

Un planificador de Pereira que abre el visor tiene que poder decir "esto es la
Calle 19 con Carrera 8, al lado del Parque El Lago" antes de leer un solo
puntaje. Si no puede, el puntaje no le dice nada.

## Decisión

### 1. Una sexta vista, Territorio, abre por defecto

| Vista | Pregunta |
|---|---|
| **Territorio** | **¿Dónde estamos?** |
| Situación | ¿Qué está pasando en el territorio? |
| Oportunidades | ¿Dónde podemos actuar, y por qué ahí? |
| Escenarios | ¿Qué cambia si cambian las prioridades? |
| Portafolio | ¿Qué combinación de proyectos tiene sentido? |
| Evidencia | ¿En qué nos estamos basando, y qué no sabemos? |

Territorio sitúa antes de evaluar: dónde está Pereira (Colombia › Risaralda ›
Pereira), qué parte de la ciudad cubre este visor y por qué esa (el AOI de
Copernicus EMS es donde se apuntó el sensor, no donde hubo daño), qué pasó y
cuándo (la ficha USGS del evento, a cuántos kilómetros), las comunas que toca,
los ríos, la imagen satelital antes y después, y tres cifras. Termina en un
enlace a Situación. Las recomendaciones dejan de ser lo primero que se ve.

El criterio de admisión de ADR-15 se cumple por la negativa: sin esta vista, el
planificador no reconoce el territorio en los resultados, que es el fallo que
ADR-15 describía como el peor de todos.

### 2. Un séptimo contexto, `TERRITORIO`, y la ciudad siempre legible

`TERRITORIO` es orientación: huellas, vías con jerarquía, ríos y quebradas,
contornos de comunas y barrios, etiquetas, hitos y equipamientos municipales.
Sin coropleta; los sitios se dibujan neutros. Es el único contexto que enciende
etiquetas de barrio y de calle en todo el mapa.

Las huellas de edificios se dibujan **en todos los contextos**, atenuadas. La
regla de ADR-20 —"un contexto a la vez, partiendo de todo apagado"— sigue en
pie para las capas de análisis; el tejido urbano no es una capa de análisis,
es el papel sobre el que se dibujan.

### 3. Etiquetas: solo nombres de OSM, nunca inventados, con densidad por zoom

Los nombres son `display_name` de OSM tal como llegan. No se traducen, no se
normalizan, no se completan: si OSM dice "Bostón" con tilde, el mapa dice
"Bostón". La densidad la gobierna el zoom y una prioridad declarada por tipo de
hito (gobierno y plazas primero; iglesias y bibliotecas al final), con
detección de colisiones. Sigue sin haber servidor de glifos ni tipografía
externa: las etiquetas se dibujan con `TextLayer` de deck.gl y la pila del
sistema.

### 4. Identidad de lugar: barrio, comuna, esquina e hito — nunca el predio

Cada sitio se presenta como

> Barrio San Nicolás · Comuna Centro · Calle 19 con Carrera 8 · a 180 m de Parque El Lago

La esquina es la calle con la carrera con nombre más cercanas al centroide
(a menos de 250 m), en el sentido de la nomenclatura de Pereira; una vía que no
es calle ni carrera solo entra si se llama como una vía (avenida, vía,
variante). El hito es el más cercano con nombre a menos de 400 m. La dirección
a nivel de predio **no existe** en el sistema (SRS §6, FR-PII-01): la
`Nomenclatura domiciliaria` municipal no se ingiere aunque declare licencia.

Lo que falta se omite y se dice: un sitio sin barrio en OSM muestra "barrio sin
fuente" y se cuenta en la alerta `PLACE_COVERAGE`. Un barrio resuelto por el
punto más cercano —porque ningún polígono lo contiene— se marca "aproximado".

### 5. Aislamiento: los nombres de OSM viven en `rebuild_osm_derived`

Barrio, comuna, esquina e hito de cada sitio son dato **derivado de OSM** y van
a `rebuild_osm_derived.site_place`, no a `rebuild_core.site`. La API los une con
`LEFT JOIN`. `site.neighborhood` y `site.commune` quedan reservadas a un
catálogo oficial no-ODbL, si algún día lo hay. Escribir un nombre ODbL en
`core` es exactamente la fuga de régimen que el aislamiento por esquema de
`fuentes.md` §8 existe para impedir.

Las comunas y barrios salen de OSM (16 comunas `admin_level=8` y 248 barrios
`admin_level=9` intersectan el AOI) y no del SIG municipal, porque los ítems
municipales de comunas y barrios no declaran licencia. El SIG municipal entra
solo con lo que sí la declara (equipamientos, espacio público; Ley 1712 de
2014, atribución al municipio), como fuente `pereira_sig`.

### 6. Imagen: Sentinel siempre con fecha y limitación; la ortofoto, con puerta

La cortina antes/después de Sentinel muestra siempre la fecha de adquisición de
cada escena, la razón por la que se eligió y el texto de limitación de
`previews.json` ("Reflectancia y retrodispersión observadas, no daño…"). Una
imagen sin esas tres cosas al lado es un veredicto disfrazado (ADR-19).

Hay dos ortofotos de Pereira. La del IGAC a 1:1.000 tiene licencia (CC BY 4.0,
Res. 616/2020) condicionada a que la titularidad sea del IGAC, y el portal
municipal la llama "Ortofoto AMCO": queda en `UNCLEAR` hasta confirmar la
titularidad. La municipal del 14 de agosto de 2026 —cuatro días después del
sismo, la imagen más valiosa que existe para este producto— no declara ni
licencia ni productor: queda en `UNCLEAR` con la solicitud a SIGPER escrita.
El adaptador existe para las dos, descarga al sandbox mientras estén
bloqueadas, y el visor muestra el control **deshabilitado con la razón**. Una
ortofoto no se publica por estar disponible; así se publicó la capa del SGC
(ADR-18).

### 7. El evento se declara una vez

Fecha, magnitud, epicentro y profundidad viven en `uri.contracts.event.EVENT`,
citados de la ficha USGS `us6000tjl2` con su URL y fecha de lectura, y la
distancia a Pereira se calcula en el servidor. Ningún panel escribe "M7,4" a
mano.

### 8. Cartografía base propia, y el tipo de mapa lo elige quien mira

El dueño pidió un mapa que se lea como Google Maps. La regla de `fuentes.md`
§11.2 —ningún tile de terceros— no cambia; lo que cambia es que ahora servimos
nosotros una cartografía base completa de OpenStreetMap: un extracto **PMTiles**
del área urbana de Pereira (3,9 MB, z0–15) archivado en `data/basemap/` con la
fecha de réplica de OSM en su índice y sellado como `dataset_version` de la
fuente `osm`. El estilo es el de Protomaps (diseño CC0, código BSD-3), la
tipografía Noto Sans (OFL) y los sprites se sirven desde el propio sitio; el
archivo se lee por rangos de bytes, que GitHub Pages y la API responden. **No hay
un solo byte que venga de un servidor de terceros en tiempo de ejecución.**

Tres tipos de mapa, en un control del mapa: **Calles** (OSM, claro; por defecto),
**Oscuro** (OSM, oscuro) y **Datos** (el mapa original: fondo negro y solo las
capas versionadas del pipeline). Sobre la cartografía base el visor apaga lo que
ella ya dibuja —calles, manzanas, ríos, nombres de vía y de barrio— y conserva
lo que ella no tiene: comunas, hitos priorizados, el AOI, los sitios y las
capas de análisis. Los POI y los números de dirección del estilo de Protomaps
se quitan: los hitos los pone el visor con prioridad declarada, y una
dirección por edificio es el grano que el SRS §6 prohíbe.

### 9. Oportunidades explica su método antes de listar resultados

La vista abre con "Cómo se identifican las oportunidades": seis pasos con los
números del pipeline cargado (de la evidencia al sitio, restricciones duras,
medición por sitio, puntaje multicriterio con pesos declarados, intervención y
viabilidad, portafolio). Se dice lo que es —un análisis espacial multicriterio,
explicable y auditable— y lo que no es: **no hay aprendizaje automático** ni
validación de campo. Presentarlo como "un modelo de ML que identifica dónde
construir" sonaría mejor y sería falso: no existe verdad de terreno con la que
entrenar ni validar, y los pesos se fijan por elicitación, nunca mirando el
ranking (CONTRIBUTING). Cuando exista verdad de terreno, calibrar será una
decisión con su ADR; hoy sería inventar.

## Consecuencias

- **Backend.** Extracto OSM aparte (`db/seed/pereira_places.overpass` →
  `osm_places_pereira.json.gz`), con `data_version` propia bajo la fuente `osm`:
  el extracto peatonal alimenta features y su hash no se mueve. Migración
  `010_places.sql`: `admin_area`, `place_point`, `waterway`, `landmark`,
  `arterial_road` en `rebuild_osm_raw`; `site_place` en `rebuild_osm_derived`;
  `municipal_facility`, `municipal_public_space`, `reference_region` en
  `rebuild_core`. Todas en `PUBLISHED_LAYER_TABLES`. Gazetteer en
  `uri.ingestion.places` (SQL, PostGIS, tras la fusión de evidencia). Nuevo
  `GET /api/v1/territory`; `/sites`, `/sites/{id}` y `/opportunities` llevan
  barrio, comuna, esquina, hito y `place_line`; ocho capas GeoJSON nuevas.
- **Fuentes.** `pereira_sig` (ATTRIBUTION), `natural_earth` (dominio público,
  contornos de Colombia y Risaralda para el localizador), `igac_ortofoto` y
  `pereira_ortofoto_post` (UNCLEAR, con auditoría en `db/terms/`). El conjunto
  UNCLEAR del test de licencias cambia a mano, como manda su docstring.
- **Visor.** Vista Territorio, contexto `TERRITORIO`, vías por jerarquía,
  ríos, contornos administrativos, etiquetas, hitos, contorno del AOI, escala,
  norte, cortina Sentinel, línea de lugar en fichas, tarjetas y ranking,
  filtro por comuna, huecos del portafolio con barrio, migas
  "Pereira › Comuna › Barrio › sitio".
- **Cartografía base.** `data/basemap/pereira_basemap.pmtiles` + `basemap.json`
  (procedencia: build de Protomaps, réplica de OSM, comando de extracción);
  `loader.record_basemap` lo sella como versión de `osm`; `/data/basemap/*` con
  `Range`; `apps/viewer/public/basemap/` (fuentes OFL, sprites); `lib/basemap.ts`
  con el estilo por tipo de mapa; `MapTypeSwitcher`. Refrescar el extracto es
  publicar una versión nueva: `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles
  data/basemap/pereira_basemap.pmtiles --bbox=-75.80,4.75,-75.62,4.86 --maxzoom=15`
  y reescribir el índice.
- **Año de construcción.** No existe fuente abierta: es un atributo catastral de
  AMCO no publicado. Research y alternativas por época en
  [antiguedad-de-la-edificacion.md](../plan/antiguedad-de-la-edificacion.md).
- **Seguimiento.** `reference_neighborhood` (datos.gov.co `ebsr-7cb7`, CC BY-SA,
  catálogo oficial barrio → comuna sin geometría) queda sin cablear: exige un
  cruce por nombre con OSM y un cruce erróneo inventaría un código oficial.
  Auditar la titularidad de la ortofoto del IGAC y pedir términos a SIGPER son
  tareas de correo, no de ingeniería.

## Alternativas rechazadas

- **Un basemap de terceros** para tener calles y nombres en una tarde.
  `fuentes.md` §11.2 y ADR-10 lo prohíben, y ADR-21 lo reafirmó: un tile
  servido por otro no tiene `data_version`.
- **Consumir el WMS de la ortofoto desde el navegador.** `fuentes.md` §11.1.
  Además el servidor del IGAC respondió 502 durante toda la auditoría.
- **Escribir barrio y comuna en `rebuild_core.site`**, que ya tenía las
  columnas. Rompe el aislamiento share-alike (§5 arriba).
- **Rehacer Situación como introducción.** Mezcla dos preguntas en una vista y
  rompe la regla "una vista, una pregunta" de ADR-21.
- **Un overlay de bienvenida.** No arregla la falta de identidad del mapa ni de
  las fichas; solo la explica.
