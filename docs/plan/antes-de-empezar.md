# Antes de empezar a desarrollar

**Lo que hay que saber, decidir o verificar antes del primer commit de código.**
Ordenado por cuánto puede hundir el proyecto, no por cuándo toca hacerlo.

Las secciones 1 a 4 salen de haber ido a buscar los datos reales, no de leer los documentos. Cambian premisas del PRD.

---

## 1. El sismo no fue en Pereira

El PRD, el SRS y el ARD describen el caso como "Pereira — recuperación tras el sismo del 10 de agosto de 2026". Los datos del evento dicen otra cosa.

| | |
|---|---|
| **Epicentro** | 2 km al SE de San José del Palmar, **Chocó** |
| **Magnitud** | 7,4 |
| **Fecha** | 2026-08-10 |
| **Identificadores** | USGS `us6000tjl2` · GDACS `EQ1557236` · GLIDE `EQ-2026-000146-COL` · Copernicus `EMSR916` |
| **Alcance** | 409 municipios en 16 departamentos |
| **Registro oficial (RUD, corte 2026-09-11)** | 364.670 familias · 778.279 personas · 19.142 viviendas destruidas · 119.752 averiadas |

Pereira es un municipio afectado dentro de un evento regional, no la ciudad del desastre. Eso no invalida el producto —Pereira sigue siendo un caso legítimo y acotado— pero sí invalida dos cosas que están escritas:

- **El framing.** Presentar esto a una contraparte institucional como "la plataforma de recuperación del sismo de Pereira" es una afirmación que cualquiera con el dato del epicentro desmonta en la primera reunión.
- **La escala.** El `NFR-SCALE-01` fija un volumen de referencia de ~1.500 sitios. Lo que hay documentado en Pereira, hoy, es un orden de magnitud menor (§2).

Hay además un **segundo evento** en los datos: el código `EQ20260822COL` aparece junto a `EQ20260810COL`. Algo pasó el 22 de agosto. Hay que saber qué antes de modelar "el sismo" como un evento único, porque el daño observado puede ser acumulado de dos.

---

## 2. Los datos de daño de Pereira son 252 puntos en 2,6 km²

Esto es lo que existe hoy, verificado descargando los archivos:

| Fuente | Cobertura en Pereira | Geometría | Método |
|---|---|---|---|
| **ICube-SERTIT** | **252 estructuras**, todas residenciales | **Punto** | Foto-interpretación, Pléiades |
| **Copernicus EMS (EMSR916)** | 182 edificios afectados (cifra agregada) | — | Rapid mapping |
| **UNOSAT** | **0** — no cubre Pereira | Punto | Pléiades, "*Not yet field validated*" |

Clasificación SERTIT en Pereira: 121 `Damaged`, 85 `Possibly damaged`, 46 `Destroyed`.

**El dato que más cambia el plan:** el AOI de SERTIT en Pereira va de -75,7022 a -75,6855 en longitud y de 4,8021 a 4,8146 en latitud. Son **1,85 × 1,39 km, unos 2,6 km²**. No es la ciudad: es un sector.

Y a escala nacional el monitor lo cuantifica: **9.329.268 personas expuestas a intensidad MMI ≥ 6, de las cuales 1.040.000 caen dentro de los AOIs de Copernicus. El 11,1%.** El otro 89% no tiene mapeo satelital de daño.

Tres consecuencias directas:

1. **La cobertura satelital no es el daño.** Es dónde alguien apuntó un satélite. Construir "sitios de oportunidad de Pereira" sobre ella produce una recuperación concentrada en el sector que se fotografió, y el sistema no tendrá forma de saber que eso pasó. Es el mismo error que R5, en la capa de entrada.
2. **El volumen de referencia hay que rehacerlo.** Con ~250-450 sitios el optimizador greedy, el presupuesto de batch y `NFR-PERF-04` cambian de tamaño. Casi todo se vuelve más fácil, pero los números medidos contra 1.500 sitios no dicen nada.
3. **La fuente de daño con cobertura real es el RUD**, no el satélite.

---

## 3. La fuente de daño real es un registro de personas

El **Registro Único de Damnificados** (`rud.gestiondelriesgo.gov.co`, UNGRD) es lo único con cobertura de los 409 municipios: familias, personas, viviendas destruidas y averiadas.

Y es, literalmente, **un registro de personas damnificadas**.

`CON-04` dice cero PII en la base analítica. `FR-PII-01` lo implementa comparando **nombres de columna** contra un diccionario: nombre, cédula, teléfono, email, dirección. Ese test pasa en verde sobre un dataset de hogares damnificados geolocalizados, porque el problema no está en los nombres de las columnas.

