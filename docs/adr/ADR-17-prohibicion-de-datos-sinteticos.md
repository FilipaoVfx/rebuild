# ADR-17 — Se prohíben los datos sintéticos, y la base lo impone

**Estado:** aceptada
**Fecha:** 2026-09-15
**Documentos padre:** SRS v0.1 §7 (capa sintética), PRD v1.0 §5; plan MVP M2; backlog E2
**Deroga:** `FR-SYN-01..06` · plan MVP §M2 · backlog E2 · `fuentes.md` §7.14
**Relacionada:** ADR-16 (evidencia multifuente)

---

## Contexto

CON-01 asumía que en la V1 no habría datos de daño reales y que un generador
sintético, determinista y con manifiesto, sería el sustituto honesto. Sobre esa
premisa se escribieron `FR-SYN-01..06`, el hito M2 y el epic E2.

La premisa se comprobó, y el resultado fue peor que "provisional". El
diagnóstico de señal midió la **estabilidad del ranking ante la semilla**:
regenerando las capas sintéticas con otra semilla y recalculando todo, el
top-20 conservaba **3 de 20 sitios** (15 %) y el portafolio 58 %.

Ese número no dice "el generador es mejorable". Dice que **el orden de
prioridad era una propiedad del generador**, no del territorio. Y el modelo
resultaba ser robusto a cómo se ponderan las variables (95 % de estabilidad
ante los pesos) y frágil a qué se le da de comer: exactamente la combinación
que invita a alguien a mirar el ranking, pensar "esto no tiene sentido" y
ajustar los pesos hasta que lo tenga — momento en el cual el sistema habría
aprendido el generador.

Además, mientras existió, el daño sintético **desdobló el sistema en dos**: un
despliegue institucional sobre daño real y uno público sobre daño generado,
con dos conteos de sitios, dos rankings y dos conjuntos de escenarios. Dos
sistemas que se parecen y no coinciden son peor que uno solo con menos
alcance.

## Decisión

**Ninguna capa del pipeline puede ser sintética.** El generador se retira. Una
capa para la que no exista fuente real se declara **no disponible** y no se
rellena.

La prohibición no es una convención documentada. La migración 006 la impone
con un `CHECK` sobre las cinco tablas que podían cargar contexto inventado:

```sql
ALTER TABLE core.population_cell  ADD CONSTRAINT population_cell_is_not_synthetic  CHECK (is_synthetic = false);
ALTER TABLE core.risk_zone        ADD CONSTRAINT risk_zone_is_not_synthetic        CHECK (is_synthetic = false);
ALTER TABLE core.land_use         ADD CONSTRAINT land_use_is_not_synthetic         CHECK (is_synthetic = false);
ALTER TABLE core.damage_evidence  ADD CONSTRAINT damage_evidence_is_not_synthetic  CHECK (is_synthetic = false);
ALTER TABLE core.site             ADD CONSTRAINT site_is_not_synthetic             CHECK (is_synthetic = false);
```

`uri.ingestion.synthetic` queda como módulo retirado: cualquier llamada que no
venga del diagnóstico levanta `SyntheticDataProhibited`.

La estructura de procedencia **conserva** `is_synthetic`. No es contradictorio:
el campo pasa de marcar un estado alcanzable a ser el testigo que demuestra
que no se alcanzó, y sobrevive en los cuatro formatos de export por las mismas
pruebas que ya existían.

## Consecuencias

**Lo que se gana.** Un solo sistema, sobre los mismos datos en todos los
despliegues. Y un invariante que no depende de que alguien recuerde la regla:
una migración futura que intente cargar contexto inventado falla al insertar.

**Lo que se pierde, y hay que decirlo.** La prueba de estabilidad ante la
semilla era el semáforo del proyecto y **ya no se puede correr**. Que haya
desaparecido no valida el ranking: elimina la forma que teníamos de
desmentirlo. Lo que queda en su lugar es una condición necesaria (ninguna capa
inventada entra) y no una suficiente.

**El sistema encoge, y eso es el punto.** Sin relleno, `vulnerability` es nula
en los 115 sitios, `land_use_compatibility` existe en 1, y `risk_score` tiene
un solo valor porque el SGC publica una sola zona para el AOI. Tres de los
cinco ejes del modelo no ordenan nada. Antes ordenaban — con números
inventados. Es la misma información, dicha de forma que no se puede confundir
con una medición.

**Lo derivado no es lo sintético, y la distinción es la que sostiene el
sistema.** La población se reparte dasimétricamente sobre huellas reales de
edificio a partir de un total publicado: es un cálculo sobre un observado, con
método y limitación declarados en el manifiesto. El generador inventaba la
estructura espacial entera. `signal_check.py` reporta las dos fracciones por
separado (hoy 67,2 % derivado / 32,8 % real) para que nadie las sume.

**El diagnóstico no cuenta versiones huérfanas.** `dataset_version` es
inmutable por trigger, así que una fila sintética escrita por una fixture no
se puede borrar. La prueba 4 mide las versiones que las capas **referencian**,
no las que existen en el catálogo.

## Alternativas descartadas

**Calibrar el generador contra el daño real observado.** Era la propuesta de
`antes-de-empezar.md` §5 y sigue siendo mejor que la sintética pura. Se
descarta porque no ataca el problema medido: un generador calibrado sobre 182
puntos de un sector produce estructura plausible para ese sector y sigue
siendo la especificación implícita de cómo es la realidad en todo lo demás.

**Mantenerlo solo para el despliegue público.** Es el desdoblamiento descrito
arriba. El despliegue público es el que más gente ve y el que menos contexto
tiene para leer una advertencia.

**Rellenar con promedios nacionales en vez de generar.** Un promedio nacional
aplicado a 115 sitios de un sector es una constante: cubre la columna, no
ordena nada, y se lee como dato. Peor que declarar la ausencia, porque no se
distingue de una medición.
