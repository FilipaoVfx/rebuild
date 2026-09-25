export type RGB = [number, number, number];

function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Rampas secuenciales sobre papel: la MISMA curva de luminosidad en todos los
 * contextos, de claro a oscuro. Más tinta es más valor, como en un anexo
 * impreso. Cambiar de contexto cambia el tono, nunca cómo se lee el mapa.
 * Ningún tono cae en la banda del violeta (250–300°): esa tinta es del sello.
 */
function ramp(hue: number, hueShift = 12, satScale = 1): RGB[] {
  const stops = [
    { l: 91, s: 26 }, { l: 80, s: 38 }, { l: 67, s: 46 },
    { l: 53, s: 50 }, { l: 40, s: 52 }, { l: 28, s: 54 },
  ];
  return stops.map((st, i) =>
    hslToRgb(hue + (hueShift * i) / (stops.length - 1), st.s * satScale, st.l));
}

export type ContextKey =
  | 'TERRITORIO' | 'SITUACION' | 'DANO' | 'NECESIDAD' | 'DEFICIT' | 'ACCESO' | 'OPORTUNIDADES';

export const RAMPS: Record<ContextKey, RGB[]> = {
  /* Orientación: sin coropleta. La rampa existe solo para tipar; el mapa no la usa. */
  TERRITORIO: ramp(215, 0, 0.2),
  SITUACION: ramp(206, -8),
  DANO: ramp(8, 6),
  NECESIDAD: ramp(30, 8),
  DEFICIT: ramp(186, 8),
  ACCESO: ramp(142, 10),
  /* La oportunidad es el concepto mismo: se dibuja en tinta, no en color. */
  OPORTUNIDADES: ramp(220, 0, 0.12),
};

/**
 * Jerarquía vial (ADR-22). Sobre papel, una vía importante es la que lleva
 * más tinta: el tono y el ancho siguen a la clase `highway` de OSM.
 */
export const ROAD_STYLE: Record<string, { width: number; color: RGBA }> = {
  motorway: { width: 2.8, color: [88, 94, 104, 235] },
  trunk: { width: 2.6, color: [96, 102, 112, 232] },
  primary: { width: 2.4, color: [108, 114, 124, 228] },
  secondary: { width: 1.8, color: [132, 138, 148, 220] },
  tertiary: { width: 1.3, color: [156, 161, 170, 210] },
  motorway_link: { width: 1.4, color: [128, 134, 144, 200] },
  trunk_link: { width: 1.4, color: [128, 134, 144, 200] },
  primary_link: { width: 1.2, color: [140, 146, 156, 200] },
  secondary_link: { width: 1.0, color: [160, 165, 174, 190] },
  tertiary_link: { width: 0.9, color: [176, 181, 189, 180] },
  residential: { width: 0.9, color: [184, 189, 197, 190] },
  unclassified: { width: 0.9, color: [184, 189, 197, 190] },
  living_street: { width: 0.8, color: [190, 195, 202, 180] },
  pedestrian: { width: 0.7, color: [196, 200, 207, 170] },
  service: { width: 0.5, color: [206, 210, 216, 150] },
  footway: { width: 0.5, color: [206, 210, 216, 140] },
  path: { width: 0.5, color: [206, 210, 216, 130] },
  steps: { width: 0.5, color: [206, 210, 216, 130] },
};
export const ROAD_DEFAULT: { width: number; color: RGBA } = { width: 0.7, color: [190, 195, 202, 170] };

export type RGBA = [number, number, number, number];

/** El tejido urbano es el papel sobre el que se dibuja todo: siempre presente, nunca protagonista. */
export const BUILDING_FILL: RGBA = [218, 221, 226, 200];
export const BUILDING_FILL_TERRITORY: RGBA = [206, 210, 216, 220];
export const WATER_COLOR: RGBA = [104, 150, 190, 215];
/* Límite municipal en tinta; comunas y barrios en grafito decreciente. */
export const ADMIN_COLOR: Record<number, RGBA> = {
  7: [23, 24, 27, 210],
  8: [72, 76, 84, 200],
  9: [140, 146, 156, 170],
};
export const LANDMARK_COLOR: Record<string, RGBA> = {
  government: [23, 24, 27, 240],
  square: [23, 24, 27, 240],
  health: [168, 38, 29, 235],
  education: [37, 99, 160, 235],
  transport: [26, 110, 112, 235],
  sport: [37, 99, 160, 225],
  culture: [138, 83, 0, 225],
  heritage: [138, 83, 0, 225],
  commerce: [110, 115, 124, 210],
  worship: [110, 115, 124, 190],
  green: [29, 107, 69, 225],
  infrastructure: [110, 115, 124, 210],
};

export function sample(r: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (r.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = r[i];
  const b = r[Math.min(r.length - 1, i + 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export const rgbCss = (c: RGB, alpha = 1) =>
  alpha === 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;

/** Color por familia de intervención. El catálogo del backend, agrupado. */
export const INTERVENTION_COLOR: Record<string, RGB> = {
  PARK: [29, 120, 70],
  OPEN_SPACE: [70, 138, 96],
  PUBLIC_SQUARE: [37, 99, 160],
  SPORTS: [158, 92, 18],
  COMMUNITY_FACILITY: [30, 68, 132],
  NO_BUILD: [122, 127, 136],
};

export const STATUS_COLOR: Record<string, string> = {
  OK: 'var(--color-ok)',
  WARNING: 'var(--color-warn)',
  BLOCKED: 'var(--color-bad)',
  UNKNOWN: 'var(--color-unknown)',
};
