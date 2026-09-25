import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  IS_STATIC, loadCore, loadDetail, loadDetails, loadLayer, loadSentinel, loadSources,
  loadTerritory, type LayerName, type SentinelIndex,
} from '../data';
import type { Theme } from '../lib/mapstyle';
import type { BBox } from '../lib/place';
import type {
  GeoJSON, Opportunity, Provenance, Site, SiteDetail, Source, Territory,
} from '../types';

/** La barra de capas del mockup: cinco maneras de mirar el mismo lugar. */
export type LayerKey = 'territorio' | 'dano' | 'poblacion' | 'espacio' | 'equipamientos';
/** Lo que se abre desde la tarjeta del lugar. */
export type PanelKey = 'evidencia' | 'entorno' | 'intervenciones' | 'verificacion';
export type OverlayKey = 'fuentes' | 'ayuda' | 'guardadas';

export type CameraTarget =
  | { kind: 'site'; siteId: string; zoom?: number }
  | { kind: 'bbox'; bbox: BBox }
  | { kind: 'point'; lngLat: [number, number]; zoom: number }
  | { kind: 'home' };

const LAYER_NEEDS: Record<LayerKey, LayerName[]> = {
  territorio: [],
  dano: ['evidence'],
  poblacion: ['population', 'catchments'],
  espacio: ['municipal_public_space', 'green'],
  equipamientos: ['municipal_facilities', 'facilities'],
};
/** Lo que la tarjeta del lugar necesita para contar el entorno. */
const NEARBY_LAYERS: LayerName[] = ['municipal_public_space', 'green', 'municipal_facilities', 'facilities'];

/* ── Borradores del analista: solo en este navegador ─────────────────── */

export interface VerificationDraft { checked: string[]; question: string; hypotheses: string[] }
export interface SavedComparison { siteId: string; pair: string[]; at: string }
interface Local {
  comparisons: Record<string, string[]>;
  saved: SavedComparison[];
  verification: Record<string, VerificationDraft>;
}
const LOCAL_KEY = 'rebuild.analista.v1';
const LEGACY_KEY = 'recovery.analista.v1';
const EMPTY_LOCAL: Local = { comparisons: {}, saved: [], verification: {} };

function readLocal(): Local {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    return raw ? { ...EMPTY_LOCAL, ...(JSON.parse(raw) as Partial<Local>) } : EMPTY_LOCAL;
  } catch {
    return EMPTY_LOCAL;
  }
}
function writeLocal(l: Local) {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(l)); } catch { /* sin almacenamiento: se trabaja igual */ }
}

/* ── Ajustes del analista (popover de la barra inferior) ─────────────── */

export type ThemePref = 'system' | 'light' | 'dark';
export interface Settings { theme: ThemePref; radius: number; veil: boolean }
const SETTINGS_KEY = 'rebuild.ajustes.v1';
/** El radio del entorno se elige entre tres caminatas, no con un número libre. */
export const RADII = [300, 500, 800] as const;
const DEFAULT_SETTINGS: Settings = { theme: 'system', radius: 500, veil: true };

function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const s = raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
    return { ...s, radius: (RADII as readonly number[]).includes(s.radius) ? s.radius : 500 };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/* ── Enlace profundo: #sitio=site_0028&panel=intervenciones&capa=dano ── */

const PANELS: PanelKey[] = ['evidencia', 'entorno', 'intervenciones', 'verificacion'];
const LAYERS: LayerKey[] = ['territorio', 'dano', 'poblacion', 'espacio', 'equipamientos'];
function readHash() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const panel = p.get('panel') as PanelKey | null;
  const capa = p.get('capa') as LayerKey | null;
  return {
    site: p.get('sitio'),
    panel: panel && PANELS.includes(panel) ? panel : null,
    layer: capa && LAYERS.includes(capa) ? capa : null,
  };
}

interface Store {
  provenance: Provenance;
  sites: Site[];
  siteById: Map<string, Site>;
  oppBySite: Map<string, Opportunity>;
  details: Record<string, SiteDetail>;
  sources: Source[];
  territory: Territory | null;
  sentinel: SentinelIndex | null;
  layers: Partial<Record<LayerName, GeoJSON>>;
  requestLayers: (names: LayerName[]) => void;

