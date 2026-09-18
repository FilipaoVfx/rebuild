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
 * Rampas secuenciales generadas desde un tono base con la MISMA curva de
 * luminosidad. Cambiar de contexto cambia el color, no cómo se lee el mapa:
 * oscuro = bajo, claro = alto, siempre.
 */
function ramp(hue: number, hueShift = 26): RGB[] {
  const stops = [
    { l: 13, s: 16 }, { l: 22, s: 34 }, { l: 32, s: 46 },
    { l: 44, s: 56 }, { l: 58, s: 64 }, { l: 74, s: 72 },
  ];
  return stops.map((st, i) => hslToRgb(hue + (hueShift * i) / (stops.length - 1), st.s, st.l));
}

export type ContextKey =
  | 'TERRITORIO' | 'SITUACION' | 'DANO' | 'NECESIDAD' | 'DEFICIT' | 'ACCESO' | 'OPORTUNIDADES';

export const RAMPS: Record<ContextKey, RGB[]> = {
  /* Orientación: sin coropleta. La rampa existe solo para tipar; el mapa no la usa. */
  TERRITORIO: ramp(215, 0),
  SITUACION: ramp(268, 78),
  DANO: ramp(348, 34),
  NECESIDAD: ramp(292, 40),
  DEFICIT: ramp(196, -28),
  ACCESO: ramp(158, 46),
  OPORTUNIDADES: ramp(45, 12),
};

/**
 * Jerarquía vial (ADR-22). Una avenida no es una escalera: el ancho y el tono
 * siguen a la clase `highway` de OSM para que la malla se lea como ciudad.
 */
export const ROAD_STYLE: Record<string, { width: number; color: RGBA }> = {
  motorway: { width: 2.8, color: [104, 116, 134, 235] },
  trunk: { width: 2.6, color: [98, 110, 128, 232] },
  primary: { width: 2.4, color: [92, 104, 122, 230] },
  secondary: { width: 1.8, color: [78, 90, 108, 220] },
  tertiary: { width: 1.3, color: [66, 77, 94, 210] },
  motorway_link: { width: 1.4, color: [80, 92, 110, 200] },
  trunk_link: { width: 1.4, color: [80, 92, 110, 200] },
  primary_link: { width: 1.2, color: [74, 86, 104, 200] },
  secondary_link: { width: 1.0, color: [66, 77, 94, 190] },
  tertiary_link: { width: 0.9, color: [58, 69, 86, 180] },
  residential: { width: 0.9, color: [52, 62, 78, 190] },
  unclassified: { width: 0.9, color: [52, 62, 78, 190] },
  living_street: { width: 0.8, color: [50, 60, 76, 180] },
  pedestrian: { width: 0.7, color: [50, 60, 76, 170] },
  service: { width: 0.5, color: [44, 52, 66, 150] },
  footway: { width: 0.5, color: [44, 52, 66, 140] },
  path: { width: 0.5, color: [44, 52, 66, 130] },
  steps: { width: 0.5, color: [44, 52, 66, 130] },
};
export const ROAD_DEFAULT: { width: number; color: RGBA } = { width: 0.7, color: [50, 60, 76, 170] };

export type RGBA = [number, number, number, number];

/** El tejido urbano es el papel sobre el que se dibuja todo: siempre presente, nunca protagonista. */
export const BUILDING_FILL: RGBA = [30, 37, 48, 150];
export const BUILDING_FILL_TERRITORY: RGBA = [38, 46, 60, 180];
export const WATER_COLOR: RGBA = [76, 140, 190, 200];
export const ADMIN_COLOR: Record<number, RGBA> = {
  7: [240, 180, 41, 190],
  8: [120, 132, 150, 210],
  9: [80, 90, 105, 150],
};
export const LANDMARK_COLOR: Record<string, RGBA> = {
  government: [240, 180, 41, 240],
  square: [240, 180, 41, 240],
  health: [248, 113, 113, 230],
  education: [96, 165, 250, 230],
  transport: [192, 132, 252, 230],
  sport: [125, 211, 252, 220],
  culture: [251, 191, 36, 220],
  heritage: [251, 191, 36, 220],
  commerce: [182, 192, 206, 200],
  worship: [182, 192, 206, 180],
  green: [52, 211, 153, 220],
  infrastructure: [182, 192, 206, 200],
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
  PARK: [74, 222, 128],
  OPEN_SPACE: [52, 211, 153],
  PUBLIC_SQUARE: [125, 211, 252],
  SPORTS: [192, 132, 252],
  COMMUNITY_FACILITY: [96, 165, 250],
  NO_BUILD: [107, 119, 135],
};

export const STATUS_COLOR: Record<string, string> = {
  OK: 'var(--color-ok)',
  WARNING: 'var(--color-warn)',
  BLOCKED: 'var(--color-bad)',
  UNKNOWN: 'var(--color-unknown)',
};
