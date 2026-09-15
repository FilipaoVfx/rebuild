# ADR-18 — Se retira la capa de amenaza del SGC, y la procedencia se sella por fuente

**Estado:** aceptada
**Fecha:** 2026-09-15
**Documentos padre:** `fuentes.md` §2, §6, §10, §11; SRS `FR-DEG-01`, `FR-CONS-01`
**Cierra:** OI-F2 (licencia del SGC sin auditar)
**Relacionada:** ADR-16 (evidencia multifuente), ADR-17 (prohibición de datos sintéticos)

---

## Contexto

La auditoría de `fuentes.md` §10 dejó al SGC en `UNCLEAR`, y la regla del
proyecto es que **una fuente `UNCLEAR` no alimenta nada** (control C1). Aun
así, su capa de amenaza sísmica alimentaba `risk_score` y se publicaba en el
sitio. Tres fallos encadenados lo hicieron posible, y ninguno es del SGC.

**1. La procedencia se sellaba por corrida, no por fuente.** `load_context_layers`
publicaba **una** `dataset_version` bajo `microsoft_buildings` y estampaba con
ella cuatro capas de tres orígenes distintos: huellas de Microsoft, población
derivada, uso de suelo de OSM y la zona de amenaza del SGC. En la base, la
amenaza del SGC figuraba como dato de Microsoft.

**2. Por eso la puerta de publicación no podía verla.** La puerta resuelve las
fuentes que contribuyen y bloquea si alguna no permite redistribución. Nunca
vio al SGC: preguntaba por versiones y la del SGC no existía. Es la misma
forma de fallo que ya se corrigió una vez —SERTIT pasando escondido detrás de
su agregador— reaparecida por otra vía.

**3. La ausencia de dato se leía como el mejor valor posible.** El motor de
features envolvía el riesgo en `COALESCE(..., 0)` y el evaluador de
restricciones hacía `float(features.get("risk_score") or 0)`. Sin capa de
riesgo, cada sitio habría puntuado **riesgo cero** —el valor más favorable—
y ninguna restricción de riesgo habría excluido a nadie, en silencio.

Cerrada la auditoría, los términos del portal del SGC dicen, verbatim:

> «Ningún contenido de este sitio puede ser copiado, reproducido, recopilado,
> cargado, publicado, transmitido, distribuido, o utilizado para la creación
> de servicios derivados […] sin su consentimiento previo por escrito»

y el permiso que otorgan es «únicamente en su equipo y para su uso personal y
no comercial». Es la misma forma que ICube-SERTIT. Copia archivada en
`db/terms/sgc_terminos_20260915.txt`.

El propio texto admite que «cualquier material […] con sus propios términos de
licencia […] se rige por dichos términos»: un dataset del SGC que declare su
licencia se rige por ella. La capa de amenaza que usábamos **no declara
ninguna**, así que la cubre la cláusula general.

## Decisión

**1. La capa del SGC se retira del pipeline.** Ni se ingiere ni se publica.
`core.risk_zone` queda vacía y `risk_score` nulo. El extracto
`db/seed/sgc_amenaza_pereira.json` se borra del repositorio: archivarlo en un
repositorio público era ya redistribuirlo.

**2. `sgc` se reclasifica** de `UNCLEAR` a `NON_COMMERCIAL` con
`redistribution_allowed = false`, `derivatives_allowed = false`, y la cita
verbatim con su copia archivada. Baja a Tier C.

**3. Una `dataset_version` por fuente.** Cada capa se sella con la versión de
quien la produjo: huellas y población con Microsoft, uso de suelo con OSM.

**4. Una sola definición de "qué alimenta el resultado".**
`CONTRIBUTING_SOURCES_SQL`, en `contracts`, resuelve las fuentes
contribuyentes siguiendo la `data_version` de cada tabla publicable **y** el
`original_source` de la evidencia. La puerta de publicación, el panel de
procedencia y el diagnóstico de señal la comparten. Tres listas escritas a
mano se desincronizan, y la que se queda corta es la que deja pasar una fuente
sin evaluar.

