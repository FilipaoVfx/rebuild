import { useEffect, useState } from 'react';
import { assetUrl, IS_STATIC } from '../data';
import { FIELD_CATEGORY, LOCATION_SOURCE } from '../lib/field';
import type { FieldPhoto } from '../types';
import { Note } from './ui';

/** Fotos de campo del sitio (ADR-24): lo que se ve en el terreno, debajo de
 *  lo que dicen las cifras. Cada miniatura abre la foto completa con su
 *  ficha: cuándo, desde dónde, con qué precisión, y si alguien la revisó. */
export function PhotoStrip({ photos, loading }: { photos: FieldPhoto[]; loading: boolean }) {
  const [open, setOpen] = useState<FieldPhoto | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (loading) return null;
  const pending = photos.filter((p) => p.review_status === 'PENDIENTE').length;

  return (
    <div className="mt-3" data-uri="photo-strip" data-count={photos.length}>
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] tracking-[0.14em] text-graphite-500 uppercase">
          Fotos de campo
        </div>
        <span className="num text-[10px] text-graphite-400">
          {photos.length}{pending ? ` · ${pending} sin revisar` : ''}
        </span>
      </div>
      {photos.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-graphite-500">
          Sin fotos de campo todavía. Se toman con <b>pereiramap</b> a menos de 75 m del sitio y
          aparecen aquí tras la siguiente corrida del pipeline.
        </p>
      ) : (
        <ul className="mt-1.5 grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <li key={p.observation_id}>
              <button
                data-uri="photo-thumb"
                onClick={() => setOpen(p)}
                className="group relative block aspect-square w-full overflow-hidden rounded-[3px] border border-rule bg-sheet"
                title={`${FIELD_CATEGORY[p.category ?? ''] ?? 'Foto'} · ${fechaHora(p.captured_at)}`}
              >
                <img src={src(p.thumb_url)} alt="" loading="lazy"
                     className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
                {p.review_status === 'PENDIENTE' && (
                  <span className="absolute top-1 left-1 rounded bg-sheet/80 px-1 text-[9px] text-warn">sin revisar</span>
                )}
                {p.category && (
                  <span className="absolute right-1 bottom-1 rounded bg-sheet/80 px-1 text-[9px] text-graphite-700">
                    {FIELD_CATEGORY[p.category] ?? p.category}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos.length > 0 && (
        <Note>
          Punto de captura desde la vía pública, hora del teléfono, imagen sin metadatos.
          {' '}{photos[0].attribution ?? 'Fotos de campo — pereiramap (colaboradores), CC BY 4.0'}.
        </Note>
      )}

      {open && (
        <div role="dialog" aria-modal="true" data-uri="photo-lightbox"
             className="fixed inset-0 z-50 flex flex-col bg-sheet/95 p-4"
             onClick={() => setOpen(null)}>
          <img src={src(open.url)} alt="" className="min-h-0 flex-1 object-contain"
               onClick={(e) => e.stopPropagation()} />
          <div className="mx-auto mt-3 w-full max-w-xl text-[12px] text-graphite-700"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <b className="text-toner">{FIELD_CATEGORY[open.category ?? ''] ?? 'Foto de campo'}</b>
              <span className="text-graphite-500">{fechaHora(open.captured_at)}</span>
            </div>
            <div className="mt-1 text-graphite-500">
              {LOCATION_SOURCE[open.location_source] ?? open.location_source}
              {open.accuracy_m !== null && ` · ±${Math.round(open.accuracy_m)} m`}
              {open.heading_deg !== null && ` · rumbo ${Math.round(open.heading_deg)}°`}
              {open.site_distance_m !== null && ` · a ${Math.round(open.site_distance_m)} m del sitio`}
              {open.exif_gps ? ' · la foto traía GPS' : ''}
              {open.review_status === 'PENDIENTE' ? ' · sin revisar' : ' · revisada'}
            </div>
            <div className="mt-1 text-graphite-400">
              {open.width}×{open.height} · {open.attribution ?? 'pereiramap, CC BY 4.0'} · Esc para cerrar
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Las URLs llegan como `data/field/...`: en vivo las sirve la API en ese
 *  mismo camino; en estático, `build_static.py` las copia bajo `data/`. */
const src = (p: string) => (IS_STATIC ? assetUrl(p.replace(/^data\//, '')) : p);

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
