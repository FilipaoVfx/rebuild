---
version: 1
slug: "apps-viewer-src-app-tsx"
primary_target: "apps/viewer/src/App.tsx"
related_targets: ["apps/viewer/src"]
---

# Visor de decisión — Urban Recovery Intelligence

## Scope and mode

Todo el visor (`apps/viewer`): cabecera, navegación, las cinco secciones, el
mapa y la ficha de oportunidad. Modo **Operate**: la expresión nunca tapa la
tarea, el estado ni la affordance.

## Audience, task, content, constraints

- Quien abre: la contraparte institucional que evalúa (Planeación, DIGER,
  UNGRD), primera vez, sin demostración guiada, en escritorio de oficina o
  proyectado en sala. Minutos, no horas.
- Tarea de la primera pantalla: reconocer Pereira y entender qué parte cubre la
  evidencia y qué no. El resultado viene después.
- Fracaso a evitar: ser críptico para un funcionario — hashes, pesos, siglas y
  versiones fuera del primer plano.
- Intocable: el mapa como protagonista. Vinculante: ausencias honestas.
- Libre: navegación, anclajes `data-uri`, procedencia en barra, orden de ficha.

## Direction contract

THESIS: El visor es un concepto técnico firmado: las consideraciones declaran
el límite, la ciudad es su anexo cartográfico y lo que la evidencia no sostiene
queda escrito en el acta. Rechaza el tablero SIG oscuro de paneles flotantes y
casillas de capas que publica toda la categoría.

OWN-WORLD: Hoja blanca de papel bond, tipo en negro tóner, filetes finos en
lugar de cajas y un filete grueso bajo el membrete. Archivo expandida en
versalitas para el membrete, Archivo normal para la interfaz, una serif de texto
solo para las consideraciones. Tinta violeta de sello únicamente donde el
concepto certifica algo. La ciudad fuera de cobertura, tramada en gris.

STORY: El evaluador lee quién emite el concepto y su fecha de corte, reconoce
Pereira en el anexo, lee en consideraciones numeradas cuánto cubre la evidencia
y por qué, y recorre las secciones II a V sin confundir nunca consulta con
decisión.

FIRST VIEWPORT: Membrete arriba a todo lo ancho: emisor, número de concepto,
fecha de corte y el sello violeta SALIDA CONSULTIVA a la derecha. Debajo, el
índice de secciones I–V. Columna izquierda de 400 px con consideraciones
numeradas y su conteo de fuentes. A la derecha, al 70 % del ancho, el anexo
cartográfico: Pereira dentro de una línea de marco, el área cubierta limpia y
el resto tramado, rótulo abajo a la derecha. Acción primaria: al señalar una
consideración, su referencia se dibuja en el anexo.

FORM: Gaceta municipal / acto administrativo, traducido a su género no
vinculante, el concepto técnico, porque el producto informa y no resuelve;
posición 7 de mi lista ordenada; seed key 3c600c02.

RAISES: Del monocromo declinado, escasez del acento: tinta violeta solo donde
algo se certifica. De la tensegridad declinada, cada consideración muestra
cuántas fuentes independientes la sostienen y la que no tiene soporte se dibuja
floja.

SIGNATURE: Referencia cruzada consideración → anexo. Movimiento: el sello se
estampa una vez al cargar (presión corta, salida exponencial); la referencia se
traza en el anexo al señalarla; todo lo demás, quieto como un documento.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- La serif de las consideraciones se confirma al montar la tipografía.