**5. Un riesgo desconocido es desconocido, no cero.** Se quitan el `COALESCE`
y el `or 0`. Sin dato, la exclusión por riesgo prohibido, la penalización por
riesgo moderado y el tope de riesgo por tipo de intervención **se saltan y se
declaran**, igual que ya hacía la compatibilidad de uso de suelo.

**6. El riesgo deja de ser dependencia bloqueante** (`FR-DEG-01`). Lo era
cuando había una capa; sin ninguna, bloquear el pipeline solo obligaría a
rellenarla, que es lo que ADR-17 prohíbe.

**7. El control de "riesgo máximo" desaparece del visor**, junto con la capa
del mapa. Un deslizador que no filtra nada es del mismo tipo que una barra en
cero sobre un dato que no existe. En la tabla, `risk_score` y
`social_vulnerability` se muestran como **`sin fuente`**, no como `—` ni como
una barra vacía: el cero es el valor más favorable en ambas escalas.

## Consecuencias

**El resultado no cambia, y eso es lo que prueba el argumento.** Antes y
después: 115 sitios, 105 candidatos, 19 proyectos, 5,19 MM COP, 87.715
personas. `risk_score` valía 0,28 en los 115 sitios —el SGC publica un valor
por municipio, no microzonificación (D6)— con umbral de exclusión en 0,75 y
penalización desde 0,30. No excluía ni penalizaba a nadie. Se retiró una
fuente conflictiva sin perder una sola decisión.

**La tabla de cobertura decía lo contrario.** `risk` figuraba al 100 %, y eso
se lee como una feature sana. Por eso `signal_check.py` reporta ahora
**valores distintos** junto a la cobertura: 115/115 con un solo valor es
cobertura completa y cero información.

**Queda una puerta que sí muerde.** Con la procedencia sellada por fuente,
`build_static.py --profile PUBLIC` bloqueó la publicación nombrando
`sgc (UNCLEAR)` — el control funcionando por primera vez sobre esta fuente.

**Si llega la microzonificación** (D6), entra como fuente nueva con su propia
auditoría. La reclasificación del SGC no es permanente: «sin consentimiento
previo por escrito» describe una vía abierta, igual que con SERTIT. Pedirlo
es un correo.

## Nota aparte: Microsoft Building Footprints es share-alike

Encontrado al revisar el registro: `microsoft_buildings` declaraba
`license_name = "ODbL"` y `share_alike = True`, pero
`license_class = ATTRIBUTION`, mientras `osm` —**la misma licencia**— estaba
en `SHARE_ALIKE`. La clase es lo que lee la puerta de perfiles, así que la
obligación de compartir igual pasaba sin aplicarse. Corregido a `SHARE_ALIKE`,
con una prueba que exige que toda fuente cuyo `license_name` contenga `ODbL`
se clasifique igual.

## Alternativas descartadas

**Mantener la capa solo en el perfil `INTERNAL`.** Los términos del SGC
permiten uso personal en el equipo propio, así que sería defendible. Se
descarta porque el riesgo pasaría a comportarse distinto entre despliegues:
una restricción dura que excluye sitios en interno y no en público produce dos
rankings que no coinciden, que es el desdoblamiento que ADR-17 acaba de
cerrar. Y el valor analítico de mantenerla es, medido, cero.

**Dejarla y clasificarla `NON_COMMERCIAL` sin más.** El piloto es de una
alcaldía: uso institucional, no comercial. Pero `redistribution_allowed =
false` es independiente de lo comercial, y publicar el sitio es redistribuir.
La puerta seguiría bloqueando la publicación, con la capa aportando cero.

**Sustituirla por un valor NSR-10 escrito a mano.** Es la constante 0,28 sin
la fuente. Un número sin procedencia que además no ordena nada.
