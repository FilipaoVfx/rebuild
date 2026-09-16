/* Visor de decisión — enfoque cartográfico.
 *
 * ADR-13: cero cómputo espacial en el navegador. Cada número que se muestra
 * viene del backend con su procedencia; el cliente no puede discrepar del
 * servidor porque no calcula nada. En modo estático (GitHub Pages) filtra
 * filas ya calculadas, que es seleccionar, no computar.
 */

const STATIC_BASE = window.URI_STATIC_BASE || null;
const API = STATIC_BASE ? null : "/api/v1";

const DEFAULT_WEIGHTS = {
  need: 0.28,
  deficit: 0.24,
  vulnerability: 0.20,
  accessibility: 0.16,
  facility_gap: 0.12,
};

const FACTOR_LABEL = {
  need: "Necesidad (población)",
  deficit: "Déficit de espacio público",
  vulnerability: "Vulnerabilidad social",
  accessibility: "Accesibilidad peatonal",
  facility_gap: "Brecha de equipamientos",
};

const DAMAGE_LABEL = {
  NO_DAMAGE: "Sin daño",
  POSSIBLY_DAMAGED: "Posible daño",
  DAMAGED: "Dañado",
  DESTROYED: "Destruido",
};

const STATE_LABEL = {
  INGESTED: "Ingerido",
  EVALUATED: "Evaluado",
  EXCLUDED: "Excluido",
  CANDIDATE: "Candidato",
  SHORTLISTED: "Preseleccionado",
  ENDORSED: "Avalado",
};

/* Cada capa declara de dónde sale. Es lo que separa "dónde se observó daño"
 * de "dónde el modelo cree que hay que intervenir" — y hoy esa diferencia lo
 * es todo (ver el diagnóstico de señal). */
const LAYERS = [
  { id: "buildings", label: "Edificios (Microsoft)", origin: "real", on: true },
  { id: "roads", label: "Vías (OSM)", origin: "real", on: true },
  { id: "sites", label: "Sitios de oportunidad", origin: "real", on: true },
  { id: "evidence", label: "Observaciones de daño", origin: "real", on: true },
  { id: "green", label: "Espacio verde (OSM)", origin: "real", on: true },
  { id: "facilities", label: "Equipamientos (OSM)", origin: "real", on: false },
  { id: "catchments", label: "Catchment 10 min del sitio", origin: "real", on: false },
  { id: "population", label: "Población (dasimétrica)", origin: "derivada", on: false },
];

const state = {
  sites: [],
  weights: { ...DEFAULT_WEIGHTS },
  sort: { key: "top_score", dir: -1 },
  selected: null,
  scenario: null,
  map: null,
  mapReady: false,
  colorBy: "score",
  layers: Object.fromEntries(LAYERS.map((l) => [l.id, l.on])),
  // Modo 3D: arranca apagado y se enciende solo al final de `main`, una vez
  // que la tabla y el mapa ya sirven. deck.gl son 575 KB comprimidos y
  // cobrarlos en el arranque retrasaría la vista que sí es utilizable sin
  // ellos; cargarlos despues da las dos cosas.
  relief: false,
  deckReady: false,
  deckOverlay: null,
  coverage: null,
  // Vistas Sentinel. `satellite` es la escena que se esta mirando
  // ("s2-PRE", "s1-POST"...) o null si la capa esta apagada.
  sentinel: null,
  satellite: null,
  swipe: null,
  // Terreno. `terrain` es el indice del DEM (o false si no hay teselas
  // versionadas); `exaggeration` es cuanto se amplifica el relieve.
  terrain: null,
  exaggeration: 1.5,
};

