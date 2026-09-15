# Estado actual: qué entrega el sistema, y qué no

**Fecha:** 2026-09-15 · **Medido, no estimado.** Las cifras salen de
`scripts/checks/signal_check.py` y de consultas directas a la base; todo se
puede volver a correr.

**Dos cambios de régimen respecto a la versión anterior de este documento.**
Se retiró el generador sintético ([ADR-17](../adr/ADR-17-prohibicion-de-datos-sinteticos.md)):
no queda ninguna capa simulada, y la base lo impone con un `CHECK` (migración
006), no con una convención. Y se retiró la capa de amenaza del SGC
([ADR-18](../adr/ADR-18-retirada-de-la-capa-del-sgc.md)): sus términos
prohíben redistribuirla, y se estaba publicando sellada con la versión de otra
fuente, donde la puerta de licencia no podía verla. Cada cambio resuelve un
problema y deja otro a la vista; todos están abajo.

---

## 1. De qué se alimenta hoy

| Capa | Fuente real | Volumen |
|---|---|---|
| **Daño** | Copernicus EMS, activación `EMSR916`, producto de grading | 182 observaciones — 85 `DAMAGED`, 76 `DESTROYED`, 21 `POSSIBLY_DAMAGED` |
| **Huellas de edificio** | Microsoft Building Footprints | 15.024 polígonos |
| **Población** | Total del AOI publicado por Copernicus (190.000), repartido dasimétricamente sobre las huellas | 1.858 celdas |
| **Uso de suelo** | OpenStreetMap (`landuse`) | 219 polígonos |
| **Red peatonal, verde y equipamientos** | OpenStreetMap | 6.695 vías · 129 espacios verdes · 58 equipamientos |

Observación del **2026-08-11**, adquisición del **2026-08-12**. El AOI son
**6,91 km²** de envolvente convexa (12,64 km² de caja).

No hay capa de amenaza sísmica. La del SGC se retiró y ninguna la sustituye.

Las tres fuentes que contribuyen al resultado publicado son `copernicus_ems`
(`ATTRIBUTION`), `microsoft_buildings` (`SHARE_ALIKE`) y `osm`
(`SHARE_ALIKE`). **Ni ICube-SERTIT ni el SGC alimentan nada**: siguen en el
registro con `redistribution_allowed = false` y la puerta de publicación los
bloquearía si volvieran a contribuir. Cada capa se sella ahora con la
`dataset_version` de **su propia** fuente, que es lo que permite a la puerta
verlas.

El pipeline corre de punta a punta sobre archivos versionados en `db/seed/`,
sin descargar nada:

```
182 observaciones  →  115 sitios  →  105 candidatos  →  19 proyectos
  Copernicus EMS       agrupadas      10 excluidos       5,19 MM COP
```

---

## 2. ¿Señal o ruido? Las cinco mediciones

| # | Prueba | Resultado | Veredicto |
|---|---|---|---|
| 1 | **Dispersión** entre 105 candidatos | rango 28,4–65,5 · σ 9,2 | ✅ el modelo separa los sitios |
| 2 | **Discriminación** | corr(score, área) **+0,001** · corr(score, población) **+0,406** | ✅ no es `ORDER BY area_m2` disfrazado |
| 3 | **Estabilidad ante los pesos** (±20 %, top-20) | solapamiento medio **95 %**, mínimo 95 % | ✅ robusto a cómo se pondera |
| 4 | **Dependencia de lo simulado** | 0 versiones sintéticas · 0 sitios sintéticos · 67,2 % derivado / 32,8 % real | ✅ ninguna capa simulada entra al resultado |
| 5 | **Cobertura y discriminación de features** | ver tabla abajo | ⚠️ dos features cubiertas que no ordenan nada |

### La prueba que desapareció, y por qué eso no es una victoria

La versión anterior de este documento tenía una prueba 4 distinta —
**estabilidad ante la semilla sintética** — y era la decisiva. Salía en
**15 %**: al regenerar las capas con otra semilla, el top-20 conservaba 3 de
20 sitios. El ranking describía el generador.

