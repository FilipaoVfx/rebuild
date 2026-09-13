# Estado actual: qué entrega el sistema, y qué no

**Fecha:** 2026-09-13 · **Medido, no estimado.** Las cifras salen de
`scripts/checks/signal_check.py`, que se puede volver a correr.

---

## 1. La pregunta que importa: ¿señal o ruido?

Un ranking siempre sale. La pregunta es si significa algo. Cinco mediciones:

| # | Prueba | Resultado | Veredicto |
|---|---|---|---|
| 1 | **Dispersión** de scores entre 72 candidatos | rango 13,0–50,8 · σ 9,9 | ✅ el modelo separa los sitios |
| 2 | **Discriminación** — ¿el score es un proxy del área? | corr(score, área) **+0,13** · corr(score, población) +0,32 | ✅ no es `ORDER BY area_m2` disfrazado |
| 3 | **Estabilidad ante los pesos** (±20 %, top-20) | solapamiento medio **96 %**, mínimo 90 % | ✅ robusto a cómo se pondera |
| 4 | **Estabilidad ante la semilla sintética** | solapamiento del top-20 **15 %** · portafolio 58 % | ❌ **el resultado es la simulación** |
| 5 | **Origen del score** | 53 % real · 29 % sintético · 18 % mixto | ⚠️ **47 % depende de capas simuladas** |

### Lo que esto significa

La prueba 4 es la decisiva y es la que falla. Al regenerar las capas
sintéticas con otra semilla y recalcular todo, **el top-20 conserva 3 de 20
sitios**. El orden de prioridad entre sitios no describe Pereira: describe el
generador.

La combinación de 3 y 4 es la parte instructiva. El modelo es **robusto a cómo
se ponderan las variables** y **frágil a qué se le da de comer**. Afinar pesos
mirando estos resultados sería exactamente el error de `antes-de-empezar.md` §5:
el sistema aprendería el generador, no el territorio.

El portafolio aguanta algo mejor (58 %) porque el optimizador se apoya en
geometría de cobertura, que es parcialmente real. No lo suficiente para
fiarse de él.

---

## 2. Qué es accionable hoy, y qué no

La línea no pasa entre "funciona / no funciona". Pasa entre **lo que se
observó** y **lo que se supuso**.

### 🟢 Accionable — se apoya solo en datos reales

| Salida | Qué se puede hacer con ella |
|---|---|
| **Inventario de 113 sitios de oportunidad** agrupados desde 252 observaciones SERTIT | Llevarlo a una mesa de trabajo: "estos son los predios con daño documentado en este sector" |
| **Evidencia por sitio**: fuente, método, fecha de observación, validación de campo, licencia | Auditar de dónde viene cada afirmación de daño y con qué respaldo |
| **Confianza de daño con sus drivers**, incluida la no-independencia entre fuentes | Saber dónde la evidencia es débil antes de mandar a alguien a verificar |
| **Geometría y área estimada** de cada sitio | Filtrar por tamaño mínimo viable para una intervención |
| **Contexto urbano real** (parques, equipamientos, red peatonal OSM) | Ver qué hay alrededor de cada sitio |
| **Exclusión por área mínima** | Descartar los que no caben en ninguna intervención |
| **Alerta de cobertura**: 2,6 km² de AOI, 11,1 % nacional | Es, probablemente, el hallazgo más útil del sistema hoy |
| **Registro de licencias y puerta de export** | Saber qué se puede publicar y qué no, antes de publicarlo |

### 🔴 No accionable — depende de capas simuladas

| Salida | Por qué no |
|---|---|
| **Orden de prioridad entre sitios** | 15 % de estabilidad ante la semilla |
| **Score y su magnitud** | 47 % proviene de capas simuladas |
| **Población servida** | La malla de población es generada, no DANE |
| **Déficit de espacio público** | Área verde real dividida por población simulada |
| **Vulnerabilidad social** | Generada |
| **`risk_score` y exclusión por riesgo** | No hay microzonificación de Pereira como capa (D6) |
| **Compatibilidad de uso de suelo** | No hay POT ingerido (OI-F3) |
| **Portafolio, costo e impacto** | Hereda todo lo anterior, más costos sin fuente oficial (OI-05) |
| **Métrica de equidad** | Se calcula sobre población simulada |

### La frase honesta

> Hoy el sistema es un **inventario de evidencia de daño con trazabilidad
> auditable, y una maquinaria de priorización completa y verificada corriendo
> sobre datos de relleno**. Lo primero se puede usar mañana. Lo segundo no se
> puede usar hasta que entren población, riesgo y uso de suelo reales.

Esto no es un fracaso del diseño: es CON-01 funcionando como se anunció. Lo
que el piloto tiene hoy es la tubería probada y la evidencia real trazada. Lo
que le falta son tres capas que dependen de gestiones institucionales, no de
código (§6 de `antes-de-empezar.md`).

