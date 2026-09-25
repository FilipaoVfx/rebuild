# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primario, en esta fase: la contraparte institucional que evalúa.** Una persona
técnica o directiva de la Secretaría de Planeación de Pereira, de DIGER
(Dirección de Gestión del Riesgo de Desastres) o de la UNGRD que abre el enlace
por primera vez, **sin demostración guiada**, y en minutos decide si el producto
merece una segunda reunión y acceso a datos. Conoce el territorio de Pereira; no
conoce el producto.

**Secundario, después:** el analista técnico de Planeación o DIGER que lo usaría
en sesiones sostenidas para priorizar dónde verificar e intervenir. Servir al
evaluador no puede traicionar a este usuario.

## Product Purpose

Urban Recovery Intelligence convierte evidencia urbana fragmentada tras el sismo
del 10 de agosto de 2026 (M7,4) en Pereira, Colombia, en una caracterización
defendible: dónde concentrar la atención de la recuperación, qué podría hacerse
ahí, por qué, a quién sirve, y qué no sostiene todavía la evidencia.

Es soporte a la decisión, nunca decisión automatizada. La pregunta que lo
define: no *«¿qué había aquí antes?»* sino *«¿qué necesita este territorio
ahora?»*.

**Éxito en esta fase:** un evaluador que abre el enlace entiende, en minutos y
sin guía, qué territorio es, qué cubre la evidencia y qué no, y cómo se ve una
oportunidad concreta de principio a fin — y pide la siguiente conversación.

## Positioning

Cada cifra está atada a su fuente, su licencia y su fecha; cada ausencia se
declara en lugar de rellenarse. Un visor GIS o un tablero vecino enseña más
capas; este producto enseña lo que se puede defender y dice lo que no. La unidad
del producto es la decisión —dónde, qué, por qué, cuánto, qué pasa si, qué
combinación—, no el predio.

## Operating Context

- Se abre en **escritorio, en oficina**: portátil o monitor, luz de oficina, a
  veces **proyectado en una sala de reuniones** delante de varias personas.
- Llega como enlace (hoy un paquete estático servido por un túnel temporal),
  normalmente junto a un vídeo narrado de 2 minutos (`docs/demo/`) y a
  solicitudes formales de datos (derechos de petición a SIGPER).
- Salida consultiva (`SALIDA CONSULTIVA`): sin ruta de escritura, sin cuentas,
  sin edición.
- Idioma de interfaz: español de Colombia.

## Capabilities and Constraints

- **Vistas actuales:** Territorio, Situación, Oportunidades, Escenarios,
  Evidencia; siete contextos de mapa. El rediseño puede reorganizar la
  navegación (decisión del dueño, 2026-09-24).
- **Datos, corte 2026-09-18:** 182 observaciones de daño de Copernicus EMS
  (foto-interpretación, sin validación de campo) sobre un rectángulo de
  21,66 km² — el 66 % de un perímetro urbano de 32,8 km²; 115 sitios y 105
  candidatos; población repartida dasimétricamente sobre huellas de edificio;
  vulnerabilidad social del Censo 2018 del DANE por manzana; red peatonal y uso
  del suelo de OpenStreetMap; equipamientos y espacio público del SIG municipal;
  escenas Sentinel-1/2 antes y después; relieve del Copernicus DEM; cartografía
  base PMTiles autoalojada.
- **Modelo:** de cinco ejes, dos ordenan de verdad; riesgo y uso normativo del
  suelo no tienen fuente. Los costos no tienen fuente oficial y los pesos no
  tienen dueño institucional; el optimizador de cartera salió de la superficie
  (ADR-23).
- **Restricción vinculante — ausencias honestas.** Lo que falta se dibuja como
  falta. `UNKNOWN` tiene color propio y nunca colapsa a `OK` ni a cero. Un eje
  cubierto que no discrimina lo declara. Nunca se estira una rampa para fabricar
  contraste (ADR-18, ADR-20 regla 1, ADR-21 regla 3).
- **No vinculantes para el rediseño** (decisión del dueño, 2026-09-24): cero
  bytes de terceros en tiempo de ejecución, los anclajes `data-uri`, la
  estructura de cinco vistas.
- **Legal:** las fuentes bloqueadas (SGC, ICube-SERTIT, catastro IGAC, ortofoto
  municipal post-sismo, inspección EDAM) no se publican. Sin datos personales:
  ninguna dirección a nivel de predio, ningún nombre ni documento. Las fotos de
  campo solo se publican en estado `APROBADA`.
- **Sin datos sintéticos en el producto** (ADR-17).

## Brand Commitments

- Nombre: **Urban Recovery Intelligence**.
- Marca de salida: **`SALIDA CONSULTIVA`**.
- Voz: español directo y preciso; declara sus límites sin rodeos; sin
  entusiasmo comercial.
- El aspecto visual actual **no** es un compromiso: se rediseña.

## Evidence on Hand

- Paquete real de datos: `dist/data/` — sitios, oportunidades, fichas,
  escenarios, cobertura, fuentes, alertas, GeoJSON, previsualizaciones Sentinel.
- `docs/product/prd.md`, `docs/product/proposito.md`, `docs/product/mcr2030.md`,
  `docs/URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md`, `docs/adr/` (ADR-15 a ADR-25),
  `docs/plan/hallazgos.md`.
- Vídeo del demo: `docs/demo/recovery-pereira-demo.mp4`.
- **Ausente — no se inventa:** usuarios institucionales activos, testimonios,
  adopción, costos oficiales, validación de campo, microzonificación sísmica.

## Product Principles

1. **El territorio antes que el resultado.** El evaluador reconoce su ciudad
   antes de leer un puntaje.
2. **El límite se declara antes que el hallazgo.** Qué cubre la evidencia va
   primero; qué muestra, después.
3. **El problema titula; el puntaje solo ordena.**
4. **Lo que no sabemos es parte del producto**, contado y visible.
5. **Informar, no sustituir.** La plataforma apoya una decisión pública; nunca
   la toma.
