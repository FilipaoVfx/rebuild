# Hallazgos y plan de acción — revisión externa del diseño de Codex y auditoría del corpus de ADR

**Fecha:** 2026-09-23 · **Rama:** `codex/recovery` · **Medido, no estimado.**

Este documento cierra tres preguntas abiertas:

1. La **segunda opinión externa** que la sesión de `/office-hours` del 2026-09-19
   no pudo ejecutar. El registro lo deja escrito:
   `codex-recovery-reviews.jsonl` marca `outside_provider: claude-code`,
   `outside_status: unavailable`, `summary: "Claude Code stdin EPERM"`. El
   diseño se declara `APPROVED` habiendo convergido solo con la revisión
   in-host.
2. La **auditoría del corpus de ADR**, a pedido del dueño, bajo la sospecha de
   que algunas reglas limitan el desarrollo de producto más de lo que su
   argumento sostiene.
3. La pregunta de **si la licencia de una fuente es imprescindible para usarla**,
   o existen alternativas.

Las verificaciones hechas para escribirlo están en §6, reproducibles.

---

## 0. Resumen ejecutivo

| # | Acción | Desbloquea | Esfuerzo | Depende de |
|---|---|---|---|---|
| **P1** | Derecho de petición a SIGPER por `ReporteEdificaciones300826` | 7.697 inspecciones de campo, 4.543 dentro del AOI | 1 h | — |
| **P2** | Derecho de petición a SIGPER por la ortofoto municipal del 14-ago-2026 | La imagen más valiosa que existe para este producto | 1 h | — |
| **P3** | Registrar credenciales CDSE (gratuitas) | Todo ADR-19: pipeline completo que nunca ha corrido | 30 min | — |
| **P4** | Correo al SGC pidiendo consentimiento previo por escrito | Capa de amenaza / eje de riesgo | 1 h | — |
| **P5** | Verificar titularidad de la ortofoto IGAC | Segunda ortofoto; es pregunta de hecho, no de permiso | 2 h | — |
| **E1** | Esquema `rebuild_sandbox` sin `CHECK`, no publicable (enmienda ADR-17) | Maquetar interfaz de fuentes aún no disponibles | 1 día | — |
| **E2** | El control C1 deja de bloquear la **ingesta** a sandbox (enmienda ADR-18 / `fuentes.md`) | Validar el mapeo EDAM y medir el delta del ranking sin publicar nada | 1 día | E1 |
| **E3** | ADR-19 §6: degradar y declarar en vez de detener el pipeline | Robustez; coherencia con ADR-18 §6 | 2 h | — |
| **E4** | ADR-20: exponer intervenciones alternativas dentro de la ficha | Responde "¿y qué más cabría aquí?"; ya está calculado | 1 día | — |
| **E5** | ADR-16: matizar "el sistema nunca afirma un estado de daño" | Evita que la regla pelee contra EDAM | 2 h | Antes de P1 |
| **R1** | Cerrar ADR-15 como histórico; el criterio de admisión nombra el **rol** | Cualquier superficie para productor/validador/integrador | 2 h | — |
| **R2** | Sacar el inventario de vistas de los ADR | Iterar la UI sin enmendar un ADR cada vez | 2 h | — |
| **R3** | Atar `DEFAULT_MIN_SUITABILITY = 64` a la versión de scoring | Evita que el umbral cambie de significado en silencio | 1 h | — |

Las cinco acciones `P` no requieren tocar una línea de código ni un ADR.

---

## 1. Lo que limita el producto no son los ADR

El techo real es el AOI: **6,91 km²** del recuadro de Copernicus, 182
observaciones, y más de la mitad de la población fuera del alcance de *todos*
los candidatos. Ningún ADR impone eso — es la consecuencia de tener una sola
fuente de daño.

Los cuatro desbloqueos de mayor valor **no requieren cambiar ninguna decisión
de arquitectura**. Requieren enviar correos que los propios ADR dejan escritos:

| Desbloqueo | Bloqueado por | Estado |
|---|---|---|
| `pereira_edam` — 7.697 inspecciones, 4.543 en el AOI, validadas en campo, con habitabilidad y nivel de daño | ADR-23 §4: falta que SIGPER declare términos | **No enviado** |
| Ortofoto municipal del 14-ago-2026, cuatro días después del sismo | ADR-22 §6: no declara ni licencia ni productor | **No enviado** |
| Capa de amenaza / microzonificación | ADR-18: *«"sin consentimiento previo por escrito" describe una vía abierta. Pedirlo es un correo»* | **No enviado** |
| Sentinel-1/2 completo (ADR-19) | `CDSE_CLIENT_ID` y `CDSE_CLIENT_SECRET` **vacíos** en `.env` | **Sin credencial** |