const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 0) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const cop = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} MM` : `${(n / 1e6).toFixed(0)} M`);

/* ── Acceso a datos ───────────────────────────────────────────────────
 * Un solo punto de entrada para los dos modos, para que el resto del
 * visor no sepa si hay backend detrás. */

const staticCache = new Map();

async function loadStatic(file) {
  if (!staticCache.has(file)) {
    staticCache.set(
      file,
      fetch(`${STATIC_BASE}/${file}`).then((r) => {
        if (!r.ok) throw new Error(`${file}: ${r.status}`);
        return r.json();
      })
    );
  }
  return staticCache.get(file);
}

async function api(path, options) {
  if (!STATIC_BASE) {
    const response = await fetch(API + path, options);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  return staticApi(path, options);
}

/* En modo estático los escenarios están precalculados a presupuestos fijos:
 * sin backend no hay optimizador que correr. Se elige el más cercano y se
 * dice cuál se usó, en lugar de fingir que se optimizó lo que se pidió. */
async function staticApi(path, options) {
  if (path.startsWith("/sites/")) {
    const id = path.split("/")[2];
    const details = await loadStatic("details.json");
    if (!details[id]) throw new Error(`sitio ${id} no incluido en el paquete estático`);
    return details[id];
  }
  if (path.startsWith("/sites")) {
    const all = await loadStatic("sites.json");
    const params = new URLSearchParams(path.split("?")[1] || "");
    let sites = all.sites;
    if (params.get("state")) sites = sites.filter((s) => s.state === params.get("state"));
    if (params.get("min_score")) {
      const min = Number(params.get("min_score"));
      sites = sites.filter((s) => (s.top_score ?? -1) >= min);
    }
    if (params.get("intervention")) {
      sites = sites.filter((s) => s.top_intervention === params.get("intervention"));
    }
    return { ...all, sites, total: sites.length };
  }
  if (path.startsWith("/scenarios/") && path.endsWith("/coverage")) {
    const id = path.split("/")[2];
    const all = await loadStatic("coverage.json");
    if (!all[id]) throw new Error(`cobertura de ${id} no incluida en el paquete estático`);
    return all[id];
  }
  if (path === "/data-sources") return loadStatic("sources.json");
  if (path === "/quality/alerts") return loadStatic("alerts.json");
  if (path === "/scenarios" && options?.method === "POST") {
    const request = JSON.parse(options.body);
    const bundle = await loadStatic("scenarios.json");
    const budgets = bundle.map((s) => s.budget_cop);
    const nearest = budgets.reduce((a, b) =>
      Math.abs(b - request.budget_cop) < Math.abs(a - request.budget_cop) ? b : a
    );
    const chosen = bundle.find((s) => s.budget_cop === nearest);
    return { ...chosen, static_note: nearest !== request.budget_cop ? nearest : null };
  }
  throw new Error(`ruta ${path} no disponible en el paquete estático`);
}

async function geojson(layer) {
  if (STATIC_BASE) return loadStatic(`geojson/${layer}.json`);
  const response = await fetch(`${API}/geojson/${layer}`);
  return response.json();
}

/* ── Procedencia ─────────────────────────────────────────────────────── */

function renderProvenance(provenance, sources) {
  const blocked = (sources || []).filter((s) => !s.usable);
  const chips = provenance.layers
    .map(
      (layer) => `
      <span class="chip ${layer.is_synthetic ? "synthetic" : "real"}"
            title="${layer.source_id} · ${layer.license_class}">
        <span class="dot"></span>${layer.layer}
        <code>${layer.is_synthetic ? "simulada" : "real"}</code></span>`
    )
    .join("");

  $("#provenance").innerHTML = `
    <span class="label">Procedencia</span>
    ${chips}
    <span class="chip"><code>data v${provenance.data_version} ·
      ${provenance.feature_version} · ${provenance.scoring_version}</code></span>
    ${
      blocked.length
        ? `<span class="chip blocked" title="fuentes.md §6 control C1"><span class="dot"></span>
           ${blocked.length} fuentes bloqueadas por licencia sin verificar</span>`
        : ""
    }`;
}

/* ── Mapa ─────────────────────────────────────────────────────────────
 * Es la superficie primaria: el territorio es el modelo de datos. */

const SCORE_RAMP = [
  [0, "#cde2fb"],
  [20, "#9ec5f4"],
  [30, "#6da7ec"],
  [40, "#3987e5"],
  [50, "#1c5cab"],
];

function sitePaint() {
  if (state.colorBy === "state") {
    return [
      "match",
      ["get", "state"],
      "CANDIDATE", "#2a78d6",
      "EXCLUDED", "#d03b3b",
      "#898781",
    ];
  }
  if (state.colorBy === "damage") {
    return [
      "match",
      ["get", "damage_class"],
      "DESTROYED", "#0d366b",
      "DAMAGED", "#1c5cab",
      "POSSIBLY_DAMAGED", "#3987e5",
      "#86b6ef",
    ];
  }
  if (state.colorBy === "confidence") {
    return [
      "interpolate", ["linear"], ["coalesce", ["get", "confidence"], 0],
      0, "#cde2fb", 0.3, "#6da7ec", 0.6, "#1c5cab",
    ];
  }
  return [
    "case",
    ["==", ["get", "state"], "EXCLUDED"], "#c3c2b7",
    [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "score"], 0],
      ...SCORE_RAMP.flat(),
    ],
  ];
}

/* FR-LIC-01 — la atribución se compone desde la procedencia que la página
 * cargó, no desde una lista escrita a mano. Una cadena fija atribuye fuentes
 * que quizá no estén en el despliegue: el registro de fuentes cataloga ocho,
 * el paquete público consume tres y ninguna es ICube-SERTIT, así que nombrar
 * las demás afirmaría lo contrario de lo que la puerta de licencia garantiza. */
function attributionFrom(provenance) {
  const seen = new Set();
  for (const layer of provenance?.layers || []) {
    if (layer.attribution) seen.add(layer.attribution);
  }
  return [...seen].join(" · ") || "Urban Recovery Intelligence";
}

async function initMap(provenance) {
  if (state.map) return;

  state.map = new maplibregl.Map({
    container: "map",
    // Sin basemap de terceros: un tile servido por otro no tiene data_version
    // y rompe la reproducibilidad (fuentes.md §11).
    style: {
      version: 8,
      sources: {},
      layers: [{ id: "bg", type: "background", paint: { "background-color": "#f2f1ee" } }],
    },
    center: [-75.6935, 4.8085],
    zoom: 15.2,
    attributionControl: false,
  });
  state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  state.map.addControl(
    new maplibregl.AttributionControl({ customAttribution: attributionFrom(provenance) }),
    "bottom-right"
  );

  await new Promise((resolve) => state.map.on("load", resolve));

  const [sites, evidence, green, catchments, facilities, population, buildings, roads] =
    await Promise.all([
      geojson("sites"),
      geojson("evidence"),
      geojson("green"),
      geojson("catchments"),
      geojson("facilities").catch(() => ({ type: "FeatureCollection", features: [] })),
      geojson("population").catch(() => ({ type: "FeatureCollection", features: [] })),
      // El tejido urbano es contexto: si falta, el mapa se degrada a como
      // estaba antes en vez de no cargar.
      geojson("buildings").catch(() => ({ type: "FeatureCollection", features: [] })),
      geojson("roads").catch(() => ({ type: "FeatureCollection", features: [] })),
    ]);

  // Tejido urbano, lo PRIMERO que se añade y por tanto lo que queda debajo.
  //
  // 15.024 huellas de Microsoft y 6.695 vías de OSM llevaban desde el
  // principio en la base sin publicarse, y sin ellas el mapa eran puntos
  // flotando sobre papel en blanco. No contradice ADR-10: lo prohibido es un
  // tile de un tercero, sin `data_version`; esto es dato propio y sellado.
  //
  // Van en gris apagado a propósito. Son el fondo sobre el que se leen los
  // sitios, y un edificio no es un hallazgo: si compitieran en contraste con
  // la evidencia de daño, el mapa diría que todos pesan lo mismo.
  state.map.addSource("buildings", { type: "geojson", data: buildings });
  state.map.addLayer({
    id: "buildings",
    type: "fill",
    source: "buildings",
    paint: { "fill-color": "#dedcd4", "fill-outline-color": "#cfccc2" },
  });

  state.map.addSource("roads", { type: "geojson", data: roads });
  state.map.addLayer({
    id: "roads",
    type: "line",
    source: "roads",
    paint: {
      "line-color": "#ffffff",
      // Las vías se ensanchan con el zoom: a z13 una línea de ancho fijo
      // convierte la red peatonal en una mancha sólida.
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 16, 1.6, 18, 4],
      "line-opacity": 0.9,
    },
  });

  // Lo derivado va debajo de todo: la población dasimétrica es un reparto
  // calculado sobre huellas de edificio, no una medición, y no debería
  // competir visualmente con lo que sí se observó.
  state.map.addSource("population", { type: "geojson", data: population });
  state.map.addLayer({
    id: "population",
    type: "fill",
    source: "population",
    layout: { visibility: "none" },
    paint: {
      "fill-color": [
        "interpolate", ["linear"], ["coalesce", ["get", "population"], 0],
        0, "#f0efec", 200, "#9ec5f4", 600, "#1c5cab",
      ],
      "fill-opacity": 0.45,
    },
  });

  state.map.addSource("catchments", { type: "geojson", data: catchments });
  state.map.addLayer({
    id: "catchments",
    type: "line",
    source: "catchments",
    layout: { visibility: "none" },
    paint: { "line-color": "#1baf7a", "line-width": 1, "line-opacity": 0.5 },
  });

  state.map.addSource("green", { type: "geojson", data: green });
  state.map.addLayer({
    id: "green",
    type: "fill",
    source: "green",
    paint: { "fill-color": "#1baf7a", "fill-opacity": 0.3 },
  });

  state.map.addSource("facilities", { type: "geojson", data: facilities });
  state.map.addLayer({
    id: "facilities",
    type: "circle",
    source: "facilities",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": 4,
      "circle-color": "#eda100",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fcfcfb",
    },
  });

  state.map.addSource("sites", { type: "geojson", data: sites });
  state.map.addLayer({
    id: "sites",
    type: "fill",
    source: "sites",
    paint: { "fill-color": sitePaint(), "fill-opacity": 0.82 },
  });
  state.map.addLayer({
    id: "sites-outline",
    type: "line",
    source: "sites",
    paint: { "line-color": "#0b0b0b", "line-width": 0.6, "line-opacity": 0.35 },
  });
  // Contorno de selección, para que el sitio elegido siga siendo visible
  // cuando el panel de detalle tapa parte del mapa.
  state.map.addLayer({
    id: "sites-selected",
    type: "line",
    source: "sites",
    filter: ["==", ["get", "site_id"], ""],
    paint: { "line-color": "#0b0b0b", "line-width": 2.5 },
  });

  // A escala de ciudad los polígonos de sitio miden menos de un píxel y el
  // mapa se lee como si estuviera vacío. Esta capa los representa como puntos
  // por debajo de z16. Las coordenadas vienen del servidor — el cliente no
  // computa geometría (ADR-13).
  state.map.addSource("site-points", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  state.map.addLayer({
    id: "site-points",
    type: "circle",
    source: "site-points",
    maxzoom: 16,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 7],
      "circle-color": sitePaint(),
      "circle-stroke-width": 0.8,
      "circle-stroke-color": "#fcfcfb",
      "circle-opacity": 0.9,
    },
  });

  state.map.addSource("evidence", { type: "geojson", data: evidence });
  state.map.addLayer({
    id: "evidence",
    type: "circle",
    source: "evidence",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.6, 18, 4],
      "circle-color": [
        "match", ["get", "label"],
        "DESTROYED", "#0d366b",
        "DAMAGED", "#1c5cab",
        "#6da7ec",
      ],
      "circle-opacity": 0.85,
    },
  });

  wireMapInteraction();
  state.mapReady = true;
  applyLayerVisibility();
  if (sites.features.length) {
    const bounds = sites.features.reduce((b, f) => {
      const coords = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : [];
      coords.forEach((c) => b.extend(c));
      return b;
    }, new maplibregl.LngLatBounds(
      sites.features[0].geometry.coordinates[0][0],
      sites.features[0].geometry.coordinates[0][0]
    ));
    state.map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 15.5 });
  }
}

function wireMapInteraction() {
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });

  state.map.on("mousemove", "sites", (event) => {
    state.map.getCanvas().style.cursor = "pointer";
    const p = event.features[0].properties;
    const score = p.score === undefined || p.score === "" ? null : Number(p.score);
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        `<strong>${p.site_id}</strong><br>
         ${STATE_LABEL[p.state] || p.state} · ${fmt(Number(p.area_m2))} m²<br>
         ${p.damage_class ? DAMAGE_LABEL[p.damage_class] : "sin fusión"} ·
         ${p.evidence_count} obs.<br>
         ${score === null ? "sin score (excluido)" : `score ${score.toFixed(1)} · ${p.intervention_label || ""}`}`
      )
      .addTo(state.map);
  });
  state.map.on("mouseleave", "sites", () => {
    state.map.getCanvas().style.cursor = "";
    popup.remove();
  });
  state.map.on("click", "sites", (event) => selectSite(event.features[0].properties.site_id));

  state.map.on("mousemove", "site-points", (event) => {
    state.map.getCanvas().style.cursor = "pointer";
    const p = event.features[0].properties;
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        `<strong>${p.site_id}</strong><br>
         ${STATE_LABEL[p.state] || p.state} · ${fmt(Number(p.area_m2))} m²<br>
         ${p.score === null || p.score === undefined ? "sin score" : `score ${Number(p.score).toFixed(1)}`}`
      )
      .addTo(state.map);
  });
  state.map.on("mouseleave", "site-points", () => {
    state.map.getCanvas().style.cursor = "";
    popup.remove();
  });
  state.map.on("click", "site-points", (event) =>
    selectSite(event.features[0].properties.site_id)
  );
}

/* Alimenta la capa de puntos con lo que el servidor ya devolvió. */
function syncSitePoints() {
  if (!state.mapReady || !state.map.getSource("site-points")) return;
  state.map.getSource("site-points").setData({
    type: "FeatureCollection",
    features: state.sites.map((site) => ({
      type: "Feature",
      properties: {
        site_id: site.site_id,
        state: site.state,
        area_m2: site.area_m2,
        score: site.top_score,
        damage_class: site.damage_class,
        confidence: site.confidence,
      },
      geometry: { type: "Point", coordinates: [site.lon, site.lat] },
    })),
  });
}

function applyLayerVisibility() {
  if (!state.mapReady) return;
  const pairs = {
    buildings: ["buildings"],
    roads: ["roads"],
    sites: ["sites", "sites-outline", "sites-selected", "site-points"],
    evidence: ["evidence"],
    green: ["green"],
    facilities: ["facilities"],
    catchments: ["catchments"],
    population: ["population"],
  };
  for (const [key, ids] of Object.entries(pairs)) {
    for (const id of ids) {
      if (state.map.getLayer(id)) {
        state.map.setLayoutProperty(id, "visibility", state.layers[key] ? "visible" : "none");
      }
    }
  }
}

/* ── Relieve de cobertura (deck.gl) ───────────────────────────────────────
 *
 * La tercera dimensión es un dato medido, no un efecto: cada columna es una
 * celda de población y su altura ES su población. No hay altura de edificio
 * porque no existe la fuente (las huellas de Microsoft no la traen y OSM
 * tiene `building:levels` en 3 elementos del AOI), así que no se extruye
 * nada que haya que inventar.
 *
 * Lo que la vista responde, y la tabla no puede: a quién alcanza el
 * portafolio y a quién no. Las columnas apagadas son las personas que
 * ningún proyecto seleccionado tiene a 10 minutos — la saturación que
 * `stop_reason` solo nombra.
 */

const DECK_SRC = "vendor/deck.gl.js";

// Un arco por PROYECTO, no por par sitio-celda: 19 líneas legibles en vez de
// 5.982 que no dicen nada. El destino es el centroide ponderado por población
// de lo que ese proyecto aporta por primera vez.
const COVERED = [[38, 132, 118], [96, 206, 180]];
const UNCOVERED = [[120, 113, 108], [176, 168, 160]];

function loadDeck() {
  if (window.deck) return Promise.resolve(window.deck);
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = DECK_SRC;
    tag.onload = () => (window.deck ? resolve(window.deck) : reject(new Error("deck.gl no expuso su global")));
    tag.onerror = () => reject(new Error("no se pudo cargar deck.gl"));
    document.head.appendChild(tag);
  });
}

/* La escala de altura se fija contra el máximo observado, no contra una
 * constante: con otro AOI o otro reparto de población, una constante haría
 * que las columnas se salieran de la pantalla o se aplastaran, y el lector
 * leería eso como una diferencia en el dato. */
function elevationScale(cells) {
  const max = cells.reduce((m, c) => Math.max(m, c.population || 0), 0);
  return max > 0 ? 900 / max : 0;
}

/* ── Vistas Sentinel ──────────────────────────────────────────────────
 *
 * Imagen observada, NO daño. Lo que se ve es reflectancia (S2) y
 * retrodispersión (S1): una mancha oscura puede ser sombra, agua, asfalto
 * nuevo o un tejado repintado. La nota que lo dice se pinta junto al
 * control y sale del propio índice, no de una constante de este archivo,
 * para que no puedan divergir.
 *
 * Son PNG ya estirados por un evalscript del servicio. El GeoTIFF float32
 * que alimenta los índices es otro archivo y no se publica: quien mirase
 * una imagen realzada creyendo ver el dato mediría el estiramiento.
 */

async function loadSentinelIndex() {
  if (state.sentinel !== null) return state.sentinel;
  try {
    const base = STATIC_BASE || "data";
    const response = await fetch(`${base}/sentinel/previews.json`);
    // 404 es el caso normal en un despliegue sin imágenes versionadas.
    state.sentinel = response.ok ? await response.json() : false;
  } catch {
    state.sentinel = false;
  }
  return state.sentinel;
}

function sentinelKey(scene) {
  const familia = scene.collection === "sentinel-1-grd" ? "s1" : "s2";
  return `${familia}-${scene.window}`;
}

function setSatellite(key) {
  const indice = state.sentinel;
  if (!indice) return;
  const previo = state.satellite;
  if (previo && state.map.getLayer(`sat-${previo}`)) {
    state.map.setLayoutProperty(`sat-${previo}`, "visibility", "none");
  }
  state.satellite = key;
  const nota = $("#sat-note");
  if (!key) {
    if (nota) nota.hidden = true;
    return;
  }

  const scene = indice.scenes.find((x) => sentinelKey(x) === key);
  const id = `sat-${key}`;
  if (!state.map.getSource(id)) {
    const base = STATIC_BASE || "data";
    const [w, sur, e, norte] = scene.bbox;
    state.map.addSource(id, {
      type: "image",
      url: `${base}/sentinel/${scene.file}`,
      // Esquinas en sentido horario desde arriba-izquierda, que es el orden
      // que espera MapLibre; invertirlo voltea la imagen sin avisar.
      coordinates: [
        [w, norte],
        [e, norte],
        [e, sur],
        [w, sur],
      ],
    });
    // Debajo de todo lo vectorial: la imagen es el fondo sobre el que se
    // leen los sitios, no una capa que los tape.
    const primera = state.map.getStyle().layers.find((l) => l.id !== "bg");
    state.map.addLayer(
      { id, type: "raster", source: id, paint: { "raster-opacity": 0.85 } },
      primera ? primera.id : undefined
    );
  }
  state.map.setLayoutProperty(id, "visibility", "visible");
  const opacidad = Number($("#sat-opacity")?.value ?? 85) / 100;
  state.map.setPaintProperty(id, "raster-opacity", opacidad);

  if (nota) {
    const nube =
      scene.cloud_cover == null
        ? `${scene.orbit_direction || ""} órbita ${scene.relative_orbit ?? "—"}`
        : `nubosidad ${scene.cloud_cover.toFixed(1)} %`;
    nota.hidden = false;
    nota.innerHTML =
      `<strong>${scene.window === "PRE" ? "Antes" : "Después"} del sismo — ` +
      `${scene.acquisition}.</strong> ${nube}. ${indice.limitation}`;
  }
}

/* ── Cortina antes/después ────────────────────────────────────────────
 *
 * La comparación es el gesto que da sentido a tener dos fechas. Se hace con
 * UNA sola instancia de mapa, no con dos sincronizadas: la imagen post se
 * pinta en un `<canvas>` recortado por el deslizador y MapLibre lo consume
 * como fuente `canvas`. Dos mapas superpuestos tendrían que sincronizar
 * cámara, y con el terreno puesto esa sincronía se rompe en cuanto hay
 * inclinación — quedaría un borde que no cuadra justo donde el ojo compara.
 *
 * Las dos escenas cubren EXACTAMENTE el mismo bbox (el AOI), así que recortar
 * por fracción de ancho es recortar por longitud. Si no lo cubrieran, esto
 * mentiría: estaría alineando dos encuadres distintos.
 *
 * Y sigue sin ser daño. Lo que cambia entre las dos fechas puede ser sombra,
 * obra, cosecha o un tejado mojado.
 */

const SWIPE_ID = "sat-swipe";

async function startSwipe(familia) {
  const indice = state.sentinel;
  if (!indice) return;
  const pre = indice.scenes.find((x) => sentinelKey(x) === `${familia}-PRE`);
  const post = indice.scenes.find((x) => sentinelKey(x) === `${familia}-POST`);
  if (!pre || !post) return;

  stopSwipe();
  setSatellite(`${familia}-PRE`);

  const base = STATIC_BASE || "data";
  const imagen = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`no se pudo cargar ${post.file}`));
    im.src = `${base}/sentinel/${post.file}`;
  });

  const lienzo = document.createElement("canvas");
  lienzo.width = imagen.width;
  lienzo.height = imagen.height;
  state.swipe = { familia, imagen, lienzo, pre, post, fraccion: 0.5 };

  const [w, sur, e, norte] = post.bbox;
  if (!state.map.getSource(SWIPE_ID)) {
    state.map.addSource(SWIPE_ID, {
      type: "canvas",
      canvas: lienzo,
      // `animate` deja que MapLibre relea el lienzo cuando lo redibujamos.
      animate: true,
      coordinates: [
        [w, norte],
        [e, norte],
        [e, sur],
        [w, sur],
      ],
    });
    const encima = `sat-${familia}-PRE`;
    state.map.addLayer(
      { id: SWIPE_ID, type: "raster", source: SWIPE_ID, paint: { "raster-opacity": 1 } },
      state.map.getLayer(encima) ? undefined : undefined
    );
    // Justo encima de la imagen pre, para que la cortina tape a su pareja y
    // no al tejido urbano.
    if (state.map.getLayer(encima)) state.map.moveLayer(SWIPE_ID, encima);
    state.map.moveLayer(encima);
    state.map.moveLayer(SWIPE_ID);
  }
  drawSwipe(0.5);

  const ui = $("#swipe-ui");
  if (ui) {
    ui.hidden = false;
    $("#swipe-range").value = 50;
  }
  const nota = $("#sat-note");
  if (nota) {
    nota.hidden = false;
    nota.innerHTML =
      `<strong>Izquierda: ${pre.acquisition} (antes) · Derecha: ${post.acquisition} ` +
      `(después).</strong> ${indice.limitation}`;
  }
}

function drawSwipe(fraccion) {
  const sw = state.swipe;
  if (!sw) return;
  sw.fraccion = fraccion;
  const ctx = sw.lienzo.getContext("2d");
  ctx.clearRect(0, 0, sw.lienzo.width, sw.lienzo.height);
  const x = Math.round(sw.lienzo.width * fraccion);
  const ancho = sw.lienzo.width - x;
  if (ancho > 0) {
    // Solo la banda derecha de la post; lo que queda a la izquierda es
    // transparente y deja ver la escena pre que hay debajo.
    ctx.drawImage(sw.imagen, x, 0, ancho, sw.lienzo.height, x, 0, ancho, sw.lienzo.height);
  }
  if (state.map.getSource(SWIPE_ID)) state.map.getSource(SWIPE_ID).play?.();
}

function stopSwipe() {
  if (state.map.getLayer(SWIPE_ID)) state.map.removeLayer(SWIPE_ID);
  if (state.map.getSource(SWIPE_ID)) state.map.removeSource(SWIPE_ID);
  state.swipe = null;
  const ui = $("#swipe-ui");
  if (ui) ui.hidden = true;
}

/* ── Relieve del terreno (Copernicus DEM GLO-30) ──────────────────────
 *
 * Elevación real, no un efecto. Pereira está a ~1.400 m en la cordillera y
 * los valles que parten la ciudad son los mismos que se ven en las imágenes
 * Sentinel: inclinar el mapa muestra por qué la trama urbana tiene la forma
 * que tiene.
 *
 * LICENCIA: el WorldDEM-30 NO comparte los términos de Sentinel aunque lleve
 * Copernicus en el nombre. Su art. 6(c) obliga a publicar una exención de
 * responsabilidad literal, que es una obligación distinta de la nota de
 * fuente. Por eso el índice trae `liability_notice` además de `attribution`,
 * y las dos se pintan. El art. 6(d) prohíbe dar a entender respaldo oficial:
 * nada de escudos de la UE ni de ESA aquí.
 */

async function loadTerrainIndex() {
  if (state.terrain !== null) return state.terrain;
  try {
    const base = STATIC_BASE || "data";
    const response = await fetch(`${base}/terrain/terrain.json`);
    state.terrain = response.ok ? await response.json() : false;
  } catch {
    state.terrain = false;
  }
  return state.terrain;
}

function setTerrain(on) {
  const indice = state.terrain;
  if (!indice) return;
  const nota = $("#terrain-note");

  if (!on) {
    state.map.setTerrain(null);
    if (nota) nota.hidden = true;
    return;
  }

  if (!state.map.getSource("dem")) {
    const base = STATIC_BASE || "data";
    state.map.addSource("dem", {
      type: "raster-dem",
      tiles: [`${base}/terrain/{z}/{x}/{y}.png`],
      // `mapbox` es la codificación Terrain-RGB que el evalscript emite:
      // altura = -10000 + (R*65536 + G*256 + B) * 0.1.
      encoding: indice.encoding || "mapbox",
      tileSize: indice.tile_size || 256,
      // Solo hay teselas del AOI. Sin `bounds`, MapLibre pide las de
      // alrededor y la consola se llena de 404 que parecen un fallo.
      bounds: indice.aoi_bbox,
      minzoom: indice.minzoom,
      // Por encima de esto MapLibre sobre-amplía las teselas que ya tiene, en
      // vez de pedir unas que no existen y dejar el relieve en plano.
      maxzoom: indice.maxzoom,
      attribution: indice.attribution,
    });
  }
  state.map.setTerrain({ source: "dem", exaggeration: state.exaggeration });
  if (state.map.getPitch() < 25) {
    state.map.easeTo({ pitch: 55, bearing: -18, duration: 1400 });
  }

  if (nota) {
    nota.hidden = false;
    // El aviso del art. 6(c) va literal y en su idioma original: la licencia
    // pide "the following sentence or its translation", y traducir una
    // exención de responsabilidad es una forma barata de debilitarla.
    // El aviso del art. 6(c) va literal y en su idioma original —la licencia
    // pide "the following sentence or its translation", y traducir una
    // exención de responsabilidad es una forma barata de debilitarla— pero
    // plegado: obligatorio no es lo mismo que protagonista.
    nota.innerHTML =
      `<strong>Elevación real del Copernicus DEM GLO-30</strong>, 30 m por muestra. ` +
      `<details><summary>Atribución y exención</summary>` +
      `${indice.attribution}. <em>${indice.liability_notice}.</em></details>`;
  }
}

function reliefLayers(coverage) {
  const { ColumnLayer, ArcLayer } = window.deck;
  const scale = elevationScale(coverage.cells);
  const maxArc = coverage.arcs.reduce((m, a) => Math.max(m, a.population || 0), 0) || 1;

  return [
    new ColumnLayer({
      id: "poblacion-3d",
      data: coverage.cells,
      diskResolution: 4,
      radius: 26,
      extruded: true,
      pickable: true,
      elevationScale: scale,
      getPosition: (d) => [d.lon, d.lat],
      getElevation: (d) => d.population,
      getFillColor: (d) => (d.covered_by ? COVERED[0] : UNCOVERED[0]),
      getLineColor: (d) => (d.covered_by ? COVERED[1] : UNCOVERED[1]),
      material: { ambient: 0.55, diffuse: 0.6, shininess: 32, specularColor: [255, 255, 255] },
    }),
    new ArcLayer({
      id: "aporte-marginal",
      data: coverage.arcs,
      pickable: true,
      getSourcePosition: (d) => d.from,
      getTargetPosition: (d) => d.to,
      getSourceColor: [214, 122, 45],
      getTargetColor: COVERED[1],
      // El grosor es el aporte marginal. El proyecto #1 trae 16.248 personas
      // y el #19 trae 30: sin escalar, la diferencia no se vería.
      getWidth: (d) => 2 + 10 * Math.sqrt(d.population / maxArc),
      // Los arcos vuelan POR ENCIMA de las columnas. A poca altura quedaban
      // enterrados entre ellas y se leían como ruido en vez de como el
      // reparto de cobertura que son.
      getHeight: 1.4,
      widthUnits: "pixels",
    }),
  ];
}

function reliefTooltip({ object, layer }) {
  if (!object) return null;
  if (layer.id === "poblacion-3d") {
    const alcance = object.covered_by
      ? `alcanzada por ${object.covered_by}`
      : "fuera del alcance del portafolio";
    return {
      text: `${fmt(object.population)} personas · ${alcance}`,
      style: { background: "#1c1b19", color: "#f5f3ef", fontSize: "11px", padding: "6px 8px" },
    };
  }
  return {
    text: `#${object.rank} ${object.site_id}\n${fmt(object.population)} personas nuevas · ${object.cells} celdas`,
    style: { background: "#1c1b19", color: "#f5f3ef", fontSize: "11px", padding: "6px 8px" },
  };
}

