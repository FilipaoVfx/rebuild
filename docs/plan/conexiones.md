# Conexiones a fuentes — recetas verificadas

**Complemento técnico de [fuentes.md](./fuentes.md).** Aquel documento dice qué se puede usar y bajo qué licencia; este dice **cómo se conecta**, con lo que se comprobó realmente contra los servicios.

**Verificado el 2026-09-13.** Cada bloque marca su estado:

- ✅ **Verificado** — se llamó al servicio y respondió lo que dice aquí
- 🟡 **Parcial** — el servicio responde, falta confirmar capas o términos concretos
- ⬜ **Sin verificar** — pendiente de E0-9

Los endpoints cambian. Antes de construir un adaptador sobre cualquiera de estos, vuelve a llamarlo.

---

## 1. SGC — Servicio Geológico Colombiano ✅

La fuente mejor servida de todas, y la que más se subestimó en el ARD: **no es solo WMS, publica WFS 2.0.0 real**.

**Directorio de servicios ArcGIS REST**

```
https://geoportal.sgc.gov.co/arcgis/rest/services?f=json
https://srvags.sgc.gov.co/arcgis/rest/services?f=json     # espejo, mismo contenido
```

Responde `200 application/json`. 54 carpetas. Las relevantes:

```
Amenaza_Sismica                          amenaza sísmica nacional por periodo de retorno
Zonas_amenaza_Sismica_NR10               zonificación NSR-10
Zonificacion_Sismica_Intensidad_Esperada
Mapa_Intensidad_Maxima_Observada_Colombia
Mapa_Nacional_Amenaza_Mov_Masa_100K      movimientos en masa, escala 1:100.000
Zonificacion_Amenazas_Mov_Masa           ⚠ solo contiene Cardique (Bolívar), NO Risaralda
SIMMA                                    inventario de movimientos en masa
catalogo_sismos · sismicidad_historica_2 · PortalSismos
Geologia · Mapa_Geologico_Colombia_2015
```

**Servicios de amenaza sísmica** (todos `MapServer`):

```
Amenaza_Sismica/Amenaza_Sismica_Nacional
Amenaza_Sismica/Mapa_Amenaza_Sismica_Nacional_PGA{75,225,475,975,2475}
Amenaza_Sismica/Periodo_Retorno_{75,225,475,975,2475}
```

`Amenaza_Sismica_Nacional` declara `capabilities: Map,Query,Data` y `supportedExtensions: WFSServer, WMSServer`. Sus capas: `0 Valor Amenaza`, `2 Municipios`, `6 Modelo de fuentes sismogénicas`, `10 PGA75`, entre otras.

**La ruta del WFS no es la del REST.** Esto cuesta una tarde si no se sabe:

```bash
# ✅ funciona — WFS 2.0.0
curl "https://geoportal.sgc.gov.co/arcgis/services/Amenaza_Sismica/Amenaza_Sismica_Nacional/MapServer/WFSServer?service=WFS&request=GetCapabilities"

# ❌ devuelve HTML, no capabilities
curl "https://geoportal.sgc.gov.co/arcgis/rest/services/.../MapServer/WFSServer?..."
```

`/arcgis/services/…` para OGC; `/arcgis/rest/services/…` para la API REST de Esri. Misma capa, dos puertas.

**Cómo consumirlo.** Vía WFS con `GetFeature`, `typeNames` del capabilities y `count`/`startIndex` para paginar; registrar endpoint y parámetros exactos en la procedencia (`FR-ING-05`). Alternativa REST: `/MapServer/{layerId}/query?where=1=1&outFields=*&f=geojson&geometry={bbox}&geometryType=esriGeometryEnvelope`, que devuelve GeoJSON directamente y suele ser más cómodo, pero pagina con `resultOffset` y tiene tope de registros por petición — hay que leer `maxRecordCount` del servicio y respetarlo.

> ⚠️ **La advertencia que importa.** Esto es amenaza **nacional**, a escalas pensadas para aplicar la NSR-10, no para decidir sobre un predio. Y la zonificación de movimientos en masa publicada como servicio cubre Cardique, no Risaralda. Para `risk_score` a nivel de sitio esto es un sustituto pobre. Ver D6 en [antes-de-empezar.md](./antes-de-empezar.md).

