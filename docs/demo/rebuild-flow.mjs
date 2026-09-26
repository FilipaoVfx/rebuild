// REBUILD — recorrido esencial, sin voz ni audio.
//
// Lo mínimo que prueba el producto: inspeccionar datos (capas), ubicar un
// lugar, cruzar su evidencia con imagen y entorno, comparar intervenciones y
// convertir las dudas en una verificación. Los titulares de la propia
// interfaz cuentan el recorrido; no hace falta narración.
//
// Sin subtítulos: se renderiza con --no-captions y se retira la pista de
// audio. Cada escena es un clip real; durationHint bajo deja que el clip
// marque el tiempo y se acelere hasta 1,3x.

const BASE = 'http://127.0.0.1:8816/index.html';

export default {
  title: 'REBUILD — Pereira',
  template: 'walkthrough',
  colorScheme: 'light',
  brand: '#1b45c4',

  intro: {
    title: 'REBUILD',
    subtitle: 'Recuperación urbana · Pereira, tras el sismo del 10-08-2026',
  },
  outro: {
    title: 'REBUILD',
    subtitle: 'Evidencia, entorno e hipótesis — cada una con su procedencia',
  },

  setup: async (page) => {
    await page.goto(BASE, {waitUntil: 'domcontentloaded'});
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('rebuild.ajustes.v1', JSON.stringify({theme: 'light', radius: 500, veil: true}));
    });
    await page.goto(BASE, {waitUntil: 'networkidle'});
    await page.waitForSelector('[data-uri="map"] canvas', {timeout: 60_000});
    // Precarga de capas fuera de cámara: que ningún clip muestre un mapa a medio pintar.
    for (const k of ['dano', 'poblacion', 'espacio', 'equipamientos', 'territorio']) {
      await page.locator(`[data-uri="layer"][data-layer="${k}"]`).click();
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2500);
  },

  scenes: [
    {
      id: 's1-capas',
      media: 'clip',
      settleMs: 600,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.pause(700);
        await rec.click('[data-uri="layer"][data-layer="dano"]');
        await rec.pause(1500);
        await rec.click('[data-uri="layer"][data-layer="poblacion"]');
        await rec.pause(1500);
        await rec.click('[data-uri="layer"][data-layer="territorio"]');
        await rec.pause(500);
      },
    },
    {
      id: 's2-buscar',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('[data-uri="search-open"]');
        await rec.pause(450);
        await rec.type('input[placeholder="Buscar lugar o sitio"]', 'corocito', {delay: 70});
        await rec.pause(700);
        await rec.click('#search-results [role="option"]');
        await page.waitForSelector('[data-uri="place-card"]', {timeout: 15_000});
        await rec.pause(2200);
      },
    },
    {
      id: 's3-evidencia',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('button:has-text("Examinar evidencia")');
        await page.waitForSelector('[data-uri="panel"][data-panel="evidencia"]', {timeout: 15_000});
        await rec.pause(1400);
        await rec.moveTo('[data-uri="sentinel-crop"]');
        await rec.pause(1500);
        await rec.click('[data-uri="panel"] [role="radio"]:has-text("Radar")');
        await rec.pause(1300);
      },
    },
    {
      id: 's4-entorno',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('[data-uri="panel"] button:has-text("Explorar el entorno")');
        await page.waitForSelector('[data-uri="panel"][data-panel="entorno"]', {timeout: 15_000});
        await rec.pause(1500);
        await rec.click('[data-uri="panel"] [role="radio"]:has-text("Equipamientos")');
        await rec.pause(1400);
        await rec.moveTo('[data-uri="panel"] h3:has-text("Espacio público a")');
        await rec.pause(1200);
      },
    },
    {
      id: 's5-comparar',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('[data-uri="panel"] button:has-text("Ver posibles intervenciones")');
        await page.waitForSelector('[data-uri="panel"][data-panel="intervenciones"]', {timeout: 15_000});
        await rec.pause(1900);
        await rec.click('button:has-text("Por qué el sistema la propone")');
        await rec.pause(1500);
        await rec.click('button:has-text("Guardar comparación")');
        await rec.pause(900);
      },
    },
    {
      id: 's6-verificar',
      media: 'clip',
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('button:has-text("Preparar verificación")');
        await page.waitForSelector('[data-uri="panel"][data-panel="verificacion"]', {timeout: 15_000});
        await rec.pause(1400);
        await rec.click('[data-uri="verify-item"][data-item="estado"] input');
        await rec.pause(400);
        await rec.click('[data-uri="verify-item"][data-item="acceso"] button[aria-expanded]');
        await rec.pause(1600);
      },
    },
    {
      id: 's7-oscuro',
      media: 'clip',
      prepare: async (page) => {
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-uri="place-card"]', {timeout: 15_000});
        await page.waitForTimeout(1200);
      },
      settleMs: 300,
      durationHint: 1,
      record: async (page, rec) => {
        await rec.click('[data-uri="settings-open"]');
        await rec.pause(700);
        await rec.click('[data-uri="settings"] [role="radio"]:has-text("Oscuro")');
        await rec.pause(500);
        // La cartografía de noche tarda en repintarse aquí: se corta la espera.
        await rec.skipWhile(async () => {
          await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
          await page.waitForTimeout(4500);
        });
        await page.keyboard.press('Escape');
        await rec.pause(2200);
      },
    },
  ],
};
