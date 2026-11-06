import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DIRS, WALL_TOP, type StructId } from '@talwacht/shared';
import { texSet, TRIPLANAR } from './textures';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------- Blender-built wall modules (tools/blender/castle_kit.py) ----------
/** bumped when the Blender kit has loaded, so cached procedural walls get rebuilt */
export let kitVersion = 0;
const KIT_MODULES = new Map<string, THREE.BufferGeometry>();
const MAT_ID: Record<string, number> = { stone: 0, stone_dark: 0, stone_top: 0, plinth: 0, stone3: 0, stone3_dark: 0, wood: 1, wood_dark: 1, plank: 1, iron: 3 };
/** glTF meshes → one non-indexed geometry with colour = material colour × baked AO, plus the kit material id */
function moduleGeometry(obj: THREE.Object3D): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)).toNonIndexed();
    const mt = m.material as THREE.MeshStandardMaterial, n = g.attributes.position.count;
    const base = mt.color.clone(), ao = g.attributes.color as THREE.BufferAttribute | undefined;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = ao ? 0.35 + 0.65 * ao.getX(i) : 1;
      col[i * 3] = base.r * a; col[i * 3 + 1] = base.g * a; col[i * 3 + 2] = base.b * a;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('kmat', new THREE.BufferAttribute(new Float32Array(n).fill(MAT_ID[mt.name] ?? 3), 1));
    parts.push(out);
  });
  return mergeGeometries(parts, false)!;
}
/** mirror across z (outer side flips) keeping triangles front-facing */
function mirrorZ(g: THREE.BufferGeometry) {
  const m = g.clone(); m.scale(1, 1, -1);
  const p = m.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) for (const name of ['position', 'normal', 'color', 'kmat']) {
    const a = m.attributes[name] as THREE.BufferAttribute, k = a.itemSize;
    for (let c = 0; c < k; c++) { const t = a.array[(i + 1) * k + c]; (a.array as Float32Array)[(i + 1) * k + c] = a.array[(i + 2) * k + c]; (a.array as Float32Array)[(i + 2) * k + c] = t; }
  }
  return m;
}
export function loadWallKit(): Promise<void> {
  return new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/kit_walls.glb`).then(gltf => {
    for (const o of gltf.scene.children) {
      const g = moduleGeometry(o);
      KIT_MODULES.set(o.name, g); KIT_MODULES.set(`${o.name}~m`, mirrorZ(g));
    }
    kitVersion++;
  }).catch(e => console.warn('wall kit', e));
}
function kitWall(tier: number, mask: number, keepSide: number, damage: number): THREE.BufferGeometry | null {
  const arm = KIT_MODULES.get(`arm${tier}${damage ? '_d' : ''}`);
  if (!arm) return null;
  const parts: THREE.BufferGeometry[] = [];
  let links = 0, straight = false;
  const dirs: [number, number][] = [];
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) { links++; dirs.push(DIRS[i] as [number, number]); }
  if (dirs.length === 2 && dirs[0][0] === -dirs[1][0] && dirs[0][1] === -dirs[1][1]) straight = true;
  const pier = KIT_MODULES.get(tier === 1 ? 'pier1' : `pier${tier}${straight || links === 0 ? '' : '_c'}`)!;
  parts.push(pier.clone());
  for (const [dx, dy] of dirs) {
    const l = Math.hypot(dx, dy), s = outerSign(dx / l, dy / l, keepSide);
    const g = (s > 0 ? KIT_MODULES.get(`arm${tier}${damage ? '_d' : ''}~m`)! : arm).clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.atan2(dy, dx)).multiply(new THREE.Matrix4().makeScale(l, 1, 1)));
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

/**
 * Procedural castle kit. Every rampart cell = centre pier + one half-arm per connected neighbour (see shared/autotile),
 * so straight runs, corners, T-junctions, diagonals and cliff anchors join without rotation tables.
 * All pieces share one palette and one walkway height per tier, so walls, gates and towers line up.
 */
export const KIT = {
  stone: '#bdb19b', stoneDark: '#8f8473', stoneTop: '#d3c8b2', plinth: '#7b7262',
  stone3: '#a69d90', stone3Dark: '#7f776c',
  wood: '#8a6440', woodDark: '#5e4128', plank: '#a87b4c',
  roof: '#3f5f8f', roofDark: '#2f4870', iron: '#3b3b42', gold: '#d9b45a', red: '#b23a34', torch: '#ffb347',
};
export const DEPTH = 3; // walls reach this far below their base so slopes never show a gap

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** surface family for the textured kit shader: 0 stone, 1 wood, 2 roof, 3 plain (iron, cloth, dark slits) */
const MAT_OF = new Map<string, number>([
  [KIT.stone, 0], [KIT.stoneDark, 0], [KIT.stoneTop, 0], [KIT.plinth, 0], [KIT.stone3, 0], [KIT.stone3Dark, 0],
  [KIT.wood, 1], [KIT.woodDark, 1], [KIT.plank, 1], ['#7a5634', 1], ['#5e4128', 1], ['#8b6b4b', 1],
  [KIT.roof, 2], [KIT.roofDark, 2],
]);
function tagMat(g: THREE.BufferGeometry, color: string) {
  const id = MAT_OF.get(color) ?? 3;
  g.setAttribute('kmat', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(id), 1));
  return g;
}

/** box with flat colours (top a bit lighter, slight random tone per box) */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0, jitter = 0.06, topColor?: string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const col = new Float32Array(g.attributes.position.count * 3), base = new THREE.Color(color);
  const k = 1 + (rnd() - 0.5) * 2 * jitter;
  for (let f = 0; f < 6; f++) {
    _c.copy(f === 2 && topColor ? new THREE.Color(topColor) : base).multiplyScalar(k * (f === 2 ? 1.08 : f === 3 ? 0.7 : 1));
    for (let v = 0; v < 6; v++) { const i = (f * 6 + v) * 3; col[i] = _c.r; col[i + 1] = _c.g; col[i + 2] = _c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.applyMatrix4(_m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
  return tagMat(g, color);
}
function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: string, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed();
  const col = new Float32Array(g.attributes.position.count * 3), c = new THREE.Color(color).multiplyScalar(1 + (rnd() - 0.5) * 0.12);
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(x, y, z);
  return tagMat(g, color);
}
function cone(r: number, h: number, x: number, y: number, z: number, color: string, seg = 8) { return cyl(0.01, r, h, x, y, z, color, seg); }
const merge = (gs: THREE.BufferGeometry[]) => { const g = mergeGeometries(gs, false)!; g.computeVertexNormals(); gs.forEach(x => x.dispose()); return g; };

export const kitMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, flatShading: true });
{
  const stone = texSet('castle_wall_slates'), wood = texSet('brown_planks_05'), roof = texSet('roof_slates_02');
  kitMaterial.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tStone: { value: stone.map }, tWood: { value: wood.map }, tRoof: { value: roof.map } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float kmat; varying float vKmat; varying vec3 vKP; varying vec3 vKN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vKmat = kmat;
vec4 kp = vec4(position, 1.0); vec3 kn = normal;
#ifdef USE_INSTANCING
kp = instanceMatrix * kp; kn = mat3(instanceMatrix) * kn;
#endif
vKP = (modelMatrix * kp).xyz; vKN = normalize(mat3(modelMatrix) * kn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tStone, tWood, tRoof; varying float vKmat; varying vec3 vKP; varying vec3 vKN;
${TRIPLANAR}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 n = normalize(vKN); float m = floor(vKmat + 0.5);
  vec3 t = vec3(1.0);
  if (m < 0.5) t = triSample(tStone, vKP, n, 0.42).rgb / max(textureLod(tStone, vec2(0.5), 12.0).rgb, vec3(0.05));
  else if (m < 1.5) t = triSample(tWood, vKP, n, 0.35).rgb / max(textureLod(tWood, vec2(0.5), 12.0).rgb, vec3(0.05));
  else if (m < 2.5) t = triSample(tRoof, vKP, n, 0.45).rgb / max(textureLod(tRoof, vec2(0.5), 12.0).rgb, vec3(0.05));
  t = mix(vec3(dot(t, vec3(0.333))), t, 0.4);
  diffuseColor.rgb *= clamp(t, 0.3, 1.9);
}`);
  };
}