async function setRelief(on) {
  state.relief = on;
  const note = $("#relief-note");
  // La casilla se sincroniza aqui y no en el manejador del clic, porque el
  // relieve tambien se enciende solo al arrancar. Sin esto la vista saldria
  // en 3D con el control diciendo que esta apagado, y el primer clic —el que
  // deberia apagarlo— seria un clic muerto.
  const box = $('#layer-control input[data-layer="relief"]');
  if (box) box.checked = on;
  if (!on) {
    if (state.deckOverlay) state.deckOverlay.setProps({ layers: [] });
    state.map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    if (note) note.hidden = true;
    return;
  }

  if (note) {
    note.hidden = false;
    note.textContent = "Cargando deck.gl…";
  }
  try {
    await loadDeck();
    if (!state.coverage) {
      if (!state.scenario) await runOptimization();
      state.coverage = await api(`/scenarios/${state.scenario.scenario_id}/coverage`);
    }
  } catch (error) {
    if (note) note.textContent = `No se pudo activar el relieve: ${error.message}`;
    state.relief = false;
    if (box) box.checked = false;
    return;
  }

  if (!state.deckOverlay) {
    state.deckOverlay = new window.deck.MapboxOverlay({
      interleaved: false,
      layers: [],
      getTooltip: reliefTooltip,
    });
    state.map.addControl(state.deckOverlay);
  }
  state.deckOverlay.setProps({ layers: reliefLayers(state.coverage) });
  // Se aleja al entrar en 3D: con el encuadre de la vista plana, la inclinación
  // deja la mitad del AOI fuera de pantalla y el hueco de cobertura —que es lo
  // que esta vista existe para mostrar— queda justo fuera del encuadre.
  state.map.easeTo({ pitch: 55, bearing: -18, zoom: 13.9, duration: 1400 });

  const c = state.coverage;
  const alcanzada = c.cells.reduce((s, x) => s + (x.covered_by ? x.population : 0), 0);
  const total = c.cells.reduce((s, x) => s + x.population, 0);
  if (note) {
    note.innerHTML =
      `<strong>Altura = población real.</strong> El portafolio alcanza ` +
      `${fmt(alcanzada)} de ${fmt(total)} personas (${((alcanzada / total) * 100).toFixed(1)} %) ` +
      `en ${c.reached} de ${c.total_cells} celdas. Las columnas apagadas no las alcanza ningún ` +
      `proyecto seleccionado. Sin capa de altura de edificio: no existe la fuente.`;
  }
}

