import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/source-serif-4';
import * as THREE from 'three';
import { makeCamera, type Key } from './camera';
import { loadDem } from './geo';
import { buildOverlay, updateOverlay } from './overlay';
import { buildWorld, type Data } from './scene';
import './style.css';
import { DURATION } from './timeline';

declare global {
  interface Window {
    __ready: Promise<void>;
    __render: (t: number) => void;
    __duration: number;
  }
}

const params = new URLSearchParams(location.search);
const DATA = params.get('data') ?? '../data';
const W = 2560;
const H = 1440;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage')!.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(34, W / H, 20, 40000);

const json = (url: string) => fetch(url).then((r) => r.json());
const layer = (n: string) => json(`${DATA}/geojson/${n}.json`).then((g) => g.features);

async function boot() {
  await loadDem(DATA);
  const [buildings, roads, waterways, evidence, admin, porque] = await Promise.all([
    layer('buildings'), layer('roads'), layer('waterways'), layer('evidence'), layer('admin_areas'),
    json('./porque.json'),
  ]);
  const data: Data = { buildings, roads, waterways, evidence, admin, porque };
  const world = buildWorld(data);
  const overlay = buildOverlay(document.getElementById('overlay')!, porque.stats);

  /* Una órbita lenta y continua: la ciudad entera, después el centro viejo,
     el impacto, y de nuevo la ciudad. */
  const keys: Key[] = [
    { t: 0, pos: [-6200, 5600, 5600], tgt: [300, 0, 0] },
    { t: 5.0, pos: [-5000, 4100, 5200], tgt: [300, 100, 0] },
    { t: 12.6, pos: [-1800, 3600, 6000], tgt: [600, 100, -200] },
    { t: 16.0, pos: [-400, 3700, 5600], tgt: [700, 100, -700] },
    { t: 18.6, pos: [900, 4300, 5200], tgt: [500, 100, -900] },
    { t: 21.4, pos: [-1300, 2900, 3900], tgt: [-100, 120, -500] },
    { t: 23.2, pos: [-1500, 3500, 4300], tgt: [-300, 100, -500] },
    { t: 27.6, pos: [-3800, 5200, 5600], tgt: [0, 0, -300] },
    { t: DURATION, pos: [-4400, 5800, 6000], tgt: [0, 0, -300] },
  ];
  const cam = makeCamera(keys);
  const v = new THREE.Vector3();
  const project = (p: THREE.Vector3) => {
    v.copy(p).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, ok: v.z < 1 && v.z > -1 };
  };

  window.__render = (t: number) => {
    world.update(t);
    cam(t, camera);
    camera.updateMatrixWorld();
    updateOverlay(overlay, t, project, world.places);
    renderer.render(world.scene, camera);
  };
  window.__duration = DURATION;
  if (params.has('play')) {
    const t0 = performance.now() - Number(params.get('t') ?? 0) * 1000;
    const loop = () => {
      window.__render(((performance.now() - t0) / 1000) % DURATION);
      requestAnimationFrame(loop);
    };
    loop();
  } else window.__render(Number(params.get('t') ?? 0));
  await document.fonts.ready;
}

window.__ready = boot();