Esa prueba hoy no se puede correr, porque no hay semilla. Eso **no significa
que el ranking quedó validado**: significa que se eliminó la forma de
desmentirlo que teníamos. Lo que la prueba 4 mide ahora es una condición
necesaria (ninguna capa inventada entra), no una suficiente.

### Dónde está el peso real del score

El 67,2 % del score proviene de valores **derivados**, y toda la derivación
cuelga de una sola cadena:

> un total de 190.000 personas para el AOI, publicado por Copernicus →
> repartido sobre 15.024 huellas de Microsoft → **asumiendo densidad uniforme
> por área construida**.

De ahí salen `need`, `deficit` y la métrica de equidad. Si el total está
desviado o la uniformidad no se sostiene, los tres se mueven juntos y en la
misma dirección. La correlación de la prueba 2 con población (+0,406) es, en
parte, correlación con área construida por construcción del reparto.

El método y su limitación quedan declarados en el manifiesto de la capa; no es
un supuesto oculto. Pero es **un** supuesto sosteniendo dos tercios del score.

### Cobertura ≠ información

```
risk                 0/115     0%      0 valores
land_use             1/115     1%      1 valor   ← CONSTANTE: no discrimina
poblacion          115/115   100%    110 valores
vulnerabilidad       0/115     0%      0 valores
deficit            115/115   100%     92 valores
densidad           115/115   100%      7 valores
red                 88/115    77%      2 valores
```

La columna de valores distintos es nueva, y es la que hizo visible el caso del
riesgo:

- **`risk_score` figuraba al 100 % de cobertura con un solo valor: 0,28 en los
  115 sitios.** El SGC publica un valor por municipio, no microzonificación
  (D6). Con exclusión en 0,75 y penalización blanda desde 0,30, la restricción
  **no excluía ni penalizaba a nadie**: cobertura completa, cero información.
  La capa se retiró por licencia (ADR-18) y el resultado no se movió ni un
  sitio — que es la prueba de que no aportaba. Hoy la feature es nula y se
  declara `sin fuente`.
- **`land_use` solo existe en 1 de 115 sitios.** OSM tiene 219 polígonos de
  uso de suelo en el AOI, pero casi ninguno cae sobre un sitio dañado. La
  restricción se salta cuando el dato falta —se declara desconocido en vez de
  inventarse un 0— y por eso excluye exactamente 1 sitio.
- **`vulnerabilidad` es nula en los 115.** No se rellena: el factor no
  contribuye al score (0,0 % en la prueba 4). El vector de pesos declara
  `vulnerability: 0.20`, y **ese 20 % no está haciendo nada**.

De los cinco factores del modelo, hoy **dos ordenan de verdad**
(`need`/`deficit` vía población derivada, y `accessibility`/`facility_gap` vía
OSM real), uno está declarado ausente y las dos restricciones de contexto no
filtran: la de uso de suelo por falta de cobertura, la de riesgo por falta de
fuente.

**Ausente no es cero.** Antes de ADR-18, el motor de features envolvía el
riesgo en `COALESCE(..., 0)` y el evaluador hacía `float(... or 0)`. Sin capa
de riesgo, los 115 sitios habrían puntuado riesgo cero —el valor más
favorable— y ninguna restricción habría excluido a nadie, en silencio. Ahora
la ausencia se salta la restricción y se declara, igual que ya hacía el uso de
suelo.

---

## 3. El presupuesto no es lo que limita el portafolio

Los cuatro escenarios precalculados —10, 25, 50 y 100 MM COP— devuelven
**exactamente el mismo portafolio**: 19 proyectos, 5,19 MM COP, 87.715
personas alcanzadas.

No es un error de cálculo ni del control. El objetivo es de **cobertura**: una
celda cubierta ya no aporta al cubrirla otra vez. Tras 19 proyectos, ningún
candidato restante alcanza población nueva, y el greedy para aunque sobre
presupuesto. En un AOI denso de 6,91 km² con catchments de 10 minutos que se
superponen, 19 sitios saturan lo alcanzable.

