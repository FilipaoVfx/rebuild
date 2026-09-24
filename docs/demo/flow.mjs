// Recovery — Pereira. Demo para contraparte institucional.
//
// Regla de este guion: el territorio antes que el resultado (ADR-22), el
// problema titula y el puntaje solo ordena (ADR-20), y el limite del AOI se
// declara antes de ensenar nada (no es toda la ciudad).
//
// Deliberadamente fuera: la lista de 105, el deslizador de idoneidad, la
// descomposicion tecnica, Escenarios y el optimizador. Un visor que ensena
// todo lo que tiene se lee como ruido, no como producto.

const BASE = 'http://127.0.0.1:8812';

export default {
  title: 'Recovery — Pereira',
  template: 'walkthrough',
  colorScheme: 'dark',
  brand: '#f59e0b',
  caption: {theme: 'pill', size: 'md', position: 'bottom'},

  intro: {
    title: 'Urban Recovery Intelligence',
    subtitle: 'Pereira, Risaralda · corte 2026-09-18',
    script: 'Evidencia urbana versionada, para decidir donde verificar primero.',
  },

  // El capture solo navega desde aqui: `scene.url` es exclusivo de las
  // escenas de telefono. Sin esto la captura corre sobre una pagina en blanco.
  setup: async (page) => {
    await page.goto(BASE, {waitUntil: 'networkidle'});
    await page.waitForSelector('[data-uri="map"]', {state: 'visible', timeout: 60_000});
    await page.waitForSelector('[data-uri="comuna"]', {timeout: 60_000});
    await page.waitForTimeout(4000);   // el basemap PMTiles termina de dibujar
  },

  scenes: [
    {
      id: 's1-territorio',
      settleMs: 5000,
      target: '[data-uri="map"]',
      action: 'none',
      zoom: 1.08,
      script:
        'Esto es Pereira, Risaralda. Comunas, barrios, vias y rios, sobre cartografia propia: ' +
        'el visor no carga un solo byte de un servidor ajeno. Abre situando el territorio, ' +
        'antes de mostrar ningun resultado.',
    },

    {
      id: 's2-limite',
      settleMs: 1200,
      target: '[data-uri="where-are-we"]',
      action: 'none',
      zoom: 1.75,
      script:
        'Y lo primero que declara es hasta donde llega. Pereira tiene un perimetro urbano de ' +
        '"32,8 km²". Este visor cubre el rectangulo marcado, "21,66 km²": es donde Copernicus ' +
        'apunto el sensor despues del sismo. No es toda la ciudad, y lo dice antes que cualquier otra cosa.',
    },

    {
      id: 's3-sismo',
      media: 'clip',
      // La cortina se enciende aqui, fuera de la grabacion: cargar las escenas
      // Sentinel tarda, y `clipRate` solo acelera hasta 1,3x.
      prepare: async (page) => {
        await page.locator('[data-uri="imagery-toggle"]').first().click();
        await page.waitForSelector('[data-uri="swipe-handle"]', {timeout: 60_000});
        await page.waitForTimeout(5000);
      },
      settleMs: 1200,
      record: async (page, rec) => {
        await rec.moveTo('[data-uri="where-are-we"] + *');   // panel «El sismo»
        await rec.pause(2600);
        // `rec.drag` no sirve aqui: calcula el destino DENTRO de la caja del
        // elemento, y el agarre mide 36 px — barreria 3 px en una cortina de
        // 1520. Ademas hace 20 pasos, y cada uno recompone las dos capas
        // raster (~1,3 s con la grabacion activa): 26 s de clip para nada.
        // A mano: cinco pasos sobre el ancho real del contenedor.
        const h = await page.locator('[data-uri="swipe-handle"]').first().boundingBox();
        const y = Math.round(h.y + h.height / 2);
        await rec.moveTo('[data-uri="swipe-handle"]');
        await page.mouse.down();
        for (const x of [1040, 920, 800, 700, 630]) {
          await page.mouse.move(x, y);
        }
        await page.mouse.up();
        await rec.moveTo('[data-uri="swipe-handle"]');   // el agarre ya se movio
        await rec.pause(2600);
      },
      script:
        'El sismo del 10 de agosto de 2026, magnitud "7,4", con epicentro a 59 kilometros. ' +
        'Y las escenas satelitales antes y despues, cada una con su fecha y su limitacion escrita ' +
        'al lado: reflectancia observada, no dano confirmado. La imagen nunca viaja sola.',
    },

    {
      id: 's4-cifras',
      settleMs: 1000,
      target: '[data-uri="where-are-we"] + * + *',   // grid de las tres cifras
      action: 'none',
      zoom: 1.7,
      script:
        'Sobre esto corre todo: "182" observaciones de dano de Copernicus, agrupadas en "115" ' +
        'sitios, sobre una poblacion medida de "190.000" personas dentro del area.',
    },

    {
      id: 's5-oportunidad',
      media: 'clip',
      prepare: async (page) => {
        // La cortina queda apagada: la ficha se lee sobre el mapa de calles.
        const toggle = page.locator('[data-uri="imagery-toggle"]').first();
        const input = toggle.locator('input');
        if (await input.count() && await input.isChecked().catch(() => false)) {
          await toggle.click();
          await page.waitForTimeout(800);
        }
      },
      settleMs: 1000,
      record: async (page, rec) => {
        await rec.click('[data-uri="nav"][data-view="oportunidades"]');
        await rec.skipWhile(async () => {
          await page.waitForSelector('[data-uri="opportunity-card"]', {timeout: 30_000});
          await page.waitForTimeout(1200);
        });
        await rec.pause(900);
        await rec.click('[data-uri="opportunity-card"] >> nth=0');
        await rec.skipWhile(async () => {
          await page.waitForSelector('[data-uri="detail"]', {timeout: 30_000});
          await page.waitForTimeout(1500);
        });
        await rec.pause(4200);                       // lugar + problema
        await page.locator('[data-uri="detail"]').hover();
        await page.mouse.wheel(0, 380);              // ¿por que aqui?
        await rec.pause(5200);
        await page.mouse.wheel(0, 300);              // factores restantes
        await rec.pause(4200);
        await page.mouse.wheel(0, 420);              // alternativas evaluadas
        await rec.pause(5600);
      },
      script:
        'Y asi se ve una oportunidad, entera. No abre con un puntaje: abre con el lugar. ' +
        '"Barrio Corocito", comuna Villavicencio, carrera 10 con calle 7, a 50 metros de la ' +
        'Iglesia la Trinidad. Despues el problema, en palabras: zona con alta concentracion de ' +
        'poblacion y deficit de espacio publico. Cada factor con su aporte exacto al puntaje. ' +
        'Y las alternativas que se evaluaron y se descartaron, con su costo. ' +
        'La idoneidad ordena la lista; no la titula.',
    },

    {
      id: 's6-pedido',
      media: 'clip',
      // Recarga limpia, fuera de la grabacion: al volver de la ficha, el panel
      // de detalle seguia abierto y el mapa zoomeado a una calle. La narracion
      // habla de las 16 comunas; la pantalla mostraba un sitio.
      prepare: async (page) => {
        await page.goto('http://127.0.0.1:8812', {waitUntil: 'networkidle'});
        await page.waitForSelector('[data-uri="comuna"]', {timeout: 60_000});
        await page.waitForTimeout(5000);
      },
      settleMs: 1200,
      record: async (page, rec) => {
        await rec.moveTo('[data-uri="where-are-we"] + * + * + *');   // panel «Comunas»
        await rec.pause(4500);
        await rec.moveTo('[data-uri="comuna"] >> nth=0');
        await rec.pause(4500);
      },
      script:
        'Todo esto corre sobre 182 observaciones satelitales de un sector. Ustedes ya levantaron ' +
        '"4.543" inspecciones de campo dentro de esta misma area. Con ellas: veinticinco veces ' +
        'mas evidencia, y las "16 comunas" en lugar del recuadro.',
    },
  ],
};
