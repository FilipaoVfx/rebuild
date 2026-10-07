// REBUILD — recorrido con las fotos de campo de pereiramap, sin voz ni audio.
//
// Lo que tiene que quedar a la vista: las fotos aprobadas viven en el mapa
// junto al daño satelital; cada una está enlazada, es ambigua o no tiene
// enlace, y el visor dice por qué, con la distancia medida al polígono del
// sitio, la incertidumbre del GPS y el encuadre de la cámara.

const BASE = 'http://127.0.0.1:8816/index.html';

const smooth = (page, sel, opts) =>
  page.locator(sel).first().evaluate((el, o) => {
    if (o.into) el.scrollIntoView({behavior: 'smooth', block: 'start'});
    else el.scrollBy({top: o.by, behavior: 'smooth'});
  }, opts);
const VIEWER_SCROLL = '[data-uri="photo-viewer"] > div.overflow-y-auto';

/* Fuera de cámara: cerrar todo y volver al sector entero, capa Daño. */
const home = async (page) => {
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
  if (await page.locator('[data-uri="place-card"]').count()) {
    await page.locator('[aria-label="Cerrar la tarjeta del lugar"]').click();
  }
  await page.locator('[data-uri="layer"][data-layer="dano"]').click();
  await page.locator('[aria-label="Ver todo el sector de estudio"]').click();
  await page.waitForTimeout(3500);
};

