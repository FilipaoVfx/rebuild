# Urban Recovery Intelligence

Plataforma de inteligencia espacial para decisiones de recuperación urbana post-desastre.

**Caso:** Pereira, Risaralda — municipio afectado por el sismo M7,4 del 10 de agosto de 2026, con epicentro en San José del Palmar, Chocó (Copernicus `EMSR916`, USGS `us6000tjl2`).

> El PRD, el SRS y el ARD describen el caso como "el sismo de Pereira". No lo fue: Pereira es uno de los 409 municipios afectados por un evento regional. Ver [antes de empezar](docs/plan/antes-de-empezar.md) §1.

La pregunta que el sistema responde:

> ¿Dónde intervenir, qué construir allí, por qué, cuánto valor genera, y qué combinación de sitios produce el mejor resultado a escala de ciudad?

No es una IA que decide qué debe construir una ciudad. Es una capa de soporte a la decisión: convierte datos territoriales, demográficos, de infraestructura, riesgo y disponibilidad de suelo en escenarios explicables y optimizados. Toda salida es consultiva (CON-05); ninguna decisión del sistema es vinculante.

## Estado

Slice vertical funcionando sobre datos reales: de 182 observaciones de daño de
Copernicus EMS en el AOI de Pereira a un portafolio de inversión explicado y
exportable, en ~12 s. ICube-SERTIT ya no alimenta nada: sigue en el registro de
fuentes con `redistribution_allowed = false`, y la puerta de publicación lo
bloquearía si volviera a contribuir.

```
182 observaciones  →  115 sitios  →  105 candidatos  →  19 proyectos
  Copernicus EMS      (agrupadas)     (10 excluidos)      (5,2 MM COP)
```

Lo que ya corre: ingesta versionada con registro de licencias · fusión de
evidencia multifuente (ADR-16) · grafo peatonal con pgRouting y catchments de
red · restricciones duras antes del scoring · modelo ponderado con
descomposición exacta y contrafactuales · optimizador greedy con redundancia y
equidad · API versionada con procedencia obligatoria · visor de decisión en
cinco vistas · exportes con puerta de licencia por perfil.

123 pruebas, lint y fronteras de módulo verificadas en CI. Arranque en
[CONTRIBUTING.md](CONTRIBUTING.md).

### Sin datos sintéticos

El generador está retirado y la base lo impone: `is_synthetic = true` en una
capa de contexto viola un `CHECK` (migración 006). Todo corre sobre fuentes
reales, verificado por `scripts/checks/signal_check.py`:

| Capa | Fuente |
|---|---|
| Daño | Copernicus EMS `EMSR916/AOI02` — 182 edificaciones, CC BY 4.0 |
| Edificación | Microsoft Building Footprints — 15.024 huellas |
| Población | Total publicado del AOI, repartido dasimétricamente sobre huellas |
| Red peatonal, parques, equipamientos, uso de suelo | OpenStreetMap |
| Amenaza sísmica | **ninguna** — la del SGC se retiró por licencia ([ADR-18](docs/adr/ADR-18-retirada-de-la-capa-del-sgc.md)) |

**Lo que falta se declara en vez de rellenarse.** Tres features del vector no
tienen fuente utilizable y quedan nulas: amenaza sísmica (SGC, retirada por
licencia), uso de suelo normativo (IDE AMCO, cubierto al 1 %) y vulnerabilidad
social (DANE, 0 %). En la tabla se leen como `sin fuente`, no como una barra en
cero: el cero es el valor más favorable en esas escalas. Ver
[estado actual](docs/plan/estado-actual.md).

Siguen abiertas **ocho decisiones con dueño** en
[antes de empezar](docs/plan/antes-de-empezar.md), varias de las cuales cambian
premisas del PRD.

> **La amenaza sísmica del SGC se retiró.** Sus términos prohíben reproducir,
> publicar o distribuir sin consentimiento previo por escrito, y se estaba
> publicando sellada con la versión de otra fuente, donde la puerta de licencia
> no podía verla. Retirarla no costó una sola decisión: era un valor por
> municipio —0,28 en los 115 sitios— que no excluía ni penalizaba a nadie.
> Detalle en [ADR-18](docs/adr/ADR-18-retirada-de-la-capa-del-sgc.md).

