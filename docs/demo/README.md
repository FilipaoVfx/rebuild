# Demos

## REBUILD · recorrido esencial (2026-09-25)

**`rebuild-recorrido-demo.mp4`** · 0:58 · 1920×1080 · **sin voz, sin audio, sin subtítulos** · 16 MB

El flujo que importa, sin nada más: los titulares de la propia interfaz cuentan
el recorrido. Guion: [`rebuild-flow.mjs`](rebuild-flow.mjs).

| # | Escena | Qué deja en evidencia |
|---|---|---|
| — | Portada | REBUILD · Pereira, tras el sismo del 10-08-2026 |
| 1 | Capas | Inspección de datos: daño (Copernicus EMS) y población estimada sobre el mismo mapa |
| 2 | Buscar | La barra inferior se vuelve buscador; «corocito» abre la tarjeta del lugar, unida al pin |
| 3 | Evidencia | Observaciones, confianza y el cruce con Sentinel antes/después (óptica y radar) |
| 4 | Entorno | Cruce con espacio público y equipamientos a 500 m, y el área caminable |
| 5 | Comparar | «¿Qué aportaría más a Corocito?»: dos hipótesis, qué falta comprobar, por qué el sistema las propone |
| 6 | Verificar | «¿Qué debemos comprobar?»: la lista sale de los huecos de datos de ese sitio |
| 7 | Modo oscuro | Ajustes (Morphing Popover) → la interfaz y la cartografía cambian de tema |
| — | Cierre | Evidencia, entorno e hipótesis — cada una con su procedencia |

### Cómo regenerarlo

Con [ultrademo](https://github.com/new-xp/ultrademo) y el paquete estático
servido con rangos (`serve_ranges.py`, necesario para el PMTiles):

```bash
# 1. visor + datos en http://127.0.0.1:8816/index.html
python3 docs/demo/serve_ranges.py <paquete-estatico> 8816

# 2. captura (en el clon de ultrademo)
mkdir -p projects/rebuild-recorrido && cp <repo>/docs/demo/rebuild-flow.mjs projects/rebuild-recorrido/flow.mjs
npm run capture -- rebuild-recorrido

# 3. síntesis: los clips se aceleran 1,6× antes de renderizar (el
#    renderizador solo llega a 1,3×); duración y cursor se escalan igual
python3 - <<'EOF'
import json, subprocess, os
F, d = 1.6, "projects/rebuild-recorrido/assets"
sb = json.load(open(f"{d}/storyboard.json"))
for s in sb["scenes"]:
    if s.get("media") != "clip": continue
    src = f"{d}/{s['clip']}"
    subprocess.run(["ffmpeg", "-y", "-i", src, "-filter:v", f"setpts=PTS/{F}", "-r", "30", "-an", src + ".tmp.mp4"], check=True)
    os.replace(src + ".tmp.mp4", src)
    s["clipDuration"] /= F
    for e in s.get("events", []): e["t"] /= F
json.dump(sb, open(f"{d}/storyboard.json", "w"))
EOF

# 4. render sin subtítulos y sin pista de audio
npm run render -- rebuild-recorrido --no-captions
ffmpeg -i projects/rebuild-recorrido/out/rebuild-recorrido-nocaptions.mp4 -an -c:v libx264 -crf 24 -movflags +faststart rebuild-recorrido-demo.mp4
```

Sin TTS: la duración de cada escena la marca su clip. En este entorno la
cartografía de noche tarda en repintarse, así que la escena 7 corta esa espera
con `rec.skipWhile`.

---

## Recovery · demo para contraparte institucional (2026-09-23)

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