Esto se declara ahora en la respuesta (`stop_reason`, `budget_binding`) y en
el visor, en vez de dejar que el usuario mueva el control y concluya que está
roto. Consecuencia para la decisión: **el sistema no responde hoy "¿qué hago
con 100 MM COP?"**. Responde "19 proyectos por 5,19 MM COP, y más dinero no
compra más cobertura con este objetivo". Ampliar el AOI o añadir un término de
profundidad al objetivo (no solo alcanzar, sino servir mejor) es una decisión
de producto sobre ADR-08, no un bug que arreglar aquí.

La equidad se mueve poco por la misma razón: Gini de acceso
**0,8759 → 0,8753** (Δ −0,0006); celdas con acceso 1.385 → 1.406 de 1.858.

---

## 4. Qué es accionable hoy, y qué no

La línea ya no pasa entre "observado" y "simulado" —no queda nada simulado—.
Pasa entre **lo observado**, **lo derivado de un observado bajo un supuesto
declarado**, y **lo que no ordena nada**.

### 🟢 Accionable — se apoya en observación directa

| Salida | Qué se puede hacer con ella |
|---|---|
| **Inventario de 115 sitios** agrupados desde 182 observaciones de Copernicus EMS | Llevarlo a una mesa de trabajo: "estos son los predios con daño documentado en este sector" |
| **Evidencia por sitio**: fuente, fuente original, método, fecha de observación, licencia | Auditar de dónde viene cada afirmación de daño |
| **Confianza de daño con sus drivers**, incluida la no-independencia entre fuentes | Saber dónde la evidencia es débil antes de mandar a alguien a verificar |
| **Geometría y área** de cada sitio, y las 10 exclusiones con su razón textual | Filtrar por tamaño viable y auditar por qué se descartó cada uno |
| **Contexto urbano real** (129 verdes, 58 equipamientos, red peatonal OSM) | Ver qué hay alrededor de cada sitio |
| **Alerta de cobertura**: 6,91 km² de AOI | Sigue siendo, probablemente, el hallazgo más útil del sistema |
| **Registro de licencias y puerta de publicación** | Saber qué se puede publicar antes de publicarlo — y que falle si no |

### 🟡 Accionable con reserva — derivado bajo un supuesto declarado

| Salida | La reserva |
|---|---|
| **Población alcanzada por sitio** (0–17.664, media 7.284) | Reparto dasimétrico con densidad uniforme por área construida |
| **Déficit de espacio público** | Verde real de OSM dividido por esa población derivada |
| **Orden de prioridad entre sitios** | Estable ante los pesos (95 %), pero apoyado en 67,2 % de valor derivado de una sola cadena de supuestos |
| **Portafolio y su costo** | Hereda lo anterior, más costos unitarios sin fuente oficial (OI-05) |
| **Métrica de equidad** | Se calcula sobre la misma población derivada |

### 🔴 No accionable — no ordena nada

| Salida | Por qué |
|---|---|
| **Exclusión por riesgo sísmico** | Sin fuente utilizable (ADR-18). Antes: un solo valor (0,28) que no excluía ni penalizaba |
| **Compatibilidad de uso de suelo** | Dato en 1 de 115 sitios; sin POT ingerido (OI-F3) |
| **Vulnerabilidad social** | Nula en los 115; el 20 % del vector de pesos no está actuando |
| **Respuesta a "¿qué hago con más presupuesto?"** | La cobertura satura en 19 proyectos (§3) |

### La frase honesta

> Hoy el sistema es un **inventario de evidencia de daño real con trazabilidad
> auditable, más una priorización que se sostiene sobre un único reparto
> dasimétrico y dos restricciones de contexto que no filtran**. Lo primero se
> puede usar mañana. Lo segundo ordena de forma reproducible y explicable,
> pero lo que ordena es, en dos tercios, una consecuencia del método de
> reparto.

