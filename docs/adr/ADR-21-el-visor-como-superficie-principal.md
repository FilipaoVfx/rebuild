# ADR-21 — El visor pasa a ser la superficie principal, y se reescribe

**Estado:** aceptada
**Fecha:** 2026-09-17
**Deroga:** [ADR-15](ADR-15-sin-frontend-generico.md) §Decisión (la lista de pantallas prohibidas y el criterio de admisión)
**Continúa:** [ADR-20](ADR-20-la-oportunidad-es-la-entidad-central.md)
**Origen:** decisión de producto del dueño del repositorio, con autoridad explícita sobre los ADR anteriores

---

## Contexto

ADR-20 convirtió la oportunidad de recuperación en la entidad central y definió
los seis contextos del mapa. La estructura quedó bien. La superficie que la
expone, no:

> Sigue viéndose como un montón de ruido y data sin estructura, y la interfaz
> vanilla tampoco ayuda.

Ese diagnóstico es del dueño del producto y coincide con lo que se ve al abrir
el visor publicado: doce controles de capa encendidos a la vez, una tabla de 105
filas, los pesos del modelo compitiendo por atención con el mapa, y el titular
del problema —lo único que explica algo— escondido bajo un puntaje.

ADR-15 había restringido deliberadamente la superficie de interfaz, y su
argumento era bueno en su momento: sin ground truth y con tres de los cinco ejes
del modelo sin insumo, una interfaz pulida invita a presentar salidas inciertas
como hechos. Dos cosas cambiaron.

Primero, el terreno. La vulnerabilidad social ya se mide desde el Censo 2018 del
DANE, y quedan **dos** ejes sin fuente, no tres. Segundo, y más importante: el
argumento de ADR-15 concluía que la interfaz debía ser **pequeña**, cuando lo que
el problema pedía era que fuera **honesta**. No son lo mismo. Una interfaz
mínima sobre un modelo con agujeros no declara los agujeros: los deja fuera de
la pantalla, que es la forma más eficaz de que nadie los vea.

Esta decisión se toma por instrucción explícita del dueño del repositorio, que
fijó tener autoridad sobre los ADR anteriores. Se registra como ADR para que el
cambio de premisa quede escrito, no para someterlo a discusión.

---

## Decisión

El visor se reescribe como aplicación React y pasa a ser la superficie
principal del producto, junto a la API y al paquete de evidencia.

### Estructura: cinco vistas, una pregunta cada una

| Vista | Pregunta |
|---|---|
| Situación | ¿Qué está pasando en el territorio? |
| Oportunidades | ¿Dónde podemos actuar, y por qué ahí? |
| Escenarios | ¿Qué cambia si cambian las prioridades? |
| Portafolio | ¿Qué combinación de proyectos tiene sentido? |
| Evidencia | ¿En qué nos estamos basando, y qué no sabemos? |

El criterio de admisión de ADR-15 —«¿qué decisión toma un planificador con esta
pantalla que no puede tomar con el paquete de evidencia?»— se mantiene y se
aplica a cada una. Lo que se deroga es la lista de pantallas prohibidas: la fila
de tarjetas de métricas que ADR-15 vetaba es, en la vista de Situación, la
respuesta directa a su pregunta.

### Stack

React, TypeScript, Tailwind, MapLibre GL y deck.gl, construidos con Vite — el
stack que ADR-13 ya prescribía y que ADR-15 solo había diferido en calendario.

`apps/viewer/vendor/` desaparece, y la garantía que daba no. Las 2,9 MB de
MapLibre y deck.gl versionadas existían para que un piloto institucional no
dependiera de un CDN; ahora entran al bundle desde npm **en tiempo de
construcción**, así que el sitio publicado sigue sin cargar un solo script de
terceros. La tipografía es la pila del sistema por la misma razón: una fuente de
Google Fonts sería exactamente la dependencia externa que el visor evita para
los tiles.

Sigue sin haber basemap de terceros. El tejido urbano se dibuja con las huellas
de Microsoft y la malla de OSM que ya están versionadas: lo que se ve es dato
con `data_version`, no decoración servida por otro.

### Tres reglas que gobiernan la interfaz

**1. Un contexto a la vez, partiendo de todo apagado.** Cada contexto enciende
solo las capas que responden a su pregunta. No hay doce casillas: hay seis
preguntas.

