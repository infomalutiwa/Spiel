import * as THREE from 'three';
import { TROOP_ORDER, type PlayerId } from '@burgwacht/shared';
import { buildRig } from './models';
import { PAL } from './palette';

/** render each troop once to a small transparent PNG for the shop cards */
export function renderPortraits(owner: PlayerId): Record<string, string> {
  const size = 192;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size, false);
  r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff1d6', '#d9b88f', 1.6));
  const d = new THREE.DirectionalLight('#ffe2b0', 2.2); d.position.set(3, 6, 5); scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const out: Record<string, string> = {};
  for (const t of TROOP_ORDER) {
    const rig = buildRig(t, PAL.team[owner], false, 3);
    rig.root.rotation.y = -0.55;
    scene.add(rig.root);
    const box = new THREE.Box3().setFromObject(rig.root);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const dist = Math.max(sz.y * 1.35, sz.x * 1.2, sz.z * 1.0) / Math.tan((cam.fov * Math.PI) / 360) * 0.5;
    cam.position.set(c.x + dist * 0.3, c.y + dist * 0.25, c.z + dist);
    cam.lookAt(c);
    // siege models load asynchronously; the crate placeholder is acceptable for the first paint
    r.render(scene, cam);
    out[t] = r.domElement.toDataURL('image/png');
    scene.remove(rig.root);
  }
  r.dispose();
  return out;
}
