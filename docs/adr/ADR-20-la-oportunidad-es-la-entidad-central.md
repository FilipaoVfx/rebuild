# ADR-20 — La oportunidad de recuperación sustituye al sitio como entidad central

**Estado:** aceptada
**Fecha:** 2026-09-16
**Sustituye parcialmente a:** [ADR-15](ADR-15-sin-frontend-generico.md)
**Origen:** requerimiento de evolución del producto

---

## Contexto

El MVP integra daño, población, espacio público, equipamientos, red peatonal,
huellas de edificio, censo y satélite. Y sin embargo se percibe como un visor
GIS técnico. El diagnóstico del requerimiento es exacto:

> Existe mucha información visible, pero las relaciones entre los datos y su
> traducción a decisiones no son suficientemente claras.

El problema no es falta de datos. Es que la entidad que el producto expone —el
`site`— **solo dice dónde**. Para decidir hace falta saber qué problema hay
ahí, qué lo sustenta, qué se podría hacer, a quién beneficiaría, si es viable y
cuánto cuesta. Nada de eso cabe en un sitio con un score al lado.

ADR-15 decidió que la V1 no entregaría una aplicación web de propósito general,
y su argumento sigue siendo bueno: una interfaz pulida sobre un vector de
features con agujeros invita a presentar salidas inciertas como hechos. Pero
ese argumento **prohibía pantallas, no estructura**. Lo que aquí se añade no es
una pantalla más: es la entidad que hace que las que ya existen signifiquen
algo.

Y el terreno cambió. Cuando se escribió ADR-15, tres de los cinco ejes del
modelo no ordenaban nada. Hoy la vulnerabilidad social se mide desde el Censo
2018 del DANE: 112 de 115 sitios con 107 valores distintos. Quedan dos ejes
sin fuente, y **eso es precisamente lo que la nueva entidad tiene que mostrar
en vez de esconder**.

---

## Decisión

`RecoveryOpportunity` pasa a ser la entidad central del producto:

```
LUGAR + PROBLEMA + EVIDENCIA + INTERVENCIÓN + IMPACTO + VIABILIDAD + COSTO + CONFIANZA
```

Se implementa como un **módulo propio**, `uri.opportunities`, insertado en la
jerarquía de capas entre `scoring` y `optimizer`:

```
contracts → ingestion → features → constraints → scoring
          → opportunities → optimizer → reporting → api
```

Ese sitio no es decorativo. Una oportunidad necesita el score del par para
existir, y el optimizador selecciona un portafolio **de oportunidades**, no de
sitios. El contrato de `import-linter` lo verifica en CI, así que la jerarquía
no se puede romper por descuido.

### Tres reglas que gobiernan el módulo

**1. Una condición sin fuente se declara `UNKNOWN`.** Nunca se colapsa a `OK`
ni a `BLOCKED`. Colapsarla a `OK` afirmaría una compatibilidad que nadie ha
comprobado; a `BLOCKED` frenaría proyectos viables por falta de dato ajeno.

Es la lección de [ADR-18](ADR-18-retirada-de-la-capa-del-sgc.md) hecha código:
antes de retirarla, la capa de riesgo se envolvía en `COALESCE(..., 0)` y los
115 sitios puntuaban riesgo cero —el valor más favorable— sin que nadie se
enterara. Hoy el POT y el riesgo salen `UNKNOWN` en todo el AOI, cada uno con
su razón escrita, y la vista **cuenta** las incógnitas: un proyecto con tres
`OK` y dos `UNKNOWN` no es lo mismo que uno con cinco `OK`.

**2. El problema se compone, no se rellena.** El titular sale de los factores
que dominan el score en *ese* sitio, con un umbral del 15 % del score base.
Nombrar cinco factores para todos los sitios es no nombrar ninguno. Hay una
prueba que exige que dos sitios con datos distintos reciban titulares
distintos: si el texto no cambia con los datos, no explica, decora.

**3. El score ordena, pero no titula.** `suitability` sigue existiendo y sigue
ordenando la lista, pero vive en una `<details>` plegada. «Idoneidad 68,3» no
es una razón para intervenir en un sitio; «déficit de espacio público con
15.671 personas alcanzables a diez minutos andando» sí.

### Contextos en vez de capas

El mapa pasa a tener seis contextos —situación, daño, necesidad, déficit,
acceso, oportunidades— y cada uno enciende **solo** lo que responde a su
pregunta. Partiendo siempre de todo apagado: partir del estado anterior
acumularía capas hasta volver al punto de partida en tres clics.

---

## Consecuencias

La UI deja de conocer la estructura de la base. Una vista consume oportunidades
y no necesita saber que la población viene de manzanas del DANE, el daño de
Copernicus EMS y la red peatonal de OSM. Eso es lo que permite cambiar una
fuente sin tocar la interfaz.

Se emite **una** oportunidad por sitio, con la mejor intervención, no cinco.
Cinco por sitio sobre 115 sitios son 575 filas: un visor GIS con otro nombre.
Las alternativas no se pierden —el score de cada par se sigue calculando— pero
no compiten por la atención.

`NO_BUILD` cobra un papel que no tenía: es la respuesta honesta a «aquí no cabe
nada», y evita que el sistema se vea forzado a recomendar siempre algo.

El riesgo que se acepta es el mismo de ADR-15, y no desaparece: una interfaz
más persuasiva sobre un modelo con dos ejes sin fuente puede afirmar más de lo
que el sistema sostiene. La mitigación no es hacerla más fea, es que las
incógnitas viajen **dentro** de la entidad —contadas, nombradas y con su razón—
en vez de en una nota al pie que nadie lee.

---

## Lo que NO entra todavía

El requerimiento propone además búsqueda híbrida con `pgvector` y modelos de
ML de suitability. Ninguno entra ahora, y por razones distintas:

- **`pgvector` y retrieval semántico**: no existe corpus documental. Montar la
  extensión y el esquema sobre cero documentos es infraestructura que no
  recupera nada. Lo que sí tiene sentido a corto plazo es FTS y `pg_trgm`
  sobre lo que ya existe.
- **ML de suitability**: el propio requerimiento lo condiciona a que haya
  ground truth, y no lo hay — nadie ha validado todavía que las
  recomendaciones sean sensatas para Pereira. El baseline por reglas se
  mantiene, como el propio documento indica.
