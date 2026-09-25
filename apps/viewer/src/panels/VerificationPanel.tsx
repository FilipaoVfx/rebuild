import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/icons';
import { Crumbs, Kicker, Sheet } from '../components/ui';
import { fecha } from '../lib/format';
import {
  bboxOf, defaultPair, evidenceLine, interventionName, outerRings, peopleLine, placeName, reachOf,
  verificationItems, type VerifyItem, type VerifyTag,
} from '../lib/place';
import { useStore, type VerificationDraft } from '../state/store';
import type { Site } from '../types';

const ICONS: Record<VerifyItem['icon'], React.ReactNode> = {
  building: <Icon.Building size={24} />,
  people: <Icon.People size={24} />,
  walk: <Icon.Walk size={24} />,
  talk: <Icon.Talk size={24} />,
  tree: <Icon.Tree size={24} />,
  ruler: <Icon.Ruler size={24} />,
  doc: <Icon.Doc size={24} />,
  quake: <Icon.Quake size={24} />,
};

const TAG_STYLE: Record<VerifyTag, string> = {
  'Por verificar': 'bg-cobalt-50 text-cobalt-700',
  'Por observar': 'bg-[#eef3e9] text-[#35602f]',
  'Por conversar': 'bg-[#f2ecf6] text-[#5f3d8f]',
  'Pendiente de validación': 'bg-amber-50 text-amber-900',
};

