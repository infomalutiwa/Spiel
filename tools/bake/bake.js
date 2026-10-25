import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const load = url => loader.loadAsync(url);
const PACKS = {
  adv: '/src/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/',
  skel: '/src/KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/',
};

/** read a texture's pixels once so colours can be baked into vertex colours (KayKit textures are flat palettes) */
const pixelCache = new WeakMap();
function pixels(tex) {
  let p = pixelCache.get(tex);
  if (!p) {
    const img = tex.image, c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    p = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
    pixelCache.set(tex, p);
  }
  return p;
}
function colorAt(mat, u, v) {
  const base = mat.color ? mat.color : new THREE.Color(1, 1, 1);
  if (!mat.map) return [base.r, base.g, base.b]; // linear
  const p = pixels(mat.map);
  const x = Math.min(p.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * p.w)));
  const y = Math.min(p.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * p.h)));
  const i = (y * p.w + x) * 4;
  const c = new THREE.Color().setRGB(p.d[i] / 255, p.d[i + 1] / 255, p.d[i + 2] / 255, THREE.SRGBColorSpace); // -> linear working space
  return [c.r * base.r, c.g * base.g, c.b * base.b];
}

/** collect renderable meshes of a scene with a visibility filter */
function meshesOf(root, hide) {
  const out = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.name && hide.some(h => (h instanceof RegExp ? h.test(p.name) : p.name === h))) return;
    out.push(o);
  });
  return out;
}

/** an extra static prop (weapon, shield…) glued to a bone */
async function attach(root, w) {
  const bone = root.getObjectByName(w.bone);
  if (!bone) throw new Error('no bone ' + w.bone);
  let obj;
  if (w.proc) obj = w.proc(); else obj = (await load(w.file)).scene;
  const holder = new THREE.Group();
  holder.add(obj);
  if (w.pos) holder.position.set(...w.pos);
  if (w.rot) holder.rotation.set(...w.rot);
  if (w.scale) holder.scale.setScalar(w.scale);
  bone.add(holder);
  return holder;
}

/** CPU-skin every mesh for the current pose and append to the frame buffers (positions/normals in root space) */
function samplePose(root, meshes, vcount, outPos, outNrm, offset, rootInv) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), n = new THREE.Vector3();
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  for (const mesh of meshes) {
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    m.multiplyMatrices(rootInv, mesh.matrixWorld);
    nm.getNormalMatrix(m);
    const pos = mesh.geometry.attributes.position, nrm = mesh.geometry.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      if (mesh.isSkinnedMesh) {
        mesh.getVertexPosition(i, v);
        // skin the normal by skinning a nearby point (robust and cheap enough offline)
        n.fromBufferAttribute(nrm, i);
        v2.fromBufferAttribute(pos, i).addScaledVector(n, 0.02);
        const keep = v2.clone();
        // temporarily write the displaced vertex, skin it, restore
        const ox = pos.getX(i), oy = pos.getY(i), oz = pos.getZ(i);
        pos.setXYZ(i, keep.x, keep.y, keep.z);
        const sk = new THREE.Vector3(); mesh.getVertexPosition(i, sk);
        pos.setXYZ(i, ox, oy, oz);
        n.copy(sk).sub(v).normalize();
      } else {
        v.fromBufferAttribute(pos, i);
        n.fromBufferAttribute(nrm, i);
      }
      v.applyMatrix4(m);
      n.applyMatrix3(nm).normalize();
      const k = (offset + i) * 3;
      outPos[k] = v.x; outPos[k + 1] = v.y; outPos[k + 2] = v.z;
      outNrm[k] = n.x; outNrm[k + 1] = n.y; outNrm[k + 2] = n.z;
    }
    offset += pos.count;
  }
}