/* Recorrido por los primeros proyectos del portafolio. No es decoración: es
 * la forma más rápida de ver que el aporte marginal se desploma — el primer
 * arco mueve una ciudad, el último mueve una manzana. */
// Gancho de verificacion: el check de navegador necesita leer el pitch real
// del mapa, y no hay forma de obtenerlo desde fuera sin exponerlo.
/* El escenario que pide el boton y el que pide el relieve son el mismo, asi
 * que la peticion vive en un solo sitio. Duplicarla dejaria dos formas de
 * construir el cuerpo, y una de las dos se quedaria atras. */
async function runOptimization() {
  const maxProjects = $("#scn-max").value;
  state.scenario = await api("/scenarios", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: $("#scn-name").value,
      budget_cop: Number($("#scn-budget").value) * 1e9,
      weights: state.weights,
      max_projects: maxProjects ? Number(maxProjects) : null,
    }),
  });
  // La cobertura corresponde a ESTE escenario: si se recalcula, la anterior
  // deja de ser válida y no debe reutilizarse.
  state.coverage = null;
  return state.scenario;
}

window.__uriPitch = () => (state.map ? state.map.getPitch() : null);
window.__uriCenter = () =>
  state.map ? state.map.getCenter().toArray().map((n) => n.toFixed(4)).join(",") : null;