/** is the arm's outer side (the one facing the enemy) on its left (+1) or right (-1)? */
function outerSign(dx: number, dy: number, keepSide: number) {
  // normal (−dy, dx); facing the enemy means negative y
  const ny = dx;
  if (Math.abs(ny) > 0.01) return ny < 0 ? 1 : -1;
  return dy * keepSide > 0 ? 1 : -1; // walls running front-to-back: outer side away from the keep (normal x = −dy·s = −keepSide)
}

/**
 * Rampart cell geometry centred at the origin, ground at y = 0.
 * tier 1 = palisade, 2 = stone wall, 3 = reinforced; mask bits as in autotile (N = −z); keepSide: +1 when the keep is to the +x side.
 * damage 0 = whole, 1 = battered (merlons missing), 2 = breaking (more missing, cracks darker)
 */
export function wallGeometry(tier: number, mask: number, keepSide: number, damage = 0, seedId = 1): THREE.BufferGeometry {
  const fromKit = kitWall(tier, mask, keepSide, damage);
  if (fromKit) return fromKit;
  seed = 1000 + tier * 97 + mask * 13 + damage * 7 + (seedId % 5);
  const top = WALL_TOP[tier - 1];
  const parts: THREE.BufferGeometry[] = [];
  const arms: { dx: number; dy: number; len: number }[] = [];
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) { const [dx, dy] = DIRS[i]; const l = Math.hypot(dx, dy); arms.push({ dx: dx / l, dy: dy / l, len: 2 * l }); }
  const straight = arms.length === 2 && Math.abs(arms[0].dx + arms[1].dx) < 0.01 && Math.abs(arms[0].dy + arms[1].dy) < 0.01;
  if (tier === 1) {
    // palisade: sharpened logs with a plank walk on the inside
    const lineArms = arms.length ? arms : [{ dx: 1, dy: 0, len: 1.2 }, { dx: -1, dy: 0, len: 1.2 }];
    for (const a of lineArms) {
      const n = Math.max(1, Math.round(a.len / 0.48));
      const s = outerSign(a.dx, a.dy, keepSide), nx = -a.dy * s, ny = a.dx * s;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n * a.len, x = a.dx * t, z = a.dy * t, h = 3.3 + (rnd() - 0.5) * 0.35;
        parts.push(cyl(0.24, 0.27, h + DEPTH, x, (h - DEPTH) / 2, z, rnd() < 0.5 ? KIT.wood : KIT.woodDark, 6));
        parts.push(cone(0.27, 0.6, x, h + 0.3, z, KIT.woodDark, 6));
        if (k % 3 === 1) parts.push(box(0.18, 1.1, 0.18, x - nx * 1.1, top - 0.55, z - ny * 1.1, KIT.woodDark));
      }
      const mx = a.dx * a.len / 2 - nx * 0.75, mz = a.dy * a.len / 2 - ny * 0.75;
      parts.push(box(a.len + 0.2, 0.18, 1.3, mx, top - 0.1, mz, KIT.plank, -Math.atan2(a.dy, a.dx)));
      parts.push(box(a.len + 0.2, 0.22, 0.3, a.dx * a.len / 2, 1.2, a.dy * a.len / 2, KIT.woodDark, -Math.atan2(a.dy, a.dx))); // binding beam
    }
    parts.push(cyl(0.34, 0.36, 3.6 + DEPTH, 0, (3.6 - DEPTH) / 2, 0, KIT.woodDark, 6));
    return merge(parts);
  }
  const T = tier === 3 ? 2.9 : 2.4;
  const body = tier === 3 ? KIT.stone3 : KIT.stone, dark = tier === 3 ? KIT.stone3Dark : KIT.stoneDark;
  // pier: square block where arms meet (bigger at corners / junctions)
  const pier = straight ? T : T + 0.5;
  parts.push(box(pier, top + DEPTH, pier, 0, (top - DEPTH) / 2, 0, body, 0, 0.04, KIT.stoneTop));
  parts.push(box(pier + 0.4, 0.9 + DEPTH, pier + 0.4, 0, (0.9 - DEPTH) / 2, 0, KIT.plinth));
  if (!straight && arms.length !== 0) parts.push(box(pier + 0.3, 0.25, pier + 0.3, 0, top + 0.12, 0, KIT.stoneTop)); // corner cap
  for (const a of arms) {
    const ry = -Math.atan2(a.dy, a.dx), cx = a.dx * a.len / 2, cz = a.dy * a.len / 2;
    parts.push(box(a.len, top + DEPTH, T, cx, (top - DEPTH) / 2, cz, body, ry, 0.05, KIT.stoneTop));
    parts.push(box(a.len, 0.9 + DEPTH, T + 0.4, cx, (0.9 - DEPTH) / 2, cz, KIT.plinth, ry));
    parts.push(box(a.len, 0.22, T + 0.12, cx, top * 0.55, cz, dark, ry)); // string course
    for (let k = 0; k < 4; k++) { // a few proud ashlar blocks so the faces are not flat
      const t = (0.15 + rnd() * 0.7) * a.len, yy = 1.2 + rnd() * (top - 1.8), side = rnd() < 0.5 ? 1 : -1, ox = -a.dy * side * (T / 2 + 0.03), oz = a.dx * side * (T / 2 + 0.03);
      parts.push(box(0.7 + rnd() * 0.5, 0.42, 0.1, a.dx * t + ox, yy, a.dy * t + oz, rnd() < 0.5 ? dark : KIT.stoneTop, ry, 0.1));
    }
    const s = outerSign(a.dx, a.dy, keepSide), nx = -a.dy * s, ny = a.dx * s;
    // crenellations on the outer edge, a low parapet on the inner edge
    const n = Math.max(1, Math.floor(a.len / 1.55));
    for (let k = 0; k < n; k++) {
      if (damage && rnd() < (damage === 1 ? 0.35 : 0.65)) continue;
      const t = (k + 0.5) / n * a.len;
      parts.push(box(0.95, 1.05, 0.55, a.dx * t + nx * (T / 2 - 0.27), top + 0.52, a.dy * t + ny * (T / 2 - 0.27), body, ry, 0.08, KIT.stoneTop));
    }
    parts.push(box(a.len, 0.35, 0.4, cx - nx * (T / 2 - 0.2), top + 0.17, cz - ny * (T / 2 - 0.2), body, ry));
    if (tier === 3) { // buttresses on the outer face
      parts.push(box(0.8, top * 0.8 + DEPTH, 1.0, a.dx * a.len * 0.6 + nx * (T / 2 + 0.45), (top * 0.8 - DEPTH) / 2, a.dy * a.len * 0.6 + ny * (T / 2 + 0.45), dark, ry));
    }
    if (damage === 2) parts.push(box(a.len * 0.5, top * 0.5, 0.08, cx + nx * (T / 2 + 0.02), top * 0.45, cz + ny * (T / 2 + 0.02), '#4a4038', ry)); // crack
  }
  if (!arms.length) { // lone pier
    for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) parts.push(box(0.9, 1.05, 0.9, dx, top + 0.52, dz, body));
  }
  return merge(parts);
}

