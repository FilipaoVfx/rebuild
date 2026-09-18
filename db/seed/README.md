# Extractos archivados

## `osm_pereira.json.gz`

Extracto de OpenStreetMap del AOI de Pereira, obtenido vía Overpass con la
consulta de `pereira.overpass`. 6.695 vías peatonales, 129 espacios verdes y
58 equipamientos.

**Está versionado en el repositorio a propósito.** `fuentes.md` §11, regla 3:
OSM no versiona aguas arriba, así que el artefacto descargado es la única
forma de reconstruir una `data_version`. Sin él, `NFR-REPRO-01` es falso para
toda feature que dependa de la red peatonal — que son casi todas — y el
despliegue depende de que un servicio de terceros esté en pie ese día.

Licencia: **ODbL 1.0** — © OpenStreetMap contributors. Redistribuible con
atribución; el aislamiento en los esquemas `osm_raw` / `osm_derived` acota la
obligación de *share-alike* (`fuentes.md` §8).

Para refrescarlo:

```bash
curl -X POST --data-urlencode "data@db/seed/pereira.overpass" \
  https://overpass.kumi.systems/api/interpreter \
  | gzip -9 > db/seed/osm_pereira.json.gz
```

Refrescarlo es publicar una `data_version` nueva, no editar la anterior.

El extracto de **lugares** (`pereira_places.overpass`) va aparte a propósito:
este alimenta el grafo peatonal y la matriz de features, y aquel solo nombra y
delimita. Se refresca igual:

```bash
curl -X POST -A "uri-pipeline/0.1" --data-urlencode "data@db/seed/pereira_places.overpass" \
  https://overpass-api.de/api/interpreter \
  | gzip -9 > db/seed/osm_places_pereira.json.gz
```

Las capas municipales se refrescan con `scripts/fetch_pereira_sig.py`, que
pasa por el control C1 antes de escribir un byte.

## Los demás extractos

| Archivo | Fuente | Licencia |
|---|---|---|
| `copernicus_emsr916_aoi02.json.gz` | Copernicus EMS, activación EMSR916 (grading) — 182 edificaciones, AOI y vías | CC BY 4.0 |
| `ms_buildings_pereira.geojson.gz` | Microsoft Building Footprints — 15.024 huellas | **ODbL** (share-alike, igual que OSM) |
| `osm_landuse_pereira.json.gz` | OpenStreetMap, `landuse` del AOI — 219 polígonos | ODbL 1.0 |
| `megabus_estaciones.json` | Megabús — estaciones | `UNCLEAR`, sin auditar (OI-F2). **El adaptador no está cableado** |
| `osm_places_pereira.json.gz` | OpenStreetMap, lugares del AOI + ~0,01° — 437 límites administrativos (perímetro urbano, comunas, barrios), 47 nombres de lugar, 135 ríos y quebradas, 164 hitos, 148 arterias (ADR-22) | ODbL 1.0 |
| `natural_earth_colombia_risaralda.geojson.gz` | Natural Earth — contornos de Colombia (50m) y Risaralda (10m) para el localizador | **Dominio público** (`db/terms/natural_earth_terms_20260918.txt`) |
| `pereira_sig_equipamientos.geojson.gz` | Alcaldía de Pereira, SIGPER — "Equipamientos actual", 332 polígonos con nombre y tipo | Datos abiertos, Ley 1712 de 2014, con atribución (`db/terms/pereira_sig_20260918.txt`) |
| `pereira_sig_espacio_publico.geojson.gz` | Alcaldía de Pereira, SIGPER — "Espacio Público actual", 341 polígonos. **Sin el campo `DIRECCION`**: no se pide ni se archiva | Ídem |
| `pereira.overpass`, `pereira_landuse.overpass`, `pereira_places.overpass` | Consultas Overpass que reproducen los tres extractos de OSM | — |

Cada uno se refresca publicando una `data_version` nueva, nunca editando la
anterior: `core.dataset_version` es inmutable por trigger (`FR-ING-02`).

## Lo que se borró, y por qué

`sgc_amenaza_pereira.json` **ya no está.** Los términos del portal del SGC
prohíben reproducir, publicar o distribuir su contenido sin consentimiento
previo por escrito, así que archivarlo en un repositorio público era
redistribuirlo. La capa se retiró del pipeline y la fuente se reclasificó a
`NON_COMMERCIAL`; la copia de los términos está en
`db/terms/sgc_terminos_20260915.txt`. Ver
[ADR-18](../../docs/adr/ADR-18-retirada-de-la-capa-del-sgc.md).

**La regla que esto deja:** antes de archivar un extracto aquí, comprobar que
su fuente permite redistribución. `db/seed/` es parte de un repositorio
público; poner un archivo aquí es publicarlo.
