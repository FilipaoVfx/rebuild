import { useEffect, useRef } from 'react';
import { assetUrl } from '../data';
import {
  ACCESS_LABEL, CATEGORY_LABEL, LOCATION_LABEL, REASON_LABEL, STATUS_LABEL, metros, type SitePhoto,
} from '../lib/field';
import { DAMAGE_LABEL, n } from '../lib/format';
import { placeName } from '../lib/place';
import { useStore } from '../state/store';
import type { FieldPhoto, Site } from '../types';
import { Icon } from './icons';
import { AmberBadge, Missing } from './ui';

/** Hora de Pereira, no la del servidor: la foto se tomó allí. */
export const horaLocal = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/**
 * Las fotos de campo de un sitio, en el panel de evidencia. Las enlazadas
 * primero; las ambiguas, con la duda a la vista y los otros candidatos.
 */
export function FieldGallery({ site }: { site: Site }) {
  const { field, sitePhotos, openPhoto } = useStore();
  const list = sitePhotos.get(site.site_id) ?? [];

  return (
    <section data-uri="field-gallery" aria-label="Fotos de campo">
      <div className="mt-7 mb-2 flex items-baseline justify-between gap-3">
        <h3 className="kicker">Fotos de campo</h3>
        {field && <span className="text-[12.5px] text-ink-3">pereiramap · CC BY 4.0</span>}
      </div>
      {!field && <Missing>Este paquete no trae fotos de campo</Missing>}
      {field && list.length === 0 && (
        <p className="text-[14px] leading-snug text-ink-2">
          <Missing>Ninguna foto aprobada a menos de {field.rule.link_max_m} m de este sitio</Missing>
        </p>
      )}
      {list.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((sp) => <Thumb key={sp.photo.observation_id} sp={sp} onOpen={() => openPhoto(sp.photo.observation_id)} />)}
        </ul>
      )}
      {list.length > 0 && (
        <p className="mt-2 text-[13px] leading-snug text-ink-3">
          La posición es la del teléfono, no la del edificio. La distancia se mide al borde del sitio; una foto ambigua
          se muestra en cada sitio que podría mostrar, sin elegir por usted.
        </p>
      )}
    </section>
  );
}

