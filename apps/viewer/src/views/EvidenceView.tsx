import { useMemo, useState } from 'react';
import { DAMAGE_LABEL, fecha, LICENSE_LABEL, n, pct } from '../lib/format';
import { useStore } from '../state/store';
import { Bar, Chip, Note, Panel, SectionTitle, Stat, StatusBadge } from '../components/ui';

export function EvidenceView() {
  const { sources, alerts, sites, opportunities, provenance, layers, isStatic } = useStore();
  const [tier, setTier] = useState<string>('todas');

  const tiers = useMemo(
    () => ['todas', ...new Set(sources.map((s) => s.tier))].filter(Boolean),
    [sources],
  );
  const shown = sources.filter((s) => tier === 'todas' || s.tier === tier);

  const evidenceStats = useMemo(() => {
    const evidence = layers.evidence?.features ?? [];
    const byClass = new Map<string, number>();
    for (const f of evidence) {
      const label = String((f.properties as Record<string, unknown>).label ?? '');
      byClass.set(label, (byClass.get(label) ?? 0) + 1);
    }
    const withEvidence = sites.filter((s) => s.evidence_count > 0);
    const multiSource = sites.filter((s) => s.independent_sources > 1);
    return {
      total: evidence.length, byClass,
      withEvidence: withEvidence.length,
      multiSource: multiSource.length,
      avgConfidence: sites.length
        ? sites.reduce((a, s) => a + s.confidence, 0) / sites.length : 0,
    };
  }, [layers.evidence, sites]);

  const unknownsByCheck = useMemo(() => {
    const m = new Map<string, { label: string; detail: string; count: number }>();
    for (const o of opportunities) {
      for (const f of o.feasibility) {
        if (f.status !== 'UNKNOWN') continue;
        const prev = m.get(f.check_id);
        m.set(f.check_id, {
          label: f.label, detail: f.detail, count: (prev?.count ?? 0) + 1,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [opportunities]);

  const blocked = sources.filter((s) => s.redistribution_allowed === false);
  const unverified = sources.filter((s) => !s.usable);

  return (
    <div className="flex flex-col gap-3 p-3">
      <Panel className="p-4">
        <SectionTitle>Ninguna capa es sintética</SectionTitle>
        <p className="mt-2 text-[13px] leading-relaxed text-graphite-700">
          Todo corre sobre fuentes reales, y no por convención: la base de datos lo impone con una
          restricción sobre las
          cinco tablas que podrían cargar contexto inventado. Una migración futura que intente
          escribir una capa simulada falla al insertar.
        </p>
        <ul className="mt-3 divide-y divide-rule border-y border-rule text-[12.5px]">
          {(provenance.layers ?? []).map((l) => (
            <li key={l.source_id} title={l.attribution} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-toner">{l.layer}</span>
              <span className="shrink-0 text-graphite-500">
                {l.is_synthetic ? 'sintético' : 'real'} · {LICENSE_LABEL[l.license_class] ?? l.license_class}
              </span>
            </li>
          ))}
        </ul>
        <Note>
          Lo <b>derivado</b> no es lo sintético, y la distinción sostiene el sistema. La población
          se reparte dasimétricamente sobre huellas reales a partir de un total publicado: es un
          cálculo sobre un observado, con método y limitación declarados. Un generador inventaría
          la estructura espacial entera.
        </Note>
      </Panel>

      <Panel className="p-4">
        <SectionTitle>Cadena de trazabilidad</SectionTitle>
        <p className="mt-3 text-[13px] leading-relaxed text-graphite-700">
          {['dato', 'evidencia', 'necesidad', 'oportunidad', 'intervención', 'impacto', 'portafolio', 'decisión'].join(' → ')}
        </p>
        <details className="group mt-3">
        <summary className="cursor-pointer list-none text-[11.5px] text-graphite-500 underline [&::-webkit-details-marker]:hidden">Versiones técnicas del corte</summary>
        <div className="mt-2 rounded-[3px] border border-rule bg-sheet p-2.5 font-mono text-[10px] leading-relaxed text-graphite-500">
          <div>data_version: {provenance.data_version}</div>
          <div>feature_version: {provenance.feature_version}</div>
          <div>constraint_set_version: {provenance.constraint_set_version}</div>
          <div>scoring_version: {provenance.scoring_version}</div>
          <div>is_synthetic: {String(provenance.is_synthetic)}</div>
          <div>despliegue: {isStatic ? 'estático (escenarios precalculados)' : 'en vivo sobre la API'}</div>
        </div>
        </details>
      </Panel>

      <Panel className="p-4">
        <SectionTitle>Evidencia de daño ≠ estado consolidado</SectionTitle>
        <p className="mt-2 text-[12px] leading-relaxed text-graphite-600">
          Las observaciones se guardan crudas, con su fuente, fecha, licencia y precisión posicional.
          La clase consolidada se calcula después y conserva cuántas fuentes la sostienen y cuánto
          concuerdan. No se interpreta que un cambio detectado desde la vertical sea un edificio
          destruido.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat size="sm" label="Observaciones crudas" value={n(evidenceStats.total)} />
          <Stat size="sm" label="Sitios con evidencia"
                value={pct(evidenceStats.withEvidence / (sites.length || 1))}
                sub={`${n(evidenceStats.withEvidence)} de ${n(sites.length)}`} />
          <Stat size="sm" label="Con más de una fuente" value={n(evidenceStats.multiSource)}
                tone={evidenceStats.multiSource === 0 ? 'warn' : 'default'}
                sub="sitios corroborados" />
          <Stat size="sm" label="Confianza media" value={pct(evidenceStats.avgConfidence)} />
        </div>

        {evidenceStats.byClass.size > 0 && (
          <div className="mt-4">
            <div className="text-[10px] tracking-[0.14em] text-graphite-500 uppercase">
              Clases observadas
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {[...evidenceStats.byClass.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span>{DAMAGE_LABEL[k] ?? k}</span>
                    <span className="num text-graphite-500">{n(v)}</span>
                  </div>
                  <div className="mt-1">
                    <Bar value={v / evidenceStats.total}
                         color={k === 'DESTROYED' ? 'var(--color-bad)'
                           : k === 'DAMAGED' ? 'var(--color-warn)' : 'var(--color-graphite-500)'}
                         height={4} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Note>
          Toda la evidencia disponible es foto-interpretación: ninguna observación está validada en
          campo. Por eso la confianza de cada sitio descuenta explícitamente esa ausencia.
        </Note>
      </Panel>

      {unknownsByCheck.length > 0 && (
        <Panel className="p-4">
          <SectionTitle>Lo que el sistema no sabe</SectionTitle>
          <p className="mt-1.5 text-[11px] text-graphite-500">
            Condiciones que salen <b>sin fuente</b> en vez de colapsar a «cumple» o «bloquea».
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {unknownsByCheck.map((u) => (
              <li key={u.label} className="rounded-[3px] border border-dashed border-graphite-400 px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2 text-[12px] font-medium">
                    <StatusBadge status="UNKNOWN" />
                    {u.label}
                  </span>
                  <span className="num shrink-0 text-[10px] text-graphite-500">
                    {u.count} de {opportunities.length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-graphite-500">{u.detail}</p>
              </li>
            ))}
          </ul>
          <Note>
            Antes de retirarla, la capa de riesgo rellenaba con un cero lo que no sabía, y todos
            los sitios puntuaban riesgo cero —el valor más favorable— sin que nadie se enterara. Contar las incógnitas es la corrección de ese error.
          </Note>
        </Panel>
      )}

      {(blocked.length > 0 || unverified.length > 0) && (
        <Panel className="p-4">
          <SectionTitle>Puerta de licencia</SectionTitle>
          <p className="mt-1.5 text-[12px] leading-relaxed text-graphite-600">
            Publicar un sitio web es redistribuir. Estas fuentes no pueden contribuir al paquete
            público, y la puerta bloquearía la publicación si volvieran a hacerlo.
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {[...blocked, ...unverified.filter((u) => !blocked.includes(u))].map((s) => (
              <li key={s.source_id}
                  className="flex items-start gap-2.5 rounded-[3px] border border-bad/30 bg-bad/5 px-2.5 py-2">
                <StatusBadge status="BLOCKED" />
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-bad">{s.display_name}</div>
                  <div className="mt-0.5 text-[10px] text-graphite-500">
                    {s.redistribution_allowed === false
                      ? 'No permite redistribución'
                      : 'Licencia sin verificar'}
                    {s.license_class && ` · ${LICENSE_LABEL[s.license_class] ?? s.license_class}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[9px] opacity-70">{a.code}</span>
                  <span className="text-[9px] opacity-60">{fecha(a.raised_at)}</span>
                </div>
                <p className="mt-0.5">{a.message}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="p-4">
        <SectionTitle right={<span className="text-[10px] text-graphite-500">{shown.length}</span>}>
          Fuentes y licencias
        </SectionTitle>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tiers.map((t) => (
            <Chip key={t} active={t === tier} onClick={() => setTier(t)}>
              {t === 'todas' ? 'todas' : `nivel ${t}`}
            </Chip>
          ))}
        </div>

        <div className="mt-3 flex flex-col border-t border-rule">
          {shown.map((s) => (
            <details key={s.source_id} className="border-b border-rule py-2.5">
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium">{s.display_name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-graphite-500">
                      <span>nivel {s.tier}</span>
                      {s.license_class && <span>{LICENSE_LABEL[s.license_class] ?? s.license_class}</span>}
                    </div>
                  </div>
                  <StatusBadge status={
                    !s.usable ? 'UNKNOWN' : s.redistribution_allowed ? 'OK' : 'BLOCKED'
                  }>
                    {!s.usable ? 'sin verificar' : s.redistribution_allowed ? 'publicable' : 'no redistribuible'}
                  </StatusBadge>
                </div>
              </summary>

              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
                <Field k="licencia" v={s.license_name ?? '—'} />
                <Field k="verificada" v={s.terms_verified_at ?? 'no'} />
                <Field k="share-alike" v={s.share_alike ? 'sí' : 'no'} />
                <Field k="redistribución" v={s.redistribution_allowed ? 'permitida' : 'no permitida'} />
              </dl>
              {s.attribution_text && (
                <p className="mt-2 text-[10px] leading-relaxed text-graphite-600">{s.attribution_text}</p>
              )}
              {s.verification_notes && (
                <p className="mt-2 border-t border-rule pt-2 text-[10px] leading-relaxed text-graphite-500">
                  {s.verification_notes}
                </p>
              )}
            </details>
          ))}
        </div>
        <Note>
          Cada licencia se leyó verbatim del documento oficial y su copia se archiva con el
          proyecto. Una fuente sin verificar no alimenta features.
        </Note>
      </Panel>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-graphite-400">{k}</dt>
      <dd className="truncate text-graphite-700" title={v}>{v}</dd>
    </div>
  );
}