function staticTopology(meshes) {
  let vcount = 0, icount = 0;
  for (const m of meshes) { vcount += m.geometry.attributes.position.count; icount += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const index = new Uint32Array(icount), color = new Float32Array(vcount * 3);
  let vo = 0, io = 0;
  for (const m of meshes) {
    const g = m.geometry, pos = g.attributes.position, uv = g.attributes.uv;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const col = g.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      let c;
      if (col) c = [col.getX(i), col.getY(i), col.getZ(i)];
      else c = colorAt(mats[0], uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      color.set(c, (vo + i) * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < pos.count; i++) index[io++] = vo + i;
    vo += pos.count;
  }
  return { vcount, icount, index, color };
}

/** clip -> list of sample times */
function times(clip, n, mode) {
  const d = clip.duration;
  return Array.from({ length: n }, (_, i) => mode === 'once' ? (n === 1 ? 0 : (d * i) / (n - 1)) : (d * i) / n);
}

export async function bakeModel(spec) {
  const gltf = await load(spec.char);
  const root = gltf.scene;
  const attached = [];
  for (const w of spec.attach ?? []) attached.push(await attach(root, w));
  const meshes = meshesOf(root, spec.hide ?? []);
  const extra = spec.extraMeshes ? spec.extraMeshes(root) : [];
  const all = [...meshes, ...extra];
  const topo = staticTopology(all);
  const mixer = new THREE.AnimationMixer(root);
  const clipByName = Object.fromEntries(gltf.animations.map(a => [a.name, a]));
  const frames = []; // {pos, nrm}
  const clips = {};
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4(); // identity: bake in the character's own space
  const scale = spec.scale ?? 1;
  const rootM = new THREE.Matrix4().makeScale(scale, scale, scale);
  for (const [key, c] of Object.entries(spec.clips)) {
    const clip = clipByName[c.name];
    if (!clip) throw new Error(`${spec.id}: no clip ${c.name}`);
    const act = mixer.clipAction(clip); act.play(); act.paused = true;
    const start = frames.length;
    const mode = c.mode ?? 'loop';
    for (const [fi, t] of times(clip, c.frames, mode).entries()) {
      act.time = Math.min(t, clip.duration);
      mixer.update(0);
      // phase 0..1 over the clip, independent of the source clip's duration (pose-only clips have none)
      if (spec.poseFix) spec.poseFix(root, key, mode === 'once' ? (c.frames > 1 ? fi / (c.frames - 1) : 0) : fi / c.frames);
      const pos = new Float32Array(topo.vcount * 3), nrm = new Float32Array(topo.vcount * 3);
      samplePose(root, all, topo.vcount, pos, nrm, 0, rootInv);
      if (spec.frameTransform) spec.frameTransform(pos, nrm, key, frames.length - start, c.frames);
      frames.push({ pos, nrm });
    }
    act.stop();
    clips[key] = [start, c.frames];
  }
  void rootM;
  return pack(spec.id, topo, frames, clips, spec);
}

/** quantise and pack into one ArrayBuffer */
function pack(id, topo, frames, clips, spec) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const f of frames) for (let i = 0; i < f.pos.length; i += 3) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], f.pos[i + a]); max[a] = Math.max(max[a], f.pos[i + a]);
  }
  const V = topo.vcount, I = topo.icount;
  const idx32 = V > 65535;
  const iBytes = idx32 ? I * 4 : I * 2;
  const cBytes = V * 3;
  const head = Math.ceil((iBytes + cBytes) / 4) * 4;
  const perFrame = V * 3 * 2 + V * 3; // u16 pos + i8 normals
  const per = Math.ceil(perFrame / 4) * 4;
  const buf = new ArrayBuffer(head + per * frames.length);
  const dv = new DataView(buf);
  let o = 0;
  const idxArr = idx32 ? new Uint32Array(buf, 0, I) : new Uint16Array(buf, 0, I);
  for (let i = 0; i < I; i++) idxArr[i] = topo.index[i];
  o = iBytes;
  const col = new Uint8Array(buf, o, cBytes);
  // gamma-encode the linear vertex colours into bytes
  for (let i = 0; i < V; i++) {
    const c = new THREE.Color().setRGB(topo.color[i * 3], topo.color[i * 3 + 1], topo.color[i * 3 + 2], THREE.LinearSRGBColorSpace);
    const hex = c.getHex(THREE.SRGBColorSpace);
    col[i * 3] = (hex >> 16) & 255; col[i * 3 + 1] = (hex >> 8) & 255; col[i * 3 + 2] = hex & 255;
  }
  frames.forEach((f, fi) => {
    const base = head + per * fi;
    const p = new Uint16Array(buf, base, V * 3);
    const n = new Int8Array(buf, base + V * 3 * 2, V * 3);
    for (let i = 0; i < V * 3; i++) {
      const a = i % 3;
      p[i] = Math.round(((f.pos[i] - min[a]) / Math.max(1e-6, max[a] - min[a])) * 65535);
      n[i] = Math.round(Math.max(-1, Math.min(1, f.nrm[i])) * 127);
    }
  });
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    meta: { id, verts: V, indices: I, idx32, frames: frames.length, clips, min, max, head, per, height: spec.height ?? max[1] },
    b64: btoa(bin),
  };
}

window.PACKS = PACKS; window.THREE = THREE; window.load = load; window.bakeModel = bakeModel; window.attach = attach;
window.meshesOf = meshesOf;
window.ready = true;
