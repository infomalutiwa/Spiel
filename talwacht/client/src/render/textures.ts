import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/** CC0 PBR texture sets from Poly Haven (1k jpg: diffuse, OpenGL normal, AO/roughness/metal) */
export interface TexSet { map: THREE.Texture; normal: THREE.Texture; arm: THREE.Texture }
const loader = new THREE.TextureLoader();
const ROOT = `${import.meta.env.BASE_URL}assets/tex/`;
const cache = new Map<string, TexSet>();
let aniso = 4;
export const setAnisotropy = (a: number) => { aniso = a; };

function tex(file: string, srgb: boolean) {
  const t = loader.load(ROOT + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function texSet(id: string): TexSet {
  let s = cache.get(id);
  if (!s) { s = { map: tex(`${id}_diff.jpg`, true), normal: tex(`${id}_nor_gl.jpg`, false), arm: tex(`${id}_arm.jpg`, false) }; cache.set(id, s); }
  return s;
}

/** equirect HDR sky: image-based light for every material plus the visible backdrop */
export function loadSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene, onDone?: () => void) {
  new HDRLoader().load(ROOT + 'sky_1k.hdr', hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.35;
    scene.background = hdr;
    scene.backgroundIntensity = 0.95;
    pm.dispose();
    onDone?.();
  });
}

/** shared GLSL: world-space triplanar sampling */
export const TRIPLANAR = /* glsl */ `
vec4 triSample(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s) * w.y + texture2D(t, p.xy * s) * w.z;
}`;
