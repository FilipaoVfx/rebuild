import type { CoverageCell, GeoJSON, Site } from '../types';

export interface UnreachedCluster {
  id: string;
  cells: CoverageCell[];
  population: number;
  /** Centroide ponderado por población. */
  center: [number, number];
  bbox: [number, number, number, number];
  /** Metros hasta el sitio candidato más cercano, esté o no en el portafolio. */
  distanceToNearestSite: number;
  nearestSiteId: string | null;
  /** Población del cluster dentro del área de influencia de algún candidato. */
  populationInSomeCatchment: number;
}

export interface UnreachedSummary {
  clusters: UnreachedCluster[];
  totalPopulation: number;
  totalCells: number;
  /** Población que ningún candidato alcanza, ni siquiera sin seleccionar. */
  populationOutsideEveryCatchment: number;
  candidatesTotal: number;
  candidatesUnselected: number;
}

const METERS_PER_DEG_LAT = 110574;
const metersPerDegLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

function distanceM(a: [number, number], b: [number, number], lat: number): number {
  const dx = (a[0] - b[0]) * metersPerDegLon(lat);
  const dy = (a[1] - b[1]) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Ray casting sobre un anillo simple. Los catchments son polígonos de un anillo. */
function pointInRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

interface Catchment { id: string; ring: number[][]; bbox: [number, number, number, number] }

function toCatchments(geo: GeoJSON | undefined): Catchment[] {
  if (!geo) return [];
  const out: Catchment[] = [];
  for (const f of geo.features) {
    if (f.geometry.type !== 'Polygon') continue;
    const ring = (f.geometry.coordinates as number[][][])[0];
    if (!ring?.length) continue;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of ring) {
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
    out.push({
      id: String((f.properties as Record<string, unknown>).id ?? ''),
      ring,
      bbox: [minx, miny, maxx, maxy],
    });
  }
  return out;
}

/**
 * Agrupa las celdas que ningún proyecto del portafolio alcanza.
 *
 * Las celdas vienen en una malla regular de ~150 m, así que se indexan a
 * enteros y se agrupan por componentes conexas con vecindad de 8. No es un
 * clustering estadístico con parámetros que ajustar: es la malla que ya existe.
 *
 * Para cada grupo se mide, además, si **algún** candidato —seleccionado o no—
 * lo alcanzaría. Esa es la pregunta que distingue un hueco de presupuesto de un
 * hueco de generación de sitios, y son problemas distintos con dueños distintos.
 */
export function clusterUnreached(
  cells: CoverageCell[],
  sites: Site[],
  catchmentsGeo: GeoJSON | undefined,
): UnreachedSummary {
  const unreached = cells.filter((c) => !c.covered_by);
  const catchments = toCatchments(catchmentsGeo);

  if (!unreached.length) {
    return {
      clusters: [], totalPopulation: 0, totalCells: 0,
      populationOutsideEveryCatchment: 0,
      candidatesTotal: sites.length, candidatesUnselected: 0,
    };
  }

  // Paso de malla: la mediana de las diferencias entre coordenadas distintas.
  const step = (values: number[]) => {
    const uniq = [...new Set(values.map((v) => +v.toFixed(6)))].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < uniq.length; i++) gaps.push(uniq[i] - uniq[i - 1]);
    if (!gaps.length) return 0.0013;
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] || 0.0013;
  };
  const dLon = step(cells.map((c) => c.lon));
  const dLat = step(cells.map((c) => c.lat));
  const minLon = Math.min(...cells.map((c) => c.lon));
  const minLat = Math.min(...cells.map((c) => c.lat));

  const key = (c: CoverageCell) =>
    `${Math.round((c.lon - minLon) / dLon)}:${Math.round((c.lat - minLat) / dLat)}`;

  const byKey = new Map<string, CoverageCell>();
  for (const c of unreached) byKey.set(key(c), c);

  const seen = new Set<string>();
  const groups: CoverageCell[][] = [];
  for (const [k, cell] of byKey) {
    if (seen.has(k)) continue;
    const group: CoverageCell[] = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop()!;
      const c = byKey.get(cur);
      if (!c) continue;
      group.push(c);
      const [i, j] = cur.split(':').map(Number);
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const nk = `${i + di}:${j + dj}`;
          if (byKey.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
    }
    groups.push(group);
    void cell;
  }

  const clusters: UnreachedCluster[] = groups.map((group, idx) => {
    const population = group.reduce((a, c) => a + c.population, 0);
    const w = population || group.length;
    const center: [number, number] = population
      ? [
          group.reduce((a, c) => a + c.lon * c.population, 0) / w,
          group.reduce((a, c) => a + c.lat * c.population, 0) / w,
        ]
      : [
          group.reduce((a, c) => a + c.lon, 0) / group.length,
          group.reduce((a, c) => a + c.lat, 0) / group.length,
        ];

    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const c of group) {
      if (c.lon < minx) minx = c.lon;
      if (c.lon > maxx) maxx = c.lon;
      if (c.lat < miny) miny = c.lat;
      if (c.lat > maxy) maxy = c.lat;
    }

    let nearest = Infinity;
    let nearestSiteId: string | null = null;
    for (const s of sites) {
      const d = distanceM(center, [s.lon, s.lat], center[1]);
      if (d < nearest) { nearest = d; nearestSiteId = s.site_id; }
    }

    let populationInSomeCatchment = 0;
    for (const c of group) {
      const pt: [number, number] = [c.lon, c.lat];
      const covered = catchments.some(
        (cat) =>
          pt[0] >= cat.bbox[0] && pt[0] <= cat.bbox[2] &&
          pt[1] >= cat.bbox[1] && pt[1] <= cat.bbox[3] &&
          pointInRing(pt, cat.ring),
      );
      if (covered) populationInSomeCatchment += c.population;
    }

    return {
      id: `hueco_${String(idx + 1).padStart(2, '0')}`,
      cells: group,
      population,
      center,
      bbox: [minx, miny, maxx, maxy] as [number, number, number, number],
      distanceToNearestSite: nearest === Infinity ? 0 : nearest,
      nearestSiteId,
      populationInSomeCatchment,
    };
  }).sort((a, b) => b.population - a.population);

  return {
    clusters,
    totalPopulation: clusters.reduce((a, c) => a + c.population, 0),
    totalCells: unreached.length,
    populationOutsideEveryCatchment: clusters.reduce(
      (a, c) => a + (c.population - c.populationInSomeCatchment), 0),
    candidatesTotal: sites.length,
    candidatesUnselected: sites.length - new Set(cells.map((c) => c.covered_by).filter(Boolean)).size,
  };
}
