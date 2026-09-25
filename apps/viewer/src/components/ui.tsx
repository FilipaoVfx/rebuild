import type { HTMLAttributes, ReactNode } from 'react';
import { rgbCss, sample, type RGB } from '../lib/palette';

/* Un apartado del concepto: filete arriba, sin caja. Los documentos separan
   con reglas y aire, no con tarjetas. */
export function Panel({ children, className = '', ...rest }: {
  children: ReactNode; className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <section {...rest} className={`border-t border-rule ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="letterhead text-[11px] text-toner">{children}</h3>
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default', size = 'md' }: {
  label: string; value: ReactNode; sub?: ReactNode;
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'bad' | 'unknown'; size?: 'sm' | 'md' | 'lg';
}) {
  const toneCls = {
    default: 'text-toner', accent: 'text-toner', ok: 'text-ok',
    warn: 'text-warn', bad: 'text-bad', unknown: 'text-graphite-500',
  }[tone];
  const sizeCls = { sm: 'text-[19px]', md: 'text-[26px]', lg: 'text-[40px] leading-none tracking-[-0.02em]' }[size];
  return (
    <div>
      <div className="text-[11px] font-medium text-graphite-500">{label}</div>
      <div className={`num mt-0.5 font-bold ${sizeCls} ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-graphite-500">{sub}</div>}
    </div>
  );
}

export function Bar({ value, ramp, color, height = 6 }: {
  value: number | null; ramp?: RGB[]; color?: string; height?: number;
}) {
  if (value === null) {
    /* Sin dato no es cero: la barra vacía lleva la trama de «sin información». */
    return <div data-uri="bar-empty" className="hatch w-full opacity-60" style={{ height }} />;
  }
  const v = Math.max(0, Math.min(1, value));
  const bg = color ?? (ramp ? rgbCss(sample(ramp, v)) : 'var(--color-toner)');
  return (
    <div className="w-full bg-sheet-3" style={{ height }}>
      <div data-uri="bar-fill" className="h-full transition-[width] duration-300"
           style={{ width: `${v * 100}%`, background: bg }} />
    </div>
  );
}

/** Barra divergente: un aporte negativo al puntaje se ve como negativo. */
export function SignedBar({ value, max }: { value: number; max: number }) {
  const w = Math.min(50, (Math.abs(value) / max) * 50);
  const positive = value >= 0;
  return (
    <div className="relative h-2 w-full bg-sheet-3">
      <div className="absolute inset-y-[-2px] left-1/2 w-px bg-graphite-400" />
      <div className="absolute inset-y-0"
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
      aria-pressed={onClick ? !!active : undefined}
      className={[
        'inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-[3px] text-[12px] transition-colors',
        active ? 'border-toner bg-toner text-sheet' : 'border-rule-2 bg-sheet text-graphite-700',
        onClick && !active ? 'cursor-pointer hover:border-toner hover:text-toner' : '',
        onClick && active ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}

/* Marcas dibujadas, un solo trazo: el sistema no usa glifos Unicode como iconos. */
export function Mark({ kind, size = 10 }: { kind: 'ok' | 'bad' | 'warn' | 'unknown' | 'close'; size?: number }) {
  const p = {
    ok: <path d="M2 5.4 4.2 7.6 8 2.6" />,
    bad: <path d="M2.6 2.6 7.4 7.4M7.4 2.6 2.6 7.4" />,
    close: <path d="M2.6 2.6 7.4 7.4M7.4 2.6 2.6 7.4" />,
    warn: <><path d="M5 2v3.8" /><path d="M5 7.6v.1" /></>,
    unknown: <><path d="M3.4 3.6a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1v.3" /><path d="M5 7.8v.1" /></>,
  }[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{p}</svg>
  );
}

/**
 * Estado de una condición. `UNKNOWN` tiene tratamiento propio a propósito:
 * ni verde ni rojo. Colapsarlo a uno de los dos afirmaría algo que nadie
 * comprobó, y es el error que este visor existe para no cometer.
 */
export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const map: Record<string, string> = {
    OK: 'border-ok/40 text-ok',
    WARNING: 'border-warn/45 text-warn',
    BLOCKED: 'border-bad/45 text-bad',
    UNKNOWN: 'border-dashed border-graphite-400 text-graphite-600',
  };
  const kind: Record<string, 'ok' | 'warn' | 'bad' | 'unknown'> =
    { OK: 'ok', WARNING: 'warn', BLOCKED: 'bad', UNKNOWN: 'unknown' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-[3px] border bg-sheet px-1.5 py-0.5 text-[11px] font-medium ${map[status] ?? map.UNKNOWN}`}>
      {children ?? <Mark kind={kind[status] ?? 'unknown'} />}
    </span>
  );
}

/** Nota al pie de una cifra que no es una medición directa. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-2 font-serif text-[12px] leading-relaxed text-graphite-500">
      <span className="mt-[9px] inline-block h-px w-2.5 shrink-0 bg-graphite-400" />
      <span>{children}</span>
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="relative px-4 py-6 text-center text-[13px] text-graphite-600">
      <div className="hatch absolute inset-0 opacity-25" aria-hidden />
      <span className="relative bg-sheet px-2">{children}</span>
    </div>
  );
}

/** Ausencia de dato, dicha en vez de dibujada como un cero. Lleva el signo del mapa. */
export function NoSource({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-dashed border-graphite-400 px-1.5 py-0.5 text-[11px] text-graphite-600">
      <span className="hatch inline-block h-2.5 w-2.5" aria-hidden />
      sin fuente
      {children ? <span className="text-graphite-500">· {children}</span> : null}
    </span>
  );
}

/**
 * El sello de la salida consultiva (CON-05). Es la única marca que el concepto
 * estampa sobre sí mismo, y la tinta violeta no aparece en ningún otro sitio
 * salvo donde el documento certifica un límite.
 */
export function Stamp({ compact = false }: { compact?: boolean }) {
  return (
    <span
      data-uri="stamp"
      title="Ninguna salida del sistema es vinculante. No sustituye inspección estructural, licencias ni el POT."
      className="animate-stamp inline-flex select-none flex-col items-center border-[2.5px] border-stamp px-[3px] py-[3px] text-stamp mix-blend-multiply"
      style={{ filter: 'url(#stamp-ink)' }}
    >
      <span className="flex flex-col items-center border border-stamp px-3 py-1">
        <span className={`letterhead leading-none ${compact ? 'text-[10px]' : 'text-[13px]'}`}>Salida consultiva</span>
        {!compact && (
          <span className="mt-1 text-[8.5px] font-semibold tracking-[0.18em] uppercase">no vinculante</span>
        )}
      </span>
    </span>
  );
}

/** El filtro de tinta del sello: una sola definición, referida por url(). */
export function InkDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <filter id="stamp-ink" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.85 1.12" result="speck" />
        <feComposite in="SourceGraphic" in2="speck" operator="in" />
      </filter>
    </svg>
  );
}

/**
 * Cuántas fuentes independientes sostienen una afirmación. Con soporte, los
 * miembros van tensos; sin soporte, la línea cuelga floja y se dice.
 */
export function Support({ sources }: { sources: string[] }) {
  const n = sources.length;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-graphite-500">
      {n > 0 ? (
        <svg width={8 + n * 6} height="10" aria-hidden className="shrink-0 text-toner">
          <path d={`M1 9H${7 + n * 6}`} stroke="currentColor" strokeWidth="1.2" />
          {sources.map((_, i) => (
            <path key={i} d={`M${4 + i * 6} 9V2`} stroke="currentColor" strokeWidth="1.2" />
          ))}
        </svg>
      ) : (
        <svg width="26" height="10" aria-hidden className="shrink-0 text-graphite-400">
          <path d="M1 2Q13 14 25 2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" fill="none" />
        </svg>
      )}
      {n === 0 ? 'sin soporte independiente'
        : `${n === 1 ? 'una fuente' : `${n} fuentes`} · ${sources.join(' · ')}`}
    </span>
  );
}

/**
 * Una consideración del concepto: número al margen, texto en la voz del
 * documento, su soporte debajo. Señalarla dibuja su referencia en el anexo.
 */
export function Consideration({ n, children, sources, active, onPoint, stamp = false }: {
  n: number; children: ReactNode; sources: string[];
  active?: boolean; onPoint?: (on: boolean) => void; stamp?: boolean;
}) {
  return (
    <li
      data-uri="consideration"
      data-active={active ? 'true' : 'false'}
      tabIndex={onPoint ? 0 : undefined}
      onMouseEnter={() => onPoint?.(true)}
      onMouseLeave={() => onPoint?.(false)}
      onFocus={() => onPoint?.(true)}
      onBlur={() => onPoint?.(false)}
      className={[
        'group relative grid grid-cols-[28px_1fr] gap-x-2 py-3 outline-none',
        onPoint ? 'cursor-default' : '',
      ].join(' ')}
    >
      <span className={[
        'num mt-[2px] h-[22px] w-[22px] text-center text-[12.5px] leading-[22px] font-bold transition-colors duration-200',
        active ? (stamp ? 'bg-stamp text-sheet' : 'bg-toner text-sheet') : (stamp ? 'text-stamp' : 'text-toner'),
      ].join(' ')}>{n}</span>
      <div>
        <p className="font-serif text-[15.5px] leading-[1.5] text-toner [text-wrap:pretty]">{children}</p>
        <div className="mt-1.5"><Support sources={sources} /></div>
      </div>
    </li>
  );
}
