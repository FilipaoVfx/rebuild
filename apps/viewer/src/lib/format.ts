const nf = new Intl.NumberFormat('es-CO');

export const n = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : nf.format(Math.round(v));

/** Decimal con coma, como se escribe en Colombia. */
export const dec = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : v.toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Pesos colombianos, en millones: es como razona un presupuesto municipal. */
export function cop(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1e9) return `$${dec(value / 1e9, value < 1e10 ? 2 : 1)} mil millones`;
  if (value >= 1e6) return `$${n(value / 1e6)} millones`;
  return `$${n(value)}`;
}

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${dec(v * 100, digits)} %`;

export const m2 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${n(v)} m²`);

export function metros(v: number): string {
  if (v >= 1000) return `${dec(v / 1000, 1)} km`;
  return `${n(Math.round(v / 10) * 10)} m`;
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const DAMAGE_LABEL: Record<string, string> = {
  DESTROYED: 'Destruido',
  DAMAGED: 'Dañado',
  POSSIBLY_DAMAGED: 'Posiblemente dañado',
  NOT_AFFECTED: 'Sin afectación',
};

export const METHOD_LABEL: Record<string, string> = {
  REMOTE_SENSING: 'Foto-interpretación satelital',
  FIELD_SURVEY: 'Levantamiento en campo',
  CITIZEN_REPORT: 'Reporte ciudadano',
};

export const FACTOR_LABEL: Record<string, string> = {
  need: 'población alcanzable',
  deficit: 'déficit de espacio público',
  vulnerability: 'vulnerabilidad social',
  accessibility: 'buena conectividad peatonal',
  facility_gap: 'brecha de equipamientos',
};

export const LICENSE_LABEL: Record<string, string> = {
  ATTRIBUTION: 'Uso libre con atribución',
  SHARE_ALIKE: 'Uso libre, compartir igual',
  COMMERCIAL_SAFE: 'Uso libre',
  NON_COMMERCIAL: 'Solo uso no comercial',
  RESTRICTED: 'Restringida',
  UNCLEAR: 'Licencia sin declarar',
};

/** Las razones del motor de restricciones se escribieron sin tildes. */
export const razon = (s: string) =>
  s.replace(/m2\b/g, 'm²').replace(/\bArea\b/g, 'Área').replace(/\bminimo\b/g, 'mínimo').replace(/\bmaximo\b/g, 'máximo');

/** Quita tildes y mayúsculas: buscar "galeria" tiene que encontrar "Galería". */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
