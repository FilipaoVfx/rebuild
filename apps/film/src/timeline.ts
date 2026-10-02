/**
 * La línea de tiempo de la película. Todo el estado sale de `t` (segundos):
 * se puede renderizar cualquier fotograma en cualquier orden, que es lo que
 * permite capturarla fotograma a fotograma sin depender del reloj.
 */

export const FPS = 30;
export const DURATION = 62;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
/** 0 → 1 entre a y b, suavizado. */
export const ease = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** Envolvente: entra en [a, a+fi], sale en [b-fo, b]. */
export const env = (t: number, a: number, b: number, fi = 0.7, fo = 0.7) =>
  Math.min(ease(t, a, a + fi), 1 - ease(t, b - fo, b));

export const T = {
  title: [0.6, 6.9] as const,
  rise: [1.6, 5.4] as const,
  explode: 7.0,
  frag: [7.4, 18.7] as const,
  thesis: [18.9, 23.3] as const,
  collapse: [24.4, 27.8] as const,
  evidence: [27.8, 33.2] as const,
  entorno: [33.2, 39.6] as const,
  oportunidad: [39.6, 46.6] as const,
  verificacion: [46.6, 50.8] as const,
  justif: [50.8, 62] as const,
};

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
    key: 'fuentes', label: 'Fuentes', a: 23.3, b: 24.9,
    title: 'Solo entran fuentes con licencia leída.',
    sub: 'El POT de IDE AMCO no declara licencia: se consulta aparte y no se publica.',
  },
  {
    key: 'cruce', label: 'Cruce', a: 24.9, b: T.evidence[0],
    title: 'Las piezas se cruzan sobre el mismo territorio.',
    sub: 'Una sola base, con la versión y la procedencia de cada capa.',
  },
  {
    key: 'evidencia', label: 'Evidencia', a: T.evidence[0], b: T.evidence[1],
    title: '182 observaciones de daño se agrupan en 115 sitios.',
    sub: 'Foto-interpretación satelital: dice qué se ve, no si un edificio es seguro.',
  },
  {
    key: 'entorno', label: 'Entorno', a: T.entorno[0], b: T.entorno[1],
    title: 'Cada sitio se lee con su entorno.',
    sub: 'Quién vive a 10 minutos a pie, qué espacio público y qué servicios tiene cerca.',
  },
  {
    key: 'hipotesis', label: 'Hipótesis', a: T.oportunidad[0], b: T.oportunidad[1],
    title: 'De un lugar dañado a una oportunidad explicada.',
    sub: 'Dos intervenciones comparadas: qué atienden y qué falta comprobar.',
  },
  {
    key: 'verificacion', label: 'Verificación', a: T.verificacion[0], b: T.verificacion[1],
    title: 'Lo que falta no se rellena: se convierte en preguntas.',
    sub: 'Ocho comprobaciones para la visita de campo, antes de decidir.',
  },
];

export const stageAt = (t: number) => STAGES.findIndex((s) => t >= s.a && t < s.b);
