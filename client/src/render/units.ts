import * as THREE from 'three';
import { TROOPS, UNIT_DEFS, deckAt, deckHeight, isStructureType, rangedOnWall, type PlayerId, type UnitSnap, type UnitType } from '@burgwacht/shared';
import { PAL } from './palette';
import { loadBaked, type BakedModel, type Clip } from './baked';
import { modelInstance } from './assets';
import type { Interp } from '../net/connection';
import type { World } from './scene';

/** world scale of each baked character (the packs ship at roughly human size) */
const SCALE: Partial<Record<UnitType, number>> = {
  knight: 1.45, spearman: 1.45, archer: 1.4, crossbowman: 1.4, mage: 1.4, healer: 1.4, cavalry: 1.5,
  footman: 1.4, raider_archer: 1.4, shaman: 1.45, brute: 2.1, raider_rider: 1.5, ironguard: 1.5, warlord: 3.0,
};
/** kinds that stay as cloned scene objects (few of them, unanimated models) */
const OBJECT_MODELS: Partial<Record<UnitType, { file: string; size: number }>> = {
  catapult: { file: 'siege-catapult', size: 4.6 }, ram: { file: 'siege-ram', size: 4.8 }, raider_catapult: { file: 'siege-catapult', size: 4.6 },
};
const TINT: Record<string, THREE.Color> = {
  p0: new THREE.Color(0.8, 0.95, 1.3), p1: new THREE.Color(1.3, 0.85, 0.95), enemy: new THREE.Color(1, 1, 1),
};
const HEALER_TINT = new THREE.Color(1.5, 1.55, 1.3);
const WARLORD_TINT = new THREE.Color(1.5, 0.62, 0.55);
const FROST = new THREE.Color(0.55, 0.85, 1.4);
/** cape colour by upgrade branch (0 = a plain level-2 cape in the team colour family) */
const BRANCH_CAPE = [new THREE.Color('#8a6b4a'), new THREE.Color('#e0592f'), new THREE.Color('#3f7fe0')];
const PLUME_SILVER = new THREE.Color('#dfe6ee'), PLUME_GOLD = new THREE.Color('#ffcf3d');

const MODEL_ID = (t: UnitType): string => (t === 'warlord' ? 'brute' : t); // the boss is a very big, very angry brute
const FRAME_CAP = 96; // initial instances per frame bucket; grows on demand

interface View {
  id: number; snap: UnitSnap; px: number; py: number; yaw: number;
  walk: number; idle: number; attackT: number; flashT: number; spawnT: number; speed: number; lift: number;
  obj?: THREE.Object3D;
}
interface Ghost { type: UnitType; owner: PlayerId | null; side: UnitSnap['side']; x: number; y: number; yaw: number; t: number; level: number }

/** one InstancedMesh per animation frame of a model */
class Buckets {
  meshes: THREE.InstancedMesh[] = [];
  counts: number[];
  constructor(readonly model: BakedModel, private mat: THREE.Material, private parent: THREE.Object3D) {
    this.counts = new Array(model.frames.length).fill(0);
    model.frames.forEach((_, i) => this.meshes.push(this.make(i, FRAME_CAP)));
  }
  private make(frame: number, cap: number) {
    const m = new THREE.InstancedMesh(this.model.frames[frame], this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
    this.parent.add(m);
    return m;
  }
  begin() { this.counts.fill(0); }
  add(frame: number, matrix: THREE.Matrix4, color: THREE.Color) {
    let m = this.meshes[frame];
    const n = this.counts[frame];
    if (n >= m.instanceMatrix.count) { // grow: replace the bucket with a bigger one
      const old = m;
      this.parent.remove(old);
      m = this.make(frame, old.instanceMatrix.count * 2);
      m.instanceMatrix.array.set(old.instanceMatrix.array); // keep what was already written this frame
      m.instanceColor!.array.set(old.instanceColor!.array);
      old.dispose();
      this.meshes[frame] = m;
    }
    m.setMatrixAt(n, matrix); m.setColorAt(n, color);
    this.counts[frame] = n + 1;
  }
  end() {
    this.meshes.forEach((m, i) => {
      m.count = this.counts[i]; m.visible = m.count > 0;
      if (m.count) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    });
  }
}

/** stable pseudo-random 0..1 per id: gives every soldier its own size and shade */
const hash01 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ringGeo = new THREE.RingGeometry(0.8, 1, 28);
const quad = new THREE.PlaneGeometry(1, 1);
const pipGeo = new THREE.SphereGeometry(0.5, 8, 6);

export class UnitViews {
  views = new Map<number, View>();
  group = new THREE.Group();
  hoverId: number | null = null;
  private models = new Map<UnitType, Buckets>();
  private loading = new Set<UnitType>();
  private ghosts: Ghost[] = [];
  private wrecks: { obj: THREE.Object3D; t: number }[] = [];
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  private teamRings: THREE.InstancedMesh;
  private selRings: THREE.InstancedMesh;
  private barBg: THREE.InstancedMesh;
  private barFill: THREE.InstancedMesh;
  private pips: THREE.InstancedMesh;
  private poles: THREE.InstancedMesh;
  private cloths: THREE.InstancedMesh;
  private capes: THREE.InstancedMesh;
  private plumes: THREE.InstancedMesh;
  /** burning units this frame (effects.ts draws flames on them) */
  burning: { x: number; y: number; h: number }[] = [];
  private hover: THREE.Mesh;
  private t = 0;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  private tmpC = new THREE.Color();
  private tmpP2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

