import type {
  Alert, Coverage, GeoJSON, Opportunity, Scenario, Site, SiteDetail, Source, Provenance,
} from '../types';

declare global {
  interface Window { URI_STATIC_BASE?: string }
}

/**
 * Dos despliegues, un solo código.
 *
 * - Estático (GitHub Pages): `window.URI_STATIC_BASE` lo inyecta
 *   `build_static.py`. Los escenarios van precalculados y la vista lo declara.
 * - En vivo (montado por la API): se consulta `/api/v1` y el optimizador corre
 *   de verdad.
 */
export const STATIC_BASE: string | null = window.URI_STATIC_BASE ?? null;
export const IS_STATIC = STATIC_BASE !== null;
const API = '/api/v1';

async function getJSON<T>(staticPath: string, apiPath: string): Promise<T> {
  const url = IS_STATIC ? `${STATIC_BASE}/${staticPath}` : `${API}${apiPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return res.json() as Promise<T>;
}

export const assetUrl = (p: string) => `${STATIC_BASE ?? 'data'}/${p}`;

export const GEOJSON_LAYERS = [
  'buildings', 'roads', 'sites', 'evidence', 'green', 'facilities', 'population', 'catchments',
] as const;
export type LayerName = (typeof GEOJSON_LAYERS)[number];

export interface Bundle {
  provenance: Provenance;
  sites: Site[];
  details: Record<string, SiteDetail>;
  opportunities: Opportunity[];
  scenarios: Scenario[];
  coverage: Record<string, Coverage>;
  sources: Source[];
  alerts: Alert[];
  layers: Partial<Record<LayerName, GeoJSON>>;
}

/** Carga sin la que no se puede pintar nada. El resto llega después. */
export async function loadCore() {
  const [sitesRes, opportunities, scenarios] = await Promise.all([
    getJSON<{ sites: Site[]; total: number; provenance: Provenance }>('sites.json', '/sites'),
    getJSON<{ opportunities: Opportunity[] }>('opportunities.json', '/opportunities'),
    getJSON<Scenario[]>('scenarios.json', '/scenarios').catch(() => [] as Scenario[]),
  ]);
  return {
    sites: sitesRes.sites,
    provenance: sitesRes.provenance,
    opportunities: opportunities.opportunities ?? [],
    scenarios: Array.isArray(scenarios) ? scenarios : [],
  };
}

export async function loadLayer(name: LayerName): Promise<GeoJSON> {
  return getJSON<GeoJSON>(`geojson/${name}.json`, `/geojson/${name}`);
}

export async function loadDetails(): Promise<Record<string, SiteDetail>> {
  if (IS_STATIC) return getJSON<Record<string, SiteDetail>>('details.json', '');
  return {};
}

export async function loadDetail(siteId: string): Promise<SiteDetail> {
  return getJSON<SiteDetail>('details.json', `/sites/${siteId}`)
    .then((r) => (IS_STATIC ? (r as unknown as Record<string, SiteDetail>)[siteId] : r));
}

export const loadSources = () => getJSON<Source[]>('sources.json', '/data-sources');
export const loadAlerts = () => getJSON<Alert[]>('alerts.json', '/quality/alerts');

export async function loadCoverage(scenarioId: string): Promise<Coverage> {
  if (IS_STATIC) {
    const all = await getJSON<Record<string, Coverage>>('coverage.json', '');
    return all[scenarioId];
  }
  return getJSON<Coverage>('', `/scenarios/${scenarioId}/coverage`);
}

export interface TerrainIndex { minzoom: number; maxzoom: number; tiles?: string; bounds?: number[] }
export async function loadTerrain(): Promise<TerrainIndex | null> {
  try {
    const res = await fetch(assetUrl('terrain/terrain.json'));
    return res.ok ? ((await res.json()) as TerrainIndex) : null;
  } catch { return null; }
}

export interface SentinelScene {
  collection: string; window: string; file: string; date?: string;
  bounds?: [number, number, number, number]; label?: string;
}
export async function loadSentinel(): Promise<SentinelScene[]> {
  try {
    const res = await fetch(assetUrl('sentinel/previews.json'));
    if (!res.ok) return [];
    const idx = (await res.json()) as { scenes: SentinelScene[] };
    return idx.scenes ?? [];
  } catch { return []; }
}
