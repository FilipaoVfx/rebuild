import { useMemo } from 'react';
import { populationOutside } from '../lib/coverage';
import type { GeoJSON } from '../types';
import { BASEMAPS } from '../lib/basemap';
import { CONTEXTS, contextByKey } from '../lib/contexts';
import { RAMPS, rgbCss } from '../lib/palette';
import { CITY_LINE, useStore } from '../state/store';
import type { ViewKey } from '../types';
import { Chip, Mark, Stamp } from './ui';

/* El índice del concepto: las secciones van en el orden del argumento, y ese
   orden es información — por eso llevan numeral. */
export const NAV: { key: ViewKey; folio: string; label: string; question: string }[] = [
  { key: 'territorio', folio: 'I', label: 'Territorio y alcance', question: '¿Dónde estamos y qué cubre la evidencia?' },
  { key: 'situacion', folio: 'II', label: 'Situación', question: '¿Qué está pasando?' },
  { key: 'oportunidades', folio: 'III', label: 'Oportunidades', question: '¿Dónde se puede actuar, y por qué ahí?' },
  { key: 'escenarios', folio: 'IV', label: 'Escenarios', question: '¿Qué cambia si cambian las prioridades?' },
  { key: 'evidencia', folio: 'V', label: 'Fuentes y límites', question: '¿En qué se basa y qué no sabe?' },
];

/** Membrete: quién emite, qué es, de cuándo. Y el sello, antes que nada. */
export function Letterhead() {
  const { provenance } = useStore();
  /* El corte es la obtención más reciente entre las capas que contribuyen. */
  const retrieved = (provenance.layers ?? []).map((l) => l.retrieved_at).sort();
  const cut = retrieved.length ? fechaCorta(retrieved[retrieved.length - 1]) : 'sin fecha';
  return (
    <header className="z-30 shrink-0 bg-sheet">
      <div className="flex items-start gap-3 px-4 pt-2.5 pb-2 sm:gap-4 sm:px-6 sm:pt-4 sm:pb-2.5">
        <Glyph />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="letterhead text-[10.5px] tracking-[0.07em] text-toner sm:text-[13px] sm:tracking-[0.12em]">Urban Recovery Intelligence</div>
          <div className="mt-0.5 font-serif text-[14px] text-toner sm:mt-1 sm:text-[17px]">
            Concepto técnico de caracterización
            <span title="El número del concepto es el de la edición de datos del corte"
                  className="num ml-2 text-[12px] text-graphite-500 sm:text-[13px]">N.º {provenance.data_version}</span>
          </div>
          <div data-uri="city-line" className="mt-0.5 text-[11.5px] text-graphite-500 sm:text-[12px]">
            {CITY_LINE} · sismo M7,4 del 10-08-2026
            <span className="md:hidden"> · <b className="num font-semibold text-toner">corte {cut}</b></span>
          </div>
        </div>
        <dl className="hidden shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[12px] md:grid">
          <dt className="text-graphite-500">Corte de datos</dt><dd className="num font-semibold text-toner">{cut}</dd>
          <dt className="text-graphite-500">Carácter</dt><dd className="text-toner">consultivo, no vinculante</dd>
          <dt className="text-graphite-500">Emite</dt><dd className="text-toner">URI, no la administración</dd>
        </dl>
        <div className="shrink-0 pt-0.5">
          <span className="hidden sm:inline-flex"><Stamp /></span>
          <span className="sm:hidden"><Stamp compact /></span>
        </div>
      </div>
      {/* El filete grueso bajo el membrete, como en todo documento emitido. */}
      <div className="mx-4 h-[3px] bg-toner sm:mx-6" />
      <SectionIndex />
    </header>
  );
}

function fechaCorta(iso: string) {
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso;
}

function SectionIndex() {
  const { view, setView, selectSite } = useStore();
  return (
    <nav aria-label="Secciones del concepto"
         className="relative flex gap-1 overflow-x-auto border-b border-rule px-2 sm:px-4">
      {NAV.map((n) => {
        const active = view === n.key;
        return (
          <button
            key={n.key}
            data-uri="nav"
            data-view={n.key}
            data-active={active ? 'true' : 'false'}
            aria-current={active ? 'page' : undefined}
            onClick={() => { setView(n.key); if (n.key !== 'oportunidades') selectSite(null); }}
            title={n.question}
            className={[
              'group relative flex shrink-0 items-baseline gap-1.5 px-2.5 pt-2.5 pb-2 text-[13px] transition-colors',
              active ? 'text-toner' : 'text-graphite-500 hover:text-toner',
            ].join(' ')}
          >
            <span className={`num text-[11px] font-bold ${active ? 'text-toner' : 'text-graphite-400 group-hover:text-graphite-600'}`}>{n.folio}</span>
            <span className={active ? 'font-semibold' : 'font-medium'}>{n.label}</span>
            {active && <span className="animate-rule absolute inset-x-2.5 -bottom-px h-[2px] bg-toner" />}
          </button>
        );
      })}
    </nav>
  );
}

