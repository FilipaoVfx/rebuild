/* Visor de decisión.
 *
 * ADR-13: cero cómputo espacial en el navegador. Cada número que se muestra
 * viene de la API con su procedencia. El cliente no puede discrepar del
 * servidor porque no calcula nada.
 */

const API = "/api/v1";

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

const state = {
  sites: [],
  weights: { ...DEFAULT_WEIGHTS },
  sort: { key: "top_score", dir: -1 },
  selected: null,
  scenario: null,
  map: null,
};

const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 0) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });
const cop = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} MM` : `${(n / 1e6).toFixed(0)} M`);

async function api(path, options) {
  const response = await fetch(API + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

/* ── Procedencia ──────────────────────────────────────────────────────
 * FR-SYN-05: cada capa declara la suya. Una etiqueta global diría
 * "sintético" sobre un escenario cuya evidencia de daño es real. */

function renderProvenance(provenance, sources) {
  const blocked = (sources || []).filter((s) => !s.usable);
  const chips = provenance.layers
    .map((layer) => {
      const cls = layer.is_synthetic ? "synthetic" : "real";
      const mark = layer.is_synthetic ? "simulada" : "real";
      return `<span class="chip ${cls}" title="${layer.source_id} · ${layer.license_class}">
        <span class="dot"></span>${layer.layer} <code>${mark}</code></span>`;
    })
    .join("");

  $("#provenance").innerHTML = `
    <span class="label">Procedencia</span>
    ${chips}
    <span class="chip"><code>data v${provenance.data_version} ·
      ${provenance.feature_version} · ${provenance.scoring_version}</code></span>
    ${blocked.length
      ? `<span class="chip blocked" title="fuentes.md §6 control C1"><span class="dot"></span>
         ${blocked.length} fuentes bloqueadas por licencia sin verificar</span>`
      : ""}
  `;
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
  { key: "social_vulnerability", label: "Vulnerab.", type: "bar", max: 1, digits: 2 },
  { key: "risk_score", label: "Riesgo", type: "bar", max: 1, digits: 2 },
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
      return `<td>${value
        ? `<span class="dmg dmg-${value}"><span class="sq"></span>${DAMAGE_LABEL[value]}</span>`
        : "—"}</td>`;
    case "method":
      return `<td><span class="tag method-${value}"><span class="dot"></span>${
        value === "BUFFER" ? "buffer (degradado)" : "red"}</span></td>`;
    case "bar": {
      if (value === null || value === undefined) return `<td class="num">—</td>`;
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
      <thead><tr>${COLUMNS.map((c) => `
        <th class="${c.type === "num" || c.type === "bar" ? "num" : ""}" data-key="${c.key}">
          ${c.label}${state.sort.key === c.key
            ? ` <span class="arrow">${dir === 1 ? "▲" : "▼"}</span>` : ""}
        </th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `
        <tr data-site="${row.site_id}" aria-selected="${state.selected === row.site_id}">
          ${COLUMNS.map((c) => cell(c, row)).join("")}
        </tr>`).join("")}</tbody>
    </table>`;

  $("#p-sites").querySelectorAll("th").forEach((th) =>
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
      renderTable();
    })
  );
  $("#p-sites").querySelectorAll("tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => selectSite(tr.dataset.site))
  );
}

/* ── Detalle: evidencia, features y descomposición exacta ────────────── */

function decomposition(explanation) {
  const positives = explanation.contributions.filter((c) => c.contribution > 0);
  const total = positives.reduce((s, c) => s + c.contribution, 0) + explanation.penalty_total;
  const segments = positives.map((c) =>
    `<span class="seg seg-${c.factor}" style="width:${(c.contribution / total) * 100}%"
       title="${FACTOR_LABEL[c.factor]}: ${c.contribution.toFixed(2)}"></span>`
  ).join("");
  const penalty = explanation.penalty_total > 0
    ? `<span class="seg seg-penalty" style="width:${(explanation.penalty_total / total) * 100}%"
         title="Penalizaciones: −${explanation.penalty_total.toFixed(2)}"></span>`
    : "";

  const legend = positives.map((c) =>
    `<span class="item"><span class="swatch seg-${c.factor}"></span>
      ${FACTOR_LABEL[c.factor]} <span class="n">${c.contribution.toFixed(1)}</span></span>`
  ).join("") + (explanation.penalty_total > 0
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

  const evidenceRows = evidence.map((e) => `
    <div class="evidence-row">
      <span class="src">${e.original_source}</span>
      <span class="meta">
        ${DAMAGE_LABEL[e.damage_class]} · ${e.raw_damage_label} ·
        obs. ${e.observation_date} ·
        ${e.field_validated ? "validado en campo" : "sin validación de campo"} ·
        ${e.license_class}
      </span>
      <span class="conf">${Number(e.confidence).toFixed(2)}</span>
    </div>`).join("");

  const drivers = Object.entries(confidence_drivers || {})
    .map(([k, v]) => `<dt>${k}</dt><dd>${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}</dd>`)
    .join("");

  const featureRows = Object.entries(features)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v === null ? "—" : fmt(v, v < 10 ? 3 : 0)}</dd>`)
    .join("");

  const exclusionBlock = exclusions.length
    ? `<p class="note crit"><strong>Excluido por ${exclusions.length} restricción(es) dura(s).</strong>
        ${exclusions.map((x) => `${x.reason}${x.is_prohibited_risk
          ? " — riesgo prohibido: no admite override (FR-LIFE-03)" : ""}`).join(" · ")}
        <br>Un sitio excluido no llega al motor de scoring: no aparece con un score bajo,
        no aparece en absoluto.</p>`
    : "";

  const recBlocks = recommendations.map((r, i) => `
    <div class="rec ${i === 0 ? "top" : ""}">
      <div class="rec-head">
        <span class="name">${r.display_name}</span>
        <span class="score">${r.score.toFixed(1)}</span>
      </div>
      <div class="cost">Costo estimado ${cop(r.cost_cop)} COP${
        r.cost_is_estimated ? " · estimación, sin fuente oficial (OI-05)" : ""}</div>
      ${i === 0 ? decomposition(r.explanation) : ""}
      ${i === 0 && r.explanation.counterfactual
        ? `<p class="note"><strong>Contrafactual.</strong> ${r.explanation.counterfactual.note}
           (Δ ${r.explanation.counterfactual.delta.toFixed(3)}).</p>`
        : ""}
      ${i === 0 && !r.explanation.counterfactual
        ? `<p class="note">Sin contrafactual: no se encontró un cambio de una sola
           variable que altere la recomendación.</p>` : ""}
    </div>`).join("");

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
      <h2>Evidencia de daño</h2>
      ${fusion ? `
        <p class="note ${fusion.independent_sources < 2 ? "warn" : ""}">
          Fusión: <strong>${DAMAGE_LABEL[fusion.damage_class]}</strong>,
          confianza ${Number(fusion.damage_confidence).toFixed(2)}.
          ${fusion.independent_sources} fuente(s) independiente(s) de
          ${fusion.contributing_sources.length} contribuyente(s) —
          acuerdo ${(Number(fusion.agreement_ratio) * 100).toFixed(0)}%.
          ${fusion.independent_sources < 2
            ? "Fuentes que comparten insumo satelital no son confirmaciones independientes (R9)."
            : ""}
        </p>` : ""}
      ${evidenceRows || '<p class="sub">Sin evidencia asociada.</p>'}
    </div>

    ${recommendations.length ? `
      <div class="section">
        <h2>Recomendaciones (sitio × intervención)</h2>
        ${recBlocks}
      </div>` : ""}

    <div class="section">
      <h2>Vector de features</h2>
      <dl class="kv">${featureRows}</dl>
    </div>

    <div class="section">
      <h2>Drivers de confianza</h2>
      <dl class="kv">${drivers}</dl>
      <p class="note warn">
        Las capas de contexto (población, riesgo, uso de suelo) son simuladas en
        esta versión. La confianza lo refleja y no puede subir por encima de ese techo.
      </p>
    </div>`;
}

async function selectSite(siteId) {
  state.selected = siteId;
  document.querySelectorAll("tbody tr").forEach((tr) =>
    tr.setAttribute("aria-selected", tr.dataset.site === siteId)
  );
  $("#detail").innerHTML = '<div class="loading">Cargando…</div>';
  try {
    renderDetail(await api(`/sites/${siteId}`));
  } catch (error) {
    $("#detail").innerHTML = `<div class="empty">Error: ${error.message}</div>`;
  }
  if (state.map) {
    const site = state.sites.find((s) => s.site_id === siteId);
    if (site) state.map.flyTo({ center: [site.lon, site.lat], zoom: 17 });
  }
}

/* ── Escenario y portafolio ──────────────────────────────────────────── */

function renderWeights() {
  $("#weights").innerHTML = Object.entries(state.weights).map(([factor, value]) => `
    <div class="weight-row">
      <span>${FACTOR_LABEL[factor]}</span>
      <span class="value" id="w-out-${factor}">${value.toFixed(2)}</span>
    </div>
    <input type="range" data-factor="${factor}" min="0" max="0.6" step="0.01" value="${value}">
  `).join("");

  $("#weights").querySelectorAll("input").forEach((input) =>
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
      <div class="stat-row">
        <div class="stat"><div class="k">Proyectos</div>
          <div class="v">${scenario.items.length}</div>
          <div class="u">de ${scenario.considered} candidatos</div></div>
        <div class="stat"><div class="k">Inversión</div>
          <div class="v">${cop(scenario.total_cost)}</div>
          <div class="u">COP · estimada (OI-05)</div></div>
        <div class="stat"><div class="k">Población servida</div>
          <div class="v">${fmt(scenario.total_population)}</div>
          <div class="u">catchment de 10 min</div></div>
        <div class="stat"><div class="k">Gini de acceso</div>
          <div class="v">${scenario.equity_after.gini_access.toFixed(4)}</div>
          <div class="u">antes ${scenario.equity_before.gini_access.toFixed(4)} ·
            Δ ${equityDelta > 0 ? "+" : ""}${equityDelta.toFixed(4)}</div></div>
      </div>

      ${Math.abs(equityDelta) < 0.01 ? `
        <p class="note warn">
          El portafolio apenas mueve la equidad territorial (Δ ${equityDelta.toFixed(4)}).
          Con el presupuesto y los pesos actuales, la inversión redistribuye poco:
          es un resultado del modelo, no un error de cálculo, y merece discutirse
          antes de presentarlo como mejora.
        </p>` : ""}

      <table>
        <thead><tr>
          <th>#</th><th>Sitio</th><th>Intervención</th>
          <th class="num">Score</th><th class="num">Costo COP</th>
          <th class="num">Población marginal</th><th class="num">Redundancia</th>
          <th class="num">Acumulado</th>
        </tr></thead>
        <tbody>${scenario.items.map((item) => `
          <tr data-site="${item.site_id}">
            <td class="num">${item.rank}</td>
            <td>${item.site_id}</td>
            <td>${item.intervention_label}</td>
            <td class="num">${item.score.toFixed(1)}</td>
            <td class="num">${cop(item.cost_cop)}</td>
            <td class="num">${fmt(item.marginal_population)}</td>
            <td class="num">${(item.redundancy_ratio * 100).toFixed(1)}%</td>
            <td class="num">${fmt(item.cumulative_population)}</td>
          </tr>`).join("")}</tbody>
      </table>

      <p class="note">
        La redundancia crece conforme el portafolio satura: cada sitio nuevo sirve
        a población que los anteriores ya alcanzaban. Cae de la forma del objetivo
        de cobertura, no de una penalización añadida (ADR-08).
      </p>
      <p class="note">
        Reproducibilidad — candidatos <code>${scenario.candidate_set_hash.slice(0, 16)}…</code> ·
        matriz <code>${scenario.feature_matrix_hash.slice(0, 16)}…</code>
      </p>
      <div class="stat-row" style="margin-top:12px">
        <a href="/api/v1/exports/${scenario.scenario_id}?format=geojson&profile=INTERNAL"
           download>GeoJSON</a>
        <a href="/api/v1/exports/${scenario.scenario_id}?format=csv&profile=INTERNAL"
           download>CSV</a>
        <a href="/api/v1/exports/${scenario.scenario_id}?format=json&profile=INTERNAL"
           download>Scenario JSON</a>
        <a href="/api/v1/exports/${scenario.scenario_id}?format=geojson&profile=COMMERCIAL">
           GeoJSON perfil comercial (debe fallar)</a>
      </div>
    </div>`;

  $("#p-portfolio").querySelectorAll("tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => selectSite(tr.dataset.site))
  );
}

