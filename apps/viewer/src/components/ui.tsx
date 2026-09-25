import { useEffect, useRef, type ReactNode } from 'react';
import type { Site } from '../types';
import { useStore } from '../state/store';
import { placeName } from '../lib/place';
import { Icon } from './icons';

/** Aviso ámbar del mockup: «Sin validar en campo». */
export function AmberBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-amber-50 px-2 py-1 text-[12.5px] font-semibold text-amber-900">
      <span className="size-2 rounded-full bg-amber" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Un dato que no existe se dice, con el rayado de "sin dato", nunca con un cero. */
export function Missing({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-3">
      <span className="hatch inline-block h-3 w-5 rounded-[2px] border border-unknown/40" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`kicker ${className}`}>{children}</p>;
}

/** Fila de la tarjeta: icono, título, dos líneas, y a la derecha un aviso opcional. */
export function InfoRow({
  icon, title, lines, aside,
}: { icon: ReactNode; title: string; lines: ReactNode[]; aside?: ReactNode }) {
  return (
    <div data-uri="place-row" className="grid grid-cols-[28px_1fr_auto] gap-x-3 border-t border-rule py-3.5 first:border-t-0">
      <span className="pt-0.5 text-ink-2">{icon}</span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug text-ink">{title}</p>
        {lines.filter(Boolean).map((l, i) => (
          <p key={i} className={`text-[13.5px] leading-snug ${i === 0 ? 'text-ink-2' : 'text-ink-3'}`}>{l}</p>
        ))}
      </div>
      {aside && <div className="self-start">{aside}</div>}
    </div>
  );
}

/** Pereira › Comuna › Barrio. El camino de vuelta al lugar. */
export function Crumbs({ site, tail }: { site: Site; tail?: string }) {
  const { openPanel } = useStore();
  return (
    <nav aria-label="Ubicación" className="flex flex-wrap items-center gap-1.5 pr-10 text-[14px] text-ink-2">
      <span>Pereira</span>
      {site.commune && site.neighborhood && (<><Icon.Next size={14} className="text-ink-3" /><span>{site.commune}</span></>)}
      <Icon.Next size={14} className="text-ink-3" />
      <button type="button" className="link font-semibold" onClick={() => openPanel(null)}>
        {placeName(site)}
      </button>
      {tail && (<><Icon.Next size={14} className="text-ink-3" /><span className="text-ink">{tail}</span></>)}
    </nav>
  );
}

/**
 * Hoja flotante sobre el mapa. `wide` es la mesa de comparación y el cuaderno
 * de verificación: el mapa sigue detrás, pero la lectura manda.
 */
export function Sheet({
  label, wide = false, onClose, children, footer, id,
}: {
  label: string; wide?: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; id: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      data-uri="panel"
      data-panel={id}
      className={`float animate-slide-in pointer-events-auto absolute inset-x-2 top-2 bottom-[72px] z-20 flex flex-col overflow-hidden outline-none md:inset-x-auto md:top-3 md:right-3 md:bottom-[84px] ${
        wide ? 'md:left-3 xl:left-auto xl:w-[1060px]' : 'md:w-[540px]'
      }`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar y volver al mapa"
        className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-wash hover:text-ink"
      >
        <Icon.Close size={20} />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </section>
  );
}

/** Estado de una condición: lo que se sabe, lo que falta, lo que bloquea. */
export function StatusDot({ status }: { status: 'OK' | 'WARNING' | 'BLOCKED' | 'UNKNOWN' }) {
  if (status === 'UNKNOWN') {
    return <span className="hatch inline-block size-3 shrink-0 rounded-full border border-unknown/60" aria-hidden="true" />;
  }
  const color = status === 'OK' ? 'bg-ok' : status === 'WARNING' ? 'bg-amber' : 'bg-bad';
  return <span className={`inline-block size-3 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

export const STATUS_WORD: Record<string, string> = {
  OK: 'Se cumple',
  WARNING: 'Con reservas',
  BLOCKED: 'No se cumple',
  UNKNOWN: 'Sin dato',
};
