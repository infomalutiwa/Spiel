import * as THREE from 'three';

export type Clip = 'idle' | 'walk' | 'attack' | 'death';
interface Meta {
  id: string; verts: number; indices: number; idx32: boolean; frames: number;
  clips: Record<Clip, [number, number]>; min: number[]; max: number[]; head: number; per: number; height: number;
}
export interface BakedModel {
  id: string;
  /** one geometry per animation frame; all share index and colour buffers */
  frames: THREE.BufferGeometry[];
  clips: Record<Clip, [number, number]>;
  height: number;
}

const BASE = `${import.meta.env.BASE_URL}assets/units/`;
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lut = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

let manifest: Promise<Record<string, Meta>> | undefined;
const cache = new Map<string, Promise<BakedModel | null>>();

/** build GPU geometry for every frame of a baked model (see tools/bake) */
async function build(id: string): Promise<BakedModel | null> {
  manifest ??= fetch(`${BASE}manifest.json`).then(r => r.json());
  const meta = (await manifest)[id];
  if (!meta) return null;
  const buf = await (await fetch(`${BASE}${id}.bin`)).arrayBuffer();
  const V = meta.verts, I = meta.indices;
  const index = new THREE.BufferAttribute(meta.idx32 ? new Uint32Array(buf, 0, I) : new Uint16Array(buf, 0, I), 1);
  const cOff = I * (meta.idx32 ? 4 : 2);
  const bytes = new Uint8Array(buf, cOff, V * 3);
  const colArr = new Float32Array(V * 3);
  for (let i = 0; i < V * 3; i++) colArr[i] = lut[bytes[i]];
  const color = new THREE.BufferAttribute(colArr, 3);
  const frames: THREE.BufferGeometry[] = [];
  const ext = meta.max.map((m, a) => m - meta.min[a]);
  for (let f = 0; f < meta.frames; f++) {
    const base = meta.head + meta.per * f;
    const q = new Uint16Array(buf, base, V * 3), n = new Int8Array(buf, base + V * 3 * 2, V * 3);
    const pos = new Float32Array(V * 3), nrm = new Float32Array(V * 3);
    for (let i = 0; i < V * 3; i++) {
      const a = i % 3;
      pos[i] = meta.min[a] + (q[i] / 65535) * ext[a];
      nrm[i] = n[i] / 127;
    }
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3), na = new THREE.BufferAttribute(nrm, 3);
    if (f !== meta.clips.idle[0]) { // free the CPU copy once uploaded (the idle pose stays for portraits and bounding boxes)
      const drop = function (this: THREE.BufferAttribute) { (this as unknown as { array: unknown }).array = new Float32Array(0); };
      pa.onUpload(drop); na.onUpload(drop);
    }
    g.setAttribute('position', pa); g.setAttribute('normal', na); g.setAttribute('color', color); g.setIndex(index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, meta.height / 2, 0), meta.height * 1.2);
    frames.push(g);
  }
  return { id, frames, clips: meta.clips, height: meta.height };
}

export function loadBaked(id: string): Promise<BakedModel | null> {
  let p = cache.get(id);
  if (!p) { p = build(id).catch(() => null); cache.set(id, p); }
  return p;
}
