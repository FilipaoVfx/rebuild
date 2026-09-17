import type { ContextKey } from './palette';
import type { Opportunity, Site } from '../types';
import type { LayerName } from '../data';

export interface ContextDef {
  key: ContextKey;
  label: string;
  question: string;
  /** Qué mide la rampa, en palabras del dominio. */
  unit: string;
  legend: [string, string];
  /** Valor 0..1 por sitio. `null` = ese sitio no tiene con qué responder. */
  value: (site: Site, opp?: Opportunity) => number | null;
  /** Lectura del valor crudo para el tooltip. */
  readout: (site: Site, opp?: Opportunity) => string;
  /** Capas de contexto que enciende. Se parte de todo apagado. */
  layers: LayerName[];
  /** Coropleta de celdas de población encendida. */
  populationChoropleth?: boolean;
  sources: string[];
  /** Si falta la fuente, el contexto lo dice en vez de pintar cero. */
  missingNote?: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Escala ordinal de la clase fusionada. Es lo que discrimina en el AOI. */
const DAMAGE_SEVERITY: Record<string, number> = {
  POSSIBLY_DAMAGED: 0.2,
  DAMAGED: 0.6,
  DESTROYED: 1,
};

export const CONTEXTS: ContextDef[] = [
  {
    key: 'SITUACION',
    label: 'Situación',
    question: '¿Qué está pasando en el territorio?',
    unit: 'población medida por celda',
    legend: ['Menos gente', 'Más gente'],
    value: (s) => clamp01(s.population_10min / 20000),
    readout: (s) => `${Math.round(s.population_10min).toLocaleString('es-CO')} personas a 10 min andando`,
    layers: ['buildings', 'roads', 'evidence'],
    populationChoropleth: true,
    sources: ['copernicus_ems', 'microsoft_buildings', 'osm'],
  },
  {
    key: 'DANO',
    label: 'Daño',
    question: '¿Dónde hay evidencia de afectación?',
    unit: 'clase de daño fusionada',
    legend: ['Posiblemente dañado', 'Destruido'],
    value: (s) => (s.damage_class ? DAMAGE_SEVERITY[s.damage_class] ?? null : null),
    readout: (s) =>
      s.damage_class
        ? `${s.damage_class} · confianza ${(s.damage_confidence ?? 0).toFixed(2)} · ${s.evidence_count} obs.`
        : 'sin evidencia en este sitio',
    layers: ['buildings', 'evidence'],
    sources: ['copernicus_ems'],
    missingNote:
      'Toda la evidencia es foto-interpretación: 182 observaciones sin validación de campo. La clase dice qué se ve desde la vertical, no el estado estructural.',
  },
  {
    key: 'NECESIDAD',
    label: 'Necesidad',
    question: '¿Dónde se concentra la población alcanzable?',
    unit: 'personas alcanzables a 10 minutos andando',
    legend: ['Pocas', 'Muchas'],
    value: (s) => clamp01(s.population_10min / 20000),
    readout: (s) => `${Math.round(s.population_10min).toLocaleString('es-CO')} personas`,
    layers: ['roads', 'catchments'],
    populationChoropleth: true,
    sources: ['copernicus_ems', 'microsoft_buildings'],
    missingNote:
      'La población es derivada, no medida por sitio: un total publicado de 190.000 para el AOI repartido dasimétricamente sobre huellas de edificio, asumiendo densidad uniforme por área construida.',
  },
  {
    key: 'DEFICIT',
    label: 'Déficit',
    question: '¿Dónde falta espacio público?',
    unit: 'déficit frente al estándar de 10 m²/habitante',
    legend: ['Dotado', 'Sin dotación'],
    value: (s) => (s.park_deficit === null ? null : clamp01(s.park_deficit)),
    readout: (s) =>
      s.park_deficit === null ? 'sin dato de déficit' : `déficit ${s.park_deficit.toFixed(2)}`,
    layers: ['green', 'roads'],
    sources: ['osm', 'microsoft_buildings'],
  },
  {
    key: 'ACCESO',
    label: 'Acceso',
    question: '¿Qué tan conectado está el sitio a pie?',
    unit: 'densidad de red peatonal en 400 m',
    legend: ['Aislado', 'Conectado'],
    value: (s) =>
      s.pedestrian_accessibility === null ? null : clamp01(s.pedestrian_accessibility),
    readout: (s) =>
      s.pedestrian_accessibility === null
        ? 'sin dato de accesibilidad'
        : `densidad de red ${s.pedestrian_accessibility.toFixed(2)} · captación por ${s.catchment_method === 'NETWORK' ? 'red' : 'buffer'}`,
    layers: ['roads', 'facilities', 'catchments'],
    sources: ['osm'],
  },
  {
    key: 'OPORTUNIDADES',
    label: 'Oportunidades',
    question: '¿Dónde podemos actuar, y con qué?',
    unit: 'idoneidad del baseline por reglas (0–100)',
    legend: ['Menor', 'Mayor'],
    value: (_s, o) => (o ? clamp01(o.suitability / 100) : null),
    readout: (_s, o) =>
      o ? `${o.intervention_label} · idoneidad ${o.suitability.toFixed(1)}` : 'sin oportunidad emitida',
    layers: ['roads', 'green'],
    sources: ['copernicus_ems', 'microsoft_buildings', 'osm'],
    missingNote:
      'La idoneidad ordena, no titula, y no es una probabilidad de éxito: nadie ha validado todavía que estas recomendaciones sean sensatas para Pereira.',
  },
];

export const contextByKey = (k: ContextKey) => CONTEXTS.find((c) => c.key === k)!;

export interface Discrimination {
  covered: number;
  total: number;
  distinct: number;
  spread: number;
  /** El eje tiene cobertura pero no separa a los sitios. */
  flat: boolean;
}

/**
 * Cobertura ≠ información. Un eje puede estar cubierto al 100 % y no ordenar
 * nada — `pedestrian_accessibility` vale 1,0 en 112 de 115 sitios. Pintar eso
 * como una rampa sugiere una variación que no existe, así que el visor lo mide
 * y lo declara en vez de dejar que el color mienta.
 */
export function discriminationOf(values: (number | null)[]): Discrimination {
  const defined = values.filter((v): v is number => v !== null);
  const sorted = [...defined].sort((a, b) => a - b);
  const distinct = new Set(defined.map((v) => v.toFixed(4))).size;
  const p10 = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
  const p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;
  const spread = p90 - p10;
  return {
    covered: defined.length,
    total: values.length,
    distinct,
    spread,
    flat: defined.length > 0 && (distinct <= 3 || spread < 0.02),
  };
}
