import { Callout, Classes, Colors, Icon, Intent, NonIdealState, Popover, ProgressBar, Tag, Tooltip } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import type { IconName } from '@blueprintjs/icons';
import { ABSENCE, SOURCES } from './data';
import type { AbsenceCode, FeasibilityStatus, LicenseClass, MatchStatus, ReviewStatus } from './data';

/* ── El catalogo de ausencias ─────────────────────────────────────────────
 * Esta es la pieza que justifica mirar Blueprint. El producto declara 45
 * ausencias distintas en cinco redacciones; aqui son un codigo cerrado con
 * intent, icono y explicacion, y una sola forma de dibujarlas.            */
const STYLE: Record<AbsenceCode, { intent: Intent; icon: IconName }> = {
  SIN_FUENTE:         { intent: Intent.NONE,    icon: IconNames.DISABLE },
  NO_DISCRIMINA:      { intent: Intent.WARNING, icon: IconNames.HORIZONTAL_BAR_CHART },
  SUPRIMIDO:          { intent: Intent.NONE,    icon: IconNames.EYE_OFF },
  AMBIGUO:            { intent: Intent.WARNING, icon: IconNames.HELP },
  SIN_ENLACE:         { intent: Intent.WARNING, icon: IconNames.GEOSEARCH },
  BLOQUEADA_LICENCIA: { intent: Intent.DANGER,  icon: IconNames.LOCK },
  DESACTUALIZADA:     { intent: Intent.WARNING, icon: IconNames.TIME },
  EN_CONFLICTO:       { intent: Intent.DANGER,  icon: IconNames.ISSUE },
  VACIO:              { intent: Intent.NONE,    icon: IconNames.SEARCH },
  PARCIAL:            { intent: Intent.WARNING, icon: IconNames.DOUGHNUT_CHART },
  CONFIANZA_BAJA:     { intent: Intent.WARNING, icon: IconNames.CONFIRM },
  SIMULADO:           { intent: Intent.PRIMARY, icon: IconNames.LAB_TEST },
  SIN_DENOMINADOR:    { intent: Intent.NONE,    icon: IconNames.CALCULATOR },
  FUERA_DE_ALCANCE:   { intent: Intent.NONE,    icon: IconNames.MAP_MARKER },
  SIN_REVISAR:        { intent: Intent.WARNING, icon: IconNames.EYE_OPEN },
};
export const absenceStyle = (c: AbsenceCode) => STYLE[c];

/** En linea: donde iria un valor y no hay valor. Nunca un cero, nunca vacio. */
export function Absence({ code, minimal = true }: { code: AbsenceCode; minimal?: boolean }) {
  const s = STYLE[code];
  return (
    <Tooltip content={ABSENCE[code]} compact placement="top">
      <Tag minimal={minimal} intent={s.intent} icon={s.icon} className="absence-tag">
        {code.toLowerCase().replace(/_/g, ' ')}
      </Tag>
    </Tooltip>
  );
}

/** En bloque: cuando la ausencia ocupa toda una region de la pantalla. */
export function AbsenceState({ code, action }: { code: AbsenceCode; action?: React.ReactElement }) {
  const s = STYLE[code];
  return (
    <NonIdealState
      icon={s.icon}
      iconMuted={s.intent === Intent.NONE}
      title={code.replace(/_/g, ' ')}
      description={ABSENCE[code]}
      action={action}
      layout="vertical"
    />
  );
}

/** Un valor o su ausencia. El cero nunca sustituye a la falta de dato (ADR-18). */
export function Value({ v, code, suffix = '', digits = 2 }: { v: number | null; code?: AbsenceCode; suffix?: string; digits?: number }) {
  if (v === null || v === undefined) return <Absence code={code ?? 'SIN_FUENTE'} />;
  return <span className="num">{v.toLocaleString('es-CO', { maximumFractionDigits: digits })}{suffix}</span>;
}