Ya no es "una maquinaria corriendo sobre datos de relleno". Es una maquinaria
corriendo sobre datos reales pero **delgados**: pocas capas, una de ellas
constante, otra ausente, y el AOI de un sector.

---

## 5. Qué haría falta para que la priorización fuera accionable

En orden de impacto:

1. **Población real del DANE a nivel de manzana** (OI-F4). Reemplaza el
   supuesto de uniformidad que hoy sostiene el 67,2 % del score, y de paso
   `deficit` y la equidad. Es la palanca única más grande. *Bloqueado: DANE
   devuelve 403/404 desde este entorno.*
2. **Microzonificación sísmica de Pereira** (D6). Activa una restricción dura
   que hoy no filtra porque no tiene fuente. *Bloqueado: no publicada como capa
   para el AOI; y la amenaza nacional del SGC, además de constante, no es
   redistribuible (ADR-18).*
3. **POT / uso de suelo de IDE AMCO** (OI-F3). Sube `land_use` del 1 %.
   *Bloqueado: el GeoServer de IDE AMCO responde en el puerto 8443, fuera de
   la política de salida de este entorno.*
4. **Un índice de vulnerabilidad** de cualquier fuente aceptable. Hoy el 20 %
   del vector de pesos está inactivo.
5. **Ampliar el AOI más allá de los 6,91 km²** de la activación EMSR916.
   Mientras la ventana sea un sector, la "priorización de Pereira" es la
   priorización de un barrio — y es también lo que hace saturar al optimizador.
6. **Repetir `signal_check.py`** después de cada una, mirando la columna de
   valores distintos y no solo la de cobertura.

---

## 6. Qué quedó fuera del alcance

### 6.1 Fuera por decisión de producto

| Diferido | Documentado en | Por qué |
|---|---|---|
| Ranking con ML | plan §1.2, ADR-09 | No hay ground truth |
| Clusters de oportunidad (PRD §36) | plan §1.2 | Es análisis sobre el portafolio, no entrada de él |
| Corredores verdes y redes (PRD §37) | plan §1.2 | Necesita una función objetivo de conectividad que no está definida |
| Isócronas multimodales | ADR-03 | El tránsito se modela como proximidad en la V1 |
| Optimizador MILP / NSGA-II | ADR-08 | El greedy submodular tiene cota conocida y se explica a un planificador |
| 5 de 11 tipos de intervención | plan §1.4 | Educación y salud necesitan modelos de demanda sectorial; vivienda y comercio, supuestos que el PRD §5 excluye |
| 7 de 20 features | plan §1.3 | Los buffers de radio fijo son redundantes con el catchment de red |
| Panel de administración | ADR-15 | El piloto tiene un operador; se opera por migración y CLI |
| Aplicación web de propósito general | ADR-15 | La V1 se define por su superficie de salida |
| **Generador sintético de daño** (`FR-SYN-01..06`, plan M2, backlog E2) | Este documento | **Retirado.** La migración 006 lo prohíbe en la base |

### 6.2 Fuera por falta de insumo, no por decisión

| Pendiente | Bloqueado por |
|---|---|
| Población, hogares y vulnerabilidad reales | Disponibilidad DANE (OI-F4) — 403/404 desde este entorno |
| Cualquier capa de riesgo | La del SGC no es redistribuible (ADR-18); no hay microzonificación de Pereira (D6) |
| Uso de suelo real | IDE AMCO en el puerto 8443 (OI-F3) |
| Evidencia de daño del RUD | Decisión sobre agregación y PII (D3) |
| Capas de IDEAM y CARDER | Sin resolución DNS desde este entorno |
| Costos unitarios oficiales | Fuente institucional (OI-05) |
| Medida de equidad acordada | Contraparte institucional (OI-03) |
| Dueño de los pesos | Contraparte institucional (D7) |

### 6.3 Implementado a medias, y sincero al respecto

