import * as THREE from 'three';
import { fbm, K, polyDist, rng, type Terrain } from '@talwacht/shared';
import { loadModel } from './assets';
import { EXTENT } from './terrain';
import { LOW } from './scene';
import { kitMaterial, kitModule } from './castlekit';

/** many copies of a small CC0 model, drawn as one InstancedMesh per material */
export class Instancer {
  private items: { x: number; y: number; z: number; r: number; s: number }[] = [];
  constructor(private parent: THREE.Object3D, private name: string, private height: number, private shadow = true, private tint?: THREE.Color, private rock?: string) {}
  add(x: number, y: number, z: number, r: number, s: number) { this.items.push({ x, y, z, r, s }); }
  get size() { return this.items.length; }
  async build() {
    if (!this.items.length) return;
    const src = await loadModel(this.name);
    if (!src) return;
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src), dim = box.getSize(new THREE.Vector3());
    const k = this.height / Math.max(dim.y, 1e-4);
    const base = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    src.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (/leaf/i.test(mat.name)) { mat.color.set('#3f7a35').lerp(mat.color, 0.25).multiplyScalar(this.shadow ? 0.95 : 0.8); mat.envMapIntensity = 0.35; }
      if (/wood|bark/i.test(mat.name)) mat.color.set('#6b4a32');
      if (this.tint && /leaf|grass/i.test(mat.name)) mat.color.multiply(this.tint);
      if (this.rock && !/grass|leaf/i.test(mat.name)) mat.color.set(this.rock);
      if (this.rock && /grass/i.test(mat.name)) mat.color.set('#557f36');
      const local = base.clone().multiply(mesh.matrixWorld);
      const im = new THREE.InstancedMesh(mesh.geometry, mat, this.items.length);
      this.items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.r);
        m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s, it.s)).multiply(local);
        im.setMatrixAt(i, m4);
      });
      im.castShadow = this.shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.parent.add(im);
    });
  }
}