/* ── Procedencia: cualquier cifra puede decir de donde sale ───────────── */
export function Provenance({ sourceId, children }: { sourceId: string | null; children: React.ReactNode }) {
  if (!sourceId) return <>{children}</>;
  const src = SOURCES.find((s) => s.source_id === sourceId);
  if (!src) return <>{children}</>;
  return (
    <Popover
      interactionKind="hover"
      placement="right"
      content={
        <div className="prov-card">
          <div className="prov-title">{src.display_name}</div>
          <div className="prov-row"><LicenseTag lc={src.license_class} />{src.absence && <Absence code={src.absence} />}</div>
          <div className="prov-meta">
            <span>{src.observed_at ? `corte ${src.observed_at}` : 'sin fecha declarada'}</span>
            <span>· redistribucion {src.redistribution_allowed === null ? 'sin declarar' : src.redistribution_allowed ? 'permitida' : 'prohibida'}</span>
          </div>
          <div className="prov-note">{src.note}</div>
        </div>
      }
    >
      <span className="prov-anchor">{children}</span>
    </Popover>
  );
}

/* ── Estados cerrados, dibujados siempre igual ───────────────────────── */
const LIC: Record<LicenseClass, Intent> = {
  COMMERCIAL_SAFE: Intent.SUCCESS, ATTRIBUTION: Intent.SUCCESS, SHARE_ALIKE: Intent.PRIMARY,
  NON_COMMERCIAL: Intent.WARNING, UNCLEAR: Intent.DANGER,
};
export const LicenseTag = ({ lc }: { lc: LicenseClass }) => (
  <Tag minimal intent={LIC[lc]} icon={lc === 'UNCLEAR' ? IconNames.LOCK : undefined}>{lc.toLowerCase().replace('_', ' ')}</Tag>
);

const FEA: Record<FeasibilityStatus, Intent> = { OK: Intent.SUCCESS, BLOCKED: Intent.DANGER, UNKNOWN: Intent.NONE };
export const FeasibilityTag = ({ s }: { s: FeasibilityStatus }) => (
  <Tag minimal intent={FEA[s]} icon={s === 'OK' ? IconNames.TICK : s === 'BLOCKED' ? IconNames.CROSS : IconNames.HELP}>
    {s === 'UNKNOWN' ? 'sin fuente' : s.toLowerCase()}
  </Tag>
);

const MATCH: Record<MatchStatus, Intent> = { LINKED: Intent.SUCCESS, AMBIGUOUS: Intent.WARNING, UNLINKED: Intent.NONE };
export const MatchTag = ({ s }: { s: MatchStatus }) => <Tag minimal intent={MATCH[s]}>{s.toLowerCase()}</Tag>;
export const ReviewTag = ({ s }: { s: ReviewStatus }) => (
  <Tag minimal intent={s === 'APROBADA' ? Intent.SUCCESS : Intent.WARNING} icon={s === 'APROBADA' ? IconNames.ENDORSED : IconNames.EYE_OPEN}>
    {s.toLowerCase()}
  </Tag>
);

/** Una metrica NUNCA sin su denominador. */
export function Metric({ label, num, den, unit, code }: { label: string; num: number; den: number; unit: string; code?: AbsenceCode }) {
  const pct = den ? num / den : 0;
  return (
    <div className="metric">
      <div className="metric-head">
        <span className={Classes.TEXT_MUTED}>{label}</span>
        {code && <Absence code={code} />}
      </div>
      <div className="metric-val">
        <span className="num big">{(pct * 100).toFixed(0)}%</span>
        <span className={Classes.TEXT_MUTED}> — {num.toLocaleString('es-CO')} de {den.toLocaleString('es-CO')} {unit}</span>
      </div>
      <ProgressBar value={pct} intent={pct < 0.5 ? Intent.DANGER : pct < 0.8 ? Intent.WARNING : Intent.SUCCESS} stripes={false} animate={false} />
    </div>
  );
}

export const Banner = () => (
  <Callout intent={Intent.PRIMARY} icon={IconNames.LAB_TEST} className="sim-banner">
    <b>Datos simulados.</b> Prototipo de interfaz sobre Blueprint. Ninguna cifra de esta pantalla
    es una observacion real: el generador es determinista y existe para ejercitar los quince casos
    limite del dominio. Manifiesto §31 — el dato simulado debe verse simulado.
  </Callout>
);

export const Swatch = ({ c }: { c: string }) => <Icon icon={IconNames.FULL_CIRCLE} color={c} size={10} />;
export { Colors };
