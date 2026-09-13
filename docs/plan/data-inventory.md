# Inventario de datos — Fase 0

**Estado:** plantilla vacía, a completar durante M0 (E0-9)
**Entregable de:** PRD §53 Fase 0
**Requisitos:** `FR-ING-01`, `FR-LIC-01`

Este documento es la puerta de M0. Mientras una fila diga "por verificar", el hito que depende de esa capa no puede planificarse con honestidad.

## Cómo se llena cada fila

| Columna | Qué va |
|---|---|
| **Disponibilidad** | `confirmada` (descargada y abierta) · `probable` (existe, sin acceso aún) · `por verificar` · `no existe` |
| **Acceso** | WFS · WMS · descarga directa · solicitud formal · scraping · generada |
| **Licencia** | Licencia y texto de atribución exacto, o `pendiente` |
| **Actualización** | Frecuencia declarada por la fuente, para las alertas de obsolescencia de `FR-QUAL-02` |
| **Modo degradado** | `parada total` · `omisión + penalización de confianza` · `fallback documentado` (`FR-DEG-01`) |
| **Bloquea** | Hito y features que dependen de ella |

---

## Capas requeridas

| Capa | Fuente | Disponibilidad | Acceso | Licencia | Actualización | Modo degradado | Bloquea |
|---|---|---|---|---|---|---|---|
| Daño / demolición post-sismo | Municipio (no existe, CON-01) | `no existe` | generada | interna | — | parada total | M2, todo |
| Población y hogares | DANE | por verificar | | | | omisión + penalización | M3 · `population_10min`, `households_10min` |
| Geografía censal (manzanas/sectores) | DANE | por verificar | | | | parada total | M3 · imputación poblacional |
| POT / uso de suelo | IDE AMCO | por verificar | WFS? | | | **parada total** | M4 · `land_use_compatibility` |
| Barrios y comunas | IDE AMCO | por verificar | WFS? | | | parada total | M1 · resolución de referencias administrativas |
| Predios / catastro | IDE AMCO | por verificar | | | | omisión | M3 · `building_density` |
| Microzonificación sísmica | SGC | por verificar | | | | **parada total** | M4 · `risk_score` |
| Amenaza por movimientos en masa | SGC / CARDER | por verificar | | | | **parada total** | M4 · `risk_score` |
| Red peatonal | OSM | probable | descarga directa | ODbL | continua | fallback a buffer | M3 · catchments, `pedestrian_accessibility` |
| Parques y áreas verdes | AMCO + OSM | por verificar | | | | omisión + penalización | M3 · `park_deficit` |
| Equipamientos (educación, salud, deporte) | AMCO + OSM | por verificar | | | | omisión | M3 · `school_access`, `health_access` |
| Edificaciones | OSM / catastro | por verificar | | | | fallback proporcional por área | M3 · imputación dasimétrica |
| Estaciones Megabús + frecuencia | Megabús | por verificar | | | | omisión | M3 · `transit_proximity` |
| Restricciones ambientales | CARDER | por verificar | | | | omisión | M4 · restricciones duras |
| Hidrología / inundación | IDEAM | por verificar | | | | omisión | M4 · restricciones blandas |

---

## Preguntas que el inventario tiene que responder antes de cerrar M0

1. ¿IDE AMCO publica WFS operativo, o hay que trabajar con descargas manuales? Decide E1-4 y el valor real de `FR-ING-05`.
2. ¿A qué resolución espacial está disponible la población del DANE? Si es sector y no manzana, la imputación dasimétrica (OI-07) cambia de precisión y `FR-PII-03` cambia de umbral efectivo.
3. ¿Qué tan completa es la red peatonal de OSM por comuna? Es la entrada directa de **R5** y hay que medirlo antes de construir nada encima.
4. ¿Existe una capa oficial de espacio público efectivo, o hay que derivarla de parques + OSM? Decide si OI-04 es una cifra que alguien firma o un supuesto nuestro.
5. ¿Qué licencia tiene cada capa de AMCO y SGC, y permite redistribución dentro de un export? Es `FR-LIC-01`, y aparece en cada PDF que salga del sistema.
