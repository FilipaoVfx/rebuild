import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  IS_STATIC, loadAlerts, loadCore, loadCoverage, loadDetails, loadLayer, loadSentinel,
  loadSources, loadTerrain, loadTerritory, type LayerName, type SentinelIndex,
  type TerrainIndex,
} from '../data';
import type { BaseMapKey } from '../lib/basemap';
import { clusterUnreached, type UnreachedSummary } from '../lib/clusters';
import { contextByKey, discriminationOf, layersFor, type Discrimination } from '../lib/contexts';
import type { ContextKey } from '../lib/palette';
import type {
  Alert, Coverage, GeoJSON, Opportunity, Provenance, Scenario, Site, SiteDetail, Source,
  Territory, ViewKey,
} from '../types';

export type ImageryMode = 'none' | 'sentinel' | string;

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
  sentinel: SentinelIndex | null;
  territory: Territory | null;

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

  /** Tipo de mapa: cartografía base de OSM (clara u oscura) o solo datos (ADR-22 §8). */
  baseMap: BaseMapKey; setBaseMap: (b: BaseMapKey) => void;
  /** Imagen de fondo: ninguna, la cortina Sentinel o una ortofoto por `source_id`. */
  imagery: ImageryMode; setImagery: (m: ImageryMode) => void;
  imageryCollection: 's1' | 's2'; setImageryCollection: (c: 's1' | 's2') => void;
  /** Posición de la cortina antes/después, 0..1 del ancho del mapa. */
  swipe: number; setSwipe: (v: number) => void;

  /** Comuna resaltada en el mapa (osm_id), desde la lista de Territorio. */
  highlightedAdminId: number | null; setHighlightedAdminId: (id: number | null) => void;
  /** Filtro por comuna en Oportunidades (FR-UI-04). */
  communeFilter: string | null; setCommuneFilter: (c: string | null) => void;

  compare: string[]; toggleCompare: (id: string) => void; clearCompare: () => void;
  technical: boolean; setTechnical: (v: boolean) => void;
  query: string; setQuery: (q: string) => void;
  onlyBuildable: boolean; setOnlyBuildable: (v: boolean) => void;

  visibleOpportunities: Opportunity[];
  discrimination: Discrimination;
  unreached: UnreachedSummary;
  selectedClusterId: string | null; selectCluster: (id: string | null) => void;
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
  const [sentinel, setSentinel] = useState<SentinelIndex | null>(null);
  const [territory, setTerritory] = useState<Territory | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);

  /* Territorio abre por defecto: primero dónde estamos, después qué pasa (ADR-22). */
  const [view, setView] = useState<ViewKey>('territorio');
  const [context, setContext] = useState<ContextKey>('TERRITORIO');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [hoverSiteId, setHoverSiteId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState('');
  const [showRelief, setShowRelief] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapKey>('calles');
  const [imagery, setImagery] = useState<ImageryMode>('none');
  const [imageryCollection, setImageryCollection] = useState<'s1' | 's2'>('s2');
  const [swipe, setSwipe] = useState(0.5);
  const [highlightedAdminId, setHighlightedAdminId] = useState<number | null>(null);
  const [communeFilter, setCommuneFilter] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
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
    loadTerritory()
      .then((t) => {
        setTerritory(t);
        if (!t.imagery.basemap?.available) setBaseMap('datos');
      })
      .catch(() => setTerritory(null));
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
    requestLayers(['sites', ...layersFor(context)]);
  }, [core, context, requestLayers]);

  /* La vista de portafolio pregunta si algún candidato alcanzaría cada hueco
     (catchments) y nombra el barrio de cada hueco (límites administrativos),
     los enciendan o no los contextos. Territorio necesita los contornos del
     localizador aunque el mapa no los dibuje. */
  useEffect(() => {
    if (!core) return;
    if (view === 'portafolio') requestLayers(['catchments', 'admin_areas']);
    if (view === 'territorio') requestLayers(['admin_areas', 'reference_regions']);
  }, [core, view, requestLayers]);

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

  /* Quién queda fuera. Se calcula sobre las mismas celdas y los mismos
     catchments que usó el optimizador, no sobre una aproximación aparte. */
  const unreached = useMemo(
    () => clusterUnreached(
      coverage?.cells ?? [], core?.sites ?? [], layers.catchments, layers.admin_areas,
    ),
    [coverage, core, layers.catchments, layers.admin_areas],
  );

  /* Se mide con los mismos valores que pinta el mapa, no con otros. Un
     contexto neutro no evalúa nada, así que no hay eje que medir. */
  const discrimination = useMemo(() => {
    const def = contextByKey(context);
    const sites = core?.sites ?? [];
    if (def.sitesMode === 'neutral') {
      return { covered: sites.length, total: sites.length, distinct: 0, spread: 0, flat: false };
    }
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
        [
          o.opportunity_id, o.site_id, o.intervention_label, o.problem.headline,
          o.place?.place_line ?? '', ...o.problem.drivers,
        ].join(' ').toLowerCase().includes(q));
    }
    if (communeFilter) list = list.filter((o) => o.place?.commune === communeFilter);
    if (onlyBuildable) list = list.filter((o) => !o.blocked && o.intervention !== 'NO_BUILD');
    return list.sort((a, b) => b.suitability - a.suitability);
  }, [core, query, onlyBuildable, communeFilter]);

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
    details, sources, alerts, layers, terrain, sentinel, territory,
    view,
    /* Cambiar de vista desde la orientación lleva al contexto que la responde:
       abrir Oportunidades con el mapa aún en Territorio dejaría los sitios
       grises justo cuando la vista habla de su color. */
    setView: (v) => {
      setView(v);
      if (v === 'territorio') setContext('TERRITORIO');
      else if (context === 'TERRITORIO') {
        setContext(v === 'oportunidades' ? 'OPORTUNIDADES' : 'SITUACION');
      }
    },
    context, setContext,
    selectedSiteId,
    selectSite: setSelectedSiteId,
    hoverSiteId, setHoverSiteId,
    scenarioId, setScenarioId, scenario, coverage,
    showRelief, setShowRelief,
    showTerrain, setShowTerrain,
    baseMap, setBaseMap,
    imagery, setImagery,
    imageryCollection, setImageryCollection,
    swipe, setSwipe,
    highlightedAdminId, setHighlightedAdminId,
    communeFilter, setCommuneFilter,
    compare,
    toggleCompare: (id) => setCompare((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]),
    clearCompare: () => setCompare([]),
    technical, setTechnical,
    query, setQuery,
    onlyBuildable, setOnlyBuildable,
    visibleOpportunities,
    discrimination,
    unreached,
    selectedClusterId,
    selectCluster: (id) => { setSelectedClusterId(id); if (id) setSelectedSiteId(null); },
    isStatic: IS_STATIC,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Lo que el visor es y dónde está, dicho antes de que cargue un solo dato. */
export const CITY_LINE = 'Pereira, Risaralda · Colombia';
export const PURPOSE_LINE = 'Soporte a decisiones de recuperación urbana tras el sismo del 10-08-2026';

function Booting() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[13px] font-semibold tracking-tight text-paper">{CITY_LINE}</p>
      <div className="h-px w-40 overflow-hidden bg-ink-700">
        <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] bg-accent" />
      </div>
      <p className="max-w-xs text-[11px] leading-relaxed text-mute-400">{PURPOSE_LINE}</p>
      <p className="text-[10px] tracking-[0.18em] text-mute-500 uppercase">Cargando territorio</p>
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
