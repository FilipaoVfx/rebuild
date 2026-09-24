/**
 * Datos SINTETICOS para el prototipo de Blueprint.
 *
 * ADR-17 prohibe datos sinteticos en el pipeline. Esto no es el pipeline: es un
 * prototipo sin backend que nunca se publica como producto. Rige el manifiesto
 * §31 — el dato simulado debe VERSE simulado, y por eso cada objeto lleva
 * `simulated: true` y la interfaz lo declara en el cromo permanente.
 *
 * El generador es determinista (semilla fija) para que dos ejecuciones den la
 * misma pantalla y las capturas se puedan comparar.
 */

// ─────────────────────────────────────────────────────────── casos limite
/** Los quince estados que un dato puede tener y que la interfaz debe saber
 *  dibujar. Son codigos cerrados, no frases libres (ADR-25 regla 2). */
export const ABSENCE = {
  SIN_FUENTE:         'Ningun origen publica este dato',
  NO_DISCRIMINA:      'Cubierto al 100 % y con un solo valor: no ordena nada',
  SUPRIMIDO:          'Suprimido por privacidad: menos de 20 unidades',
  AMBIGUO:            'Dos candidatos dentro del margen: no se fuerza el enlace',
  SIN_ENLACE:         'Fuera del radio de 75 m de cualquier sitio',
  BLOQUEADA_LICENCIA: 'La fuente existe y sus terminos no permiten publicarla',
  DESACTUALIZADA:     'La fuente supero su antiguedad maxima',
  EN_CONFLICTO:       'Dos fuentes compatibles reportan valores incompatibles',
  VACIO:              'Ningun elemento cumple el filtro activo',
  PARCIAL:            'Cobertura incompleta declarada',
  CONFIANZA_BAJA:     'Una sola fuente independiente',
  SIMULADO:           'Dato generado, no observado',
  SIN_DENOMINADOR:    'Cifra absoluta: no se puede expresar como tasa',
  FUERA_DE_ALCANCE:   'Fuera del area de interes publicada',
  SIN_REVISAR:        'Pendiente de revision humana antes de publicar',
} as const;
export type AbsenceCode = keyof typeof ABSENCE;

export type LicenseClass =
  | 'COMMERCIAL_SAFE' | 'ATTRIBUTION' | 'SHARE_ALIKE' | 'NON_COMMERCIAL' | 'UNCLEAR';
export type FeasibilityStatus = 'OK' | 'BLOCKED' | 'UNKNOWN';
export type MatchStatus = 'LINKED' | 'AMBIGUOUS' | 'UNLINKED';
export type ReviewStatus = 'PENDIENTE' | 'APROBADA';
export type InterventionType =
  | 'PARK' | 'SPORTS' | 'PUBLIC_SQUARE' | 'COMMUNITY_FACILITY' | 'OPEN_SPACE' | 'NO_BUILD';

// ───────────────────────────────────────────────────────────── generador
let seed = 20260810;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);

export interface Source {
  source_id: string;
  display_name: string;
  license_class: LicenseClass;
  redistribution_allowed: boolean | null;
  contributes: boolean;
  observed_at: string | null;
  max_age_days: number;
  absence?: AbsenceCode;
  note: string;
}

export const SOURCES: Source[] = [
  { source_id: 'copernicus_ems', display_name: 'Copernicus EMS — EMSR916', license_class: 'ATTRIBUTION', redistribution_allowed: true, contributes: true, observed_at: '2026-08-11', max_age_days: 45, note: 'Foto-interpretacion satelital. No es validacion de campo.' },
  { source_id: 'dane_censo_2018', display_name: 'DANE — Censo 2018 por manzana', license_class: 'ATTRIBUTION', redistribution_allowed: true, contributes: true, observed_at: '2018-11-30', max_age_days: 3650, note: 'Vulnerabilidad social medida.' },
  { source_id: 'microsoft_buildings', display_name: 'Microsoft Building Footprints', license_class: 'SHARE_ALIKE', redistribution_allowed: true, contributes: true, observed_at: '2026-06-01', max_age_days: 730, note: 'ODbL: obliga a compartir igual.' },
  { source_id: 'osm', display_name: 'OpenStreetMap', license_class: 'SHARE_ALIKE', redistribution_allowed: true, contributes: true, observed_at: '2026-09-17', max_age_days: 90, note: 'Replica del 17-09-2026.' },
  { source_id: 'pereira_sig', display_name: 'Alcaldia de Pereira — SIG municipal', license_class: 'ATTRIBUTION', redistribution_allowed: true, contributes: true, observed_at: '2026-05-20', max_age_days: 365, note: 'Ley 1712 de 2014.' },
  { source_id: 'sgc', display_name: 'SGC — Amenaza sismica', license_class: 'NON_COMMERCIAL', redistribution_allowed: false, contributes: false, observed_at: '2024-02-01', max_age_days: 1825, absence: 'BLOQUEADA_LICENCIA', note: '«Ningun contenido puede ser copiado, reproducido, recopilado, cargado, publicado, transmitido, distribuido.»' },
  { source_id: 'sertit', display_name: 'ICube-SERTIT', license_class: 'NON_COMMERCIAL', redistribution_allowed: false, contributes: false, observed_at: '2026-08-14', max_age_days: 45, absence: 'BLOQUEADA_LICENCIA', note: '«Sauf autorisation ecrite prealable.» Via abierta: pedirla.' },
  { source_id: 'igac_catastro', display_name: 'IGAC — Predios catastrales', license_class: 'UNCLEAR', redistribution_allowed: null, contributes: false, observed_at: null, max_age_days: 730, absence: 'BLOQUEADA_LICENCIA', note: '47.443 predios en el AOI. El dato es bueno; los terminos no existen.' },
  { source_id: 'pereira_ortofoto_post', display_name: 'Alcaldia — Ortofoto post-sismo 14-08', license_class: 'UNCLEAR', redistribution_allowed: null, contributes: false, observed_at: '2026-08-14', max_age_days: 180, absence: 'BLOQUEADA_LICENCIA', note: 'La imagen mas valiosa que existe. Sin licencia declarada.' },
  { source_id: 'pereira_edam', display_name: 'Alcaldia — Inspeccion EDAM', license_class: 'UNCLEAR', redistribution_allowed: null, contributes: false, observed_at: '2026-08-30', max_age_days: 60, absence: 'BLOQUEADA_LICENCIA', note: '7.697 inspecciones de campo, 4.543 en el AOI. 25x mas evidencia.' },
  { source_id: 'monitor_terremoto', display_name: 'datosdelterremoto.org', license_class: 'ATTRIBUTION', redistribution_allowed: true, contributes: false, observed_at: '2026-06-02', max_age_days: 30, absence: 'DESACTUALIZADA', note: 'Supero su antiguedad maxima de 30 dias.' },
];

