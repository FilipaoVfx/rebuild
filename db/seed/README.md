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