  constructor(private world: World) {
    world.scene.add(this.group);
    const inst = (g: THREE.BufferGeometry, m: THREE.Material, n: number, order = 0) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; im.renderOrder = order;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      this.group.add(im); return im;
    };
    this.teamRings = inst(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), 1500, 1);
    this.selRings = inst(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }), 400, 5);
    const barMat = (c: THREE.ColorRepresentation, o = 0.85) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, side: THREE.DoubleSide });
    this.barBg = inst(quad, barMat('#2b2230', 0.75), 1000, 10);
    this.barFill = inst(quad, barMat('#ffffff', 1), 1000, 11);
    this.pips = inst(pipGeo, new THREE.MeshBasicMaterial({ color: '#ffd75e', depthTest: false, transparent: true }), 1200, 12);
    // squad standards: a pole and a team-coloured cloth over each squad leader
    this.poles = inst(new THREE.CylinderGeometry(0.05, 0.06, 1, 5), new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 }), 64);
    this.cloths = inst(new THREE.PlaneGeometry(1.5, 0.95, 4, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide }), 64);
    this.poles.castShadow = true; this.cloths.castShadow = true;
    // upgraded troops: a cape in the branch colour and a helmet plume (silver level 2, gold level 3)
    this.capes = inst(new THREE.PlaneGeometry(0.85, 1.2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }), 900);
    this.plumes = inst(new THREE.ConeGeometry(0.2, 0.62, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.35 }), 900);
    this.capes.castShadow = true;
    this.hover = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.hover.rotation.x = -Math.PI / 2; this.hover.visible = false; this.hover.renderOrder = 6;
    this.group.add(this.hover);
  }

  posOf(id: number): { x: number; y: number } | undefined {
    const v = this.views.get(id);
    return v && { x: v.px, y: v.py };
  }
  lunge(id: number, tx: number, tz: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.attackT = 0.55;
    v.yaw = Math.atan2(tx - v.px, tz - v.py);
  }
  /** how high above the ground a unit stands (wall crowns) */
  liftOf(id: number): number { return this.views.get(id)?.lift ?? 0; }
  typeOf(id: number): UnitType | undefined { return this.views.get(id)?.snap.type; }
  flash(id: number) { const v = this.views.get(id); if (v) v.flashT = 0.14; }

  private ensureModel(t: UnitType) {
    if (this.models.has(t) || this.loading.has(t) || OBJECT_MODELS[t] || t === 'castle') return;
    this.loading.add(t);
    void loadBaked(MODEL_ID(t)).then(m => { if (m) this.models.set(t, new Buckets(m, this.mat, this.group)); this.loading.delete(t); });
  }

  private tintFor(u: { type: UnitType; side: UnitSnap['side']; owner: PlayerId | null }, you: PlayerId): THREE.Color {
    if (u.type === 'healer') return HEALER_TINT;
    if (u.type === 'warlord') return WARLORD_TINT;
    return u.side === 'enemy' ? TINT.enemy : TINT[`p${u.owner ?? you}`];
  }

  sync(ip: Interp | undefined, you: PlayerId, selected: Set<number>, dt: number) {
    this.t += dt;
    if (!ip) return;
    const a = new Map(ip.a.units.map(u => [u.id, u]));
    const seen = new Set<number>();
    for (const b of ip.b.units) {
      if (b.type === 'castle') continue;
      seen.add(b.id);
      let v = this.views.get(b.id);
      if (!v) {
        v = { id: b.id, snap: b, px: b.x, py: b.y, yaw: Math.PI / 2 - b.facing, walk: Math.random() * 8, idle: Math.random() * 4, attackT: 0, flashT: 0, spawnT: 0, speed: 0, lift: 0 };
        this.views.set(b.id, v);
        if (!isStructureType(b.type)) this.ensureModel(b.type);
        const om = OBJECT_MODELS[b.type];
        if (om && !isStructureType(b.type)) void modelInstance(om.file, om.size).then(o => {
          if (!o || !this.views.has(b.id)) return;
          o.traverse(c => { if ((c as THREE.Mesh).isMesh) { (c as THREE.Mesh).castShadow = true; } });
          v!.obj = o; this.group.add(o);
        });
      }
      const pa = a.get(b.id) ?? b;
      const nx = pa.x + (b.x - pa.x) * ip.alpha, ny = pa.y + (b.y - pa.y) * ip.alpha;
      v.speed = Math.hypot(nx - v.px, ny - v.py) / Math.max(dt, 0.001);
      v.px = nx; v.py = ny; v.snap = b;
    }
    for (const [id, v] of this.views) if (!seen.has(id)) {
      this.ghosts.push({ type: v.snap.type, owner: v.snap.owner, side: v.snap.side, x: v.px, y: v.py, yaw: v.yaw, t: 0, level: v.snap.level });
      if (v.obj) { // wrecked siege machine: shrink away like fallen soldiers do (shares geometry with the cache, so no dispose)
        this.wrecks.push({ obj: v.obj, t: 0 });
      }
      this.views.delete(id);
    }
    this.draw(you, selected, dt);
  }

  private draw(you: PlayerId, selected: Set<number>, dt: number) {
    for (const b of this.models.values()) b.begin();
    const m = this.tmpM, q = this.tmpQ, s = this.tmpS, p = this.tmpP, col = this.tmpC;
    let nTeam = 0, nSel = 0, nBar = 0, nPip = 0, nBan = 0, nCape = 0;
    this.burning.length = 0;
    const camQ = this.world.camera.quaternion;
    const crowns = [...this.views.values()].map(v => v.snap).filter(u => u.type === 'wall' || u.type === 'tower');
    const barScale = Math.min(3, Math.max(1, this.world.dist / 55));

    for (const v of this.views.values()) {
      const u = v.snap, def = UNIT_DEFS[u.type];
      v.spawnT = Math.min(1, v.spawnT + dt * 4);
      const want = Math.PI / 2 - u.facing;
      let d = want - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (v.attackT <= 0) v.yaw += d * Math.min(1, dt * 12);
      const moving = v.speed > 0.6;
      const baked = this.models.get(u.type);
      const clip = (c: Clip, i: number) => baked!.model.clips[c][0] + i;
      const fps = Math.min(24, Math.max(6, v.speed * 4));
      if (moving) v.walk += dt * fps; else v.idle += dt * 1.6;
      if (v.attackT > 0) v.attackT -= dt;
      if (v.flashT > 0) v.flashT -= dt;
      const jit = hash01(u.id), jit2 = hash01(u.id * 7 + 3), leader = u.squad > 0 && u.squad === u.id;
      const isTroop = u.owner !== null && u.side === 'player' && Object.hasOwn(TROOPS, u.type);
      const sc = (SCALE[u.type] ?? 1) * (0.55 + 0.45 * v.spawnT) * (0.93 + 0.14 * jit) * (leader ? 1.07 : 1) * (isTroop ? 1 + 0.05 * (u.level - 1) : 1);
      const structure = isStructureType(u.type);
      if (u.side === 'player' && u.owner !== null && rangedOnWall(u.type)) { // marksmen on a wall crown stand on top of it
        const d = deckAt(crowns, v.px, v.py);
        v.lift += ((d ? deckHeight(d.type) : 0) - v.lift) * Math.min(1, dt * 8);
      }
      const y = this.world.height(v.px, v.py) + v.lift;
      p.set(v.px, y, v.py);

      if (baked) {
        let frame: number;
        if (v.attackT > 0) frame = clip('attack', Math.min(7, Math.floor((1 - v.attackT / 0.55) * 8)));
        else if (moving) frame = clip('walk', Math.floor(v.walk) % 8);
        else frame = clip('idle', Math.floor(v.idle) % 2);
        q.setFromAxisAngle(this.up, v.yaw); s.setScalar(sc);
        m.compose(p, q, s);
        col.copy(this.tintFor(u, you));
        col.r *= 0.93 + 0.14 * jit; col.g *= 0.93 + 0.14 * jit2; col.b *= 0.93 + 0.14 * hash01(u.id * 13 + 1); // every soldier a slightly different shade
        if (v.flashT > 0) col.multiplyScalar(2.2);
        if (isTroop && u.level >= 2) col.multiplyScalar(u.level >= 3 ? 1.16 : 1.07); // veterans stand out a little brighter
        if (u.slowed) col.lerp(FROST, 0.45);
        baked.add(frame, m, col);
        if (isTroop && u.level >= 2 && nCape < 900) { // cape + plume
          const hh = (baked.model.height ?? 3) * sc;
          const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
          q.setFromAxisAngle(this.up, v.yaw); const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.18 - (moving ? 0.15 : 0));
          q.multiply(tilt); s.set(sc * 0.9, sc * 0.9, sc * 0.9);
          m.compose(this.tmpP2.set(v.px - fx * 0.32 * sc, y + hh * 0.5, v.py - fz * 0.32 * sc), q, s);
          this.capes.setMatrixAt(nCape, m); this.capes.setColorAt(nCape, BRANCH_CAPE[u.branch] ?? BRANCH_CAPE[0]);
          q.setFromAxisAngle(this.up, 0); s.setScalar(sc * (u.level >= 3 ? 1.25 : 0.95));
          m.compose(this.tmpP2.set(v.px, y + hh * 0.97, v.py), q, s);
          this.plumes.setMatrixAt(nCape, m); this.plumes.setColorAt(nCape, u.level >= 3 ? PLUME_GOLD : PLUME_SILVER);
          nCape++;
        }
        if (u.burning) this.burning.push({ x: v.px, y: v.py, h: v.lift + ((baked.model.height ?? 3) * sc) * 0.4 });
      } else if (v.obj) {
        if (u.burning) this.burning.push({ x: v.px, y: v.py, h: 1.5 });
        v.obj.position.copy(p); v.obj.rotation.y = v.yaw + Math.PI / 2 * 0; v.obj.scale.setScalar(0.55 + 0.45 * v.spawnT);
        if (moving) v.obj.position.y += Math.abs(Math.sin(this.t * 6 + v.id)) * 0.05;
      }

      if (leader && nBan < 64 && baked) {
        const ph = (baked.model.height ?? 3) * (SCALE[u.type] ?? 1) * 1.07 + 1.3;
        q.identity(); s.set(1, ph, 1); m.compose(this.tmpP2.set(v.px, y + ph / 2, v.py), q, s);
        this.poles.setMatrixAt(nBan, m); this.poles.setColorAt(nBan, this.tmpC.set(1, 1, 1));
        const wave = Math.sin(this.t * 4 + u.id) * 0.18;
        q.setFromAxisAngle(this.up, wave); s.set(1, 1, 1);
        m.compose(this.tmpP2.set(v.px + 0.75, y + ph - 0.55, v.py), q, s);
        this.cloths.setMatrixAt(nBan, m); this.cloths.setColorAt(nBan, PAL.team[u.owner ?? you]);
        nBan++;
      }
      // team ring under every unit
      if (nTeam < 1500 && !structure) {
        const r = def.radius * 1.15 + 0.35;
        q.setFromAxisAngle(this.up, 0).premultiply(this.flat); s.set(r, r, 1);
        m.compose(p.clone().setY(y + 0.06), q, s);
        this.teamRings.setMatrixAt(nTeam, m);
        this.teamRings.setColorAt(nTeam, u.side === 'enemy' ? PAL.enemy : PAL.team[u.owner ?? you]);
        nTeam++;
      }
      const sel = selected.has(u.id);
      if (sel && nSel < 400 && !structure) {
        const r = (def.radius * 1.4 + 0.6) * (1 + Math.sin(this.t * 5) * 0.04);
        q.copy(this.flat); s.set(r, r, 1);
        m.compose(p.clone().setY(y + 0.1), q, s);
        this.selRings.setMatrixAt(nSel, m); this.selRings.setColorAt(nSel, this.tmpC.set(1, 1, 1));
        nSel++;
      }
      // health bar for hurt, selected or hovered units
      if ((u.hp < u.maxHp - 0.5 || (sel && !structure) || this.hoverId === u.id) && nBar < 1000) {
        const h = structure ? deckHeight(u.type) + (u.type === 'gate' ? 3.4 : u.type === 'tower' ? 2.2 : 1.6) : ((baked?.model.height ?? 3) * (SCALE[u.type] ?? 1)) + 0.7;
        const w = (structure ? def.radius * 1.3 : def.radius * 1.5 + 1.2) * barScale, th = (structure ? 0.5 : 0.3) * barScale;
        const f = Math.max(0, Math.min(1, u.hp / u.maxHp));
        const bp = new THREE.Vector3(v.px, y + h + (OBJECT_MODELS[u.type] ? 2 : 0), v.py);
        s.set(w, th, 1); m.compose(bp, camQ, s); this.barBg.setMatrixAt(nBar, m); this.barBg.setColorAt(nBar, this.tmpC.set(1, 1, 1));
        const fw = w * 0.92 * f;
        const off = new THREE.Vector3(-(w * 0.92 - fw) / 2, 0, 0.01).applyQuaternion(camQ);
        s.set(Math.max(0.001, fw), th * 0.62, 1); m.compose(bp.add(off), camQ, s);
        this.barFill.setMatrixAt(nBar, m);
        this.barFill.setColorAt(nBar, f > 0.55 ? this.tmpC.set('#7be09a') : f > 0.25 ? this.tmpC.set('#f6c85f') : this.tmpC.set('#ee6b6b'));
        nBar++;
        for (let i = 0; i < u.level - 1 && nPip < 1200; i++) {
          const pp = new THREE.Vector3(v.px, y + h + 0.55 * barScale, v.py)
            .add(new THREE.Vector3((i - (u.level - 2) / 2) * 0.55 * barScale, 0, 0).applyQuaternion(camQ));
          s.setScalar(0.4 * barScale); m.compose(pp, camQ, s); this.pips.setMatrixAt(nPip, m); this.pips.setColorAt(nPip, this.tmpC.set(1, 1, 1)); nPip++;
        }
      }
    }
    if (this.hoverId !== null) {
      const hv = this.views.get(this.hoverId);
      if (hv && !selected.has(hv.id)) {
        const r = UNIT_DEFS[hv.snap.type].radius * 1.5 + 0.7;
        this.hover.visible = true; this.hover.position.set(hv.px, 0.12, hv.py); this.hover.scale.setScalar(r);
      } else this.hover.visible = false;
    } else this.hover.visible = false;

    // fallen units play their death animation, linger, then shrink away
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      const baked = this.models.get(g.type);
      if (g.t > 2.4 || !baked) { this.ghosts.splice(i, 1); continue; }
      const f = Math.min(5, Math.floor((g.t / 0.7) * 6));
      const shrink = g.t < 1.7 ? 1 : Math.max(0, 1 - (g.t - 1.7) / 0.7);
      q.setFromAxisAngle(this.up, g.yaw); s.setScalar((SCALE[g.type] ?? 1) * shrink);
      m.compose(p.set(g.x, this.world.height(g.x, g.y) - (1 - shrink) * 0.4, g.y), q, s);
      col.copy(this.tintFor(g, you)).multiplyScalar(g.t < 0.25 ? 1.8 - g.t * 3 : 0.8);
      baked.add(baked.model.clips.death[0] + f, m, col);
    }
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      w.obj.rotation.z = Math.min(0.5, w.t * 1.2); w.obj.scale.setScalar(Math.max(0.01, 1 - Math.max(0, w.t - 1.2) / 0.8));
      if (w.t > 2) { this.group.remove(w.obj); this.wrecks.splice(i, 1); }
    }
    for (const b of this.models.values()) b.end();
    for (const [im, n] of [[this.teamRings, nTeam], [this.selRings, nSel], [this.barBg, nBar], [this.barFill, nBar], [this.pips, nPip], [this.poles, nBan], [this.cloths, nBan], [this.capes, nCape], [this.plumes, nCape]] as const) {
      im.count = n; im.visible = n > 0;
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