/** gate cell: L1 timber gate, L2 stone arch with banded doors, L3 gatehouse with flanking turrets and portcullis */
export function gateParts(tier: number, alongX: boolean): { frame: THREE.BufferGeometry; door: THREE.BufferGeometry; portcullis: THREE.BufferGeometry | null } {
  seed = 4000 + tier;
  const top = WALL_TOP[tier - 1], parts: THREE.BufferGeometry[] = [];
  const rot = (g: THREE.BufferGeometry) => (alongX ? g : g.rotateY(Math.PI / 2));
  if (tier === 1) {
    for (const s of [-1, 1]) {
      parts.push(cyl(0.38, 0.42, 4.6 + DEPTH, s * 1.75, (4.6 - DEPTH) / 2, 0, KIT.woodDark, 7));
      parts.push(cone(0.42, 0.7, s * 1.75, 4.95, 0, KIT.woodDark, 7));
    }
    parts.push(box(4.2, 0.45, 0.6, 0, 3.7, 0, KIT.wood));
    parts.push(box(4.2, 0.2, 1.4, 0, top - 0.1, 0.75, KIT.plank));
  } else {
    const T = tier === 3 ? 2.9 : 2.4, body = tier === 3 ? KIT.stone3 : KIT.stone;
    for (const s of [-1, 1]) parts.push(box(0.75, top + 0.5 + DEPTH, T + 0.3, s * 1.75, (top + 0.5 - DEPTH) / 2, 0, body, 0, 0.04, KIT.stoneTop));
    parts.push(box(4.2, top - 3.3, T + 0.3, 0, 3.3 + (top - 3.3) / 2, 0, body, 0, 0.04, KIT.stoneTop)); // lintel above the arch
    for (const s of [-1, 1]) parts.push(box(0.5, 0.5, T + 0.32, s * 1.2, 3.1, 0, body)); // arch shoulders
    for (let k = 0; k < 4; k++) parts.push(box(0.95, 1.05, 0.55, -1.6 + k * 1.07, top + 0.52, -(T / 2 - 0.27), body, 0, 0.08, KIT.stoneTop));
    if (tier === 3) for (const s of [-1, 1]) { // flanking turrets
      parts.push(cyl(1.55, 1.75, top + 2.6 + DEPTH, s * 2.7, (top + 2.6 - DEPTH) / 2, -0.4, body, 10));
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; parts.push(box(0.6, 0.9, 0.45, s * 2.7 + Math.cos(a) * 1.45, top + 3.05, -0.4 + Math.sin(a) * 1.45, body, -a)); }
      parts.push(cone(2.0, 3.0, s * 2.7, top + 2.6 + 1.9, -0.4, KIT.roof, 10));
    }
  }
  const frame = merge(parts.map(rot));
  // double door (pivots handled by the caller through a simple scale-x squash when open)
  seed = 5000 + tier;
  const dp: THREE.BufferGeometry[] = [];
  const doorC = tier === 1 ? KIT.wood : '#7a5634';
  dp.push(box(2.6, 3.0, 0.3, 0, 1.5, 0, doorC));
  for (let k = 0; k < 4; k++) dp.push(box(0.12, 2.9, 0.34, -1.0 + k * 0.67, 1.5, 0, KIT.woodDark));
  if (tier >= 2) for (const y of [0.7, 1.6, 2.5]) dp.push(box(2.62, 0.16, 0.36, 0, y, 0, KIT.iron));
  const door = merge(dp.map(rot));
  let portcullis: THREE.BufferGeometry | null = null;
  if (tier === 3) {
    const pp: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) pp.push(box(0.1, 3.1, 0.1, -1.2 + k * 0.48, 1.55, 0, KIT.iron));
    for (let k = 0; k < 5; k++) pp.push(box(2.7, 0.1, 0.1, 0, 0.4 + k * 0.65, 0, KIT.iron));
    portcullis = merge(pp.map(rot));
  }
  return { frame, door, portcullis };
}

