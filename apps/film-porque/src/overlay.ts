import * as THREE from 'three';
import { T, ease, env, yearAt } from './timeline';

/**
 * Los textos. Cada cifra sale de `porque.json` (prepare_data.py); el
 * vocabulario es el de la ciudad, no el del software.
 */

const h = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};
const pct = (x: number) => Math.round(x * 10);

export interface Stats {
  edificios_urbanizado_hasta_1985: number;
  dano_urbanizado_hasta_1985: number;
  censo_por_epoca: Record<string, { mayores_70_por_10_ninos: number }>;
}

export function buildOverlay(root: HTMLElement, s: Stats) {
  const old = Math.round(s.censo_por_epoca.antes_1985.mayores_70_por_10_ninos);
  const young = Math.round(s.censo_por_epoca['2000_2015'].mayores_70_por_10_ninos);
  const el = {
    intro: h(`<section class="blk intro">
      <p class="kicker">Pereira</p>
      <h1>Una ciudad se construye<br/>para la gente de su tiempo.</h1>
    </section>`),
    year: h(`<section class="blk year">
      <p class="cap">suelo urbanizado hasta</p>
      <p class="num">1985</p>
      <div class="ramp"><span>1985 o antes</span><i></i><span>2015</span></div>
    </section>`),
    growth: h(`<section class="blk growth">
      <p class="big">Casi <b>${pct(s.edificios_urbanizado_hasta_1985)} de cada 10</b> edificios de este sector están sobre suelo que ya era ciudad en 1985.</p>
      <p class="sub">Hace más de cuarenta años, para otras familias y otras necesidades.</p>
    </section>`),
    people: h(`<section class="blk people">
      <h2>Pero su gente cambió.</h2>
      <div class="cmp">
        <div class="c"><p class="n old">${old}</p><p class="d">mayores de 70 años por cada 10 niños, donde la ciudad es de antes de 1985</p></div>
        <div class="c"><p class="n young">${young}</p><p class="d">en los sectores urbanizados después de 2000</p></div>
      </div>
      <div class="key"><span class="k kids"></span>niños de 0 a 9 años<span class="k elders"></span>personas de 70 o más</div>
    </section>`),
    quake: h(`<section class="blk quake">
      <p class="kicker red">10 de agosto de 2026 · magnitud 7,4</p>
      <h2>El sismo golpeó la ciudad más antigua.</h2>
      <p class="big"><b>${pct(s.dano_urbanizado_hasta_1985)} de cada 10</b> daños observados están en suelo que ya era ciudad en 1985.</p>
    </section>`),
    insight: h(`<section class="blk insight">
      <p class="i1">Reconstruir lo mismo es reconstruir<br/>una ciudad que ya no existe.</p>
      <p class="i2">Hoy, cada sector necesita otra cosa.</p>
    </section>`),
    close: h(`<section class="blk close">
      <p class="q">Hay que saber <em>qué</em> construir.<br/>Y <em>dónde</em>.</p>
      <p class="mark">REBUILD</p>
    </section>`),
    credit: h(`<p class="credit">Sector de estudio Copernicus EMSR916 · relieve ×1,5 · altura de edificios esquemática · época = año en que el suelo aparece urbanizado, no año de cada edificio</p>`),
    legal: h(`<p class="legal">Datos: WSF Evolution © DLR, CC BY 4.0 · DANE, Censo Nacional de Población y Vivienda 2018 (malla de 300 m) · Copernicus EMS (EMSR916), © European Union · Microsoft Building Footprints · © OpenStreetMap contributors.
      Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.
      The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30.</p>`),
    places: [] as HTMLElement[],
    fade: h(`<div class="fade"></div>`),
  };
  for (const n of ['Centro', 'Villavicencio', 'San Nicolás', 'Boston', 'Cuba', 'Río Otún']) {
    el.places.push(h(`<div class="place" data-n="${n}">${n}</div>`));
  }
  root.append(el.intro, el.year, el.growth, el.people, el.quake, el.insight, ...el.places, el.credit, el.fade, el.close, el.legal);
  return el;
}

type El = ReturnType<typeof buildOverlay>;
const show = (e: HTMLElement, a: number, dy = 18) => {
  e.style.opacity = a.toFixed(3);
  if (dy) e.style.transform = `translateY(${((1 - a) * dy).toFixed(1)}px)`;
  e.style.visibility = a < 0.002 ? 'hidden' : 'visible';
};

export function updateOverlay(
  el: El,
  t: number,
  project: (v: THREE.Vector3) => { x: number; y: number; ok: boolean },
  places: { name: string; pos: THREE.Vector3 }[],
) {
  show(el.intro, env(t, T.intro[0], T.intro[1], 0.8, 0.6));

  show(el.year, env(t, T.growth[0] + 0.1, T.growth[1], 0.5, 0.6), 0);
  const y = yearAt(t);
  (el.year.querySelector('.num') as HTMLElement).textContent = String(y);
  (el.year.querySelector('.cap') as HTMLElement).textContent = y <= 1985 ? 'ciudad en 1985 o antes' : 'ciudad hasta';
  (el.year.querySelector('.ramp i') as HTMLElement).style.setProperty('--p', `${(((y - 1985) / 30) * 100).toFixed(1)}%`);

  show(el.growth, env(t, T.old[1] - 0.2, T.growth[1], 0.6, 0.6));
  (el.growth.querySelector('.sub') as HTMLElement).style.opacity = ease(t, 8.6, 9.3).toFixed(3);

  show(el.people, env(t, T.people[0] + 0.2, T.people[1], 0.6, 0.5));
  el.people.querySelectorAll<HTMLElement>('.c').forEach((c, i) => {
    c.style.opacity = ease(t, T.people[0] + 1.4 + i * 1.2, T.people[0] + 2.0 + i * 1.2).toFixed(3);
  });

  show(el.quake, env(t, T.quake[0] + 0.3, T.quake[1], 0.6, 0.5));
  (el.quake.querySelector('.big') as HTMLElement).style.opacity = ease(t, T.quake[0] + 1.6, T.quake[0] + 2.3).toFixed(3);

  show(el.insight, env(t, T.insight[0] + 0.3, T.insight[1], 0.8, 0.5), 10);
  (el.insight.querySelector('.i2') as HTMLElement).style.opacity = ease(t, T.insight[0] + 2.0, T.insight[0] + 2.7).toFixed(3);

  show(el.close, env(t, T.close[0] + 0.1, 31, 0.7, 0.4), 10);
  (el.close.querySelector('.mark') as HTMLElement).style.opacity = ease(t, T.close[0] + 1.0, T.close[0] + 1.6).toFixed(3);
  show(el.legal, env(t, T.close[0] + 0.4, 31, 0.6, 0.4), 0);
  show(el.credit, env(t, 0.6, T.insight[0] + 0.4, 0.6, 0.5), 0);

  const placeOn = env(t, 1.6, T.intro[1] + 0.3, 0.8, 0.6);
  el.places.forEach((pe) => {
    const pl = places.find((p) => p.name === pe.dataset.n);
    if (!pl) return show(pe, 0, 0);
    const p = project(pl.pos);
    pe.style.left = `${p.x.toFixed(1)}px`;
    pe.style.top = `${p.y.toFixed(1)}px`;
    show(pe, p.ok ? placeOn : 0, 0);
  });

  el.fade.style.opacity = Math.max(1 - ease(t, 0, 0.8), 0.72 * ease(t, T.close[0], T.close[0] + 0.9)).toFixed(3);
}