export function VerificationPanel({ site }: { site: Site }) {
  const { details, oppBySite, pairFor, draftFor, setDraft, openPanel, requestLayers } = useStore();
  const detail = details[site.site_id];
  const opp = oppBySite.get(site.site_id);
  const draft: VerificationDraft = draftFor(site.site_id) ?? {
    checked: [],
    question: '',
    hypotheses: pairFor(site.site_id) ?? defaultPair(detail),
  };
  const items = verificationItems(site, detail, opp, draft.hypotheses);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const update = (d: Partial<VerificationDraft>) => setDraft(site.site_id, { ...draft, ...d });
  const allChecked = items.length > 0 && items.every((i) => draft.checked.includes(i.id));
  useEffect(() => requestLayers(['waterways', 'roads']), [requestLayers]);

  const print = () => {
    setPrinting(true);
    /* Se pinta la ficha y después se imprime; al cerrar el diálogo, se retira. */
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 60);
  };

  return (
    <Sheet
      id="verificacion"
      wide
      label={`Verificación en ${placeName(site)}`}
      onClose={() => openPanel(null)}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-card px-6 py-4">
          <button type="button" className="btn btn-secondary" onClick={() => openPanel('intervenciones')}>
            <Icon.Back size={20} /> Volver a las alternativas
          </button>
          <span className="order-last w-full text-[13px] text-ink-3 sm:order-none sm:w-auto">
            Borrador local · no enviado
          </span>
          <button type="button" className="btn btn-primary" onClick={print}>
            <Icon.Print size={20} /> Preparar ficha de visita
          </button>
        </div>
      }
    >
      <div className="px-6 pt-5 pb-8 lg:px-8">
        <Crumbs site={site} tail="Verificación" />
        <Kicker className="mt-5">Cuaderno de verificación</Kicker>
        <h2 className="mt-1 pr-10 font-serif text-[32px] leading-[1.08] font-semibold tracking-tight lg:text-[42px]">
          ¿Qué debemos comprobar en {placeName(site)}?
        </h2>
        <p className="mt-1.5 font-serif text-[18px] text-ink-2 lg:text-[20px]">Convierte las dudas en una visita con propósito.</p>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <div className="rounded-[4px] bg-wash px-4 py-3.5">
              <p className="flex items-center gap-2 text-[14.5px] text-ink-2">
                <Icon.Bulb size={20} className="text-cobalt" /> Hipótesis seleccionadas para verificar en campo:
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {draft.hypotheses.length === 0 && (
                  <span className="text-[14px] text-ink-3">
                    Ninguna: la visita comprueba el estado del lugar.{' '}
                    <button type="button" className="link" onClick={() => openPanel('intervenciones')}>Elegir en la comparación</button>
                  </span>
                )}
                {draft.hypotheses.map((h, i) => (
                  <span key={h} className="flex items-center gap-2">
                    {i > 0 && <span className="text-ink-3" aria-hidden="true">⇄</span>}
                    <span className="inline-flex items-center gap-2 rounded-full bg-cobalt-50 py-1 pr-1.5 pl-3 text-[14px]">
                      <span className="text-cobalt-700">Hipótesis</span>
                      <b className="font-semibold">{interventionName(h)}</b>
                      <button
                        type="button"
                        aria-label={`Quitar la hipótesis ${interventionName(h)}`}
                        className="grid size-6 place-items-center rounded-full hover:bg-cobalt-100"
                        onClick={() => update({ hypotheses: draft.hypotheses.filter((x) => x !== h) })}
                      >
                        <Icon.Close size={14} />
                      </button>
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <h3 className="font-serif text-[21px] font-semibold">Lista de verificación</h3>
              <label className="flex items-center gap-2 text-[14px] text-ink-2">
                <input
                  type="checkbox" className="size-4 accent-cobalt" checked={allChecked}
                  onChange={() => update({ checked: allChecked ? [] : items.map((i) => i.id) })}
                />
                Marcar todas como revisadas
              </label>
            </div>
            <ul className="mt-3 space-y-2.5">
              {items.map((it) => {
                const checked = draft.checked.includes(it.id);
                const open = openItem === it.id;
                return (
                  <li key={it.id} data-uri="verify-item" data-item={it.id} className={`rounded-[4px] border bg-card ${checked ? 'border-rule' : 'border-rule-2'}`}>
                    <div className="grid grid-cols-[auto_auto_1fr_auto] items-start gap-3 px-3.5 py-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-[18px] accent-cobalt"
                        checked={checked}
                        aria-label={`Revisado: ${it.title}`}
                        onChange={() => update({
                          checked: checked ? draft.checked.filter((x) => x !== it.id) : [...draft.checked, it.id],
                        })}
                      />
                      <span className="mt-0.5 text-ink-2">{ICONS[it.icon]}</span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <b className={`text-[15.5px] ${checked ? 'text-ink-3 line-through' : ''}`}>{it.title}</b>
                          <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${TAG_STYLE[it.tag]}`}>{it.tag}</span>
                        </p>
                        <p className="mt-0.5 text-[14px] leading-snug text-ink-2">{it.question}</p>
                        {open && (
                          <p className="animate-rise mt-2 border-t border-rule pt-2 text-[13.5px] leading-snug text-ink-3">
                            <b className="text-ink-2">Por qué está en la lista:</b> {it.why}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={open ? 'Ocultar por qué' : 'Ver por qué está en la lista'}
                        onClick={() => setOpenItem(open ? null : it.id)}
                        className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-wash"
                      >
                        <Icon.Chevron size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <label className="mt-6 block rounded-[4px] bg-wash px-4 py-3.5">
              <span className="flex items-center gap-2 text-[15.5px] font-semibold">
                <Icon.Talk size={20} /> Pregunta para la visita
              </span>
              <textarea
                value={draft.question}
                onChange={(e) => update({ question: e.target.value })}
                rows={3}
                placeholder="¿Qué usos faltan y quién los necesita?"
                className="mt-2 w-full resize-y rounded-[4px] border border-rule-2 bg-card px-3 py-2 text-[15px] focus:border-cobalt"
              />
            </label>
          </div>

          <aside className="space-y-4">
            <MiniMap site={site} />
            <div className="rounded-[4px] border border-rule bg-card px-4 py-3.5">
              <p className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold"><Icon.Doc size={20} /> Normativa POT</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12.5px] font-semibold text-amber-900">Pendiente de validación</span>
              </p>
              <p className="mt-2 text-[14px] leading-snug text-ink-2">
                Revisar los determinantes del POT aplicables al polígono: usos, tratamientos y condicionantes.
              </p>
              <p className="mt-1 text-[13px] leading-snug text-ink-3">
                IDE AMCO publica el POT, pero sin licencia declarada; el criterio de compatibilidad espera a Planeación (ADR-26).
              </p>
            </div>
            <div className="rounded-[4px] border border-dashed border-rule-2 px-4 py-3.5">
              <p className="flex items-center gap-2 font-semibold"><Icon.Image size={20} /> Evidencia de campo</p>
              <p className="mt-1.5 text-[13.5px] leading-snug text-ink-3">
                Las fotos y notas de la visita entran por la aplicación de campo y pasan revisión humana antes de
                aparecer (ADR-24). Este visor todavía no las recibe: la ficha impresa lleva espacio para anotarlas.
              </p>
            </div>
          </aside>
        </div>
      </div>
      {printing && createPortal(<Ficha site={site} draft={draft} items={items} />, document.body)}
    </Sheet>
  );
}

/** Esquema del barrio: su contorno de OSM, los cauces y el sitio. Orienta, no mide. */
function MiniMap({ site }: { site: Site }) {
  const { layers } = useStore();
  const barrio = useMemo(
    () => (layers.admin_areas?.features ?? []).find(
      (f) => Number(f.properties.admin_level) === 9 && f.properties.display_name === site.neighborhood,
    ),
    [layers.admin_areas, site.neighborhood],
  );
  const W = 300;
  const H = 210;
  const [w0, s0, e0, n0] = barrio ? bboxOf(barrio) : [site.lon - 0.004, site.lat - 0.003, site.lon + 0.004, site.lat + 0.003];
  const pad = Math.max(e0 - w0, n0 - s0) * 0.45;
  const [w, s, e, n] = [w0 - pad, s0 - pad, e0 + pad, n0 + pad];
  const k = Math.min(W / ((e - w) * Math.cos((site.lat * Math.PI) / 180)), H / (n - s));
  const cx = (W - (e - w) * Math.cos((site.lat * Math.PI) / 180) * k) / 2;
  const cy = (H - (n - s) * k) / 2;
  const xy = (lon: number, lat: number) =>
    [cx + (lon - w) * Math.cos((site.lat * Math.PI) / 180) * k, cy + (n - lat) * k] as const;
  const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => xy(x, y).join(',')).join('L')}`;
  const inside = (f: { geometry: { coordinates: unknown } }) =>
    (f.geometry.coordinates as [number, number][]).some(([x, y]) => x > w && x < e && y > s && y < n);
  const rivers = (layers.waterways?.features ?? []).filter((f) => f.geometry.type === 'LineString' && inside(f));
  const roads = (layers.roads?.features ?? []).filter((f) => f.geometry.type === 'LineString' && inside(f));
  const [px, py] = xy(site.lon, site.lat);

  return (
    <figure className="m-0 rounded-[4px] border border-rule bg-card px-4 py-3.5">
      <figcaption className="flex items-center gap-2 font-semibold"><Icon.Map size={20} /> Ubicación</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2.5 w-full rounded-[3px] bg-[#f1eee6]" role="img" aria-label={`Esquema de ${placeName(site)} con el sitio marcado`}>
        <defs><clipPath id="mini"><rect width={W} height={H} /></clipPath></defs>
        <g clipPath="url(#mini)">
          {roads.map((r, i) => (
            <path key={`r${i}`} d={path(r.geometry.coordinates as [number, number][])} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          ))}
          {rivers.map((r, i) => (
            <path key={i} d={path(r.geometry.coordinates as [number, number][])} fill="none" stroke="#9fcbe6"
              strokeWidth={String(r.properties.display_name ?? '').startsWith('Río') ? 5 : 2} strokeLinecap="round" />
          ))}
          {barrio && outerRings(barrio).map((ring, i) => (
            <path key={i} d={`${path(ring)}Z`} fill="rgb(27 69 196 / .08)" stroke="#0f1c3f" strokeWidth="1.3" strokeDasharray="4 3" />
          ))}
          <circle cx={px} cy={py} r="7" fill="#1b45c4" stroke="#fff" strokeWidth="2.5" />
        </g>
        <text x={W - 10} y={20} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f1c3f">N ↑</text>
      </svg>
      <p className="mt-2 text-[13px] leading-snug text-ink-3">
        {barrio ? `Contorno de ${site.neighborhood}` : 'Sin contorno de barrio'}, calles y cauces de OpenStreetMap. Esquema para orientar la visita, no para medir.
      </p>
    </figure>
  );
}

/** Lo que se imprime. Borrador preparado aquí: no es una orden de obra ni una validación. */
function Ficha({ site, draft, items }: { site: Site; draft: VerificationDraft; items: VerifyItem[] }) {
  const { details, provenance } = useStore();
  const reach = reachOf(site, details[site.site_id]);
  return (
    <div id="ficha" className="font-sans text-[12pt] text-black">
      <p style={{ fontSize: '10pt', letterSpacing: '.14em', textTransform: 'uppercase' }}>RECOVERY · Ficha de visita · {fecha(new Date().toISOString())}</p>
      <h1 className="font-serif" style={{ fontSize: '26pt', margin: '6pt 0 2pt' }}>{placeName(site)}</h1>
      <p>{[site.commune && `Comuna ${site.commune}`, site.corner_label, site.nearest_landmark && `cerca de ${site.nearest_landmark}`].filter(Boolean).join(' · ')}</p>
      <p style={{ color: '#444' }}>Sitio {site.site_id} · {site.lat.toFixed(5)}, {site.lon.toFixed(5)}</p>
      <hr />
      <p><b>Qué se sabe:</b> {evidenceLine(site)} (Copernicus EMS, foto-interpretación, sin validar en campo). {peopleLine(reach)}. POT sin dato publicable.</p>
      <p><b>Hipótesis a verificar:</b> {draft.hypotheses.map(interventionName).join(' / ') || 'ninguna: se verifica el estado del lugar'}</p>
      <h2 className="font-serif" style={{ fontSize: '15pt', marginTop: '12pt' }}>Lista de verificación</h2>
      <ol style={{ paddingLeft: '14pt' }}>
        {items.map((it) => (
          <li key={it.id} style={{ marginBottom: '8pt', breakInside: 'avoid' }}>
            <b>{draft.checked.includes(it.id) ? '☑' : '☐'} {it.title}</b> — {it.tag}<br />
            {it.question}<br />
            <span style={{ color: '#555', fontSize: '10pt' }}>{it.why}</span>
            <div style={{ borderBottom: '1px solid #bbb', height: '28pt' }} />
          </li>
        ))}
      </ol>
      <h2 className="font-serif" style={{ fontSize: '15pt' }}>Pregunta para la visita</h2>
      <p>{draft.question || '—'}</p>
      <div style={{ borderBottom: '1px solid #bbb', height: '40pt' }} />
      <p style={{ fontSize: '9pt', color: '#555', marginTop: '14pt' }}>
        Borrador preparado en RECOVERY con los datos n.º {provenance.data_version}. No es una orden de obra ni una
        validación. Fuentes: Copernicus EMS · © OpenStreetMap contributors · Microsoft · SIGPER · DANE.
      </p>
    </div>
  );
}