async function tourPortfolio() {
  if (!state.coverage) await setRelief(true);
  const arcs = (state.coverage?.arcs || []).slice(0, 5);
  for (const arc of arcs) {
    state.map.flyTo({ center: arc.from, zoom: 16.2, pitch: 60, bearing: -18, duration: 2200 });
    await new Promise((r) => setTimeout(r, 2600));
  }
}

function renderMapControls() {
  $("#layer-control").innerHTML = `
    <div class="control-group">
      <h3>Colorear sitios por</h3>
      <select id="color-by">
        <option value="score">Score (provisional)</option>
        <option value="state">Estado</option>
        <option value="damage">Clase de daño</option>
        <option value="confidence">Confianza</option>
      </select>
    </div>
    <div class="control-group">
      <h3>Capas</h3>
      ${LAYERS.map(
        (layer) => `
        <label class="layer-row">
          <input type="checkbox" data-layer="${layer.id}" ${state.layers[layer.id] ? "checked" : ""}>
          <span>${layer.label}</span>
          <span class="origin ${layer.origin}">${layer.origin}</span>
        </label>`
      ).join("")}
    </div>
    <div class="control-group" id="terrain-group" hidden>
      <h3>Terreno</h3>
      <label class="layer-row">
        <input type="checkbox" data-terrain>
        <span>Relieve real</span>
        <span class="origin real">real</span>
      </label>
      <label class="sat-opacity">
        Exageración
        <input type="range" id="terrain-exag" min="10" max="40" value="15">
      </label>
      <p class="relief-note" id="terrain-note" hidden></p>
    </div>
    <div class="control-group" id="sat-group" hidden>
      <h3>Imagen Sentinel</h3>
      <div class="sat-buttons" id="sat-buttons"></div>
      <div class="sat-buttons">
        <button type="button" class="ghost sat" data-swipe="s2">Comparar óptica</button>
        <button type="button" class="ghost sat" data-swipe="s1">Comparar radar</button>
      </div>
      <label class="sat-opacity" id="swipe-ui" hidden>
        Cortina
        <input type="range" id="swipe-range" min="0" max="100" value="50">
      </label>
      <label class="sat-opacity">
        Opacidad
        <input type="range" id="sat-opacity" min="10" max="100" value="85">
      </label>
      <p class="relief-note" id="sat-note" hidden></p>
    </div>
    <div class="control-group">
      <h3>Relieve de cobertura</h3>
      <label class="layer-row">
        <input type="checkbox" data-layer="relief" ${state.relief ? "checked" : ""}>
        <span>Población en 3D</span>
        <span class="origin derivada">derivada</span>
      </label>
      <button id="tour" type="button" class="ghost">Recorrer el portafolio</button>
    </div>`;

  $("#color-by").value = state.colorBy;
  $("#color-by").addEventListener("change", (event) => {
    state.colorBy = event.target.value;
    if (state.mapReady) {
      state.map.setPaintProperty("sites", "fill-color", sitePaint());
      state.map.setPaintProperty("site-points", "circle-color", sitePaint());
    }
    renderMapLegend();
  });
  $("#layer-control")
    .querySelectorAll("input[data-layer]")
    .forEach((input) =>
      input.addEventListener("change", () => {
        if (input.dataset.layer === "relief") {
          setRelief(input.checked);
          return;
        }
        state.layers[input.dataset.layer] = input.checked;
        applyLayerVisibility();
      })
    );
  loadTerrainIndex().then((indice) => {
    if (!indice) return;
    $("#terrain-group").hidden = false;
    $('#layer-control input[data-terrain]').addEventListener("change", (event) => {
      setTerrain(event.target.checked);
    });
    $("#terrain-exag").addEventListener("input", (event) => {
      state.exaggeration = Number(event.target.value) / 10;
      // Solo re-aplica si el terreno esta puesto: llamar a setTerrain con la
      // casilla apagada lo encenderia desde el deslizador.
      if (state.map.getTerrain()) {
        state.map.setTerrain({ source: "dem", exaggeration: state.exaggeration });
      }
    });
  });

  loadSentinelIndex().then((indice) => {
    if (!indice || !indice.scenes.length) return;
    const grupo = $("#sat-group");
    const orden = { "s2-PRE": 0, "s2-POST": 1, "s1-PRE": 2, "s1-POST": 3 };
    const claves = indice.scenes.map(sentinelKey).sort((a, b) => orden[a] - orden[b]);
    $("#sat-buttons").innerHTML =
      `<button type="button" class="ghost sat on" data-sat="">Ninguna</button>` +
      claves
        .map((k) => {
          const [familia, ventana] = k.split("-");
          const etiqueta = `${familia === "s1" ? "Radar" : "Óptica"} ${
            ventana === "PRE" ? "antes" : "después"
          }`;
          return `<button type="button" class="ghost sat" data-sat="${k}">${etiqueta}</button>`;
        })
        .join("");
    grupo.hidden = false;
    $("#sat-buttons")
      .querySelectorAll("button")
      .forEach((boton) =>
        boton.addEventListener("click", () => {
          $("#sat-buttons")
            .querySelectorAll("button")
            .forEach((b) => b.classList.toggle("on", b === boton));
          // Elegir una escena suelta cancela la comparacion: dejar la cortina
          // puesta sobre otra escena mostraria dos fechas que no son las que
          // el rotulo dice.
          stopSwipe();
          document.querySelectorAll("[data-swipe]").forEach((b) => b.classList.remove("on"));
          setSatellite(boton.dataset.sat || null);
        })
      );
    document.querySelectorAll("[data-swipe]").forEach((boton) =>
      boton.addEventListener("click", () => {
        const activo = boton.classList.contains("on");
        document.querySelectorAll("[data-swipe]").forEach((b) => b.classList.remove("on"));
        if (activo) {
          stopSwipe();
          return;
        }
        boton.classList.add("on");
        $("#sat-buttons")
          .querySelectorAll("button")
          .forEach((b) => b.classList.toggle("on", b.dataset.sat === ""));
        startSwipe(boton.dataset.swipe).catch((error) => {
          const nota = $("#sat-note");
          if (nota) {
            nota.hidden = false;
            nota.textContent = `No se pudo comparar: ${error.message}`;
          }
        });
      })
    );

    $("#swipe-range").addEventListener("input", (event) => {
      drawSwipe(Number(event.target.value) / 100);
    });

    $("#sat-opacity").addEventListener("input", (event) => {
      if (!state.satellite) return;
      state.map.setPaintProperty(
        `sat-${state.satellite}`,
        "raster-opacity",
        Number(event.target.value) / 100
      );
    });
  });

  $("#tour").addEventListener("click", () => {
    const box = $('#layer-control input[data-layer="relief"]');
    if (box) box.checked = true;
    tourPortfolio();
  });
}

