/**
 * La línea de tiempo. Todo el estado sale de `t` (segundos), así que cada
 * fotograma se puede pedir en cualquier orden.
 */

export const FPS = 30;
export const DURATION = 30;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
export const ease = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
export const env = (t: number, a: number, b: number, fi = 0.5, fo = 0.5) =>
  Math.min(ease(t, a, a + fi), 1 - ease(t, b - fo, b));

export const T = {
  intro: [0.3, 5.0] as const,
  growth: [5.0, 12.6] as const,
  /** Lo urbanizado hasta 1985 aparece de golpe; después, año a año. */
  old: [5.3, 6.5] as const,
  years: [7.2, 11.6] as const,
  people: [12.6, 18.6] as const,
  quake: [18.6, 23.2] as const,
  insight: [23.2, 27.6] as const,
  close: [27.6, 30] as const,
};

/** Instante en que aparece lo urbanizado en un año dado (0 = sin dato). */
export function appearAt(year: number): number {
  if (!year) return T.years[1] + 0.2;
  if (year <= 1985) return T.old[0];
  return T.years[0] + ((year - 1986) / (2015 - 1986)) * (T.years[1] - T.years[0]);
}

/** El año que marca el contador en el instante t. */
export function yearAt(t: number): number {
  if (t < T.years[0]) return 1985;
  return Math.min(2015, 1986 + Math.floor(((t - T.years[0]) / (T.years[1] - T.years[0])) * 29.999));
}
