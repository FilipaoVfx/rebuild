import type { LayerName } from '../data';
import type { GeoJSON, Opportunity, Provenance, Recommendation, Site, SiteDetail } from '../types';
import { DAMAGE_LABEL, FACTOR_LABEL, dec, m2, n } from './format';

export type Feature = GeoJSON['features'][number];
export type LngLat = [number, number];
export type BBox = [number, number, number, number];

/* ── Geometría mínima, sin dependencias ─────────────────────────────── */

export function metersBetween(a: LngLat, b: LngLat): number {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111_320 * Math.cos(lat);
  const dy = (b[1] - a[1]) * 110_540;
  return Math.hypot(dx, dy);
}

/** Anillos exteriores de un Polygon o MultiPolygon. */
export function outerRings(f: Feature): LngLat[][] {
  const g = f.geometry;
  if (g.type === 'Polygon') return [(g.coordinates as LngLat[][])[0]];
  if (g.type === 'MultiPolygon') return (g.coordinates as LngLat[][][]).map((p) => p[0]);
  return [];
}

export function bboxOf(f: Feature): BBox {
  if (f.geometry.type === 'Point') {
    const [x, y] = f.geometry.coordinates as LngLat;
    return [x, y, x, y];
  }
  const pts = outerRings(f).flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Distancia del sitio al rasgo: al punto, o al vértice más cercano del contorno. */
function distanceTo(from: LngLat, f: Feature): number {
  if (f.geometry.type === 'Point') return metersBetween(from, f.geometry.coordinates as LngLat);
  let best = Infinity;
  for (const ring of outerRings(f)) {
    for (const p of ring) best = Math.min(best, metersBetween(from, p));
  }
  const [w, s, e, nn] = bboxOf(f);
  /* Dentro del rectángulo del polígono cuenta como "aquí mismo". */
  if (from[0] >= w && from[0] <= e && from[1] >= s && from[1] <= nn) best = Math.min(best, 0);
  return best;
}

/* ── El lugar ───────────────────────────────────────────────────────── */

export const placeName = (s: Site) => s.neighborhood ?? s.commune ?? 'Sin barrio en OSM';

export function sitesInPlace(sites: Site[], site: Site): Site[] {
  if (!site.neighborhood) return [site];
  return sites
    .filter((x) => x.neighborhood === site.neighborhood)
    .sort((a, b) => a.site_id.localeCompare(b.site_id));
}

/* ── Entorno ────────────────────────────────────────────────────────── */

export interface Nearby {
  name: string;
  kind: string;
  distance: number;
  source: 'SIGPER' | 'OSM';
  area: number | null;
}

/** Radio de entorno. Unos 6 minutos a pie: lo que un vecino llama "cerca". */
export const NEARBY_RADIUS_M = 500;

const OSM_KIND: Record<string, string> = {
  park: 'Parque', pitch: 'Cancha', playground: 'Parque infantil', garden: 'Jardín',
  recreation_ground: 'Zona recreativa', grass: 'Zona verde', village_green: 'Zona verde',
  education: 'Educación', health: 'Salud', community: 'Comunitario', school: 'Educación',
  hospital: 'Salud', clinic: 'Salud', library: 'Biblioteca',
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

function collect(
  from: LngLat, gj: GeoJSON | undefined, source: 'SIGPER' | 'OSM', radius: number,
): Nearby[] {
  if (!gj) return [];
  const out: Nearby[] = [];
  for (const f of gj.features) {
    const d = distanceTo(from, f);
    if (d > radius) continue;
    const label = String(f.properties.label ?? '');
    const kind = source === 'OSM' ? OSM_KIND[label] ?? cap(label.replace(/_/g, ' ')) : cap(label);
    const raw = f.properties.display_name;
    out.push({
      name: raw ? String(raw) : `${kind} sin nombre`,
      kind,
      distance: d,
      source,
      area: typeof f.properties.area_m2 === 'number' ? (f.properties.area_m2 as number) : null,
    });
  }
  return out;
}

export function nearbyOf(
  site: Site, layers: Partial<Record<LayerName, GeoJSON>>, radius: number = NEARBY_RADIUS_M,
) {
  const from: LngLat = [site.lon, site.lat];
  const byDistance = (a: Nearby, b: Nearby) => a.distance - b.distance;
  return {
    publicSpace: [
      ...collect(from, layers.municipal_public_space, 'SIGPER', radius),
      ...collect(from, layers.green, 'OSM', radius),
    ].sort(byDistance),
    facilities: [
      ...collect(from, layers.municipal_facilities, 'SIGPER', radius),
      ...collect(from, layers.facilities, 'OSM', radius),
    ].sort(byDistance),
    ready: Boolean(
      layers.municipal_public_space && layers.green && layers.municipal_facilities && layers.facilities,
    ),
  };
}

/* ── Población alcanzable ───────────────────────────────────────────── */

/**
 * Una caminata de 10 minutos cubre del orden de medio kilómetro cuadrado. Una
 * captación de menos de 5 ha no es un barrio aislado: es la red peatonal que
 * no conectó al sitio. En esos sitios la cifra de personas no se muestra como
 * alcance (10 de 115 en los datos n.º 135).
 */
export const DEGENERATE_CATCHMENT_M2 = 50_000;

export interface Reach {
  people: number | null;
  households: number | null;
  area: number | null;
  method: string;
  reliable: boolean;
  note: string;
}

export function reachOf(site: Site, detail: SiteDetail | undefined): Reach {
  const f = detail?.features ?? {};
  const area = (f.catchment_area_m2 as number | null | undefined) ?? null;
  const people = (f.population_10min as number | null | undefined) ?? site.population_10min ?? null;
  const households = (f.households_10min as number | null | undefined) ?? null;
  const method = site.catchment_method === 'NETWORK' ? 'red peatonal de OSM' : 'radio fijo';
  if (area !== null && area < DEGENERATE_CATCHMENT_M2) {
    return {
      people, households, area, method, reliable: false,
      note: `El área caminable calculada es de ${m2(area)}, anormalmente pequeña para 10 minutos: la red peatonal no conectó bien este sitio. La cifra de personas no es un alcance real.`,
    };
  }
  return {
    people, households, area, method, reliable: people !== null,
    note: 'Estimación: 190.000 personas del área de estudio repartidas sobre las huellas de edificios de Microsoft. No es un censo del punto.',
  };
}

/* ── Evidencia ──────────────────────────────────────────────────────── */

export function evidenceLine(site: Site): string {
  if (!site.evidence_count) return 'Sin observaciones en este sitio';
  const cls = site.damage_class ? DAMAGE_LABEL[site.damage_class] ?? site.damage_class : 'clase sin fuente';
  return `${site.evidence_count} ${site.evidence_count === 1 ? 'observación' : 'observaciones'} · ${cls.toLowerCase()}`;
}

/** Lo que baja la confianza, con nombres que no mienten. */
export const CONFIDENCE_DRIVER: Record<string, string> = {
  damage_evidence: 'Solidez de la evidencia de daño',
  catchment_buffer: 'Alcance medido por radio fijo: no sabe dónde hay un río o una quebrada',
  no_field_validation: 'Nadie lo ha validado en campo',
  single_independent_source: 'Una sola fuente independiente',
  no_population_in_catchment: 'Sin población en el área caminable',
  /* El pipeline todavía resta esto a todos los sitios con un nombre heredado
     de cuando el contexto era simulado (engine.py). ADR-17 retiró lo
     simulado; la resta sigue. Se dice tal cual en vez de repetir la etiqueta. */
  synthetic_context_layers: 'Descuento fijo heredado del contexto simulado (ya retirado, pendiente de corregir)',
};

/* ── Intervenciones: lo que son, dicho una vez ──────────────────────── */

export const INTERVENTION: Record<string, { name: string; purpose: string; need: string }> = {
  PARK: {
    name: 'Parque',
    purpose: 'Un espacio verde de estancia y recreación para el barrio.',
    need: 'Espacio público verde',
  },
  SPORTS: {
    name: 'Escenario deportivo',
    purpose: 'Una cancha o espacio para la actividad física del barrio.',
    need: 'Actividad física y recreación',
  },
  PUBLIC_SQUARE: {
    name: 'Plaza pública',
    purpose: 'Un espacio de encuentro que active la vida cotidiana del barrio.',
    need: 'Encuentro y espacio público',
  },
  COMMUNITY_FACILITY: {
    name: 'Equipamiento comunitario',
    purpose: 'Un espacio para servicios de proximidad y actividades barriales.',
    need: 'Servicios de proximidad',
  },
  OPEN_SPACE: {
    name: 'Espacio abierto',
    purpose: 'Suelo despejado y seguro, de uso flexible mientras se decide.',
    need: 'Espacio libre y seguro',
  },
  NO_BUILD: {
    name: 'No construir',
    purpose: 'Despejar y asegurar el predio, sin nueva edificación.',
    need: 'Seguridad del predio',
  },
};

export const interventionName = (code: string) => INTERVENTION[code]?.name ?? code;

/** Las hipótesis que el sistema puede comparar en un sitio, de más a menos idónea. */
export function alternativesOf(detail: SiteDetail | undefined): Recommendation[] {
  return [...(detail?.recommendations ?? [])].sort((a, b) => b.score - a.score);
}

/** La pareja inicial: las dos más idóneas que construyen algo. */
export function defaultPair(detail: SiteDetail | undefined): string[] {
  const all = alternativesOf(detail);
  const building = all.filter((r) => r.intervention !== 'NO_BUILD');
  return (building.length >= 2 ? building : all).slice(0, 2).map((r) => r.intervention);
}

export function driversText(rec: Recommendation): string {
  const d = rec.explanation.drivers_positive.map((k) => FACTOR_LABEL[k] ?? k);
  if (!d.length) return 'Ningún factor la empuja con claridad en este sitio.';
  const list = d.length === 1 ? d[0] : `${d.slice(0, -1).join(', ')} y ${d[d.length - 1]}`;
  return `El sistema ve aquí ${list}.`;
}

/** La nota del contrafactual, con los factores en castellano. */
export function counterfactualText(rec: Recommendation): string | null {
  const c = rec.explanation.counterfactual;
  if (!c) return null;
  const factor = FACTOR_LABEL[c.factor] ?? c.factor;
  return `Si ${factor} bajara de ${dec(c.current_value)} a ${dec(c.required_value)}, la propuesta cambiaría.`;
}

/* ── Verificación ───────────────────────────────────────────────────── */

export type VerifyTag = 'Por verificar' | 'Por observar' | 'Por conversar' | 'Pendiente de validación';

export interface VerifyItem {
  id: string;
  icon: 'building' | 'people' | 'walk' | 'talk' | 'tree' | 'ruler' | 'doc' | 'quake';
  title: string;
  tag: VerifyTag;
  question: string;
  why: string;
}

/**
 * Las dudas de un lugar convertidas en preguntas de visita. Cada una sale de
 * un hueco concreto de los datos de este sitio, y lo cita: la lista no es una
 * plantilla, es lo que el sistema no sabe aquí.
 */
export function verificationItems(
  site: Site, detail: SiteDetail | undefined, opp: Opportunity | undefined, hypotheses: string[],
): VerifyItem[] {
  const items: VerifyItem[] = [];
  const f = detail?.features ?? {};

  items.push({
    id: 'estado',
    icon: 'building',
    title: 'Estado real de la edificación',
    tag: 'Por verificar',
    question: '¿Lo que se ve desde el satélite corresponde al estado real? ¿Hay demolición, riesgo de colapso o reparación en curso?',
    why: `${evidenceLine(site)}. Es foto-interpretación satelital de Copernicus EMS y nadie la ha validado en campo.`,
  });

  items.push({
    id: 'uso',
    icon: 'people',
    title: 'Uso actual del lugar',
    tag: 'Por observar',
    question: '¿Cómo se usa hoy el espacio? ¿Qué actividades se realizan y en qué momentos?',
    why: 'El sistema no tiene datos de uso actual: el uso de suelo de OpenStreetMap cubre 1 de los 115 sitios.',
  });

  const acc = site.pedestrian_accessibility;
  const reach = reachOf(site, detail);
  items.push({
    id: 'acceso',
    icon: 'walk',
    title: 'Acceso peatonal',
    tag: 'Por verificar',
    question: '¿Cómo llegan las personas? ¿Es seguro, cómodo y continuo el acceso a pie?',
    why: reach.reliable
      ? `La densidad de red peatonal medida en OSM es ${acc === null ? 'desconocida' : dec(acc)} (de 0 a 1). Mide calles mapeadas, no andenes, pendientes ni seguridad.`
      : reach.note,
  });

  const wantsService = hypotheses.some((h) => h === 'COMMUNITY_FACILITY' || h === 'SPORTS');
  const wantsOpen = hypotheses.some((h) => h === 'PARK' || h === 'PUBLIC_SQUARE' || h === 'OPEN_SPACE');
  if (wantsService) {
    items.push({
      id: 'demanda',
      icon: 'talk',
      title: 'Demanda de servicios',
      tag: 'Por conversar',
      question: '¿Qué equipamientos o servicios hacen falta? ¿Quiénes los necesitan?',
      why: 'La brecha de equipamientos se calcula por cercanía a los registrados en OSM y SIGPER. No hay datos de demanda ni de capacidad.',
    });
  }
  if (wantsOpen) {
    const deficit = f.park_deficit as number | null | undefined;
    items.push({
      id: 'espacio',
      icon: 'tree',
      title: 'Espacio público existente',
      tag: 'Por observar',
      question: '¿Los parques y plazas cercanos se usan y están en buen estado? ¿Qué les falta?',
      why: deficit === null || deficit === undefined
        ? 'Sin dato de déficit de espacio público para este sitio.'
        : `El déficit de espacio público calculado es ${dec(deficit)} (1 = nada de espacio público alcanzable frente al estándar de 10 m² por habitante).`,
    });
  }

  const area = site.area_m2;
  const areaCheck = opp?.feasibility.find((c) => c.check_id === 'area');
  items.push({
    id: 'suelo',
    icon: 'ruler',
    title: 'Suelo disponible y propiedad',
    tag: 'Por verificar',
    question: '¿Cuánto suelo hay realmente disponible y de quién es?',
    why: `El área sale del polígono de daño (${m2(area)}${site.area_is_estimated ? ', estimada' : ''})${areaCheck && areaCheck.status !== 'OK' ? `: ${areaCheck.detail}` : '.'} La propiedad no se conoce: el catastro de IGAC no declara licencia.`,
  });

  items.push({
    id: 'pot',
    icon: 'doc',
    title: 'Normativa POT',
    tag: 'Pendiente de validación',
    question: '¿Qué usos, tratamientos y condicionantes del POT aplican a este polígono?',
    why: 'El POT de IDE AMCO se consulta en un sandbox, pero su licencia no está declarada y el criterio de compatibilidad espera validación de Planeación (ADR-26). No hay dato publicable.',
  });

  items.push({
    id: 'riesgo',
    icon: 'quake',
    title: 'Suelo y riesgo sísmico',
    tag: 'Pendiente de validación',
    question: '¿Qué dice la microzonificación sísmica sobre este suelo y qué exige para construir?',
    why: 'La amenaza del SGC se retiró por licencia (ADR-18) y la microzonificación de IDE AMCO espera la suya (ADR-26).',
  });

  return items;
}

/* ── Procedencia ────────────────────────────────────────────────────── */

const SHORT_SOURCE: Record<string, string> = {
  copernicus_ems: 'Copernicus EMS',
  osm: '© OpenStreetMap contributors',
  microsoft_buildings: 'Microsoft',
  pereira_sig: 'SIGPER',
  dane_censo_2018: 'DANE',
  copernicus_sentinel: 'Sentinel',
  copernicus_dem: 'Copernicus DEM',
  natural_earth: 'Natural Earth',
};

/** Las fuentes que alimentan esta versión, en el orden en que se leen. */
export function sourceLine(p: Provenance): string[] {
  const ids = [...new Set((p.layers ?? []).map((l) => l.source_id))];
  const order = Object.keys(SHORT_SOURCE);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return ids.sort((a, b) => rank(a) - rank(b)).map((id) => SHORT_SOURCE[id] ?? id);
}

export const peopleLine = (r: Reach) =>
  r.reliable && r.people !== null ? `≈ ${n(r.people)} personas a 10 min a pie` : 'Alcance no confiable en este sitio';
