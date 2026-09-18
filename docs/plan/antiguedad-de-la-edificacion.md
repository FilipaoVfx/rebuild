# Año de construcción de la edificación — qué existe, con qué licencia, y qué no

Research del 2026-09-18, a pedido del dueño. Pregunta: ¿hay fuentes oficiales con
el año de construcción de cada edificación en Pereira?

**Respuesta corta:** el dato existe, es catastral, y no está publicado. Lo tiene el
gestor catastral (AMCO) como atributo de la unidad de construcción; lo que AMCO y
la Alcaldía publican como dato abierto no lo incluye. Lo que sí hay con licencia
abierta son **aproximaciones por época** (cuándo se urbanizó una celda), no un año
por edificio, y hay que presentarlas como tal.

## 1. La fuente oficial: el catastro

| Qué | Dónde | Año de construcción | Licencia | Veredicto |
|---|---|---|---|---|
| Unidad de construcción, modelo LADM-COL (`LC_UnidadConstruccion.Anio_Construccion`; en el modelo IGAC clásico, "vetustez" del Registro 2) | Base catastral de **AMCO**, gestor catastral de Pereira por Res. IGAC 1149/2021 | **Sí**, por unidad | No publicado | Pedirlo. AMCO ya publica el Registro 1 bajo CC BY-SA 4.0 (abajo), así que un pedido del R2 / export LADM con `anio_construccion` agregado a manzana tiene precedente. |
| "ARCHIVO SECUENCIAL CATASTRO PEREIRA RISARALDA" (Registro 1) — 185.313 predios, actualizado 2020-11 | datos.gov.co `upu2-u87w`, atribución AMCO | **No** (nopredial, destino económico, área terreno, área construida, y `direccion`) | CC BY-SA 4.0 | Sin año. Además trae `direccion` a nivel de predio, que FR-PII-01 rechaza y el SRS §6 prohíbe: si algún día se ingiere, sin esa columna. |
| "Construcción Catastro (AMCO 04072023)" — polígonos de construcción | ArcGIS Online de la Alcaldía, `copyrightText` "IGAC" | **No** (`name`, `area_const`) | Sin declarar | UNCLEAR, y sin el dato. |
| Licencias urbanísticas (`TC_Licencias_Urbanisticas`) — curadurías | ArcGIS Online de la Alcaldía | Fecha de licencia, no de construcción; solo obra reciente | Sin declarar | UNCLEAR. Complementario en el mejor caso. |
| Censo 2018 (CNPV) del DANE, ya ingerido por manzana | `dane_censo_2018` | **No**: el censo pregunta material de paredes y pisos, no año | Ley 1712 | No aplica. |

Conclusión: **la única fuente oficial del año por edificio es el catastro de AMCO, y
hay que pedirla.** Solicitud sugerida: export del atributo `anio_construccion` (o
vetustez) **agregado a manzana** (mediana y rango, con supresión bajo 20
unidades, misma regla que FR-PII-03), bajo la misma licencia CC BY-SA con la que ya
publican el R1. Pedirlo por predio sería pedir lo que el propio proyecto no puede
publicar (antes-de-empezar.md §3).

## 2. Aproximaciones abiertas: época de urbanización, no año

Ninguna dice cuándo se construyó **un** edificio. Dicen cuándo una celda pasó a
estar construida, con la resolución del sensor. Sirven para contexto ("este sector
se urbanizó antes de 1990") y para ordenar hipótesis; no para afirmar la edad de
una edificación concreta, y así tendrían que etiquetarse (misma regla que ADR-19
para el cambio satelital).

| Fuente | Qué da | Resolución / cobertura | Licencia | Notas |
|---|---|---|---|---|
| **GHSL GHS-BUILT-S R2023A** (JRC, Comisión Europea) | Superficie construida por época: 1975, 1990, 2000, 2014, 2018, 2020, 2025, 2030 | 100 m (10 m para 2018); global | CC BY 4.0 (JRC Data Catalogue) | La más asentada. Da "época en que la celda aparece construida". Landsat para las épocas viejas, Sentinel-2 desde 2018. |
| **World Settlement Footprint Evolution** (DLR) | Año de aparición del asentamiento, anual 1985–2015 | 30 m; global | CC BY 4.0 | Grano anual para 1985–2015; nada después. |
| **Google Open Buildings 2.5D Temporal** | Presencia, conteo fraccional y **altura** de edificios por año, 2016–2023 | 4 m efectivos; Latinoamérica incluida (Sentinel-2) | CC BY 4.0 y ODbL | Dice si una construcción existía en 2016 y su altura estimada: "posterior a 2016" es lo más fino que permite afirmar. La altura es lo que el visor no tiene (README: no hay fuente de alturas). |
| OSM `start_date` | Año de construcción declarado | Puntual; en Pereira, casi inexistente | ODbL | Anecdótico. |

Todas pasarían por `fuentes.md` §10 antes de entrar (snapshot de términos,
`attribution_text` literal). GHSL y Google Open Buildings piden solo atribución;
Google Open Buildings además está bajo ODbL para la parte derivada de OSM, así que
iría a un esquema aislado como el resto de lo ODbL.

## 3. Qué haría con esto

1. **Pedir a AMCO** el `anio_construccion` agregado a manzana (correo; no es
   ingeniería). Es la única vía al dato real.
2. Mientras tanto, si se quiere una capa de **época de urbanización**: GHSL
   GHS-BUILT-S (CC BY 4.0) recortado al AOI, como contexto en Territorio con la
   leyenda "época en que la celda aparece construida (JRC GHSL, 100 m)". Nunca
   como atributo de un sitio ni como feature del modelo: no mide lo que el
   modelo necesitaría (estado estructural), y el pipeline ya tiene la regla de
   no rellenar lo que no se midió (CONTRIBUTING, "no rellenar una feature
   ausente").
3. **Alturas**: Google Open Buildings 2.5D Temporal es la primera fuente abierta
   con altura por edificio para Pereira. Es lo que permitiría el "edificios 3D"
   que el README descarta por falta de fuente — con su etiqueta de estimación.

## 4. Lo que no se hace

- Tomar la fecha de licencia de construcción como año de construcción.
- Inferir el año a partir de la ortofoto o de Sentinel "a ojo".
- Publicar el año por predio aunque AMCO lo entregue: la unidad publicable es la
  manzana (antes-de-empezar.md §3, FR-PII-03).
