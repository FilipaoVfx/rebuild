# Recortes Sentinel del AOI

Salida de `scripts/fetch_sentinel.py`. Un GeoTIFF por escena seleccionada,
recortado al AOI y en `float32` sin reescalar: un índice espectral cuantizado
a 256 niveles pierde justo la diferencia pequeña que un análisis de cambio
busca.

```
sentinel1/{pre,post}/   VV, VH
sentinel2/{pre,post}/   B02 B03 B04 B08 B11 B12
```

## Dos productos, y no se mezclan

Cada escena elegida produce **dos** archivos, y la distinción es deliberada:

| archivo | para qué | escala |
|---|---|---|
| `.tif` | alimentar los índices de cambio | `float32` sin reescalar |
| `.png` | mirarlo en el visor | 8 bits, ya estirado |

El estiramiento del PNG es una decisión de presentación: cambia cómo se ve y
no cambia lo que se mide. Si el mismo archivo sirviera para las dos cosas,
quien mirase la imagen realzada creyendo ver el dato estaría midiendo el
contraste que le puso la rampa. Por eso salen de evalscripts distintos y cada
uno guarda su propio `evalscript_sha256` en la procedencia.

S2 va en verdadero color (B04/B03/B02, ganancia 2.5). S1 en la composición
VV / VH / cociente, que separa lo construido de la vegetación y el agua. Los
dos llevan `dataMask` en el alfa: fuera de la huella el píxel es transparente
y no negro, que se leería como suelo oscuro.

## Los `.tif` no se versionan

El repositorio guarda la estructura y el catálogo; las imágenes se
reconstruyen. `core.satellite_scene` conserva `scene_id`, `collection`,
`acquisition_date` y `request_parameters` completos, así que cualquiera puede
volver a pedir **exactamente** la misma escena con el mismo recorte. Un binario
de decenas de MB por escena en git no añade reproducibilidad: la añade el
`scene_id` con sus parámetros.

Los `.png` de vista **sí** se versionan, junto con `previews.json`. Ahí el
criterio se invierte: el sitio publicado los sirve tal cual, y hacer que cada
despliegue de Pages dependa de que CDSE responda ese día es exactamente lo que
ya falló una vez con Overpass. Pesan pocos cientos de KB.

Es la diferencia con `db/seed/`, que sí se versiona: OSM no versiona aguas
arriba y sin el extracto no hay forma de reconstruir una `data_version`. CDSE
sí lo hace, por `scene_id`.

## Atribución obligatoria

Reglamento (UE) 1159/2013, art. 8. Todo lo que sale de aquí está recortado al
AOI, o sea **modificado**, así que la nota correcta es:

> Contains modified Copernicus Sentinel data 2026

No la de dato crudo. Está en `source_register.attribution_text` y viaja a cada
export.

## Las imágenes sí llegan al visor; el veredicto no

La versión original de este pipeline prohibía enviar imágenes al frontend. Esa
restricción se levantó de forma explícita. Lo que **no** se levantó es nada de
lo de abajo: la imagen se publica etiquetada como observación, con su fecha y
su motivo de selección al lado, y el texto de limitación viaja con ella hasta
la pantalla en vez de quedarse aquí.

## Esto no es daño

Un cambio de retrodispersión o de NDVI entre dos fechas es un cambio en la
señal. Una demolición, una obra nueva, una cosecha, un suelo mojado y un techo
repintado producen cambios comparables. Lo que se derive de estas capas se
llama `change_score` y, cuando se cruce con huellas de edificio,
**DAMAGE_EVIDENCE** — nunca `CONFIRMED_DAMAGE`. `core.satellite_observation`
tiene un `CHECK` que rechaza cualquier banda cuyo nombre contenga `damage` o
`daño`.
