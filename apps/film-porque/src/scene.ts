import * as THREE from 'three';
import { EXAGGERATION, HALF_D, HALF_W, densify, heightXZ, insideAoi, toXZ, type XZ } from './geo';
import { T, appearAt, ease, env } from './timeline';

type Feature = { geometry: { type: string; coordinates: any }; properties: Record<string, any> };
export interface Porque {
  anio_edificio: number[];
  anio_dano: number[];
  censo_malla_300m: { lon: number; lat: number; personas: number; ninos_0_9: number; mayores_70: number }[];
}
export interface Data {
  buildings: Feature[];
  roads: Feature[];
  waterways: Feature[];
  evidence: Feature[];
  admin: Feature[];
  porque: Porque;
}

const C = {
  bg: new THREE.Color('#090d18'),
  low: new THREE.Color('#18223a'),
  high: new THREE.Color('#33446a'),
  wall: new THREE.Color('#0b111f'),
  road: new THREE.Color('#c9d3e6'),
  river: new THREE.Color('#5aa8ec'),
  /** La ciudad de antes de 1985, en ámbar; lo posterior se enfría hacia el azul. */
  old: new THREE.Color('#f0a24b'),
  mid: new THREE.Color('#e9dcc0'),
  young: new THREE.Color('#7fb8ec'),
  unknown: new THREE.Color('#4c5670'),
  damage: new THREE.Color('#ff4a2e'),
  kids: new THREE.Color('#6fd3c4'),
  elders: new THREE.Color('#f0a24b'),
};

const BUILDING_H = 14; // altura esquemática: las huellas no la traen

const ring = (f: Feature): [number, number][] =>
  f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