function Glyph() {
  /* El emblema del emisor: tres barras de evidencia, la última en tinta plena. */
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden className="mt-0.5 hidden shrink-0 sm:block">
      <rect x="0.75" y="0.75" width="28.5" height="28.5" fill="none" stroke="var(--color-toner)" strokeWidth="1.5" />
      <rect x="7" y="16" width="4" height="8" fill="var(--color-graphite-400)" />
      <rect x="13" y="11" width="4" height="13" fill="var(--color-graphite-600)" />
      <rect x="19" y="6" width="4" height="18" fill="var(--color-toner)" />
    </svg>
  );
}

/** Encabezado del anexo: título, ruta del sitio, vistas del mapa y tipo de mapa. */
export function AnnexHeader() {
  const { context } = useStore();
  const def = contextByKey(context);
  return (
    <div className="shrink-0 bg-sheet">
      <div className="flex items-center gap-3 px-3 pt-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="letterhead hidden shrink-0 text-[10.5px] text-graphite-600 sm:inline">Anexo cartográfico</span>
            <Breadcrumb />
          </div>
        </div>
        <MapTypeSwitcher />
      </div>
      <ContextSwitcher />
      <p className="hidden px-4 pb-1.5 font-serif text-[13px] text-graphite-600 md:block">
        {def.question} <span className="text-graphite-400">· {def.unit}</span>
      </p>
    </div>
  );
}

