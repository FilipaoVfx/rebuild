const nf = new Intl.NumberFormat('es-CO');

export const n = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : nf.format(Math.round(v));

/** Pesos colombianos. El repositorio razona en millones y miles de millones. */
export function cop(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)} MM MM`;
  if (value >= 1e9) {
    const mmm = value / 1e9;
    return `$${mmm.toFixed(mmm < 10 ? 2 : 1)} MM`;
  }
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)} M`;
  return `$${n(value)}`;
}

export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`;

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
  return `hace ${(days / 365).toFixed(1)} años`;
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

export const LICENSE_LABEL: Record<string, string> = {
  ATTRIBUTION: 'Atribución',
  SHARE_ALIKE: 'Compartir igual',
  RESTRICTED: 'Restringida',
  UNCLEAR: 'Sin verificar',
};