---

## 2. Datos.gov.co — portal nacional ✅

API Socrata operativa, en dos niveles.

**Catálogo** — para descubrir datasets:

```bash
curl "https://api.us.socrata.com/api/catalog/v1?q=Pereira&limit=50"
# resultSetSize: 441
```

Devuelve `results[].resource.id` (el *four-by-four*, p. ej. `ebsr-7cb7`), nombre, descripción y metadatos.

**Recurso** — para leer datos (SODA v2.1):

```bash
curl "https://www.datos.gov.co/resource/{id}.json?\$limit=1000&\$offset=0"
curl "https://www.datos.gov.co/resource/{id}.json?\$where=municipio='PEREIRA'&\$select=..."
```

SODA soporta `$select`, `$where`, `$order`, `$limit`, `$offset` y `$q`. **Usa paginación explícita**: el límite por defecto es bajo y trunca en silencio, que es la forma más fácil de ingerir un dataset incompleto sin enterarse.

Datasets confirmados como existentes y relevantes:

```
ebsr-7cb7   Barrios por comunas en la ciudad de Pereira
i7af-xzdr   Veredas de la ciudad de Pereira
upu2-u87w   Archivo secuencial catastro Pereira, Risaralda
w6sc-6cef   Estaciones Sistema Integrado de Transporte PEREIRA
```

**Nota de adaptador:** aunque el portal es claro en sus términos, cada dataset puede declarar su propia licencia en el metadato. El adaptador lee el bloque de licencia del dataset, no asume el del portal (ver `fuentes.md` §7.2).

**Regístrate para obtener un App Token.** Sin él las peticiones van por un carril con límite compartido y agresivo. Va en la cabecera `X-App-Token`, y nunca en el código fuente (`NFR-SEC-02`).

---

## 3. datosdelterremoto.org — evidencia de daño agregada ✅

La fuente de daño más útil disponible hoy, y la única con datos reales de Pereira. Todo descarga sin autenticación.

```
https://datosdelterremoto.org/data/public/crosscheck.csv          cruce por AOI
https://datosdelterremoto.org/data/public/monitor.json            estado completo del monitor
https://datosdelterremoto.org/data/public/rud.json                serie del registro oficial
https://datosdelterremoto.org/data/public/sertit_damage.geojson   512 puntos
https://datosdelterremoto.org/data/public/unosat_damage.geojson   548 puntos
https://datosdelterremoto.org/data/public/divipola_coords.json    catálogo municipal
https://datosdelterremoto.org/data/public/municipios_mapa.json
https://datosdelterremoto.org/data/public/alerts.rss
```

Repositorio: `github.com/18orkidea/monitor-terremoto-colombia`.

**`sertit_damage.geojson`** — 512 puntos. Propiedades:

```
municipio · departamento · dano · tipo · sensor · sensor_date
metodo · copyright · producto_id · capa
```

```
dano       Damaged · Destroyed · Possibly damaged · Not Applicable
tipo       Residential · Commercial · Educational · Hospital · Industrial ·
           Recreational · Religious · Sport hall
sensor     Pleiades          metodo  Photo-interpretation
copyright  © ICube-SERTIT 2026        (en los 512 registros)
municipio  Pereira 252 · Cali 103 · Roldanillo 77 · La Virginia 49 · Manizales 31
```

**`unosat_damage.geojson`** — 548 puntos. Propiedades:

```
municipio · departamento · dano · dano_agrupado · sensor · sensor_date
confianza · validacion_campo · event_code · productos · capa
```

```
dano              Damage · Damaged · Possible Damage
confianza         Medium · To Be Evaluated · Uncertain
validacion_campo  Not yet field validated    (en los 548 registros)
event_code        EQ20260810COL · EQ20260822COL
municipio         Zarzal 201 · Manizales 135 · Viterbo 108 · Anserma 104
```

**Tres cosas que el adaptador tiene que hacer bien:**