**La geometría es el identificador.** Un punto a nivel de estructura + `dano = 'Destroyed'` + un catastro público consultable = un hogar concreto y su situación tras el desastre. Ley 1581 protege datos de personas identificables, no columnas con ciertos nombres.

Hay que decidir, antes de escribir el adaptador:

- **La unidad geométrica mínima a la que se publica daño real.** Manzana es defendible; predio o estructura, no.
- **Si el RUD entra agregado o no entra.** Agregado por manzana con el umbral de `FR-PII-03` es viable. Fila por familia no lo es, bajo ninguna justificación.
- **Que el test de PII deje de ser solo léxico.** Un chequeo de nombres de columna no detecta reidentificación geométrica. Hay que añadir una regla sobre la unidad espacial mínima de toda capa que describa daño o vulnerabilidad.

El ARD ya lo intuyó: ADR-14 dice "REVISIT si entra daño real con riesgo residual de reidentificación". Entra. Es hora de revisitar.

---

## 4. El contrato congelado no encaja con el dato real

`SRS §6` exige `Polygon/MultiPolygon`. SERTIT y UNOSAT entregan **puntos**. El contrato se congeló contra una idea de cómo serían los datos, y los datos ya existen y son distintos.

Y los vocabularios no coinciden entre sí:

```text
SERTIT   dano : Damaged · Destroyed · Possibly damaged · Not Applicable
UNOSAT   dano : Damage · Damaged · Possible Damage
         confianza : Medium · To Be Evaluated · Uncertain
         validacion_campo : Not yet field validated
```

"Damage" y "Damaged" conviven en el mismo campo de UNOSAT. Nadie va a normalizar eso por accidente.

Qué hacer antes de M0:

- **Descongelar el contrato el tiempo justo para admitir geometría de punto** con un campo de precisión posicional, y volver a congelarlo. Un adaptador que no puede adaptar es el modo de fallo más caro de `FR-DC-02`.
- **Escribir el crosswalk de clases de daño** como configuración versionada, no como un `CASE WHEN` dentro del adaptador. Es una decisión metodológica y va a cambiar.
- **Guardar `validacion_campo` y `metodo`.** Todo lo satelital de hoy es foto-interpretación sin validación de campo. Eso es exactamente lo que ADR-16 modela como confianza por observación, y es la diferencia entre "un edificio está destruido" y "alguien interpretó una imagen Pléiades del 11 de agosto".

---

## 5. Puedes terminar el MVP entero y no haber demostrado nada

Todo corre sobre daño sintético. El generador se convierte, sin que nadie lo decida, en la especificación de cómo es la realidad. Si su estructura espacial es plausible pero equivocada, todas las features, scores y portafolios quedan afinados contra una ficción, y el ajuste es invisible porque no hay contra qué contrastarlo.

La trampa concreta, y casi inevitable: alguien mira el ranking sobre datos sintéticos, piensa "esto no tiene sentido", y **toca los pesos hasta que lo tenga**. En ese momento el sistema aprendió el generador, no el territorio.

La regla, escrita antes de empezar: **los pesos se fijan por elicitación con expertos antes de ver ningún resultado**, se congelan con versión, y no se tocan mirando salidas sintéticas. Si hay que cambiarlos, se cambian contra evidencia real o contra un argumento de política explícito y firmado.

Ahora hay una alternativa mejor que la sintética pura: calibrar el generador contra los 252 puntos reales de SERTIT en Pereira. Sigue siendo un sector, pero es estructura espacial observada en lugar de inventada.

> **Actualización (2026-09-15, [ADR-17](../adr/ADR-17-prohibicion-de-datos-sinteticos.md)).** Ni una ni otra: el generador se retiró por completo y la base prohíbe `is_synthetic = true`. La calibración se evaluó y se descartó — un generador calibrado sobre un sector sigue siendo la especificación implícita de cómo es la realidad fuera de él. La regla sobre los pesos **se mantiene y se endurece**: ya no hay generador que aprender, pero el 67,2 % del score proviene de un reparto dasimétrico que asume densidad uniforme por área construida, y afinar los pesos mirando el ranking enseña al sistema ese supuesto.

---

## 6. El camino crítico es institucional, no técnico

Mira qué bloquea de verdad: la capa de POT de AMCO, la microzonificación, las licencias sin verificar, el acceso al RUD, quién firma el estándar de espacio público, quién fija los pesos. Nada de eso se acelera contratando otro ingeniero. Son semanas de oficios y reuniones, y **se pueden pedir todas en paralelo desde el día uno**.

