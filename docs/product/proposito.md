# El propósito del proyecto — síntesis del PRD

Síntesis del [PRD v1.0](prd.md) (2.121 líneas) en lo que define el producto: qué
es, qué decide, qué no hace y con qué principios. La última sección contrasta el
enfoque con el estado verificado del repositorio.

---

## El propósito, en una frase

> Convertir datos territoriales, demográficos, de infraestructura, riesgo y
> disponibilidad de suelo en **escenarios explicables y optimizados** para
> decidir inversión urbana tras un desastre.

El caso es Pereira después del sismo del 10 de agosto de 2026. El propósito no
es el caso.

## El giro conceptual que lo define

Tras un desastre, la pregunta obvia es *«¿qué había aquí antes?»*. El PRD
sostiene que la pregunta valiosa es otra:

> **«¿Qué necesita este territorio ahora?»**

Un edificio residencial dañado no tiene por qué reemplazarse por otro edificio
residencial. El predio podría ser un parque, una plaza, un equipamiento
comunitario, una escuela, un centro de salud, vivienda, un corredor verde — o
**quedarse sin construir por riesgo**.

De ahí el objetivo último, textual:

```
Reemplazar lo que se perdió
        ↓
Usar la oportunidad de la recuperación para construir una ciudad
mejor conectada, más equitativa, accesible y resiliente.
```

## La pregunta que el producto responde

El PRD la descompone en seis dimensiones, y esa descomposición **es** la
arquitectura:

| Dimensión | Pregunta |
|---|---|
| **WHERE** | ¿Qué sitios afectados son las oportunidades de mayor prioridad? |
| **WHAT** | ¿Qué intervención generaría más valor en cada sitio? |
| **WHY** | ¿Qué factores territoriales medibles explican esa recomendación? |
| **HOW MUCH** | ¿Cuántas personas, hogares o equipamientos se beneficiarían? |
| **WHAT IF** | ¿Cómo cambia la recomendación con otro presupuesto o prioridades? |
| **WHICH COMBINATION** | ¿Qué cartera de sitios da el mejor resultado a escala de ciudad? |

## La unidad de producto no es el predio: es la decisión

Es el principio central, y el más consecuente:

```
WHERE + WHAT + WHY + HOW MUCH + WHAT IF + WHICH COMBINATION
```

Rankear sitios individualmente **es insuficiente**, y el PRD da la razón exacta:
dos sitios individualmente excelentes pueden servir a la misma población. De ahí
la evolución obligada:

```
Ranking de sitios  →  Optimización de cartera
```

Una lista ordenada no sabe que sus dos primeros proyectos se solapan.

## Lo que explícitamente NO es

El PRD dedica una sección entera a acotarlo, y es lo que lo hace defendible ante
una institución. La plataforma **no**:

- Reemplaza inspecciones estructurales de ingeniería
- Certifica edificios como seguros o inseguros
- Emite licencias de construcción
- Determina propiedad legal
- Reemplaza el POT
- Produce diseños arquitectónicos finales
- Garantiza costos de construcción
- Toma decisiones de política pública legalmente vinculantes
- Ejecuta inversiones urbanas automáticamente
- Expone información personal de damnificados
- **Presenta salidas inciertas del modelo como hechos**

> «Es una **capa de soporte a la decisión**, no la autoridad legal ni de
> ingeniería.»

Y la formulación negativa que el PRD repite: *no es una IA que le dice a la
ciudad qué construir*.

## Para quién

Cinco usuarios con necesidades distintas: el **planificador urbano** (identificar
oportunidades y comparar alternativas), la **administración pública** (asignar
presupuesto limitado), el **analista SIG** (inspeccionar la evidencia y validar
el modelo), el **científico de datos** (features reproducibles) y el **equipo de
recuperación** (proyectos priorizados y escenarios de cartera).

## Los siete principios

1. **Evidencia sobre opinión.** Toda recomendación se sostiene en evidencia
   espacial medible.
2. **Lo espacial primero.** *El mapa no es decoración. El territorio es el modelo
   de datos.*
3. **Explicarlo todo.** El usuario debe entender por qué existe una recomendación.
4. **Optimizar carteras.** No optimices sitios por separado cuando las decisiones
   interactúan.
5. **Restricciones duras antes que ML.** Un candidato inválido nunca se rescata
   con un puntaje alto.
6. **La incertidumbre es una característica**, no un defecto a esconder.
7. **Humano en el bucle.** La plataforma apoya decisiones públicas; no las
   sustituye.

## La métrica norte

> **Valor urbano potencial generado por unidad de inversión**

Sostenida por: población servida, reducción de déficit, mejora de equidad,
mejora de accesibilidad, impacto ambiental y reducción de riesgo.

## Dónde está esto hoy

El PRD describe el destino, no el estado. Contrastado con el repositorio:

- **WHERE, WHY, HOW MUCH** funcionan: 115 sitios, descomposición exacta del
  puntaje, población alcanzable medida.
- **WHAT** funciona parcialmente: se emite una intervención por sitio, con sus
  alternativas evaluadas y descartadas visibles en la ficha.
- **WHAT IF y WHICH COMBINATION** existen en el código pero **se retiraron de la
  superficie** ([ADR-23](../adr/ADR-23-menos-portafolio-mas-explicacion.md)): los
  costos no tienen fuente oficial (OI-05) y los pesos no tienen dueño
  institucional (OI-03). Los cuatro escenarios de presupuesto devuelven la misma
  cartera.
- De los cinco ejes del modelo, **dos ordenan de verdad**; riesgo y uso normativo
  del suelo siguen sin fuente.
- El principio 6 —*la incertidumbre es una característica*— es el mejor cumplido:
  las condiciones sin fuente se cuentan en pantalla y un eje cubierto que no
  discrimina lo declara en la leyenda.

El PRD apunta a optimización de cartera. El sistema hoy sostiene, con evidencia,
la mitad izquierda de su propia ecuación. Lo que falta para la otra mitad no es
ingeniería: es una contraparte institucional que ponga dueño a los costos y a los
pesos — ver [`../plan/hallazgos.md`](../plan/hallazgos.md) §4.
