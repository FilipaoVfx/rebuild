# Recortes Sentinel del AOI

Salida de `scripts/fetch_sentinel.py`. Un GeoTIFF por escena seleccionada,
recortado al AOI y en `float32` sin reescalar: un índice espectral cuantizado
a 256 niveles pierde justo la diferencia pequeña que un análisis de cambio
busca.

```
sentinel1/{pre,post}/   VV, VH
sentinel2/{pre,post}/   B02 B03 B04 B08 B11 B12
```

## Los `.tif` no se versionan

El repositorio guarda la estructura y el catálogo; las imágenes se
reconstruyen. `core.satellite_scene` conserva `scene_id`, `collection`,
`acquisition_date` y `request_parameters` completos, así que cualquiera puede
volver a pedir **exactamente** la misma escena con el mismo recorte. Un binario
de decenas de MB por escena en git no añade reproducibilidad: la añade el
`scene_id` con sus parámetros.

Es la diferencia con `db/seed/`, que sí se versiona: OSM no versiona aguas
arriba y sin el extracto no hay forma de reconstruir una `data_version`. CDSE
sí lo hace, por `scene_id`.

## Atribución obligatoria

Reglamento (UE) 1159/2013, art. 8. Todo lo que sale de aquí está recortado al
AOI, o sea **modificado**, así que la nota correcta es:

> Contains modified Copernicus Sentinel data 2026

No la de dato crudo. Está en `source_register.attribution_text` y viaja a cada
export.

## Esto no es daño

Un cambio de retrodispersión o de NDVI entre dos fechas es un cambio en la
señal. Una demolición, una obra nueva, una cosecha, un suelo mojado y un techo
repintado producen cambios comparables. Lo que se derive de estas capas se
llama `change_score` y, cuando se cruce con huellas de edificio,
**DAMAGE_EVIDENCE** — nunca `CONFIRMED_DAMAGE`. `core.satellite_observation`
tiene un `CHECK` que rechaza cualquier banda cuyo nombre contenga `damage` o
`daño`.