function renderMapLegend() {
  const legends = {
    score: SCORE_RAMP.map(([v, c]) => `<span class="item"><span class="swatch" style="background:${c}"></span>${v}</span>`).join("") +
      `<span class="item"><span class="swatch" style="background:#c3c2b7"></span>excluido</span>`,
    state: `
      <span class="item"><span class="swatch" style="background:#2a78d6"></span>Candidato</span>
      <span class="item"><span class="swatch" style="background:#d03b3b"></span>Excluido</span>`,
    damage: `
      <span class="item"><span class="swatch" style="background:#0d366b"></span>Destruido</span>
      <span class="item"><span class="swatch" style="background:#1c5cab"></span>Dañado</span>
      <span class="item"><span class="swatch" style="background:#3987e5"></span>Posible daño</span>`,
    confidence: `
      <span class="item"><span class="swatch" style="background:#cde2fb"></span>baja</span>
      <span class="item"><span class="swatch" style="background:#1c5cab"></span>alta</span>`,
  };
  $("#map-legend").innerHTML = `
    <div class="legend">${legends[state.colorBy]}</div>
    <div class="legend" style="margin-top:6px">
      <span class="item"><span class="swatch dot-swatch" style="background:#0d366b"></span>Observación de daño</span>
      <span class="item"><span class="swatch" style="background:#1baf7a"></span>Espacio verde</span>
    </div>`;
}

/* ── Tabla densa ─────────────────────────────────────────────────────── */

const COLUMNS = [
  { key: "site_id", label: "Sitio", type: "text" },
  { key: "state", label: "Estado", type: "state" },
  { key: "damage_class", label: "Daño", type: "damage" },
  { key: "damage_confidence", label: "Conf. daño", type: "bar", max: 1, digits: 2 },
  { key: "top_intervention_label", label: "Recomendación", type: "text" },
  { key: "top_score", label: "Score", type: "bar", max: 100, digits: 1 },
  { key: "population_10min", label: "Pobl. 10 min", type: "num", digits: 0 },
  { key: "park_deficit", label: "Déficit EP", type: "bar", max: 1, digits: 2 },
  { key: "social_vulnerability", label: "Vulnerab.", type: "bar", max: 1, digits: 2, absent: "sin fuente" },
  { key: "risk_score", label: "Riesgo", type: "bar", max: 1, digits: 2, absent: "sin fuente" },
  { key: "pedestrian_accessibility", label: "Acces. peat.", type: "bar", max: 1, digits: 2 },
  { key: "area_m2", label: "Área m²", type: "num", digits: 0 },
  { key: "catchment_method", label: "Catchment", type: "method" },
  { key: "confidence", label: "Confianza", type: "bar", max: 1, digits: 2 },
  { key: "evidence_count", label: "Obs.", type: "num", digits: 0 },
];

function cell(column, row) {
  const value = row[column.key];
  switch (column.type) {
    case "state":
      return `<td><span class="tag state-${value}"><span class="dot"></span>${
        STATE_LABEL[value] || value}</span></td>`;
    case "damage":
      return `<td>${
        value
          ? `<span class="dmg dmg-${value}"><span class="sq"></span>${DAMAGE_LABEL[value]}</span>`
          : "—"
      }</td>`;
    case "method":
      return `<td><span class="tag method-${value}"><span class="dot"></span>${
        value === "BUFFER" ? "buffer (degradado)" : "red"}</span></td>`;
    case "bar": {
      // Un guion no distingue "no lo medimos" de "salio bajo". Una columna
      // que declara por que falta dice lo segundo sin que nadie lo suponga.
      if (value === null || value === undefined) {
        return column.absent
          ? `<td class="num absent" title="${column.label}: ${column.absent}">${column.absent}</td>`
          : `<td class="num">—</td>`;
      }
      const pct = Math.max(0, Math.min(100, (Number(value) / column.max) * 100));
      return `<td class="num"><span class="bar-cell">
        <span class="n">${fmt(value, column.digits)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
      </span></td>`;
    }
    case "num":
      return `<td class="num">${fmt(value, column.digits)}</td>`;
    default:
      return `<td>${value ?? "—"}</td>`;
  }
}

function renderTable() {
  const { key, dir } = state.sort;
  const rows = [...state.sites].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });

  $("#count-sites").textContent = rows.length;
  $("#p-sites").innerHTML = `
    <table>
      <thead><tr>${COLUMNS.map(
        (c) => `<th class="${c.type === "num" || c.type === "bar" ? "num" : ""}" data-key="${c.key}">
          ${c.label}${
            state.sort.key === c.key ? ` <span class="arrow">${dir === 1 ? "▲" : "▼"}</span>` : ""
          }</th>`
      ).join("")}</tr></thead>
      <tbody>${rows
        .map(
          (row) => `<tr data-site="${row.site_id}" aria-selected="${state.selected === row.site_id}">
            ${COLUMNS.map((c) => cell(c, row)).join("")}</tr>`
        )
        .join("")}</tbody>
    </table>`;

  $("#p-sites").querySelectorAll("th").forEach((th) =>
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
      renderTable();
    })
  );
  $("#p-sites")
    .querySelectorAll("tbody tr")
    .forEach((tr) => tr.addEventListener("click", () => selectSite(tr.dataset.site)));
}

/* ── Detalle ─────────────────────────────────────────────────────────── */

