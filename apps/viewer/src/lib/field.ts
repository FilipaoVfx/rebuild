/** Etiquetas de las categorías cerradas de pereiramap (ADR-24). Las claves
 *  son las del enum `pereiramap.category`; la app no admite otras. */
export const FIELD_CATEGORY: Record<string, string> = {
  COLAPSO: 'Colapso',
  DANO_ESTRUCTURAL: 'Daño estructural',
  DANO_LEVE: 'Daño leve',
  ESCOMBROS: 'Escombros',
  VIA_AFECTADA: 'Vía afectada',
  EQUIPAMIENTO_AFECTADO: 'Equipamiento afectado',
  SIN_DANO_VISIBLE: 'Sin daño visible',
  OTRO: 'Otro',
};

export const LOCATION_SOURCE: Record<string, string> = {
  DEVICE: 'GPS del teléfono',
  EXIF: 'GPS de la foto',
  MANUAL: 'pin manual',
};