| Parcial | Estado |
|---|---|
| Catchments de red | Reales con pgRouting, pero 27 de 115 caen a buffer y quedan marcados (`FR-FEAT-03`) |
| Proximidad a tránsito | Las estaciones de Megabús están archivadas en `db/seed/`; el adaptador no está cableado |
| Análisis de sensibilidad (`FR-SCEN-08`) | Existe como diagnóstico en `signal_check.py`, no como endpoint |
| Comparación de escenarios (`FR-SCEN-07`) | Se guardan y listan; falta la vista lado a lado |
| Reporte ejecutivo PDF (`FR-EXP-03`) | Exportes en GeoJSON/CSV/JSON; el PDF no está |
| Trabajos asíncronos (`FR-SCEN-09`) | La optimización tarda <1 s a este volumen; pgmq no se cableó |
| Autenticación y roles (`FR-AUTH-*`) | El esquema y los tiers existen; no hay Supabase Auth conectado |
| Auditoría (`FR-AUDIT-01`) | Tabla inmutable y escritura en creación de escenario; falta cubrir el resto de acciones |
| Tiles MVT (`FR-API-03`) | Endpoint implementado; el visor usa GeoJSON porque el volumen no lo exige |
| Accesibilidad (`FR-UI-05`) | Operable por teclado y sin codificación solo por color; falta auditoría formal |

---

## 7. Cómo volver a medir

```bash
./scripts/dev_db.sh
export PYTHONPATH=src
.venv/bin/python scripts/migrate.py --reset
.venv/bin/python scripts/run_pipeline.py
.venv/bin/python scripts/checks/signal_check.py     # las cinco pruebas
```

**El semáforo del proyecto cambió.** Antes era la prueba 4 (estabilidad ante
la semilla). Ahora que no hay semilla, es la **columna de valores distintos de
la prueba 5**: mientras `risk` y `land_use` tengan un solo valor y
`vulnerabilidad` tenga cero, tres de los cinco ejes del modelo no están
ordenando nada, y presentar el ranking como prioridad de inversión afirma más
de lo que el sistema puede sostener.

---

## 8. Sobre publicar el sistema

Publicar un sitio web **es redistribuir**. Por eso
`scripts/build_static.py --profile PUBLIC` falla si alguna fuente no
redistribuible contribuyó, y nombra cuál:

```
BLOQUEADO
El perfil PUBLIC no puede publicarse: contribuyen fuentes que no permiten
redistribucion — sertit (NON_COMMERCIAL).
```

La puerta resuelve las fuentes contribuyentes por **dos vías, y hacen falta
las dos**: siguiendo la `data_version` de cada tabla publicable —cada capa se
sella con la versión de su propia fuente— y siguiendo el `original_source` de
la evidencia, porque un agregador no puede esconder a su proveedor detrás de
sí mismo. Las tres consumidoras (puerta de publicación, panel de procedencia y
diagnóstico de señal) comparten una sola definición,
`CONTRIBUTING_SOURCES_SQL`. Con listas separadas, la que se queda corta es la
que deja pasar una fuente sin evaluar: así se publicó la capa del SGC.

**Ya no hay dos versiones del sistema.** El paquete público y el institucional
corren sobre los mismos datos reales; la diferencia es de superficie, no de
contenido:

| | Local / institucional | Público (Pages) |
|---|---|---|
| Datos | Copernicus EMS + Microsoft + OSM | Los mismos |
| Sitios derivados | 115 | 115 |
| Exportes | Sí, con puerta por perfil | No — la puerta es lógica de servidor |
| Escenarios | Optimizador en vivo | Precalculados a 10/25/50/100 MM COP (los cuatro saturan en el mismo portafolio, §3) |

Lo que el sitio público demuestra es la maquinaria **y** el inventario real de
evidencia. Lo que no demuestra, y no debe presentarse como tal, es un
diagnóstico completo de Pereira: son 6,91 km² de un municipio.

Sitio: **https://filipaovfx.github.io/rebuild/**