> **El presupuesto no es lo que limita el portafolio.** Los escenarios de 10,
> 25, 50 y 100 MM COP devuelven el mismo resultado: 19 proyectos por 5,19 MM
> COP. El objetivo es de cobertura y satura — tras 19 sitios ningún candidato
> restante alcanza población nueva. La respuesta lo declara (`stop_reason`,
> `budget_binding`) en vez de dejar que el control parezca roto. Ver
> [estado actual](docs/plan/estado-actual.md) §3.

### Cobertura del portafolio (en la API, ya no en pantalla)

El optimizador sigue calculando, por escenario, qué celdas alcanza cada
proyecto (`/api/v1/scenarios/{id}/coverage`): sobre el AOI actual el portafolio
de 25 MM COP alcanza **87.715 de 190.000 personas (46,2 %)** en 610 de 1.858
celdas, y los 19 aportes marginales caen de 16.248 personas a 30. La vista que
lo dibujaba en 3D se retiró del visor ([ADR-23](docs/adr/ADR-23-menos-portafolio-mas-explicacion.md)):
los costos son estimados sin fuente oficial y los pesos no tienen dueño
institucional, así que la lista de proyectos no es hoy un producto que
presentar. Escenarios conserva el motivo de parada y la equidad.

No hay edificios 3D: no existe la fuente de altura (`building_footprint` no la
trae y OSM tiene `building:levels` en 3 elementos del AOI), y extruir 15.024
huellas exigiría inventar 15.021 alturas. El relieve real del terreno (Copernicus
DEM) sí está, en Territorio.

### Evidencia de cambio satelital (fase 1)

`scripts/fetch_sentinel.py` cataloga escenas Sentinel-1 GRD y Sentinel-2 L2A
pre/post del sismo, elige la mejor de cada ventana con un criterio que queda
escrito en la base, y recorta el AOI. Necesita `CDSE_CLIENT_ID` y
`CDSE_CLIENT_SECRET` en el entorno — **nunca en el frontend**.

**Nada de esto es daño.** Un cambio de retrodispersión o de NDVI lo produce
igual una demolición que una obra nueva, una cosecha o un suelo mojado. La
base rechaza por `CHECK` cualquier banda que se llame como un veredicto, y lo
que se derive será `DAMAGE_EVIDENCE`, nunca `CONFIRMED_DAMAGE`
([ADR-19](docs/adr/ADR-19-cambio-satelital-no-es-dano.md)). Las tablas están
vacías hasta que haya credenciales: sembrarlas con escenas inventadas sería
justo lo que ADR-17 prohíbe.

## El visor

El visor es la superficie principal del producto, junto a la API y al paquete de
evidencia ([ADR-21](docs/adr/ADR-21-el-visor-como-superficie-principal.md), que
deroga el recorte de pantallas de [ADR-15](docs/adr/ADR-15-sin-frontend-generico.md)).
Cinco vistas, una pregunta cada una; la primera es la que abre
([ADR-22](docs/adr/ADR-22-territorio-como-vista-de-entrada.md)). La vista
Portafolio se retiró ([ADR-23](docs/adr/ADR-23-menos-portafolio-mas-explicacion.md));
el optimizador sigue en la API y en Escenarios:

| Vista | Pregunta |
|---|---|
| **Territorio** | **¿Dónde estamos?** — Colombia › Risaralda › Pereira, el sector que cubre el visor y por qué, el sismo, las comunas, los ríos, la imagen satelital antes y después |
| Situación | ¿Qué está pasando en el territorio? |
| Oportunidades | ¿Dónde podemos actuar, y por qué ahí? |
| Escenarios | ¿Qué cambia si cambian las prioridades? |
| Evidencia | ¿En qué nos estamos basando, y qué no sabemos? |

El mapa tiene siete contextos —territorio, situación, daño, necesidad, déficit,
acceso, oportunidades— y cada uno enciende **solo** lo que responde a su
pregunta, partiendo de todo apagado. No hay basemap de terceros: la cartografía
base de calles es un extracto PMTiles de OpenStreetMap (3,9 MB, z0–15) que el
sitio sirve él mismo, con la fecha de réplica de OSM en su procedencia; el
estilo (Protomaps), las fuentes (Noto Sans, OFL) y los sprites también viven en
el repositorio. Tres **tipos de mapa** en un control: *Calles* (OSM, claro),
*Oscuro* (OSM, oscuro) y *Datos* (fondo negro y solo las capas versionadas del
pipeline). En ningún caso llega un byte de un servidor de terceros en tiempo de
ejecución.