/** machicolation with a pitch cauldron, mounted on the outer face of a wall / gate */
export function pitchGeometry(tier: number, level: number) {
  seed = 6000 + level;
  const top = WALL_TOP[Math.max(1, tier) - 1], T = tier >= 2 ? 2.4 : 1.3, out = -(T / 2 + 0.55);
  const parts = [
    box(3.4, 1.2, 1.1, 0, top + 0.3, out, tier >= 2 ? KIT.stone : KIT.wood, 0, 0.04, KIT.stoneTop),
    box(3.6, 0.3, 1.3, 0, top + 1.05, out, tier >= 2 ? KIT.stoneDark : KIT.woodDark),
  ];
  for (const s of [-1, 0, 1]) parts.push(box(0.25, 0.6, 0.6, s * 1.4, top - 0.55, out - 0.1, tier >= 2 ? KIT.stoneDark : KIT.woodDark)); // corbels
  parts.push(cyl(0.45, 0.35, 0.55, 0, top + 1.45, out + 0.1, KIT.iron, 8));
  if (level >= 2) parts.push(cyl(0.38, 0.38, 0.12, 0, top + 1.75, out + 0.1, '#2b2016', 8));
  return merge(parts);
}

/** tower body + top; ground at y = 0. Platform height = rampart walkway + 2.2 */
export function towerGeometry(kind: StructId, level: number): THREE.BufferGeometry {
  seed = 7000 + level * 31 + kind.length;
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'watchtower') {
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) parts.push(box(0.35, 11 + DEPTH, 0.35, x, (11 - DEPTH) / 2, z, KIT.woodDark));
    for (const y of [3.5, 7]) { parts.push(box(3.4, 0.2, 0.2, 0, y, -1.5, KIT.wood)); parts.push(box(3.4, 0.2, 0.2, 0, y, 1.5, KIT.wood)); parts.push(box(0.2, 0.2, 3.4, -1.5, y, 0, KIT.wood)); parts.push(box(0.2, 0.2, 3.4, 1.5, y, 0, KIT.wood)); }
    parts.push(box(4.2, 0.3, 4.2, 0, 11, 0, KIT.plank));
    for (const s of [-1, 1]) { parts.push(box(4.2, 0.9, 0.2, 0, 11.6, s * 2, KIT.wood)); parts.push(box(0.2, 0.9, 4.2, s * 2, 11.6, 0, KIT.wood)); }
    parts.push(cone(3.4, 2.6, 0, 13.9, 0, KIT.roof, 4).rotateY(Math.PI / 4));
    parts.push(box(0.12, 3.2, 0.12, 0, 15.5, 0, KIT.woodDark), box(1.2, 0.7, 0.05, 0.62, 16.6, 0, KIT.red));
    return merge(parts);
  }
  const wallTier = Math.min(3, Math.max(2, level + 1));
  const plat = WALL_TOP[wallTier - 1] + 2.2;
  const wooden = kind === 'tower_bow' && level === 1;
  const W = kind === 'tower_catapult' ? 5.2 : 4.6;
  const body = wallTier === 3 ? KIT.stone3 : KIT.stone, dark = wallTier === 3 ? KIT.stone3Dark : KIT.stoneDark;
  if (wooden) {
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) parts.push(box(0.5, plat + DEPTH, 0.5, x, (plat - DEPTH) / 2, z, KIT.woodDark));
    parts.push(box(4.2, plat - 1 + DEPTH, 4.2, 0, (plat - 1 - DEPTH) / 2, 0, KIT.wood, 0, 0.05));
    parts.push(box(4.8, 0.3, 4.8, 0, plat, 0, KIT.plank));
    for (const s of [-1, 1]) { parts.push(box(4.8, 1.0, 0.25, 0, plat + 0.6, s * 2.3, KIT.woodDark)); parts.push(box(0.25, 1.0, 4.8, s * 2.3, plat + 0.6, 0, KIT.woodDark)); }
  } else {
    parts.push(box(W, plat + DEPTH, W, 0, (plat - DEPTH) / 2, 0, body, 0, 0.04, KIT.stoneTop));
    parts.push(box(W + 0.5, 1.0 + DEPTH, W + 0.5, 0, (1 - DEPTH) / 2, 0, KIT.plinth));
    parts.push(box(W + 0.35, 0.4, W + 0.35, 0, plat - 0.2, 0, dark)); // corbel band
    for (let k = 0; k < 4; k++) for (let m = 0; m < 3; m++) { // merlons around the top
      const a = (k * Math.PI) / 2, t = (m - 1) * (W / 3);
      const x = Math.cos(a) * (W / 2 - 0.25) - Math.sin(a) * t, z = Math.sin(a) * (W / 2 - 0.25) + Math.cos(a) * t;
      parts.push(box(0.95, 1.1, 0.5, x, plat + 0.55, z, body, -a + Math.PI / 2, 0.08, KIT.stoneTop));
    }
    for (const y of [plat * 0.45, plat * 0.75]) parts.push(box(0.35, 0.8, 0.12, 0, y, -W / 2 - 0.02, '#2a2420')); // arrow slits
  }
  if (kind === 'tower_bow') { // pointed roof on posts
    const r = level === 3 ? 3.7 : 3.4, ry = plat + 2.2;
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) parts.push(box(0.25, 2.2, 0.25, x, plat + 1.1, z, KIT.woodDark));
    parts.push(cone(r, level === 3 ? 4.2 : 3.4, 0, ry + (level === 3 ? 2.1 : 1.7), 0, KIT.roof, 4).rotateY(Math.PI / 4).translate(0, 0, 0));
    parts.push(box(0.1, 1.6, 0.1, 0, ry + (level === 3 ? 4.6 : 3.8), 0, KIT.woodDark), box(0.9, 0.5, 0.04, 0.48, ry + (level === 3 ? 5.1 : 4.3), 0, level === 3 ? KIT.red : KIT.gold));
  }
  if (kind === 'tower_xbow') { // squat roof over the platform with a banner
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) parts.push(box(0.3, 2.0, 0.3, x, plat + 1, z, dark));
    parts.push(box(5.0, 0.5, 5.0, 0, plat + 2.2, 0, KIT.roofDark), box(3.6, 0.6, 3.6, 0, plat + 2.7, 0, KIT.roof));
    parts.push(box(0.12, 2.4, 0.12, 2.1, plat + 3.6, 2.1, KIT.woodDark), box(0.05, 1.3, 0.9, 2.1, plat + 4.0, 1.6, KIT.red));
  }
  if (kind === 'ballista' || kind === 'tower_catapult') { // open fighting platform with a timber deck
    parts.push(box(W - 0.6, 0.25, W - 0.6, 0, plat + 0.05, 0, KIT.plank));
  }
  return merge(parts);
}

