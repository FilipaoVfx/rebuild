import * as THREE from 'three';
import { smooth } from './timeline';

/**
 * La cámara recorre puntos clave con una curva continua (Catmull-Rom) para
 * posición y para objetivo. Entre claves, el tiempo se suaviza, así que cada
 * tramo arranca y frena sin saltos.
 */
export interface Key {
  t: number;
  pos: [number, number, number];
  tgt: [number, number, number];
}

export function makeCamera(keys: Key[]) {
  const P = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
  const G = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.tgt)), false, 'centripetal');
  const n = keys.length - 1;
  const param = (t: number) => {
    if (t <= keys[0].t) return 0;
    if (t >= keys[n].t) return 1;
    let i = 0;
    while (t > keys[i + 1].t) i++;
    const local = (t - keys[i].t) / (keys[i + 1].t - keys[i].t);
    /* Suavizado parcial: continuidad sin frenar del todo en cada clave. */
    const s = 0.55 * smooth(local) + 0.45 * local;
    return (i + s) / n;
  };
  return (t: number, cam: THREE.PerspectiveCamera) => {
    const u = param(t);
    cam.position.copy(P.getPoint(u));
    cam.lookAt(G.getPoint(u));
  };
}