function decomposition(explanation) {
  const positives = explanation.contributions.filter((c) => c.contribution > 0);
  const total = positives.reduce((s, c) => s + c.contribution, 0) + explanation.penalty_total;
  const segments = positives
    .map(
      (c) => `<span class="seg seg-${c.factor}" style="width:${(c.contribution / total) * 100}%"
        title="${FACTOR_LABEL[c.factor]}: ${c.contribution.toFixed(2)}"></span>`
    )
    .join("");
  const penalty =
    explanation.penalty_total > 0
      ? `<span class="seg seg-penalty" style="width:${(explanation.penalty_total / total) * 100}%"
           title="Penalizaciones: −${explanation.penalty_total.toFixed(2)}"></span>`
      : "";
  const legend =
    positives
      .map(
        (c) => `<span class="item"><span class="swatch seg-${c.factor}"></span>
          ${FACTOR_LABEL[c.factor]} <span class="n">${c.contribution.toFixed(1)}</span></span>`
      )
      .join("") +
    (explanation.penalty_total > 0
      ? `<span class="item"><span class="swatch seg-penalty"></span>
          Penalizaciones <span class="n">−${explanation.penalty_total.toFixed(1)}</span></span>`
      : "");

  return `
    <div class="decomp">
      <div class="decomp-bar">${segments}${penalty}</div>
      <div class="legend">${legend}</div>
    </div>
    <p class="note">
      Base ${explanation.base_score.toFixed(2)} − penalizaciones
      ${explanation.penalty_total.toFixed(2)} = <strong>${explanation.final_score.toFixed(2)}</strong>.
      Descomposición exacta: ${explanation.decomposition_is_exact ? "sí" : "NO"}.
    </p>`;
}

function renderDetail(detail) {
  const { site, features, evidence, fusion, exclusions, recommendations, confidence_drivers } = detail;

  const evidenceRows = evidence
    .map(
      (e) => `
      <div class="evidence-row">
        <span class="src">${e.original_source}</span>
        <span class="meta">
          ${DAMAGE_LABEL[e.damage_class]} · ${e.raw_damage_label} · obs. ${e.observation_date} ·
          ${e.field_validated ? "validado en campo" : "sin validación de campo"} · ${e.license_class}
        </span>
        <span class="conf">${Number(e.confidence).toFixed(2)}</span>
      </div>`
    )
    .join("");

  const drivers = Object.entries(confidence_drivers || {})
    .map(([k, v]) => `<dt>${k}</dt><dd>${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}</dd>`)
    .join("");

  const featureRows = Object.entries(features)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v === null ? "—" : fmt(v, v < 10 ? 3 : 0)}</dd>`)
    .join("");

  const exclusionBlock = exclusions.length
    ? `<p class="note crit"><strong>Excluido por ${exclusions.length} restricción(es) dura(s).</strong>
        ${exclusions
          .map(
            (x) =>
              `${x.reason}${
                x.is_prohibited_risk ? " — riesgo prohibido: no admite override (FR-LIFE-03)" : ""
              }`
          )
          .join(" · ")}
        <br>Un sitio excluido no llega al motor de scoring: no aparece con un score bajo,
        no aparece en absoluto.</p>`
    : "";

  const recBlocks = recommendations
    .map(
      (r, i) => `
      <div class="rec ${i === 0 ? "top" : ""}">
        <div class="rec-head">
          <span class="name">${r.display_name}</span>
          <span class="score">${r.score.toFixed(1)}</span>
        </div>
        <div class="cost">Costo estimado ${cop(r.cost_cop)} COP · estimación, sin fuente oficial (OI-05)</div>
        ${i === 0 ? decomposition(r.explanation) : ""}
        ${
          i === 0 && r.explanation.counterfactual
            ? `<p class="note"><strong>Contrafactual.</strong> ${r.explanation.counterfactual.note}
               (Δ ${r.explanation.counterfactual.delta.toFixed(3)}).</p>`
            : ""
        }
        ${
          i === 0 && !r.explanation.counterfactual
            ? `<p class="note">Sin contrafactual: no se encontró un cambio de una sola
               variable que altere la recomendación.</p>`
            : ""
        }
      </div>`
    )
    .join("");

  $("#detail").innerHTML = `
    <div class="section">
      <h3>${site.site_id}</h3>
      <div class="sub">
        ${STATE_LABEL[site.state]} · ${fmt(site.area_m2)} m²
        ${site.area_is_estimated ? "(área estimada desde la evidencia, no catastral)" : ""}
        · ${site.evidence_count} observaciones
      </div>
      ${exclusionBlock}
    </div>

    <div class="section">
      <h2>Evidencia de daño <span class="origin real">real</span></h2>
      ${
        fusion
          ? `<p class="note ${fusion.independent_sources < 2 ? "warn" : ""}">
              Fusión: <strong>${DAMAGE_LABEL[fusion.damage_class]}</strong>,
              confianza ${Number(fusion.damage_confidence).toFixed(2)}.
              ${fusion.independent_sources} fuente(s) independiente(s) de
              ${fusion.contributing_sources.length} contribuyente(s) —
              acuerdo ${(Number(fusion.agreement_ratio) * 100).toFixed(0)}%.
              ${
                fusion.independent_sources < 2
                  ? "Fuentes que comparten insumo satelital no son confirmaciones independientes (R9)."
                  : ""
              }</p>`
          : ""
      }
      ${evidenceRows || '<p class="sub">Sin evidencia asociada.</p>'}
    </div>

    ${
      recommendations.length
        ? `<div class="section">
             <h2>Recomendaciones</h2>
             <p class="note warn">
               Calculado sobre datos reales. Dos features del vector no están
               disponibles —uso de suelo normativo (IDE AMCO) y vulnerabilidad
               social (DANE)— y se declaran como tales en lugar de rellenarse.
             </p>
             ${recBlocks}
           </div>`
        : ""
    }

    <div class="section">
      <h2>Vector de features</h2>
      <dl class="kv">${featureRows}</dl>
    </div>

    <div class="section">
      <h2>Drivers de confianza</h2>
      <dl class="kv">${drivers}</dl>
    </div>`;
}

async function selectSite(siteId) {
  state.selected = siteId;
  document
    .querySelectorAll("tbody tr")
    .forEach((tr) => tr.setAttribute("aria-selected", tr.dataset.site === siteId));
  if (state.mapReady && state.map.getLayer("sites-selected")) {
    state.map.setFilter("sites-selected", ["==", ["get", "site_id"], siteId]);
  }
  $("#detail").innerHTML = '<div class="loading">Cargando…</div>';
  try {
    renderDetail(await api(`/sites/${siteId}`));
  } catch (error) {
    $("#detail").innerHTML = `<div class="empty">Error: ${error.message}</div>`;
  }
  const site = state.sites.find((s) => s.site_id === siteId);
  if (site && state.mapReady) {
    state.map.easeTo({ center: [site.lon, site.lat], zoom: Math.max(state.map.getZoom(), 16.5) });
  }
}

/* ── Escenario y portafolio ──────────────────────────────────────────── */

function renderWeights() {
  $("#weights").innerHTML = Object.entries(state.weights)
    .map(
      ([factor, value]) => `
      <div class="weight-row">
        <span>${FACTOR_LABEL[factor]}</span>
        <span class="value" id="w-out-${factor}">${value.toFixed(2)}</span>
      </div>
      <input type="range" data-factor="${factor}" min="0" max="0.6" step="0.01" value="${value}">`
    )
    .join("");

  $("#weights")
    .querySelectorAll("input")
    .forEach((input) =>
      input.addEventListener("input", () => {
        state.weights[input.dataset.factor] = Number(input.value);
        $(`#w-out-${input.dataset.factor}`).textContent = Number(input.value).toFixed(2);
      })
    );
}