> Hay más producto atascado en el buzón que en la gobernanza.

---

## 2. Revisión externa del diseño de Codex

Objeto: `docs/designs/recovery-informe-versionado-preparacion.md` (419 líneas,
estado `APPROVED`, generado por `/office-hours` el 2026-09-19).

### 2.1 Veredicto

**El diagnóstico es excelente y la prescripción no se sigue de él.** Codex
identifica correctamente que el problema es de producto y no de ingeniería, y
responde con más ingeniería: un sistema de publicación reproducible con JSON
Schema 2020-12, TAR determinista, índice de retractación y revisión editorial
por dos personas, para emitir un artefacto cuyo contenido informativo cabe en
un párrafo y cuya función declarada es conseguir una reunión.

Recomendación: **conservar el diagnóstico y las reglas editoriales, invertir la
secuencia.** Los diez contactos van primero; la máquina de publicación solo si
alguien pide algo citable.

### 2.2 El mecanismo central redescubre lo que el repositorio ya sabe

El corazón de la V1 es producir "la próxima solicitud de evidencia": agrupar
pares bloque-tema sin evidencia, ordenarlos por precedencia fija —validación de
campo primero— y dirigir la solicitud al "productor probable" según
`theme-owners-v1.csv`, donde se permite `UNKNOWN`.

El repositorio ya contiene esa respuesta, escrita **el día anterior** al diseño.
`docs/plan/cobertura-de-dano-ciudad.md` (research del 2026-09-18) documenta
`ReporteEdificaciones300826`: inspección EDAM edificio por edificio, corte
30-08-2026, **7.697 registros, 6.386 con coordenada, 4.543 dentro del AOI
actual**, con `HABITABILIDAD` y `NIVEL_DE_DAÑO` validados en campo, publicada en
el ArcGIS Online de la Alcaldía. Incluye el destinatario (`sigper@pereira.gov.co`),
la petición exacta, el tratamiento de PII, la unidad de publicación y la
consecuencia sobre el AOI.

**El diseño no la menciona ni una sola vez.** Verificado: cero coincidencias de
`EDAM`, `ArcGIS`, `habitabilidad`, `7.697`, `4.543` o `ReporteEdificaciones` en
las 419 líneas.

Su propia regla de precedencia pone *validación de campo* en primer lugar, y la
fuente que resuelve ese tema está identificada, cuantificada, dentro del AOI,
con dueño conocido y bloqueada por **una sola pregunta legal**. La V1 gastaría
semanas construyendo un instrumento para deducir, con menos precisión, una
conclusión ya escrita.

### 2.3 Dos de los seis temas requeridos son vacíos falsos

Los seis temas del ruleset son daño, población, infraestructura crítica, uso del
suelo, riesgo y validación de campo. El inventario V1 se restringe a cuatro
`source_id`: `copernicus_ems`, `dane_censo_2018` y dos fuentes de texto narrativo.

Pero según `docs/plan/estado-actual.md` ya están cargados y publicados:

- **uso del suelo** — OSM `landuse`, 219 polígonos
- **infraestructura crítica** — 58 equipamientos, 129 espacios verdes, estaciones de Megabús

Ambas pasan la puerta de licencia (`osm` es `SHARE_ALIKE`) y ya alimentan el
resultado publicado.

**Consecuencia:** la primera solicitud de evidencia pediría a una entidad
municipal datos que Recovery ya tiene cargados. En la audiencia exacta que el
informe busca, ese error se paga una sola vez.

### 2.4 Invierte su propio diagnóstico

La tabla de madurez marca **Usuario y demanda 2/10** y **Distribución y adopción
2/10**, y concluye que "la ingeniería central está por delante de la evidencia
de producto". Correcto. Y entonces hace de la construcción completa de la V1 un
**prerrequisito** del experimento de demanda.

Si la hipótesis es "nadie ha mirado esto todavía", el experimento barato es
enseñarlo. Acoplar las diez conversaciones al build hace que el costo del
aprendizaje sea máximo justo donde la incertidumbre es máxima.

### 2.5 El instrumento de acceso enumera públicamente los vacíos de la institución

