import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  IS_STATIC, loadAlerts, loadCore, loadCoverage, loadDetails, loadLayer, loadSentinel,
  loadSources, loadTerrain, type LayerName, type SentinelScene, type TerrainIndex,
} from '../data';
import { contextByKey, discriminationOf, type Discrimination } from '../lib/contexts';
import type { ContextKey } from '../lib/palette';
import type {
  Alert, Coverage, GeoJSON, Opportunity, Provenance, Scenario, Site, SiteDetail, Source, ViewKey,
} from '../types';

interface Store {
  provenance: Provenance;
  sites: Site[];
  siteById: Map<string, Site>;
  opportunities: Opportunity[];
  oppBySite: Map<string, Opportunity>;
  scenarios: Scenario[];
  details: Record<string, SiteDetail>;
  sources: Source[];
  alerts: Alert[];
  layers: Partial<Record<LayerName, GeoJSON>>;
  terrain: TerrainIndex | null;
  sentinel: SentinelScene[];

  view: ViewKey; setView: (v: ViewKey) => void;
  context: ContextKey; setContext: (c: ContextKey) => void;

  selectedSiteId: string | null;
  selectSite: (id: string | null) => void;
  hoverSiteId: string | null; setHoverSiteId: (id: string | null) => void;

  scenarioId: string; setScenarioId: (id: string) => void;
  scenario: Scenario | null;
  coverage: Coverage | null;
  showRelief: boolean; setShowRelief: (v: boolean) => void;
  showTerrain: boolean; setShowTerrain: (v: boolean) => void;

  compare: string[]; toggleCompare: (id: string) => void; clearCompare: () => void;
  technical: boolean; setTechnical: (v: boolean) => void;
  query: string; setQuery: (q: string) => void;
  onlyBuildable: boolean; setOnlyBuildable: (v: boolean) => void;

  visibleOpportunities: Opportunity[];
  discrimination: Discrimination;
  isStatic: boolean;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera del provider');
  return s;
}

interface Core {
  sites: Site[]; provenance: Provenance; opportunities: Opportunity[]; scenarios: Scenario[];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [core, setCore] = useState<Core | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [details, setDetails] = useState<Record<string, SiteDetail>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [layers, setLayers] = useState<Partial<Record<LayerName, GeoJSON>>>({});
  const [terrain, setTerrain] = useState<TerrainIndex | null>(null);
  const [sentinel, setSentinel] = useState<SentinelScene[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);

  const [view, setView] = useState<ViewKey>('situacion');
  const [context, setContext] = useState<ContextKey>('SITUACION');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [hoverSiteId, setHoverSiteId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState('');
  const [showRelief, setShowRelief] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [technical, setTechnical] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyBuildable, setOnlyBuildable] = useState(false);

