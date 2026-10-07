# Demos

## REBUILD · demo con fotos de campo (2:33, 2026-10-06)

**`rebuild-demo-campo-1440p.mp4`** · 2:33 · 2560×1440 · 30 fps · sin voz ni audio · 82 MB ·
en Drive (`REBUILD/demo/`), no en el repo.

1. **Por qué** (0:00–0:30): la película `rebuild-por-que-30s.mp4`, entera.
2. **Cortinilla** (0:30–0:35): lo que vio el satélite y lo que vio alguien en la calle.
3. **Recorrido** (0:35–2:27), con las fotos de pereiramap ya enlazadas (ADR-24 §7):
   - capa Daño con las fotos en el mapa y su leyenda;
   - búsqueda de Los Alamos: la tarjeta cuenta 2 fotos enlazadas;
   - galería en Evidencia; una foto dentro del polígono y otra a 41 m, con la
     línea medida, la incertidumbre y por qué está ahí;
   - una foto ambigua: tres candidatos dentro del margen de duda;
   - una foto con rumbo: el sitio cae dentro del encuadre de la cámara;
   - una foto sin enlace: daño que la observación satelital no registró;
   - en Intervenciones, «Fotos de campo · 2 enlazadas»; en Verificación, el
     aviso de verlas antes de ir.
4. **Cierre** (2:27–2:33): «Si sabe dónde, lo mide. Si duda, lo dice», con las
   cifras (17 aprobadas · 4 enlazadas · 4 ambiguas · 9 sin enlace) y las atribuciones.

Regenerar: `rebuild-campo-flow.mjs` en ultrademo (`ULTRADEMO_VIEWPORT=1440x810
ULTRADEMO_CLIP_CRF=12`); `rebuild-campo-recortar.py` quita las esperas con la
pantalla quieta (el navegador sin GPU tarda en encontrar los marcadores) y
reajusta el cursor; `rebuild-campo-componer.py` escala a 1440p, dibuja el
cursor y da a cada escena su velocidad (1,3× las de fotos, para poder leerlas);
las cortinillas salen de `rebuild-campo-cortinillas.html?c=bridge|close`. Se
unen con ffmpeg concat (CRF 18, sin pista de audio).

## REBUILD · por qué (30 s, 2026-10-02)

**`rebuild-por-que-30s.mp4`** · 0:30 · 2560×1440 · sin voz ni audio · 24 MB

No muestra el software: cuenta por qué hace falta. Pereira se construyó para la
gente de su tiempo: casi 6 de cada 10 edificios del sector están sobre suelo que ya
era ciudad en 1985. Esa gente envejeció: donde la ciudad es de antes de 1985 viven
13 mayores de 70 años por cada 10 niños, y donde es de después de 2000, 4. El sismo
golpeó esa ciudad: 9 de cada 10 daños observados están en ella. Reconstruir lo
mismo sería reconstruir una ciudad que ya no existe; hay que saber qué construir,
y dónde. Cifras, fuentes y límites en [`apps/film-porque`](../../apps/film-porque/README.md).

## REBUILD · demo completo (2026-10-02)

**`rebuild-demo-1440p.mp4`** · 1:23 · 2560×1440 · sin voz, sin audio · 48 MB

Dos partes, sin corte de sonido ni narración:

1. **El problema y el pipeline** (0:00–0:30) — también suelto en
   [`rebuild-problema-pipeline-30s.mp4`](rebuild-problema-pipeline-30s.mp4).
   Animación en three.js sobre el terreno real del sector de estudio
   ([`apps/film`](../../apps/film/README.md)):
   - el sismo y la pregunta: dónde recuperar, y con qué;
   - el problema: las fuentes se separan en capas, cada una con su fecha,
     escala y certeza, y el POT aparece como hoja vacía porque no tiene
     licencia;
   - la tesis: no falta información, falta poder justificar una decisión;
   - el pipeline en seis etapas (fuentes, cruce, evidencia, entorno,
     hipótesis, verificación) hasta la oportunidad de Corocito;
   - por qué REBUILD, con los créditos legales de las fuentes.
2. **El recorrido por la interfaz** (0:30–1:23): el mismo de abajo.

Datos: el paquete publicado n.º 135. El relieve está exagerado ×1,5 y los
edificios llevan una altura esquemática uniforme (las huellas de Microsoft
no traen altura); los dos se declaran en pantalla.

---

## REBUILD · recorrido esencial (2026-09-25)

**`rebuild-recorrido-demo-1440p.mp4`** · 0:53 · 2560×1440 · **sin voz, sin audio, sin subtítulos** · 31 MB

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

Grabado con una ventana de 1440×810 y escalado a 2560×1440: la interfaz se ve
1,33× más grande que en una grabación a 1920×1080, y el texto pequeño se lee.
Requiere [ultrademo](https://github.com/new-xp/ultrademo) con dos opciones de
entorno añadidas en nuestro clon (`ULTRADEMO_VIEWPORT`, `ULTRADEMO_CLIP_CRF`;
sin ellas se comporta igual que el original) y el paquete estático servido con
rangos (`serve_ranges.py`, necesario para el PMTiles).

```bash
python3 docs/demo/serve_ranges.py <paquete-estatico> 8816
# en el clon de ultrademo:
cp <repo>/docs/demo/rebuild-flow.mjs projects/rebuild-recorrido/flow.mjs
ULTRADEMO_VIEWPORT=1440x810 ULTRADEMO_CLIP_CRF=12 npm run capture -- rebuild-recorrido
# clips + cursor a 1440p con ffmpeg (desde projects/rebuild-recorrido/assets):
python3 <repo>/docs/demo/rebuild-componer-1440p.py
# portada y cierre: npm run render con --frames de la portada/cierre;
# se unen con ffmpeg (concat) y se codifica con CRF 18, sin pista de audio.
```

Por qué no pasa por el render de Remotion: su compositor no lee clips de más
de 1080p en este entorno, y una grabación de Playwright a 4K entrega la
mayoría de los fotogramas a 1× con relleno gris. El 4K real necesitaría
capturas fotograma a fotograma.

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