function renderPortfolio(scenario) {
  const equityDelta = scenario.equity_after.gini_delta;
  $("#count-portfolio").textContent = scenario.items.length;
  $("#p-portfolio").innerHTML = `
    <div class="portfolio">
      ${
        scenario.static_note
          ? `<p class="note warn">Paquete estático: los escenarios están precalculados.
             Se muestra el de ${cop(scenario.static_note)} COP, el más cercano al pedido.</p>`
          : ""
      }
      ${
        scenario.stop_reason === "cobertura_saturada"
          ? `<p class="note warn">
              El presupuesto no es lo que limita este portafolio. La selección se detuvo
              en ${scenario.items.length} proyectos porque ningún candidato restante alcanza
              población nueva: el objetivo es de cobertura y satura. Subir el presupuesto
              por encima de ${cop(scenario.total_cost)} COP devuelve exactamente esta lista.</p>`
          : ""
      }
      <div class="stat-row">
        <div class="stat"><div class="k">Proyectos</div>
          <div class="v">${scenario.items.length}</div>
          <div class="u">de ${scenario.considered} candidatos</div></div>
        <div class="stat"><div class="k">Inversión</div>
          <div class="v">${cop(scenario.total_cost)}</div>
          <div class="u">COP · estimada (OI-05) ·
            ${scenario.budget_binding ? "presupuesto agotado" : "presupuesto no vinculante"}</div></div>
        <div class="stat"><div class="k">Población servida</div>
          <div class="v">${fmt(scenario.total_population)}</div>
          <div class="u">catchment 10 min</div></div>
        <div class="stat"><div class="k">Gini de acceso</div>
          <div class="v">${scenario.equity_after.gini_access.toFixed(4)}</div>
          <div class="u">antes ${scenario.equity_before.gini_access.toFixed(4)} ·
            Δ ${equityDelta > 0 ? "+" : ""}${equityDelta.toFixed(4)}</div></div>
      </div>

      ${
        Math.abs(equityDelta) < 0.01
          ? `<p class="note warn">
              El portafolio apenas mueve la equidad territorial (Δ ${equityDelta.toFixed(4)}).
              Con el presupuesto y los pesos actuales, la inversión redistribuye poco: es un
              resultado del modelo, no un error de cálculo.</p>`
          : ""
      }

      <table>
        <thead><tr>
          <th>#</th><th>Sitio</th><th>Intervención</th>
          <th class="num">Score</th><th class="num">Costo COP</th>
          <th class="num">Población marginal</th><th class="num">Redundancia</th>
          <th class="num">Acumulado</th>
        </tr></thead>
        <tbody>${scenario.items
          .map(
            (item) => `<tr data-site="${item.site_id}">
              <td class="num">${item.rank}</td>
              <td>${item.site_id}</td>
              <td>${item.intervention_label}</td>
              <td class="num">${item.score.toFixed(1)}</td>
              <td class="num">${cop(item.cost_cop)}</td>
              <td class="num">${fmt(item.marginal_population)}</td>
              <td class="num">${(item.redundancy_ratio * 100).toFixed(1)}%</td>
              <td class="num">${fmt(item.cumulative_population)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>

      <p class="note">
        La redundancia crece conforme el portafolio satura: cada sitio nuevo sirve a población
        que los anteriores ya alcanzaban. Cae de la forma del objetivo de cobertura, no de una
        penalización añadida (ADR-08).
      </p>
      <p class="note">
        Reproducibilidad — candidatos <code>${scenario.candidate_set_hash.slice(0, 16)}…</code> ·
        matriz <code>${scenario.feature_matrix_hash.slice(0, 16)}…</code>
      </p>
      ${
        STATIC_BASE
          ? ""
          : `<div class="export-row">
              <a href="/api/v1/exports/${scenario.scenario_id}?format=geojson&profile=INTERNAL" download>GeoJSON</a>
              <a href="/api/v1/exports/${scenario.scenario_id}?format=csv&profile=INTERNAL" download>CSV</a>
              <a href="/api/v1/exports/${scenario.scenario_id}?format=json&profile=INTERNAL" download>Scenario JSON</a>
            </div>`
      }
    </div>`;

  $("#p-portfolio")
    .querySelectorAll("tbody tr")
    .forEach((tr) => tr.addEventListener("click", () => selectSite(tr.dataset.site)));

  if (state.mapReady && state.map.getSource("sites")) {
    const ids = scenario.items.map((i) => i.site_id);
    state.map.setFilter("sites-selected", ["in", ["get", "site_id"], ["literal", ids]]);
  }
}

/* ── Fuentes, alertas y diagnóstico ──────────────────────────────────── */

function renderSources(sources) {
  $("#p-sources").innerHTML = `
    <div class="portfolio">
      <p class="note">
        Una fuente en <code>UNCLEAR</code> no alimenta ninguna feature ni llega a un export:
        bloquea por diseño (fuentes.md §6, control C1).
      </p>
      <table class="sources-table">
        <thead><tr>
          <th>Fuente</th><th>Tier</th><th>Clase de licencia</th><th>Licencia</th>
          <th>Redistribución</th><th>Share-alike</th><th>Verificada</th><th>Notas</th>
        </tr></thead>
        <tbody>${sources
          .map(
            (s) => `<tr>
              <td>${s.display_name}</td>
              <td>${s.tier}</td>
              <td><span class="tag">
                <span class="dot" style="background:${s.usable ? "var(--good)" : "var(--critical)"}"></span>
                ${s.license_class}</span></td>
              <td>${s.license_name || "—"}</td>
              <td>${s.redistribution_allowed === null ? "—" : s.redistribution_allowed ? "sí" : "no"}</td>
              <td>${s.share_alike ? "sí" : "no"}</td>
              <td>${s.terms_verified_at || "—"}</td>
              <td class="notes">${s.verification_notes || ""}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>
    </div>`;
}

function renderAlerts(alerts) {
  $("#count-alerts").textContent = alerts.length;
  $("#p-alerts").innerHTML = `
    <div class="portfolio">
      ${alerts
        .map(
          (a) => `<p class="note ${a.severity === "error" ? "crit" : "warn"}">
            <strong>${a.code}</strong> · ${a.raised_at.slice(0, 16)}<br>${a.message}</p>`
        )
        .join("")}
    </div>`;
}

/* ── Arranque ────────────────────────────────────────────────────────── */

async function loadSites() {
  const params = new URLSearchParams();
  const stateFilter = $("#f-state").value;
  if (stateFilter) params.set("state", stateFilter);
  const minScore = Number($("#f-score").value);
  if (minScore > 0) params.set("min_score", minScore);
  const intervention = $("#f-intervention").value;
  if (intervention) params.set("intervention", intervention);

  const data = await api(`/sites?${params}`);
  state.sites = data.sites;
  renderTable();

  if (state.mapReady) {
    const visible = new Set(state.sites.map((s) => s.site_id));
    state.map.setFilter("sites", ["in", ["get", "site_id"], ["literal", [...visible]]]);
    state.map.setFilter("sites-outline", ["in", ["get", "site_id"], ["literal", [...visible]]]);
    syncSitePoints();
  }
  return data.provenance;
}

function wireTabs() {
  document.querySelectorAll('[role="tab"]').forEach((tab) =>
    tab.addEventListener("click", () => {
      document
        .querySelectorAll('[role="tab"]')
        .forEach((t) => t.setAttribute("aria-selected", t === tab));
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.hidden = panel.id !== tab.dataset.panel;
      });
      if (tab.dataset.panel === "p-map" && state.mapReady) {
        setTimeout(() => state.map.resize(), 50);
      }
    })
  );
}

async function main() {
  wireTabs();
  renderWeights();
  renderMapControls();
  renderMapLegend();

  $("#f-score").addEventListener("input", (e) => ($("#f-score-out").value = e.target.value));
  ["#f-state", "#f-score", "#f-intervention"].forEach((sel) =>
    $(sel).addEventListener("change", loadSites)
  );
  $("#reset-weights").addEventListener("click", () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    renderWeights();
  });

  if (STATIC_BASE) {
    $("#optimize").textContent = "Ver portafolio precalculado";
  }
  $("#optimize").addEventListener("click", async () => {
    const button = $("#optimize");
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Calculando…";
    try {
      await runOptimization();
      renderPortfolio(state.scenario);
      document.querySelector('[data-panel="p-portfolio"]').click();
    } catch (error) {
      alert(`No se pudo calcular: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });

  // Los sitios primero: su respuesta trae la procedencia, y el mapa la
  // necesita para componer su atribución antes de pintarse.
  const [sitesData, sources, alerts] = await Promise.all([
    api(`/sites?state=CANDIDATE`),
    api("/data-sources"),
    api("/quality/alerts"),
  ]);
  const provenance = sitesData.provenance;

  await initMap(provenance);
  await loadSites();

  renderProvenance(provenance, sources);
  renderSources(sources);
  renderAlerts(alerts);

  // El relieve se enciende solo, DESPUES de que la tabla y el mapa ya sirven.
  // Estaba detras de una casilla apagada en el fondo del panel de capas, que
  // es el sitio menos visible de la pagina: quien entraba veia puntos sueltos
  // sobre un fondo liso y se iba sin saber que la vista principal existia.
  // Sigue siendo carga diferida —los 575 KB de deck.gl no bloquean nada— y la
  // casilla lo apaga igual. Si el navegador no puede con WebGL, `setRelief`
  // ya deja el mapa plano y lo dice.
  if (!state.relief) setRelief(true);
}

main().catch((error) => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p class="note crit" style="margin:16px">Error al iniciar: ${error.message}</p>`
  );
});