/** height of the fighting platform (where garrison figures and siege engines stand) */
export function towerPlatform(kind: StructId, level: number) {
  if (kind === 'watchtower') return 11.2;
  return WALL_TOP[Math.min(3, Math.max(2, level + 1)) - 1] + 2.2;
}

/** the keep: a square donjon with corner turrets; grows with its level */
export function keepGeometry(level: number): THREE.BufferGeometry {
  seed = 9000 + level;
  const parts: THREE.BufferGeometry[] = [];
  const H = 14 + level * 3, W = 11, body = KIT.stone, dark = KIT.stoneDark;
  parts.push(box(W + 2.4, 2 + DEPTH, W + 2.4, 0, (2 - DEPTH) / 2, 0, KIT.plinth));
  parts.push(box(W, H + DEPTH, W, 0, (H - DEPTH) / 2, 0, body, 0, 0.03, KIT.stoneTop));
  for (const y of [H * 0.35, H * 0.7]) parts.push(box(W + 0.3, 0.35, W + 0.3, 0, y, 0, dark));
  for (let k = 0; k < 4; k++) for (let m = 0; m < 5; m++) {
    const a = (k * Math.PI) / 2, t = (m - 2) * (W / 5.4);
    parts.push(box(1.1, 1.3, 0.6, Math.cos(a) * (W / 2 - 0.3) - Math.sin(a) * t, H + 0.65, Math.sin(a) * (W / 2 - 0.3) + Math.cos(a) * t, body, -a + Math.PI / 2, 0.06, KIT.stoneTop));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = x * (W / 2), tz = z * (W / 2), th = H + 4 + level;
    parts.push(cyl(1.9, 2.1, th + DEPTH, tx, (th - DEPTH) / 2, tz, body, 10));
    parts.push(cone(2.5, 4.5, tx, th + 2.25, tz, KIT.roof, 10));
    parts.push(box(0.1, 1.8, 0.1, tx, th + 5.2, tz, KIT.woodDark), box(1.0, 0.6, 0.04, tx + 0.52, th + 5.7, tz, KIT.red));
  }
  // great hall roof + door + windows
  parts.push(cone(W * 0.62, 6 + level, 0, H + 3.5 + level / 2, 0, KIT.roofDark, 4).rotateY(Math.PI / 4));
  parts.push(box(2.6, 3.8, 0.4, 0, 1.9, W / 2 + 0.05, '#5e4128'), box(3.2, 0.5, 0.6, 0, 4.0, W / 2 + 0.1, dark));
  for (const s of [-1, 1]) for (const y of [H * 0.5, H * 0.8]) parts.push(box(0.8, 1.4, 0.1, s * 2.6, y, W / 2 + 0.02, '#2a2420'));
  return merge(parts);
}

