# ADR-24 — Las fotos de campo son evidencia visual, y su enlace al sitio se declara

**Estado:** aceptada
**Fecha:** 2026-09-19 (escrita el 2026-09-24)
**Continúa:** [ADR-16](ADR-16-evidencia-de-dano-multifuente.md) (el daño es
evidencia acumulada), [ADR-19](ADR-19-cambio-satelital-no-es-dano.md) (lo que se
mide se llama como se mide)
**Gobernada por:** [`URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md`](../URBAN_RECOVERY_ONTOLOGY_MANIFESTO.md)
§24–§26
**Origen:** requerimiento del dueño del repositorio

---

> **Nota sobre la fecha.** La decisión se tomó y se implementó el 2026-09-19. El
> código la cita diez veces —`.env.example`, `.gitignore`, migración 011,
> `pipeline.py`, `registry.py`, el adaptador de `pereiramap`,
> `build_static.py`, `browser_check.py` y `schemas.py`— y el archivo nunca se
> escribió. Durante cinco días la decisión vivió en el código y no en el corpus,
> que es exactamente lo que el corpus existe para impedir. Se escribe ahora, con
> lo implementado y con lo que falta.

## Contexto

Toda la evidencia de daño del sistema son **182 observaciones de
foto-interpretación satelital** de Copernicus EMS sobre un sector. Nadie ha
pisado el terreno. [ADR-19](ADR-19-cambio-satelital-no-es-dano.md) fijó que un
cambio de reflectancia no es daño y que la teledetección no se promueve sola;
[ADR-16](ADR-16-evidencia-de-dano-multifuente.md) dejó el hueco abierto para que
entre evidencia de mayor confianza.

`pereiramap` es una aplicación de campo cuyas fotos se leen desde una vista
pública de Supabase. Cada foto tiene ubicación y hora. Su valor no es
estadístico —son pocas— sino de dos tipos: **respalda con imagen lo que las
cifras dicen de un lugar**, y **muestra daño donde el satélite no vio ninguno**.

El manifiesto, §24, sitúa esto en la ontología como capa sensora:

```
RECOVERY OPPORTUNITY → FIELD MISSION → FIELD OBSERVATION → EVIDENCE ASSET
→ SPATIAL MATCH → EVIDENCE ASSESSMENT → FEATURE UPDATE → OPPORTUNITY UPDATE
```

Y añade la restricción que gobierna todo lo demás: *«The PWA observes, documents,
locates and validates evidence. It does not autonomously decide.»*

## Decisión

### 1. La foto es evidencia visual, no insumo del modelo

`rebuild_core.field_observation` no alimenta ninguna feature ni entra al
scoring. Una foto no mueve un puntaje. Si mañana la evidencia de campo debe
contribuir a la confianza de daño, entra por `damage_evidence` con su
`method`, como cualquier otra fuente (ADR-16) — no por esta puerta.

### 2. Sin datos personales por construcción, y con revisión humana encima

La aplicación no pide nombre, no admite texto libre, sube la imagen **sin EXIF**
y la vista pública de la que se lee no expone el identificador del dispositivo.
Eso cubre lo que el sistema controla.

Lo que puede aparecer *dentro* de una foto —una cara, una placa, el número de
una casa— no lo resuelve el esquema: lo resuelve una persona. `review_status`
viaja con la fila (`PENDIENTE` | `APROBADA`, cerrado por `CHECK`) y **el paquete
`PUBLIC` solo copia `APROBADA`**. Una foto sin revisar existe en la base y no
sale publicada.

### 3. El enlace al sitio es espacial, recalculado y acotado

Cada foto se enlaza al sitio más cercano a **≤ 75 m** (`FIELD_LINK_M`).
`site_id` no lleva clave foránea a propósito: `derive_sites` recrea los sitios
en cada corrida y el enlace se recalcula después con
`link_field_observations`.

### 4. Lo que no se enlaza se declara, no se esconde

Las fotos que quedan fuera del radio levantan la alerta `FIELD_UNLINKED`. No son
un residuo: **son la parte del daño que el satélite no vio**, que es justamente
el aporte de esta fuente.

### 5. La procedencia de la ubicación viaja con la foto

`location_source` (`DEVICE` | `EXIF` | `MANUAL`, cerrado por `CHECK`),
`accuracy_m`, `heading_deg`, `exif_gps` y `exif_device_offset_m`. Una ubicación
de 4 m de precisión y una de 60 m no son el mismo dato, y el esquema no las
confunde.

### 6. El emparejamiento gana estado y rastro — lo que faltaba

