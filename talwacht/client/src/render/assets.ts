import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const WARM_GREEN = new THREE.Color('#8ec45a');
const cache = new Map<string, Promise<THREE.Group | null>>();
const ROOT = `${import.meta.env.BASE_URL}assets/`;
/** 'hex/foo' → assets/hex/foo.gltf (KayKit); anything else → assets/models/foo.glb (Kenney) */
const urlFor = (name: string) => (name.startsWith('hex/') ? `${ROOT}${name}.gltf` : `${ROOT}models/${name}.glb`);

/** load a CC0 model once; null when the file is missing so callers can fall back */
export function loadModel(name: string): Promise<THREE.Group | null> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(urlFor(name)).then(g => {
      g.scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true; m.receiveShadow = true;
          const mt = m.material as THREE.MeshStandardMaterial; // kit materials ship fully metallic: render matte instead
          mt.metalness = 0; mt.roughness = 0.88;
          if (/grass|leaf/i.test(mt.name)) mt.color.lerp(WARM_GREEN, 0.62); // kit greens are teal; pull them toward our golden-hour meadow
        }
      });
      return g.scene;
    }).catch(() => null);
    cache.set(name, p);
  }
  return p;
}

/** clone a loaded model scaled so its largest horizontal extent equals `size` */
export async function modelInstance(name: string, size: number, opts: { y?: number } = {}): Promise<THREE.Object3D | null> {
  const src = await loadModel(name);
  if (!src) return null;
  const obj = src.clone(true);
  obj.traverse(o => { // own materials so hit flashes stay per unit
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = (m.material as THREE.Material).clone();
  });
  const box = new THREE.Box3().setFromObject(obj);
  const dim = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dim.x, dim.z, 0.0001);
  obj.scale.setScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.y += -b2.min.y + (opts.y ?? 0);
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
}