GitHub Pages está habilitado y es **público** (verificado). La V1 publicaría,
durante una emergencia activa con 120.000 damnificados y la Alcaldía reportando
avances, un documento que lista qué evidencia falta y nombra la "entidad
probable" responsable de cada ausencia.

El documento nunca evalúa ese riesgo. Un artefacto cuya función es abrir puertas
puede cerrarlas. Secuencia correcta: privado primero, público después de la
primera revisión, y los `theme_owner` fuera de la versión pública.

### 2.6 La primera impresión sería la versión más pobre del producto

La V1 reduce el mapa a dos capas —AOI y bloques censales— sobre fondo neutro.
Y las métricas salen en rojo por construcción: cobertura temática 2/6,
validación **0 %** necesariamente (Copernicus es foto-interpretación y el propio
doc prohíbe elevarla a confirmación de campo), cobertura espacial bajo el 80 %.

La intención —no sobreafirmar— es correcta, pero ADR-22 y ADR-23 ya resolvieron
esa tensión sin amputar: mostrar lo que hay con sus límites rotulados.

### 2.7 Gobernanza: rompe la regla que él mismo escribió

Tres horas antes del diseño, el mismo agente commiteó `AGENTS.md`:

> *"Treat the PRD, SRS, ARD, and ADRs as the source of truth for product and
> architecture decisions."*

El diseño se declara `APPROVED` y deroga en la práctica ADR-20 (*la oportunidad
es la entidad central*), ADR-21, ADR-22 y ADR-23 —todas en estado "aceptada", la
última fechada un día antes— **sin escribir ningún ADR ni declarar supersesión.**

Asimetría adicional: el documento exige editor y revisor distintos antes de que
un informe pase a `PUBLISHED_CONDITIONED`, y se declara `APPROVED` a sí mismo
con la revisión externa caída.

### 2.8 El determinismo byte a byte es frágil donde lo pone

El criterio "una reconstrucción desde el mismo commit y versiones de datos
produce hashes idénticos" se apoya en `ST_Intersection` sobre geometrías DANE.
La salida depende de la versión de GEOS/PostGIS. Fallará en la próxima
actualización del entorno y parecerá un incidente de datos.

→ Fijar la versión del motor geométrico en el manifiesto, o congelar las
geometrías recortadas como entrada versionada.

### 2.9 Lo que se conserva intacto

El diagnóstico de fragilidad y sus seis mecanismos; la disciplina de numerador y
denominador visibles; los estados cerrados en vez de texto libre; la distinción
candidata/elegible; "un vacío no representa ausencia de necesidad"; los
disparadores explícitos hacia la fase B; el procedimiento de retractación que
separa error metodológico de incidente de privacidad; y la clasificación de
contactos *antes* del contacto, que impide reinterpretar después una señal débil
como validación. Es trabajo de primera categoría.

---

## 3. Auditoría del corpus de ADR

Nueve ADR, 1.137 líneas, leídos completos y contrastados con el código.

### 3.1 Intocables

| Regla | Por qué |
|---|---|
| **ADR-17 (núcleo)** — ninguna capa del pipeline puede ser sintética | La medición que lo justifica es letal: con otra semilla, el top-20 conservaba **3 de 20 sitios**. El orden era una propiedad del generador, no del territorio |
| **ADR-18 (licencias)** — el SGC se retira | Los términos son explícitos y están archivados verbatim en `db/terms/` |
| **ADR-22 §4** — la dirección a nivel de predio no existe en el sistema | Es justo lo que permite ingerir EDAM sin `DIRECCIÓN` ni `CODIGO_PREDIAL` |
| **ADR-20 regla 1** — `UNKNOWN` nunca colapsa a `OK` ni a `BLOCKED` | Nació de un `COALESCE(..., 0)` que puntuaba riesgo cero en los 115 sitios sin que nadie se enterara |
| **ADR-21 regla 3** — un eje cubierto puede no ordenar nada, y se declara | Lo mejor del corpus. Casi nadie lo hace |

### 3.2 Cinco enmiendas que desbloquean sin perder el invariante

**E1 · ADR-17 — falta un sandbox de diseño.**
La regla no distingue *publicación* de *diseño*: hoy no se puede maquetar la
interfaz de una fuente que aún no existe (EDAM, riesgo, POT) porque no se puede
poblar nada para verla.
→ Esquema `rebuild_sandbox` sin `CHECK`, que ni la API ni `build_static.py`
pueden leer, verificado por `import-linter` y la puerta de publicación. El
invariante que importa —*nada inventado llega a un resultado ni a una
publicación*— se conserva intacto. **El precedente ya existe:** ADR-22 §6 hace
exactamente esto con las ortofotos bloqueadas. La alternativa que ADR-17 rechazó
("mantenerlo para el despliegue público") era otra cosa: producía un segundo
ranking. Un sandbox no publicable nunca produce ranking.

