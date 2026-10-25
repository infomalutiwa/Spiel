import * as THREE from 'three';
import { TROOP_ORDER, type PlayerId, type TroopType } from '@burgwacht/shared';
import { loadBaked } from './baked';
import { modelInstance } from './assets';

const TINT = [new THREE.Color(0.85, 0.97, 1.25), new THREE.Color(1.25, 0.88, 0.97)];

/** render each troop once to a small transparent PNG for the shop cards (fills in as models finish loading) */
export async function renderPortraits(owner: PlayerId, onReady: (t: TroopType, url: string) => void): Promise<void> {
  const size = 192;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size, false);
  r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff1d6', '#d9b88f', 1.7));
  const d = new THREE.DirectionalLight('#ffe2b0', 2.4); d.position.set(3, 6, 5); scene.add(d);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
  for (const t of TROOP_ORDER) {
    let obj: THREE.Object3D | null = null;
    if (t === 'catapult') obj = await modelInstance('siege-catapult', 4.6);
    else {
      const m = await loadBaked(t);
      if (m) {
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
        mat.color.copy(t === 'healer' ? new THREE.Color(1.5, 1.55, 1.3) : TINT[owner]);
        obj = new THREE.Mesh(m.frames[m.clips.idle[0]], mat);
        obj.scale.setScalar(1.45);
      }
    }
    if (!obj) continue;
    obj.rotation.y = 0.5;
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const dist = (Math.max(sz.y * 1.05, sz.x * 1.1, sz.z) / 2) / Math.tan((cam.fov * Math.PI) / 360);
    cam.position.set(c.x + dist * 0.25, c.y + dist * 0.18, c.z + dist);
    cam.lookAt(c);
    r.render(scene, cam);
    onReady(t, r.domElement.toDataURL('image/png'));
    scene.remove(obj);
  }
  r.dispose();
}
