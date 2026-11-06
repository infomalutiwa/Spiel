import * as THREE from 'three';
import { CELL, isWallish, K, STRUCTURES, wallMask, type StructId, type StructSnap, type Terrain } from '@talwacht/shared';
import { kitVersion, gateParts, keepGeometry, kitMaterial, pitchGeometry, scaffoldGeometry, towerGeometry, towerPlatform, trapGeometry, wallGeometry } from './castlekit';
import { modelInstance } from './assets';

/** Quaternius 'Ultimate Fantasy RTS' buildings (CC0, converted by tools/blender/rts_import.py) */
const BUILDING_MODEL: Partial<Record<StructId, string>> = {
  lumber: 'rts/lumber', quarry: 'rts/quarry', mine: 'rts/mine', farm: 'rts/farm',
  mill: 'rts/mill', market: 'rts/market', house: 'rts/house_a', well: 'hex/building_well_blue',
  barracks: 'rts/barracks', range: 'rts/range', stable: 'rts/stable', infirmary: 'rts/infirmary',
  workshop: 'rts/workshop', smithy: 'rts/smithy',
};
const RTS_TOWER: Partial<Record<StructId, (level: number) => string>> = {
  tower_bow: l => `rts/tower${Math.min(3, l)}`, tower_xbow: l => `rts/tower${Math.min(3, l + 1)}`, watchtower: () => 'rts/watch',
};
const HOUSES = ['rts/house_a', 'rts/house_b', 'rts/house_c'];

const damageOf = (s: StructSnap) => (s.hp / s.maxHp > 0.6 ? 0 : s.hp / s.maxHp > 0.3 ? 1 : 2);
const progressOf = (s: StructSnap) => {
  if (s.build <= 0) return 1;
  const d = STRUCTURES[s.kind], total = s.level > 1 ? Math.max(3, d.build * 0.6) : d.build;
  return Math.max(0.12, 1 - s.build / Math.max(0.1, total));
};

interface View { obj: THREE.Object3D; key: string; door?: THREE.Object3D; port?: THREE.Object3D; open?: number }

export class StructureViews {
  group = new THREE.Group();
  private walls = new THREE.Group();
  private views = new Map<number, View>();
  private wallKey = '';
  private geoCache = new Map<string, THREE.BufferGeometry>();
  private scaffoldGeo = new Map<string, THREE.BufferGeometry>();
  private scaffoldMat = kitMaterial;
  /** garrison figure spots (world x, y, z) per tower id: units.ts draws them */
  garrison = new Map<number, { x: number; y: number; z: number; n: number; face: number }>();
  private byCell = new Map<string, StructSnap>();
  private keepX = 0;

  constructor(private terrain: Terrain, parent: THREE.Object3D) {
    this.group.add(this.walls);
    parent.add(this.group);
  }

  ground(cx: number, cy: number) { return this.terrain.height((cx + 0.5) * CELL, (cy + 0.5) * CELL); }
  /** height to stand on at (x, y): the walkway base of a rampart cell, else the terrain */
  groundUnder(x: number, y: number) {
    const s = this.byCell.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
    return s && (isWallish(s.kind) && s.kind !== 'keep') ? this.ground(s.cx, s.cy) : this.terrain.height(x, y);
  }
  structAt(cx: number, cy: number) { return this.byCell.get(`${cx},${cy}`); }

  sync(structs: Map<number, StructSnap>, dt: number) {
    this.byCell.clear();
    for (const s of structs.values()) for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) this.byCell.set(`${s.cx + x},${s.cy + y}`, s);
    const keep = [...structs.values()].find(s => s.kind === 'keep');
    this.keepX = keep ? (keep.cx + keep.w / 2) * CELL : this.terrain.map.w / 2;
    const isWall = (x: number, y: number) => { const s = this.byCell.get(`${x},${y}`); return !!s && isWallish(s.kind); };
    const t = this.terrain;
    const isCliff = (x: number, y: number) => x < 0 || y < 0 || x >= t.cw || y >= t.ch || t.kind[y * t.cw + x] === K.cliff;

    // ---- plain wall cells: one InstancedMesh per distinct geometry ----
    const wallCells = [...structs.values()].filter(s => s.kind === 'wall');
    const masks = new Map<number, number>();
    for (const s of wallCells) masks.set(s.id, wallMask(isWall, isCliff, s.cx, s.cy));
    const key = `${kitVersion}#` + wallCells.map(s => `${s.id}:${s.level}:${masks.get(s.id)}:${damageOf(s)}:${Math.round(progressOf(s) * 10)}`).join('|');
    if (key !== this.wallKey) { this.wallKey = key; this.rebuildWalls(wallCells, masks); }

