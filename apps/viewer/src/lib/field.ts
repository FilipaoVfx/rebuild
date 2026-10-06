import type { FieldIndex, FieldLinkReason, FieldPhoto } from '../types';

/**
 * Fotos de campo y su enlace a los sitios (ADR-24 §6, regla campo-v2).
 *
 * La posición es la del teléfono, no la del edificio. Una foto ENLAZADA se
 * muestra en su sitio; una AMBIGUA, en cada uno de sus candidatos, con la duda
 * dicha; una SIN ENLACE, solo en el mapa, con la razón.
 */

export const CATEGORY_LABEL: Record<string, string> = {
  COLAPSO: 'Colapso',
  DANO_ESTRUCTURAL: 'Daño estructural',
  DANO_LEVE: 'Daño leve',
  ESCOMBROS: 'Escombros',
};
export const ACCESS_LABEL: Record<string, string> = {
  OPEN: 'paso libre',
  RESTRICTED: 'paso restringido',
  BLOCKED: 'paso bloqueado',
};
export const LOCATION_LABEL: Record<string, string> = {
  DEVICE: 'GPS del teléfono',
  EXIF: 'GPS de la foto (EXIF)',
  MANUAL: 'marcada a mano en el mapa',
};

/** Por qué la foto está (o no) en un sitio, en una frase. */
export const REASON_LABEL: Record<FieldLinkReason, string> = {
  HEADING_CONFIRMED: 'El sitio es el más cercano a menos de 75 m y cae dentro del encuadre de la cámara.',
  NEAREST_WITHIN_RANGE: 'El sitio es el más cercano a menos de 75 m y ningún otro queda dentro del margen de duda.',
  RUNNER_UP_WITHIN_MARGIN: 'Hay más de un sitio dentro del margen de duda: la posición no basta para decir cuál muestra.',
  NO_SITE_IN_VIEW: 'Hay un sitio cerca, pero queda fuera del encuadre de la cámara: no es lo fotografiado.',
  NO_SITE_WITHIN_RANGE: 'Ningún sitio de daño a menos de 75 m: daño que la observación satelital no registró.',
  OUTSIDE_STUDY_AREA: 'Fuera del sector de estudio: no hay observación satelital con qué cruzarla.',
};

export const STATUS_LABEL = { LINKED: 'Enlazada', AMBIGUOUS: 'Ambigua', UNLINKED: 'Sin enlace' } as const;

/** Una foto vista desde un sitio: enlazada a él o candidata dudosa. */
export interface SitePhoto {
  photo: FieldPhoto;
  linked: boolean;
  distance_m: number;
  /** Los otros sitios que podría mostrar, si es ambigua. */
  others: { site_id: string; distance_m: number }[];
}

export function photosBySite(field: FieldIndex | null): Map<string, SitePhoto[]> {
  const out = new Map<string, SitePhoto[]>();
  const add = (id: string, sp: SitePhoto) => out.set(id, [...(out.get(id) ?? []), sp]);
  for (const photo of field?.photos ?? []) {
    const m = photo.match;
    if (m.status === 'LINKED' && m.site_id) {
      add(m.site_id, { photo, linked: true, distance_m: m.distance_m ?? m.candidates[0]?.distance_m ?? 0, others: [] });
    } else if (m.status === 'AMBIGUOUS') {
      for (const c of m.candidates) {
        add(c.site_id, {
          photo, linked: false, distance_m: c.distance_m,
          others: m.candidates.filter((o) => o.site_id !== c.site_id).map(({ site_id, distance_m }) => ({ site_id, distance_m })),
        });
      }
    }
  }
  /* Primero las enlazadas, luego por cercanía. */
  for (const list of out.values()) list.sort((a, b) => Number(b.linked) - Number(a.linked) || a.distance_m - b.distance_m);
  return out;
}

/** La línea de la tarjeta del lugar. */
export function fieldLine(list: SitePhoto[] | undefined): string {
  const linked = list?.filter((p) => p.linked).length ?? 0;
  const doubtful = (list?.length ?? 0) - linked;
  if (!linked && !doubtful) return 'Sin fotos de campo en este sitio';
  const parts = [];
  if (linked) parts.push(`${linked} ${linked === 1 ? 'foto enlazada' : 'fotos enlazadas'}`);
  if (doubtful) parts.push(`${doubtful} ${doubtful === 1 ? 'ambigua' : 'ambiguas'}`);
  return parts.join(' · ');
}

/** 0 es dentro (así lo escribe la regla); 0,9 m es fuera, y se dice «1 m». */
export const metros = (m: number) => (m === 0 ? 'dentro del polígono' : `${Math.max(1, Math.round(m))} m`);
