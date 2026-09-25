import { MotionConfig, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import { cn } from '../lib/cn';
import { fold } from '../lib/format';
import { bboxOf, placeName, type BBox } from '../lib/place';
import { HelpContent, SavedContent, SourcesContent } from '../panels/Dialogs';
import { RADII, useStore, type OverlayKey, type ThemePref } from '../state/store';
import { Icon } from './icons';
import { AnimatedBackground } from './motion-primitives/animated-background';
import {
  MorphingDialog, MorphingDialogClose, MorphingDialogContainer, MorphingDialogContent,
  MorphingDialogTitle, MorphingDialogTrigger,
} from './motion-primitives/morphing-dialog';
import {
  MorphingPopover, MorphingPopoverContent, MorphingPopoverTrigger,
} from './motion-primitives/morphing-popover';

/**
 * La barra de REBUILD, abajo y al centro: el mapa se queda con toda la altura.
 * Sigue el patrón de Toolbar Dynamic de motion-primitives: en reposo muestra
 * la marca y las utilidades; al buscar, la barra se ensancha con un muelle y
 * se vuelve un campo de búsqueda, con los resultados hacia arriba.
 */
const SPRING = { type: 'spring' as const, bounce: 0.1, duration: 0.3 };

type Hit =
  | { kind: 'sitio'; id: string; label: string; sub: string }
  | { kind: 'barrio' | 'comuna'; label: string; sub: string; bbox: BBox; firstSite: string | null }
  | { kind: 'hito'; label: string; sub: string; lngLat: [number, number] };

const GROUP: Record<Hit['kind'], string> = {
  barrio: 'Barrios', comuna: 'Comunas', sitio: 'Sitios', hito: 'Lugares de referencia',
};

export function Toolbar() {
  const { setOverlay, overlay } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const results = useResults(q);
  const choose = useChoose(() => { setOpen(false); setQ(''); });
  const search: SearchProps = { q, setQ, results, active, setActive, onChoose: choose };
  const [clip, setClip] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [closedWidth, setClosedWidth] = useState<number | null>(null);
  const [vw, setVw] = useState(window.innerWidth);

  useClickOutside(container, () => setOpen(false));
  useEffect(() => { if (overlay) setOpen(false); }, [overlay]);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  /* El ancho en reposo es el de su contenido: se mide, no se adivina. */
  useLayoutEffect(() => {
    if (!open && row.current) setClosedWidth(row.current.scrollWidth + 16);
  }, [open, vw]);

  const mobile = vw < 640;
  const openWidth = Math.min(560, vw - 16);
  const width = open ? openWidth : closedWidth ?? 'auto';

  return (
    <MotionConfig transition={SPRING}>
      <div
        ref={container}
        className="pointer-events-auto fixed inset-x-2 bottom-2 z-30 flex justify-center sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2"
        data-uri="toolbar"
      >
        {open && <SearchResults {...search} width={openWidth} />}
        <motion.div
          className={cn('float rounded-[12px]', clip && 'overflow-hidden')}
          animate={{ width: mobile && !open ? '100%' : width }}
          initial={false}
          onAnimationStart={() => setClip(true)}
          onAnimationComplete={() => setClip(open)}
        >
          <div className="p-1.5">
            {!open ? (
              <div ref={row} className="flex items-center gap-1 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setOverlay('ayuda')}
                  className="flex h-10 shrink-0 items-center px-2.5 font-serif text-[21px] leading-none font-semibold tracking-tight text-ink"
                  aria-label="REBUILD — qué es y cómo se lee"
                >
                  REBUILD
                </button>
                <Divider />
                <button
                  type="button"
                  data-uri="search-open"
                  onClick={() => { setOpen(true); setClip(true); }}
                  aria-label="Buscar lugar o sitio"
                  className="flex h-10 shrink-0 items-center gap-2 rounded-[8px] px-2.5 text-[14.5px] text-ink-2 hover:bg-wash hover:text-ink sm:min-w-[210px] sm:border sm:border-rule-2"
                >
                  <Icon.Search size={19} />
                  <span className="hidden sm:inline">Buscar lugar o sitio</span>
                </button>
                <Divider />
                <ToolbarDialog k="fuentes" label="Fuentes" title="Fuentes y licencias" icon={<Icon.Doc size={19} />}>
                  <SourcesContent />
                </ToolbarDialog>
                <SavedTrigger />
                <ToolbarDialog k="ayuda" label="Ayuda" title="Cómo leer REBUILD" icon={<Icon.Question size={19} />}>
                  <HelpContent />
                </ToolbarDialog>
                <Divider />
                <SettingsPopover />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Volver"
                  className="grid size-10 shrink-0 place-items-center rounded-[8px] text-ink-2 hover:bg-wash hover:text-ink"
                >
                  <Icon.Back size={20} />
                </button>
                <SearchInput {...search} />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}

const Divider = () => <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-rule sm:block" aria-hidden="true" />;

/* ── Buscar ──────────────────────────────────────────────────────────── */

function useHits(): Hit[] {
  const { sites, layers } = useStore();
  return useMemo<Hit[]>(() => {
    const hits: Hit[] = [];
    const byBarrio = new Map<string, string[]>();
    const byComuna = new Map<string, string[]>();
    for (const s of sites) {
      if (s.neighborhood) byBarrio.set(s.neighborhood, [...(byBarrio.get(s.neighborhood) ?? []), s.site_id]);
      if (s.commune) byComuna.set(s.commune, [...(byComuna.get(s.commune) ?? []), s.site_id]);
    }
    for (const f of layers.admin_areas?.features ?? []) {
      const level = Number(f.properties.admin_level);
      const name = String(f.properties.display_name ?? '');
      if (!name || (level !== 8 && level !== 9)) continue;
      const own = (level === 9 ? byBarrio : byComuna).get(name) ?? [];
      hits.push({
        kind: level === 9 ? 'barrio' : 'comuna',
        label: name,
        sub: own.length ? `${own.length} ${own.length === 1 ? 'sitio' : 'sitios'} con evidencia` : 'sin sitios con evidencia',
        bbox: bboxOf(f),
        firstSite: level === 9 ? [...own].sort()[0] ?? null : null,
      });
    }
    for (const s of sites) {
      hits.push({ kind: 'sitio', id: s.site_id, label: `${placeName(s)} · ${s.site_id.replace('site_', 'sitio ')}`, sub: s.corner_label ?? s.commune ?? '' });
    }
    for (const f of layers.landmarks?.features ?? []) {
      if (f.properties.display_name) {
        hits.push({ kind: 'hito', label: String(f.properties.display_name), sub: 'OpenStreetMap', lngLat: f.geometry.coordinates as [number, number] });
      }
    }
    return hits;
  }, [sites, layers.admin_areas, layers.landmarks]);
}

function useResults(q: string): Hit[] {
  const index = useHits();
  return useMemo(() => {
    const k = fold(q);
    if (k.length < 2) return [];
    const scored = index
      .map((h) => {
        const at = fold(h.label).indexOf(k);
        return { h, rank: at === 0 ? 0 : at > 0 ? 1 : fold(h.sub).includes(k) ? 2 : 9 };
      })
      .filter((x) => x.rank < 9);
    return (['barrio', 'sitio', 'comuna', 'hito'] as const).flatMap((kind) =>
      scored.filter((x) => x.h.kind === kind)
        .sort((a, b) => a.rank - b.rank || a.h.label.localeCompare(b.h.label))
        .slice(0, 5).map((x) => x.h));
  }, [q, index]);
}

function useChoose(onDone: () => void) {
  const { selectSite, fly } = useStore();
  return (h: Hit) => {
    onDone();
    if (h.kind === 'sitio') selectSite(h.id);
    else if (h.kind === 'barrio' && h.firstSite) selectSite(h.firstSite);
    else if (h.kind === 'hito') fly({ kind: 'point', lngLat: h.lngLat, zoom: 16 });
    else fly({ kind: 'bbox', bbox: h.bbox });
  };
}

interface SearchProps {
  q: string;
  setQ: (q: string) => void;
  results: Hit[];
  active: number;
  setActive: (i: number) => void;
  onChoose: (h: Hit) => void;
}

function SearchInput({ q, setQ, results, active, setActive, onChoose }: SearchProps) {
  const { requestLayers } = useStore();
  useEffect(() => requestLayers(['admin_areas', 'landmarks']), [requestLayers]);
  return (
    <input
      autoFocus
      value={q}
      onChange={(e) => { setQ(e.target.value); setActive(0); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(active + 1, results.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
        if (e.key === 'Enter' && results[active]) onChoose(results[active]);
      }}
      placeholder="Buscar lugar o sitio"
      aria-label="Buscar lugar o sitio"
      role="combobox"
      aria-expanded={results.length > 0}
      aria-controls="search-results"
      className="h-10 min-w-0 flex-1 rounded-[8px] border border-rule-2 bg-transparent px-3 text-[16px] text-ink placeholder:text-ink-3 focus:border-cobalt"
    />
  );
}

function SearchResults({ q, results, active, setActive, onChoose, width }: SearchProps & { width: number }) {
  if (q.trim().length < 2) return null;
  return (
    <div
      id="search-results"
      role="listbox"
      className="float animate-rise absolute bottom-[calc(100%+8px)] max-h-[55vh] overflow-y-auto rounded-[12px] py-2"
      style={{ width }}
    >
      {results.length === 0 && (
        <p className="px-4 py-3 text-[14px] text-ink-3">
          Nada con ese nombre en el sector de estudio. El mapa cubre parte de Pereira, no toda la ciudad.
        </p>
      )}
      {results.map((h, i) => (
        <div key={`${h.kind}-${h.label}-${i}`}>
          {(i === 0 || results[i - 1].kind !== h.kind) && <p className="kicker px-4 pt-2 pb-1">{GROUP[h.kind]}</p>}
          <button
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => onChoose(h)}
            className={`block w-full px-4 py-2 text-left ${i === active ? 'bg-cobalt-50' : ''}`}
          >
            <span className="block text-[15px] font-semibold text-ink">{h.label}</span>
            <span className="block text-[13px] text-ink-3">{h.sub}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Diálogos que nacen de su botón (Morphing Dialog) ───────────────── */

function ToolbarDialog({
  k, label, title, icon, badge, children,
}: { k: OverlayKey; label: string; title: string; icon: ReactNode; badge?: ReactNode; children: ReactNode }) {
  const { overlay, setOverlay } = useStore();
  return (
    <MorphingDialog
      open={overlay === k}
      onOpenChange={(o) => setOverlay(o ? k : null)}
      transition={{ type: 'spring', bounce: 0.05, duration: 0.32 }}
    >
      <MorphingDialogTrigger
        ariaLabel={title}
        className="flex h-10 shrink-0 items-center gap-2 rounded-[8px] px-2.5 text-[14.5px] text-ink hover:bg-wash"
      >
        {icon}
        <span className="hidden md:inline">{label}</span>
        {badge}
      </MorphingDialogTrigger>
      <MorphingDialogContainer>
        <MorphingDialogContent className="relative flex max-h-[84vh] w-[min(720px,calc(100vw-24px))] flex-col rounded-[10px] border border-rule bg-card text-ink shadow-2xl">
          <header className="border-b border-rule px-6 py-4 pr-16">
            <MorphingDialogTitle>
              <h2 className="font-serif text-[24px] font-semibold tracking-tight">{title}</h2>
            </MorphingDialogTitle>
          </header>
          <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>
          <MorphingDialogClose className="top-4 right-4 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-wash" />
        </MorphingDialogContent>
      </MorphingDialogContainer>
    </MorphingDialog>
  );
}

function SavedTrigger() {
  const { saved, verificationDrafts } = useStore();
  const kept = saved.length + Object.keys(verificationDrafts).length;
  return (
    <ToolbarDialog
      k="guardadas"
      label="Guardadas"
      title="Guardadas"
      icon={<Icon.Bookmark size={19} />}
      badge={kept ? <span className="rounded-full bg-cobalt-50 px-1.5 text-[12.5px] font-semibold text-cobalt">{kept}</span> : null}
    >
      <SavedContent />
    </ToolbarDialog>
  );
}

/* ── Ajustes (Morphing Popover) ─────────────────────────────────────── */

const THEMES: { key: ThemePref; label: string; icon: ReactNode }[] = [
  { key: 'system', label: 'Sistema', icon: <Icon.Monitor size={16} /> },
  { key: 'light', label: 'Claro', icon: <Icon.Sun size={16} /> },
  { key: 'dark', label: 'Oscuro', icon: <Icon.Moon size={16} /> },
];

function Segmented<T extends string | number>({
  value, options, onChange, label,
}: { value: T; options: { key: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[8px] bg-wash p-1">
      <AnimatedBackground
        defaultValue={String(value)}
        onValueChange={(id) => { const o = options.find((x) => String(x.key) === id); if (o) onChange(o.key); }}
        className="rounded-[6px] bg-card shadow-sm"
        transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
      >
        {options.map((o) => (
          <button
            key={String(o.key)}
            data-id={String(o.key)}
            type="button"
            role="radio"
            aria-checked={o.key === value}
            className="flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[13.5px] text-ink-2 data-[checked=true]:font-semibold data-[checked=true]:text-ink"
          >
            <span className="flex items-center justify-center gap-1.5">{o.icon}{o.label}</span>
          </button>
        ))}
      </AnimatedBackground>
    </div>
  );
}

function SettingsPopover() {
  const { settings, setSettings } = useStore();
  return (
    <MorphingPopover className="shrink-0">
      <MorphingPopoverTrigger
        className="flex h-10 items-center gap-2 rounded-[8px] px-2.5 text-[14.5px] text-ink hover:bg-wash"
        aria-label="Ajustes"
        data-uri="settings-open"
      >
        <Icon.Sliders size={19} />
        <span className="hidden md:inline">Ajustes</span>
      </MorphingPopoverTrigger>
      <MorphingPopoverContent className="right-0 bottom-0 z-40 w-[310px] rounded-[12px] p-4 whitespace-normal shadow-2xl" data-uri="settings">
        <p className="font-serif text-[18px] font-semibold">Ajustes</p>
        <p className="mt-0.5 text-[12.5px] text-ink-3">Se guardan solo en este navegador.</p>

        <p className="kicker mt-4 mb-1.5">Tema</p>
        <Segmented label="Tema" value={settings.theme} options={THEMES} onChange={(theme) => setSettings({ theme })} />

        <p className="kicker mt-4 mb-1.5">Radio del entorno</p>
        <Segmented
          label="Radio del entorno"
          value={settings.radius}
          options={RADII.map((r) => ({ key: r as number, label: `${r} m` }))}
          onChange={(radius) => setSettings({ radius })}
        />
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
          Cuenta espacio público y equipamientos alrededor de cada sitio. 500 m son unos 6 minutos a pie.
        </p>

        <label className="mt-4 flex items-start justify-between gap-3">
          <span>
            <span className="block text-[14px] font-semibold">Velar fuera del área de estudio</span>
            <span className="block text-[12.5px] leading-snug text-ink-3">Allí no hay evidencia; el velo lo recuerda.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.veil}
            onChange={(e) => setSettings({ veil: e.target.checked })}
            className="mt-1 size-4 shrink-0 accent-cobalt"
          />
        </label>
      </MorphingPopoverContent>
    </MorphingPopover>
  );
}
