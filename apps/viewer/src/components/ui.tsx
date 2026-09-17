import type { ReactNode } from 'react';
import { rgbCss, sample, type RGB } from '../lib/palette';

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-700 bg-ink-900/85 ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[10px] font-semibold tracking-[0.16em] text-mute-400 uppercase">{children}</h3>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default', size = 'md' }: {
  label: string; value: ReactNode; sub?: ReactNode;
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'bad' | 'unknown'; size?: 'sm' | 'md' | 'lg';
}) {
  const toneCls = {
    default: 'text-paper', accent: 'text-accent', ok: 'text-ok',
    warn: 'text-warn', bad: 'text-bad', unknown: 'text-mute-300',
  }[tone];
  const sizeCls = { sm: 'text-lg', md: 'text-2xl', lg: 'text-[34px] leading-none' }[size];
  return (
    <div>
      <div className="text-[10px] tracking-[0.13em] text-mute-400 uppercase">{label}</div>
      <div className={`num mt-1 font-semibold ${sizeCls} ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-mute-400">{sub}</div>}
    </div>
  );
}

export function Bar({ value, ramp, color, height = 6 }: {
  value: number | null; ramp?: RGB[]; color?: string; height?: number;
}) {
  if (value === null) {
    return (
      <div data-uri="bar-empty"
         className="w-full rounded-full border border-dashed border-ink-500" style={{ height }} />
    );
  }
  const v = Math.max(0, Math.min(1, value));
  const bg = color ?? (ramp ? rgbCss(sample(ramp, v)) : 'var(--color-accent)');
  return (
    <div className="w-full overflow-hidden rounded-full bg-ink-700" style={{ height }}>
      <div data-uri="bar-fill" className="h-full rounded-full transition-[width] duration-300"
           style={{ width: `${v * 100}%`, background: bg }} />
    </div>
  );
}

/** Barra divergente: un aporte negativo al puntaje se ve como negativo. */
export function SignedBar({ value, max }: { value: number; max: number }) {
  const w = Math.min(50, (Math.abs(value) / max) * 50);
  const positive = value >= 0;
  return (
    <div className="relative h-2 w-full rounded-full bg-ink-800">
      <div className="absolute inset-y-0 left-1/2 w-px bg-ink-600" />
      <div className="absolute inset-y-0 rounded-full"
           style={{
             width: `${w}%`,
             left: positive ? '50%' : `${50 - w}%`,
             background: positive ? 'var(--color-ok)' : 'var(--color-bad)',
           }} />
    </div>
  );
}

export function Chip({ children, active, onClick, title }: {
  children: ReactNode; active?: boolean; onClick?: () => void; title?: string;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active ? 'border-mute-400/50 bg-ink-700 text-paper' : 'border-ink-700 bg-ink-850 text-mute-300',
        onClick ? 'cursor-pointer hover:border-mute-400/60 hover:text-paper' : '',
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}

/**
 * Estado de una condición. `UNKNOWN` tiene tratamiento propio a propósito:
 * ni verde ni rojo. Colapsarlo a uno de los dos afirmaría algo que nadie
 * comprobó, y es el error que este visor existe para no cometer.
 */
export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const map: Record<string, string> = {
    OK: 'border-ok/35 bg-ok/10 text-ok',
    WARNING: 'border-warn/35 bg-warn/10 text-warn',
    BLOCKED: 'border-bad/35 bg-bad/10 text-bad',
    UNKNOWN: 'border-ink-500 border-dashed bg-ink-850 text-mute-300',
  };
  const glyph: Record<string, string> = { OK: '✓', WARNING: '!', BLOCKED: '✕', UNKNOWN: '?' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${map[status] ?? map.UNKNOWN}`}>
      {children ?? glyph[status] ?? '?'}
    </span>
  );
}

/** Nota al pie de una cifra que no es una medición directa. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-mute-400">
      <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-mute-400" />
      <span>{children}</span>
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center text-xs text-mute-400">
      {children}
    </div>
  );
}

/** Ausencia de dato, dicha en vez de dibujada como un cero. */
export function NoSource({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-ink-500 px-1.5 py-0.5 text-[10px] text-mute-300">
      sin fuente
      {children ? <span className="text-mute-400">· {children}</span> : null}
    </span>
  );
}
