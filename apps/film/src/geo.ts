/**
 * Proyección local y relieve. Todo en metros, con el origen en el centro del
 * recuadro de la activación Copernicus EMSR916 (el sector de estudio):
 * x hacia el este, z hacia el sur, y hacia arriba.
 */

export const AOI = { w: -75.7251, s: 4.7878, e: -75.6748, n: 4.8229 };
export const LON0 = (AOI.w + AOI.e) / 2;
export const LAT0 = (AOI.s + AOI.n) / 2;
const MX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const MY = 110_540;

export const HALF_W = ((AOI.e - AOI.w) / 2) * MX;
export const HALF_D = ((AOI.n - AOI.s) / 2) * MY;

/** Exageración vertical del relieve. Se declara en pantalla. */
export const EXAGGERATION = 1.5;

export type XZ = [number, number];
export const toXZ = (lon: number, lat: number): XZ => [(lon - LON0) * MX, -(lat - LAT0) * MY];
export const toLonLat = (x: number, z: number): [number, number] => [LON0 + x / MX, LAT0 - z / MY];

/* ── Copernicus DEM GLO-30 en teselas z14 (codificación mapbox) ─────── */

const Z = 14;
const TX0 = 4745;
const TY0 = 7972;
const TILES_X = 3;
const TILES_Y = 2;
const SIZE = 256;

let elev: Float32Array | null = null;
const W = TILES_X * SIZE;
const H = TILES_Y * SIZE;
let base = 0;

const lonToTile = (lon: number) => ((lon + 180) / 360) * 2 ** Z;
const latToTile = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z;
};

export async function loadDem(dataBase: string): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  await Promise.all(
    Array.from({ length: TILES_X * TILES_Y }, async (_, i) => {
      const tx = i % TILES_X;
      const ty = Math.floor(i / TILES_X);
      const img = new Image();
      img.src = `${dataBase}/terrain/${Z}/${TX0 + tx}/${TY0 + ty}.png`;
      await img.decode();
      g.drawImage(img, tx * SIZE, ty * SIZE);
    }),
  );
  const px = g.getImageData(0, 0, W, H).data;
  elev = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    elev[i] = -10000 + (px[i * 4] * 65536 + px[i * 4 + 1] * 256 + px[i * 4 + 2]) * 0.1;
  }
  /* La base es el punto más bajo dentro del sector de estudio. */
  let min = Infinity;
  for (let x = -HALF_W; x <= HALF_W; x += 40) {
    for (let z = -HALF_D; z <= HALF_D; z += 40) min = Math.min(min, elevationXZ(x, z));
  }
  base = min;
}

/** Elevación real (m s. n. m.), interpolada bilinealmente. */
export function elevation(lon: number, lat: number): number {
  if (!elev) throw new Error('DEM sin cargar');
  const fx = Math.min(W - 1.001, Math.max(0, (lonToTile(lon) - TX0) * SIZE - 0.5));
  const fy = Math.min(H - 1.001, Math.max(0, (latToTile(lat) - TY0) * SIZE - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;
  const i = y0 * W + x0;
  const a = elev[i] * (1 - dx) + elev[i + 1] * dx;
  const b = elev[i + W] * (1 - dx) + elev[i + W + 1] * dx;
  return a * (1 - dy) + b * dy;
}

export const elevationXZ = (x: number, z: number) => elevation(...toLonLat(x, z));

/** Altura de escena sobre la base, con la exageración aplicada. */
export const heightXZ = (x: number, z: number) => (elevationXZ(x, z) - base) * EXAGGERATION;
export const baseElevation = () => base;

/* ── Geometría plana ────────────────────────────────────────────────── */

export function inRing(x: number, z: number, ring: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const insideAoi = (x: number, z: number) => Math.abs(x) <= HALF_W && Math.abs(z) <= HALF_D;

/** Densifica una polilínea para que se apoye sobre el relieve. */
export function densify(pts: XZ[], step = 30): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
