import { useEffect, useState } from 'react';
import { IS_STATIC, loadDetail } from '../data';
import {
  cop, DAMAGE_LABEL, FACTOR_LABEL, fecha, m2, METHOD_LABEL, n, pct, relDays, STATUS_LABEL, dec, SITE_STATE_LABEL } from '../lib/format';
import { INTERVENTION_COLOR, rgbCss } from '../lib/palette';
import { useStore } from '../state/store';
import type { Opportunity, Recommendation, Site, SiteDetail } from '../types';
import { PhotoStrip } from './PhotoStrip';
import { Bar, Chip, Note, SectionTitle, SignedBar, Stat, StatusBadge, NoSource, Mark } from './ui';

export function OpportunityDetail({ site, opp }: { site: Site; opp: Opportunity | undefined }) {
  const { selectSite, technical, setTechnical, compare, toggleCompare, details, setView } = useStore();
  const [detail, setDetail] = useState<SiteDetail | null>(details[site.site_id] ?? null);

  useEffect(() => {
    const cached = details[site.site_id];
    if (cached) { setDetail(cached); return; }
    let alive = true;
    loadDetail(site.site_id)
      .then((d) => { if (alive) setDetail(d ?? null); })
      .catch(() => { if (alive) setDetail(null); });
    return () => { alive = false; };
  }, [site.site_id, details]);

  const color = opp ? rgbCss(INTERVENTION_COLOR[opp.intervention] ?? [23, 24, 27]) : 'var(--color-graphite-500)';
  const inCompare = compare.includes(site.site_id);
  const best: Recommendation | undefined = detail?.recommendations?.[0];
  /* El lugar va primero (ADR-22): antes de saber qué se propone, dónde es. */
  const place = opp?.place ?? {
    neighborhood: site.neighborhood ?? null,
    neighborhood_method: site.neighborhood_method ?? null,
    commune: site.commune ?? null,
    corner_label: site.corner_label ?? null,
    nearest_landmark: site.nearest_landmark ?? null,
    nearest_landmark_m: site.nearest_landmark_m ?? null,
    place_line: site.place_line ?? null,
  };
  const hasPlace = Boolean(place.neighborhood || place.commune || place.corner_label || place.nearest_landmark);

  return (
    <aside data-uri="detail"
           className="animate-fade-up flex h-full w-full flex-col border-rule bg-sheet lg:border-l">
      <header className="shrink-0 border-b border-rule p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div data-uri="place-line" title={site.site_id}>
              {hasPlace ? (
                <>
                  <p className="text-[13px] leading-snug font-semibold text-toner">
                    {place.neighborhood ? `Barrio ${place.neighborhood}` : <span className="text-graphite-500">barrio sin fuente</span>}
                    {' · '}
                    {place.commune ? `Comuna ${place.commune}` : <span className="text-graphite-500">comuna sin fuente</span>}
                    {place.neighborhood_method === 'NEAREST_PLACE' && (
                      <span className="ml-1.5 rounded border border-dashed border-graphite-400 px-1 text-[9px] font-normal text-graphite-600"
                            title="Ningún polígono de barrio contiene el sitio: se tomó el nombre de lugar más cercano en OSM">
                        aproximado
                      </span>
                    )}
                  </p>
                  {(place.corner_label || place.nearest_landmark) && (
                    <p className="mt-0.5 text-[11px] text-graphite-600">
                      {place.corner_label}
                      {place.corner_label && place.nearest_landmark && ' · '}
                      {place.nearest_landmark && (
                        place.nearest_landmark_m !== null
                          ? `a ${Math.round(place.nearest_landmark_m)} m de ${place.nearest_landmark}`
                          : `cerca de ${place.nearest_landmark}`
                      )}
                    </p>
                  )}
                </>
              ) : (
                <NoSource>ubicación</NoSource>
              )}
            </div>
            <h2 className="mt-2 text-lg leading-tight font-semibold tracking-tight">
              {opp?.intervention_label ?? site.top_intervention_label ?? 'Sitio sin recomendación'}
            </h2>
            <p className="mt-0.5 text-[11px] text-graphite-500">
              {m2(site.area_m2)}{site.area_is_estimated ? ' (estimada)' : ''} · {SITE_STATE_LABEL[site.state] ?? 'sin estado'}
            </p>
          </div>
          <button onClick={() => selectSite(null)} aria-label="Cerrar la ficha" title="Cerrar la ficha"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border border-rule-2 text-graphite-600 hover:border-toner hover:text-toner">
            <Mark kind="close" size={11} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {opp && <Chip active title="Idoneidad del baseline por reglas, de 0 a 100">
            Idoneidad <span className="num font-semibold text-toner">{dec(opp.suitability, 1)}</span>
          </Chip>}
          <Chip title="Confianza compuesta de la evidencia y el método de captación">
            Confianza <span className={
              site.confidence > 0.6 ? 'text-ok' : site.confidence > 0.35 ? 'text-warn' : 'text-bad'
            }>{pct(site.confidence)}</span>
          </Chip>
          {opp && opp.unknowns.length > 0 && (
            <Chip title={`Condiciones sin fuente: ${opp.unknowns.join(', ')}`}>
              <span className="text-graphite-600">{opp.unknowns.length} sin fuente</span>
            </Chip>
          )}
          <button
            onClick={() => toggleCompare(site.site_id)}
            className={[
              'ml-auto rounded-[3px] border px-2 py-1 text-[11px] transition-colors',
              inCompare ? 'border-mark/60 bg-mark/15 text-mark' : 'border-rule text-graphite-600 hover:text-toner',
            ].join(' ')}
          >
            {inCompare ? 'En comparación' : 'Comparar'}
          </button>
        </div>

        {opp?.blocked && (
          <div className="mt-3 rounded-[3px] border border-bad/35 bg-bad/10 px-2.5 py-2 text-[11px] text-bad">
            <b>Excluida.</b> Una restricción dura la bloquea; el puntaje no la compensa.
          </div>
        )}
        {opp?.intervention === 'NO_BUILD' && (
          <div className="mt-3 rounded-[3px] border border-rule-2 bg-sheet-2 px-2.5 py-2 text-[11px] text-graphite-700">
            <b>Aquí no cabe nada.</b> Es una respuesta del sistema, no una falta de respuesta.
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {opp && (
          <Section title="Problema">
            <p className="text-[13px] leading-relaxed text-graphite-700">{opp.problem.headline}</p>
            {opp.problem.missing_factors.length > 0 && (
              <Note>
                No entran al titular por falta de fuente: {opp.problem.missing_factors.join(', ')}.
              </Note>
            )}
          </Section>
        )}

        {best && (
          <Section title="¿Por qué aquí?">
            <ul className="flex flex-col gap-2">
              {best.explanation.contributions
                .slice()
                .sort((a, b) => b.contribution - a.contribution)
                .map((c) => (
                  <li key={c.factor}>
                    <div className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-1.5">
                        {c.normalized === null
                          ? <span className="text-graphite-500">?</span>
                          : <span className="text-ok"><Mark kind="ok" /></span>}
                        {FACTOR_LABEL[c.factor] ?? c.factor}
                      </span>
                      <span className="num text-[11px] text-graphite-500">
                        {c.normalized === null ? 'sin fuente' : dec(c.normalized, 2)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <Bar value={c.normalized} color="var(--color-graphite-500)" height={3} />
                    </div>
                  </li>
                ))}
            </ul>
            <Note>
              Los factores están ordenados por su aporte real al puntaje. La descomposición es
              exacta: los aportes suman el puntaje base{' '}
              <span className="num">{dec(best.explanation.base_score, 1)}</span>.
            </Note>
          </Section>
        )}

        {opp && (
          <Section title="Intervención propuesta">
            <div className="border-y border-rule py-2.5">
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <span className="inline-block h-2.5 w-2.5" style={{ background: color }} />
                {opp.intervention_label}
              </div>
              <div className="num mt-1 text-[12.5px] text-graphite-600">
                {m2(opp.impact.area_m2)} · área de influencia{' '}
                {site.catchment_method === 'NETWORK' ? 'por red peatonal' : 'por radio fijo'}
              </div>
            </div>
            {detail && detail.recommendations.length > 1 && (
              <div className="mt-2.5">
                <div className="text-[10px] tracking-[0.14em] text-graphite-500 uppercase">
                  Alternativas evaluadas
                </div>
                <div className="mt-1 flex flex-col border-t border-rule">
                  {detail.recommendations.slice(1).map((r) => (
                    <div key={r.intervention}
                         className="flex items-baseline justify-between border-b border-rule py-1.5 text-[12px]">
                      <span className="text-graphite-700">{r.display_name}</span>
                      <span className="num text-graphite-500">{dec(r.score, 1)} · {cop(r.cost_cop)}</span>
                    </div>
                  ))}
                </div>
                <Note>
                  Se emite una oportunidad por sitio, la mejor. Las alternativas se calculan pero
                  no compiten por la atención.
                </Note>
              </div>
            )}
          </Section>
        )}

        {opp && (
          <Section title="Impacto estimado">
            <div className="grid grid-cols-2 gap-3">
              <Stat size="sm" label="Población alcanzada" value={n(opp.impact.population_reached)}
                    tone="accent" sub="a 10 min andando" />
              <Stat size="sm" label="Personas por millón COP"
                    value={dec(opp.impact.people_per_million_cop, 1) ?? '—'} />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Row label="Reducción de déficit"
                   value={opp.impact.deficit_reduction === null ? null : pct(opp.impact.deficit_reduction, 2)} />
              <Row label="Costo de referencia" value={cop(opp.cost_cop)} />
            </div>
            <Note>
              La población es derivada: un total publicado para el AOI repartido dasimétricamente
              sobre huellas de edificio. No es un conteo por sitio, y dos tercios del puntaje
              cuelgan de ese mismo supuesto.
            </Note>
          </Section>
        )}

        {opp && (
          <Section title={`Viabilidad · ${opp.feasibility.filter((f) => f.status === 'OK').length} de ${opp.feasibility.length} con fuente`}>
            <ul className="flex flex-col gap-2">
              {opp.feasibility.map((f) => (
                <li key={f.check_id} className="flex items-start gap-2.5">
                  <StatusBadge status={f.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-medium">{f.label}</span>
                      <span className="text-[10px] text-graphite-400">{STATUS_LABEL[f.status]}</span>
                    </div>
                    <div className="text-[11px] leading-snug text-graphite-500">{f.detail}</div>
                    {f.source_id && (
                      <div className="mt-0.5 font-mono text-[10px] text-graphite-400">{f.source_id}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {opp.unknowns.length > 0 && (
              <Note>
                Un proyecto con {opp.feasibility.length - opp.unknowns.length} condiciones resueltas
                y {opp.unknowns.length} sin fuente no es lo mismo que uno con todas resueltas.
                Lo desconocido no se colapsa a «cumple» ni a «bloquea».
              </Note>
            )}
          </Section>
        )}

        <Section title="Confianza">
          <div className="flex items-center gap-3">
            <div className="num text-2xl font-semibold"
                 style={{ color: site.confidence > 0.6 ? 'var(--color-ok)'
                   : site.confidence > 0.35 ? 'var(--color-warn)' : 'var(--color-bad)' }}>
              {pct(site.confidence)}
            </div>
            <div className="text-[11px] text-graphite-600">
              {site.independent_sources} fuente{site.independent_sources === 1 ? '' : 's'} independiente
              {site.independent_sources === 1 ? '' : 's'}
            </div>
          </div>
          {detail && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {Object.entries(detail.confidence_drivers).map(([k, v]) => (
                <li key={k} className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="text-graphite-700">{DRIVER_LABEL[k] ?? k}</span>
                  <span className={`num ${v < 0 ? 'text-bad' : 'text-ok'}`}>
                    {v > 0 ? '+' : ''}{dec(v, 3)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Note>
            La confianza descuenta lo que falta: captación por buffer en vez de red, ausencia de
            validación de campo, una sola fuente independiente.
          </Note>
        </Section>

        <Section title="Evidencia">
          <div className="grid grid-cols-2 gap-3">
            <Stat size="sm" label="Observaciones" value={n(site.evidence_count)} />
            <Stat size="sm" label="Clase fusionada"
                  value={site.damage_class ? DAMAGE_LABEL[site.damage_class] ?? site.damage_class : '—'} />
          </div>

          {detail?.fusion && (
            <div className="mt-3 rounded-[3px] border border-rule bg-sheet-2 p-3 text-[11px]">
              <FusionRow label="Concordancia entre observaciones"
                         value={detail.fusion.agreement_ratio === null
                           ? null : dec(detail.fusion.agreement_ratio, 2)} />
              <FusionRow label="Validado en campo"
                         value={detail.fusion.any_field_validated ? 'sí' : 'no'} />
              <FusionRow label="Antigüedad de la observación"
                         value={relDays(detail.fusion.observation_age_days)} />
              <FusionRow label="Fuentes que contribuyen"
                         value={detail.fusion.contributing_sources.join(', ') || '—'} />
            </div>
          )}

          {detail && detail.evidence.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] tracking-[0.14em] text-graphite-500 uppercase">
                Observaciones crudas
              </div>
              <ul className="mt-1.5 flex max-h-48 flex-col gap-1 overflow-y-auto">
                {detail.evidence.map((e) => (
                  <li key={e.evidence_id}
                      className="rounded-[3px] border border-rule bg-sheet-2 px-2 py-1.5 text-[10px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-graphite-700">
                        {DAMAGE_LABEL[e.damage_class] ?? e.damage_class}
                      </span>
                      <span className="text-graphite-400">{fecha(e.observation_date)}</span>
                    </div>
                    <div className="mt-0.5 text-graphite-500">
                      {METHOD_LABEL[e.method] ?? e.method} · {e.source}
                      {e.positional_accuracy_m !== null && ` · ±${e.positional_accuracy_m} m`}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PhotoStrip photos={detail?.photos ?? []} loading={!detail} />

          <Note>
            La evidencia se guarda cruda y separada del estado consolidado. Un cambio detectado
            desde la vertical no equivale a un edificio destruido.{' '}
            <button className="underline hover:text-graphite-700" onClick={() => setView('evidencia')}>
              Ver fuentes y licencias
            </button>
          </Note>
        </Section>

        <div className="border-t border-rule p-4">
          <button
            data-uri="technical-toggle"
            onClick={() => setTechnical(!technical)}
            aria-expanded={technical}
            className="flex w-full items-center justify-between border-y border-rule py-2 text-[12px] text-graphite-600 hover:text-toner"
          >
            <span>Anexo técnico · pesos y descomposición exacta</span>
            <span className="text-graphite-500 underline">{technical ? 'ocultar' : 'mostrar'}</span>
          </button>

          {technical && detail && best && (
            <div className="animate-fade-in mt-3">
              <SectionTitle>Descomposición del puntaje</SectionTitle>
              <table data-uri="decomposition" className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[9px] tracking-wider text-graphite-400 uppercase">
                    <th className="pb-1 font-medium">factor</th>
                    <th className="pb-1 text-right font-medium">norm.</th>
                    <th className="pb-1 text-right font-medium">peso</th>
                    <th className="pb-1 text-right font-medium">afin.</th>
                    <th className="pb-1 pl-2 font-medium">aporte</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {best.explanation.contributions.map((c) => (
                    <tr key={c.factor} className="border-t border-rule">
                      <td className="py-1 text-graphite-600">{c.factor}</td>
                      <td className="num py-1 text-right">
                        {c.normalized === null
                          ? <span className="text-graphite-400">—</span>
                          : dec(c.normalized, 3)}
                      </td>
                      <td className="num py-1 text-right text-graphite-500">{dec(c.weight, 2)}</td>
                      <td className="num py-1 text-right text-graphite-500">{dec(c.affinity, 2)}</td>
                      <td className="w-20 py-1 pl-2"><SignedBar value={c.contribution} max={30} /></td>
                    </tr>
                  ))}
                  {best.explanation.penalties.map((p) => (
                    <tr key={p.constraint_id} className="border-t border-rule">
                      <td className="py-1 text-bad">{p.constraint_id}</td>
                      <td colSpan={3} className="py-1 text-right text-[10px] text-graphite-500">
                        {p.reason}
                      </td>
                      <td className="w-20 py-1 pl-2">
                        <SignedBar value={-p.magnitude * 100} max={30} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-rule-2">
                    <td className="py-1.5 font-semibold text-toner">final</td>
                    <td colSpan={4} className="num py-1.5 text-right font-semibold text-mark">
                      {dec(best.explanation.final_score, 3)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {best.explanation.decomposition_is_exact && (
                <p className="mt-1.5 text-[10px] text-ok">
                  La descomposición es exacta: base − penalizaciones = puntaje final.
                </p>
              )}

              {best.explanation.counterfactual && (
                <div className="mt-3 rounded-[3px] border border-rule bg-sheet-2 p-2.5">
                  <SectionTitle>Contrafactual</SectionTitle>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-graphite-700">
                    {best.explanation.counterfactual.note}
                  </p>
                  <p className="num mt-1 font-mono text-[10px] text-graphite-500">
                    {best.explanation.counterfactual.factor}:{' '}
                    {dec(best.explanation.counterfactual.current_value, 3)} →{' '}
                    {dec(best.explanation.counterfactual.required_value, 3)}{' '}
                    (Δ {dec(best.explanation.counterfactual.delta, 3)})
                  </p>
                </div>
              )}

              <div className="mt-3">
                <SectionTitle>Vector de features</SectionTitle>
                <table className="mt-2 w-full font-mono text-[11px]">
                  <tbody>
                    {Object.entries(detail.features).map(([k, v]) => (
                      <tr key={k} className="border-t border-rule">
                        <td className="py-1 text-graphite-600">{k}</td>
                        <td className="num py-1 text-right">
                          {v === null ? <NoSource>{''}</NoSource> : dec(v, 3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 rounded-[3px] border border-rule bg-sheet p-2.5 font-mono text-[10px] leading-relaxed text-graphite-500">
                <div>data_version: {detail.provenance.data_version}</div>
                <div>feature_version: {detail.provenance.feature_version}</div>
                <div>constraint_set_version: {detail.provenance.constraint_set_version}</div>
                <div>scoring_version: {detail.provenance.scoring_version}</div>
                <div>is_synthetic: {String(detail.provenance.is_synthetic)}</div>
                <div>site_id: {site.site_id} · catchment: {site.catchment_method}</div>
              </div>
            </div>
          )}

          {technical && !detail && (
            <p className="mt-3 text-[11px] text-graphite-500">
              {IS_STATIC
                ? 'El detalle de este sitio no está en el volcado estático.'
                : 'Cargando el detalle desde la API…'}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

const DRIVER_LABEL: Record<string, string> = {
  damage_evidence: 'Evidencia de daño',
  catchment_buffer: 'Captación por buffer, no por red',
  no_field_validation: 'Sin validación de campo',
  synthetic_context_layers: 'Capas de contexto derivadas',
  single_independent_source: 'Una sola fuente independiente',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule p-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between border-b border-rule py-1.5 text-[12.5px]">
      <span className="text-graphite-600">{label}</span>
      {value === null ? <NoSource>{''}</NoSource> : <span className="num font-medium">{value}</span>}
    </div>
  );
}

function FusionRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-graphite-500">{label}</span>
      {value === null
        ? <span className="text-[10px] text-graphite-400">no medible</span>
        : <span className="num text-right font-medium text-graphite-700">{value}</span>}
    </div>
  );
}
