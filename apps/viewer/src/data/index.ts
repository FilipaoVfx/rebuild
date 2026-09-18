import type {
  Alert, Coverage, GeoJSON, Opportunity, Scenario, Site, SiteDetail, Source, Provenance,
  Territory,
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
  /* Lugares (ADR-22): lo que hace que el mapa se lea como Pereira. */
  'admin_areas', 'places', 'waterways', 'landmarks', 'road_labels',
  'municipal_facilities', 'municipal_public_space', 'reference_regions',
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

export interface TerrainIndex {
  minzoom: number; maxzoom: number; encoding?: 'mapbox' | 'terrarium';
  aoi_bbox?: [number, number, number, number];
  attribution?: string; liability_notice?: string;
}
export async function loadTerrain(): Promise<TerrainIndex | null> {
  try {
    const res = await fetch(assetUrl('terrain/terrain.json'));
    return res.ok ? ((await res.json()) as TerrainIndex) : null;
  } catch { return null; }
}

/** Una escena de `data/sentinel/previews.json`, con las claves que escribe
 *  `scripts/fetch_sentinel.py`. La fecha, la razón y la limitación viajan con
 *  la imagen hasta la pantalla (ADR-19): sin ellas es un veredicto disfrazado. */
export interface SentinelScene {
  collection: 'sentinel-1-grd' | 'sentinel-2-l2a' | string;
  window: 'PRE' | 'POST';
  scene_id: string;
  acquisition: string;
  cloud_cover: number | null;
  orbit_direction: string | null;
  relative_orbit: number | null;
  file: string;
  bbox: [number, number, number, number];
  reason: string;
}
export interface SentinelIndex {
  aoi_bbox: [number, number, number, number];
  event_date: string;
  attribution: string;
  limitation: string;
  scenes: SentinelScene[];
}
export async function loadSentinel(): Promise<SentinelIndex | null> {
  try {
    const res = await fetch(assetUrl('sentinel/previews.json'));
    if (!res.ok) return null;
    const idx = (await res.json()) as SentinelIndex;
    return idx.scenes ? idx : null;
  } catch { return null; }
}

/** La imagen de una escena. Estático: junto al índice; en vivo: `data/sentinel/<familia>/<ventana>/`. */
export function sentinelImageUrl(scene: SentinelScene): string {
  if (IS_STATIC) return `${STATIC_BASE}/sentinel/${scene.file}`;
  const family = scene.collection === 'sentinel-1-grd' ? 'sentinel1' : 'sentinel2';
  return `data/sentinel/${family}/${scene.window.toLowerCase()}/${scene.file}`;
}

export const loadTerritory = () => getJSON<Territory>('territory.json', '/territory');
