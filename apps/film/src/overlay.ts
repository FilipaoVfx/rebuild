import * as THREE from 'three';
import { STAGES, T, ease, env, stageAt } from './timeline';

/**
 * Los textos de la película: HTML sobre el lienzo, nítidos a cualquier
 * resolución. Cada cifra sale de los datos publicados (n.º 135); lo que no
 * existe se dice como tal.
 */

const LAYER_TEXT = [
  { name: 'Relieve', meta: 'Copernicus DEM · celda de 30 m · medido', color: '#6d8bd0' },
  { name: 'Edificios', meta: 'Microsoft · 15.024 huellas · sin altura', color: '#e8e2d4' },
  { name: 'Espacio público y equipamientos', meta: 'SIGPER · OSM · inventario declarado', color: '#58c483' },
  { name: 'Población', meta: 'estimación: 190.000 personas en celdas de 150 m', color: '#b79cff' },
  { name: 'Daño observado', meta: 'Copernicus EMS · 182 observaciones · 11 ago 2026 · sin validar', color: '#f08a3a' },
  { name: 'Norma urbana (POT)', meta: 'IDE AMCO · licencia sin declarar · no se publica', color: '#8a93a8', hatched: true },
];

const VERIFY = [
  'Estado real de la edificación',
  'Uso actual del lugar',
  'Acceso peatonal',
  'Demanda de servicios',
  'Espacio público existente',
  'Suelo disponible y propiedad',
  'Normativa POT',
  'Suelo y riesgo sísmico',
];

const h = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};

export function buildOverlay(root: HTMLElement) {
  const el = {
    title: h(`<section class="blk title">
      <p class="kicker">Pereira · 10 de agosto de 2026</p>
      <h1>Un sismo de magnitud 7,4 sacude la ciudad.</h1>
      <p class="lead">Epicentro a 59 km, en el Chocó. Ahora hay que decidir <em>dónde</em> recuperar primero, y <em>con qué</em>.</p>
    </section>`),
    frag: h(`<section class="blk frag">
      <p class="kicker">El problema</p>
      <h2>La información existe, pero llega en piezas sueltas.</h2>
      <p class="lead later">Cada pieza tiene su propia fecha, su escala y su grado de certeza. Ninguna, por sí sola, justifica dónde actuar.</p>
    </section>`),
    thesis: h(`<section class="blk thesis">
      <p class="t1">El problema no es la falta de datos.</p>
      <p class="t2">Es la distancia entre <em>tener información</em> y <em>poder justificar una decisión</em>.</p>
    </section>`),
    pipe: h(`<section class="blk pipe">
      <p class="kicker">El pipeline de REBUILD</p>
      <h2 class="ptitle"></h2>
      <p class="lead psub"></p>
    </section>`),
    rail: h(`<nav class="rail">${STAGES.map((s, i) => `<div class="node" data-i="${i}"><span class="dot">${i + 1}</span><span class="lbl">${s.label}</span></div>`).join('<span class="bar"><i></i></span>')}</nav>`),
    labels: LAYER_TEXT.map((l) =>
      h(`<div class="label${l.hatched ? ' hatched' : ''}"><span class="sw" style="--c:${l.color}"></span><div><b>${l.name}</b><span>${l.meta}</span></div></div>`),
    ),
    calloutSite: h(`<div class="callout"><b>Sitio 0016 · Corocito</b><span>1 observación · dañado · 449 m²</span></div>`),
    calloutCatch: h(`<div class="callout catch"><b>A 10 minutos a pie</b><span>≈ 5.103 personas · estimación</span><span>déficit de espacio público 0,85</span></div>`),
    places: [] as HTMLElement[],
    card: h(`<aside class="card">
      <p class="ck">Oportunidad · sitio 0016</p>
      <h3>Corocito</h3>
      <p class="cs">Comuna Villavicencio · Carrera 12 con Calle 7</p>
      <dl>
        <div class="row" data-r="0"><dt>Problema</dt><dd>Alta concentración de población, buena conectividad peatonal y déficit de espacio público.</dd></div>
        <div class="row" data-r="1"><dt>Evidencia</dt><dd>1 observación · dañado · Copernicus EMS <span class="badge">Sin validar en campo</span></dd></div>
        <div class="row" data-r="2"><dt>Alcance</dt><dd>≈ 5.103 personas a 10 min a pie <span class="muted">(estimación)</span></dd></div>
        <div class="row" data-r="3"><dt>Hipótesis</dt><dd><span class="hyp">A · Plaza pública</span><span class="hyp">B · Equipamiento comunitario</span></dd></div>
        <div class="row" data-r="4"><dt>Viabilidad</dt><dd><span class="chip warn">Área con reservas</span><span class="chip unk">POT sin dato</span><span class="chip unk">Riesgo sísmico sin dato</span></dd></div>
        <div class="row" data-r="5"><dt>Confianza</dt><dd>0,52 de 1 · una sola fuente, sin validación de campo</dd></div>
      </dl>
      <div class="verify">
        <p class="ck">Para la visita</p>
        <ol>${VERIFY.map((v) => `<li>${v}</li>`).join('')}</ol>
      </div>
    </aside>`),
    justif: h(`<section class="blk justif">
      <p class="kicker">Por qué REBUILD</p>
      <ul>
        <li data-k="0"><b>Une la necesidad y las alternativas</b> en el mismo lugar.</li>
        <li data-k="1"><b>Cada cifra lleva su fuente;</b> lo que falta, se ve.</li>
        <li data-k="2"><b>La decisión sigue siendo de la institución</b>, con mejores argumentos.</li>
      </ul>
    </section>`),
    close: h(`<section class="blk close">
      <p class="mark">REBUILD</p>
      <p class="tag">Cada prioridad, explicable y discutible con evidencia.</p>
    </section>`),
    credit: h(`<p class="credit">Sector de estudio Copernicus EMSR916 · 21,66 km² · relieve ×1,5 · altura de edificios esquemática</p>`),
    legal: h(`<p class="legal">Datos: Copernicus EMS (EMSR916), © European Union · Microsoft Building Footprints · © OpenStreetMap contributors · SIGPER, Alcaldía de Pereira · DANE.
      Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.
      The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30.</p>`),
    fade: h(`<div class="fade"></div>`),
  };
  for (const name of ['Centro', 'Villavicencio', 'San Nicolás', 'Boston', 'Río Otún']) {
    el.places.push(h(`<div class="place" data-n="${name}">${name}</div>`));
  }
  root.append(
    el.title, el.frag, el.thesis, el.pipe, el.rail, ...el.labels, el.calloutSite, el.calloutCatch,
    ...el.places, el.card, el.justif, el.credit, el.fade, el.close, el.legal,
  );
  return el;
}