  layer: LayerKey; setLayer: (l: LayerKey) => void;
  selectedSiteId: string | null;
  selectSite: (id: string | null, opts?: { fly?: boolean }) => void;
  panel: PanelKey | null; openPanel: (p: PanelKey | null) => void;
  overlay: OverlayKey | null; setOverlay: (o: OverlayKey | null) => void;

  camera: (CameraTarget & { nonce: number }) | null;
  fly: (t: CameraTarget) => void;

  pairFor: (siteId: string) => string[] | null;
  setPair: (siteId: string, pair: string[]) => void;
  saved: SavedComparison[];
  saveComparison: (siteId: string, pair: string[]) => void;
  removeSaved: (siteId: string) => void;
  draftFor: (siteId: string) => VerificationDraft | null;
  setDraft: (siteId: string, d: VerificationDraft) => void;
  verificationDrafts: Record<string, VerificationDraft>;

  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  /** El tema efectivo, ya resuelto contra el del sistema. */
  theme: Theme;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera del provider');
  return s;
}

interface Core { sites: Site[]; provenance: Provenance; opportunities: Opportunity[] }

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useRef(readHash());
  const [core, setCore] = useState<Core | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SiteDetail>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [territory, setTerritory] = useState<Territory | null>(null);
  const [sentinel, setSentinel] = useState<SentinelIndex | null>(null);
  const [layers, setLayers] = useState<Partial<Record<LayerName, GeoJSON>>>({});

  const [layer, setLayer] = useState<LayerKey>(
    initial.current.layer
      ?? (initial.current.panel === 'evidencia' ? 'dano' : initial.current.panel === 'entorno' ? 'espacio' : 'territorio'),
  );
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(initial.current.site);
  const [panel, setPanel] = useState<PanelKey | null>(initial.current.panel);
  const [overlay, setOverlay] = useState<OverlayKey | null>(null);
  const [camera, setCamera] = useState<(CameraTarget & { nonce: number }) | null>(
    initial.current.site ? { kind: 'site', siteId: initial.current.site, nonce: 1 } : null,
  );
  const [local, setLocal] = useState<Local>(readLocal);
  const [settings, setSettingsState] = useState<Settings>(readSettings);
  const [systemDark, setSystemDark] = useState(prefersDark);
  const theme: Theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d121d' : '#f6f4ee');
  }, [theme]);

  useEffect(() => {
    loadCore().then(setCore).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!core) return;
    loadTerritory().then(setTerritory).catch(() => setTerritory(null));
    loadSources().then(setSources).catch(() => {});
    loadSentinel().then(setSentinel).catch(() => {});
    if (IS_STATIC) loadDetails().then(setDetails).catch(() => {});
  }, [core]);

  /* Cada capa se pide una vez. El `ref` y no el estado es lo que lo garantiza
     bajo StrictMode, que invoca dos veces los actualizadores. */
  const requested = useRef(new Set<LayerName>());
  const requestLayers = useCallback((names: LayerName[]) => {
    for (const name of names) {
      if (requested.current.has(name)) continue;
      requested.current.add(name);
      loadLayer(name)
        .then((gj) => setLayers((p) => ({ ...p, [name]: gj })))
        .catch(() => setLayers((p) => ({ ...p, [name]: { type: 'FeatureCollection', features: [] } })));
    }
  }, []);

  useEffect(() => {
    if (!core) return;
    requestLayers(['admin_areas', ...LAYER_NEEDS[layer]]);
  }, [core, layer, requestLayers]);

  useEffect(() => {
    if (!core || !selectedSiteId) return;
    requestLayers([...NEARBY_LAYERS, 'catchments']);
    /* En vivo no hay details.json: el detalle se pide por sitio. */
    if (!IS_STATIC && !details[selectedSiteId]) {
      loadDetail(selectedSiteId)
        .then((d) => setDetails((p) => ({ ...p, [selectedSiteId]: d })))
        .catch(() => {});
    }
  }, [core, selectedSiteId, details, requestLayers]);

  /* La URL dice qué se está mirando: se puede enviar el enlace de un lugar. */
  useEffect(() => {
    const p = new URLSearchParams();
    if (selectedSiteId) p.set('sitio', selectedSiteId);
    if (selectedSiteId && panel) p.set('panel', panel);
    if (layer !== 'territorio') p.set('capa', layer);
    const hash = p.toString();
    const next = hash ? `#${hash}` : window.location.pathname + window.location.search;
    if (window.location.hash.slice(1) !== hash) window.history.replaceState(null, '', next);
  }, [selectedSiteId, panel, layer]);

  const nonce = useRef(1);
  const fly = useCallback((t: CameraTarget) => {
    nonce.current += 1;
    setCamera({ ...t, nonce: nonce.current });
  }, []);

  /* Un enlace pegado o el botón «atrás» cambian el hash sin recargar. Las
     escrituras propias usan replaceState, que no dispara este evento. */
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      setSelectedSiteId(h.site);
      setPanel(h.site ? h.panel : null);
      setLayer(h.layer ?? (h.panel === 'evidencia' ? 'dano' : h.panel === 'entorno' ? 'espacio' : 'territorio'));
      if (h.site) fly({ kind: 'site', siteId: h.site });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [fly]);

  const updateLocal = useCallback((fn: (l: Local) => Local) => {
    setLocal((prev) => {
      const next = fn(prev);
      writeLocal(next);
      return next;
    });
  }, []);

  const oppBySite = useMemo(
    () => new Map((core?.opportunities ?? []).map((o) => [o.site_id, o])), [core],
  );
  const siteById = useMemo(() => new Map((core?.sites ?? []).map((s) => [s.site_id, s])), [core]);

  if (error) return <Failure message={error} />;
  if (!core) return <Booting />;

  const store: Store = {
    provenance: core.provenance,
    sites: core.sites,
    siteById,
    oppBySite,
    details, sources, territory, sentinel, layers, requestLayers,
    layer, setLayer,
    selectedSiteId,
    selectSite: (id, opts) => {
      setSelectedSiteId(id && siteById.has(id) ? id : null);
      if (!id) setPanel(null);
      if (id && opts?.fly !== false) fly({ kind: 'site', siteId: id });
    },
    panel,
    openPanel: (p) => {
      setPanel(p);
      /* Cada panel mira el lugar con la capa que lo explica. */
      if (p === 'evidencia') setLayer('dano');
      if (p === 'entorno') setLayer('espacio');
      if (p && selectedSiteId) fly({ kind: 'site', siteId: selectedSiteId, zoom: p === 'entorno' ? 15.4 : 16 });
    },
    overlay, setOverlay,
    camera, fly,
    pairFor: (id) => local.comparisons[id] ?? null,
    setPair: (id, pair) => updateLocal((l) => ({ ...l, comparisons: { ...l.comparisons, [id]: pair } })),
    saved: local.saved,
    saveComparison: (id, pair) => updateLocal((l) => ({
      ...l,
      saved: [{ siteId: id, pair, at: new Date().toISOString() }, ...l.saved.filter((s) => s.siteId !== id)],
    })),
    removeSaved: (id) => updateLocal((l) => ({ ...l, saved: l.saved.filter((s) => s.siteId !== id) })),
    draftFor: (id) => local.verification[id] ?? null,
    setDraft: (id, d) => updateLocal((l) => ({ ...l, verification: { ...l.verification, [id]: d } })),
    verificationDrafts: local.verification,
    settings,
    setSettings: (s) => setSettingsState((prev) => {
      const next = { ...prev, ...s };
      try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      return next;
    }),
    theme,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function Booting() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <p className="font-serif text-[34px] font-semibold tracking-tight text-ink">REBUILD</p>
      <p className="text-[15px] text-ink-2">Recuperación urbana para ciudades más vivas</p>
      <div className="mt-2 h-px w-40 overflow-hidden bg-rule">
        <div className="h-full w-1/3 animate-[load_1.1s_ease-in-out_infinite] bg-cobalt" />
      </div>
      <p className="kicker mt-1">Cargando el sector de estudio · Pereira</p>
      <style>{'@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-paper p-8 text-center">
      <div className="float max-w-md p-6">
        <p className="font-serif text-xl font-semibold">No se pudieron cargar los datos</p>
        <p className="mt-2 text-sm text-ink-2">{message}</p>
        <p className="mt-3 text-[13px] text-ink-3">
          En el despliegue estático los datos viven en <code>data/</code>; montado sobre la API, en{' '}
          <code>/api/v1</code>.
        </p>
      </div>
    </div>
  );
}