    // ---- everything else: one object per structure ----
    const seen = new Set<number>();
    for (const s of structs.values()) {
      if (s.kind === 'wall') continue;
      seen.add(s.id);
      const mask = isWallish(s.kind) ? wallMask(isWall, isCliff, s.cx, s.cy) : 0;
      const k = `${kitVersion}:${s.kind}:${s.level}:${s.pitch}:${damageOf(s)}:${mask}:${Math.round(progressOf(s) * 10)}:${s.spent ? 'x' : ''}`;
      let v = this.views.get(s.id);
      if (!v || v.key !== k) {
        if (v) this.dispose(v);
        v = this.makeView(s, mask, k);
        this.views.set(s.id, v);
      }
      if (v.door) { // gates swing open for sorties
        const want = s.state === 1 ? 1 : 0;
        v.open = (v.open ?? 0) + (want - (v.open ?? 0)) * Math.min(1, dt * 3);
        v.door.scale.x = 1 - v.open * 0.82;
        if (v.port) v.port.position.y = v.open * 3.0;
      }
    }
    this.syncWallPitch(structs, seen);
    for (const [id, v] of this.views) if (!seen.has(id)) { this.dispose(v); this.views.delete(id); this.garrison.delete(id); }
  }

  private geo(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geoCache.get(key);
    if (!g) { g = make(); this.geoCache.set(key, g); }
    return g;
  }
  private scaffold(w: number, h: number, d: number) {
    const k = `${w}:${h}:${d}`;
    let g = this.scaffoldGeo.get(k);
    if (!g) { g = scaffoldGeometry(w, h, d); this.scaffoldGeo.set(k, g); }
    return new THREE.Mesh(g, this.scaffoldMat);
  }

  private rebuildWalls(cells: StructSnap[], masks: Map<number, number>) {
    for (const c of [...this.walls.children]) { this.walls.remove(c); (c as THREE.InstancedMesh).dispose?.(); }
    const groups = new Map<string, StructSnap[]>();
    for (const s of cells) {
      const keepSide = (s.cx + 0.5) * CELL < this.keepX ? 1 : -1;
      const k = `${s.level}:${masks.get(s.id)}:${keepSide}:${damageOf(s)}:${s.id % 5}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
    }
    const m = new THREE.Matrix4();
    for (const [k, list] of groups) {
      const [lv, mask, side, dmg, sd] = k.split(':').map(Number);
      const g = this.geo(`w:${kitVersion}:${k}`, () => wallGeometry(lv, mask, side, dmg, sd));
      const im = new THREE.InstancedMesh(g, kitMaterial, list.length);
      list.forEach((s, i) => {
        const p = progressOf(s);
        m.makeScale(1, p, 1).setPosition((s.cx + 0.5) * CELL, this.ground(s.cx, s.cy), (s.cy + 0.5) * CELL);
        im.setMatrixAt(i, m);
        if (s.build > 0) { const sc = this.scaffold(4.2, 5.4, 2.8); sc.position.set((s.cx + 0.5) * CELL, this.ground(s.cx, s.cy), (s.cy + 0.5) * CELL); this.walls.add(sc); }
      });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      this.walls.add(im);
    }
  }

  private makeView(s: StructSnap, mask: number, key: string): View {
    const root = new THREE.Group();
    const cx = (s.cx + s.w / 2) * CELL, cy = (s.cy + s.h / 2) * CELL;
    const gh = s.w === 1 ? this.ground(s.cx, s.cy) : Math.min(...[[0, 0], [s.w, 0], [0, s.h], [s.w, s.h], [s.w / 2, s.h / 2]].map(([dx, dy]) => this.terrain.height(s.cx * CELL + dx * CELL, s.cy * CELL + dy * CELL)));
    root.position.set(cx, gh, cy);
    const prog = progressOf(s), dmg = damageOf(s);
    const view: View = { obj: root, key };
    const mesh = (g: THREE.BufferGeometry) => { const m = new THREE.Mesh(g, kitMaterial); m.castShadow = m.receiveShadow = true; return m; };
    const keepSide = cx < this.keepX ? 1 : -1;
    // outward facing of a rampart cell (enemy side) for pitch noses
    const alongX = !!(mask & (4 | 64)) || !(mask & (1 | 16));
    const faceOut = alongX ? 0 : (keepSide > 0 ? -Math.PI / 2 : Math.PI / 2);

    if (s.kind === 'keep') {
      // Quaternius stone castle (three tiers); the Blender keep stays as fallback until it has loaded
      const fb = mesh(this.geo(`keep:${kitVersion}:${s.level}`, () => keepGeometry(s.level))); root.add(fb);
      void modelInstance(`rts/keep${Math.min(3, s.level)}`, s.w * CELL * 1.05).then(o => { if (o) { root.remove(fb); root.add(o); } });
    }
    else if (s.kind === 'gate') {
      const parts = gateParts(s.level, alongX);
      root.add(mesh(parts.frame));
      const door = mesh(parts.door); root.add(door); view.door = door;
      if (parts.portcullis) { const p = mesh(parts.portcullis); root.add(p); view.port = p; }
    } else if (RTS_TOWER[s.kind]) { // stone watch towers from the RTS pack; archers stand on the top platform
      const file = RTS_TOWER[s.kind]!(s.level), n = STRUCTURES[s.kind].tower?.shooters[Math.min(s.level, STRUCTURES[s.kind].tower!.shooters.length) - 1] ?? 0;
      void modelInstance(file, 4.6).then(o => {
        if (!o) return;
        if (dmg) o.traverse(c => { const mm = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm?.color) mm.color.multiplyScalar(dmg === 1 ? 0.8 : 0.6); });
        root.add(o);
        const h = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
        if (s.build <= 0 && n) this.garrison.set(s.id, { x: cx, y: cy, z: gh + h * (file.endsWith('1') ? 0.58 : 0.8), n, face: Math.PI });
      });
    } else if (STRUCTURES[s.kind].cat === 'tower') {
      root.add(mesh(this.geo(`t:${kitVersion}:${s.kind}:${s.level}`, () => towerGeometry(s.kind, s.level))));
      const plat = towerPlatform(s.kind, s.level);
      if (s.kind === 'ballista' || s.kind === 'tower_catapult') {
        void modelInstance(s.kind === 'ballista' ? 'siege-ballista' : 'siege-catapult', s.kind === 'ballista' ? 3.4 : 3.8).then(o => { if (o) { o.position.y = plat + 0.15; o.rotation.y = Math.PI; root.add(o); } });
      }
      const n = STRUCTURES[s.kind].tower?.shooters[Math.min(s.level, STRUCTURES[s.kind].tower!.shooters.length) - 1] ?? 0;
      if (s.build <= 0 && (s.kind === 'tower_bow' || s.kind === 'tower_xbow')) this.garrison.set(s.id, { x: cx, y: cy, z: gh + plat + 0.15, n, face: Math.PI });
    } else if (STRUCTURES[s.kind].cat === 'trap') {
      const spent = !!s.spent;
      const tm = mesh(this.geo(`trap:${s.kind}:${spent}`, () => trapGeometry(s.kind, spent)));
      tm.castShadow = false; root.add(tm);
    } else if (BUILDING_MODEL[s.kind]) {
      const file = s.kind === 'house' ? HOUSES[s.id % 3] : BUILDING_MODEL[s.kind]!;
      const size = s.kind === 'well' ? 3.2 : s.w * CELL * (s.kind === 'house' ? 0.8 : s.kind === 'mill' ? 0.85 : 0.95);
      void modelInstance(file, size).then(o => {
        if (!o) return;
        o.rotation.y = ((s.id * 7) % 4) * Math.PI / 2;
        if (dmg) o.traverse(c => { const mm = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm?.color) mm.color.multiplyScalar(dmg === 1 ? 0.8 : 0.6); });
        root.add(o);
      });
    }
    if (s.pitch && (s.kind === 'gate')) {
      const p = mesh(this.geo(`p:${s.level}:${s.pitch}`, () => pitchGeometry(s.level, s.pitch)));
      p.rotation.y = faceOut; root.add(p);
    }
    if (prog < 1) {
      root.scale.y = prog;
      const sc = this.scaffold(s.w * CELL + 0.6, 6, s.h * CELL + 0.6);
      sc.position.copy(root.position);
      sc.userData.scaffoldFor = s.id;
      this.group.add(sc);
      (view as View & { sc?: THREE.Object3D }).sc = sc;
    }
    this.group.add(root);
    return view;
  }

  private dispose(v: View) {
    this.group.remove(v.obj);
    const sc = (v as View & { sc?: THREE.Object3D }).sc;
    if (sc) this.group.remove(sc);
  }

  /** pitch noses on plain wall cells (walls are instanced, so they get separate meshes) */
  private syncWallPitch(structs: Map<number, StructSnap>, seen: Set<number>) {
    for (const s of structs.values()) {
      if (s.kind !== 'wall' || !s.pitch) continue;
      seen.add(-s.id);
      const key = `wp:${s.level}:${s.pitch}`;
      let v = this.views.get(-s.id);
      if (v && v.key === key) continue;
      if (v) this.dispose(v);
      const root = new THREE.Group();
      root.position.set((s.cx + 0.5) * CELL, this.ground(s.cx, s.cy), (s.cy + 0.5) * CELL);
      const m = new THREE.Mesh(this.geo(key, () => pitchGeometry(s.level, s.pitch)), kitMaterial); m.castShadow = true; root.add(m);
      this.group.add(root);
      v = { obj: root, key };
      this.views.set(-s.id, v);
    }
  }
}
