import { useEffect, useMemo, useRef, useState } from 'react';
import { fold } from '../lib/format';
import { bboxOf, placeName, type BBox } from '../lib/place';
import { useStore } from '../state/store';
import { Icon } from './icons';

type Hit =
  | { kind: 'sitio'; id: string; label: string; sub: string }
  | { kind: 'barrio' | 'comuna'; label: string; sub: string; bbox: BBox; firstSite: string | null }
  | { kind: 'hito'; label: string; sub: string; lngLat: [number, number] };

const GROUP: Record<Hit['kind'], string> = {
  barrio: 'Barrios', comuna: 'Comunas', sitio: 'Sitios', hito: 'Lugares de referencia',
};

export function Header() {
  const { setOverlay, saved, verificationDrafts } = useStore();
  const drafts = Object.keys(verificationDrafts).length;
  const kept = saved.length + drafts;
  return (
    <header className="relative z-40 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule bg-card px-3 py-2.5 md:h-[68px] md:flex-nowrap md:gap-6 md:px-6 md:py-0">
      <a href="#" className="flex shrink-0 items-baseline gap-4 text-ink no-underline" aria-label="RECOVERY, inicio">
        <span className="font-serif text-[26px] leading-none font-semibold tracking-tight md:text-[32px]">RECOVERY</span>
        <span className="hidden text-[14px] leading-[1.15] text-ink-2 lg:block">
          Recuperación urbana<br />para ciudades más vivas
        </span>
      </a>
      <SearchBox />
      <nav className="ml-auto flex shrink-0 items-center gap-1 md:gap-2" aria-label="Utilidades">
        <button type="button" className="rounded px-2 py-2 text-[15px] text-ink hover:bg-wash md:px-3" onClick={() => setOverlay('fuentes')}>
          Fuentes
        </button>
        <button type="button" className="hidden rounded px-3 py-2 text-[15px] text-ink hover:bg-wash sm:block" onClick={() => setOverlay('guardadas')}>
          Guardadas{kept ? <span className="ml-1.5 rounded-full bg-cobalt-50 px-1.5 text-[12.5px] font-semibold text-cobalt">{kept}</span> : null}
        </button>
        <button type="button" className="rounded px-2 py-2 text-[15px] text-ink hover:bg-wash md:px-3" onClick={() => setOverlay('ayuda')}>
          Ayuda
        </button>
      </nav>
    </header>
  );
}

function SearchBox() {
  const { sites, layers, requestLayers, selectSite, fly } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const index = useMemo<Hit[]>(() => {
    const hits: Hit[] = [];
    const siteCount = new Map<string, string[]>();
    for (const s of sites) {
      if (s.neighborhood) siteCount.set(s.neighborhood, [...(siteCount.get(s.neighborhood) ?? []), s.site_id]);
    }
    const communeSites = new Map<string, string[]>();
    for (const s of sites) {
      if (s.commune) communeSites.set(s.commune, [...(communeSites.get(s.commune) ?? []), s.site_id]);
    }
    for (const f of layers.admin_areas?.features ?? []) {
      const level = Number(f.properties.admin_level);
      const name = String(f.properties.display_name ?? '');
      if (!name || (level !== 8 && level !== 9)) continue;
      const own = (level === 9 ? siteCount : communeSites).get(name) ?? [];
      hits.push({
        kind: level === 9 ? 'barrio' : 'comuna',
        label: name,
        sub: own.length ? `${own.length} ${own.length === 1 ? 'sitio' : 'sitios'} con evidencia` : 'sin sitios con evidencia',
        bbox: bboxOf(f),
        firstSite: level === 9 ? own.sort()[0] ?? null : null,
      });
    }
    for (const s of sites) {
      hits.push({
        kind: 'sitio',
        id: s.site_id,
        label: `${placeName(s)} · ${s.site_id.replace('site_', 'sitio ')}`,
        sub: s.corner_label ?? s.commune ?? '',
      });
    }
    for (const f of layers.landmarks?.features ?? []) {
      const name = f.properties.display_name;
      if (!name) continue;
      hits.push({
        kind: 'hito',
        label: String(name),
        sub: 'OpenStreetMap',
        lngLat: f.geometry.coordinates as [number, number],
      });
    }
    return hits;
  }, [sites, layers.admin_areas, layers.landmarks]);

  const results = useMemo(() => {
    const k = fold(q);
    if (k.length < 2) return [];
    const scored = index
      .map((h) => {
        const hay = fold(`${h.label} ${h.sub}`);
        const at = fold(h.label).indexOf(k);
        return { h, rank: at === 0 ? 0 : at > 0 ? 1 : hay.includes(k) ? 2 : 9 };
      })
      .filter((x) => x.rank < 9);
    const order: Hit['kind'][] = ['barrio', 'sitio', 'comuna', 'hito'];
    return order.flatMap((kind) =>
      scored.filter((x) => x.h.kind === kind).sort((a, b) => a.rank - b.rank || a.h.label.localeCompare(b.h.label))
        .slice(0, 5).map((x) => x.h));
  }, [q, index]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (h: Hit) => {
    setOpen(false);
    setQ(h.label);
    if (h.kind === 'sitio') selectSite(h.id);
    else if (h.kind === 'barrio' && h.firstSite) selectSite(h.firstSite);
    else if (h.kind === 'hito') fly({ kind: 'point', lngLat: h.lngLat, zoom: 16 });
    else fly({ kind: 'bbox', bbox: h.bbox });
  };

  return (
    <div ref={box} className="relative order-last min-w-0 basis-full md:order-none md:flex-1 md:basis-auto md:max-w-[480px]">
      <label className="flex h-11 items-center gap-3 rounded-[4px] border border-rule-2 bg-card px-3 focus-within:border-cobalt md:h-12 md:px-4">
        <Icon.Search size={20} className="shrink-0 text-ink-2" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); requestLayers(['admin_areas', 'landmarks']); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && results[active]) choose(results[active]);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Buscar lugar o sitio"
          aria-label="Buscar lugar o sitio"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-3"
        />
      </label>
      {open && q.trim().length >= 2 && (
        <div id="search-results" role="listbox" className="float absolute inset-x-0 top-[calc(100%+6px)] max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <p className="px-4 py-3 text-[14px] text-ink-3">
              Nada con ese nombre en el sector de estudio. El mapa cubre parte de Pereira, no toda la ciudad.
            </p>
          )}
          {results.map((h, i) => (
            <div key={`${h.kind}-${h.label}-${i}`}>
              {(i === 0 || results[i - 1].kind !== h.kind) && (
                <p className="kicker px-4 pt-2 pb-1">{GROUP[h.kind]}</p>
              )}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(h)}
                className={`block w-full px-4 py-2 text-left ${i === active ? 'bg-cobalt-50' : ''}`}
              >
                <span className="block text-[15px] font-semibold text-ink">{h.label}</span>
                <span className="block text-[13px] text-ink-3">{h.sub}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
