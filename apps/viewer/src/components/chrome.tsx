import { BASEMAPS } from '../lib/basemap';
import { CONTEXTS, contextByKey } from '../lib/contexts';
import { RAMPS, rgbCss } from '../lib/palette';
import { CITY_LINE, useStore } from '../state/store';
import type { ViewKey } from '../types';
import { Chip } from './ui';

/* Territorio primero: dónde estamos, antes de qué pasa (ADR-22). */
const NAV: { key: ViewKey; label: string; question: string }[] = [
  { key: 'territorio', label: 'Territorio', question: '¿Dónde estamos?' },
  { key: 'situacion', label: 'Situación', question: '¿Qué está pasando?' },
  { key: 'oportunidades', label: 'Oportunidades', question: '¿Dónde podemos actuar?' },
  { key: 'escenarios', label: 'Escenarios', question: '¿Qué cambia si cambian las prioridades?' },
  { key: 'portafolio', label: 'Portafolio', question: '¿Qué combinación tiene sentido?' },
  { key: 'evidencia', label: 'Evidencia', question: '¿En qué nos estamos basando?' },
];

export function TopBar() {
  const { view, setView, provenance } = useStore();
  return (
    <header className="z-30 flex shrink-0 flex-col border-b border-ink-700 bg-ink-950/95">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Glyph />
          <div className="leading-tight">
            <div className="text-[12px] font-semibold tracking-tight sm:text-[13px]">
              Urban Recovery Intelligence
            </div>
            <div data-uri="city-line" className="text-[10px] text-mute-400">
              <span className="sm:hidden">{CITY_LINE.split(' · ')[0]}</span>
              <span className="hidden sm:inline">{CITY_LINE} · sismo M7,4 del 10-08-2026</span>
            </div>
          </div>
        </div>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <button
              key={n.key}
              data-uri="nav"
              data-view={n.key}
              data-active={view === n.key ? 'true' : 'false'}
              onClick={() => setView(n.key)}
              title={n.question}
              className={[
                'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
                view === n.key ? 'bg-ink-700 text-paper' : 'text-mute-300 hover:bg-ink-850 hover:text-paper',
              ].join(' ')}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ConsultativeBadge />
        </div>
      </div>

      <ProvenanceBar />

      <nav className="flex gap-1 overflow-x-auto border-t border-ink-800 px-3 py-1.5 lg:hidden">
        {NAV.map((n) => (
          <button
            key={n.key}
            data-uri="nav-mobile"
            data-view={n.key}
            onClick={() => setView(n.key)}
            className={[
              'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium',
              view === n.key ? 'bg-ink-700 text-paper' : 'text-mute-300',
            ].join(' ')}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <span className="sr-only">
        versión de datos {provenance.data_version} · {provenance.scoring_version}
      </span>
    </header>
  );
}

function Glyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="20" height="20" rx="5" fill="none" stroke="var(--color-ink-600)" />
      <rect x="5" y="11" width="3.4" height="6" rx="1" fill="var(--color-mute-400)" />
      <rect x="9.3" y="7.5" width="3.4" height="9.5" rx="1" fill="var(--color-mute-300)" />
      <rect x="13.6" y="4.4" width="3.4" height="12.6" rx="1" fill="var(--color-accent)" />
    </svg>
  );
}

/**
 * CON-05: toda salida es consultiva. No es un descargo legal escondido en un
 * pie de página — es la primera cosa que el visor dice sobre sí mismo.
 */
function ConsultativeBadge() {
  return (
    <span
      title="Ninguna decisión del sistema es vinculante. No sustituye inspección estructural, licencias ni el POT."
      className="flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-850 px-2.5 py-1 text-[10px] font-medium text-mute-200"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="hidden sm:inline">SALIDA CONSULTIVA</span>
      <span className="sm:hidden">CONSULTIVA</span>
    </span>
  );
}

/** La procedencia viaja en el cromo, no en una pestaña que nadie abre. */
function ProvenanceBar() {
  const { provenance, setView, isStatic, alerts } = useStore();
  const layers = provenance.layers ?? [];
  const errors = alerts.filter((a) => a.severity === 'error').length;
  return (
    <div data-uri="provenance"
         className="flex items-center gap-1.5 overflow-x-auto border-t border-ink-800 px-4 py-1.5 text-[10px]">
      <span className="shrink-0 tracking-[0.14em] text-mute-500 uppercase">Procedencia</span>
      {layers.map((l) => (
        <button
          key={l.source_id}
          onClick={() => setView('evidencia')}
          title={`${l.attribution} · ${l.license_class}`}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2 py-0.5 text-mute-200 hover:border-mute-400/50"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
          {l.layer}
          <span className="text-mute-500">{l.is_synthetic ? 'sintético' : 'real'}</span>
        </button>
      ))}
      <span className="shrink-0 rounded-md border border-ink-800 bg-ink-900 px-2 py-0.5 font-mono text-mute-400">
        data v{provenance.data_version} · {provenance.feature_version} · {provenance.scoring_version}
      </span>
      {errors > 0 && (
        <button
          onClick={() => setView('evidencia')}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-bad/40 bg-bad/10 px-2 py-0.5 text-bad"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-bad" />
          {errors} alerta{errors === 1 ? '' : 's'} de licencia
        </button>
      )}
      {isStatic && (
        <span
          title="GitHub Pages sirve archivos, no procesos: los escenarios van precalculados a presupuestos fijos."
          className="shrink-0 rounded-md border border-ink-700 bg-ink-850 px-2 py-0.5 text-mute-400"
        >
          modo estático
        </span>
      )}
    </div>
  );
}

export function ContextSwitcher() {
  const { context, setContext } = useStore();
  const def = contextByKey(context);
  return (
    <div className="pointer-events-auto">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink-600 bg-ink-950/97 p-1 shadow-lg shadow-black/50 sm:flex-wrap sm:overflow-visible">
        {CONTEXTS.map((c) => {
          const active = c.key === context;
          return (
            <button
              key={c.key}
              data-uri="context"
              data-context={c.key}
              onClick={() => setContext(c.key)}
              title={c.question}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors',
                active ? 'bg-ink-700 text-paper' : 'text-mute-400 hover:bg-ink-850 hover:text-mute-200',
              ].join(' ')}
            >
              <span className="h-1.5 w-1.5 rounded-full"
                    style={{ background: active ? rgbCss(RAMPS[c.key][4]) : 'var(--color-ink-500)' }} />
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 hidden max-w-[360px] pl-1 text-[10px] leading-relaxed text-mute-400 sm:block">
        {def.question} <span className="text-mute-500">· {def.unit}</span>
      </p>
    </div>
  );
}

export function Legend() {
  const { context, discrimination } = useStore();
  const def = contextByKey(context);
  const ramp = RAMPS[context];
  if (def.categoricalLegend) {
    /* Un contexto de orientación no tiene rampa que explicar: dice qué es cada trazo. */
    return (
      <div data-uri="legend"
           className="pointer-events-none rounded-lg border border-ink-600 bg-ink-950/97 px-2.5 py-2 shadow-lg shadow-black/50">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-mute-300">
          {def.categoricalLegend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t-2"
                    style={{ borderColor: item.color, borderStyle: item.dashed ? 'dashed' : 'solid' }} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div data-uri="legend"
         className="pointer-events-none rounded-lg border border-ink-600 bg-ink-950/97 px-2.5 py-2 shadow-lg shadow-black/50">
      <div className="flex h-1.5 w-32 overflow-hidden rounded-full">
        {ramp.map((c, i) => <div key={i} className="flex-1" style={{ background: rgbCss(c) }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-mute-400">
        <span>{def.legend[0]}</span><span>{def.legend[1]}</span>
      </div>
      {discrimination.covered < discrimination.total && (
        <div className="mt-1.5 hidden items-center gap-1.5 border-t border-ink-800 pt-1.5 text-[9px] text-mute-400 sm:flex">
          <span className="inline-block h-2 w-2 rounded-full bg-mute-400/60" />
          {discrimination.total - discrimination.covered} sitios sin fuente para este eje
        </div>
      )}
      {discrimination.flat && (
        <div data-uri="flat-axis"
             className="mt-1.5 max-w-[170px] border-t border-warn/30 pt-1.5 text-[9px] leading-snug text-warn">
          Este eje está cubierto pero <b>no ordena</b>: {discrimination.distinct} valor
          {discrimination.distinct === 1 ? '' : 'es'} distinto
          {discrimination.distinct === 1 ? '' : 's'} en {discrimination.covered} sitios.
        </div>
      )}
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
  const sep = <span className="text-ink-500">›</span>;
  return (
    <div data-uri="breadcrumb"
         className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border border-ink-600 bg-ink-950/97 px-2 py-1.5 text-[11px] shadow-lg shadow-black/50">
      <button
        onClick={() => { selectSite(null); setHighlightedAdminId(null); }}
        className={selectedSiteId ? 'text-mute-400 hover:text-paper' : 'font-medium text-paper'}
      >
        {city}
      </button>
      {selectedSiteId && (
        <>
          {sep}
          <span className={place?.commune ? 'text-mute-200' : 'text-mute-500'}>
            {place?.commune ? `Comuna ${place.commune}` : 'comuna sin fuente'}
          </span>
          {sep}
          <span className={place?.neighborhood ? 'text-mute-200' : 'text-mute-500'}>
            {place?.neighborhood ?? 'barrio sin fuente'}
          </span>
          {sep}
          <span className="font-medium text-paper">
            {opp?.intervention_label ?? selectedSiteId}
          </span>
          <span className="font-mono text-[10px] text-mute-500">{selectedSiteId}</span>
        </>
      )}
      {!selectedSiteId && (
        <span className="ml-1.5 hidden border-l border-ink-700 pl-2 text-[10px] text-mute-500 sm:inline">
          clic en un sitio para ver su oportunidad
        </span>
      )}
    </div>
  );
}

/**
 * Tipo de mapa (ADR-22 §8). Calles y Oscuro son OpenStreetMap servido por
 * nosotros; Datos es el mapa original sin cartografía base. Si el extracto no
 * está publicado en este despliegue, solo queda Datos y el control lo dice.
 */
export function MapTypeSwitcher() {
  const { baseMap, setBaseMap, territory } = useStore();
  const available = territory?.imagery.basemap?.available ?? false;
  const replica = territory?.imagery.basemap?.osm_replication_time;
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1">
      <div data-uri="basemap-switcher"
           className="flex gap-0.5 rounded-lg border border-ink-600 bg-ink-950/97 p-0.5 text-[11px] shadow-lg shadow-black/50">
        {BASEMAPS.map((b) => {
          const disabled = b.key !== 'datos' && !available;
          return (
            <button
              key={b.key}
              data-uri="basemap"
              data-basemap={b.key}
              data-active={baseMap === b.key ? 'true' : 'false'}
              disabled={disabled}
              onClick={() => setBaseMap(b.key)}
              title={disabled ? 'Sin extracto de cartografía base en este despliegue' : b.help}
              className={[
                'rounded-md px-2.5 py-1 font-medium transition-colors',
                baseMap === b.key ? 'bg-ink-700 text-paper' : 'text-mute-300 hover:bg-ink-850 hover:text-paper',
                disabled ? 'cursor-not-allowed opacity-40' : '',
              ].join(' ')}
            >
              {b.label}
            </button>
          );
        })}
      </div>
      {baseMap !== 'datos' && replica && (
        <span className="hidden rounded bg-ink-950/80 px-1.5 text-[9px] text-mute-400 sm:inline">
          OpenStreetMap · réplica {replica.slice(0, 10)}
        </span>
      )}
    </div>
  );
}

export function CompareTray() {
  const { compare, clearCompare, toggleCompare, setView } = useStore();
  if (!compare.length) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-accent/40 bg-ink-950/97 px-2.5 py-2 shadow-lg shadow-black/50">
      <span className="text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">Comparar</span>
      {compare.map((id) => (
        <Chip key={id} active onClick={() => toggleCompare(id)} title="Quitar de la comparación">
          {id.replace('site_', '#')} ✕
        </Chip>
      ))}
      <button
        onClick={() => setView('oportunidades')}
        className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-ink-950 hover:bg-accent/85"
      >
        Ver comparación
      </button>
      <button onClick={clearCompare} className="px-1 text-[11px] text-mute-400 hover:text-paper">
        limpiar
      </button>
    </div>
  );
}
