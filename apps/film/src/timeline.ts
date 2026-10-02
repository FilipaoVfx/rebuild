/**
 * La línea de tiempo de la película. Todo el estado sale de `t` (segundos):
 * se puede renderizar cualquier fotograma en cualquier orden, que es lo que
 * permite capturarla fotograma a fotograma sin depender del reloj.
 *
 * Dura 30 s: abre el demo, y su último fotograma (azul marino) empalma con
 * la portada del recorrido por la interfaz.
 */

export const FPS = 30;
export const DURATION = 30;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
/** 0 → 1 entre a y b, suavizado. */
export const ease = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** Envolvente: entra en [a, a+fi], sale en [b-fo, b]. */
export const env = (t: number, a: number, b: number, fi = 0.5, fo = 0.5) =>
  Math.min(ease(t, a, a + fi), 1 - ease(t, b - fo, b));

export const T = {
  title: [0.3, 3.7] as const,
  rise: [0.5, 2.9] as const,
  places1: [0.9, 3.5] as const,
  /** Las capas se separan una tras otra. */
  explode: 3.5,
  layerStagger: 0.42,
  layerDur: 1.3,
  frag: [3.7, 9.4] as const,
  fragLater: 6.2,
  thesis: [9.4, 12.4] as const,
  thesisSecond: 10.2,
  potOut: [12.5, 13.4] as const,
  /** Y vuelven a caer sobre el terreno. */
  collapse: [13.0, 15.0] as const,
  collapseStagger: 0.12,
  collapseDur: 1.3,
  places2: [13.6, 17.8] as const,
  evidence: [15.2, 17.8] as const,
  entorno: [17.8, 20.6] as const,
  oportunidad: [20.6, 23.3] as const,
  verificacion: [23.3, 25.4] as const,
  justif: [25.4, 30] as const,
  fadeOut: [29.3, 30] as const,
};

/** Cuándo empieza a separarse la capa i (1…5). */
export const layerStart = (i: number) => T.explode + (i - 1) * T.layerStagger;

export interface Stage {
  key: string;
  label: string;
  a: number;
  b: number;
  title: string;
  sub: string;
}

/** Las seis etapas del pipeline, en el orden en que el sistema las recorre. */
export const STAGES: Stage[] = [
  {
    key: 'fuentes', label: 'Fuentes', a: T.thesis[1], b: 13.6,
    title: 'Solo entran fuentes con licencia.',
    sub: 'El POT de IDE AMCO no declara la suya: queda fuera.',
  },
  {
    key: 'cruce', label: 'Cruce', a: 13.6, b: T.evidence[0],
    title: 'Todo se cruza sobre el mismo territorio.',
    sub: 'Una base, con la procedencia de cada capa.',
  },
  {
    key: 'evidencia', label: 'Evidencia', a: T.evidence[0], b: T.evidence[1],
    title: '182 observaciones de daño, 115 sitios.',
    sub: 'Foto-interpretación satelital, sin validar en campo.',
  },
  {
    key: 'entorno', label: 'Entorno', a: T.entorno[0], b: T.entorno[1],
    title: 'Cada sitio, con su entorno a pie.',
    sub: 'Población, espacio público y servicios a 10 minutos.',
  },
  {
    key: 'hipotesis', label: 'Hipótesis', a: T.oportunidad[0], b: T.oportunidad[1],
    title: 'Una oportunidad explicada.',
    sub: 'Dos hipótesis: qué atienden y qué falta comprobar.',
  },
  {
    key: 'verificacion', label: 'Verificación', a: T.verificacion[0], b: T.verificacion[1],
    title: 'Lo que falta se vuelve preguntas.',
    sub: 'Ocho comprobaciones para la visita de campo.',
  },
];

export const stageAt = (t: number) => STAGES.findIndex((s) => t >= s.a && t < s.b);