type El = ReturnType<typeof buildOverlay>;
type Project = (v: THREE.Vector3) => { x: number; y: number; ok: boolean };

const show = (e: HTMLElement, a: number, dy = 18) => {
  e.style.opacity = a.toFixed(3);
  if (dy) e.style.transform = `translateY(${((1 - a) * dy).toFixed(1)}px)`;
  e.style.visibility = a < 0.002 ? 'hidden' : 'visible';
};
const at = (e: HTMLElement, p: { x: number; y: number }) => {
  e.style.left = `${p.x.toFixed(1)}px`;
  e.style.top = `${p.y.toFixed(1)}px`;
};

export function updateOverlay(
  el: El,
  t: number,
  project: Project,
  anchors: {
    layer: (i: number) => THREE.Vector3;
    site: THREE.Vector3;
    catchment: THREE.Vector3;
    places: { name: string; pos: THREE.Vector3 }[];
  },
) {
  show(el.title, env(t, T.title[0], T.title[1], 0.9, 0.8));

  /* Problema: las piezas y sus rótulos. */
  show(el.frag, env(t, T.frag[0], T.frag[1], 0.8, 0.7));
  (el.frag.querySelector('.later') as HTMLElement).style.opacity = ease(t, 12.6, 13.6).toFixed(3);
  el.labels.forEach((lab, i) => {
    const appear = i === 0 ? ease(t, T.explode + 0.2, T.explode + 1.0) : ease(t, T.explode + (i - 1) * 0.85 + 0.9, T.explode + (i - 1) * 0.85 + 2.0);
    const a = appear * (1 - ease(t, T.frag[1] - 0.6, T.frag[1]));
    const p = project(anchors.layer(i));
    at(lab, p);
    show(lab, p.ok ? a : 0, 0);
  });

  show(el.thesis, env(t, T.thesis[0], T.thesis[1], 0.9, 0.8), 10);
  (el.thesis.querySelector('.t2') as HTMLElement).style.opacity = ease(t, T.thesis[0] + 1.3, T.thesis[0] + 2.2).toFixed(3);

  /* Pipeline: etapa activa, rótulo y riel. */
  const pipeOn = env(t, STAGES[0].a, STAGES[STAGES.length - 1].b, 0.6, 0.6);
  const si = stageAt(t);
  show(el.rail, pipeOn, 12);
  if (si >= 0) {
    const s = STAGES[si];
    const local = env(t, s.a, s.b, 0.45, 0.4);
    (el.pipe.querySelector('.ptitle') as HTMLElement).textContent = s.title;
    (el.pipe.querySelector('.psub') as HTMLElement).textContent = s.sub;
    show(el.pipe, local * pipeOn, 10);
  } else show(el.pipe, 0);
  el.rail.querySelectorAll<HTMLElement>('.node').forEach((n, i) => {
    n.dataset.state = i < si || (si < 0 && t > STAGES[STAGES.length - 1].b) ? 'done' : i === si ? 'on' : 'off';
  });
  el.rail.querySelectorAll<HTMLElement>('.bar i').forEach((b, i) => {
    const s = STAGES[i];
    b.style.transform = `scaleX(${ease(t, s.b - 0.6, s.b + 0.2).toFixed(3)})`;
  });

  /* Lugares que orientan, en la apertura y al cruzar. */
  const placeOn = Math.max(env(t, 2.4, 6.6, 1.0, 0.6), env(t, 25.4, T.entorno[0] + 0.3, 0.8, 0.8));
  el.places.forEach((pe) => {
    const pl = anchors.places.find((x) => x.name === pe.dataset.n);
    if (!pl) return show(pe, 0, 0);
    const p = project(pl.pos);
    at(pe, p);
    show(pe, p.ok ? placeOn : 0, 0);
  });

  /* Llamadas sobre el mapa en el entorno. */
  const callOn = env(t, T.entorno[0] + 1.0, T.oportunidad[0] + 0.6, 0.8, 0.6);
  const ps = project(anchors.site);
  at(el.calloutSite, ps);
  show(el.calloutSite, ps.ok ? callOn : 0, 0);
  const pc = project(anchors.catchment);
  at(el.calloutCatch, pc);
  show(el.calloutCatch, pc.ok ? env(t, T.entorno[0] + 2.2, T.oportunidad[0] + 0.6, 0.8, 0.6) : 0, 0);

  /* La oportunidad: tarjeta, filas en orden, y en verificación la lista. */
  const cardOn = env(t, T.oportunidad[0] + 0.3, T.verificacion[1] + 0.2, 0.8, 0.7);
  show(el.card, cardOn, 24);
  el.card.querySelectorAll<HTMLElement>('.row').forEach((r, i) => {
    r.style.opacity = ease(t, T.oportunidad[0] + 0.9 + i * 0.55, T.oportunidad[0] + 1.4 + i * 0.55).toFixed(3);
    const unknownRow = i === 1 || i === 4 || i === 5;
    r.dataset.hl = t > T.verificacion[0] && unknownRow ? '1' : '0';
  });
  const ver = el.card.querySelector('.verify') as HTMLElement;
  ver.style.maxHeight = `${(ease(t, T.verificacion[0] + 0.2, T.verificacion[0] + 1.2) * 420).toFixed(0)}px`;
  ver.querySelectorAll('li').forEach((li, i) => {
    (li as HTMLElement).style.opacity = ease(t, T.verificacion[0] + 0.6 + i * 0.22, T.verificacion[0] + 1.0 + i * 0.22).toFixed(3);
  });

  /* Justificación y cierre. */
  show(el.justif, env(t, T.justif[0] + 0.6, 58.6, 0.8, 0.6));
  el.justif.querySelectorAll<HTMLElement>('li').forEach((li, i) => {
    const a = ease(t, T.justif[0] + 1.2 + i * 1.5, T.justif[0] + 1.9 + i * 1.5);
    li.style.opacity = a.toFixed(3);
    li.style.transform = `translateX(${((1 - a) * -24).toFixed(1)}px)`;
  });
  show(el.close, env(t, 58.4, 62.6, 0.8, 0.4), 10);
  show(el.legal, env(t, 58.6, 62.6, 0.8, 0.4), 0);
  show(el.credit, env(t, 1.0, 58.2, 1.0, 0.6), 0);
  /* Fundidos: entrada, cambio de capítulo antes de la justificación (el
     corte entre la primera parte y el recorrido por la interfaz) y fondo del
     cierre. */
  const chapter = env(t, 50.15, 51.95, 0.8, 0.8);
  el.fade.style.opacity = Math.max(1 - ease(t, 0, 0.9), chapter, ease(t, 58.2, 59.4) * 0.82).toFixed(3);
}