/* ── Mapa ────────────────────────────────────────────────────────────── */

async function initMap() {
  if (state.map) return;
  state.map = new maplibregl.Map({
    container: "map",
    // Sin basemap de terceros: un tile servido por otro no tiene data_version
    // y rompe la reproducibilidad (fuentes.md §11, regla 2).
    style: {
      version: 8,
      sources: {},
      layers: [{ id: "bg", type: "background", paint: { "background-color": "#f2f1ee" } }],
    },
    center: [-75.694, 4.808],
    zoom: 15,
  });

  state.map.on("load", async () => {
    const [sites, evidence, green, risk] = await Promise.all([
      fetch(`${API}/geojson/sites`).then((r) => r.json()),
      fetch(`${API}/geojson/evidence`).then((r) => r.json()),
      fetch(`${API}/geojson/green`).then((r) => r.json()),
      fetch(`${API}/geojson/risk`).then((r) => r.json()),
    ]);

    state.map.addSource("green", { type: "geojson", data: green });
    state.map.addLayer({
      id: "green", type: "fill", source: "green",
      paint: { "fill-color": "#1baf7a", "fill-opacity": 0.25 },
    });

    // El rojo sólido está reservado para "sitio excluido". El riesgo se
    // dibuja como contorno punteado sobre un velo tenue, para que dos
    // significados distintos no compartan el mismo tono.
    state.map.addSource("risk", { type: "geojson", data: risk });
    state.map.addLayer({
      id: "risk", type: "fill", source: "risk",
      paint: { "fill-color": "#d03b3b", "fill-opacity": 0.07 },
    });
    state.map.addLayer({
      id: "risk-outline", type: "line", source: "risk",
      paint: {
        "line-color": "#d03b3b",
        "line-width": 1,
        "line-dasharray": [3, 2],
        "line-opacity": 0.65,
      },
    });

    state.map.addSource("sites", { type: "geojson", data: sites });
    state.map.addLayer({
      id: "sites", type: "fill", source: "sites",
      paint: {
        "fill-color": [
          "match", ["get", "label"],
          "CANDIDATE", "#2a78d6",
          "EXCLUDED", "#d03b3b",
          "#898781",
        ],
        "fill-opacity": 0.75,
      },
    });
    state.map.addLayer({
      id: "sites-outline", type: "line", source: "sites",
      paint: { "line-color": "#0b0b0b", "line-width": 0.5, "line-opacity": 0.4 },
    });

    state.map.addSource("evidence", { type: "geojson", data: evidence });
    state.map.addLayer({
      id: "evidence", type: "circle", source: "evidence",
      paint: {
        "circle-radius": 2.5,
        "circle-color": "#0d366b",
        "circle-opacity": 0.7,
      },
    });

    state.map.on("click", "sites", (event) =>
      selectSite(event.features[0].properties.id)
    );
    state.map.on("mouseenter", "sites", () => (state.map.getCanvas().style.cursor = "pointer"));
    state.map.on("mouseleave", "sites", () => (state.map.getCanvas().style.cursor = ""));

    document.querySelector(".map-wrap").insertAdjacentHTML("beforeend", `
      <div class="map-legend">
        <div class="legend" style="flex-direction:column;gap:4px">
          <span class="item"><span class="swatch" style="background:#2a78d6"></span>Sitio candidato</span>
          <span class="item"><span class="swatch" style="background:#d03b3b"></span>Sitio excluido</span>
          <span class="item"><span class="swatch" style="background:#1baf7a"></span>Espacio verde (OSM)</span>
          <span class="item"><span class="swatch" style="background:rgba(208,59,59,.12);border:1px dashed #d03b3b"></span>Zona de riesgo alto (simulada)</span>
          <span class="item"><span class="swatch" style="background:#0d366b;border-radius:50%"></span>Observación de daño</span>
        </div>
      </div>`);
  });
}

