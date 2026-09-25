# Recovery: mapa como espacio de análisis

**Exploración del 2026-09-25.** [Ver mockup](mapa-analista-v1.png). Continúa la línea visual de la [variante B](../recovery-recorrido-20260925/variant-B.png): papel claro, azul cobalto, título editorial y reglas finas. El mapa ocupa la pantalla; la información del punto seleccionado y los controles flotan sobre él. Las intervenciones aparecen como enlace opcional después de la evidencia y el contexto.

## Decisión de producto por explorar

El analista elige qué examinar. Al seleccionar un lugar puede abrir la evidencia de daño, explorar el entorno o, si le interesa, ver posibles intervenciones. La tarjeta contextual muestra lo disponible y lo que falta, sin convertir una recomendación del sistema en una instrucción para construir. No se ha validado aún con usuarios ni aprobado como nuevo diseño del visor.

## Datos comprobados en este repositorio

| Información | Disponible para una exploración del mapa | Límite que debe verse |
| --- | --- | --- |
| Daño Copernicus EMSR916 | [182 observaciones agrupadas en 115 sitios](../../plan/estado-actual.md), con procedencia, clase y fecha en el [contrato de detalle](../../../apps/viewer/src/types.ts) | Foto-interpretación; no es inspección estructural ni validación de campo. La cobertura corresponde a un sector de Pereira. |
| Calles, barrios, comunas, ríos e hitos | [Extractos OSM versionados](../../../db/seed/README.md) y [capas del visor](../../../apps/viewer/src/data/index.ts) | Nombres y límites con la cobertura propia de OSM; no se completan cuando falta la fuente. |
| Edificios y población alcanzable | 15.024 huellas Microsoft y celdas que reparten el total de 190.000 personas del AOI de Copernicus, según [ingesta](../../../src/uri/ingestion/loader.py) | La población alcanzable sigue siendo una **estimación derivada**; no es un censo actual del punto seleccionado. |
| Contexto censal | 2.348 manzanas del Censo DANE 2018 archivadas en `db/seed/`, cargadas por el [pipeline](../../../src/uri/pipeline.py) para la vulnerabilidad | El índice de vulnerabilidad es una composición del proyecto, no un índice oficial del DANE. Se suprimen atributos de manzanas pequeñas. El censo es de 2018. |
| Equipamientos y espacio público | 332 y 341 polígonos municipales archivados, respectivamente, según [inventario de extractos](../../../db/seed/README.md); también hay capas OSM | Sirven para inspeccionar el entorno. No prueban por sí solos la necesidad o viabilidad de una obra. |
| Imágenes | Mapa base OSM propio y [cuatro vistas Sentinel antes/después](../../../data/sentinel/previews.json) | Diferencias de imagen no equivalen a daño. Las ortofotos IGAC y municipal no se publican mientras su acceso de redistribución siga sin resolver. |

La cifra 182/115 describe el **conjunto del área de estudio**, no el punto de Corocito. Por eso el mockup no inventa conteos, población, costos, puntajes ni fechas para ese sitio. La [documentación de estado del 2026-09-15](../../plan/estado-actual.md) aún llama inaccesible al DANE; ese extremo quedó desactualizado por la integración del censo en el [adaptador](../../../src/uri/ingestion/adapters/dane.py) y en el pipeline. El mapa y la población alcanzable, sin embargo, conservan el reparto derivado de Copernicus y Microsoft.

## Información que todavía no debe mostrarse como resultado disponible

- **POT y microzonificación de IDE AMCO:** existen consultas e informe en un [sandbox local](../../../src/uri/ingestion/adapters/ide_amco.py), pero la licencia está sin declarar y la tabla de compatibilidad aún requiere validación de Planeación ([ADR-26](../../adr/ADR-26-el-pot-se-lee-de-ide-amco-con-criterio-declarado.md)). El mockup dice «POT sin dato publicable».
- **Ortofotos:** el [adaptador](../../../src/uri/ingestion/adapters/ortofoto.py) mantiene deshabilitada la publicación de la imagen municipal y la del IGAC mientras se resuelven sus condiciones. El mockup no las usa.
- **Fotos de campo:** [ADR-24](../../adr/ADR-24-las-fotos-de-campo-son-evidencia-visual.md) describe su función, pero en este checkout no encontré una ruta de fotos de campo en el visor o el paquete estático. El mockup no las representa como evidencia disponible.
- **Amenaza sísmica SGC y estaciones Megabús:** la primera fue retirada por sus condiciones de uso ([ADR-18](../../adr/ADR-18-retirada-de-la-capa-del-sgc.md)); el extracto de Megabús está archivado, pero su adaptador no está conectado al pipeline ([inventario](../../../db/seed/README.md)).

## Lo que aún es ilustrativo

La imagen se generó con la herramienta integrada de imágenes. Tomó como referencias la variante B y un fotograma del [video del visor](../../demo/README.md), y se corrigió la posición visual del marcador hacia Villavicencio, al sur del río. El mapa resultante es una **interpretación gráfica**, no cartografía lista para análisis ni una captura de la aplicación implementada. La pertenencia de un sitio real a Corocito y sus valores concretos deben venir de la salida versionada del sistema. Los botones son propuestas de navegación.

La pregunta útil para una primera prueba con analistas es: «Al abrir Corocito, ¿puedes encontrar la evidencia, entender sus límites y escoger por dónde continuar sin que el sistema te empuje a una obra?»

[Prompts de generación y corrección](PROMPT.md).

## Implementación

Implementado el 2026-09-25 como interfaz del visor: [ADR-27](../../adr/ADR-27-el-visor-es-un-espacio-de-analisis-sobre-el-mapa.md). La tarjeta del lugar, la mesa de comparación (variante B) y el cuaderno de verificación (variante C) usan solo la salida versionada del sistema; lo que el mockup dibujaba como ilustrativo quedó fuera o se muestra como no disponible.
