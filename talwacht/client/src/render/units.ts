import * as THREE from 'three';
import { ENEMIES, TROOPS, type EnemyId, type PlayerId, type UnitSnap, type UnitType } from '@talwacht/shared';
import { loadBaked, type BakedModel, type Clip } from './baked';
import { modelInstance } from './assets';
import { KIT, box } from './castlekit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Interp } from '../net/connection';
import type { World } from './scene';
import type { StructureViews } from './structures';

export const TEAM = [new THREE.Color('#4a94d9'), new THREE.Color('#ee7f9b')];
const ENEMY_RING = new THREE.Color('#c2453c');
const TINT_P = [new THREE.Color(0.82, 0.95, 1.28), new THREE.Color(1.28, 0.86, 0.95)];
const TINT_E = new THREE.Color(1.12, 0.72, 0.66);
const def = (t: UnitType) => (t in TROOPS ? TROOPS[t as keyof typeof TROOPS] : ENEMIES[t as EnemyId]);
const isTroop = (t: UnitType) => t in TROOPS;
/** plain scene objects instead of baked characters */
const OBJECTS: Partial<Record<UnitType, { file: string; size: number }>> = { ram: { file: 'siege-ram', size: 5 }, trebuchet: { file: 'siege-trebuchet', size: 9 } };
const hash01 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

class Buckets {
  meshes: THREE.InstancedMesh[] = [];
  counts: number[];
  constructor(readonly model: BakedModel, private mat: THREE.Material, private parent: THREE.Object3D) {
    this.counts = new Array(model.frames.length).fill(0);
    model.frames.forEach((_, i) => this.meshes.push(this.make(i, 48)));
  }
  private make(frame: number, cap: number) {
    const m = new THREE.InstancedMesh(this.model.frames[frame], this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
    this.parent.add(m);
    return m;
  }
  begin() { this.counts.fill(0); }
  add(frame: number, matrix: THREE.Matrix4, color: THREE.Color) {
    let m = this.meshes[frame];
    const n = this.counts[frame];
    if (n >= m.instanceMatrix.count) {
      const old = m; this.parent.remove(old);
      m = this.make(frame, old.instanceMatrix.count * 2);
      m.instanceMatrix.array.set(old.instanceMatrix.array); m.instanceColor!.array.set(old.instanceColor!.array);
      old.dispose(); this.meshes[frame] = m;
    }
    m.setMatrixAt(n, matrix); m.setColorAt(n, color);
    this.counts[frame] = n + 1;
  }
  end() {
    this.meshes.forEach((m, i) => { m.count = this.counts[i]; m.visible = m.count > 0; if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; } });
  }
}

interface View { id: number; snap: UnitSnap; px: number; py: number; pz: number; yaw: number; walk: number; idle: number; atk: number; speed: number; spawn: number; obj?: THREE.Object3D }
interface Ghost { type: UnitType; side: UnitSnap['side']; owner: PlayerId | null; x: number; y: number; z: number; yaw: number; t: number }

/** a procedural siege tower: timber frame, hide covering, drawbridge */
function siegeTowerGeo() {
  const p = [box(5, 13, 5, 0, 6.5, 0, KIT.wood, 0, 0.05), box(5.4, 0.4, 5.4, 0, 13.1, 0, KIT.woodDark)];
  for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) p.push(box(0.4, 14, 0.4, x, 7, z, KIT.woodDark));
  for (const y of [3, 6.5, 10]) p.push(box(5.2, 0.3, 0.3, 0, y, -2.6, KIT.woodDark));
  p.push(box(4.6, 9, 0.2, 0, 8, -2.62, '#8b6b4b'));
  p.push(box(3.4, 0.25, 3.2, 0, 13.4, -4, KIT.plank));
  for (const [x, z] of [[-2, -2.2], [2, -2.2], [-2, 2.2], [2, 2.2]]) p.push(box(0.5, 1.6, 1.6, x, 0.8, z, KIT.woodDark));
  const g = mergeGeometries(p)!; g.computeVertexNormals(); return g;
}
const ladderGeo = (() => {
  const p = [box(0.12, 6.5, 0.12, -0.35, 3.25, 0, KIT.wood), box(0.12, 6.5, 0.12, 0.35, 3.25, 0, KIT.wood)];
  for (let k = 0; k < 9; k++) p.push(box(0.7, 0.08, 0.08, 0, 0.5 + k * 0.7, 0, KIT.woodDark));
  const g = mergeGeometries(p)!; g.computeVertexNormals(); return g;
})();

