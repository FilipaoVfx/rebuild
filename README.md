# Urban Recovery Intelligence

Plataforma de inteligencia espacial para decisiones de recuperación urbana post-desastre.

**Caso:** Pereira, Risaralda — municipio afectado por el sismo M7,4 del 10 de agosto de 2026, con epicentro en San José del Palmar, Chocó (Copernicus `EMSR916`, USGS `us6000tjl2`).

> El PRD, el SRS y el ARD describen el caso como "el sismo de Pereira". No lo fue: Pereira es uno de los 409 municipios afectados por un evento regional. Ver [antes de empezar](docs/plan/antes-de-empezar.md) §1.

La pregunta que el sistema responde:

> ¿Dónde intervenir, qué construir allí, por qué, cuánto valor genera, y qué combinación de sitios produce el mejor resultado a escala de ciudad?

No es una IA que decide qué debe construir una ciudad. Es una capa de soporte a la decisión: convierte datos territoriales, demográficos, de infraestructura, riesgo y disponibilidad de suelo en escenarios explicables y optimizados. Toda salida es consultiva (CON-05); ninguna decisión del sistema es vinculante.

## Estado

Slice vertical funcionando sobre datos reales: de 252 observaciones de daño de
ICube-SERTIT en Pereira a un portafolio de inversión explicado y exportable, en
~12 s.

```
252 observaciones  →  113 sitios  →  72 candidatos  →  12 proyectos
   (evidencia)        (agrupadas)    (41 excluidos)     (10,2 MM COP)
```

Lo que ya corre: ingesta versionada con registro de licencias · fusión de
evidencia multifuente (ADR-16) · grafo peatonal con pgRouting y catchments de
red · restricciones duras antes del scoring · modelo ponderado con
descomposición exacta y contrafactuales · optimizador greedy con redundancia y
equidad · API versionada con procedencia obligatoria · visor cartográfico
denso en datos · exportes con puerta de licencia por perfil.

98 pruebas, lint y fronteras de módulo verificadas en CI. Arranque en
[CONTRIBUTING.md](CONTRIBUTING.md).

### ¿Es esto accionable hoy?

En parte, y el sistema lo mide en vez de opinarlo (`scripts/checks/signal_check.py`):

- ✅ **El inventario de evidencia de daño sí.** 113 sitios derivados de 252
  observaciones reales, cada una con fuente, método, fecha y licencia.
- ❌ **El orden de prioridad no.** Al regenerar las capas simuladas con otra
  semilla, el top-20 conserva 3 de 20 sitios: hoy el ranking describe el
  generador, no Pereira.

Detalle y qué haría falta para cambiarlo, en [estado actual](docs/plan/estado-actual.md).

Siguen abiertas **ocho decisiones con dueño** en
[antes de empezar](docs/plan/antes-de-empezar.md), varias de las cuales cambian
premisas del PRD.

> Las capas de población, riesgo y uso de suelo son **simuladas**: no existen
> como capa publicada para Pereira. La evidencia de daño y el contexto urbano
> de OSM son reales. El sistema lo declara capa por capa en cada respuesta, en
> cada export y en el propio mapa.

La V1 **no entrega una aplicación web de propósito general**: entrega una API versionada, un paquete de evidencia exportable y un único visor cartográfico hecho a medida. El razonamiento está en [ADR-15](docs/adr/ADR-15-sin-frontend-generico.md).

## Documentación

**Producto**

| Documento | Qué define |
|---|---|
| [PRD](docs/product/prd.md) | Qué es el producto y por qué |
| [SRS](docs/product/srs.md) | Qué debe hacer el sistema, bajo qué restricciones, y cómo se demuestra cada requisito |
| [ARD](docs/product/ard.md) | Cómo se construye y por qué, decisión por decisión |

**Planificación**

| Documento | Qué define |
|---|---|
| [Plan de MVP](docs/plan/mvp-plan.md) | Recorte de alcance, hitos con puertas verificables, decisiones abiertas y sus defectos |
| [Backlog](docs/plan/backlog.md) | Épicas y unidades de trabajo, trazadas a requisitos del SRS |
| [Inventario de datos](docs/plan/data-inventory.md) | Disponibilidad real por capa — entregable de Fase 0 |
| [Antes de empezar](docs/plan/antes-de-empezar.md) | **Léelo primero.** Lo que hay que saber, decidir o verificar antes del primer commit |
| [Estado actual](docs/plan/estado-actual.md) | Qué entrega hoy el sistema, qué es accionable y qué quedó fuera — con el diagnóstico de señal medido |
| [Fuentes](docs/plan/fuentes.md) | Consumo técnico y régimen de licencia de cada fuente, con los controles que lo hacen cumplible |
| [Conexiones](docs/plan/conexiones.md) | Endpoints verificados y recetas de conexión por fuente |

**Decisiones posteriores al ARD**

| ADR | Decisión |
|---|---|
| [ADR-15](docs/adr/ADR-15-sin-frontend-generico.md) | La V1 no entrega una aplicación web de propósito general |
| [ADR-16](docs/adr/ADR-16-evidencia-de-dano-multifuente.md) | El daño es evidencia multifuente, no un atributo del sitio |

## Principios que gobiernan el diseño

- **Evidencia sobre opinión.** Toda recomendación se apoya en evidencia espacial medible.
- **El territorio es el modelo de datos.** El mapa no es decoración.
- **Restricciones duras antes que el modelo.** Un candidato inválido nunca se rescata con un score alto.
- **La incertidumbre es una feature.** Confianza y calidad de datos se comunican explícitamente, nunca se ocultan.
- **Todo se explica.** Ningún score se expone sin su descomposición.
- **Humano en el bucle.** La plataforma soporta decisiones públicas; no las reemplaza.
- **La procedencia manda.** Cada dato lleva su fuente, su versión y su licencia hasta el último export.

## Estructura

```
src/uri/          contracts · ingestion · features · constraints · scoring
                  optimizer · reporting · api   (fronteras forzadas por CI)
apps/viewer/      visor de decisión: mapa interactivo, tabla densa, detalle
db/migrations/    esquema core · analytics · osm_raw · osm_derived
scripts/          dev_db · migrate · run_pipeline · serve · build_static · checks
docs/             producto (PRD/SRS/ARD) · planificación · ADR
```

## Arquitectura en una línea

Monolito modular en FastAPI sobre Supabase (PostgreSQL + PostGIS + pgRouting + pgmq), con el trabajo espacial pesado ejecutándose dentro de la base de datos y Python orquestando. Ver [ARD](docs/product/ard.md).
