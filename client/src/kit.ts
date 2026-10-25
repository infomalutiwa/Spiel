import * as THREE from 'three';
import { loadModel } from './render/assets';
const names = (new URLSearchParams(location.search).get('m') ?? 'wall').split(',');
const cv = document.getElementById('c') as HTMLCanvasElement;
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setSize(innerWidth, innerHeight, false);
const s = new THREE.Scene(); s.background = new THREE.Color('#cfe8d0');
s.add(new THREE.HemisphereLight('#fff', '#8a7', 1.4)); const d = new THREE.DirectionalLight('#fff', 2); d.position.set(5, 10, 6); s.add(d);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
const g = new THREE.GridHelper(40, 40, '#999', '#bbb'); s.add(g);
let x = 0;
for (const n of names) {
  const m = await loadModel(n); if (!m) continue;
  const o = m.clone(true); o.position.x = x; s.add(o); x += 4.6;
}
cam.position.set((x - 4.6) / 2 + 4, 5, 9 + names.length * 1.3); cam.lookAt((x - 4.6) / 2, 0.6, 0);
r.render(s, cam); (window as unknown as { done: boolean }).done = true;
