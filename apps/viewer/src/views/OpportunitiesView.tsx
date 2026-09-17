import { useState } from 'react';
import { cop, n, pct } from '../lib/format';
import { INTERVENTION_COLOR, rgbCss } from '../lib/palette';
import { useStore } from '../state/store';
import type { Opportunity } from '../types';
import { Bar, Chip, Empty, Note, Panel, SectionTitle, StatusBadge } from '../components/ui';

export function OpportunitiesView() {
  const {
    visibleOpportunities, opportunities, query, setQuery, onlyBuildable, setOnlyBuildable,
    selectSite, selectedSiteId, compare, toggleCompare, clearCompare, siteById,
  } = useStore();
  const [showCompare, setShowCompare] = useState(true);
  const compared = compare
    .map((id) => opportunities.find((o) => o.site_id === id))
    .filter((o): o is Opportunity => Boolean(o));

  return (
    <div className="flex flex-col gap-3 p-3">
      <Panel className="p-3.5">
        <SectionTitle>Buscar</SectionTitle>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Intervención, sitio o factor del problema…"
          className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-[13px] text-paper placeholder:text-mute-500 focus:border-accent/60 focus:outline-none"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Chip active={onlyBuildable} onClick={() => setOnlyBuildable(!onlyBuildable)}
                title="Oculta NO_BUILD y las excluidas por restricción dura">
            Solo construibles
          </Chip>
          {query && <Chip onClick={() => setQuery('')}>limpiar «{query}» ✕</Chip>}
        </div>
        <Note>
          Búsqueda léxica sobre lo que ya está cargado. La búsqueda semántica con pgvector no entra
          todavía: no existe corpus documental que recuperar.
        </Note>
      </Panel>

      {compare.length > 0 && (
        <Panel className="p-3.5">
          <SectionTitle right={
            <button onClick={() => setShowCompare(!showCompare)}
                    className="text-[10px] text-mute-400 hover:text-paper">
              {showCompare ? 'ocultar' : 'mostrar'}
            </button>
          }>
            Comparación · {compare.length}
          </SectionTitle>
          {showCompare && <CompareTable opps={compared} />}
          <button onClick={clearCompare}
                  className="mt-2 text-[10px] text-mute-400 underline hover:text-paper">
            limpiar comparación
          </button>
        </Panel>
      )}

      <Panel className="p-3.5">
        <SectionTitle right={
          <span className="text-[10px] text-mute-400">
            {visibleOpportunities.length} de {opportunities.length}
          </span>
        }>
          Oportunidades de recuperación
        </SectionTitle>

        <div className="mt-2.5 flex flex-col gap-2">
          {visibleOpportunities.length === 0 && (
            <Empty>Ninguna oportunidad cumple los criterios actuales.</Empty>
          )}
          {visibleOpportunities.map((o) => (
            <Card
              key={o.opportunity_id}
              opp={o}
              confidence={siteById.get(o.site_id)?.confidence ?? o.confidence}
              selected={o.site_id === selectedSiteId}
              inCompare={compare.includes(o.site_id)}
              onSelect={() => selectSite(o.site_id === selectedSiteId ? null : o.site_id)}
              onCompare={() => toggleCompare(o.site_id)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Card({ opp, confidence, selected, inCompare, onSelect, onCompare }: {
  opp: Opportunity; confidence: number; selected: boolean; inCompare: boolean;
  onSelect: () => void; onCompare: () => void;
}) {
  const color = rgbCss(INTERVENTION_COLOR[opp.intervention] ?? [240, 180, 41]);
  const ok = opp.feasibility.filter((f) => f.status === 'OK').length;
  const unknown = opp.feasibility.filter((f) => f.status === 'UNKNOWN').length;
  const warn = opp.feasibility.filter((f) => f.status === 'WARNING').length;
  const blocked = opp.feasibility.filter((f) => f.status === 'BLOCKED').length;

  return (
    <div data-uri="opportunity-card" className={[
      'rounded-xl border p-3 transition-colors',
      selected ? 'border-accent/50 bg-accent/5' : 'border-ink-700 bg-ink-850 hover:border-mute-400/40',
      opp.blocked ? 'opacity-60' : '',
    ].join(' ')}>
      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-2.5">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[13px] font-medium">{opp.intervention_label}</span>
              <span className="num shrink-0 font-mono text-[10px] text-mute-500">
                {opp.site_id.replace('site_', '#')}
              </span>
            </div>
            {/* El titular es la razón. El puntaje ordena, pero no titula. */}
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-mute-300">
              {opp.problem.headline}
            </p>
          </div>
          <span className="num shrink-0 text-right">
            <span className="block text-[13px] font-semibold text-accent">
              {opp.suitability.toFixed(1)}
            </span>
            <span className="block text-[9px] text-mute-500">idoneidad</span>
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
          <Metric label="Población" value={n(opp.impact.population_reached)} />
          <Metric label="Costo" value={cop(opp.cost_cop)} />
          <Metric label="Pers./MM COP"
                  value={opp.impact.people_per_million_cop?.toFixed(1) ?? '—'} />
        </div>

        <div className="mt-2">
          <Bar value={Math.min(1, opp.suitability / 100)} color={color} height={3} />
        </div>
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {blocked > 0 && <StatusBadge status="BLOCKED">{blocked} bloquea</StatusBadge>}
        {warn > 0 && <StatusBadge status="WARNING">{warn} con reservas</StatusBadge>}
        <StatusBadge status="OK">{ok} cumple</StatusBadge>
        {unknown > 0 && <StatusBadge status="UNKNOWN">{unknown} sin fuente</StatusBadge>}
        <Chip title="Confianza compuesta de la evidencia y el método de captación">
          conf. <span className={
            confidence > 0.6 ? 'text-ok' : confidence > 0.35 ? 'text-warn' : 'text-bad'
          }>{pct(confidence)}</span>
        </Chip>
        <button
          onClick={onCompare}
          className={[
            'ml-auto rounded-md border px-2 py-0.5 text-[10px] transition-colors',
            inCompare ? 'border-accent/60 bg-accent/15 text-accent' : 'border-ink-700 text-mute-400 hover:text-paper',
          ].join(' ')}
        >
          {inCompare ? '✓ comparando' : '+ comparar'}
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-wider text-mute-500 uppercase">{label}</div>
      <div className="num mt-0.5 text-[12px] font-medium">{value}</div>
    </div>
  );
}

function CompareTable({ opps }: { opps: Opportunity[] }) {
  const rows: {
    label: string;
    get: (o: Opportunity) => string;
    raw?: (o: Opportunity) => number | null;
    best?: 'max' | 'min';
  }[] = [
    { label: 'Intervención', get: (o) => o.intervention_label },
    { label: 'Población alcanzada', get: (o) => n(o.impact.population_reached),
      raw: (o) => o.impact.population_reached, best: 'max' },
    { label: 'Costo', get: (o) => cop(o.cost_cop), raw: (o) => o.cost_cop, best: 'min' },
    { label: 'Personas por MM COP', get: (o) => o.impact.people_per_million_cop?.toFixed(1) ?? '—',
      raw: (o) => o.impact.people_per_million_cop, best: 'max' },
    { label: 'Reducción de déficit',
      get: (o) => (o.impact.deficit_reduction === null ? '—' : pct(o.impact.deficit_reduction, 2)),
      raw: (o) => o.impact.deficit_reduction, best: 'max' },
    { label: 'Observaciones de daño', get: (o) => n(o.evidence.damage_observations),
      raw: (o) => o.evidence.damage_observations, best: 'max' },
    { label: 'Condiciones sin fuente', get: (o) => String(o.unknowns.length),
      raw: (o) => o.unknowns.length, best: 'min' },
    { label: 'Confianza', get: (o) => pct(o.confidence), raw: (o) => o.confidence, best: 'max' },
    { label: 'Idoneidad', get: (o) => o.suitability.toFixed(1), raw: (o) => o.suitability, best: 'max' },
  ];

  return (
    <div className="mt-2.5 overflow-x-auto">
      <table className="w-full min-w-[420px] text-[11px]">
        <thead>
          <tr>
            <th className="w-36" />
            {opps.map((o) => (
              <th key={o.opportunity_id} className="px-2 pb-2 text-left">
                <div className="num font-mono text-[9px] text-mute-500">
                  {o.site_id.replace('site_', '#')}
                </div>
                <div className="text-[11px] font-medium">{o.intervention_label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const values = r.raw ? opps.map(r.raw) : [];
            const defined = values.filter((v): v is number => v !== null);
            const best = r.best && defined.length
              ? (r.best === 'max' ? Math.max(...defined) : Math.min(...defined)) : null;
            return (
              <tr key={r.label} className="border-t border-ink-800">
                <td className="py-1.5 pr-2 text-mute-400">{r.label}</td>
                {opps.map((o, i) => (
                  <td key={o.opportunity_id} className={[
                    'num px-2 py-1.5',
                    best !== null && values[i] === best ? 'font-semibold text-ok' : '',
                  ].join(' ')}>
                    {r.get(o)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Note>
        El resaltado marca el mejor valor de cada fila entre las opciones comparadas, no la opción
        globalmente preferible: eso depende de las prioridades del escenario.
      </Note>
    </div>
  );
}
