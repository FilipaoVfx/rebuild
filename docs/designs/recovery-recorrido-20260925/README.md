# Recovery: hallazgos de producto y tres variantes

**Fecha:** 2026-09-25

**Base revisada:** `codex/recovery` en `ba24ffd`

**Estado:** exploración visual; ninguna variante está aprobada ni implementada.

## Resultado visible

| Variante | Pregunta que pone primero | Dirección visual | Archivo |
| --- | --- | --- | --- |
| A · Atlas territorial | ¿Qué necesita este lugar? | Mapa amplio, oscuro, tipografía técnica | [PNG](variant-A.png) |
| B · Mesa de decisiones | ¿Qué aportaría más a Corocito? | Comparación editorial, fondo claro, azul | [PNG](variant-B.png) |
| C · Cuaderno de verificación | ¿Qué debemos comprobar en Corocito? | Lista de visita, papel cálido, terracota | [PNG](variant-C.png) |

[Tablero comparativo](design-board.html). Es un HTML autocontenido para examinar las imágenes lado a lado. La función de enviar comentarios del tablero requiere el servidor local de diseño; abrir este archivo desde GitHub no guarda respuestas.

Las tres imágenes se generaron como bocetos de interfaz de 1536 × 1024 píxeles mediante el generador de imágenes integrado. Se empleó `design-shotgun` para explorar direcciones distintas de composición, paleta y tipografía. El generador propio de gstack no tenía credenciales configuradas; su herramienta de comparación sí creó el tablero. Los nombres de fuentes en el brief describen una intención visual, no fuentes implementadas.

## Hallazgos de la revisión de producto

1. **La promesa del producto es ayudar a decidir qué hacer con un lugar.** El [manifiesto](../../URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md) describe una secuencia de descubrir, entender, verificar, comparar, simular y actuar. El mapa ayuda a ubicar; la oportunidad y su evidencia sostienen la decisión.
2. **La interfaz actual ya explica una oportunidad, pero ofrece poco recorrido después de entenderla.** El visor tiene las vistas Territorio, Situación, Oportunidades, Escenarios y Evidencia ([navegación](../../../apps/viewer/src/components/chrome.tsx)); la [ficha](../../../apps/viewer/src/components/OpportunityDetail.tsx) incluye factores, alternativas, viabilidad y evidencia. La [comparación actual](../../../apps/viewer/src/views/OpportunitiesView.tsx) es entre oportunidades/sitios. La pregunta de diseño que queda abierta es cómo comparar *intervenciones para un mismo lugar* y convertir las dudas en una siguiente comprobación clara. Esta es una interpretación de producto, no un defecto técnico probado por usuarios.
3. **Claude cuestionó con razón la secuencia del antiguo plan de informe versionado.** Su [revisión](../../plan/hallazgos.md) sostiene que el plan había adelantado maquinaria de publicación para conseguir conversaciones, pese a tener identificada la fuente EDAM, y recomienda usar primero las conversaciones para comprobar demanda. [ADR-25](../../adr/ADR-25-la-ontologia-es-un-artefacto-declarado.md) conserva la declaración ontológica y retira el informe versionado como artefacto a construir. Estas variantes no reintroducen ese informe.
4. **La incertidumbre debe verse y orientar la próxima acción.** Las tres pantallas muestran hipótesis y compatibilidad POT pendiente, en consonancia con [ADR-26](../../adr/ADR-26-el-pot-se-lee-de-ide-amco-con-criterio-declarado.md). La variante C explora una salida hacia verificación de campo, pero la misión/ficha de visita dibujada todavía no es una capacidad implementada. [ADR-24](../../adr/ADR-24-las-fotos-de-campo-son-evidencia-visual.md) distingue las fotos vinculadas a sitios de una misión de campo o confirmación por operador, que aún no autoriza.

## Lectura de las variantes

- **A** conserva una entrada territorial reconocible, pero el mapa puede volver a ocupar el centro de la experiencia y relegar la decisión. Sus fotos, nombres de calles, límites y escala son inventados por el generador.
- **B** hace visibles los criterios y las preguntas sin respuesta para dos intervenciones en Corocito. Es la mejor candidata para probar si una persona entiende realmente la diferencia entre alternativas. Los indicadores verdes de «evidencia disponible» son elementos ilustrativos y no constatan disponibilidad real.
- **C** convierte las dudas en preguntas para una visita. Es la mejor candidata para probar si el recorrido termina en una acción útil. Sus controles de adjuntos y «Preparar ficha de visita» son diseño, no funcionalidad existente.

**Hipótesis para la siguiente prueba con usuarios:** entrar por un lugar, presentar una comparación al estilo B y cerrar con las preguntas de verificación al estilo C. Se propone para validación; no constituye elección aprobada ni cambio de alcance.

## Límites

Corocito, comuna Villavicencio, Pereira, se usa como caso ilustrativo del recorrido. Todos los mapas, fotografías, ilustraciones, límites y escalas en los PNG son sintéticos: no son cartografía comprobada ni evidencia territorial. Las dos intervenciones dibujadas son hipótesis, no recomendaciones urbanísticas, estimaciones de costo o resultados aprobados. La compatibilidad POT y la disponibilidad de fuentes deben verificarse con los datos y controles existentes antes de mostrarse como hechos en el producto.

La revisión fue documental y visual. No incluye entrevistas, pruebas de usabilidad ni implementación en el visor. El siguiente paso de producto es elegir qué partes de las variantes vale la pena probar con una persona del público objetivo y qué tarea concreta debería poder completar.
