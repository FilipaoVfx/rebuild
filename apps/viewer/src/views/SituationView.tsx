import { useMemo } from 'react';
import { contextByKey } from '../lib/contexts';
import { n, pct, dec } from '../lib/format';
import { RAMPS, rgbCss, sample } from '../lib/palette';
import { useStore } from '../state/store';
import { ContextIntro } from '../components/ContextIntro';
import { Bar, Note, Panel, SectionTitle, Stat } from '../components/ui';

export function SituationView() {
  const {
    sites, opportunities, oppBySite, context, selectSite, selectedSiteId,
    setView, alerts, coverage, scenarios, discrimination,
  } = useStore();
  const def = contextByKey(context);
  const ramp = RAMPS[context];

  const stats = useMemo(() => {
    const candidates = sites.filter((s) => s.state === 'CANDIDATE');
    const excluded = sites.length - candidates.length;
    const withEvidence = sites.filter((s) => s.evidence_count > 0).length;
    const noSourceAxes = ['risk_score', 'land_use_compatibility'] as const;
    const missing = noSourceAxes.filter(
      (k) => sites.every((s) => s[k] === null),
    );
    const unknowns = opportunities.reduce((a, o) => a + o.unknowns.length, 0);
    const buildable = opportunities.filter((o) => o.intervention !== 'NO_BUILD' && !o.blocked).length;
    const noBuild = opportunities.filter((o) => o.intervention === 'NO_BUILD').length;
    return {
      total: sites.length, candidates: candidates.length, excluded, withEvidence,
      missing, unknowns, buildable, noBuild,
      population: coverage?.cells.reduce((a, c) => a + c.population, 0) ?? null,
      cells: coverage?.total_cells ?? null,
    };
  }, [sites, opportunities, coverage]);

  const ranked = useMemo(() => {
    return sites
      .map((s) => ({ site: s, value: def.value(s, oppBySite.get(s.site_id)) }))
      .sort((a, b) => {
        if (a.value === null && b.value === null) return 0;
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return b.value - a.value;
      })
      .slice(0, 24);
  }, [sites, def, oppBySite]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <ContextIntro />

      <Panel className="p-4">
        <SectionTitle>Lectura del AOI</SectionTitle>
        <p className="mt-2.5 text-[13px] leading-relaxed text-graphite-700">
          La evidencia de daño de Copernicus EMS cubre <b className="text-toner">6,91 km²</b> de
          Pereira y agrupa <b className="text-toner">{n(stats.total)}</b> sitios de oportunidad, de
          los cuales <b className="text-toner">{n(stats.candidates)}</b> son candidatos
          {stats.excluded > 0 && <> y {n(stats.excluded)} quedan excluidos por restricciones duras</>}.
          {stats.population !== null && <> Dentro del área hay <b className="text-toner">{n(stats.population)}</b> personas
          repartidas sobre {n(stats.cells)} celdas.</>}
        </p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-graphite-600">
          El sistema emite <b className="text-mark">{n(opportunities.length)} oportunidades</b>,
          una por sitio y con la mejor intervención.{' '}
          {stats.noBuild > 0
            ? `${n(stats.buildable)} proponen construir algo y ${n(stats.noBuild)} responden que ahí no cabe nada.`
            : 'Todas proponen construir algo: ningún sitio quedó en «aquí no cabe nada».'}
        </p>
        <Note>
          Pereira es uno de los 409 municipios afectados por un evento regional con epicentro en
          San José del Palmar, Chocó. La cobertura satelital es donde se apuntó el sensor, no donde
          hubo daño.
        </Note>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Panel className="p-3.5">
          <Stat label="Sitios" value={n(stats.total)} sub={`${n(stats.candidates)} candidatos`} />
        </Panel>
        <Panel className="p-3.5">
          <Stat label="Oportunidades" value={n(opportunities.length)} tone="accent"
                sub={`${n(stats.buildable)} construibles`} />
        </Panel>
        <Panel className="p-3.5">
          <Stat label="Con evidencia de daño" value={pct(stats.withEvidence / (stats.total || 1))}
                sub={`${n(stats.withEvidence)} de ${n(stats.total)} sitios`} />
        </Panel>
        <Panel className="p-3.5">
          <Stat label="Condiciones sin fuente" value={n(stats.unknowns)} tone="unknown"
                sub={opportunities.length
                  ? `${dec(stats.unknowns / opportunities.length, 1)} por oportunidad, declaradas`
                  : 'declaradas, no rellenadas'} />
        </Panel>
      </div>

      {stats.missing.length > 0 && (
        <Panel className="border-rule-2 p-4">
          <SectionTitle>Dos ejes del modelo no ordenan nada</SectionTitle>
          <ul className="mt-2.5 flex flex-col gap-2 text-[12px]">
            <li className="rounded-[3px] border border-dashed border-graphite-400 px-2.5 py-2">
              <b className="text-graphite-700">Riesgo sísmico</b>
              <p className="mt-0.5 text-[11px] leading-snug text-graphite-500">
                La capa del SGC se retiró: sus términos prohíben redistribuirla y se estaba
                publicando sellada con la versión de otra fuente. Ninguna la sustituye.
              </p>
            </li>
            <li className="rounded-[3px] border border-dashed border-graphite-400 px-2.5 py-2">
              <b className="text-graphite-700">Compatibilidad con el POT</b>
              <p className="mt-0.5 text-[11px] leading-snug text-graphite-500">
                Sin POT de IDE AMCO. El uso de suelo de OSM cubre 1 de {n(stats.total)} sitios, así
                que no hay con qué responder.
              </p>
            </li>
          </ul>
          <Note>
            Estos ejes salen <b>sin fuente</b> en toda el área, no en cero. El cero es el valor más
            favorable en esas escalas y se leería como una medición.{' '}
            <button className="underline hover:text-graphite-700" onClick={() => setView('evidencia')}>
              Ver el detalle
            </button>
          </Note>
        </Panel>
      )}

      {alerts.length > 0 && (
        <Panel className="p-4">
          <SectionTitle right={<span className="text-[10px] text-graphite-500">{alerts.length}</span>}>
            Alertas de calidad
          </SectionTitle>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {alerts.map((a) => (
              <li key={a.alert_id} className={[
                'rounded-[3px] border px-2.5 py-2 text-[11px] leading-snug',
                a.severity === 'error' ? 'border-bad/30 bg-bad/5 text-bad'
                  : 'border-warn/30 bg-warn/5 text-warn',
              ].join(' ')}>
                <span className="font-mono text-[9px] opacity-70">{a.code}</span>
                <p className="mt-0.5">{a.message}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="p-4">
        <SectionTitle right={
          <span className="text-[10px] text-graphite-500">por {def.label.toLowerCase()}</span>
        }>
          Sitios
        </SectionTitle>
        <div className="mt-2.5 flex flex-col gap-1">
          {ranked.map(({ site, value }) => {
            const opp = oppBySite.get(site.site_id);
            return (
              <button
                key={site.site_id}
                onClick={() => selectSite(site.site_id === selectedSiteId ? null : site.site_id)}
                className={[
                  'grid grid-cols-[1fr_auto] items-center gap-2 rounded-[3px] px-2 py-1.5 text-left transition-colors',
                  site.site_id === selectedSiteId ? 'bg-sheet-3' : 'hover:bg-sheet-2',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[12px] font-medium">
                      {opp?.intervention_label ?? site.top_intervention_label ?? 'sin recomendación'}
                    </span>
                    <span className="num shrink-0 font-mono text-[10px] text-graphite-400">
                      {site.site_id.replace('site_', '#')}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-graphite-500">
                    {site.neighborhood
                      ? `${site.neighborhood}${site.commune ? ` · ${site.commune}` : ''}`
                      : site.commune ? `Comuna ${site.commune}` : 'barrio sin fuente'}
                  </div>
                  <div className="mt-1.5">
                    <Bar value={value}
                         color={value === null ? undefined : rgbCss(sample(ramp, value))}
                         height={4} />
                  </div>
                </div>
                {value === null ? (
                  <span className="text-[10px] text-graphite-400">sin fuente</span>
                ) : (
                  <span className="num text-[12px] font-semibold"
                        style={{ color: rgbCss(sample(ramp, value)) }}>
                    {dec(value, 2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {discrimination.flat && (
          <div className="mt-2.5 rounded-[3px] border border-warn/30 bg-warn/5 px-2.5 py-2 text-[11px] leading-snug text-warn">
            <b>Este eje no ordena nada.</b> Tiene cobertura en {n(discrimination.covered)} de{' '}
            {n(discrimination.total)} sitios, pero solo {discrimination.distinct} valor
            {discrimination.distinct === 1 ? '' : 'es'} distinto
            {discrimination.distinct === 1 ? '' : 's'}: el ranking de arriba es casi un empate y el
            color del mapa sugiere una variación que no existe. Cobertura no es información.
          </div>
        )}
        <Note>
          Fuentes de este contexto: {def.sources.join(' · ')}.
          {def.missingNote && <> {def.missingNote}</>}
        </Note>
      </Panel>

      {scenarios.length > 0 && (
        <Panel className="p-4">
          <SectionTitle>Y bajo presupuesto</SectionTitle>
          <p className="mt-2 text-[12px] leading-relaxed text-graphite-600">
            El escenario de {dec(scenarios[0].budget_cop / 1e9, 0)} MM COP selecciona{' '}
            <b className="text-toner">{scenarios[0].items.length} proyectos</b>.{' '}
            <button className="underline hover:text-toner" onClick={() => setView('escenarios')}>
              Ver los escenarios
            </button>
          </p>
        </Panel>
      )}
    </div>
  );
}