1. **La geometría es `Point`.** El contrato del `SRS §6` pide `Polygon/MultiPolygon`. Hasta que se descongele (D5), esto no encaja.
2. **Los vocabularios de daño no coinciden**, y dentro de UNOSAT conviven `Damage` y `Damaged` en el mismo campo. El crosswalk a `damage_class` es configuración versionada, no un `CASE WHEN` escondido en el adaptador.
3. **`copyright` viaja por registro.** `© ICube-SERTIT 2026` resuelve contra `original_source`, no contra `source`. Es exactamente el caso que ADR-16 modela, y el que la puerta de export de `fuentes.md` §6 tiene que bloquear.

**Cobertura en Pereira, medida:** SERTIT 252 puntos, todos residenciales (121 `Damaged`, 85 `Possibly damaged`, 46 `Destroyed`), en un AOI de **1,85 × 1,39 km** (lon −75,7022…−75,6855, lat 4,8021…4,8146). UNOSAT no cubre Pereira. Copernicus reporta 182 edificios afectados en el cruce agregado.

---

## 4. UNGRD / RUD — registro oficial de damnificados 🟡

La única fuente con cobertura nacional real del daño: 409 municipios, 364.670 familias, 778.279 personas, 19.142 viviendas destruidas, 119.752 averiadas (corte 2026-09-11).

```
https://rud.gestiondelriesgo.gov.co/       → 302, probablemente tras autenticación
https://portal.gestiondelriesgo.gov.co/    → 200
```

También expuesto parcialmente vía Socrata y vía ArcGIS de la UNGRD, según el monitor.

> 🛑 **Antes de escribir una línea de adaptador**, resuelve D3 de [antes-de-empezar.md](./antes-de-empezar.md). Esto es un registro de personas damnificadas. Entra agregado por unidad espacial con el umbral de `FR-PII-03`, o no entra. No hay tercera opción, y el test léxico de `FR-PII-01` no te va a avisar.

---

## 5. DANE — población y geografía censal 🟡

```
https://geoportal.dane.gov.co/                      → 200
https://geoportal.dane.gov.co/descargas/            descarga del MGN
```

El **Marco Geoestadístico Nacional** se descarga como paquete comprimido con siete niveles geográficos, en versiones 2005, 2012, 2017 y 2018, e integrado con variables del CNPV 2018. El geoportal también anuncia geoservicios web; las rutas concretas hay que sacarlas del propio portal en E0-9.

Buena parte del MGN está espejado en el catálogo del ICDE y en Datos.gov.co, que suele ser una vía de acceso más estable que el geoportal.

**Pendiente crítico (OI-F4):** a qué nivel está la población — manzana o sector. Decide la precisión de la imputación dasimétrica y el umbral efectivo de `FR-PII-03`.

**Reproyección:** el MGN viene en MAGNA-SIRGAS. Almacenar en EPSG:4326, operar métrica en EPSG:3116.

---

## 6. IDE AMCO — POT, uso de suelo, catastro 🟡

```
https://ideamco.gov.co/            → 200
https://ideamco.gov.co/geovisor/ideep.php?mun=pereira
```

La IDE del Área Metropolitana Centro Occidente cubre Pereira, Dosquebradas y La Virginia. El geovisor existe y responde. **Lo que no está confirmado es si publica WFS/WMS consumible o solo visor**, y esa es la pregunta que más peso tiene de todo `E0-9`: de ella dependen `land_use_compatibility` —feature bloqueante— y la resolución de barrio y comuna que exige el contrato de daño.

Ruta alternativa mientras tanto: `ebsr-7cb7` (barrios por comuna) y `upu2-u87w` (catastro) en Datos.gov.co dan parte de lo mismo, sin POT.

Si AMCO no publica servicios OGC, `FR-ING-05` pierde su caso principal y `E1-4` cambia de tamaño. Conviene preguntarlo por oficio en la semana 1, no descubrirlo en la semana 6.

**Verificado 2026-09-24 — sí publica.** 🟢 red / 🔴 licencia

```
https://geo.ideamco.gov.co:8443/geoserver/amco/wfs?service=WFS&version=2.0.0&request=GetCapabilities   → 200, 399 capas
https://geo.ideamco.gov.co:8443/geoserver/amco/wms?service=WMS&request=GetCapabilities                 → 200
```