/** timber scaffold shown while something is being built */
export function scaffoldGeometry(w: number, h: number, d: number) {
  seed = 11;
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) parts.push(box(0.18, h, 0.18, x, h / 2, z, KIT.wood));
  for (let y = 1.6; y < h; y += 1.8) {
    parts.push(box(w, 0.12, 0.14, 0, y, -d / 2, KIT.plank), box(w, 0.12, 0.14, 0, y, d / 2, KIT.plank));
    parts.push(box(0.14, 0.12, d, -w / 2, y, 0, KIT.plank), box(0.14, 0.12, d, w / 2, y, 0, KIT.plank));
  }
  return merge(parts);
}

/** trap pieces on one 4-m cell (ground at y = 0); `spent` shows the used / open state */
export function trapGeometry(kind: StructId, spent: boolean): THREE.BufferGeometry {
  seed = 12000 + kind.length * 7 + (spent ? 1 : 0);
  const p: THREE.BufferGeometry[] = [];
  const dirt = '#5a4630', dark = '#2b2016';
  switch (kind) {
    case 'spikes':
      p.push(box(3.4, 0.12, 3.4, 0, 0.03, 0, dark));
      if (!spent) for (let i = 0; i < 16; i++) { const g = cone(0.12, 0.9, -1.3 + (i % 4) * 0.87, 0.45, -1.3 + Math.floor(i / 4) * 0.87, '#8f949c', 5); p.push(g); }
      break;
    case 'pitfall':
      p.push(box(3.4, 0.1, 3.4, 0, 0.03, 0, spent ? '#140f0a' : '#7d6a45'));
      if (!spent) for (let i = 0; i < 5; i++) p.push(box(3.3, 0.08, 0.14, 0, 0.1, -1.4 + i * 0.7, '#9a8456'));
      else for (const s of [-1, 1]) { p.push(box(3.6, 0.3, 0.3, 0, 0.12, s * 1.75, dirt), box(0.3, 0.3, 3.6, s * 1.75, 0.12, 0, dirt)); }
      break;
    case 'pitch_ditch':
      p.push(box(3.8, 0.1, 3.0, 0, 0.02, 0, spent ? '#3b3026' : '#141012'));
      for (const s of [-1, 1]) p.push(box(3.8, 0.35, 0.4, 0, 0.15, s * 1.6, dirt));
      break;
    case 'caltrops':
      for (let i = 0; i < 26; i++) { const x = (rnd() - 0.5) * 3.4, z = (rnd() - 0.5) * 3.4; p.push(box(0.22, 0.12, 0.22, x, 0.06, z, '#6d7179', rnd() * 3)); }
      break;
    case 'stakes':
      for (let i = 0; i < 7; i++) { const g = cyl(0.01, 0.13, 2.4, 0, 0, 0, KIT.wood, 5); g.rotateX(-0.75).translate(-1.6 + i * 0.53, 0.8, -0.2); p.push(g); }
      p.push(box(3.8, 0.3, 0.3, 0, 0.15, 0.4, KIT.woodDark));
      break;
    case 'log_trap':
      for (const s of [-1, 1]) p.push(box(0.3, 1.4, 0.3, s * 1.7, 0.7, 0.9, KIT.woodDark));
      if (!spent) for (let i = 0; i < 4; i++) { const g = cyl(0.42, 0.42, 3.6, 0, 0, 0, KIT.wood, 7); g.rotateZ(Math.PI / 2).translate(0, 0.45 + (i > 2 ? 0.75 : 0), -0.6 + (i % 3) * 0.86 - (i > 2 ? 0.43 : 0)); p.push(g); }
      break;
    case 'rockslide':
      for (let i = 0; i < 9; i++) p.push(box(0.8 + rnd() * 0.9, 0.7 + rnd() * 0.7, 0.8 + rnd() * 0.9, (rnd() - 0.5) * 3, 0.5 + rnd() * 0.8, (rnd() - 0.5) * 3, KIT.stoneDark, rnd() * 3, 0.12));
      p.push(box(3.6, 0.3, 0.3, 0, 0.6, -1.7, KIT.woodDark));
      break;
    case 'powder':
      for (const [x, z] of [[-0.6, -0.4], [0.6, -0.4], [0, 0.6]]) { p.push(cyl(0.55, 0.5, 1.2, x, 0.6, z, '#7a5634', 10), cyl(0.57, 0.57, 0.1, x, 0.35, z, KIT.iron, 10), cyl(0.57, 0.57, 0.1, x, 0.95, z, KIT.iron, 10)); }
      break;
    case 'moat':
      p.push(box(4.0, 0.2, 4.0, 0, -0.35, 0, '#2f6f96'));
      break;
  }
  const g = mergeGeometries(p.length ? p : [box(0.1, 0.1, 0.1, 0, -1, 0, dark)], false)!;
  g.computeVertexNormals(); return g;
}