### La ciudad se llama por su nombre

Un puntaje sin lugar no dice nada. Desde ADR-22 el mapa lleva **comunas,
barrios, calles con jerarquía y nombre, ríos y quebradas y unos 160 hitos**
(Alcaldía, Gobernación, Parque El Lago, Hospital San Jorge, Terminal de
Transportes, UTP…), todos de OpenStreetMap y tal como OSM los escribe, más
los equipamientos y el espacio público que la Alcaldía de Pereira publica con
licencia declarada (`pereira_sig`). Cada sitio se presenta como

> Barrio Corocito · Comuna Villavicencio · Carrera 12 con Calle 7 · a 30 m de Parque Corocito

a nivel de cuadra, nunca de predio (SRS §6). Lo que OSM no tiene se dice —
"barrio sin fuente"— y se cuenta en la alerta `PLACE_COVERAGE`. Los nombres
derivados de OSM viven en `rebuild_osm_derived.site_place`, no en `core`: son
ODbL y el aislamiento por esquema de `fuentes.md` §8 sigue en pie.

Las cuatro vistas Sentinel antes/después se comparan con una cortina, siempre
con la fecha de cada escena y el texto de limitación al lado (ADR-19). Hay dos
ortofotos de Pereira —la del IGAC a 1:1.000 y la municipal del **14 de agosto de
2026**, cuatro días después del sismo— y ninguna se publica todavía: la primera
tiene licencia CC BY 4.0 (Res. IGAC 616/2020) condicionada a una titularidad
sin confirmar, la segunda no declara términos. El adaptador existe, descarga al
sandbox y el visor muestra el control deshabilitado con la razón
(`db/terms/igac_ortofoto_20260918.txt`, `db/terms/pereira_ortofoto_post_20260918.txt`).

Tres reglas gobiernan lo que la interfaz puede afirmar:

- **`UNKNOWN` tiene color propio**, ni verde ni rojo, y las condiciones sin
  fuente se cuentan en cada ficha. Un sitio sin dato para un eje se pinta gris
  neutro, nunca en un extremo de la rampa.
- **Un eje cubierto puede no ordenar nada, y el visor lo dice.**
  `pedestrian_accessibility` vale 1,0 en 112 de 115 sitios: cobertura del 100 %
  y cero capacidad de separar. El visor mide la discriminación del eje activo y
  cuando no ordena lo declara, además de no estirar la rampa para no fabricar
  contraste a partir de ruido.
- **El puntaje ordena, pero no titula.** Cada tarjeta lleva el titular del
  problema; la idoneidad y la descomposición exacta viven donde se piden.
- **Lo que se ve por defecto es lo que el modelo distingue con claridad.**
  Oportunidades abre con idoneidad ≥ 64 (34 de 105) y un control para bajar el
  umbral hasta ver todas; las demás siguen en el mapa, atenuadas.
- **El lateral explica el contexto activo.** Cada opción de la barra inferior
  tiene su panel: qué variables usa, cómo se calculan, con qué fuente y hasta
  dónde llegan (ADR-23).

Construido con React, TypeScript, Tailwind, MapLibre GL y deck.gl. Las
dependencias entran al bundle en tiempo de construcción, así que el sitio
publicado no carga ningún script de terceros.

```bash
cd apps/viewer && npm ci && npm run build
```

## Documentación

**Producto**

| Documento | Qué define |
|---|---|
| [PRD](docs/product/prd.md) | Qué es el producto y por qué |
| [SRS](docs/product/srs.md) | Qué debe hacer el sistema, bajo qué restricciones, y cómo se demuestra cada requisito |
| [ARD](docs/product/ard.md) | Cómo se construye y por qué, decisión por decisión |

**Planificación**