**2. Lo que falta se dibuja como falta.** `UNKNOWN` tiene color propio —ni verde
ni rojo— y las condiciones sin fuente se **cuentan** en la ficha. Un sitio sin
dato para un eje se pinta en gris neutro, nunca en un extremo de la rampa: el
extremo oscuro se leería como «bajo» y el claro como «alto», y ninguno de los
dos es cierto.

**3. Un eje cubierto puede no ordenar nada, y el visor lo dice.** Es la regla
nueva, y la más importante. `pedestrian_accessibility` vale 1,0 en 112 de los
115 sitios: tiene cobertura del 100 % y no separa a nadie. Pintarlo como rampa
sugiere una variación que no existe. El visor mide la discriminación del eje
activo —valores distintos y dispersión p10–p90— y cuando no ordena lo declara en
la leyenda y en el panel, además de desactivar el estiramiento de la rampa para
no fabricar contraste a partir de ruido.

Esa tercera regla es la traducción a interfaz de «cobertura ≠ información»
(`docs/plan/estado-actual.md` §2). Estaba medida en un documento y ahora está en
la pantalla donde se toma la decisión.

---

## Consecuencias

**El puntaje deja de titular en todas partes.** La lista ordena por idoneidad,
pero cada tarjeta muestra el titular del problema. «Déficit de espacio público
con 15.671 personas alcanzables a diez minutos andando» es una razón para
intervenir; «68,3» no lo es.

**La descomposición exacta se vuelve visible sin dominar.** Contribuciones,
penalizaciones y contrafactual viven en una vista técnica plegada dentro de la
ficha. Estaban en la API y no se veían; ahora se ven cuando se piden.

**La procedencia viaja en el cromo.** Las fuentes, la versión de datos, la
versión de scoring y las alertas de licencia están en una barra permanente, no
en una pestaña. La atribución del mapa se construye desde `provenance`, no desde
una constante en el código.

**El riesgo que ADR-15 señalaba no desaparece: se traslada.** Una interfaz más
persuasiva sobre un modelo con dos ejes sin fuente puede afirmar más de lo que
el sistema sostiene. La mitigación es la misma que eligió ADR-20 y no se puede
delegar al diseño: las incógnitas viajan dentro de la entidad, contadas y con su
razón. Lo que esta decisión añade es que también viajan los ejes que no ordenan,
que antes ni se medían en la interfaz.

**Coste continuo, aceptado.** Cada pantalla añade estados vacíos, de carga y de
error, responsive, accesibilidad y una obligación de auditoría (Resolución 1519
de 2020). ADR-15 tenía razón en que ese coste se paga otra vez con cada cambio
del modelo de datos. Se acepta porque la alternativa —que el piloto se juzgue
por una interfaz que su propio dueño describe como ruido— cuesta más.

**El visor pasa a ser un artefacto con build.** `build_static.py` empaqueta
`apps/viewer/dist` en vez de tres archivos, e inyecta `URI_STATIC_BASE` después
de `<head>` porque los assets llevan hash. La API monta ese mismo `dist`. CI
gana un job que verifica tipos y build del visor: un visor roto tiene que
aparecer en CI, no al desplegar. La puerta de licencia de la publicación no se
toca.

---

## Alternativas rechazadas

**Rediseñar el visor vanilla sin cambiar de stack.** Evita 184 dependencias de
desarrollo y un paso de build. Se rechaza porque 2.025 líneas de JS imperativo
manipulando el DOM a mano es justo lo que hace caro cada cambio de estructura, y
esta decisión es sobre todo un cambio de estructura. ADR-13 ya había elegido
React para cuando llegara el momento.

**Mantener el visor vanilla junto al nuevo.** Es el desdoblamiento que ADR-17
describe para los datos sintéticos, aplicado a la interfaz: dos superficies que
se parecen y no coinciden son peor que una sola. El historial de git conserva el
visor anterior.

**Portar también el generador sintético de `rebuildv2`.** El prototipo del que
sale este lenguaje visual corre sobre datos generados. Nada de eso entra: ADR-17
sigue en pie y la migración 006 lo impone con un `CHECK`. Lo que se porta es la
interfaz, sobre las fuentes reales que ya alimentan el sistema.