La semana 1 no es de código: es de solicitudes enviadas. Empezar por las migraciones es llegar a la semana 6 bloqueado esperando lo que podía haberse pedido en la semana 1.

---

## 7. Los pesos son política urbana disfrazada de configuración

`w1·Necesidad + w2·Accesibilidad + w3·Déficit + w4·Vulnerabilidad − w7·Riesgo`

Decidir que equidad pesa 25% y no 40% es una decisión de política pública de reconstrucción. Si los pone el equipo técnico, el equipo técnico está haciendo política urbana sin mandato, y la primera pregunta seria en una revisión institucional —"¿por qué este reparto?"— se queda sin respuesta.

Hace falta un dueño institucional de los pesos por defecto y un acta del proceso de elicitación. No es trabajo de ingeniería y aun así bloquea el entregable.

---

## 8. La microzonificación sísmica de Pereira puede no existir como capa

`risk_score` es una feature **bloqueante**: sin ella el sistema se detiene (`FR-DEG-01`). Lo que hay publicado en los geoservicios del SGC es amenaza sísmica **nacional** por periodo de retorno, a escalas pensadas para normativa sismo-resistente, no para decidir sobre un predio. La zonificación de movimientos en masa publicada como servicio cubre otra región del país, no Risaralda.

Lo que aparece como microzonificación de Pereira es literatura académica en repositorio universitario, en PDF. Eso no es una capa que se pueda ingerir.

Antes de M0 hay que saber si existe una microzonificación oficial de Pereira en formato geoespacial y quién la custodia —probablemente AMCO o la alcaldía, no el SGC—. Si no existe, `risk_score` se degrada a amenaza nacional interpolada, y eso hay que decirlo en cada salida en lugar de dejar que parezca una evaluación de riesgo a nivel de sitio.

---

## 9. El calendario

Hoy es 13 de septiembre de 2026. El sismo fue hace cinco semanas. El plan de ~18 semanas entrega a finales de enero de 2027, casi seis meses después del evento, y las demoliciones no van a esperar.

Son dos productos distintos, y no se llega al primero recortando el segundo:

- **Informar decisiones que se toman ahora** → 4-6 semanas, datos peores, alcance mucho menor: sitios, riesgo, uso de suelo, población, un ranking crudo. Sin optimizador, sin escenarios, sin visor.
- **Configurar la fase de reconstrucción** → el plan tal como está.

Es la primera pregunta que hay que responder, antes de escribir una migración.

---

## Lo que sí está verificado y no hay que volver a mirar

- **Supabase tiene el stack completo**: `postgis 3.3.7`, `pgrouting 3.4.1`, `pgmq 1.5.1`, `pg_cron 1.6.4`, `pgaudit 17.1`, `pgtap 1.3.3`. ADR-02, ADR-04 y ADR-07 se sostienen. Ojo: las versiones van por detrás de upstream y el catálogo lo fija Supabase, no nosotros.
- **El SGC publica WFS 2.0.0 real**, no solo imágenes. Detalles y rutas exactas en [conexiones.md](./conexiones.md).
- **Datos.gov.co tiene API de catálogo y de recurso operativas**, con 441 datasets que mencionan Pereira.
- **datosdelterremoto.org existe, publica y declara CC BY 4.0 sobre derivados.** Los archivos se descargan sin fricción y traen `copyright` por registro — `© ICube-SERTIT 2026` en el caso de SERTIT, que confirma que la restricción de licencia viaja con el dato.

---

## Decisiones que hay que tomar, con dueño

| # | Decisión | Bloquea | Dueño |
|---|---|---|---|
| D1 | ¿Producto para decisiones de ahora, o para la reconstrucción? | Todo el plan | Producto |
| D2 | Unidad geométrica mínima para publicar daño real | Contrato, generador, features | Producto + Legal |
| D3 | ¿El RUD entra agregado, o no entra? | M1, `CON-04` | Producto + Legal |
| D4 | Volumen de referencia real de Pereira (`NFR-SCALE-01`) | Todas las mediciones de rendimiento | GIS |
| D5 | Descongelar el contrato para admitir geometría de punto | M0 | Backend + GIS |
| D6 | ¿Existe microzonificación oficial de Pereira como capa? — **Sí** (2026-09-24): IDE AMCO la publica, en dos versiones; licencia sin declarar (ADR-26) | `risk_score`, que es bloqueante | GIS |
| D7 | Dueño institucional de los pesos por defecto | M4, credibilidad del piloto | Institución |
| D8 | Qué fue el evento del 22 de agosto (`EQ20260822COL`) | Modelo del evento | Datos |