/** trees, rocks, bushes and flowers placed by rules (forest clumps with ragged edges, rocks at cliff feet) */
export async function buildScenery(t: Terrain, parent: THREE.Object3D) {
  const m = t.map, R = rng(m.seed * 977 + 1), snow = m.theme === 'snow';
  const group = new THREE.Group(); group.name = 'scenery'; parent.add(group);
  const autumn = new THREE.Color('#ffd9a0');
  const treeSet = (shadow: boolean) => snow
    ? [new Instancer(group, 'tree_pineTallA', 13, shadow), new Instancer(group, 'tree_pineRoundC', 10, shadow), new Instancer(group, 'tree_pineDefaultB', 11, shadow)]
    : [new Instancer(group, 'tree_pineTallA', 13, shadow), new Instancer(group, 'tree_pineRoundC', 10, shadow), new Instancer(group, 'tree_oak', 10, shadow), new Instancer(group, 'tree_default', 9, shadow), new Instancer(group, 'tree_fat', 9, shadow, m.theme === 'gorge' ? autumn : undefined)];
  const trees = treeSet(true), farTrees = treeSet(false);
  const grey = snow ? '#8d96a3' : '#8b847a';
  // low-poly boulders in light grey (matches the stylised look)
  const stone = snow ? '#9aa3ae' : '#a9a7a1';
  const rocks = [new Instancer(group, 'rock_largeA', 2.4, true, undefined, stone), new Instancer(group, 'rock_largeC', 3.2, true, undefined, stone), new Instancer(group, 'rock_smallA', 1.4, true, undefined, stone)];
  void grey;
  // Quaternius copses (whole tree groups) for woods, and faceted snow-capped peaks on the far ridges
  const copses = snow ? [new Instancer(group, 'rts/pines', 12)] : [new Instancer(group, 'rts/trees', 11), new Instancer(group, 'rts/pines', 12)];
  const peaks = [new Instancer(group, 'rts/mountains_a', 70, false), new Instancer(group, 'rts/mountains_b', 60, false), new Instancer(group, 'rts/mountain', 75, false)];
  const bushes = snow ? [] : [new Instancer(group, 'plant_bushLarge', 2.2, false), new Instancer(group, 'plant_bush', 1.6, false)];
  const flowers = snow ? [] : [new Instancer(group, 'flower_yellowA', 0.9, false), new Instancer(group, 'flower_redA', 0.9, false), new Instancer(group, 'flower_purpleA', 0.9, false)];
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const x0 = EXTENT.x0, x1 = m.w + EXTENT.x1, y0 = EXTENT.y0, y1 = m.d + EXTENT.y1;
  const nearRoad = (x: number, y: number, r: number) => m.lanes.some(l => polyDist(x, y, y < 0 ? [[l.pts[0][0], -400], ...l.pts] : l.pts).d < r);
  const nearCreek = (x: number, y: number, r: number) => !!m.creek && polyDist(x, y, m.creek).d < r;
  // peaks: a loose chain along both outer ridges and behind the keep
  for (let y = y0 + 40; y < y1; y += 70 + R() * 50) for (const side of [0, 1]) {
    const e = m.edges.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
    const x = side ? Math.max(e.right + 150, m.w + 40) + R() * 60 : Math.min(e.left - 150, -40) - R() * 60;
    if (x < x0 - 40 || x > x1 + 40) continue;
    pick(peaks).add(x, t.height(x, y) - 4, y, R() * 6.28, 0.8 + R() * 0.6);
  }
  for (let x = x0 + 30; x < x1; x += 90 + R() * 60) pick(peaks).add(x, t.height(x, y1 - 30) - 4, y1 - 30 + R() * 40, R() * 6.28, 0.9 + R() * 0.5);
  const density = LOW ? 0.45 : 1;
  const N = Math.round(((x1 - x0) * (y1 - y0)) / 34 * density);
  for (let i = 0; i < N; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
    const out = t.outside(x, y), h = t.height(x, y);
    const inMap = x >= 0 && y >= 0 && x < m.w && y < m.d;
    const kind = inMap ? t.kind[t.cellAt(x, y)] : -1;
    if (nearCreek(x, y, (m.creekWidth ?? 6) / 2 + 2.5) || nearRoad(x, y, 6)) continue;
    // woods on the ridges: dense where the top flattens, thinning on the face
    if (out > 4) {
      if (out > 95) continue; // beyond this the ridge reads as canopy colour in the terrain
      const flat = h > 48;
      const clump = fbm(x * 0.02, y * 0.02, m.seed + 77); // woods with glades
      if (flat && R() < 0.012 + clump * 0.03) { pick(copses).add(x, h - 0.5, y, R() * 6.28, 0.8 + R() * 0.5); continue; }
      if ((flat && R() < (out < 40 ? 0.14 : 0.03) + clump * 0.2) || (!flat && R() < 0.03)) pick(out < 30 ? trees : farTrees).add(x, h - 0.3, y, R() * 6.28, 0.8 + R() * 0.7);
      else if (out < 14 && R() < 0.06) pick(rocks).add(x, h - 0.6, y, R() * 6.28, 0.7 + R() * 1.0);
      continue;
    }
    if (out > -1 && h < 46 && R() < 0.16) { pick(rocks).add(x, h - 0.5, y, R() * 6.28, 0.9 + R() * 1.4); continue; } // boulders on the rock face
    if (out > -6) { // cliff foot: boulders, a few bushes
      if (R() < 0.1) pick(rocks).add(x, h - 0.4, y, R() * 6.28, 0.5 + R() * 0.9);
      else if (bushes.length && R() < 0.05) pick(bushes).add(x, h, y, R() * 6.28, 0.8 + R() * 0.6);
      continue;
    }
    if (kind === K.forest) { if (R() < 0.05) { pick(copses).add(x, h - 0.4, y, R() * 6.28, 0.6 + R() * 0.3); continue; } if (R() < 0.45) pick(trees).add(x, h - 0.3, y, R() * 6.28, 0.7 + R() * 0.5); continue; }
    if (kind === K.rock) { if (R() < 0.3) pick(rocks).add(x, h - 0.4, y, R() * 6.28, 0.5 + R() * 0.8); continue; }
    if (!inMap && y < 0) { // the approach outside the map: open fields with copses
      if (R() < 0.035) pick(trees).add(x, h - 0.3, y, R() * 6.28, 0.7 + R() * 0.5);
      else if (flowers.length && R() < 0.04) pick(flowers).add(x, h, y, R() * 6.28, 0.8 + R() * 0.6);
      continue;
    }
    if (kind === K.meadow && flowers.length && R() < 0.18) { pick(flowers).add(x, h, y, R() * 6.28, 0.7 + R() * 0.7); continue; }
    if (R() < 0.012) pick(trees).add(x, h - 0.3, y, R() * 6.28, 0.6 + R() * 0.4);
    else if (bushes.length && R() < 0.02) pick(bushes).add(x, h, y, R() * 6.28, 0.7 + R() * 0.6);
  }
  await Promise.all([...trees, ...farTrees, ...rocks, ...bushes, ...flowers, ...copses, ...peaks].map(i => i.build()));
  buildBridges(t, group);
  return group;
}

/** plank bridges where a lane crosses the creek */
function buildBridges(t: Terrain, parent: THREE.Object3D) {
  const m = t.map;
  if (!m.creek) return;
  const wood = new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: '#5e4128', roughness: 0.9 });
  for (const l of m.lanes) {
    // find the crossing point
    let best: [number, number] | null = null, bd = 99;
    for (let i = 0; i + 1 < l.pts.length; i++) for (let k = 0; k <= 20; k++) {
      const x = l.pts[i][0] + (l.pts[i + 1][0] - l.pts[i][0]) * k / 20, y = l.pts[i][1] + (l.pts[i + 1][1] - l.pts[i][1]) * k / 20;
      const d = polyDist(x, y, m.creek).d;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best || bd > 3) continue;
    const [x, y] = best, cr = polyDist(x, y, m.creek), a = m.creek[cr.seg], b = m.creek[cr.seg + 1];
    const along = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const len = (m.creekWidth ?? 6) + 6, h = Math.max(t.height(x, y), t.height(x + 4, y), t.height(x - 4, y)) + 0.9;
    const g = new THREE.Group(); g.position.set(x, h, y); g.rotation.y = -along;
    const kb = kitModule('bridge');
    if (kb) { // Blender stone bridge, stretched to the water's width
      const mb = new THREE.Mesh(kb, kitMaterial); mb.scale.set(1, 1, len / 16); mb.position.y = -0.8; mb.castShadow = mb.receiveShadow = true;
      g.add(mb); parent.add(g); continue;
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.35, len), wood); deck.castShadow = deck.receiveShadow = true; g.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, len), dark); rail.position.set(s * 2.6, 0.9, 0); g.add(rail);
      for (let k = -2; k <= 2; k++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), dark); post.position.set(s * 2.6, 0.45, (k * len) / 5); post.castShadow = true; g.add(post); }
    }
    parent.add(g);
  }
}
