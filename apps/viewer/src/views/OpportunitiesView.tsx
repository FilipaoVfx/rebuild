import { useMemo, useState, type ReactNode } from 'react';
import { FACTOR_LABEL, cop, n, pct, dec } from '../lib/format';
import { INTERVENTION_COLOR, rgbCss } from '../lib/palette';
import { DEFAULT_MIN_SUITABILITY, useStore } from '../state/store';
import type { Opportunity } from '../types';
import { ContextIntro } from '../components/ContextIntro';
import { Bar, Chip, Empty, Note, Panel, SectionTitle, Mark } from '../components/ui';

export function OpportunitiesView() {
  const {
    visibleOpportunities, opportunities, query, setQuery, onlyBuildable, setOnlyBuildable,
    selectSite, selectedSiteId, compare, toggleCompare, clearCompare, siteById,
    communeFilter, setCommuneFilter, minSuitability, setMinSuitability,
  } = useStore();
  const aboveThreshold = opportunities.filter((o) => o.suitability >= minSuitability).length;
  const [showCompare, setShowCompare] = useState(true);
  /* FR-UI-04: filtrar por comuna. Las que aparecen son las que tienen oportunidades. */
  const communes = useMemo(() => {
    const count = new Map<string, number>();
    for (const o of opportunities) {
      const c = o.place?.commune;
      if (c) count.set(c, (count.get(c) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [opportunities]);
  const sinComuna = opportunities.filter((o) => !o.place?.commune).length;
  const compared = compare
    .map((id) => opportunities.find((o) => o.site_id === id))
    .filter((o): o is Opportunity => Boolean(o));

  return (
    <div className="flex flex-col gap-3 p-3">
      <ContextIntro />
      <MethodPanel />

      <Panel data-uri="suitability-filter" className="p-3.5">
        <SectionTitle right={
          <span className="num text-[10px] text-graphite-500">{aboveThreshold} de {opportunities.length}</span>
        }>
          Idoneidad mínima
        </SectionTitle>
        <div className="mt-2.5 flex items-center gap-3">
          <input
            data-uri="suitability-range"
            type="range" min={0} max={100} step={1}
            value={minSuitability}
            onChange={(e) => setMinSuitability(Number(e.target.value))}
            aria-label="Idoneidad mínima visible"
            className="w-full accent-[var(--color-mark)]"
          />
          <span className="num w-10 shrink-0 text-right text-[15px] font-semibold text-mark">
            {minSuitability}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip active={minSuitability === DEFAULT_MIN_SUITABILITY}
                onClick={() => setMinSuitability(DEFAULT_MIN_SUITABILITY)}
                title="El umbral por defecto: lo que el modelo distingue con claridad">
            ≥ {DEFAULT_MIN_SUITABILITY}
          </Chip>
          <Chip active={minSuitability === 0} onClick={() => setMinSuitability(0)}
                title="Mostrar las 105 oportunidades, incluidas las de idoneidad baja">
            Ver todas
          </Chip>
          <Chip active={minSuitability === 75} onClick={() => setMinSuitability(75)}>≥ 75</Chip>
        </div>
        <Note>
          La idoneidad va de 0 a 100 y <b>ordena, no titula</b>: es la suma exacta de los factores del
          modelo, ponderados y con la afinidad de la intervención. Las que quedan bajo el umbral no
          desaparecen del mapa: se atenúan.
        </Note>
      </Panel>

      <Panel className="p-3.5">
        <SectionTitle>Buscar</SectionTitle>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Intervención, sitio o factor del problema…"
          className="mt-2 w-full rounded-[3px] border border-rule bg-sheet px-3 py-2.5 text-[13px] text-toner placeholder:text-graphite-400 focus:border-mark/60 focus:outline-none"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Chip active={onlyBuildable} onClick={() => setOnlyBuildable(!onlyBuildable)}
                title="Oculta NO_BUILD y las excluidas por restricción dura">
            Solo construibles
          </Chip>
          {query && <Chip onClick={() => setQuery('')} title="Quitar la búsqueda">limpiar «{query}» <Mark kind="close" size={9} /></Chip>}
        </div>
        {communes.length > 0 && (
          <div data-uri="commune-filter" className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] tracking-[0.12em] text-graphite-400 uppercase">Comuna</span>
            {communes.map(([c, k]) => (
              <Chip key={c} active={communeFilter === c} onClick={() => setCommuneFilter(communeFilter === c ? null : c)}
                    title={`${k} oportunidad${k === 1 ? '' : 'es'} en la comuna ${c}`}>
                {c} <span className="num text-graphite-400">{k}</span>
              </Chip>
            ))}
            {sinComuna > 0 && (
              <span className="text-[10px] text-graphite-400">{sinComuna} sin comuna en OSM</span>
            )}
          </div>
        )}
        <Note>
          Búsqueda por palabras sobre lo que ya está cargado: barrio, comuna, intervención o
          factor del problema.
        </Note>
      </Panel>

      {compare.length > 0 && (
        <Panel className="p-3.5">
          <SectionTitle right={
            <button onClick={() => setShowCompare(!showCompare)}
                    className="text-[10px] text-graphite-500 hover:text-toner">
              {showCompare ? 'ocultar' : 'mostrar'}
            </button>
          }>
            Comparación · {compare.length}
          </SectionTitle>
          {showCompare && <CompareTable opps={compared} />}
          <button onClick={clearCompare}
                  className="mt-2 text-[10px] text-graphite-500 underline hover:text-toner">
            limpiar comparación
          </button>
        </Panel>
      )}

      <Panel className="p-3.5">
        <SectionTitle right={
          <span className="text-[10px] text-graphite-500">
            {visibleOpportunities.length} de {opportunities.length}
          </span>
        }>
          Oportunidades de recuperación
        </SectionTitle>

        <div className="mt-2.5 flex flex-col border-t border-rule">
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

/**
 * Cómo se identifican las oportunidades.
 *
 * Es la explicación que la vista debía y no daba: qué entra, qué se descarta,
 * cómo se mide, cómo se puntúa y qué NO es. Los números salen del estado
 * cargado, no de un texto fijo: si el pipeline cambia, el panel cambia.
 *
 * Se dice con precisión lo que es —un análisis espacial multicriterio,
 * explicable y auditable— y no lo que suena mejor. No hay aprendizaje
 * automático: no existe verdad de terreno con la que entrenar ni validar, y
 * los pesos se fijan por elicitación, nunca mirando el ranking (CONTRIBUTING).
 */
function MethodPanel() {
  const { sites, opportunities, scenario, provenance, setView, territory } = useStore();
  /* Plegado por defecto: el panel de contexto ya lista las variables; este cuenta el proceso. */
  const [open, setOpen] = useState(false);
  const candidates = sites.filter((s) => s.state === 'CANDIDATE').length;
  const excluded = sites.length - candidates;
  const buildable = opportunities.filter((o) => !o.blocked && o.intervention !== 'NO_BUILD').length;
  const noBuild = opportunities.filter((o) => o.intervention === 'NO_BUILD').length;
  const unknownsPerOpp = opportunities.length
    ? opportunities.reduce((a, o) => a + o.unknowns.length, 0) / opportunities.length : 0;
  const weights = scenario?.weights ?? null;
  const evidence = territory?.counts.evidence ?? null;

  const steps: { title: string; body: ReactNode }[] = [
    {
      title: 'De la evidencia al sitio',
      body: <>
        {evidence !== null ? `${n(evidence)} observaciones` : 'Las observaciones'} de daño de Copernicus EMS
        (foto-interpretación, sin validación de campo) se agrupan por cercanía en{' '}
        <b className="text-toner">{n(sites.length)} sitios</b>. Un sitio no es un predio: es una
        envolvente estimada de evidencia contigua, y así se marca.
      </>,
    },
    {
      title: 'Restricciones duras, antes de puntuar',
      body: <>
        Área mínima, riesgo y compatibilidad normativa se evalúan primero y sin compensación: un
        sitio que no cumple queda fuera aunque el resto le favorezca. Hoy{' '}
        <b className="text-toner">{n(excluded)} excluidos</b> y {n(candidates)} candidatos. Lo que no
        tiene fuente (riesgo sísmico, POT) no excluye ni aprueba: se declara.
      </>,
    },
    {
      title: 'Medición del territorio, sitio por sitio',
      body: <>
        Población a 10 minutos a pie por la red peatonal real (pgRouting sobre OSM), déficit de espacio
        público frente a 10 m²/habitante, vulnerabilidad social (Censo 2018 del DANE por manzana),
        accesibilidad peatonal y brecha de equipamientos. Cada medida lleva su fuente y su versión.
      </>,
    },
    {
      title: 'Puntaje multicriterio con pesos declarados',
      body: <>
        Los factores normalizados se combinan con pesos fijos y versionados
        {provenance.scoring_version ? <> (<code className="text-[10px]">{provenance.scoring_version}</code>)</> : null}
        {weights && (
          <>: {Object.entries(weights).map(([k, v], i) => (
            <span key={k}>{i > 0 && ', '}{FACTOR_LABEL[k] ?? k} <b className="num text-toner">{pct(v)}</b></span>
          ))}</>
        )}. La descomposición suma exactamente el puntaje —se puede abrir en cada ficha— y un
        contrafactual dice cuánto tendría que cambiar un factor para cambiar la recomendación.
        <b className="text-graphite-700"> El puntaje ordena; el problema titula.</b>
      </>,
    },
    {
      title: 'Intervención, viabilidad y confianza',
      body: <>
        Se propone la intervención con mayor afinidad al problema —parque, plaza, espacio abierto,
        equipamiento— y se comprueban las condiciones de viabilidad una a una: cumple, con reservas,
        bloquea o <b className="text-graphite-700">sin fuente</b>. Hoy {n(buildable)} oportunidades proponen
        construir algo{noBuild > 0 && <> y {n(noBuild)} responden que ahí no cabe nada</>}; cada una
        declara en promedio {dec(unknownsPerOpp, 1)} condiciones sin fuente. La confianza combina la
        evidencia, el método de captación y la antigüedad de la observación.
      </>,
    },
    {
      title: 'Del sitio al escenario',
      body: <>
        Con un presupuesto y unos pesos, un algoritmo greedy elige en cada paso el candidato que suma
        más población <i>nueva</i> por peso invertido, sin doble conteo y midiendo el efecto sobre la
        equidad de acceso. Es el mismo modelo, con las prioridades cambiadas: sirve para ver qué
        oportunidades resisten un cambio de prioridades y cuáles no.
        {scenario && <> El escenario actual selecciona <b className="text-toner">{scenario.items.length}</b> de {n(scenario.considered)} candidatos.</>}{' '}
        <button className="underline hover:text-toner" onClick={() => setView('escenarios')}>Ver los escenarios</button>
      </>,
    },
  ];

  return (
    <Panel data-uri="method" className="border-mark/25 p-4">
      <SectionTitle right={
        <button data-uri="method-toggle" onClick={() => setOpen(!open)} className="text-[10px] text-graphite-500 hover:text-toner">
          {open ? 'ocultar' : 'mostrar'}
        </button>
      }>
        Cómo se identifican las oportunidades
      </SectionTitle>
      <p className="mt-2 text-[13px] leading-relaxed text-graphite-700">
        Un <b className="text-toner">análisis espacial multicriterio, explicable y auditable</b>: dónde
        hay evidencia de daño, qué falta alrededor y qué intervención pública respondería a eso con
        mayor beneficio para la población alcanzable. Cada número se puede rastrear hasta su fuente.
      </p>
      {open && (
        <ol className="mt-3 flex flex-col gap-2.5">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-2.5">
              <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-mark/50 text-[10px] font-semibold text-mark">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-toner">{step.title}</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-graphite-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Note>
        Lo que no es: no hay aprendizaje automático ni validación de campo. Los pesos se fijan por
        elicitación y se congelan con versión; no se ajustan mirando el ranking. Toda salida es
        consultiva (CON-05) y no sustituye inspección estructural, licencias ni el POT.
      </Note>
    </Panel>
  );
}

function Card({ opp, confidence, selected, inCompare, onSelect, onCompare }: {
  opp: Opportunity; confidence: number; selected: boolean; inCompare: boolean;
  onSelect: () => void; onCompare: () => void;
}) {
  const color = rgbCss(INTERVENTION_COLOR[opp.intervention] ?? [23, 24, 27]);
  const ok = opp.feasibility.filter((f) => f.status === 'OK').length;
  const unknown = opp.feasibility.filter((f) => f.status === 'UNKNOWN').length;
  const warn = opp.feasibility.filter((f) => f.status === 'WARNING').length;
  const blocked = opp.feasibility.filter((f) => f.status === 'BLOCKED').length;

  return (
    <div data-uri="opportunity-card" className={[
      'border-b border-rule px-2 py-3 transition-colors',
      selected ? 'bg-sheet-2 ring-1 ring-inset ring-toner' : 'hover:bg-sheet-2/70',
      opp.blocked ? 'opacity-60' : '',
    ].join(' ')}>
      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-2.5">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[13px] font-medium">{opp.intervention_label}</span>
              <span className="num shrink-0 font-mono text-[10px] text-graphite-400">
                
              </span>
            </div>
            {/* Dónde, antes del porqué (ADR-22). */}
            <p data-uri="card-place" className="mt-0.5 truncate text-[11px] text-graphite-700">
              {opp.place?.neighborhood || opp.place?.commune
                ? [
                    opp.place.neighborhood ? `Barrio ${opp.place.neighborhood}` : null,
                    opp.place.commune ? `Comuna ${opp.place.commune}` : null,
                  ].filter(Boolean).join(' · ')
                : <span className="text-graphite-400">ubicación sin fuente</span>}
              {opp.place?.corner_label && <span className="text-graphite-500"> · {opp.place.corner_label}</span>}
            </p>
            {/* El titular es la razón. El puntaje ordena, pero no titula. */}
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-graphite-600">
              {opp.problem.headline}
            </p>
          </div>
          <span className="num shrink-0 text-right">
            <span className="block text-[14px] font-bold text-toner">
              {dec(opp.suitability, 1)}
            </span>
            <span className="block text-[9px] text-graphite-400">idoneidad</span>
          </span>
        </div>

        <p className="num mt-1.5 text-[12px] text-graphite-700">
          <b className="font-semibold text-toner">{n(opp.impact.population_reached)}</b> personas
          {' · '}{cop(opp.cost_cop)}
          {' · '}{dec(opp.impact.people_per_million_cop, 1)} personas por millón
        </p>

        <div className="mt-2">
          <Bar value={Math.min(1, opp.suitability / 100)} color={color} height={3} />
        </div>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        {blocked > 0 && <span className="inline-flex items-center gap-1 text-bad"><Mark kind="bad" />{blocked} bloquea</span>}
        {warn > 0 && <span className="inline-flex items-center gap-1 text-warn"><Mark kind="warn" />{warn} con reservas</span>}
        <span className="inline-flex items-center gap-1 text-ok"><Mark kind="ok" />{ok} cumple</span>
        {unknown > 0 && (
          <span className="inline-flex items-center gap-1.5 text-graphite-600">
            <span className="hatch inline-block h-2.5 w-2.5" aria-hidden />{unknown} sin fuente
          </span>
        )}
        <span className="text-graphite-600" title="Confianza compuesta de la evidencia y el método de captación">
          confianza <span className={
            confidence > 0.6 ? 'text-ok' : confidence > 0.35 ? 'text-warn' : 'text-bad'
          }>{pct(confidence)}</span>
        </span>
        <button
          onClick={onCompare}
          aria-pressed={inCompare}
          className={['ml-auto underline decoration-rule-2 underline-offset-2 transition-colors',
            inCompare ? 'font-semibold text-toner' : 'text-graphite-500 hover:text-toner'].join(' ')}
        >
          {inCompare ? 'comparando' : 'comparar'}
        </button>
      </div>
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
    { label: 'Lugar', get: (o) => o.place?.place_line ?? 'sin fuente' },
    { label: 'Intervención', get: (o) => o.intervention_label },
    { label: 'Población alcanzada', get: (o) => n(o.impact.population_reached),
      raw: (o) => o.impact.population_reached, best: 'max' },
    { label: 'Costo', get: (o) => cop(o.cost_cop), raw: (o) => o.cost_cop, best: 'min' },
    { label: 'Personas por millón de pesos', get: (o) => dec(o.impact.people_per_million_cop, 1) ?? '—',
      raw: (o) => o.impact.people_per_million_cop, best: 'max' },
    { label: 'Reducción de déficit',
      get: (o) => (o.impact.deficit_reduction === null ? '—' : pct(o.impact.deficit_reduction, 2)),
      raw: (o) => o.impact.deficit_reduction, best: 'max' },
    { label: 'Observaciones de daño', get: (o) => n(o.evidence.damage_observations),
      raw: (o) => o.evidence.damage_observations, best: 'max' },
    { label: 'Condiciones sin fuente', get: (o) => String(o.unknowns.length),
      raw: (o) => o.unknowns.length, best: 'min' },
    { label: 'Confianza', get: (o) => pct(o.confidence), raw: (o) => o.confidence, best: 'max' },
    { label: 'Idoneidad', get: (o) => dec(o.suitability, 1), raw: (o) => o.suitability, best: 'max' },
  ];

  return (
    <div className="mt-2.5 overflow-x-auto">
      <table className="w-full min-w-[420px] text-[11px]">
        <thead>
          <tr>
            <th className="w-36" />
            {opps.map((o) => (
              <th key={o.opportunity_id} className="px-2 pb-2 text-left">
                <div className="num font-mono text-[9px] text-graphite-400">
                  {o.place?.neighborhood ?? o.intervention_label}
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
              <tr key={r.label} className="border-t border-rule">
                <td className="py-1.5 pr-2 text-graphite-500">{r.label}</td>
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