export interface Factor { label: string; value: number | null; absence?: AbsenceCode; source_id: string | null; distinct?: number }
export interface Alternative { type: InterventionType; score: number; cost_mcop: number }
export interface Condition { label: string; status: FeasibilityStatus; reason: string; source_id: string | null }
export interface FieldPhoto {
  photo_id: string; captured_at: string; review_status: ReviewStatus;
  match_status: MatchStatus; distance_m: number | null; runner_up_m: number | null;
  location_source: 'DEVICE' | 'EXIF' | 'MANUAL'; accuracy_m: number;
}
export interface Opportunity {
  site_id: string; barrio: string; comuna: string; esquina: string; hito: string | null;
  intervention: InterventionType; area_m2: number; suitability: number | null;
  confidence: number; population: number | null; cost_mcop: number;
  headline: string; factors: Factor[]; alternatives: Alternative[];
  conditions: Condition[]; photos: FieldPhoto[];
  absence?: AbsenceCode; in_aoi: boolean; evidence_count: number; simulated: true;
}

const BARRIOS = ['Corocito', 'San Nicolas', 'Boston', 'El Jardin', 'Rio Otun', 'Villavicencio', 'El Poblado', 'Universidad', 'Centro', 'La Churria'];
const COMUNAS = ['Villavicencio', 'Centro', 'Boston', 'Universidad', 'Rio Otun', 'San Nicolas'];
const HITOS = ['Parque El Lago', 'Iglesia la Trinidad', 'Terminal La Florida', 'Gobernacion de Risaralda', 'Parque La Libertad', null];
const TYPES: InterventionType[] = ['PARK', 'SPORTS', 'PUBLIC_SQUARE', 'COMMUNITY_FACILITY', 'OPEN_SPACE', 'NO_BUILD'];

const headlineFor = (f: Factor[], t: InterventionType) => {
  if (t === 'NO_BUILD') return 'Restriccion activa: el sitio no admite edificacion';
  const top = f.filter((x) => x.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 2);
  const names: Record<string, string> = {
    'Poblacion alcanzable': 'alta concentracion de poblacion',
    'Deficit de espacio publico': 'deficit de espacio publico',
    'Accesibilidad peatonal': 'buena conectividad peatonal',
    'Vulnerabilidad social': 'vulnerabilidad social alta',
    'Brecha de equipamientos': 'brecha de equipamientos',
  };
  return `Zona con ${top.map((x) => names[x.label] ?? x.label).join(' y ')}`;
};