export default {
  title: 'REBUILD — fotos de campo',
  template: 'walkthrough',
  colorScheme: 'light',
  brand: '#1b45c4',
  intro: {title: 'REBUILD', subtitle: 'Fotos de campo enlazadas al daño'},
  outro: {title: 'REBUILD', subtitle: 'Cada foto, con su porqué'},

  setup: async (page) => {
    await page.goto(BASE, {waitUntil: 'domcontentloaded'});
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('rebuild.ajustes.v1', JSON.stringify({theme: 'light', radius: 500, veil: true}));
    });
    await page.goto(BASE, {waitUntil: 'networkidle'});
    await page.waitForSelector('[data-uri="map"] canvas', {timeout: 60_000});
    for (const k of ['dano', 'poblacion', 'espacio', 'equipamientos', 'territorio']) {
      await page.locator(`[data-uri="layer"][data-layer="${k}"]`).click();
      await page.waitForTimeout(1500);
    }
    // Precarga de las imágenes: que ninguna se vea a medio llegar.
    await page.evaluate(async () => {
      const r = await fetch('data/field_photos.json').then((x) => x.json());
      await Promise.all(r.photos.flatMap((p) => [p.thumb, p.image]).map((u) => fetch('data/' + u)));
    });
    await page.waitForTimeout(2000);
  },

  scenes: [
    {
      id: 'c1-capas',
      media: 'clip',
      settleMs: 600,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.pause(800);
        await rec.click('[data-uri="layer"][data-layer="dano"]');
        await rec.pause(1600);
        await rec.moveTo('[data-uri="legend"]');
        await rec.pause(2200);
      },
    },
    {
      id: 'c2-buscar',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('[data-uri="search-open"]');
        await rec.pause(400);
        await rec.type('input[placeholder="Buscar lugar o sitio"]', 'los alamos', {delay: 70});
        await rec.pause(700);
        await rec.click('#search-results [role="option"]');
        await page.waitForSelector('[data-uri="place-card"]', {timeout: 15_000});
        await rec.pause(1500);
        await rec.moveTo('[data-uri="place-card"] [data-uri="place-row"]:has-text("Fotos de campo")');
        await rec.pause(2200);
      },
    },
    {
      id: 'c3-galeria',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('button:has-text("Examinar evidencia")');
        await page.waitForSelector('[data-uri="panel"][data-panel="evidencia"]', {timeout: 15_000});
        await rec.pause(1000);
        await smooth(page, '[data-uri="field-gallery"]', {into: true});
        await rec.pause(1400);
        await rec.moveTo('[data-uri="field-thumb"] >> nth=0');
        await rec.pause(900);
        await rec.click('[data-uri="field-thumb"] >> nth=0');
        await page.waitForSelector('[data-uri="photo-viewer"]', {timeout: 10_000});
        await rec.pause(2600);
        await rec.moveTo('[data-uri="photo-reason"]');
        await rec.pause(2600);
      },
    },
    {
      id: 'c4-medida',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('[aria-label="Cerrar la foto"]');
        await rec.pause(500);
        await rec.click('[data-uri="field-thumb"] >> nth=1');
        await page.waitForSelector('[data-uri="photo-viewer"]', {timeout: 10_000});
        await rec.pause(2800);
        await rec.moveTo('[data-uri="photo-candidates"]');
        await rec.pause(1800);
        await smooth(page, VIEWER_SCROLL, {by: 330});
        await rec.pause(1400);
        await rec.moveTo('[data-uri="photo-viewer"] dd:has-text("(la mayor de las dos)")');
        await rec.pause(2600);
      },
    },
    {
      id: 'c5-ambigua',
      media: 'clip',
      prepare: home,
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.pause(500);
        await rec.click('[data-uri="photo-marker"][data-id^="7189c97a"]');
        await page.waitForSelector('[data-uri="photo-viewer"]', {timeout: 10_000});
        await rec.pause(3000);
        await rec.moveTo('[data-uri="photo-reason"]');
        await rec.pause(1500);
        await rec.moveTo('[data-uri="photo-candidates"] li >> nth=1');
        await rec.pause(1400);
        await smooth(page, VIEWER_SCROLL, {by: 400});
        await rec.pause(1200);
        await rec.moveTo('[data-uri="photo-viewer"] dd:has-text("(la mayor de las dos)")');
        await rec.pause(2600);
      },
    },
    {
      id: 'c6-encuadre',
      media: 'clip',
      prepare: home,
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.pause(400);
        await rec.click('[data-uri="photo-marker"][data-id^="51aa54bc"]');
        await page.waitForSelector('[data-uri="photo-viewer"]', {timeout: 10_000});
        await rec.pause(3000);
        await rec.moveTo('[data-uri="photo-reason"]');
        await rec.pause(2600);
      },
    },
    {
      id: 'c7-sin-enlace',
      media: 'clip',
      prepare: home,
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.pause(400);
        await rec.click('[data-uri="photo-marker"][data-id^="17893881"]');
        await page.waitForSelector('[data-uri="photo-viewer"]', {timeout: 10_000});
        await rec.pause(2600);
        await rec.moveTo('[data-uri="photo-reason"]');
        await rec.pause(2600);
      },
    },
    {
      id: 'c8-intervenciones',
      media: 'clip',
      prepare: async (page) => {
        await home(page);
        await page.locator('[data-uri="search-open"]').click();
        await page.locator('input[placeholder="Buscar lugar o sitio"]').fill('los alamos');
        await page.waitForTimeout(500);
        await page.locator('#search-results [role="option"]').first().click();
        await page.waitForSelector('[data-uri="place-card"]', {timeout: 15_000});
        await page.waitForTimeout(2500);
      },
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('[data-uri="place-card"] button:has-text("Ver posibles intervenciones")');
        await page.waitForSelector('[data-uri="panel"][data-panel="intervenciones"]', {timeout: 15_000});
        await rec.pause(1800);
        await rec.moveTo('[data-uri="evidence-chip"]:has-text("Fotos de campo")');
        await rec.pause(2200);
      },
    },
    {
      id: 'c9-verificar',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('button:has-text("Preparar verificación")');
        await page.waitForSelector('[data-uri="panel"][data-panel="verificacion"]', {timeout: 15_000});
        await rec.pause(1200);
        await rec.moveTo('[data-uri="panel"] p:has-text("Evidencia de campo")');
        await rec.pause(2600);
      },
    },
  ],
};
