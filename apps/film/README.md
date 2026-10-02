# REBUILD · la película del problema y el pipeline

Animación en [three.js](https://threejs.org) que abre y cierra el demo
(`docs/demo/`): define el problema, muestra cómo REBUILD cruza las fuentes
sobre el territorio y justifica por qué. Sin voz ni audio; 62 s a 2560×1440.

## Qué muestra, y con qué datos

Todo sale del paquete estático publicado (datos n.º 135); nada se inventa.

| Elemento | Fuente | Nota |
|---|---|---|
| Relieve del sector de estudio | Copernicus DEM GLO-30, teselas z14 del paquete | Exageración vertical ×1,5, declarada en pantalla |
| 15.024 edificios | Microsoft Building Footprints | Las huellas no traen altura: se extruyen con una **altura esquemática uniforme**, declarada en pantalla. No se inventa variación |
| Calles, ríos, quebradas, comunas | © OpenStreetMap contributors | |
| Espacio público y equipamientos | SIGPER (Alcaldía de Pereira) · OSM | |
| Población por celda de 150 m | Estimación: 190.000 personas repartidas sobre edificios | Se dice "estimación" |
| 182 observaciones de daño, 115 sitios | Copernicus EMS EMSR916 | Foto-interpretación, sin validar en campo |
| POT | IDE AMCO | **No se dibuja**: licencia sin declarar (ADR-26). Aparece como hoja rayada y vacía, y sale del cruce |
| Corocito (sitio 0016) | Salida del pipeline | Área caminable, ≈ 5.103 personas (estimación), déficit 0,85, hipótesis y lo que falta |

Los créditos del cierre incluyen el texto de atribución y el aviso de no
responsabilidad que exige la licencia del Copernicus DEM (art. 6b y 6c).

## Estructura

| Tiempo | Bloque |
|---|---|
| 0–7 s | El sismo y la pregunta: dónde recuperar, y con qué |
| 7–19 s | **El problema**: las fuentes se separan en capas, cada una con su fecha, escala y certeza |
| 19–23 s | La tesis: no falta información; falta poder justificar una decisión |
| 23–51 s | **El pipeline**, en seis etapas: fuentes → cruce → evidencia → entorno → hipótesis → verificación |
| 51–62 s | **Por qué REBUILD** y cierre con créditos |

Entre el pipeline y la justificación hay un fundido a negro en 51 s: es el
punto donde el demo completo inserta el recorrido por la interfaz.

## Cómo se renderiza

Todo el estado sale del tiempo `t` (`src/timeline.ts`), así que cada
fotograma se puede pedir en cualquier orden. `render_frames.py` los captura
con Chromium sin interfaz (WebGL por SwiftShader) y los pasa por tubería a
ffmpeg.

```bash
npm ci && npm run build
# servir dist/ en film/ junto al paquete estático (data/), p. ej.:
cp -r dist <paquete-estatico>/film
python3 ../../docs/demo/serve_ranges.py <paquete-estatico> 8816
python3 render_frames.py --url http://127.0.0.1:8816/film/index.html --out rebuild-pipeline-1440p.mp4
```

Para revisar un instante: `film/index.html?t=36.5`; en tiempo real: `?play`.