function Thumb({ sp, onOpen }: { sp: SitePhoto; onOpen: () => void }) {
  const p = sp.photo;
  return (
    <li>
      <button
        type="button" onClick={onOpen} data-uri="field-thumb" data-status={sp.linked ? 'LINKED' : 'AMBIGUOUS'}
        className="group block w-full text-left"
        aria-label={`Abrir foto: ${CATEGORY_LABEL[p.category] ?? p.category}, ${sp.linked ? 'enlazada' : 'ambigua'}, a ${metros(sp.distance_m)}`}
      >
        <span className={`relative block aspect-[3/4] overflow-hidden rounded-[3px] border bg-wash ${sp.linked ? 'border-rule' : 'border-amber border-dashed'}`}>
          <img src={assetUrl(p.thumb)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          <span className={`absolute top-1.5 left-1.5 rounded-[3px] px-1.5 py-0.5 text-[11.5px] font-semibold ${sp.linked ? 'bg-cobalt text-on-cobalt' : 'bg-amber-50 text-amber-900'}`}>
            {sp.linked ? 'Enlazada' : 'Ambigua'}
          </span>
        </span>
        <span className="mt-1 block text-[13.5px] font-semibold leading-tight">{CATEGORY_LABEL[p.category] ?? p.category}</span>
        <span className="num block text-[12.5px] leading-tight text-ink-3">
          {metros(sp.distance_m)} · {horaLocal(p.captured_at)}
        </span>
      </button>
    </li>
  );
}

/**
 * Una foto, entera, con todo lo que hace falta para creer o no en su enlace:
 * de dónde sale la posición, cuánto error tiene, a qué distancia queda cada
 * candidato y qué regla decidió.
 */
export function PhotoViewer() {
  const { field, photoId, openPhoto, siteById, selectSite } = useStore();
  const ref = useRef<HTMLElement>(null);
  const photo = field?.photos.find((p) => p.observation_id === photoId) ?? null;

  useEffect(() => {
    if (!photo) return;
    ref.current?.focus();
    /* En captura: Escape cierra la foto, no el panel que está debajo. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      openPhoto(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [photo, openPhoto]);

  if (!photo || !field) return null;
  const m = photo.match;

  return (
    <section
      ref={ref}
      tabIndex={-1}
      data-uri="photo-viewer"
      data-status={m.status}
      aria-label={`Foto de campo: ${CATEGORY_LABEL[photo.category] ?? photo.category}`}
      className="float animate-rise pointer-events-auto absolute inset-x-2 top-2 bottom-[72px] z-30 flex flex-col overflow-hidden outline-none md:inset-x-auto md:top-3 md:bottom-[84px] md:left-3 md:w-[480px]"
    >
      <button
        type="button" onClick={() => openPhoto(null)} aria-label="Cerrar la foto"
        className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-card/85 text-ink-2 hover:bg-wash hover:text-ink"
      >
        <Icon.Close size={20} />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <a href={assetUrl(photo.image)} target="_blank" rel="noreferrer" className="block bg-[#0b0f18]" title="Abrir la imagen original">
          <img
            src={assetUrl(photo.image)} alt={`Foto de campo: ${CATEGORY_LABEL[photo.category] ?? photo.category}`}
            width={photo.width} height={photo.height}
            className="mx-auto max-h-[46vh] w-auto object-contain"
          />
        </a>
        <div className="px-5 pt-4 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag status={m.status} />
            <span className="text-[13px] text-ink-3">regla {m.method}</span>
          </div>
          <h2 className="mt-2 font-serif text-[26px] leading-tight font-semibold tracking-tight">
            {CATEGORY_LABEL[photo.category] ?? photo.category}
          </h2>
          <p className="font-serif text-[15.5px] text-ink-2">{horaLocal(photo.captured_at)} · hora de Pereira</p>

          <h3 className="kicker mt-5 mb-1.5">¿Por qué está aquí?</h3>
          <p className="font-serif text-[16px] leading-snug" data-uri="photo-reason">{REASON_LABEL[m.reason]}</p>

          <Candidates photo={photo} onSite={(id) => { openPhoto(null); selectSite(id); }} siteName={(id) => {
            const s = siteById.get(id);
            return s ? `${placeName(s)} · ${id.replace('site_', 'sitio ')}` : id;
          }} />

          <h3 className="kicker mt-5 mb-1.5">Posición</h3>
          <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1 border-t border-rule pt-2 text-[14px]">
            <dt className="text-ink-3">Origen</dt>
            <dd>{LOCATION_LABEL[photo.location_source ?? ''] ?? 'sin dato'}</dd>
            <dt className="text-ink-3">Precisión del teléfono</dt>
            <dd className="num">{photo.accuracy_m === null ? 'sin dato' : `± ${n(photo.accuracy_m)} m`}</dd>
            <dt className="text-ink-3">GPS foto vs. teléfono</dt>
            <dd className="num">{photo.exif_device_offset_m === null ? 'sin GPS en la foto' : `${n(photo.exif_device_offset_m)} m de diferencia`}</dd>
            <dt className="text-ink-3">Incertidumbre usada</dt>
            <dd className="num font-semibold">± {n(m.uncertainty_m)} m <span className="font-normal text-ink-3">(la mayor de las dos)</span></dd>
            <dt className="text-ink-3">Margen de duda</dt>
            <dd className="num">{n(m.margin_m)} m</dd>
            <dt className="text-ink-3">Rumbo de la cámara</dt>
            <dd className="num">{m.heading_deg === null ? 'sin dato: no se usa el encuadre' : `${Math.round(m.heading_deg)}° desde el norte`}</dd>
          </dl>

          <h3 className="kicker mt-5 mb-1.5">Lo que reportó quien la tomó</h3>
          <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1 border-t border-rule pt-2 text-[14px]">
            <dt className="text-ink-3">Daño visible</dt>
            <dd>{photo.damage_visible === 'YES' ? 'sí' : photo.damage_visible === 'NO' ? 'no' : 'no lo dijo'}</dd>
            <dt className="text-ink-3">Acceso</dt>
            <dd>{ACCESS_LABEL[photo.accessibility ?? ''] ?? 'no lo dijo'}</dd>
            {photo.nearest_evidence && (
              <>
                <dt className="text-ink-3">Observación satelital más cercana</dt>
                <dd className="num">
                  {DAMAGE_LABEL[photo.nearest_evidence.damage_class] ?? photo.nearest_evidence.damage_class} a{' '}
                  {photo.nearest_evidence.distance_m >= 1000
                    ? `${(photo.nearest_evidence.distance_m / 1000).toFixed(1).replace('.', ',')} km`
                    : `${n(Math.round(photo.nearest_evidence.distance_m))} m`}
                </dd>
              </>
            )}
          </dl>

          <p className="mt-4 text-[12.5px] leading-snug text-ink-3">
            {field.attribution}. Revisada por una persona antes de publicarse (sin caras, placas ni números de casa).
            Es evidencia visual, no una inspección estructural. Integridad: sha256 {photo.image_sha256.slice(0, 12)}…
          </p>
        </div>
      </div>
    </section>
  );
}

function StatusTag({ status }: { status: FieldPhoto['match']['status'] }) {
  if (status === 'AMBIGUOUS') return <AmberBadge>Ambigua</AmberBadge>;
  if (status === 'LINKED') {
    return <span className="rounded-[3px] bg-cobalt px-2 py-1 text-[12.5px] font-semibold text-on-cobalt">Enlazada</span>;
  }
  return <span className="rounded-[3px] bg-wash px-2 py-1 text-[12.5px] font-semibold text-ink-2 ring-1 ring-rule-2">{STATUS_LABEL[status]}</span>;
}

/** Cada sitio considerado, con la distancia medida y si cae en el encuadre. */
function Candidates({
  photo, onSite, siteName,
}: { photo: FieldPhoto; onSite: (id: string) => void; siteName: (id: string) => string }) {
  const m = photo.match;
  if (m.reason === 'OUTSIDE_STUDY_AREA') return null;
  if (!m.candidates.length) {
    return <p className="mt-2 text-[14px] text-ink-3">Ningún sitio de daño a menos de {n(m.link_max_m + m.margin_m)} m.</p>;
  }
  return (
    <ul className="mt-3 border-t border-rule text-[14px]" data-uri="photo-candidates">
      {m.candidates.map((c) => {
        const chosen = m.status === 'LINKED' && c.site_id === m.site_id;
        const outOfView = c.in_view === false;
        const tooFar = c.distance_m > m.link_max_m;
        return (
          <li key={c.site_id} className="flex items-center gap-3 border-b border-rule py-2">
            <span
              className={`h-0.5 w-6 shrink-0 ${chosen ? 'bg-cobalt' : 'border-t-2 border-dashed'} ${
                !chosen && m.status === 'AMBIGUOUS' ? 'border-amber' : 'border-unknown'
              }`}
              aria-hidden="true"
            />
            <button type="button" className="link min-w-0 truncate text-left font-semibold" onClick={() => onSite(c.site_id)}>
              {siteName(c.site_id)}
            </button>
            <span className="ml-auto shrink-0 text-right">
              <span className="num font-semibold">{metros(c.distance_m)}</span>
              <span className="block text-[12px] text-ink-3">
                {chosen
                  ? 'el enlazado'
                  : outOfView
                    ? `fuera del encuadre (${Math.round(c.off_axis_deg ?? 0)}° del eje)`
                    : m.status === 'AMBIGUOUS'
                      ? tooFar ? `candidato: pasa de ${m.link_max_m} m, pero cae en el margen` : 'candidato'
                      : m.status === 'LINKED'
                        ? 'fuera del margen de duda'
                        : `pasa de ${m.link_max_m} m`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
