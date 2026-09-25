import { useState } from 'react';
import { Icon } from '../components/icons';
import { Crumbs, Kicker, Sheet } from '../components/ui';
import { cop, dec, FACTOR_LABEL, razon } from '../lib/format';
import {
  INTERVENTION, alternativesOf, counterfactualText, defaultPair, driversText, interventionName,
  placeName, reachOf, peopleLine,
} from '../lib/place';
import { useStore } from '../state/store';
import type { Recommendation, Site } from '../types';

/**
 * Mesa de decisiones (variante B). Dos hipótesis para el mismo lugar, con lo
 * que atienden, a quién servirían y —sobre todo— qué falta comprobar. El
 * orden A/B es el del modelo de reglas; no es una recomendación de obra.
 */
export function InterventionsPanel({ site }: { site: Site }) {
  const { details, oppBySite, pairFor, setPair, openPanel, saveComparison, saved, sentinel } = useStore();
  const detail = details[site.site_id];
  const all = alternativesOf(detail);
  const pair = (pairFor(site.site_id) ?? defaultPair(detail)).filter((c) => all.some((r) => r.intervention === c));
  const isSaved = saved.some((s) => s.siteId === site.site_id && s.pair.join() === pair.join());
  const [justSaved, setJustSaved] = useState(false);

  const change = (slot: number, code: string) => {
    const next = [...pair];
    next[slot] = code;
    setPair(site.site_id, next);
    setJustSaved(false);
  };

  return (
    <Sheet
      id="intervenciones"
      wide
      label={`Posibles intervenciones en ${placeName(site)}`}
      onClose={() => openPanel(null)}
      footer={all.length > 0 && (
        <div className="grid grid-cols-2 gap-3 border-t border-cobalt-100 bg-cobalt-50 px-4 py-3 md:px-6 md:py-4 lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-6">
          <div className="hidden items-start gap-4 lg:flex">
            <Icon.Bulb size={30} className="mt-0.5 shrink-0 text-cobalt" />
            <div>
              <p className="font-serif text-[21px] leading-tight font-semibold">Antes de elegir</p>
              <p className="text-[14px] leading-snug text-ink-2">
                Revisa la evidencia, contrasta supuestos y define qué información hace falta para tomar una mejor decisión.
              </p>
            </div>
          </div>
          <div className="text-center">
            <button type="button" className="btn btn-primary w-full lg:w-[250px]" onClick={() => openPanel('verificacion')}>
              <Icon.Arrow size={20} /> Preparar verificación
            </button>
            <p className="mt-1 hidden text-[13px] text-ink-2 md:block">Define qué queremos comprobar en el lugar.</p>
          </div>
          <div className="text-center">
            <button
              type="button"
              className="btn btn-secondary w-full lg:w-[250px]"
              onClick={() => { saveComparison(site.site_id, pair); setJustSaved(true); }}
            >
              <Icon.Bookmark size={19} /> {isSaved || justSaved ? 'Comparación guardada' : 'Guardar comparación'}
            </button>
            <p className="mt-1 hidden text-[13px] text-ink-2 md:block">
              {isSaved || justSaved ? 'Está en «Guardadas», en este navegador.' : 'Mantén este análisis para más adelante.'}
            </p>
          </div>
        </div>
      )}
    >
      <div className="px-6 pt-5 pb-8 lg:px-8">
        <Crumbs site={site} tail="Comparación" />
        <h2 className="mt-4 pr-10 font-serif text-[34px] leading-[1.08] font-semibold tracking-tight lg:text-[44px]">
          ¿Qué aportaría más a {placeName(site)}?
        </h2>
        <p className="mt-1.5 font-serif text-[18px] text-ink-2 lg:text-[20px]">
          Compara dos hipótesis antes de priorizar una intervención.
        </p>

        {!detail && <p className="mt-8 text-ink-3">Cargando el detalle del sitio…</p>}
        {detail && all.length === 0 && <Excluded site={site} />}

        {all.length > 0 && (
          <div className={`mt-7 grid gap-5 ${pair.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {pair.map((code, slot) => {
              const rec = all.find((r) => r.intervention === code)!;
              return (
                <Alternative
                  key={slot}
                  slot={slot}
                  rec={rec}
                  site={site}
                  isRecommended={oppBySite.get(site.site_id)?.intervention === code}
                  options={all.filter((r) => !pair.includes(r.intervention) || r.intervention === code)}
                  onChange={(c) => change(slot, c)}
                  hasImagery={Boolean(sentinel)}
                />
              );
            })}
          </div>
        )}
        {all.length > 0 && (
          <p className="mt-4 text-[13px] leading-snug text-ink-3">
            Las hipótesis salen del modelo de reglas del sistema para este sitio ({all.length} evaluadas). Ordenan
            opciones con los datos disponibles; ninguna está validada para Pereira ni sustituye un estudio.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Alternative({
  slot, rec, site, isRecommended, options, onChange, hasImagery,
}: {
  slot: number; rec: Recommendation; site: Site; isRecommended: boolean;
  options: Recommendation[]; onChange: (code: string) => void; hasImagery: boolean;
}) {
  const { details, oppBySite, openPanel } = useStore();
  const detail = details[site.site_id];
  const reach = reachOf(site, detail);
  const opp = oppBySite.get(site.site_id);
  const meta = INTERVENTION[rec.intervention];
  const [why, setWhy] = useState(false);

  /* Lo pendiente: lo que el sistema no sabe de este lugar, más lo propio de la hipótesis. */
  const pending: string[] = ['Estado real, en campo', 'Normativa POT'];
  if (rec.intervention === 'COMMUNITY_FACILITY' || rec.intervention === 'SPORTS') pending.push('Demanda y operación');
  else if (rec.intervention !== 'NO_BUILD') pending.push('Uso cotidiano y acceso');
  if (!reach.reliable) pending.push('Alcance a pie');
  const area = isRecommended ? opp?.feasibility.find((c) => c.check_id === 'area') : undefined;

  const rows: [string, React.ReactNode][] = [
    ['Necesidad que atiende', <>{meta?.need ?? '—'}<span className="block text-[13px] text-ink-3">{driversText(rec)}</span></>],
    ['A quién serviría', reach.reliable ? `${peopleLine(reach)} (estimación)` : <span className="text-ink-3">Por estimar: el alcance a pie de este sitio no es confiable</span>],
    ['Qué falta comprobar', pending.join(' · ')],
    ['Viabilidad normativa', <span className="text-ink-3">Pendiente de validación · POT sin dato publicable</span>],
    ['Costo', rec.cost_cop === null
      ? <span className="text-ink-3">Sin estimación</span>
      : <>{cop(rec.cost_cop)}<span className="block text-[13px] text-ink-3">{rec.cost_is_estimated ? 'Estimación paramétrica por m², sin costos unitarios oficiales validados' : 'Costo declarado'}</span></>],
  ];
  if (area && area.status !== 'OK') rows.push(['Área', <span className="text-ink-2">{area.detail}</span>]);

  return (
    <article data-uri="alternative" className="flex min-w-0 flex-col rounded-[4px] border border-rule bg-card px-4 pt-5 pb-4 md:px-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Kicker>Alternativa · {String.fromCharCode(65 + slot)}</Kicker>
        {options.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] text-ink-3">
            Cambiar
            <select
              value={rec.intervention}
              onChange={(e) => onChange(e.target.value)}
              className="max-w-[210px] rounded-[3px] border border-rule-2 bg-card px-2 py-1 text-[13.5px] text-ink"
              aria-label={`Cambiar la alternativa ${String.fromCharCode(65 + slot)}`}
            >
              {options.map((o) => <option key={o.intervention} value={o.intervention}>{interventionName(o.intervention)}</option>)}
            </select>
          </label>
        )}
      </div>
      <h3 className="mt-1 font-serif text-[30px] leading-tight font-semibold tracking-tight lg:text-[36px]">{meta?.name ?? rec.display_name}</h3>
      <p className="mt-1 font-serif text-[17px] leading-snug text-ink-2 lg:text-[19px]">{meta?.purpose}</p>

      <dl className="mt-5 border-t border-rule">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[112px_1fr] gap-x-3 border-b border-rule py-2.5 text-[14.5px] md:grid-cols-[150px_1fr] md:gap-x-4 lg:grid-cols-[190px_1fr]">
            <dt className="font-semibold text-ink">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>

      <button type="button" className="mt-3 flex items-center gap-1.5 self-start text-[13.5px] text-ink-2 hover:text-ink" aria-expanded={why} onClick={() => setWhy((v) => !v)}>
        <Icon.Chevron size={16} className={`transition-transform ${why ? 'rotate-180' : ''}`} />
        Por qué el sistema la propone
      </button>
      {why && (
        <div className="animate-rise mt-2 rounded-[3px] bg-wash px-3 py-2.5 text-[13.5px] leading-snug text-ink-2">
          <ul className="space-y-1">
            {rec.explanation.contributions.map((c) => (
              <li key={c.factor} className="flex justify-between gap-3">
                <span>{FACTOR_LABEL[c.factor] ?? c.factor}</span>
                <span className="num">{c.contribution >= 0 ? '+' : ''}{dec(c.contribution, 1)}</span>
              </li>
            ))}
            {rec.explanation.penalties.map((p) => (
              <li key={p.constraint_id} className="flex justify-between gap-3 text-bad">
                <span>{p.constraint_id === 'low_confidence' ? 'Confianza baja en los datos' : p.reason}</span>
                <span className="num">−{dec(p.magnitude, 1)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-rule pt-2">
            Idoneidad del modelo de reglas: <b className="num">{dec(rec.score, 1)}</b> de 100. Ordena hipótesis; no decide obras.
          </p>
          {counterfactualText(rec) && <p className="mt-1 text-ink-3">{counterfactualText(rec)}</p>}
        </div>
      )}

      <Kicker className="mt-5">Evidencia disponible</Kicker>
      <div className="mt-2 flex flex-wrap gap-2">
        <Chip on label={`Copernicus EMS · ${site.evidence_count} ${site.evidence_count === 1 ? 'observación' : 'observaciones'}`} icon={<Icon.Doc size={17} />} />
        <Chip on={hasImagery} label="Imágenes antes y después" icon={<Icon.Image size={17} />} />
        <Chip on={false} label="Fotos de campo" icon={<Icon.Image size={17} />} />
        <Chip on={false} label="Notas de campo" icon={<Icon.Clipboard size={17} />} />
      </div>
      <button type="button" className="mt-4 flex items-center gap-2 self-start text-[15px]" onClick={() => openPanel('evidencia')}>
        <Icon.Arrow size={19} className="text-cobalt" /><span className="link">Ver evidencia del lugar</span>
      </button>
    </article>
  );
}

/** Disponible: punto verde. No disponible: rayado y dicho, no escondido. */
function Chip({ on, label, icon }: { on: boolean; label: string; icon: React.ReactNode }) {
  return (
    <span
      data-uri="evidence-chip"
      data-available={on}
      className={`inline-flex items-center gap-2 rounded-[4px] border px-2.5 py-1.5 text-[13px] ${on ? 'border-rule-2 text-ink' : 'border-dashed border-rule-2 text-ink-3'}`}
      title={on ? 'Disponible en esta versión' : 'No disponible en esta versión'}
    >
      {icon}
      {label}
      {on
        ? <span className="size-2 rounded-full bg-ok" aria-label="disponible" />
        : <span className="hatch size-2.5 rounded-full border border-unknown/50" aria-label="no disponible" />}
    </span>
  );
}

function Excluded({ site }: { site: Site }) {
  const { details, openPanel } = useStore();
  const ex = details[site.site_id]?.exclusions ?? [];
  return (
    <div className="mt-8 max-w-[720px] rounded-[4px] border border-rule bg-wash px-6 py-5">
      <p className="font-serif text-[22px] font-semibold">El sistema no propone intervenciones aquí</p>
      <p className="mt-2 text-[15px] leading-snug text-ink-2">
        El sitio quedó fuera por las restricciones del modelo:{' '}
        {ex.map((e) => razon(e.reason)).join('; ') || 'sin razón registrada'}. Eso no significa que el
        lugar no necesite nada: significa que con los datos actuales no hay una hipótesis que comparar.
      </p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => openPanel('verificacion')}>
        <Icon.Arrow size={20} /> Preparar una verificación del lugar
      </button>
    </div>
  );
}