/* ── Fuentes y alertas ───────────────────────────────────────────────── */

function renderSources(sources) {
  $("#p-sources").innerHTML = `
    <div class="portfolio">
      <p class="note">
        Una fuente en <code>UNCLEAR</code> no alimenta ninguna feature ni llega a un
        export: bloquea por diseño (fuentes.md §6, control C1).
      </p>
      <table class="sources-table">
        <thead><tr>
          <th>Fuente</th><th>Tier</th><th>Clase de licencia</th><th>Licencia</th>
          <th>Redistribución</th><th>Share-alike</th><th>Verificada</th><th>Notas</th>
        </tr></thead>
        <tbody>${sources.map((s) => `
          <tr>
            <td>${s.display_name}</td>
            <td>${s.tier}</td>
            <td><span class="tag ${s.usable ? "" : "state-EXCLUDED"}">
              <span class="dot" style="background:${s.usable ? "var(--good)" : "var(--critical)"}"></span>
              ${s.license_class}</span></td>
            <td>${s.license_name || "—"}</td>
            <td>${s.redistribution_allowed === null ? "—" : s.redistribution_allowed ? "sí" : "no"}</td>
            <td>${s.share_alike ? "sí" : "no"}</td>
            <td>${s.terms_verified_at || "—"}</td>
            <td class="notes">${s.verification_notes || ""}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderAlerts(alerts) {
  $("#count-alerts").textContent = alerts.length;
  $("#p-alerts").innerHTML = `
    <div class="portfolio">
      ${alerts.map((a) => `
        <p class="note ${a.severity === "error" ? "crit" : "warn"}">
          <strong>${a.code}</strong> · ${a.raised_at.slice(0, 16)}<br>${a.message}
        </p>`).join("")}
    </div>`;
}

/* ── Arranque ────────────────────────────────────────────────────────── */

async function loadSites() {
  const params = new URLSearchParams();
  const stateFilter = $("#f-state").value;
  if (stateFilter) params.set("state", stateFilter);
  const risk = Number($("#f-risk").value);
  if (risk < 1) params.set("max_risk", risk);
  const minScore = Number($("#f-score").value);
  if (minScore > 0) params.set("min_score", minScore);
  const intervention = $("#f-intervention").value;
  if (intervention) params.set("intervention", intervention);

  $("#p-sites").innerHTML = '<div class="loading">Cargando sitios…</div>';
  const data = await api(`/sites?${params}`);
  state.sites = data.sites;
  renderTable();
  return data.provenance;
}

function wireTabs() {
  document.querySelectorAll('[role="tab"]').forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll('[role="tab"]').forEach((t) =>
        t.setAttribute("aria-selected", t === tab)
      );
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.hidden = panel.id !== tab.dataset.panel;
      });
      if (tab.dataset.panel === "p-map") {
        initMap().then(() => setTimeout(() => state.map?.resize(), 50));
      }
    })
  );
}

async function main() {
  wireTabs();
  renderWeights();

  $("#f-risk").addEventListener("input", (e) => ($("#f-risk-out").value = Number(e.target.value).toFixed(2)));
  $("#f-score").addEventListener("input", (e) => ($("#f-score-out").value = e.target.value));
  ["#f-state", "#f-risk", "#f-score", "#f-intervention"].forEach((sel) =>
    $(sel).addEventListener("change", loadSites)
  );
  $("#reset-weights").addEventListener("click", () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    renderWeights();
  });

  $("#optimize").addEventListener("click", async () => {
    const button = $("#optimize");
    button.disabled = true;
    button.textContent = "Optimizando…";
    try {
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
      renderPortfolio(state.scenario);
      document.querySelector('[data-panel="p-portfolio"]').click();
    } catch (error) {
      alert(`No se pudo optimizar: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "Optimizar portafolio";
    }
  });

  const [provenance, sources, alerts] = await Promise.all([
    loadSites(),
    api("/data-sources"),
    api("/quality/alerts"),
  ]);
  renderProvenance(provenance, sources);
  renderSources(sources);
  renderAlerts(alerts);
}

main().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin",
    `<p class="note crit" style="margin:16px">Error al iniciar: ${error.message}</p>`);
});