**E2 · Control C1 — "una fuente `UNCLEAR` no alimenta nada" es más ancho de lo necesario.**
Esta única regla bloquea hoy las tres fuentes de mayor valor del proyecto, y
ninguna por prohibición: todas por *ausencia* de licencia declarada.
→ Generalizar el patrón de la ortofoto: una fuente `UNCLEAR` puede ingerirse **al
sandbox** y usarse para validar método internamente; nunca se publica, nunca
entra a un resultado, el control aparece deshabilitado con la razón.
→ **`ExportProfile.INTERNAL` ya admite todas las clases de licencia**
(`src/uri/contracts/enums.py:26`, `frozenset(LicenseClass)`). La puerta de
perfiles nunca fue el obstáculo; el bloqueo está aguas arriba, en la ingesta.

**E3 · ADR-19 §6 — el pipeline se detiene por una pareja de escenas.**
"Sin pareja compatible el pipeline **se detiene**". Era razonable cuando el
satélite era la vía de ampliación; hoy es una fuente entre varias, y detener
todo por ella contradice a ADR-18 §6, que estableció lo contrario para el riesgo
("deja de ser dependencia bloqueante"). Inconsistencia interna del corpus.
→ Degradar y declarar, no detener.

**E4 · ADR-20 — "una oportunidad por sitio, no cinco".**
El argumento es de presentación (575 filas = un visor GIS con otro nombre) y se
aplica al modelo. El propio ADR admite que *"las alternativas no se pierden — el
score de cada par se sigue calculando"*, pero se descartan en la superficie. Un
planificador que pregunta "¿y qué más cabría aquí?" hace la pregunta que el
sistema ya respondió y esconde.
→ Una oportunidad por sitio en listas y mapa (se conserva); alternativas dentro
de la ficha. Cero cambio de modelo.

**E5 · ADR-16 — "el sistema nunca afirma un estado de daño" chocará con EDAM.**
La regla se escribió cuando toda la evidencia era teledetección. `HABITABILIDAD`
es una determinación administrativa de la autoridad competente: retransmitirla
con atribución no es que el sistema afirme, es que cita.
→ Matizar **antes** de ingerir EDAM, manteniendo el mapeo declarado que el
research ya especifica (habitabilidad ≠ daño; son escalas distintas).

### 3.3 Tres retiradas

**R1 · ADR-15 — cerrarlo como histórico.** Ya está superado en su §Decisión. Lo
que sobrevive es un criterio de admisión que dice *"¿qué decisión toma **un
planificador** con esta pantalla?"*. Eso veta por construcción cualquier
superficie para otro rol —productor, validador, integrador—. Si el producto va
hacia flujo operativo, el criterio hay que reescribirlo nombrando el rol.

**R2 · Sacar el inventario de vistas de los ADR.** Es el cambio que más fricción
elimina. En 48 horas: ADR-21 fija cinco vistas, ADR-22 las sube a seis, ADR-23
las baja a cinco otra vez. Tres ADR enmendándose por una lista de pantallas. Las
**reglas** (un contexto a la vez, `UNKNOWN` con color propio, declarar ejes que
no ordenan, contar a quién no se alcanza) son arquitectura y se quedan. El
inventario de vistas es diseño de producto y debe vivir en `docs/product/`.

**R3 · El 64.** `DEFAULT_MIN_SUITABILITY = 64` filtra 34 de 105 oportunidades por
defecto y su única justificación es *"el valor que pidió el dueño"*. Como
preferencia de lectura ajustable está bien, pero si cambia el scoring, 64
significará otra cosa y nadie se enterará.
→ Derivarlo de un percentil o atarlo a la versión de scoring.

### 3.4 Hallazgo colateral: la población no alcanzada desapareció

ADR-21 §4 llamó a esta la cifra más importante del producto: **102.285 personas
no alcanzadas, el 53,8 % del AOI, fuera del alcance de los 115 candidatos — no
solo de los 19 seleccionados.** Era lo que distinguía un límite de presupuesto
de un límite de generación de sitios.

Verificado: `grep -rn "unreached"` en `src/` y `apps/viewer/src/` → **cero
resultados**. ADR-23 eliminó `lib/clusters.ts` junto con la vista Portafolio.