| Documento | Qué define |
|---|---|
| [Plan de MVP](docs/plan/mvp-plan.md) | Recorte de alcance, hitos con puertas verificables, decisiones abiertas y sus defectos |
| [Backlog](docs/plan/backlog.md) | Épicas y unidades de trabajo, trazadas a requisitos del SRS |
| [Inventario de datos](docs/plan/data-inventory.md) | Disponibilidad real por capa — entregable de Fase 0 |
| [Antes de empezar](docs/plan/antes-de-empezar.md) | **Léelo primero.** Lo que hay que saber, decidir o verificar antes del primer commit |
| [Estado actual](docs/plan/estado-actual.md) | Qué entrega hoy el sistema, qué es accionable y qué quedó fuera — con el diagnóstico de señal medido |
| [Fuentes](docs/plan/fuentes.md) | Consumo técnico y régimen de licencia de cada fuente, con los controles que lo hacen cumplible |
| [Conexiones](docs/plan/conexiones.md) | Endpoints verificados y recetas de conexión por fuente |
| [Antigüedad de la edificación](docs/plan/antiguedad-de-la-edificacion.md) | Research: el año de construcción es catastral (AMCO) y no está publicado; alternativas abiertas por época |
| [Cobertura de daño en la ciudad](docs/plan/cobertura-de-dano-ciudad.md) | Research: la Alcaldía publica ~7.700 inspecciones de daño edificio por edificio para toda Pereira; qué falta para usarlas |

**Decisiones posteriores al ARD**

| ADR | Decisión |
|---|---|
| [ADR-15](docs/adr/ADR-15-sin-frontend-generico.md) | La V1 no entrega una aplicación web de propósito general |
| [ADR-16](docs/adr/ADR-16-evidencia-de-dano-multifuente.md) | El daño es evidencia multifuente, no un atributo del sitio |
| [ADR-17](docs/adr/ADR-17-prohibicion-de-datos-sinteticos.md) | Se prohíben los datos sintéticos, y la base lo impone |
| [ADR-18](docs/adr/ADR-18-retirada-de-la-capa-del-sgc.md) | Se retira la capa del SGC, y la procedencia se sella por fuente |
| [ADR-19](docs/adr/ADR-19-cambio-satelital-no-es-dano.md) | Un cambio satelital no es daño, y el esquema lo impide |
| [ADR-20](docs/adr/ADR-20-la-oportunidad-es-la-entidad-central.md) | La oportunidad de recuperación sustituye al sitio como entidad central |
| [ADR-21](docs/adr/ADR-21-el-visor-como-superficie-principal.md) | El visor pasa a ser la superficie principal, y se reescribe |
| [ADR-22](docs/adr/ADR-22-territorio-como-vista-de-entrada.md) | El territorio es la vista de entrada, y cada dato dice dónde está |
| [ADR-23](docs/adr/ADR-23-menos-portafolio-mas-explicacion.md) | Se retira la vista Portafolio; idoneidad mínima 64 por defecto; el lateral explica el contexto activo |

## Principios que gobiernan el diseño

- **Evidencia sobre opinión.** Toda recomendación se apoya en evidencia espacial medible.
- **El territorio es el modelo de datos.** El mapa no es decoración.
- **Restricciones duras antes que el modelo.** Un candidato inválido nunca se rescata con un score alto.
- **La incertidumbre es una feature.** Confianza y calidad de datos se comunican explícitamente, nunca se ocultan.
- **Todo se explica.** Ningún score se expone sin su descomposición.
- **Humano en el bucle.** La plataforma soporta decisiones públicas; no las reemplaza.
- **La procedencia manda.** Cada dato lleva su fuente, su versión y su licencia hasta el último export.

## Estructura

```
src/uri/          contracts · ingestion · features · constraints · scoring
                  optimizer · reporting · api   (fronteras forzadas por CI)
apps/viewer/      visor de decisión (React + MapLibre + deck.gl): cinco vistas
db/migrations/    rebuild_core · rebuild_analytics · rebuild_osm_raw · rebuild_osm_derived
scripts/          dev_db · migrate · run_pipeline · serve · build_static · checks
docs/             producto (PRD/SRS/ARD) · planificación · ADR
```

## Arquitectura en una línea

Monolito modular en FastAPI sobre Supabase (PostgreSQL + PostGIS + pgRouting + pgmq), con el trabajo espacial pesado ejecutándose dentro de la base de datos y Python orquestando. Ver [ARD](docs/product/ard.md).
