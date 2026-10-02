import * as THREE from 'three';
import {
  EXAGGERATION, HALF_D, HALF_W, baseElevation, densify, heightXZ, inRing, insideAoi, toXZ, type XZ,
} from './geo';
import { T, clamp01, ease, env } from './timeline';

type Feature = { geometry: { type: string; coordinates: any }; properties: Record<string, any> };
export interface Data {
  buildings: Feature[];
  roads: Feature[];
  waterways: Feature[];
  evidence: Feature[];
  sites: Feature[];
  population: Feature[];
  catchments: Feature[];
  publicSpace: Feature[];
  green: Feature[];
  facilities: Feature[];
  admin: Feature[];
}

export const FOCUS_SITE = 'site_0016';

/* Paleta de noche de REBUILD. */
const C = {
  bg: new THREE.Color('#0a0f1c'),
  terrainLow: new THREE.Color('#1b2742'),
  terrainHigh: new THREE.Color('#3a4d74'),
  contour: new THREE.Color('#6d8bd0'),
  wall: new THREE.Color('#0d1424'),
  road: new THREE.Color('#c9d3e6'),
  river: new THREE.Color('#5aa8ec'),
  building: new THREE.Color('#cbc5b7'),
  catchTint: new THREE.Color('#8fa8ff'),
  cobalt: new THREE.Color('#5b84ff'),
  possibly: new THREE.Color('#f2c14e'),
  damaged: new THREE.Color('#f08a3a'),
  destroyed: new THREE.Color('#e5442b'),
  popLow: new THREE.Color('#4a3a86'),
  popHigh: new THREE.Color('#c9b0ff'),
  publicSpace: new THREE.Color('#58c483'),
  facility: new THREE.Color('#47b6da'),
  hatch: '#8a93a8',
};
const DAMAGE_LEVEL: Record<string, number> = { POSSIBLY_DAMAGED: 1, DAMAGED: 2, DESTROYED: 3 };
const damageColor = (lvl: number) => (lvl >= 3 ? C.destroyed : lvl === 2 ? C.damaged : C.possibly);

/** Separación vertical de las capas en la vista explotada. */
export const LAYER_GAP = 440;
export const LAYERS = [
  { key: 'relieve', index: 0 },
  { key: 'edificios', index: 1 },
  { key: 'espacio', index: 2 },
  { key: 'poblacion', index: 3 },
  { key: 'dano', index: 4 },
  { key: 'pot', index: 5 },
] as const;

/** Cuánto está separada la capa i en el instante t (0 = sobre el terreno). */
export function explodeOf(i: number, t: number): number {
  if (i === 0) return 0;
  const out = ease(t, T.explode + (i - 1) * 0.85, T.explode + (i - 1) * 0.85 + 2.1);
  const back = ease(t, T.collapse[0] + (5 - i) * 0.3, T.collapse[0] + (5 - i) * 0.3 + 2.2);
  return out * (1 - back);
}
export const layerOffset = (i: number, t: number) => i * LAYER_GAP * explodeOf(i, t);

const BUILDING_H = 14; // altura esquemática uniforme: las huellas no traen altura

/* ── Utilidades ─────────────────────────────────────────────────────── */

const ringXZ = (coords: [number, number][]): XZ[] => coords.map(([lon, lat]) => toXZ(lon, lat));
const outer = (f: Feature): [number, number][] =>
  f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
const centroid = (ring: XZ[]): XZ => {
  let x = 0;
  let z = 0;
  const n = ring.length - (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    z += ring[i][1];
  }
  return [x / n, z / n];
};
const openRing = (ring: XZ[]) =>
  ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;

