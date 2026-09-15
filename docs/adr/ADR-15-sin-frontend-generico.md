# ADR-15 — La V1 no entrega una aplicación web de propósito general

**Estado:** aceptada
**Fecha:** 2026-09-13
**Documentos padre:** PRD v1.0 §38-41, §54; SRS v0.1 §8.7; ARD v0.1 ADR-13
**Continúa la numeración del ARD**

---

## Contexto

El PRD §54 define un Definition of Done cuyo bloque de frontend pide mapa interactivo, panel de sitio, panel de recomendaciones, filtros, constructor de escenarios y vista de comparación. El SRS §8.7 lo formaliza en `FR-UI-01..07`. El ARD lo resuelve técnicamente en ADR-13: React, MapLibre GL, deck.gl donde haga falta, TanStack Query, cero cómputo espacial en el navegador.

Nada de eso está en discusión como destino. La pregunta es **cuánto de ello entra en la primera versión**.

Tres hechos empujan en la misma dirección:

1. **No hay ground truth** (PRD §22). Nadie ha validado todavía que las recomendaciones del sistema sean sensatas para Pereira. Lo que el piloto tiene que demostrar primero es que los números resisten el escrutinio de alguien que conoce el territorio.
2. **El daño es sintético** (CON-01). Toda la V1 corre sobre datos generados. Una interfaz pulida sobre datos simulados invita exactamente al error que el PRD §5 prohíbe: presentar salidas inciertas como hechos.
   > **Actualización (2026-09-15, [ADR-17](ADR-17-prohibicion-de-datos-sinteticos.md)).** Esta premisa ya no se sostiene: el daño es real (Copernicus EMS, activación EMSR916) y los datos sintéticos están prohibidos. La decisión no cambia, porque el argumento que la sostiene sí: tres de los cinco ejes del modelo no ordenan nada por falta de insumo (`docs/plan/estado-actual.md` §2), y una interfaz pulida sobre un vector de features con agujeros invita al mismo error que una sobre datos generados.
3. **La superficie de interfaz es cara y su coste es continuo.** Cada pantalla añade estados vacíos, estados de carga, estados de error, responsive, accesibilidad, y una obligación legal de auditoría (Resolución 1519 de 2020). Ese coste se paga otra vez con cada cambio del modelo de datos.

Contra eso: sin ninguna exploración espacial, es difícil que un planificador detecte que el modelo se equivocó. El mapa no es decoración (PRD §55, *Spatial first*). Un PDF estático no deja preguntar "¿y por qué este sitio y no aquel de al lado?".

---

## Decisión

La V1 se define por su superficie de salida, no por sus pantallas. Entrega tres cosas:

1. **API versionada** — el contrato completo del SRS §10.1, con procedencia obligatoria en cada respuesta (`FR-API-02`).
2. **Paquete de evidencia** — GeoJSON, CSV, scenario JSON y reporte PDF, autocontenidos e interpretables sin la plataforma corriendo (CON-07, `FR-EXP-04`).
3. **Visor de decisión** — **una** vista cartográfica construida a medida: mapa, panel de sitio, comparador de escenarios, filtros. Se construye al final de M6, después de la API y los exportes.

Y prohíbe explícitamente, en la V1:

- Dashboards de KPIs, filas de tarjetas de métricas, gráficos que no sean el mapa
- Plantillas de administración, pantallas CRUD sobre tablas del dominio
- Pantallas de configuración genéricas, onboarding, perfiles de usuario, gestión de usuarios por UI
- Cualquier vista que no responda directamente a una de las seis preguntas del PRD §4

El criterio de admisión de una pantalla en la V1 es una sola pregunta: **¿qué decisión toma un planificador con ella que no puede tomar con el paquete de evidencia?** Si no hay respuesta concreta, la pantalla no entra.

---

## Consecuencias

La API y los exportes se vuelven la interfaz primaria, lo que significa que tienen que ser buenos de verdad: nombres legibles, errores explícitos, procedencia completa. Eso es trabajo que había que hacer igualmente, solo que ahora se hace bajo la presión de ser la única superficie.

La validación con el planificador ocurre al cierre de M3 y M4 sobre exportes, antes de que exista visor. Si las recomendaciones fallan ahí, el coste del descubrimiento es de semanas, no de meses, y no hay interfaz construida encima que rehacer.

`FR-UI-05` (WCAG 2.1 AA) queda con menos superficie que auditar, no con menos obligación. El visor se construye operable por teclado y sin distinciones categóricas dependientes del color desde su primer commit; lo que se difiere es la auditoría formal cerrada.

El riesgo que se acepta: sin la interfaz completa del PRD §39, la demostración institucional es menos vistosa. En un piloto que se juzga por la calidad de las recomendaciones y no por la de las pantallas, es un intercambio favorable — pero deja de serlo si la contraparte institucional espera ver un producto terminado. Esa expectativa hay que alinearla en la primera sesión, junto con la pregunta de hosting de R6.

ADR-13 no cambia: cuando el visor se construya, se construye con ese stack. Esta decisión es sobre calendario y alcance, no sobre tecnología.

---

## Alternativas rechazadas

**Interfaz completa del PRD §54 en la V1.** Gasta la mitad del piloto en superficie sobre números no validados, y hace que cada corrección del modelo arrastre trabajo de frontend. El PRD describe el producto; no dice que todo llegue en la primera versión.

**V1 sin ninguna interfaz web** (solo API + exportes). Es el corte más limpio y libera ~3-4 semanas de M6. Se rechaza por poco margen: el flujo de filtrar, seleccionar, inspeccionar y comparar del PRD §39 es donde el planificador detecta los errores del modelo, y sobre PDFs estáticos esa detección no ocurre. Queda registrada en el plan de MVP §0 como punto de decisión abierto, porque el argumento contrario es defendible y la elección es del equipo de producto.

**Notebooks como interfaz de validación.** Sirven para el analista, no para el planificador ni para la contraparte institucional, que son quienes tienen que reconocer el territorio en los resultados. Se usarán internamente durante M3-M4, pero no son entregable de piloto.