export class UnitViews {
  group = new THREE.Group();
  views = new Map<number, View>();
  private models = new Map<string, Buckets>();
  private loading = new Set<string>();
  private ghosts: Ghost[] = [];
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  private kitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  private rings: THREE.InstancedMesh; private selRings: THREE.InstancedMesh;
  private barBg: THREE.InstancedMesh; private barFill: THREE.InstancedMesh;
  private shields: THREE.InstancedMesh; private pavises: THREE.InstancedMesh; private ladders: THREE.InstancedMesh;
  private poles: THREE.InstancedMesh; private cloths: THREE.InstancedMesh; private stars: THREE.InstancedMesh;
  private towerGeo = siegeTowerGeo();
  burning: { x: number; y: number; z: number }[] = [];
  private t = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3(); private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0); private flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

  constructor(private world: World, private structs: () => StructureViews | null) {
    world.scene.add(this.group);
    const inst = (g: THREE.BufferGeometry, mat: THREE.Material, n: number, order = 0, shadow = false) => {
      const im = new THREE.InstancedMesh(g, mat, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; im.renderOrder = order; im.castShadow = shadow;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      this.group.add(im); return im;
    };
    const ring = new THREE.RingGeometry(0.78, 1, 24);
    this.rings = inst(ring, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), 900, 1);
    this.selRings = inst(ring, new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }), 300, 5);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.barBg = inst(quad, new THREE.MeshBasicMaterial({ color: '#2b2230', transparent: true, opacity: 0.75, depthTest: false }), 600, 10);
    this.barFill = inst(quad, new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }), 600, 11);
    this.shields = inst(new THREE.BoxGeometry(1.25, 1.6, 0.12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), 600, 0, true);
    this.pavises = inst(new THREE.BoxGeometry(1.2, 1.9, 0.14), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), 200, 0, true);
    this.ladders = inst(ladderGeo, this.kitMat, 120, 0, true);
    this.poles = inst(new THREE.CylinderGeometry(0.05, 0.06, 1, 5), new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 }), 120, 0, true);
    this.cloths = inst(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide }), 120, 0, true);
    this.stars = inst(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: '#ffd75e', depthTest: false }), 360, 12);
  }

  posOf(id: number) { const v = this.views.get(id); return v ? { x: v.px, y: v.py, z: v.pz } : undefined; }
  snapOf(id: number) { return this.views.get(id)?.snap; }

  private bucket(model: string) {
    const b = this.models.get(model);
    if (b) return b;
    if (!this.loading.has(model)) { this.loading.add(model); void loadBaked(model).then(m => { if (m) this.models.set(model, new Buckets(m, this.mat, this.group)); }); }
    return undefined;
  }

  sync(ip: Interp | undefined, you: PlayerId, selectedSquads: Set<number>, dt: number) {
    this.t += dt;
    if (!ip) return;
    const sv = this.structs();
    const a = new Map(ip.a.units.map(u => [u.id, u]));
    const seen = new Set<number>();
    for (const b of ip.b.units) {
      seen.add(b.id);
      let v = this.views.get(b.id);
      if (!v) {
        v = { id: b.id, snap: b, px: b.x, py: b.y, pz: b.z, yaw: Math.PI / 2 - b.facing, walk: Math.random() * 8, idle: Math.random() * 4, atk: Math.random(), speed: 0, spawn: 0 };
        this.views.set(b.id, v);
        const o = OBJECTS[b.type];
        if (o) void modelInstance(o.file, o.size).then(obj => { if (obj && this.views.has(b.id)) { v!.obj = obj; this.group.add(obj); } });
        if (b.type === 'siege_tower') { const mm = new THREE.Mesh(this.towerGeo, this.kitMat); mm.castShadow = true; v.obj = mm; this.group.add(mm); }
      }
      const pa = a.get(b.id) ?? b;
      const nx = pa.x + (b.x - pa.x) * ip.alpha, ny = pa.y + (b.y - pa.y) * ip.alpha;
      v.speed = Math.hypot(nx - v.px, ny - v.py) / Math.max(dt, 0.001);
      v.px = nx; v.py = ny; v.pz = pa.z + (b.z - pa.z) * ip.alpha; v.snap = b;
    }
    for (const [id, v] of this.views) if (!seen.has(id)) {
      if (!v.obj) this.ghosts.push({ type: v.snap.type, side: v.snap.side, owner: v.snap.owner, x: v.px, y: v.py, z: v.pz, yaw: v.yaw, t: 0 });
      else this.group.remove(v.obj);
      this.views.delete(id);
    }
    this.draw(you, selectedSquads, dt, sv);
  }

  private ground(sv: StructureViews | null, x: number, y: number, z: number) {
    return (z > 0 && sv ? sv.groundUnder(x, y) : this.world.heightAt(x, y)) + z;
  }

  private draw(you: PlayerId, sel: Set<number>, dt: number, sv: StructureViews | null) {
    for (const b of this.models.values()) b.begin();
    const { m, q, s, p, c } = this;
    let nRing = 0, nSel = 0, nBar = 0, nShield = 0, nPav = 0, nLad = 0, nBan = 0, nStar = 0;
    this.burning.length = 0;
    const camQ = this.world.camera.quaternion;
    const barScale = Math.min(2.6, Math.max(1, this.world.dist / 60));
    const leaders = new Map<number, number>();
    for (const v of this.views.values()) if (v.snap.squad && v.snap.hp > 0) { const l = leaders.get(v.snap.squad); if (l === undefined || v.id < l) leaders.set(v.snap.squad, v.id); }

    for (const v of this.views.values()) {
      const u = v.snap, d = def(u.type);
      v.spawn = Math.min(1, v.spawn + dt * 3);
      const want = Math.PI / 2 - u.facing;
      let dy = want - v.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.yaw += dy * Math.min(1, dt * 10);
      const moving = v.speed > 0.5 && u.anim !== 2;
      const y = this.ground(sv, v.px, v.py, v.pz);
      p.set(v.px, y, v.py);
      if (u.burning) this.burning.push({ x: v.px, y: v.py, z: y + 1.2 });
      if (v.obj) {
        v.obj.position.copy(p); v.obj.rotation.y = v.yaw - Math.PI / 2;
        if (moving) v.obj.position.y += Math.abs(Math.sin(this.t * 5 + v.id)) * 0.08;
        if (u.type === 'trebuchet' && u.anim === 2) v.obj.rotation.z = Math.sin(this.t * 3) * 0.02;
      } else {
        const b = this.bucket(d.model);
        if (b) {
          const clip = (k: Clip, i: number) => b.model.clips[k][0] + i;
          if (moving) v.walk += dt * Math.min(22, Math.max(7, v.speed * 3.2)); else v.idle += dt * 1.6;
          if (u.anim === 2) v.atk += dt * (8 / Math.max(0.6, d.cd));
          const frame = u.anim === 2 ? clip('attack', Math.floor(v.atk) % 8) : moving ? clip('walk', Math.floor(v.walk) % 8) : clip('idle', Math.floor(v.idle) % 2);
          const sc = d.scale * (0.93 + 0.14 * hash01(u.id)) * (0.6 + 0.4 * v.spawn);
          q.setFromAxisAngle(this.up, v.yaw); s.setScalar(sc); m.compose(p, q, s);
          c.copy(u.side === 'e' ? TINT_E : TINT_P[u.owner ?? you]);
          if (d.tint) c.multiply(new THREE.Color(d.tint).lerp(new THREE.Color(1, 1, 1), 0.35));
          c.multiplyScalar(0.94 + 0.12 * hash01(u.id * 7));
          if (u.slowed) c.lerp(new THREE.Color(0.6, 0.8, 1.3), 0.3);
          b.add(frame, m, c);
          const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
          if (u.shielded && nShield < 600) { // testudo: a big shield in front and one held overhead
            q.setFromAxisAngle(this.up, v.yaw); s.set(1, 1, 1);
            m.compose(new THREE.Vector3(v.px + fx * 0.55, y + 1.0, v.py + fz * 0.55), q, s);
            this.shields.setMatrixAt(nShield, m); this.shields.setColorAt(nShield, c.set(hash01(u.id) < 0.5 ? '#8e2f2b' : '#a33a33')); nShield++;
            q.setFromAxisAngle(this.up, v.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2.2));
            m.compose(new THREE.Vector3(v.px, y + 2.35, v.py), q, s);
            this.shields.setMatrixAt(nShield, m); this.shields.setColorAt(nShield, c.set('#7c2a27')); nShield++;
          }
          if (u.type === 'e_xbow' && !moving && nPav < 200) {
            q.setFromAxisAngle(this.up, v.yaw); s.set(1, 1, 1);
            m.compose(new THREE.Vector3(v.px + fx * 0.9, y + 0.95, v.py + fz * 0.9), q, s);
            this.pavises.setMatrixAt(nPav, m); this.pavises.setColorAt(nPav, c.set('#7a2f2a')); nPav++;
          }
          if (u.type === 'e_ladder' && v.pz === 0 && nLad < 120) { // carried on the shoulder until planted
            q.setFromAxisAngle(this.up, v.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), u.anim === 2 ? -0.35 : -Math.PI / 2.1));
            s.set(1, 1, 1); m.compose(new THREE.Vector3(v.px, y + (u.anim === 2 ? 0 : 1.7), v.py), q, s);
            this.ladders.setMatrixAt(nLad, m); this.ladders.setColorAt(nLad, c.set(1, 1, 1)); nLad++;
          }
          if (leaders.get(u.squad) === u.id && isTroop(u.type) && nBan < 120) { // squad standard
            const ph = 4.3;
            q.identity(); s.set(1, ph, 1); m.compose(new THREE.Vector3(v.px - fz * 0.4, y + ph / 2, v.py + fx * 0.4), q, s);
            this.poles.setMatrixAt(nBan, m); this.poles.setColorAt(nBan, c.set(1, 1, 1));
            q.setFromAxisAngle(this.up, Math.sin(this.t * 3 + u.id) * 0.25); s.set(1, 1, 1);
            m.compose(new THREE.Vector3(v.px - fz * 0.4 + 0.7, y + ph - 0.5, v.py + fx * 0.4), q, s);
            this.cloths.setMatrixAt(nBan, m); this.cloths.setColorAt(nBan, TEAM[u.owner ?? you]); nBan++;
          }
        }
      }
      // ground ring in team / enemy colour
      if (nRing < 900 && v.pz === 0) {
        const r = d.radius * 1.2 + 0.35;
        q.copy(this.flat); s.set(r, r, 1); m.compose(new THREE.Vector3(v.px, y + 0.07, v.py), q, s);
        this.rings.setMatrixAt(nRing, m); this.rings.setColorAt(nRing, u.side === 'e' ? ENEMY_RING : TEAM[u.owner ?? you]); nRing++;
      }
      if (u.squad && sel.has(u.squad) && nSel < 300) {
        const r = (d.radius * 1.5 + 0.6) * (1 + Math.sin(this.t * 5) * 0.05);
        q.copy(this.flat); s.set(r, r, 1); m.compose(new THREE.Vector3(v.px, y + 0.1, v.py), q, s);
        this.selRings.setMatrixAt(nSel, m); this.selRings.setColorAt(nSel, c.set(1, 1, 1)); nSel++;
      }
      const big = u.type === 'warlord' || u.type === 'ram' || u.type === 'siege_tower' || u.type === 'trebuchet';
      if ((u.hp < u.maxHp - 0.5 || big) && nBar < 600) {
        const h = (u.type === 'siege_tower' ? 15 : u.type === 'trebuchet' ? 10 : u.type === 'ram' ? 4 : 3.5 * d.scale / 1.4) + 0.4;
        const w = (big ? 4.5 : 1.6) * barScale, th = (big ? 0.42 : 0.26) * barScale, f = Math.max(0, Math.min(1, u.hp / u.maxHp));
        const bp = new THREE.Vector3(v.px, y + h, v.py);
        s.set(w, th, 1); m.compose(bp, camQ, s); this.barBg.setMatrixAt(nBar, m); this.barBg.setColorAt(nBar, c.set(1, 1, 1));
        const fw = w * 0.92 * f, off = new THREE.Vector3(-(w * 0.92 - fw) / 2, 0, 0.01).applyQuaternion(camQ);
        s.set(Math.max(0.001, fw), th * 0.6, 1); m.compose(bp.add(off), camQ, s);
        this.barFill.setMatrixAt(nBar, m);
        this.barFill.setColorAt(nBar, u.side === 'e' ? c.set(f > 0.5 ? '#ff8a6a' : '#e0453a') : c.set(f > 0.55 ? '#7be09a' : f > 0.25 ? '#f6c85f' : '#ee6b6b'));
        nBar++;
      }
    }
    // stars over veteran squads' standards
    for (const v of this.views.values()) {
      const u = v.snap;
      if (leaders.get(u.squad) !== u.id || !isTroop(u.type)) continue;
      const stars = this.squadStars.get(u.squad) ?? 0;
      for (let i = 0; i < stars && nStar < 360; i++) {
        const y = this.ground(sv, v.px, v.py, v.pz) + 4.9;
        s.setScalar(barScale); m.compose(new THREE.Vector3(v.px, y, v.py).add(new THREE.Vector3((i - (stars - 1) / 2) * 0.7 * barScale, 0, 0).applyQuaternion(camQ)), camQ, s);
        this.stars.setMatrixAt(nStar, m); this.stars.setColorAt(nStar, c.set(1, 1, 1)); nStar++;
      }
    }
    // tower garrisons
    if (sv) for (const [id, g] of sv.garrison) {
      const b = this.bucket('archer');
      if (!b) break;
      for (let i = 0; i < g.n; i++) {
        const a = (i / Math.max(1, g.n)) * Math.PI * 2 + 0.6, r = 1.25;
        q.setFromAxisAngle(this.up, Math.PI + Math.sin(this.t * 0.5 + i) * 0.4); s.setScalar(1.25);
        m.compose(new THREE.Vector3(g.x + Math.cos(a) * r, g.z, g.y + Math.sin(a) * r * 0.6 - 0.6), q, s);
        const f = (this.towerFire.get(id) ?? 0) > 0 ? b.model.clips.attack[0] + (Math.floor(this.t * 10 + i * 3) % 8) : b.model.clips.idle[0] + (Math.floor(this.t + i) % 2);
        b.add(f, m, c.copy(TINT_P[0]).lerp(new THREE.Color(1, 1, 1), 0.5));
      }
    }
    for (const [k, v] of this.towerFire) this.towerFire.set(k, v - dt);
    // the fallen
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]; g.t += dt;
      const d = def(g.type), b = this.models.get(d.model);
      if (g.t > 2.6 || !b) { this.ghosts.splice(i, 1); continue; }
      const f = Math.min(5, Math.floor((g.t / 0.7) * 6)), shrink = g.t < 1.9 ? 1 : Math.max(0, 1 - (g.t - 1.9) / 0.7);
      q.setFromAxisAngle(this.up, g.yaw); s.setScalar(d.scale * shrink);
      m.compose(p.set(g.x, this.ground(sv, g.x, g.y, g.z) - (1 - shrink) * 0.4, g.y), q, s);
      c.copy(g.side === 'e' ? TINT_E : TINT_P[g.owner ?? you]).multiplyScalar(0.8);
      b.add(b.model.clips.death[0] + f, m, c);
    }
    for (const b of this.models.values()) b.end();
    for (const [im, n] of [[this.rings, nRing], [this.selRings, nSel], [this.barBg, nBar], [this.barFill, nBar], [this.shields, nShield], [this.pavises, nPav], [this.ladders, nLad], [this.poles, nBan], [this.cloths, nBan], [this.stars, nStar]] as const) {
      im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** squads' veteran stars (from the snapshot) */
  squadStars = new Map<number, number>();
  /** towers that shot recently (garrison plays its attack animation) */
  towerFire = new Map<number, number>();
}