  useEffect(() => {
    loadCore()
      .then((c) => {
        setCore(c);
        if (c.scenarios.length) setScenarioId(c.scenarios[0].scenario_id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  /* Lo secundario llega después de que el mapa ya pinta algo. */
  useEffect(() => {
    if (!core) return;
    loadSources().then(setSources).catch(() => {});
    loadAlerts().then(setAlerts).catch(() => {});
    loadTerrain().then(setTerrain).catch(() => {});
    loadSentinel().then(setSentinel).catch(() => {});
    if (IS_STATIC) loadDetails().then(setDetails).catch(() => {});
  }, [core]);

  /** Las capas se piden una vez y solo cuando un contexto las enciende.
   *  El `ref` es lo que garantiza "una vez": bajo StrictMode el actualizador
   *  de estado se invoca dos veces y un guard dentro de él dispararía dos
   *  descargas de 4,5 MB. */
  const requested = useRef(new Set<LayerName>());
  const requestLayers = useCallback((names: LayerName[]) => {
    for (const name of names) {
      if (requested.current.has(name)) continue;
      requested.current.add(name);
      loadLayer(name)
        .then((gj) => setLayers((p) => ({ ...p, [name]: gj })))
        .catch(() => setLayers((p) => ({
          ...p, [name]: { type: 'FeatureCollection', features: [] } as GeoJSON,
        })));
    }
  }, []);

  /* El contexto activo decide qué capas hacen falta, incluido el inicial. */
  useEffect(() => {
    if (!core) return;
    requestLayers(['sites', ...contextLayers(context)]);
  }, [core, context, requestLayers]);

  const scenario = useMemo(
    () => core?.scenarios.find((s) => s.scenario_id === scenarioId) ?? null,
    [core, scenarioId],
  );

  useEffect(() => {
    if (!scenarioId) return;
    let alive = true;
    loadCoverage(scenarioId)
      .then((c) => { if (alive) setCoverage(c ?? null); })
      .catch(() => { if (alive) setCoverage(null); });
    return () => { alive = false; };
  }, [scenarioId]);

  /* Se mide con los mismos valores que pinta el mapa, no con otros. */
  const discrimination = useMemo(() => {
    const def = contextByKey(context);
    const sites = core?.sites ?? [];
    const byId = new Map((core?.opportunities ?? []).map((o) => [o.site_id, o]));
    return discriminationOf(sites.map((s) => def.value(s, byId.get(s.site_id))));
  }, [core, context]);

  const oppBySite = useMemo(
    () => new Map((core?.opportunities ?? []).map((o) => [o.site_id, o])),
    [core],
  );
  const siteById = useMemo(
    () => new Map((core?.sites ?? []).map((s) => [s.site_id, s])),
    [core],
  );

  const visibleOpportunities = useMemo(() => {
    let list = [...(core?.opportunities ?? [])];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        [o.opportunity_id, o.site_id, o.intervention_label, o.problem.headline, ...o.problem.drivers]
          .join(' ').toLowerCase().includes(q));
    }
    if (onlyBuildable) list = list.filter((o) => !o.blocked && o.intervention !== 'NO_BUILD');
    return list.sort((a, b) => b.suitability - a.suitability);
  }, [core, query, onlyBuildable]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <p className="font-semibold text-bad">No se pudieron cargar los datos</p>
          <p className="mt-2 text-sm text-mute-300">{error}</p>
          <p className="mt-3 text-xs text-mute-400">
            En el despliegue estático los datos viven en <code>data/</code>; montado sobre la API,
            en <code>/api/v1</code>.
          </p>
        </div>
      </div>
    );
  }
  if (!core) return <Booting />;

  const store: Store = {
    provenance: core.provenance,
    sites: core.sites,
    siteById,
    opportunities: core.opportunities,
    oppBySite,
    scenarios: core.scenarios,
    details, sources, alerts, layers, terrain, sentinel,
    view, setView,
    context, setContext,
    selectedSiteId,
    selectSite: setSelectedSiteId,
    hoverSiteId, setHoverSiteId,
    scenarioId, setScenarioId, scenario, coverage,
    showRelief, setShowRelief,
    showTerrain, setShowTerrain,
    compare,
    toggleCompare: (id) => setCompare((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]),
    clearCompare: () => setCompare([]),
    technical, setTechnical,
    query, setQuery,
    onlyBuildable, setOnlyBuildable,
    visibleOpportunities,
    discrimination,
    isStatic: IS_STATIC,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/* Importado de forma perezosa para no crear un ciclo con contexts.ts. */
function contextLayers(key: ContextKey): LayerName[] {
  const map: Record<ContextKey, LayerName[]> = {
    SITUACION: ['buildings', 'roads', 'evidence', 'population'],
    DANO: ['buildings', 'evidence'],
    NECESIDAD: ['roads', 'catchments', 'population'],
    DEFICIT: ['green', 'roads'],
    ACCESO: ['roads', 'facilities', 'catchments'],
    OPORTUNIDADES: ['roads', 'green'],
  };
  return map[key];
}

function Booting() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="h-px w-40 overflow-hidden bg-ink-700">
        <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] bg-accent" />
      </div>
      <p className="text-xs tracking-[0.18em] text-mute-400 uppercase">Cargando territorio</p>
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
