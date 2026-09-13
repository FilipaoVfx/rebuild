# ADR-16 — El daño es evidencia multifuente, no un atributo del sitio

**Estado:** aceptada
**Fecha:** 2026-09-13
**Documentos padre:** SRS v0.1 §6 (contrato de daño), §7 (capa sintética); PRD v1.0 §5, §9.1, §34, §55
**Modifica:** el contrato congelado del SRS §6

---

## Contexto

El SRS §6 congela un contrato en el que el daño es un atributo del sitio: `damage_level`, `habitability`, `demolition_status`, un valor por campo, un `source`. Ese modelo presupone un dataset municipal autoritativo que resuelve la cuestión de una vez.

La auditoría de fuentes ([fuentes.md](../plan/fuentes.md)) muestra que no es lo que vamos a tener. Lo que hay es un conjunto de fuentes parciales con propiedades incompatibles entre sí:

- **Regímenes de licencia distintos.** SERTIT tiene condiciones no comerciales; Copernicus y el Charter están sin verificar; los derivados de datosdelterremoto.org son CC BY 4.0 pero los crudos que agrega conservan la licencia de origen.
- **Fechas de observación distintas.** Una clasificación por teledetección del 14/08 y una inspección municipal del 02/09 describen el mismo edificio en momentos diferentes del proceso de demolición.
- **Métodos de fiabilidad distinta.** Teledetección, inspección presencial y reporte ciudadano no son sustituibles entre sí.
- **Contradicciones.** Dos fuentes discreparán sobre el mismo sitio, y esa discrepancia es información, no ruido.

Un único `damage_level` obliga a resolver todo eso durante la ingesta, en silencio, sin registrar quién dijo qué ni con qué método. Y produce la afirmación que el PRD §5 prohíbe explícitamente: que el sistema *sabe* que el edificio está destruido.

---

## Decisión

El daño se modela como **evidencia acumulada por sitio**, no como atributo del sitio. Una tabla `core.damage_evidence` guarda una fila por observación, con `source` (quién nos la entregó) separado de `original_source` (quién la produjo), su `source_license`, `observation_date` separada de `acquisition_date`, `method`, `confidence` e `is_synthetic`.

El pipeline gana una etapa previa a todo lo demás:

```text
evidencia → fusión → confianza de daño → oportunidad → restricciones → scoring → optimización
```

El contrato del SRS §6 **no se retira**: pasa a ser el contrato del adaptador de inspección municipal, la fuente de máxima confianza. Deja de ser el único modelo de daño del sistema.

---

## Consecuencias

El sistema nunca afirma un estado de daño: presenta la evidencia que lo sustenta, con método y fecha, y una confianza derivada de su concordancia. Eso convierte la explicabilidad del PRD §24 en algo que también aplica al insumo, no solo a la salida.

La licencia se resuelve **por observación**, que es lo que hace viable el Tier B de `fuentes.md`. Una evidencia `NON_COMMERCIAL` puede contribuir a la confianza de daño y aparecer citada, mientras el control de perfil de export impide redistribuirla. Con un `damage_level` consolidado eso era imposible: el sitio entero quedaba contaminado por su fuente más restrictiva.

La sustitución de CON-01 deja de ser un evento de migración. El dataset municipal real entra como filas nuevas con `method = 'inspección'` y confianza alta, y la fusión reordena sola. `FR-DC-02` se mantiene intacto — el adaptador sigue siendo el único punto de cambio.

`FR-SYN-04` y `FR-SYN-06` se vuelven más fáciles de cumplir, no más difíciles: `is_synthetic` vive en la observación, así que un sitio con evidencia mixta se describe con precisión en lugar de forzar una etiqueta global. Es literalmente lo que `FR-SYN-05` pide.

**El costo:** una tabla y una etapa de pipeline más, y una función de fusión que hay que diseñar, documentar y versionar como cualquier otra decisión metodológica. `FR-QUAL-01` gana un driver nuevo (concordancia de evidencia) y `FR-DEG-01` gana un caso nuevo (sitio sin ninguna evidencia de daño).

**El riesgo que introduce:** fuentes no independientes. Copernicus y SERTIT pueden estar clasificando las mismas imágenes satelitales. Contarlas como dos confirmaciones independientes infla la confianza justo donde menos evidencia real hay — es el mismo patrón que R5, una conclusión invertida y no un ruido. La función de fusión tiene que modelar la independencia explícitamente; queda como OI-F7.

---

## Alternativas rechazadas

**Mantener el contrato del SRS §6 y consolidar en la ingesta.** Más simple, y descarta en el momento de escribir lo único que hace defendible el sistema: la trazabilidad de por qué creemos que un sitio está dañado. La consolidación no desaparece — se mueve a un sitio donde es visible, versionada y revisable.

**Una columna `sources[]` sobre el sitio.** Registra la procedencia sin registrar el desacuerdo. No permite fechas de observación distintas por fuente, ni confianzas distintas por método, ni bloqueo de export por licencia de una observación concreta. Es el 20% del beneficio por el 80% del cambio.

**Aplazarlo hasta que llegue el dataset municipal real.** Es la opción que parece prudente y no lo es: significa construir features, scores y exports sobre un modelo que sabemos incorrecto, y rehacerlos cuando llegue el dato real. El momento barato de este cambio es ahora, antes de M2, cuando no hay nada encima.