El dato sigue siendo derivable —`/scenarios/{id}/coverage` aún devuelve las
celdas con su marca de alcance, y su docstring dice *"las que nadie alcanza son
el dato"*— pero ya no se calcula ni se muestra en ninguna parte. ADR-23 fue
explícito en que la decisión era "de superficie, no de modelo", así que es
coherente con lo decidido; el efecto neto es que una decisión justificada por
honestidad se llevó por delante la métrica más honesta del producto.

→ **Decisión pendiente del dueño:** restaurarla en Escenarios o aceptar su
pérdida por escrito. No descubrirlo en seis meses.

---

## 4. Licencias: usar no es redistribuir

> No es asesoría legal. Antes de publicar material de terceros, confirmar con
> un abogado.

El proyecto colapsa en "¿tiene licencia?" tres preguntas independientes:

| Pregunta | Qué la gobierna | ¿Requiere licencia? |
|---|---|---|
| ¿Puedo **acceder** y leer el dato? | Ley 1712 de 2014 — principio de máxima publicidad | **No.** La información pública es pública por defecto; las excepciones son taxativas |
| ¿Puedo **usarlo internamente** para analizar? | Los términos del portal, si los hay | **Casi nunca.** Salvo prohibición expresa |
| ¿Puedo **republicarlo**? | Licencia o autorización escrita | **Sí.** Aquí es donde de verdad hace falta |

Todo el trabajo bloqueado hoy —validar el mapeo EDAM, medir cuánto cambia el
ranking con 25× más evidencia, diseñar la interfaz de la ortofoto— está en la
segunda casilla. Ninguna de esas cosas es republicar.

### 4.1 Silencio ≠ prohibición

- **Colombia no tiene derecho *sui generis* sobre bases de datos** como la UE.
  Bajo Decisión Andina 351 de 1993 y Ley 23 de 1982, una compilación se protege
  por la originalidad de su *selección y disposición*, no por los hechos que
  contiene.
- Un ítem de ArcGIS de una alcaldía que **no declara nada** no equivale a "todos
  los derechos reservados": es una ficha incompleta de una entidad sujeta a Ley
  1712. Muy distinto del SGC, que sí escribió una prohibición expresa.

La regla actual trata el silencio administrativo igual que una prohibición
explícita. Es conservador y defendible como política, pero cuesta las tres
mejores fuentes del proyecto.

### 4.2 Cuatro rutas, de menor a mayor esfuerzo

1. **Uso interno sin redistribución.** Ingerir a sandbox, analizar, no publicar.
   Disponible hoy, sin pedir permiso, salvo prohibición expresa.
2. **Publicar el derivado agregado, no la fuente.** Conteos por manzana no son el
   dataset. Depende de los términos: el SGC prohíbe expresamente "creación de
   servicios derivados"; una fuente que calla, no.
3. **Derecho de petición** (Art. 23 C.P., Ley 1755 de 2015). Convierte "esperar
   buena voluntad" en una obligación con plazo: **10 días hábiles** para
   peticiones de documentos e información.
4. **Convenio o acuerdo de uso de datos.** Más lento, y de paso entrega el
   contacto institucional que el diagnóstico dice que falta.

Quinta, ya en uso: **citar sin alojar** — enlazar la fuente y conservar
metadatos, parámetros y hash, sin copiar el material (ADR-18 ya lo prescribe).

### 4.3 Caso por caso

| Fuente | Naturaleza del bloqueo | Ruta viable |
|---|---|---|
| **SGC** (amenaza) | Prohibición **expresa y escrita** | Solo consentimiento previo por escrito. Rutas 3–4. La 1 es dudosa: sus términos limitan a "uso personal en su equipo" |
| **`pereira_edam`** (7.697 inspecciones) | **Silencio**, entidad sujeta a Ley 1712 | Rutas 1, 2 y 3 viables. El bloqueo real no es la licencia: es la PII |
| **Ortofoto municipal 14-ago** | **Silencio**, sin datos personales | La menos bloqueada de todas. Rutas 1, 2 y 3. Desatascar primero |
| **Ortofoto IGAC** | **Sí tiene licencia** (CC BY 4.0, Res. 616/2020) condicionada a titularidad del IGAC | No hace falta licencia nueva: hay que *verificar quién es el titular*. Pregunta de hecho, no de permiso |

### 4.4 Lo que no tiene alternativa