export function ContextSwitcher() {
  const { context, setContext } = useStore();
  return (
    <div role="tablist" aria-label="Vistas del anexo"
         className="flex gap-0.5 overflow-x-auto px-2 pt-1.5 sm:px-3">
      {CONTEXTS.map((c) => {
        const active = c.key === context;
        return (
          <button
            key={c.key}
            role="tab"
            aria-selected={active}
            data-uri="context"
            data-context={c.key}
            onClick={() => setContext(c.key)}
            title={c.question}
            className={[
              'relative flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-[12.5px] whitespace-nowrap transition-colors',
              active ? 'font-semibold text-toner' : 'text-graphite-500 hover:text-toner',
            ].join(' ')}
          >
            <span className="h-2 w-2" style={{ background: active ? rgbCss(RAMPS[c.key][4]) : 'var(--color-rule-2)' }} />
            {c.label}
            {active && <span className="animate-rule absolute inset-x-2 bottom-0 h-[2px] bg-toner" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * El rótulo del anexo: lo que en una plancha oficial dice qué es el mapa, de
 * dónde sale y cómo se lee. Aquí viven la leyenda y la procedencia.
 */
export function Rotulo() {
  const { context, discrimination, provenance, alerts, setView, layers: geo, territory } = useStore();
  const def = contextByKey(context);
  const ramp = RAMPS[context];
  const popOut = useMemo(
    () => populationOutside(geo.population as GeoJSON | undefined, territory?.aoi.bbox),
    [geo.population, territory],
  );
  const layers = provenance.layers ?? [];
  const blocked = alerts.filter((a) => a.severity === 'error').length;
  return (
    <div data-uri="legend"
         className="pointer-events-auto w-[248px] border border-toner bg-sheet text-[11px] shadow-[0_2px_10px_-4px_rgb(23_24_27/.25)]">
      <div className="border-b border-toner px-2.5 py-1.5">
        <div className="letterhead text-[9.5px] text-toner">Anexo 1 · {def.label}</div>
      </div>
      <div className="px-2.5 py-2">
        {def.categoricalLegend ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] text-graphite-700">
            {def.categoricalLegend.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-4 border-t-2"
                      style={{ borderColor: item.color, borderStyle: item.dashed ? 'dashed' : 'solid' }} />
                {item.label}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <div className="flex h-2.5 w-full overflow-hidden border border-rule-2">
              {ramp.map((c, i) => <div key={i} className="flex-1" style={{ background: rgbCss(c) }} />)}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-graphite-500">
              <span>{def.legend[0]}</span><span>{def.legend[1]}</span>
            </div>
          </>
        )}
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-graphite-600">
          <span className="hatch inline-block h-3 w-4 border border-graphite-400" />
          fuera del área cubierta: sin evidencia
        </div>
        {def.populationChoropleth && popOut && popOut.outside > 0 && (
          <div className="mt-1 pl-[22px] text-[10.5px] leading-snug text-graphite-600">
            {popOut.outside.toLocaleString('es-CO')} celdas de población quedan bajo la trama
          </div>
        )}
        {discrimination.covered < discrimination.total && (
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-graphite-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-graphite-400 bg-sheet-3" />
            {discrimination.total - discrimination.covered} sitios sin fuente para este eje
          </div>
        )}
        {discrimination.flat && (
          <div data-uri="flat-axis"
               className="mt-1.5 border-t border-rule pt-1.5 text-[10.5px] leading-snug text-warn">
            Este eje está cubierto pero <b>no ordena</b>: {discrimination.distinct} valor
            {discrimination.distinct === 1 ? '' : 'es'} distinto
            {discrimination.distinct === 1 ? '' : 's'} en {discrimination.covered} sitios.
          </div>
        )}
      </div>
      <div data-uri="provenance" className="border-t border-rule px-2.5 py-1.5 text-[10px] leading-snug text-graphite-500">
        <span className="font-semibold text-graphite-700">Fuente: </span>
        {layers.map((l) => l.layer.split(' — ')[0].split(' (')[0]).join(' · ') || 'sin capas'}
        {blocked > 0 && (
          <button onClick={() => setView('evidencia')}
                  className="mt-1 block text-left text-bad underline decoration-bad/40 hover:decoration-bad">
            {blocked} fuente{blocked === 1 ? '' : 's'} existe{blocked === 1 ? '' : 'n'} y no se puede{blocked === 1 ? '' : 'n'} usar → V
          </button>
        )}
      </div>
    </div>
  );
}

export function Breadcrumb() {
  const { selectedSiteId, selectSite, oppBySite, siteById, territory, setHighlightedAdminId } = useStore();
  const opp = selectedSiteId ? oppBySite.get(selectedSiteId) : undefined;
  const site = selectedSiteId ? siteById.get(selectedSiteId) : undefined;
  const place = opp?.place ?? (site ? {
    commune: site.commune ?? null, neighborhood: site.neighborhood ?? null,
  } : null);
  const city = territory?.city?.display_name ?? 'Pereira';
  const sep = <span className="text-graphite-400">›</span>;
  return (
    <div data-uri="breadcrumb" className="flex min-w-0 flex-wrap items-baseline gap-1 text-[12.5px]">
      <button
        onClick={() => { selectSite(null); setHighlightedAdminId(null); }}
        className={selectedSiteId ? 'text-graphite-500 underline decoration-rule-2 hover:text-toner' : 'font-semibold text-toner'}
      >
        {city}
      </button>
      {selectedSiteId && (
        <>
          {sep}
          <span className={place?.commune ? 'text-graphite-700' : 'text-graphite-400'}>
            {place?.commune ? `Comuna ${place.commune}` : 'comuna sin fuente'}
          </span>
          {sep}
          <span className={place?.neighborhood ? 'text-graphite-700' : 'text-graphite-400'}>
            {place?.neighborhood ?? 'barrio sin fuente'}
          </span>
          {sep}
          <span className="font-semibold text-toner">{opp?.intervention_label ?? selectedSiteId}</span>
        </>
      )}
      {!selectedSiteId && (
        <span className="hidden text-[12px] text-graphite-400 lg:inline">· señale un sitio para abrir su ficha</span>
      )}
    </div>
  );
}

/**
 * Tipo de mapa (ADR-22 §8). Calles y Oscuro son OpenStreetMap servido por
 * nosotros; Datos es el mapa sin cartografía base.
 */
export function MapTypeSwitcher() {
  const { baseMap, setBaseMap, territory } = useStore();
  const available = territory?.imagery.basemap?.available ?? false;
  return (
    <div data-uri="basemap-switcher" className="flex shrink-0 border border-rule-2 text-[11.5px]">
      {BASEMAPS.map((b) => {
        const disabled = b.key !== 'datos' && !available;
        const active = baseMap === b.key;
        return (
          <button
            key={b.key}
            data-uri="basemap"
            data-basemap={b.key}
            data-active={active ? 'true' : 'false'}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => setBaseMap(b.key)}
            title={disabled ? 'Sin extracto de cartografía base en este despliegue' : b.help}
            className={[
              'px-2 py-[3px] font-medium transition-colors not-first:border-l not-first:border-rule-2',
              active ? 'bg-toner text-sheet' : 'text-graphite-600 hover:text-toner',
              disabled ? 'cursor-not-allowed opacity-40' : '',
            ].join(' ')}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

export function CompareTray() {
  const { compare, clearCompare, toggleCompare, setView } = useStore();
  if (!compare.length) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-2 border border-toner bg-sheet px-2.5 py-2 shadow-[0_2px_10px_-4px_rgb(23_24_27/.25)]">
      <span className="letterhead text-[10px] text-toner">Comparar</span>
      {compare.map((id) => (
        <Chip key={id} active onClick={() => toggleCompare(id)} title="Quitar de la comparación">
          {id.replace('site_', 'n.º ')} <Mark kind="close" size={9} />
        </Chip>
      ))}
      <button
        onClick={() => setView('oportunidades')}
        className="bg-toner px-2.5 py-1 text-[12px] font-semibold text-sheet hover:bg-graphite-700"
      >
        Ver comparación
      </button>
      <button onClick={clearCompare} className="px-1 text-[12px] text-graphite-500 underline hover:text-toner">
        limpiar
      </button>
    </div>
  );
}