const toRing = (r: [number, number][]): XZ[] => {
  const pts = r.map(([lon, lat]) => toXZ(lon, lat));
  const a = pts[0];
  const b = pts[pts.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? pts.slice(0, -1) : pts;
};
const centroid = (pts: XZ[]): XZ => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

export function yearColor(y: number): THREE.Color {
  if (!y) return C.unknown.clone();
  if (y <= 1985) return C.old.clone();
  const k = (y - 1986) / (2015 - 1986);
  return k < 0.5 ? C.old.clone().lerp(C.mid, 0.55 + k) : C.mid.clone().lerp(C.young, (k - 0.5) * 2);
}

function glow(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface World {
  scene: THREE.Scene;
  update: (t: number) => void;
  places: { name: string; pos: THREE.Vector3 }[];
}

export function buildWorld(data: Data): World {
  const scene = new THREE.Scene();
  scene.background = C.bg;
  scene.fog = new THREE.Fog(C.bg, 9000, 21000);
  scene.add(new THREE.HemisphereLight('#8ea3d4', '#05070d', 0.7));
  const sun = new THREE.DirectionalLight('#ffe1b8', 2.0);
  sun.position.set(-4200, 5200, -2600);
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#6f8fff', 0.55);
  rim.position.set(4000, 1800, 3500);
  scene.add(rim);

  /* ── Terreno (Copernicus DEM) ───────────────────────────────────── */
  const NX = 300;
  const NZ = 210;
  const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const col = new Float32Array((NX + 1) * (NZ + 1) * 3);
  let maxY = 1;
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = -HALF_W + (2 * HALF_W * i) / NX;
      const z = -HALF_D + (2 * HALF_D * j) / NZ;
      const y = heightXZ(x, z);
      maxY = Math.max(maxY, y);
      pos.set([x, y, z], (j * (NX + 1) + i) * 3);
    }
  }
  for (let k = 0; k < pos.length / 3; k++) {
    const c = C.low.clone().lerp(C.high, pos[k * 3 + 1] / maxY);
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
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  terrainMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float e = vH / (${EXAGGERATION.toFixed(2)} * 25.0);
        float w = fwidth(e);
        float line = 1.0 - smoothstep(0.0, w * 1.4, abs(fract(e - 0.5) - 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.43, 0.55, 0.82), line * 0.09);`,
      );
  };
  scene.add(new THREE.Mesh(tg, terrainMat));

  const WALL = -140;
  const wall: number[] = [];
  const side = (pts: XZ[]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const ay = heightXZ(ax, az);
      const by = heightXZ(bx, bz);
      wall.push(ax, ay, az, bx, by, bz, bx, WALL, bz, ax, ay, az, bx, WALL, bz, ax, WALL, az);
    }
  };
  const W = HALF_W - 0.5;
  const D = HALF_D - 0.5;
  side(densify([[-W, D], [W, D]], 25));
  side(densify([[W, D], [W, -D]], 25));
  side(densify([[W, -D], [-W, -D]], 25));
  side(densify([[-W, -D], [-W, D]], 25));
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3));
  wg.computeVertexNormals();
  scene.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: C.wall, side: THREE.DoubleSide, roughness: 1 })));
  const grid = new THREE.GridHelper(26000, 52, '#172036', '#10172a');
  grid.position.y = WALL - 2;
  scene.add(grid);

  /* Calles y ríos (OSM). */
  const roads: number[] = [];
  for (const f of data.roads) {
    if (f.geometry.type !== 'LineString') continue;
    const pts = densify(f.geometry.coordinates.map(([a, b]: [number, number]) => toXZ(a, b)), 35);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      if (insideAoi(ax, az) && insideAoi(bx, bz)) roads.push(ax, heightXZ(ax, az) + 2, az, bx, heightXZ(bx, bz) + 2, bz);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(roads, 3));
  const roadMat = new THREE.LineBasicMaterial({ color: C.road, transparent: true, opacity: 0.16, depthWrite: false });
  scene.add(new THREE.LineSegments(rg, roadMat));

  const ribbon: number[] = [];
  const streams: number[] = [];
  let otun: THREE.Vector3 | null = null;
  for (const f of data.waterways) {
    if (f.geometry.type !== 'LineString') continue;
    const name = String(f.properties.display_name ?? '');
    const pts = densify(f.geometry.coordinates.map(([a, b]: [number, number]) => toXZ(a, b)), 25).filter(([x, z]) => insideAoi(x, z));
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const ay = heightXZ(ax, az) + 2.5;
      const by = heightXZ(bx, bz) + 2.5;
      if (name.startsWith('Río')) {
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (-(bz - az) / len) * 11;
        const nz = ((bx - ax) / len) * 11;
        ribbon.push(ax + nx, ay, az + nz, bx + nx, by, bz + nz, bx - nx, by, bz - nz);
        ribbon.push(ax + nx, ay, az + nz, bx - nx, by, bz - nz, ax - nx, ay, az - nz);
      } else streams.push(ax, ay, az, bx, by, bz);
    }
    if (name.includes('Otún') && !otun) {
      const [mx, mz] = pts[Math.floor(pts.length * 0.35)];
      otun = new THREE.Vector3(mx, heightXZ(mx, mz) + 30, mz);
    }
  }
  const riv = new THREE.BufferGeometry();
  riv.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
  scene.add(new THREE.Mesh(riv, new THREE.MeshBasicMaterial({ color: C.river, side: THREE.DoubleSide, toneMapped: false })));
  const stg = new THREE.BufferGeometry();
  stg.setAttribute('position', new THREE.Float32BufferAttribute(streams, 3));
  scene.add(new THREE.LineSegments(stg, new THREE.LineBasicMaterial({ color: C.river, transparent: true, opacity: 0.5 })));

  /* ── Edificios, coloreados por la época del suelo (WSF Evolution) ──── */
  const bp: number[] = [];
  const bTop: number[] = [];
  const bAppear: number[] = [];
  const bCol: number[] = [];
  data.buildings.forEach((f, fi) => {
    const pts = toRing(ring(f));
    if (pts.length < 3) return;
    const [cx, cz] = centroid(pts);
    if (!insideAoi(cx, cz)) return;
    const y = data.porque.anio_edificio[fi] ?? 0;
    const c = yearColor(y);
    const at = appearAt(y) + ((fi * 0.6180339) % 1) * (y && y <= 1985 ? 0.9 : 0.3);
    const hs = pts.map(([x, z]) => heightXZ(x, z));
    const b0 = Math.min(...hs) - 1;
    const top = Math.max(Math.max(...hs) + 4, b0 + BUILDING_H);
    const push = (x: number, yy: number, z: number, isTop: number) => {
      bp.push(x, yy, z);
      bTop.push(isTop);
      bAppear.push(at);
      bCol.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % pts.length];
      push(ax, b0, az, 0); push(bx, b0, bz, 0); push(bx, top, bz, 1);
      push(ax, b0, az, 0); push(bx, top, bz, 1); push(ax, top, az, 1);
    }
    for (const [a, b, cc] of THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), [])) {
      push(pts[a][0], top, pts[a][1], 1);
      push(pts[b][0], top, pts[b][1], 1);
      push(pts[cc][0], top, pts[cc][1], 1);
    }
  });
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bg.setAttribute('aTop', new THREE.Float32BufferAttribute(bTop, 1));
  bg.setAttribute('aAppear', new THREE.Float32BufferAttribute(bAppear, 1));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(bCol, 3));
  bg.computeVertexNormals();
  const bU = { uT: { value: 0 }, uDim: { value: 0 }, uGlow: { value: 0 } };
  const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  bMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTop;\nattribute float aAppear;\nuniform float uT;\nvarying float vOn;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float k = clamp((uT - aAppear) / 0.7, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);
        vOn = k;
        transformed.y -= aTop * (1.0 - k) * 80.0;
        transformed.y -= (1.0 - step(0.001, k)) * 400.0;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDim;\nuniform float uGlow;\nvarying float vOn;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= 1.0 - 0.72 * uDim;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vColor.rgb * (0.16 + 0.5 * (1.0 - vOn) * vOn * 4.0 * uGlow) * (1.0 - 0.8 * uDim);`,
      );
  };
  scene.add(new THREE.Mesh(bg, bMat));

  /* ── Censo 2018 en malla de 300 m: mayores de 70 frente a niños ───── */
  const cells = data.porque.censo_malla_300m
    .map((c) => {
      const [x, z] = toXZ(c.lon, c.lat);
      return { x, z, ratio: c.mayores_70 / Math.max(1, c.ninos_0_9), kids: c.ninos_0_9 / c.personas, old: c.mayores_70 / c.personas };
    })
    .filter((c) => insideAoi(c.x, c.z));
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mkBars = (color: THREE.Color) => {
    const m = new THREE.InstancedMesh(
      box,
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.35, transparent: true }),
      cells.length,
    );
    return m;
  };
  const kidsBars = mkBars(C.kids);
  const oldBars = mkBars(C.elders);
  scene.add(kidsBars, oldBars);
  const setBars = (k: number) => {
    const o = new THREE.Object3D();
    cells.forEach((c, i) => {
      const y = heightXZ(c.x, c.z) + 8;
      o.position.set(c.x - 62, y, c.z);
      o.scale.set(110, Math.max(0.01, c.kids * 1700 * k), 110);
      o.updateMatrix();
      kidsBars.setMatrixAt(i, o.matrix);
      o.position.set(c.x + 62, y, c.z);
      o.scale.set(110, Math.max(0.01, c.old * 1700 * k), 110);
      o.updateMatrix();
      oldBars.setMatrixAt(i, o.matrix);
    });
    kidsBars.instanceMatrix.needsUpdate = true;
    oldBars.instanceMatrix.needsUpdate = true;
  };

  /* ── El daño observado (Copernicus EMS) ──────────────────────────── */
  const ev = data.evidence.map((f) => {
    const [x, z] = toXZ(...(f.geometry.coordinates as [number, number]));
    return new THREE.Vector3(x, heightXZ(x, z) + 22, z);
  });
  const eg = new THREE.BufferGeometry().setFromPoints(ev);
  const evCore = new THREE.PointsMaterial({ color: C.damage, size: 80, map: glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const evHalo = new THREE.PointsMaterial({ color: C.damage, size: 520, map: glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  scene.add(new THREE.Points(eg, evHalo), new THREE.Points(eg, evCore));
  const shock = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 128).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ff7a5c', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  shock.position.set(-HALF_W - 400, 700, 300);
  scene.add(shock);

  const places: { name: string; pos: THREE.Vector3 }[] = [];
  for (const name of ['Centro', 'Villavicencio', 'San Nicolás', 'Boston', 'Cuba']) {
    const f = data.admin.find((a) => Number(a.properties.admin_level) === 8 && a.properties.display_name === name);
    if (!f) continue;
    const [x, z] = toXZ(Number(f.properties.label_lon), Number(f.properties.label_lat));
    if (insideAoi(x, z)) places.push({ name, pos: new THREE.Vector3(x, heightXZ(x, z) + 70, z) });
  }
  if (otun) places.push({ name: 'Río Otún', pos: otun });

  const update = (t: number) => {
    bU.uT.value = t;
    bU.uGlow.value = env(t, T.growth[0], T.growth[1], 0.4, 0.6);
    const people = env(t, T.people[0] + 0.3, T.people[1] + 0.2, 1.0, 0.8);
    const insight = ease(t, T.insight[0], T.insight[0] + 1.2);
    const quakeDim = env(t, T.quake[0] + 0.4, T.quake[1] + 0.4, 0.8, 0.6);
    bU.uDim.value = Math.max(0.75 * people, 0.5 * quakeDim, 0.65 * insight);
    roadMat.opacity = 0.16 * (1 - 0.6 * people);

    setBars(people);
    for (const m of [kidsBars, oldBars]) (m.material as THREE.MeshStandardMaterial).opacity = Math.min(1, people * 1.4);
    kidsBars.visible = oldBars.visible = people > 0.002;

    const q = env(t, T.quake[0] + 0.6, 30.5, 0.9, 0.6);
    const pulse = 0.55 + 0.45 * Math.sin(t * 6.0);
    evCore.opacity = q * (1 - 0.45 * insight);
    evHalo.opacity = q * (0.35 + 0.4 * pulse) * (1 - 0.55 * insight);

    /* La onda del sismo entra desde el oeste, donde está el epicentro. */
    const s = (t - T.quake[0]) / 1.6;
    shock.visible = s > 0 && s < 1;
    if (shock.visible) {
      shock.scale.setScalar(300 + s * 9000);
      (shock.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - s);
    }
  };

  return { scene, update, places };
}