La protección de datos personales. Ley 1581 de 2012 y habeas data operan **con
independencia de cualquier licencia**: ninguna autorización de uso habilita a
publicar `DIRECCIÓN`, `CODIGO_PREDIAL`, cédulas o teléfonos. La capa de
demoliciones con propietarios y cédulas no tiene ruta, y que esté disponible
públicamente no cambia nada. ADR-22 §4 y `FR-PII-01` aciertan y se quedan como
están.

Por eso para EDAM el orden correcto es el que el research ya escribió: pedir solo
las columnas no personales, publicar por manzana con supresión bajo 20 unidades.
El permiso de uso no exime de eso.

---

## 5. Plan de acción

### Semana 1 — nada de esto toca código

- [ ] **P1** Derecho de petición a SIGPER por `ReporteEdificaciones300826`, con
      fundamento en Ley 1712 de 2014 y Ley 1755 de 2015. Pedir declaración de
      términos y **solo** las columnas no personales.
- [ ] **P2** Derecho de petición a SIGPER por la ortofoto municipal del
      14-ago-2026: licencia y productor.
- [ ] **P3** Registrar credenciales CDSE y correr el pipeline de ADR-19.
- [ ] **P4** Correo al SGC solicitando consentimiento previo por escrito.
- [ ] **P5** Verificar titularidad de la ortofoto IGAC (¿IGAC o AMCO?).

### Semana 1–2 — desbloquea trabajo interno sin esperar respuesta

- [ ] **E1** Esquema `rebuild_sandbox`, contrato de `import-linter`, prueba de que
      la puerta de publicación no lo alcanza.
- [ ] **E5** Enmendar ADR-16 antes de que llegue EDAM.
- [ ] **E2** C1 deja de bloquear la ingesta a sandbox; el visor muestra el control
      deshabilitado con la razón.
- [ ] Con E1+E2: validar el mapeo EDAM→`damage_evidence` y **medir cuánto cambia
      el ranking con 25× más evidencia**, sin publicar nada.

### Semana 2 — coherencia del corpus

- [ ] **E3** ADR-19 §6 degrada en vez de detener.
- [ ] **E4** Alternativas de intervención en la ficha.
- [ ] **R1 · R2 · R3**
- [ ] Escribir **ADR-25** que registre E1–E5 y R1–R3 con sus alternativas
      rechazadas, en el formato del corpus.

### Decisiones que requieren dueño

| Decisión | Opciones |
|---|---|
| Población no alcanzada (§3.4) | Restaurar en Escenarios · aceptar la pérdida por escrito |
| Diseño de Codex | Rebajar a propuesta · escribir el ADR que supersede a ADR-20/21/22/23 · archivarlo |
| Experimento de demanda | Desacoplarlo del build de la V1 y correrlo ya con lo que existe |
| Ampliación del AOI al perímetro urbano (32,8 km², 16 comunas) | Es una versión nueva del sistema, no una capa más — D1/D2 |

---

## 6. Verificaciones hechas para este documento

```bash
# El diseño de Codex no menciona la fuente municipal de daño
grep -in "EDAM\|7.697\|ReporteEdificaciones\|habitabilidad\|ArcGIS\|4.543" \
  docs/designs/recovery-informe-versionado-preparacion.md   # → 0 resultados

# La población no alcanzada ya no se calcula en ninguna parte
grep -rIn "unreached\|no_alcanzad" --include=*.py --include=*.ts --include=*.tsx \
  src apps/viewer/src scripts                                # → 0 resultados

# El perfil INTERNAL ya admite todas las clases de licencia
sed -n '24,27p' src/uri/contracts/enums.py                   # frozenset(LicenseClass)

# El pipeline de satélite nunca ha corrido
grep -E "^CDSE_CLIENT_(ID|SECRET)=" .env                     # ambos vacíos

# ADR-24 se cita 10 veces en el código y el archivo no existe
grep -rn "ADR-24" --exclude-dir=.git . | wc -l               # 10
ls docs/adr/ADR-24-*.md                                      # no such file

# GitHub Pages está habilitado y es público
gh api repos/FilipaoVfx/rebuild/pages                        # "public": true
gh release list                                              # vacío
```

**Nota aparte:** hay 10 referencias a `ADR-24` en el código del commit de
`pereiramap` (`.env.example`, `.gitignore`, migración 011, pipeline, registro,
adaptador, `build_static.py`, `browser_check.py`, `schemas.py`) y
`docs/adr/ADR-24-*.md` no existe. Escribirlo o corregir las referencias.