function radialTexture(inner: string, outerColor: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner);
  grad.addColorStop(1, outerColor);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hatchTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = C.hatch;
  g.lineWidth = 5;
  for (let k = -64; k < 128; k += 16) {
    g.beginPath();
    g.moveTo(k, 64);
    g.lineTo(k + 64, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(22, 15);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ── Construcción ───────────────────────────────────────────────────── */

export interface World {
  scene: THREE.Scene;
  update: (t: number) => void;
  focus: THREE.Vector3;
  catchmentAnchor: THREE.Vector3;
  places: { name: string; pos: THREE.Vector3 }[];
  layerAnchor: (i: number, t: number) => THREE.Vector3;
}

export function buildWorld(data: Data): World {
  const scene = new THREE.Scene();
  scene.background = C.bg;
  scene.fog = new THREE.Fog(C.bg, 9000, 22000);

  scene.add(new THREE.HemisphereLight('#8ea3d4', '#05070d', 0.75));
  const sun = new THREE.DirectionalLight('#ffe3bd', 2.1);
  sun.position.set(-4200, 5200, -2600);
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#6f8fff', 0.6);
  rim.position.set(4000, 1800, 3500);
  scene.add(rim);

  const focusSite = data.sites.find((f) => f.properties.site_id === FOCUS_SITE)!;
  const [fx, fz] = centroid(ringXZ(outer(focusSite)));
  const focus = new THREE.Vector3(fx, heightXZ(fx, fz), fz);

  const catchmentRing = ringXZ(
    outer(data.catchments.find((f) => f.properties.id === FOCUS_SITE)!),
  );

  /* ── Capa 0: el bloque de terreno ─────────────────────────────────── */
  const relieve = new THREE.Group();
  scene.add(relieve);

  const NX = 320;
  const NZ = 224;
  const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const col = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const aElev = new Float32Array((NX + 1) * (NZ + 1));
  const aCatch = new Float32Array((NX + 1) * (NZ + 1));
  let maxY = 0;
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const k = j * (NX + 1) + i;
      const x = -HALF_W + (2 * HALF_W * i) / NX;
      const z = -HALF_D + (2 * HALF_D * j) / NZ;
      const y = heightXZ(x, z);
      maxY = Math.max(maxY, y);
      pos.set([x, y, z], k * 3);
      aElev[k] = y / EXAGGERATION + baseElevation();
      aCatch[k] = inRing(x, z, catchmentRing) ? 1 : 0;
    }
  }
  for (let k = 0; k < aElev.length; k++) {
    const c = C.terrainLow.clone().lerp(C.terrainHigh, clamp01(pos[k * 3 + 1] / maxY));
    col.set([c.r, c.g, c.b], k * 3);
  }
  const idx: number[] = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.setAttribute('aElev', new THREE.BufferAttribute(aElev, 1));
  tg.setAttribute('aCatch', new THREE.BufferAttribute(aCatch, 1));
  tg.setIndex(idx);
  tg.computeVertexNormals();

  const terrainU = { uCatch: { value: 0 }, uContour: { value: 1 }, uCobalt: { value: C.cobalt } };
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  terrainMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, terrainU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aElev;\nattribute float aCatch;\nvarying float vElev;\nvarying float vCatch;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvElev = aElev;\nvCatch = aCatch;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCatch;\nuniform float uContour;\nuniform vec3 uCobalt;\nvarying float vElev;\nvarying float vCatch;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float e = vElev / 25.0;
        float w = fwidth(e);
        float line = 1.0 - smoothstep(0.0, w * 1.4, abs(fract(e - 0.5) - 0.5));
        float major = 1.0 - smoothstep(0.0, w * 2.0, abs(fract(vElev / 100.0 - 0.5) - 0.5) * 5.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.43, 0.55, 0.82), uContour * (line * 0.08 + major * 0.16));
        diffuseColor.rgb = mix(diffuseColor.rgb, uCobalt, vCatch * uCatch * 0.55);`,
      );
  };
  relieve.add(new THREE.Mesh(tg, terrainMat));

  /* Paredes del bloque: el sector de estudio, recortado. */
  const WALL_BASE = -140;
  const wallPos: number[] = [];
  const edge = (pts: XZ[]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const ay = heightXZ(ax, az);
      const by = heightXZ(bx, bz);
      wallPos.push(ax, ay, az, bx, by, bz, bx, WALL_BASE, bz, ax, ay, az, bx, WALL_BASE, bz, ax, WALL_BASE, az);
    }
  };
  const W = HALF_W - 0.5;
  const D = HALF_D - 0.5;
  edge(densify([[-W, D], [W, D]], 25));
  edge(densify([[W, D], [W, -D]], 25));
  edge(densify([[W, -D], [-W, -D]], 25));
  edge(densify([[-W, -D], [-W, D]], 25));
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wg.computeVertexNormals();
  const wall = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: C.wall, side: THREE.DoubleSide, roughness: 1 }));
  relieve.add(wall);
  const rim2 = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * HALF_W, 1, 2 * HALF_D)),
    new THREE.LineBasicMaterial({ color: '#2a3a63', transparent: true, opacity: 0.8 }),
  );
  rim2.position.y = WALL_BASE;
  relieve.add(rim2);

  /* Suelo de referencia: una retícula que se pierde en la niebla. */
  const grid = new THREE.GridHelper(26000, 52, '#1a2440', '#121a2e');
  grid.position.y = WALL_BASE - 2;
  scene.add(grid);

  /* Calles (OSM), apoyadas en el relieve. */
  const roadPos: number[] = [];
  for (const f of data.roads) {
    if (f.geometry.type !== 'LineString') continue;
    const pts = densify(ringXZ(f.geometry.coordinates), 35);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      if (!insideAoi(ax, az) || !insideAoi(bx, bz)) continue;
      roadPos.push(ax, heightXZ(ax, az) + 2, az, bx, heightXZ(bx, bz) + 2, bz);
    }
  }
  const roadMat = new THREE.LineBasicMaterial({ color: C.road, transparent: true, opacity: 0.2, depthWrite: false });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  relieve.add(new THREE.LineSegments(rg, roadMat));

  /* Ríos (cintas) y quebradas (líneas). */
  const ribbon: number[] = [];
  const streams: number[] = [];
  let otun: THREE.Vector3 | null = null;
  for (const f of data.waterways) {
    if (f.geometry.type !== 'LineString') continue;
    const name = String(f.properties.display_name ?? '');
    const pts = densify(ringXZ(f.geometry.coordinates), 25).filter(([x, z]) => insideAoi(x, z));
    if (pts.length < 2) continue;
    if (name.startsWith('Río')) {
      if (name.includes('Otún') && !otun) {
        const [mx, mz] = pts[Math.floor(pts.length * 0.35)];
        otun = new THREE.Vector3(mx, heightXZ(mx, mz) + 30, mz);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (-(bz - az) / len) * 11;
        const nz = ((bx - ax) / len) * 11;
        const ay = heightXZ(ax, az) + 2.5;
        const by = heightXZ(bx, bz) + 2.5;
        ribbon.push(ax + nx, ay, az + nz, bx + nx, by, bz + nz, bx - nx, by, bz - nz);
        ribbon.push(ax + nx, ay, az + nz, bx - nx, by, bz - nz, ax - nx, ay, az - nz);
      }
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        streams.push(ax, heightXZ(ax, az) + 2, az, bx, heightXZ(bx, bz) + 2, bz);
      }
    }
  }
  const riverG = new THREE.BufferGeometry();
  riverG.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
  relieve.add(new THREE.Mesh(riverG, new THREE.MeshBasicMaterial({ color: C.river, side: THREE.DoubleSide, toneMapped: false })));
  const streamG = new THREE.BufferGeometry();
  streamG.setAttribute('position', new THREE.Float32BufferAttribute(streams, 3));
  relieve.add(new THREE.LineSegments(streamG, new THREE.LineBasicMaterial({ color: C.river, transparent: true, opacity: 0.55 })));

  /* Contorno del área caminable del sitio foco. */
  const catchLine: number[] = [];
  const cr = densify([...catchmentRing, catchmentRing[0]], 15);
  for (const [x, z] of cr) catchLine.push(x, heightXZ(x, z) + 4, z);
  const catchG = new THREE.BufferGeometry();
  catchG.setAttribute('position', new THREE.Float32BufferAttribute(catchLine, 3));
  const catchMat = new THREE.LineBasicMaterial({ color: C.cobalt, transparent: true, opacity: 0, toneMapped: false });
  relieve.add(new THREE.Line(catchG, catchMat));
  const west = cr.reduce((a, b) => (b[0] - b[1] * 0.3 < a[0] - a[1] * 0.3 ? b : a));
  const catchmentAnchor = new THREE.Vector3(west[0], heightXZ(west[0], west[1]) + 20, west[1]);

  /* ── Capa 1: edificios (Microsoft, altura esquemática) ─────────────── */
  const evid = data.evidence.map((f) => {
    const [x, z] = toXZ(...(f.geometry.coordinates as [number, number]));
    return { x, z, lvl: DAMAGE_LEVEL[String(f.properties.label)] ?? 1 };
  });
  const bPos: number[] = [];
  const bTop: number[] = [];
  const bDmg: number[] = [];
  const bCatch: number[] = [];
  for (const f of data.buildings) {
    const ring = openRing(ringXZ(outer(f)));
    if (ring.length < 3) continue;
    const [cx, cz] = centroid(ring);
    if (!insideAoi(cx, cz)) continue;
    const hs = ring.map(([x, z]) => heightXZ(x, z));
    const b0 = Math.min(...hs) - 1;
    const top = Math.max(Math.max(...hs) + 4, b0 + BUILDING_H);
    const inC = inRing(cx, cz, catchmentRing) ? 1 : 0;
    let lvl = 0;
    for (const e of evid) if (Math.abs(e.x - cx) < 26 && Math.abs(e.z - cz) < 26) lvl = Math.max(lvl, e.lvl);
    const push = (x: number, y: number, z: number, isTop: number) => {
      bPos.push(x, y, z);
      bTop.push(isTop);
      bDmg.push(lvl);
      bCatch.push(inC);
    };
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      push(ax, b0, az, 0); push(bx, b0, bz, 0); push(bx, top, bz, 1);
      push(ax, b0, az, 0); push(bx, top, bz, 1); push(ax, top, az, 1);
    }
    const tri = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [a, b, c] of tri) {
      push(ring[a][0], top, ring[a][1], 1);
      push(ring[b][0], top, ring[b][1], 1);
      push(ring[c][0], top, ring[c][1], 1);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
  bg.setAttribute('aTop', new THREE.Float32BufferAttribute(bTop, 1));
  bg.setAttribute('aDmg', new THREE.Float32BufferAttribute(bDmg, 1));
  bg.setAttribute('aCatch', new THREE.Float32BufferAttribute(bCatch, 1));
  bg.computeVertexNormals();
  const bU = {
    uRise: { value: 0 }, uDamage: { value: 0 }, uLift: { value: 0 }, uCatchB: { value: 0 }, uTint: { value: C.catchTint },
    uC1: { value: C.possibly }, uC2: { value: C.damaged }, uC3: { value: C.destroyed },
  };
  const bMat = new THREE.MeshStandardMaterial({ color: C.building, roughness: 0.75, side: THREE.DoubleSide });
  bMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTop;\nattribute float aDmg;\nattribute float aCatch;\nuniform float uRise;\nvarying float vDmg;\nvarying float vTop;\nvarying float vCatchB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y -= aTop * (1.0 - uRise) * 60.0;\nvDmg = aDmg;\nvTop = aTop;\nvCatchB = aCatch;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDamage;\nuniform float uCatchB;\nuniform vec3 uTint;\nuniform vec3 uC1;\nuniform vec3 uC2;\nuniform vec3 uC3;\nvarying float vDmg;\nvarying float vTop;\nvarying float vCatchB;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 dc = vDmg > 2.5 ? uC3 : (vDmg > 1.5 ? uC2 : uC1);
        float on = step(0.5, vDmg) * uDamage;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint, vCatchB * uCatchB * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, dc, on);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += dc * on * 0.9 + uTint * vCatchB * uCatchB * 0.18;`,
      );
  };
  const buildings = new THREE.Mesh(bg, bMat);
  const edificios = new THREE.Group();
  edificios.add(buildings);
  scene.add(edificios);

  /* ── Capa 2: espacio público y equipamientos (SIGPER, OSM) ─────────── */
  const espacio = new THREE.Group();
  scene.add(espacio);
  const near: number[] = [];
  const far2: number[] = [];
  const nearCol: number[] = [];
  const farCol: number[] = [];
  const addPoly = (f: Feature, color: THREE.Color) => {
    const ring = openRing(ringXZ(outer(f)));
    if (ring.length < 3) return;
    const [cx, cz] = centroid(ring);
    if (!insideAoi(cx, cz)) return;
    const y = Math.max(...ring.map(([x, z]) => heightXZ(x, z))) + 3;
    const isNear = Math.hypot(cx - fx, cz - fz) < 500;
    const tri = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const t of tri) {
      for (const k of t) {
        (isNear ? near : far2).push(ring[k][0], y, ring[k][1]);
        (isNear ? nearCol : farCol).push(color.r, color.g, color.b);
      }
    }
  };
  for (const f of [...data.publicSpace, ...data.green]) addPoly(f, C.publicSpace);
  for (const f of data.facilities) addPoly(f, C.facility);
  const polyMesh = (p: number[], c: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    });
    return new THREE.Mesh(g, m);
  };
  const spaceFar = polyMesh(far2, farCol);
  const spaceNear = polyMesh(near, nearCol);
  espacio.add(spaceFar, spaceNear);

  /* ── Capa 3: población estimada (celdas de 150 m) ─────────────────── */
  const poblacion = new THREE.Group();
  scene.add(poblacion);
  const cells = data.population
    .map((f) => {
      const ring = openRing(ringXZ(outer(f)));
      const [x, z] = centroid(ring);
      return { x, z, pop: Number(f.properties.population), inCatch: inRing(x, z, catchmentRing) };
    })
    .filter((c) => insideAoi(c.x, c.z));
  const maxPop = Math.max(...cells.map((c) => c.pop));
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const popMat = () => new THREE.MeshStandardMaterial({
    roughness: 0.6, emissive: new THREE.Color('#2a1f55'), transparent: true, opacity: 1,
  });
  const mkPop = (list: typeof cells) => {
    const m = new THREE.InstancedMesh(box, popMat(), list.length);
    list.forEach((c, i) => m.setColorAt(i, C.popLow.clone().lerp(C.popHigh, Math.sqrt(c.pop / maxPop))));
    return m;
  };
  const popAll = mkPop(cells);
  const catchCells = cells.filter((c) => c.inCatch);
  const popCatch = mkPop(catchCells);
  const pcm = popCatch.material as THREE.MeshStandardMaterial;
  pcm.opacity = 0.9;
  pcm.emissive = new THREE.Color('#5a46b0');
  poblacion.add(popAll);
  scene.add(popCatch);
  const setPop = (m: THREE.InstancedMesh, list: typeof cells, k: number, lift = 0) => {
    const o = new THREE.Object3D();
    list.forEach((c, i) => {
      o.position.set(c.x, heightXZ(c.x, c.z) + lift, c.z);
      const thin = m === popCatch;
      o.scale.set(thin ? 30 : 92, Math.max(0.01, (thin ? 10 + (c.pop / maxPop) * 190 : 12 + (c.pop / maxPop) * 210) * k), thin ? 30 : 92);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  };

  /* ── Capa 4: evidencia de daño (Copernicus EMS) ────────────────────── */
  const dano = new THREE.Group();
  scene.add(dano);
  const evMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(10, 16, 12),
    new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }),
    evid.length,
  );
  const halo = new THREE.BufferGeometry();
  const haloPos: number[] = [];
  const haloCol: number[] = [];
  evid.forEach((e, i) => {
    const o = new THREE.Object3D();
    o.position.set(e.x, heightXZ(e.x, e.z) + 18, e.z);
    o.updateMatrix();
    evMesh.setMatrixAt(i, o.matrix);
    evMesh.setColorAt(i, damageColor(e.lvl));
    haloPos.push(e.x, heightXZ(e.x, e.z) + 18, e.z);
    const c = damageColor(e.lvl);
    haloCol.push(c.r, c.g, c.b);
  });
  halo.setAttribute('position', new THREE.Float32BufferAttribute(haloPos, 3));
  halo.setAttribute('color', new THREE.Float32BufferAttribute(haloCol, 3));
  const haloMat = new THREE.PointsMaterial({
    size: 150, map: radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
  });
  dano.add(evMesh, new THREE.Points(halo, haloMat));

  /* ── Capa 5: POT (IDE AMCO), sin licencia: una hoja rayada y vacía ─── */
  const pot = new THREE.Group();
  scene.add(pot);
  const potMat = new THREE.MeshBasicMaterial({
    map: hatchTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const potSheet = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_W, 2 * HALF_D).rotateX(-Math.PI / 2), potMat);
  potSheet.position.y = maxY * 0.55;
  const potEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(2 * HALF_W, 2 * HALF_D).rotateX(-Math.PI / 2)),
    new THREE.LineBasicMaterial({ color: '#c3c9d6', transparent: true, opacity: 0 }),
  );
  potEdge.position.y = potSheet.position.y;
  pot.add(potSheet, potEdge);

  /* Marcos de cada capa en la vista explotada. */
  const frames = [1, 2, 3, 4].map(() => {
    const l = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(2 * HALF_W, 2 * HALF_D).rotateX(-Math.PI / 2)),
      new THREE.LineBasicMaterial({ color: '#5b84ff', transparent: true, opacity: 0, toneMapped: false }),
    );
    scene.add(l);
    return l;
  });

  /* ── Sitios: un haz por cada uno de los 115 ────────────────────────── */
  const siteXZ = data.sites.map((f) => ({ id: String(f.properties.site_id), xz: centroid(ringXZ(outer(f))) }));
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);
  const beamMat = new THREE.MeshBasicMaterial({
    color: C.cobalt, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, siteXZ.length);
  scene.add(beams);
  const focusBeamMat = beamMat.clone();
  const focusBeam = new THREE.Mesh(beamGeo, focusBeamMat);
  scene.add(focusBeam);
  const ringMat = new THREE.MeshBasicMaterial({
    color: C.cobalt, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64).rotateX(-Math.PI / 2), ringMat);
  ring.position.copy(focus).add(new THREE.Vector3(0, 6, 0));
  scene.add(ring);

  /* Lugares que orientan. */
  const places: { name: string; pos: THREE.Vector3 }[] = [];
  for (const name of ['Centro', 'Villavicencio', 'San Nicolás', 'Boston']) {
    const f = data.admin.find((a) => Number(a.properties.admin_level) === 8 && a.properties.display_name === name);
    if (!f) continue;
    const [x, z] = toXZ(Number(f.properties.label_lon), Number(f.properties.label_lat));
    if (insideAoi(x, z)) places.push({ name, pos: new THREE.Vector3(x, heightXZ(x, z) + 60, z) });
  }
  if (otun) places.push({ name: 'Río Otún', pos: otun });

  const layerAnchor = (i: number, t: number) => {
    const y = heightXZ(HALF_W, HALF_D);
    return new THREE.Vector3(HALF_W, (i === 0 ? WALL_BASE * 0.5 : y + 40) + layerOffset(i, t), HALF_D);
  };

  /* ── Estado en el instante t ──────────────────────────────────────── */
  const update = (t: number) => {
    const ex = (i: number) => explodeOf(i, t);
    edificios.position.y = layerOffset(1, t);
    espacio.position.y = layerOffset(2, t);
    poblacion.position.y = layerOffset(3, t);
    dano.position.y = layerOffset(4, t);
    pot.position.y = layerOffset(5, t);

    bU.uRise.value = ease(t, T.rise[0], T.rise[1]);
    bU.uDamage.value = ease(t, T.evidence[0] + 0.2, T.evidence[0] + 1.6) * (1 - 0.55 * ease(t, T.justif[0], T.justif[0] + 2));

    /* Espacio público: aparece al separarse; tras el cruce queda tenue, y el
       cercano al sitio se enciende al leer el entorno. */
    const spaceIn = ease(t, T.explode + 0.85, T.explode + 2.4);
    const entorno = env(t, T.entorno[0] + 0.6, T.oportunidad[1], 1.2, 1.0);
    (spaceFar.material as THREE.MeshBasicMaterial).opacity = spaceIn * (0.75 - 0.4 * ease(t, T.collapse[1], T.collapse[1] + 1)) * (1 - 0.6 * entorno);
    (spaceNear.material as THREE.MeshBasicMaterial).opacity = spaceIn * (0.75 - 0.4 * ease(t, T.collapse[1], T.collapse[1] + 1)) + 0.25 * entorno;

    /* Población: columnas en la vista explotada; en el entorno, solo las
       celdas que caen dentro del área caminable. */
    const popIn = ease(t, T.explode + 1.7, T.explode + 3.6) * (1 - ease(t, T.collapse[0] + 0.3, T.collapse[0] + 2.0));
    poblacion.visible = popIn > 0.001;
    setPop(popAll, cells, popIn);
    const popC = env(t, T.entorno[0] + 1.2, T.verificacion[1], 1.6, 1.2);
    popCatch.visible = popC > 0.001;
    setPop(popCatch, catchCells, popC);

    /* Evidencia de daño. */
    const evIn = ease(t, T.explode + 2.55, T.explode + 4.0);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
    const evStage = env(t, T.evidence[0], T.evidence[1] + 0.5, 0.6, 1.2);
    (evMesh.material as THREE.MeshBasicMaterial).opacity = evIn;
    haloMat.opacity = evIn * (0.35 + 0.65 * evStage * (0.55 + 0.45 * pulse)) * (1 - 0.6 * ease(t, T.justif[0], T.justif[0] + 2));
    haloMat.size = 150 + 110 * evStage;

    /* POT: aparece como hoja vacía y, en "Fuentes", sale del cruce. */
    const potIn = ease(t, T.explode + 3.4, T.explode + 5.0) * (1 - ease(t, 23.9, 25.0));
    potMat.opacity = 0.55 * potIn;
    (potEdge.material as THREE.LineBasicMaterial).opacity = 0.9 * potIn;
    pot.visible = potIn > 0.001;

    frames.forEach((l, k) => {
      const i = k + 1;
      l.position.y = layerOffset(i, t) - 12;
      (l.material as THREE.LineBasicMaterial).opacity = 0.55 * ex(i);
    });

    /* Haces de los sitios. */
    const grow = ease(t, T.evidence[0] + 1.0, T.evidence[0] + 3.0);
    const fadeOthers = 1 - 0.8 * ease(t, T.entorno[0], T.entorno[0] + 1.5);
    const back = ease(t, T.justif[0] + 0.5, T.justif[0] + 2.5);
    const o = new THREE.Object3D();
    siteXZ.forEach((s, i) => {
      const [x, z] = s.xz;
      o.position.set(x, heightXZ(x, z), z);
      o.scale.set(5, Math.max(0.01, 280 * grow), 5);
      o.updateMatrix();
      beams.setMatrixAt(i, o.matrix);
    });
    beams.instanceMatrix.needsUpdate = true;
    beamMat.opacity = 0.55 * grow * Math.max(fadeOthers, 0.35 * back);
    const fb = env(t, T.evidence[0] + 1.0, T.justif[1], 1.8, 1.0);
    focusBeam.position.copy(focus);
    focusBeam.scale.set(4.5, Math.max(0.01, 460 * fb), 4.5);
    focusBeamMat.opacity = 0.7 * fb;

    const ringOn = env(t, T.entorno[0], T.verificacion[1] + 0.5, 1.0, 1.2);
    const rp = (t * 0.6) % 1;
    ring.scale.setScalar(40 + 140 * rp);
    ringMat.opacity = ringOn * (1 - rp) * 0.9;

    terrainU.uCatch.value = env(t, T.entorno[0] + 0.4, T.verificacion[1] + 0.2, 1.4, 1.0);
    catchMat.opacity = terrainU.uCatch.value;
    bU.uCatchB.value = terrainU.uCatch.value;
  };

  return { scene, update, focus, catchmentAnchor, places, layerAnchor };
}
