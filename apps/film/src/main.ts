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

const stage = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(34, W / H, 20, 40000);

const json = (name: string) =>
  fetch(`${DATA}/geojson/${name}.json`).then((r) => r.json()).then((g) => g.features);

async function boot() {
  await loadDem(DATA);
  const [buildings, roads, waterways, evidence, sites, population, catchments, publicSpace, green, facilities, admin] =
    await Promise.all(
      ['buildings', 'roads', 'waterways', 'evidence', 'sites', 'population', 'catchments',
        'municipal_public_space', 'green', 'municipal_facilities', 'admin_areas'].map(json),
    );
  const data: Data = { buildings, roads, waterways, evidence, sites, population, catchments, publicSpace, green, facilities, admin };
  const world = buildWorld(data);
  const overlay = buildOverlay(document.getElementById('overlay')!);

  const f = world.focus;
  /* Objetivo desplazado a la derecha del sitio: la tarjeta ocupa la derecha
     de la pantalla y el sitio queda a la izquierda, a la vista. */
  const right = (dx: number, dz: number): [number, number, number] => [f.x + dx, f.y + 20, f.z + dz];
  const keys: Key[] = [
    { t: 0, pos: [-5600, 5200, 6200], tgt: [250, 120, 0] },
    { t: 6.9, pos: [-4300, 3700, 5300], tgt: [250, 160, 0] },
    { t: 10.8, pos: [-2300, 2550, 9900], tgt: [2000, 1480, 860] },
    { t: 18.7, pos: [-1700, 2750, 9500], tgt: [2000, 1520, 860] },
    { t: 23.3, pos: [-1800, 2900, 8800], tgt: [1500, 1300, 600] },
    { t: 27.8, pos: [-3800, 3600, 4900], tgt: [300, 120, 0] },
    { t: 33.2, pos: [-900, 2300, 2900], tgt: [f.x - 300, f.y, f.z + 100] },
    { t: 39.6, pos: [f.x - 1450, f.y + 1050, f.z + 1350], tgt: right(250, -80) },
    { t: 46.6, pos: [f.x - 1150, f.y + 820, f.z + 1250], tgt: right(420, -120) },
    { t: 50.8, pos: [f.x - 1300, f.y + 900, f.z + 1100], tgt: right(450, -150) },
    { t: 55.5, pos: [-5500, 4300, 4700], tgt: [-250, 100, -1100] },
    { t: DURATION, pos: [-6100, 4700, 5300], tgt: [-250, 100, -1100] },
  ];
  const cam = makeCamera(keys);

  const v = new THREE.Vector3();
  const project = (p: THREE.Vector3) => {
    v.copy(p).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, ok: v.z < 1 && v.z > -1 };
  };
  const anchors = {
    layer: (_i: number) => new THREE.Vector3(),
    site: new THREE.Vector3(f.x, f.y + 40, f.z),
    catchment: world.catchmentAnchor,
    places: world.places,
  };

  const render = (t: number) => {
    world.update(t);
    cam(t, camera);
    camera.updateMatrixWorld();
    anchors.layer = (i: number) => world.layerAnchor(i, t);
    updateOverlay(overlay, t, project, anchors);
    renderer.render(world.scene, camera);
  };
  window.__render = render;
  window.__duration = DURATION;

  const tParam = params.get('t');
  if (params.has('play')) {
    const t0 = performance.now() - Number(tParam ?? 0) * 1000;
    const loop = () => {
      render(((performance.now() - t0) / 1000) % DURATION);
      requestAnimationFrame(loop);
    };
    loop();
  } else {
    render(Number(tParam ?? 0));
  }
  await document.fonts.ready;
}

window.__ready = boot();
