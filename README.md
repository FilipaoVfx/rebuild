# Urban Recovery Intelligence

Plataforma de inteligencia espacial para decisiones de recuperación urbana post-desastre.

**Caso:** Pereira, Risaralda — municipio afectado por el sismo M7,4 del 10 de agosto de 2026, con epicentro en San José del Palmar, Chocó (Copernicus `EMSR916`, USGS `us6000tjl2`).

> El PRD, el SRS y el ARD describen el caso como "el sismo de Pereira". No lo fue: Pereira es uno de los 409 municipios afectados por un evento regional. Ver [antes de empezar](docs/plan/antes-de-empezar.md) §1.

La pregunta que el sistema responde:

> ¿Dónde intervenir, qué construir allí, por qué, cuánto valor genera, y qué combinación de sitios produce el mejor resultado a escala de ciudad?

No es una IA que decide qué debe construir una ciudad. Es una capa de soporte a la decisión: convierte datos territoriales, demográficos, de infraestructura, riesgo y disponibilidad de suelo en escenarios explicables y optimizados. Toda salida es consultiva (CON-05); ninguna decisión del sistema es vinculante.

## Estado

En planificación. No hay código todavía.

Antes de escribirlo hay **ocho decisiones abiertas con dueño** en [antes de empezar](docs/plan/antes-de-empezar.md), varias de las cuales cambian premisas del PRD.

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

## Arquitectura en una línea

Monolito modular en FastAPI sobre Supabase (PostgreSQL + PostGIS + pgRouting + pgmq), con el trabajo espacial pesado ejecutándose dentro de la base de datos y Python orquestando. Ver [ARD](docs/product/ard.md).
