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
  | 'SITUACION' | 'DANO' | 'NECESIDAD' | 'DEFICIT' | 'ACCESO' | 'OPORTUNIDADES';

export const RAMPS: Record<ContextKey, RGB[]> = {
  SITUACION: ramp(268, 78),
  DANO: ramp(348, 34),
  NECESIDAD: ramp(292, 40),
  DEFICIT: ramp(196, -28),
  ACCESO: ramp(158, 46),
  OPORTUNIDADES: ramp(45, 12),
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