Las capas que sirven: `pot_sectores_normativos` (tratamiento y área de actividad, 112 de 115 sitios), `pot_microzonificacion_sismica` y `pere_zonsism` (Pereira, dos versiones) y `dosq_zonsism` (Dosquebradas). El bloqueo por el puerto 8443 que registraba `estado-actual.md` ya no se reproduce. Lo que bloquea es la licencia: el servicio no declara ninguna. Ver [ADR-26](../adr/ADR-26-el-pot-se-lee-de-ide-amco-con-criterio-declarado.md) y el [derecho de petición](derecho-de-peticion-amco.md).

---

## 7. OpenStreetMap — red peatonal y contexto urbano 🟡

**Extracto regional, nunca la API de edición.**

```
https://download.geofabrik.de/south-america/colombia-latest.osm.pbf
```

Geofabrik responde a través del proxy de esta sesión de forma inconsistente; desde una red normal es un espejo estable. Alternativas: BBBike para recortes por bbox, o un recorte propio con `osmium extract`.

**Pipeline:**

```bash
osmium extract -b -75.80,4.72,-75.60,4.88 colombia-latest.osm.pbf -o pereira.osm.pbf
osm2pgsql -d $DB --slim --hstore -S default.style pereira.osm.pbf
# grafo peatonal → tablas pgRouting → pgr_drivingDistance (ADR-02)
```

**Tres reglas** (detalle en `fuentes.md` §7.3 y §8):

1. **Archivar el `.pbf` de cada `data_version`.** OSM no versiona aguas arriba; sin el extracto archivado, `NFR-REPRO-01` es falso para toda feature que dependa de la red, que son casi todas.
2. **Esquemas `osm_raw` y `osm_derived` aparte** desde M1, por el share-alike de ODbL. Después es rediseño.
3. **Nunca `tile.openstreetmap.org` en un entorno desplegado.** Servimos nuestros tiles (ADR-10).

---

## 8. Copernicus EMS ⬜

Activación de este evento: **`EMSR916`**.

```
https://emergency.copernicus.eu/mapping/list-of-components/EMSR916
```

Los términos viajan **en el paquete de entrega de cada producto**, no en la página del servicio. Ahí es donde hay que mirar, y ahí es donde va el snapshot de `terms_snapshot_path`.

Mientras no se verifique: Tier B, evidencia citada, nunca redistribuida.

---

## 9. IDEAM, CARDER, Megabús ⬜

| Fuente | Estado | Nota |
|---|---|---|
| IDEAM | ⬜ | Prioridad baja: ninguna feature de la V1 depende de ella |
| CARDER | ⬜ | Áreas protegidas como restricción dura; si se usa como dura, su ausencia es parada total |
| Megabús | 🟡 | Publica una sección de "Rutas Datos Abiertos" en `megabus.gov.co`; formato por confirmar. `w6sc-6cef` en Datos.gov.co tiene las estaciones del SIT de Pereira. **GTFS no confirmado** — y no hace falta para la V1, que modela tránsito como proximidad (ADR-03) |

---

## 10. Chequeo rápido de salud

Para meter en CI como *smoke test* de disponibilidad de fuentes, y como implementación mínima del `FR-EXT-01`:

```bash
#!/usr/bin/env bash
# Cada línea: un servicio del que depende una feature.
set -u
check() { printf '%-58s ' "$2"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 30 "$1"; }

check "https://geoportal.sgc.gov.co/arcgis/rest/services?f=json"              "SGC ArcGIS REST"
check "https://geoportal.sgc.gov.co/arcgis/services/Amenaza_Sismica/Amenaza_Sismica_Nacional/MapServer/WFSServer?service=WFS&request=GetCapabilities" "SGC WFS"
check "https://api.us.socrata.com/api/catalog/v1?q=Pereira&limit=1"           "Datos.gov.co catalogo"
check "https://www.datos.gov.co/resource/ebsr-7cb7.json?\$limit=1"            "Datos.gov.co recurso"
check "https://datosdelterremoto.org/data/public/crosscheck.csv"              "Monitor terremoto"
check "https://geoportal.dane.gov.co/"                                        "DANE geoportal"
check "https://ideamco.gov.co/"                                               "IDE AMCO"
```

Un 200 no significa que la capa siga ahí ni que los campos no hayan cambiado. Significa que el servicio está en pie. Para lo demás está el dataset golden de `E3-13`.
