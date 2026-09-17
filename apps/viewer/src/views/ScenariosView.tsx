import { cop, FACTOR_LABEL, n, pct } from '../lib/format';
import { useStore } from '../state/store';
import { Bar, Empty, Note, Panel, SectionTitle, Stat } from '../components/ui';

const STOP_REASON: Record<string, { label: string; detail: string }> = {
  cobertura_saturada: {
    label: 'Cobertura saturada',
    detail: 'Tras los proyectos seleccionados, ningún candidato restante alcanza población nueva. Subir el presupuesto no cambia el resultado.',
  },
  presupuesto_agotado: {
    label: 'Presupuesto agotado',
    detail: 'El presupuesto es la restricción activa: hay candidatos con beneficio marginal que no caben.',
  },
  sin_candidatos: {
    label: 'Sin candidatos',
    detail: 'No queda ningún candidato elegible.',
  },
};

export function ScenariosView() {
  const { scenarios, scenarioId, setScenarioId, scenario, setView, isStatic, opportunities } = useStore();

  if (!scenarios.length) {
    return (
      <div className="p-3">
        <Panel className="p-4">
          <SectionTitle>Escenarios</SectionTitle>
          <div className="mt-2.5"><Empty>No hay escenarios en este despliegue.</Empty></div>
        </Panel>
      </div>
    );
  }

  const stop = scenario ? STOP_REASON[scenario.stop_reason] : undefined;

  return (
    <div className="flex flex-col gap-3 p-3">
      <Panel className="p-4">
        <SectionTitle>Presupuesto</SectionTitle>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {scenarios.map((s) => (
            <button
              key={s.scenario_id}
              onClick={() => setScenarioId(s.scenario_id)}
              className={[
                'rounded-lg border px-2.5 py-2 text-left transition-colors',
                s.scenario_id === scenarioId
                  ? 'border-accent/60 bg-accent/10' : 'border-ink-700 bg-ink-850 hover:border-mute-400/40',
              ].join(' ')}
            >
              <div className="num text-[13px] font-semibold">{cop(s.budget_cop)}</div>
              <div className="mt-0.5 text-[10px] text-mute-400">
                {s.items.length} proyectos · {cop(s.total_cost)}
              </div>
            </button>
          ))}
        </div>
        {isStatic && (
          <Note>
            GitHub Pages sirve archivos, no procesos. Estos escenarios van <b>precalculados</b> a
            presupuestos fijos: pedir uno distinto devolvería el más cercano, así que el control no
            finge optimizar. Montado sobre la API, el optimizador corre de verdad.
          </Note>
        )}
      </Panel>

      {scenario && (
        <>
          <Panel className="p-4">
            <SectionTitle>Qué limita el resultado</SectionTitle>
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <Stat size="sm" label="Proyectos" value={n(scenario.items.length)} tone="accent"
                    sub={`de ${n(scenario.considered)} candidatos`} />
              <Stat size="sm" label="Costo total" value={cop(scenario.total_cost)}
                    sub={`${pct(scenario.total_cost / scenario.budget_cop)} del presupuesto`} />
            </div>
            <div className="mt-3">
              <Bar value={scenario.total_cost / scenario.budget_cop} color="var(--color-accent)" height={5} />
            </div>
            {stop && (
              <div className={[
                'mt-3 rounded-lg border px-2.5 py-2 text-[11px] leading-snug',
                scenario.budget_binding
                  ? 'border-warn/30 bg-warn/5 text-warn' : 'border-ink-600 bg-ink-850 text-mute-200',
              ].join(' ')}>
                <b>{stop.label}.</b> {stop.detail}
              </div>
            )}
            <div className="mt-2.5 flex flex-col gap-1.5 text-[11px]">
              <Row label="El presupuesto es la restricción activa"
                   value={scenario.budget_binding ? 'sí' : 'no'} />
              <Row label="Candidatos descartados por no caber"
                   value={n(scenario.skipped_over_budget)} />
            </div>
            <Note>
              El sistema declara por qué paró en vez de dejar que el control de presupuesto parezca
              roto cuando subirlo no cambia nada.
            </Note>
          </Panel>

          <Panel className="p-4">
            <SectionTitle>Pesos del modelo</SectionTitle>
            <p className="mt-1.5 text-[11px] leading-relaxed text-mute-400">
              Los pesos son política urbana, no un hiperparámetro. Estos valores son provisionales
              hasta que exista un dueño institucional que los fije.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {Object.entries(scenario.weights).map(([k, v]) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span>{FACTOR_LABEL[k] ?? k}</span>
                    <span className="num text-mute-400">{v.toFixed(2)}</span>
                  </div>
                  <div className="mt-1"><Bar value={v} color="var(--color-mute-300)" height={4} /></div>
                </div>
              ))}
            </div>
            <Note>
              El modelo es robusto a cómo se ponderan estas variables: perturbarlas ±20 % conserva
              el 95 % del top-20. Es frágil a qué se le da de comer, no a cómo se pesa.
            </Note>
          </Panel>

          <Panel className="p-4">
            <SectionTitle>Equidad</SectionTitle>
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <Stat size="sm" label="Gini antes" value={scenario.equity_before.gini_access.toFixed(4)}
                    sub={`${n(scenario.equity_before.cells_with_access)} celdas con acceso`} />
              <Stat size="sm" label="Gini después" value={scenario.equity_after.gini_access.toFixed(4)}
                    tone={scenario.equity_after.gini_delta < 0 ? 'ok' : 'warn'}
                    sub={`Δ ${scenario.equity_after.gini_delta.toFixed(4)}`} />
            </div>
            <div className="mt-3 flex flex-col gap-1.5 text-[11px]">
              <Row label="Celdas alcanzadas por el portafolio"
                   value={`${n(scenario.equity_after.cells_with_access - scenario.equity_before.cells_with_access)} nuevas`} />
              <Row label="Celdas totales" value={n(scenario.equity_after.cells_total)} />
            </div>
            <Note>
              Un Gini de {scenario.equity_before.gini_access.toFixed(2)} antes de intervenir dice que
              el acceso ya está muy mal repartido. El portafolio lo mueve{' '}
              {Math.abs(scenario.equity_after.gini_delta).toFixed(4)}: poco, y conviene verlo.
            </Note>
          </Panel>

          <Panel className="p-4">
            <SectionTitle>Reproducibilidad</SectionTitle>
            <div className="mt-2.5 flex flex-col gap-1 font-mono text-[10px] break-all">
              <Hash label="candidate_set" value={scenario.candidate_set_hash} />
              <Hash label="feature_matrix" value={scenario.feature_matrix_hash} />
              <Hash label="scenario_id" value={scenario.scenario_id} />
            </div>
            <Note>
              Los dos hashes identifican el conjunto de candidatos y la matriz de features que
              produjeron este resultado. Mismo hash, mismo portafolio.
            </Note>
          </Panel>

          <Panel className="p-4">
            <SectionTitle>Y entonces</SectionTitle>
            <p className="mt-2 text-[12px] leading-relaxed text-mute-300">
              De {n(opportunities.length)} oportunidades, este escenario selecciona{' '}
              <b className="text-paper">{scenario.items.length}</b> y alcanza{' '}
              <b className="text-paper">{n(scenario.total_population)}</b> personas.{' '}
              <button className="underline hover:text-paper" onClick={() => setView('portafolio')}>
                Ver el portafolio
              </button>
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between rounded-lg bg-ink-850 px-2.5 py-1.5">
      <span className="text-mute-300">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-ink-950 px-2 py-1.5">
      <div className="text-mute-500">{label}</div>
      <div className="mt-0.5 text-mute-300">{value}</div>
    </div>
  );
}