function makeOpportunity(i: number): Opportunity {
  const id = `site_${String(i).padStart(4, '0')}`;
  // `Accesibilidad peatonal` vale 1,00 en casi todos: cubierta y sin discriminar.
  const factors: Factor[] = [
    { label: 'Poblacion alcanzable', value: +between(0.1, 1).toFixed(2), source_id: 'dane_censo_2018' },
    { label: 'Deficit de espacio publico', value: +between(0.2, 1).toFixed(2), source_id: 'pereira_sig' },
    { label: 'Accesibilidad peatonal', value: 1.0, source_id: 'osm', distinct: 3 },
    { label: 'Vulnerabilidad social', value: +between(0.05, 0.9).toFixed(2), source_id: 'dane_censo_2018' },
    { label: 'Riesgo sismico', value: null, absence: 'SIN_FUENTE', source_id: null },
  ];
  if (i % 17 === 0) factors[3] = { label: 'Vulnerabilidad social', value: null, absence: 'SUPRIMIDO', source_id: 'dane_censo_2018' };
  if (i % 23 === 0) factors[1] = { label: 'Deficit de espacio publico', value: null, absence: 'EN_CONFLICTO', source_id: 'pereira_sig' };

  const type = i % 13 === 0 ? 'NO_BUILD' : pick(TYPES.slice(0, 5));
  const suit = type === 'NO_BUILD' ? 0 : +between(18, 92).toFixed(1);
  const photos: FieldPhoto[] = [];
  const nPhotos = i % 5 === 0 ? Math.floor(between(1, 4)) : 0;
  for (let p = 0; p < nPhotos; p++) {
    const ambiguous = i % 15 === 0 && p === 0;
    const unlinked = i % 19 === 0 && p === 0;
    photos.push({
      photo_id: `${id}-f${p}`,
      captured_at: `2026-09-${String(10 + (i % 14)).padStart(2, '0')}`,
      review_status: i % 7 === 0 && p === 0 ? 'PENDIENTE' : 'APROBADA',
      match_status: unlinked ? 'UNLINKED' : ambiguous ? 'AMBIGUOUS' : 'LINKED',
      distance_m: unlinked ? null : +between(4, 70).toFixed(1),
      runner_up_m: ambiguous ? +between(5, 72).toFixed(1) : null,
      location_source: pick(['DEVICE', 'EXIF', 'MANUAL'] as const),
      accuracy_m: +between(3, 65).toFixed(1),
    });
  }

  return {
    site_id: id,
    barrio: i % 29 === 0 ? '' : pick(BARRIOS),
    comuna: pick(COMUNAS),
    esquina: `Carrera ${Math.floor(between(1, 30))} con Calle ${Math.floor(between(1, 40))}`,
    hito: pick(HITOS),
    intervention: type,
    area_m2: Math.floor(between(180, 4200)),
    suitability: i % 31 === 0 ? null : suit,
    confidence: +between(0.18, 0.86).toFixed(2),
    population: i % 17 === 0 ? null : Math.floor(between(340, 21000)),
    cost_mcop: +between(19, 1240).toFixed(0),
    headline: headlineFor(factors, type),
    factors,
    alternatives: TYPES.filter((t) => t !== type).slice(0, 4)
      .map((t) => ({ type: t, score: +between(8, suit - 1).toFixed(1), cost_mcop: +between(19, 990).toFixed(0) }))
      .sort((a, b) => b.score - a.score),
    photos,
    conditions: [
      { label: 'Uso del suelo (POT)', status: i % 3 === 0 ? 'UNKNOWN' : 'OK', reason: i % 3 === 0 ? 'El POT no esta ingerido' : 'Compatible', source_id: i % 3 === 0 ? null : 'pereira_sig' },
      { label: 'Riesgo sismico', status: 'UNKNOWN', reason: 'La capa del SGC se retiro por licencia', source_id: null },
      { label: 'Area minima', status: 'OK', reason: 'Por encima del minimo de 150 m²', source_id: 'microsoft_buildings' },
      { label: 'Accesibilidad', status: i % 11 === 0 ? 'BLOCKED' : 'OK', reason: i % 11 === 0 ? 'Sin via con nombre a menos de 250 m' : 'Densidad de red 1,00', source_id: 'osm' },
    ],
    absence: i % 31 === 0 ? 'SIN_FUENTE' : i % 41 === 0 ? 'FUERA_DE_ALCANCE' : undefined,
    in_aoi: i % 41 !== 0,
    evidence_count: Math.floor(between(1, 9)),
    simulated: true,
  };
}

export const OPPORTUNITIES: Opportunity[] = Array.from({ length: 105 }, (_, i) => makeOpportunity(i + 1));

export const METRICS = [
  { label: 'Area con evidencia', num: 84, den: 248, unit: 'bloques', absence: undefined as AbsenceCode | undefined },
  { label: 'Cobertura tematica', num: 2, den: 6, unit: 'temas', absence: 'PARCIAL' as AbsenceCode },
  { label: 'Vigencia de fuentes', num: 9, den: 11, unit: 'fuentes', absence: 'DESACTUALIZADA' as AbsenceCode },
  { label: 'Validacion de campo', num: 0, den: 182, unit: 'observaciones', absence: 'SIN_FUENTE' as AbsenceCode },
];

export const HEADLINE_STATS = [
  { label: 'Observaciones de dano', value: 182, sub: 'Copernicus EMS', absence: undefined as AbsenceCode | undefined },
  { label: 'Sitios', value: 115, sub: '105 candidatos', absence: undefined as AbsenceCode | undefined },
  { label: 'Personas en el AOI', value: 190000, sub: 'reparto dasimetrico', absence: 'SIN_DENOMINADOR' as AbsenceCode },
  { label: 'Inspecciones de campo', value: null, sub: 'bloqueada por licencia', absence: 'BLOQUEADA_LICENCIA' as AbsenceCode },
];
