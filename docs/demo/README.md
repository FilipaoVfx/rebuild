# Demo para contraparte institucional

**`recovery-pereira-demo.mp4`** · 2:03 · 1920×1080 · narración en español · 37 MB

Recorrido narrado del visor, pensado para enviar a Planeación, DIGER o un equipo
sectorial. No es una demostración de funcionalidades: es el instrumento que
vuelve concreto el pedido de datos de [`../plan/hallazgos.md`](../plan/hallazgos.md) §5.

El vídeo termina en la petición, no en el producto.

## Guion

| # | Escena | Qué muestra | Narración |
|---|---|---|---|
| — | Portada | Título y corte | 4 s |
| 1 | Territorio | Comunas, barrios, vías y ríos sobre cartografía propia | 15 s |
| 2 | El límite | `32,8 km²` de perímetro, `21,66 km²` de visor. «No es toda la ciudad» | 19 s |
| 3 | El sismo | M7,4, epicentro a 59 km, cortina Sentinel antes/después con su limitación | 20 s |
| 4 | Las cifras | 182 observaciones · 115 sitios · 190.000 personas | 12 s |
| 5 | Una oportunidad | Barrio Corocito: lugar → problema → factores → alternativas descartadas | 31 s |
| 6 | El pedido | Vuelta al territorio: 4.543 inspecciones de campo, 25× más evidencia, 16 comunas | 17 s |

### Por qué este orden

- **1 y 2 son ADR-22**: el planificador tiene que reconocer su ciudad y saber el
  límite antes de leer un número. Declarar la cobertura antes de mostrar
  resultados es lo que separa esto de un vendedor.
- **5 es ADR-20**: el problema titula, el puntaje solo ordena. La ficha abre con
  «Barrio Corocito · Comuna Villavicencio · Carrera 10 con Calle 7», no con 69,6.
- **6** convierte el vídeo en la petición a SIGPER.

### Fuera del vídeo, deliberadamente

La lista de 105 oportunidades, el deslizador de idoneidad, la descomposición
técnica, **Escenarios y el optimizador completos** (costos sin fuente oficial y
pesos sin dueño institucional — ADR-23), el cambiador de mapa base, y encender
capas como demostración. Un visor que enseña todo lo que tiene se lee como
ruido, no como producto.

## Limitaciones conocidas

- **Sin subtítulos quemados.** La voz es Piper (offline, gratuita), que no emite
  tiempos por palabra; el subtítulo se volcaba como un párrafo entero tapando el
  tercio inferior de la pantalla. Con `ELEVENLABS_API_KEY` los subtítulos se
  sincronizan por palabra y se pueden reactivar.
- **La voz es sintética.** Para una presentación institucional conviene
  regenerar con `--stems` y grabar la narración propia: el vídeo limpio, el
  `narration.mp3` y un `captions.srt` alineado salen por separado.
- **Los datos son del corte 2026-09-18**, anteriores a la integración de las
  fotos de campo de `pereiramap`.

## Cómo regenerar

El vídeo se reconstruye desde [`flow.mjs`](flow.mjs), que es la fuente: el MP4 es
el entregable, no el original. Requiere
[ultrademo](https://github.com/new-xp/ultrademo) (Playwright → storyboard → TTS →
Remotion), `ffmpeg` y una voz de Piper en español.

```bash
# 1. construir el visor y empaquetarlo con los datos
cd apps/viewer && npm ci && npm run build
# (o el paquete completo, con base de datos: python scripts/build_static.py)

# 2. servir el paquete CON SOPORTE DE RANGE — obligatorio
python3 docs/demo/serve_ranges.py <ruta-al-dist> 8812
```

`http.server` **no** sirve: la cartografía base es un archivo PMTiles que
MapLibre lee por rangos de bytes (ADR-22 §8). Sin `Range`, el mapa sale vacío y
la consola escupe *«Check that your storage backend supports HTTP Byte
Serving»*. Por eso este directorio incluye [`serve_ranges.py`](serve_ranges.py).

```bash
# 3. capturar, narrar y renderizar
cd <ultrademo>
cp <ruta>/flow.mjs projects/recovery-pereira-<fecha>/flow.mjs
npm run capture -- recovery-pereira-<fecha>
PIPER_MODEL=es_MX-claude-high npm run tts -- recovery-pereira-<fecha>
npm run render -- recovery-pereira-<fecha> --no-captions
```

### Dos trampas que costaron cuatro capturas

1. **`rec.drag` no sirve para la cortina Sentinel.** Calcula el destino *dentro
   de la caja del elemento*, y el agarre mide 36 px: barre 3 píxeles en una
   cortina de 1520. Además hace 20 pasos y cada uno recompone las dos capas
   ráster (~1,3 s con la grabación activa), así que el clip salía de 36 s contra
   20 s de narración. `flow.mjs` arrastra a mano en cinco pasos.
2. **Piper trunca a ~3,4 s si recibe `--download-dir` junto a `--data-dir`**
   (medido: 77 palabras → 3,41 s con el flag, 30,81 s sin él), y `tts.mjs` lo
   pasa siempre. Hace falta interponer un envoltorio que descarte ese argumento.

### Anclaje de escenas

Las escenas se anclan a `data-uri`, no a clases de Tailwind — misma convención
que `scripts/checks/browser_check.py`, y por la misma razón: una clase cambia
cuando alguien ajusta el diseño. La columna izquierda solo tiene un ancla
estable, `where-are-we`; los demás paneles son sus hermanos:

| Panel | Selector | Centro |
|---|---|---|
| ¿Dónde estamos? | `[data-uri="where-are-we"]` | (199, 290) |
| El sismo | `[data-uri="where-are-we"] + *` | (199, 617) |
| Las tres cifras | `[data-uri="where-are-we"] + * + *` | (199, 805) |
| Comunas | `[data-uri="where-are-we"] + * + * + *` | (199, 990) |