---

## 3. Qué haría falta para que la priorización fuera accionable

En orden de impacto sobre la prueba 4:

1. **Población real del DANE a nivel de manzana** (OI-F4). Ataca `need`,
   `deficit`, `vulnerability` y la equidad de una vez: los cuatro factores
   simulados. Es la palanca única más grande.
2. **Microzonificación sísmica de Pereira** (D6). Hoy `risk_score` es un
   marcador de posición, y el riesgo es una restricción dura: puntuar sin él
   no es puntuar con menos información, es puntuar otra cosa.
3. **POT / uso de suelo de IDE AMCO** (OI-F3). Misma razón.
4. **Ampliar el AOI más allá de los 2,6 km² de SERTIT**, cruzando con el RUD
   agregado (D3). Mientras la ventana sea un sector, la "priorización de
   Pereira" es la priorización de un barrio.
5. **Repetir `signal_check.py`** después de cada una. Si la prueba 4 no sube
   de ~70 %, el problema no era el dato que faltaba.

---

## 4. Qué quedó fuera del alcance

### 4.1 Fuera por decisión de producto

| Diferido | Documentado en | Por qué |
|---|---|---|
| Ranking con ML | plan §1.2, ADR-09 | No hay ground truth. Además: con la prueba 4 en 15 %, entrenar sobre esto aprendería el generador |
| Clusters de oportunidad (PRD §36) | plan §1.2 | Es análisis sobre el portafolio, no entrada de él |
| Corredores verdes y redes (PRD §37) | plan §1.2 | Necesita una función objetivo de conectividad que no está definida |
| Isócronas multimodales | ADR-03 | El tránsito se modela como proximidad en la V1 |
| Optimizador MILP / NSGA-II | ADR-08 | El greedy submodular tiene cota conocida y se explica a un planificador |
| 5 de 11 tipos de intervención | plan §1.4 | Educación y salud necesitan modelos de demanda sectorial; vivienda y comercio, supuestos que el PRD §5 excluye |
| 7 de 20 features | plan §1.3 | Los buffers de radio fijo son redundantes con el catchment de red |
| Panel de administración | ADR-15 | El piloto tiene un operador; se opera por migración y CLI |
| Aplicación web de propósito general | ADR-15 | La V1 se define por su superficie de salida |

### 4.2 Fuera por falta de insumo, no por decisión

| Pendiente | Bloqueado por |
|---|---|
| Población, hogares y vulnerabilidad reales | Disponibilidad DANE (OI-F4) |
| Riesgo real | Microzonificación de Pereira (D6) |
| Uso de suelo real | Servicios OGC de IDE AMCO (OI-F3) |
| Evidencia de daño del RUD | Decisión sobre agregación y PII (D3) |
| Costos unitarios oficiales | Fuente institucional (OI-05) |
| Medida de equidad acordada | Contraparte institucional (OI-03) |
| Dueño de los pesos | Contraparte institucional (D7) |

### 4.3 Implementado a medias, y sincero al respecto

| Parcial | Estado |
|---|---|
| Catchments de red | Reales con pgRouting, pero 66 de 339 caen a buffer y quedan marcados (`FR-FEAT-03`) |
| Análisis de sensibilidad (`FR-SCEN-08`) | Existe como diagnóstico en `signal_check.py`, no como endpoint |
| Comparación de escenarios (`FR-SCEN-07`) | Se guardan y listan; falta la vista de comparación lado a lado |
| Reporte ejecutivo PDF (`FR-EXP-03`) | Exportes en GeoJSON/CSV/JSON; el PDF no está |
| Trabajos asíncronos (`FR-SCEN-09`) | La optimización tarda <1 s a este volumen; pgmq no se cableó |
| Autenticación y roles (`FR-AUTH-*`) | El esquema y los tiers existen; no hay Supabase Auth conectado |
| Auditoría (`FR-AUDIT-01`) | Tabla inmutable y escritura en creación de escenario; falta cubrir el resto de acciones |
| Tiles MVT (`FR-API-03`) | Endpoint implementado; el visor usa GeoJSON porque el volumen no lo exige aún |
| Accesibilidad (`FR-UI-05`) | Operable por teclado y sin codificación solo por color; falta auditoría formal |

---

## 5. Cómo volver a medir

```bash
./scripts/dev_db.sh
export PYTHONPATH=src
.venv/bin/python scripts/migrate.py --reset
.venv/bin/python scripts/run_pipeline.py
.venv/bin/python scripts/checks/signal_check.py     # las cinco pruebas
```

El diagnóstico deja la base con la semilla de trabajo restaurada, así que se
puede correr sin ensuciar el estado.

**La prueba 4 es el semáforo del proyecto.** Mientras esté por debajo de ~70 %,
cualquier presentación del ranking como prioridad de inversión es una
afirmación que el propio sistema puede desmentir.
