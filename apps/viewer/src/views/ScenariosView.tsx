import { cop, FACTOR_LABEL, n, pct, dec } from '../lib/format';
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
        <div role="radiogroup" aria-label="Presupuesto" className="mt-2.5 divide-y divide-rule border-y border-rule">
          {scenarios.map((s) => {
            const on = s.scenario_id === scenarioId;
            return (
              <button
                key={s.scenario_id}
                role="radio"
                aria-checked={on}
                onClick={() => setScenarioId(s.scenario_id)}
                className="flex w-full items-baseline justify-between gap-3 px-1 py-2 text-left transition-colors hover:bg-sheet-2/70"
              >
                <span className="flex items-baseline gap-2.5">
                  <span aria-hidden className={`inline-block h-2.5 w-2.5 translate-y-[1px] rounded-full border ${on ? 'border-toner bg-toner' : 'border-graphite-400'}`} />
                  <span className={`num text-[14px] ${on ? 'font-bold text-toner' : 'font-medium text-graphite-700'}`}>{cop(s.budget_cop)}</span>
                </span>
                <span className="text-[12px] text-graphite-500">{s.items.length} proyectos · {cop(s.total_cost)}</span>
              </button>
            );
          })}
        </div>
        {isStatic && (
          <Note>
            En esta versión los escenarios vienen <b>precalculados</b> para cuatro presupuestos:
            pedir uno distinto devolvería el más cercano, así que el control no finge optimizar.
          </Note>
        )}
      </Panel>

      {scenario && (
        <>
          <Panel className="p-4">
            <SectionTitle>Qué limita el resultado</SectionTitle>
            <p className="mt-2 font-serif text-[15px] leading-[1.5] text-toner [text-wrap:pretty]">
              Con este presupuesto se seleccionan <b>{n(scenario.items.length)}</b> proyectos de{' '}
              {n(scenario.considered)} candidatos, por <b>{cop(scenario.total_cost)}</b>: el{' '}
              {pct(scenario.total_cost / scenario.budget_cop)} del presupuesto.
            </p>
            {stop && (
              <p className={[
                'mt-3 border-t border-rule pt-2.5 text-[12.5px] leading-snug',
                scenario.budget_binding ? 'text-warn' : 'text-graphite-700',
              ].join(' ')}>
                <b className="text-toner">{stop.label}.</b> {stop.detail}
              </p>
            )}
            <div className="mt-2.5 flex flex-col border-t border-rule text-[12.5px]">
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
            <SectionTitle>Cuánto pesa cada criterio</SectionTitle>
            <p className="mt-1.5 text-[11px] leading-relaxed text-graphite-500">
              Los pesos son política urbana, no un hiperparámetro. Estos valores son provisionales
              hasta que exista un dueño institucional que los fije.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {Object.entries(scenario.weights).map(([k, v]) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span>{FACTOR_LABEL[k] ?? k}</span>
                    <span className="num text-graphite-500">{dec(v, 2)}</span>
                  </div>
                  <div className="mt-1"><Bar value={v} color="var(--color-graphite-600)" height={4} /></div>
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
              <Stat size="sm" label="Gini antes" value={dec(scenario.equity_before.gini_access, 4)}
                    sub={`${n(scenario.equity_before.cells_with_access)} celdas con acceso`} />
              <Stat size="sm" label="Gini después" value={dec(scenario.equity_after.gini_access, 4)}
                    tone={scenario.equity_after.gini_delta < 0 ? 'ok' : 'warn'}
                    sub={`Δ ${dec(scenario.equity_after.gini_delta, 4)}`} />
            </div>
            <div className="mt-3 flex flex-col gap-1.5 text-[11px]">
              <Row label="Celdas alcanzadas por el portafolio"
                   value={`${n(scenario.equity_after.cells_with_access - scenario.equity_before.cells_with_access)} nuevas`} />
              <Row label="Celdas totales" value={n(scenario.equity_after.cells_total)} />
            </div>
            <Note>
              Un Gini de {dec(scenario.equity_before.gini_access, 2)} antes de intervenir dice que
              el acceso ya está muy mal repartido. El portafolio lo mueve{' '}
              {dec(Math.abs(scenario.equity_after.gini_delta), 4)}: poco, y conviene verlo.
            </Note>
          </Panel>

          <Panel className="p-4">
            <details className="group">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="letterhead text-[11px] text-toner">Anexo técnico · reproducibilidad</span>
              <span className="text-[11.5px] text-graphite-500 underline group-open:hidden">mostrar</span>
              <span className="hidden text-[11.5px] text-graphite-500 underline group-open:inline">ocultar</span>
            </summary>
            <div className="mt-2.5 flex flex-col gap-1 font-mono text-[10px] break-all">
              <Hash label="candidate_set" value={scenario.candidate_set_hash} />
              <Hash label="feature_matrix" value={scenario.feature_matrix_hash} />
              <Hash label="scenario_id" value={scenario.scenario_id} />
            </div>
            <Note>
              Los dos hashes identifican el conjunto de candidatos y la matriz de features que
              produjeron este resultado. Mismo hash, mismo portafolio.
            </Note>
            </details>
          </Panel>

          <Panel className="p-4">
            <SectionTitle>Y entonces</SectionTitle>
            <p className="mt-2 text-[12px] leading-relaxed text-graphite-600">
              De {n(opportunities.length)} oportunidades, este escenario selecciona{' '}
              <b className="text-toner">{scenario.items.length}</b> y alcanza{' '}
              <b className="text-toner">{n(scenario.total_population)}</b> personas.{' '}
              <button className="underline hover:text-toner" onClick={() => setView('oportunidades')}>
                Ver las oportunidades
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
    <div className="flex items-baseline justify-between border-b border-rule py-1.5">
      <span className="text-graphite-600">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-sheet px-2 py-1.5">
      <div className="text-graphite-400">{label}</div>
      <div className="mt-0.5 text-graphite-600">{value}</div>
    </div>
  );
}
