import { cop, n, pct } from '../lib/format';
import { INTERVENTION_COLOR, rgbCss } from '../lib/palette';
import { useStore } from '../state/store';
import { Bar, Empty, Note, Panel, SectionTitle, Stat } from '../components/ui';

export function PortfolioView() {
  const {
    scenario, coverage, selectSite, selectedSiteId, setView,
    showRelief, setShowRelief, showTerrain, setShowTerrain, terrain, oppBySite,
  } = useStore();

  if (!scenario) {
    return (
      <div className="p-3">
        <Panel className="p-4">
          <SectionTitle>Portafolio</SectionTitle>
          <div className="mt-2.5"><Empty>Elige un escenario primero.</Empty></div>
        </Panel>
      </div>
    );
  }

  const reachedPct = coverage ? coverage.reached / coverage.total_cells : null;
  const redundant = scenario.items.filter((i) => i.redundancy_ratio > 0).length;
  const avgRedundancy = scenario.items.length
    ? scenario.items.reduce((a, i) => a + i.redundancy_ratio, 0) / scenario.items.length : 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionTitle>{scenario.name}</SectionTitle>
            <p className="mt-1 text-[11px] text-mute-400">
              {scenario.items.length} proyectos de {n(scenario.considered)} candidatos
            </p>
          </div>
          <button onClick={() => setView('escenarios')}
                  className="shrink-0 rounded-lg border border-ink-700 px-2 py-1 text-[11px] text-mute-300 hover:text-paper">
            Ajustar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Stat label="Población alcanzada" value={n(scenario.total_population)} size="lg"
                tone="accent" sub="personas distintas, sin doble conteo" />
          <Stat label="Costo total" value={cop(scenario.total_cost)} size="lg"
                sub={`de ${cop(scenario.budget_cop)}`} />
        </div>

        <div className="mt-3">
          <Bar value={scenario.total_cost / scenario.budget_cop} color="var(--color-accent)" height={5} />
          <div className="mt-1 flex justify-between text-[10px] text-mute-400">
            <span>{pct(scenario.total_cost / scenario.budget_cop)} del presupuesto</span>
            <span>queda {cop(scenario.budget_cop - scenario.total_cost)}</span>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Panel className="p-3.5">
          <Stat size="sm" label="Cobertura de celdas"
                value={reachedPct === null ? '—' : pct(reachedPct)}
                sub={coverage ? `${n(coverage.reached)} de ${n(coverage.total_cells)}` : undefined} />
        </Panel>
        <Panel className="p-3.5">
          <Stat size="sm" label="Redundancia media" value={pct(avgRedundancy)}
                tone={avgRedundancy > 0.25 ? 'warn' : 'default'}
                sub={`${redundant} proyecto(s) solapan`} />
        </Panel>
        <Panel className="p-3.5">
          <Stat size="sm" label="Equidad (Gini)" value={scenario.equity_after.gini_access.toFixed(3)}
                tone={scenario.equity_after.gini_delta < 0 ? 'ok' : 'warn'}
                sub={`Δ ${scenario.equity_after.gini_delta.toFixed(4)}`} />
        </Panel>
        <Panel className="p-3.5">
          <Stat size="sm" label="Costo por persona"
                value={cop(scenario.total_population ? scenario.total_cost / scenario.total_population : null)} />
        </Panel>
      </div>

      <Panel className="p-4">
        <SectionTitle>Capas del portafolio</SectionTitle>
        <div className="mt-2.5 flex flex-col gap-2">
          <Toggle
            checked={showRelief}
            onChange={setShowRelief}
            label="Relieve de cobertura en 3D"
            badge="derivada"
            help="Altura = población medida de cada celda. Las columnas apagadas no las alcanza ningún proyecto seleccionado."
          />
          <Toggle
            checked={showTerrain}
            onChange={setShowTerrain}
            disabled={!terrain}
            label="Relieve real del terreno"
            badge="real"
            help={terrain
              ? 'Teselas Terrain-RGB de Copernicus DEM versionadas en el repositorio.'
              : 'Sin teselas versionadas en este despliegue: la capa no se publica.'}
          />
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionTitle right={<span className="text-[10px] text-mute-400">{scenario.items.length}</span>}>
          Proyectos, en orden de selección
        </SectionTitle>
        <ol data-uri="portfolio-items" className="mt-2.5 flex flex-col gap-1.5">
          {scenario.items.map((item) => {
            const opp = oppBySite.get(item.site_id);
            const color = rgbCss(INTERVENTION_COLOR[item.intervention] ?? [240, 180, 41]);
            return (
              <li key={`${item.site_id}-${item.rank}`}>
                <button
                  onClick={() => selectSite(item.site_id === selectedSiteId ? null : item.site_id)}
                  className={[
                    'flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                    item.site_id === selectedSiteId
                      ? 'border-accent/50 bg-accent/5' : 'border-ink-700 bg-ink-850 hover:border-mute-400/40',
                  ].join(' ')}
                >
                  <span className="num mt-0.5 w-5 shrink-0 text-[11px] text-mute-500">{item.rank}</span>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">
                      {item.intervention_label}
                    </span>
                    <span className="block text-[10px] text-mute-400">
                      {n(item.marginal_population)} personas nuevas
                      {item.redundancy_ratio > 0 && ` · ${pct(item.redundancy_ratio)} solapa`}
                    </span>
                    {opp && (
                      <span className="mt-0.5 block line-clamp-1 text-[10px] text-mute-500">
                        {opp.problem.headline}
                      </span>
                    )}
                  </span>
                  <span className="num shrink-0 text-right">
                    <span className="block text-[12px] font-medium">{cop(item.cost_cop)}</span>
                    <span className="block text-[10px] text-mute-400">{item.score.toFixed(1)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <Note>
          Greedy con cobertura marginal: en cada paso se elige el candidato que añade más población{' '}
          <i>nueva</i> por peso invertido. Dos proyectos que sirven a la misma gente no suman dos
          veces. Es un baseline explicable, no un óptimo MILP.
        </Note>
      </Panel>

      <Panel className="p-4">
        <SectionTitle>Rendimientos decrecientes</SectionTitle>
        <div className="mt-2.5 flex flex-col gap-1">
          {scenario.items.map((item) => {
            const max = Math.max(...scenario.items.map((i) => i.marginal_population));
            return (
              <div key={`${item.site_id}-bar`} className="flex items-center gap-2">
                <span className="num w-5 shrink-0 text-[10px] text-mute-500">{item.rank}</span>
                <div className="flex-1">
                  <Bar value={item.marginal_population / (max || 1)}
                       color="var(--color-accent)" height={4} />
                </div>
                <span className="num w-16 shrink-0 text-right text-[10px] text-mute-400">
                  {n(item.marginal_population)}
                </span>
              </div>
            );
          })}
        </div>
        <Note>
          El aporte marginal cae rápido: por eso el optimizador para por cobertura saturada y no por
          presupuesto.
        </Note>
      </Panel>
    </div>
  );
}

function Toggle({ checked, onChange, label, help, badge, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; help: string;
  badge?: string; disabled?: boolean;
}) {
  return (
    <label data-uri="layer-toggle" data-layer={label} className={[
      'flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2',
      disabled ? 'cursor-not-allowed border-ink-800 opacity-50' : 'border-ink-700 bg-ink-850 hover:border-mute-400/40',
    ].join(' ')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--color-accent)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-[12px] font-medium">{label}</span>
          {badge && (
            <span className={[
              'rounded border px-1 py-0.5 text-[9px] uppercase',
              badge === 'real' ? 'border-ok/35 text-ok' : 'border-warn/35 text-warn',
            ].join(' ')}>
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-mute-400">{help}</span>
      </span>
    </label>
  );
}
