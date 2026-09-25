import type { GeoJSON } from '../types';

type BBox = [number, number, number, number];

/**
 * Cuánto del reparto de población cae fuera del área cubierta. Se mide sobre
 * el centroide de cada celda: es la cifra que el visor declara cuando dibuja
 * esas celdas bajo la trama, en vez de esconderlas.
 */
export function populationOutside(pop: GeoJSON | undefined, bbox: BBox | undefined) {
  if (!pop || !bbox) return null;
  const [w, s, e, n] = bbox;
  let outside = 0; let people = 0;
  for (const f of pop.features) {
    const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
    const ring = (g.type === 'Polygon' ? g.coordinates[0] : (g.coordinates as number[][][][])[0][0]) as number[][];
    if (!ring?.length) continue;
    let cx = 0, cy = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; }
    cx /= ring.length; cy /= ring.length;
    if (cx < w || cx > e || cy < s || cy > n) {
      outside += 1;
      people += Number((f.properties as Record<string, unknown>).population) || 0;
    }
  }
  return { outside, total: pop.features.length, people };
}
