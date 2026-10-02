# REBUILD · la película del problema y el pipeline

Animación en [three.js](https://threejs.org) que abre el demo (`docs/demo/`):
define el problema, muestra cómo REBUILD cruza las fuentes sobre el
territorio y justifica por qué. Sin voz ni audio; **30 s** a 2560×1440. Su
último fotograma es azul marino y empalma con la portada del recorrido por la
interfaz.

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
| 0–3,7 s | El sismo y la pregunta: dónde recuperar, y con qué |
| 3,7–9,4 s | **El problema**: las fuentes se separan en capas, cada una con su fecha, escala y certeza |
| 9,4–12,4 s | La tesis: no falta información; falta poder justificar una decisión |
| 12,4–25,4 s | **El pipeline**, en seis etapas: fuentes → cruce → evidencia → entorno → hipótesis → verificación, hasta Corocito |
| 25,4–30 s | **Por qué REBUILD**, con los créditos legales de las fuentes |

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
python3 render_frames.py --url http://127.0.0.1:8816/film/index.html \
    --frames /ruta/fotogramas --out rebuild-pipeline-30s-1440p.mp4 [--max 450]
# si se corta, se relanza igual y continúa desde el último fotograma
```

Para revisar un instante: `film/index.html?t=36.5`; en tiempo real: `?play`.