Los puntos 1 a 5 describen lo implementado el 2026-09-19. Este punto es nuevo, y
sale de contrastar esa implementación con el manifiesto §25 y §26.

**El hueco.** El manifiesto es explícito:

> `GPS LOCATION ≠ BUILDING` — GPS genera candidatos. Estados posibles:
> `CANDIDATE`, `CONFIRMED`, `REJECTED`, `AMBIGUOUS`, `UNDETERMINABLE`.
> *If uncertain: do not force a relationship.*

La implementación **fuerza la relación**. `LINK_SQL` ordena por distancia y toma
`LIMIT 1`: una foto a 40 m del sitio A y a 45 m del sitio B se convierte en del
sitio A, en silencio, sin que nada registre que hubo duda. Es la misma forma de
fallo que [ADR-18](ADR-18-retirada-de-la-capa-del-sgc.md) corrigió con el
`COALESCE(risk, 0)`: allí la ausencia se leía como el valor más favorable, aquí
la ambigüedad se lee como certeza.

Y §26 exige conservar `entity_id`, `distance_m`, `method`, `match_score`,
`algorithm_version`, `operator_confirmation` y `timestamp`. Hay dos de siete:
`site_id` y `site_distance_m`.

**La decisión.** El emparejamiento pasa a registrar:

- `match_status`, estado cerrado por `CHECK`: `LINKED` | `AMBIGUOUS` |
  `UNLINKED`. `CONFIRMED` y `REJECTED` del manifiesto **no se implementan
  todavía** y no se declaran alcanzables: exigen confirmación de un operador, y
  el sistema no tiene ruta de escritura (CON-05, `SALIDA CONSULTIVA`). Un estado
  que nadie puede alcanzar es peor que su ausencia.
- `match_method` y `match_version`, para que un cambio de criterio sea visible.
- `runner_up_distance_m`: la distancia al segundo candidato. Es lo que vuelve
  detectable la ambigüedad sin guardar una tabla de candidatos.
- `AMBIGUOUS` cuando el segundo candidato está dentro del margen. Una foto
  ambigua **se muestra con su duda declarada**, no colgada del sitio equivocado.

Esto cumple ADR-25 §2: estado cerrado donde hoy hay una asignación implícita.

## Consecuencias

**El visor puede decir por qué.** `PhotoStrip` muestra las fotos del sitio y la
ficha declara cuántas hay aunque sean cero. Con el punto 6, además, puede
responder la pregunta que el manifiesto §26 pone como prueba: *«¿por qué se
asoció esta fotografía a este edificio?»*.

**Las imágenes no se versionan.** `data/field/` está en `.gitignore`: son copias
reconstruibles desde la vista pública en cada corrida, con su `image_sha256` en
la fila. Mismo criterio que las escenas Sentinel.

**El paso se omite entero sin credenciales.** Sin `URI_FIELD_URL` y
`URI_FIELD_KEY` el pipeline no falla: declara que la fuente no está. Es
coherente con [ADR-18 §6](ADR-18-retirada-de-la-capa-del-sgc.md) — una fuente
ausente degrada y se declara, no bloquea.

**Lo que este ADR no autoriza.** No hay misión de campo, ni asignación de
responsable, ni confirmación de operador, ni actualización de features desde el
terreno. El manifiesto §24 describe la cadena completa; esto implementa sus tres
primeros eslabones y deja los demás para cuando exista ruta de escritura.

## Alternativas rechazadas

**Que la foto contribuya a la confianza de daño.** Es el destino natural y se
descarta ahora por orden: primero hay que saber *a qué sitio pertenece* con un
estado auditable. Una foto mal emparejada que además mueve un puntaje es
[ADR-18](ADR-18-retirada-de-la-capa-del-sgc.md) otra vez, con imagen.

**Guardar una tabla de candidatos por foto.** Cumple §26 al pie de la letra.
Se descarta por proporción: con el volumen actual, la distancia al segundo
candidato detecta la ambigüedad al mismo coste de una columna. Si aparece
confirmación de operador, la tabla se justifica; hoy no.

**Clave foránea de `site_id` a `site`.** Obligaría a reordenar el pipeline
alrededor de una tabla que se recrea en cada corrida. El enlace es derivado y se
recalcula; tratarlo como integridad referencial confunde un cálculo con un
hecho.

**Publicar toda foto y filtrar en la interfaz.** Un filtro de interfaz no es un
control de privacidad: la publicación es el paquete estático, y lo que entra al
paquete está publicado aunque ninguna pantalla lo enseñe. Por eso el filtro está
en `build_static.py`, no en el visor.
