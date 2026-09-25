const nf = new Intl.NumberFormat('es-CO');
const fixed = new Map<number, Intl.NumberFormat>();

/** Un decimal a la colombiana: 69,6; 0,93; 1,00. Nunca un punto decimal en pantalla. */
export function dec(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (!fixed.has(digits)) {
    fixed.set(digits, new Intl.NumberFormat('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  return fixed.get(digits)!.format(v);
}

export const n = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : nf.format(Math.round(v));

/** Pesos colombianos. El repositorio razona en millones y miles de millones. */
export function cop(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1e12) return `$${dec(value / 1e12, 2)} MM MM`;
  if (value >= 1e9) {
    const mmm = value / 1e9;
    return `$${dec(mmm, mmm < 10 ? 2 : 1)} MM`;
  }
  if (value >= 1e6) return `$${n(value / 1e6)} M`;
  return `$${n(value)}`;
}

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${dec(v * 100, digits)}%`;

export const m2 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${n(v)} m²`);

export function fecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function relDays(days: number | null): string {
  if (days === null) return '—';
  if (days < 45) return `hace ${days} días`;
  if (days < 400) return `hace ${Math.round(days / 30)} meses`;
  return `hace ${dec(days / 365, 1)} años`;
}

export const DAMAGE_LABEL: Record<string, string> = {
  DESTROYED: 'Destruido',
  DAMAGED: 'Dañado',
  POSSIBLY_DAMAGED: 'Posiblemente dañado',
  NOT_AFFECTED: 'Sin afectación',
};

export const METHOD_LABEL: Record<string, string> = {
  REMOTE_SENSING: 'Sensor remoto',
  FIELD_SURVEY: 'Levantamiento en campo',
  CITIZEN_REPORT: 'Reporte ciudadano',
};

export const FACTOR_LABEL: Record<string, string> = {
  need: 'Población alcanzable',
  deficit: 'Déficit de espacio público',
  vulnerability: 'Vulnerabilidad social',
  accessibility: 'Accesibilidad peatonal',
  facility_gap: 'Brecha de equipamientos',
};

export const STATUS_LABEL: Record<string, string> = {
  OK: 'Cumple',
  WARNING: 'Con reservas',
  BLOCKED: 'Bloquea',
  UNKNOWN: 'Sin fuente',
};

export const SITE_STATE_LABEL: Record<string, string> = {
  INGESTED: 'registrado', EVALUATED: 'evaluado', EXCLUDED: 'excluido',
  CANDIDATE: 'candidato', SHORTLISTED: 'preseleccionado', ENDORSED: 'respaldado',
};

/** Quita del texto de la fuente las referencias a documentos internos del proyecto. */
export const plainReason = (r: string | null | undefined) => (r ?? "sin razón declarada").replace(/\s*\([^)]*\.md[^)]*\)/g, '').trim();

export const LICENSE_LABEL: Record<string, string> = {
  COMMERCIAL_SAFE: 'Uso libre',
  NON_COMMERCIAL: 'No comercial',
  ATTRIBUTION: 'Atribución',
  SHARE_ALIKE: 'Compartir igual',
  RESTRICTED: 'Restringida',
  UNCLEAR: 'Sin verificar',
};
