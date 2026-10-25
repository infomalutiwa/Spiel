import * as THREE from 'three';
import type { MapDef, UnitSnap, WallDef, ZoneSnap } from '@burgwacht/shared';
import { UNIT_DEFS, isStructureType } from '@burgwacht/shared';
import { loadModel } from './assets';
import type { World } from './scene';

const SCALE = { wall: 3.0, gate: 3.7, tower: 4.3 };
const MODEL = { wall: 'hex/wall_straight', gate: 'hex/wall_straight_gate', tower: 'hex/building_tower_base_blue' };
const LEVEL_TINT = [new THREE.Color(1, 1, 1), new THREE.Color(0.86, 0.98, 1.18), new THREE.Color(1.3, 1.12, 0.78)];

interface SlotView {
  def: WallDef; slot: number;
  root: THREE.Group; model?: THREE.Object3D; rubble: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  unit?: UnitSnap; alive: boolean; hpFrac: number; level: number; hit: number; shake: number;
}

/** walls, gates, towers, rubble and the capture-point banners of the current map */
export class FortressViews {
  group = new THREE.Group();
  slots: SlotView[] = [];
  private map?: MapDef;
  private zones: { root: THREE.Group; arc: THREE.Mesh; cloth: THREE.Mesh; base: THREE.Mesh; last: number; owner: number }[] = [];
  private crown?: THREE.Group;
  private t = 0;
  private cache = new Map<string, Promise<THREE.Object3D | null>>();

  constructor(private world: World) {
    world.scene.add(this.group);
    world.onMapBuilt.push(m => this.setMap(m));
    this.setMap(world.map);
  }

  /** the wall piece (or its rubble) nearest to a ground point, within `r` */
  slotAt(x: number, y: number, r = 3): number {
    let best = -1, bd = r;
    for (const s of this.slots) {
      const d = Math.hypot(s.def.x - x, s.def.y - y) - UNIT_DEFS[s.def.kind].radius * 0.5;
      if (d < bd) { bd = d; best = s.slot; }
    }
    return best;
  }
  slotUnit(slot: number) { return this.slots[slot]?.unit; }

  private async piece(name: string) {
    let p = this.cache.get(name);
    if (!p) { p = loadModel(name); this.cache.set(name, p); }
    return p;
  }

  private setMap(map: MapDef) {
    this.map = map;
    this.group.clear(); this.slots = []; this.zones = []; this.crown = undefined;
    const build = async (def: WallDef, slot: number) => {
      const root = new THREE.Group();
      root.position.set(def.x, 0, def.y);
      root.rotation.y = Math.PI / 2;
      this.group.add(root);
      const rub = new THREE.Group(); rub.visible = false; root.add(rub);
      const sv: SlotView = { def, slot, root, rubble: rub, materials: [], alive: true, hpFrac: 1, level: 1, hit: 0, shake: 0 };
      this.slots[slot] = sv;
      const [src, ruin] = await Promise.all([this.piece(MODEL[def.kind]), this.piece('hex/building_destroyed')]);
      if (this.map !== map) return;
      if (src) {
        const o = src.clone(true);
        o.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) { m.material = (m.material as THREE.Material).clone(); sv.materials.push(m.material as THREE.MeshStandardMaterial); m.castShadow = m.receiveShadow = true; }
        });
        o.scale.setScalar(SCALE[def.kind]);
        if (def.kind === 'gate') o.scale.set(SCALE.gate * 1.1, SCALE.gate, SCALE.gate * 1.05);
        root.add(o); sv.model = o;
      }
      if (ruin) { const r = ruin.clone(true); r.scale.setScalar(def.kind === 'wall' ? 3.2 : 4.2); r.traverse(c => { (c as THREE.Mesh).castShadow = true; }); rub.add(r); }
    };
    map.walls.forEach((d, i) => void build(d, i));

    // capture points: a pole with a cloth, a ring on the ground and a progress arc
    for (const z of map.zones) {
      const root = new THREE.Group(); root.position.set(z.x, 0, z.y); this.group.add(root);
      const base = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.45, z.r, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      base.rotation.x = -Math.PI / 2; base.position.y = 0.09; root.add(base);
      const arc = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.9, z.r, 96, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: '#ee6b6b', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      arc.rotation.x = -Math.PI / 2; arc.position.y = 0.11; root.add(arc);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.9 }));
      pole.position.y = 3.5; pole.castShadow = true; root.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7, 6, 1), new THREE.MeshStandardMaterial({ color: '#6aa9ff', roughness: 0.8, side: THREE.DoubleSide }));
      cloth.position.set(1.4, 6.0, 0); cloth.castShadow = true; root.add(cloth);
      this.zones.push({ root, arc, cloth, base, last: -1, owner: -1 });
    }
    this.buildCrown(map);
  }

  /** golden strips along the wall crowns, shown while placing troops */
  private buildCrown(map: MapDef) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
    for (const b of map.barriers) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.4, map.depth - 4), mat);
      strip.rotation.x = -Math.PI / 2; strip.position.set(b.x, 3.5, map.depth / 2);
      g.add(strip);
    }
    g.visible = false; this.crown = g; this.group.add(g);
  }

  showCrown(v: boolean) { if (this.crown) this.crown.visible = v; }

  /** matches the snapshot's structures to the map slots and updates damage, level and zone banners */
  sync(units: UnitSnap[], zones: ZoneSnap[] | undefined, dt: number) {
    this.t += dt;
    const map = this.map;
    if (!map || !this.slots.length) return;
    const found = new Set<number>();
    for (const u of units) {
      if (!isStructureType(u.type)) continue;
      let best = -1, bd = 1.5;
      for (const s of this.slots) { if (!s) continue; const d = Math.hypot(s.def.x - u.x, s.def.y - u.y); if (d < bd) { bd = d; best = s.slot; } }
      if (best < 0) continue;
      found.add(best);
      const s = this.slots[best];
      const f = u.hp / u.maxHp;
      if (s.unit && u.hp < s.unit.hp - 0.5) { s.hit = 0.16; s.shake = 0.35; }
      s.unit = u; s.hpFrac = f; s.level = u.level;
    }
    const lookedAtNothing = !units.length;
    for (const s of this.slots) {
      if (!s) continue;
      const alive = found.has(s.slot) || lookedAtNothing;
      if (!alive) s.unit = undefined;
      s.alive = alive;
      if (s.model) s.model.visible = alive;
      s.rubble.visible = !alive;
      if (alive && s.model) {
        const tint = LEVEL_TINT[Math.min(2, s.level - 1)];
        const dark = 0.55 + 0.45 * Math.min(1, s.hpFrac * 1.4);
        s.hit = Math.max(0, s.hit - dt); s.shake = Math.max(0, s.shake - dt);
        for (const m of s.materials) {
          m.color.copy(tint).multiplyScalar(dark * (s.hit > 0 ? 1.7 : 1));
        }
        const lean = s.hpFrac < 0.4 ? (1 - s.hpFrac / 0.4) * 0.07 : 0;
        s.model.rotation.z = lean * (s.slot % 2 ? 1 : -1);
        s.model.position.x = Math.sin(this.t * 60) * 0.12 * (s.shake / 0.35);
      }
    }
    zones?.forEach((z, i) => {
      const zv = this.zones[i], zd = map.zones[i];
      if (!zv || !zd) return;
      const progress = Math.round(z.p * 50);
      if (progress !== zv.last) {
        zv.last = progress;
        zv.arc.geometry.dispose();
        zv.arc.geometry = new THREE.RingGeometry(zd.r - 0.9, zd.r, 96, 1, Math.PI / 2, Math.max(0.001, z.p * Math.PI * 2));
      }
      if (z.o !== zv.owner) {
        zv.owner = z.o;
        (zv.cloth.material as THREE.MeshStandardMaterial).color.set(z.o ? '#e2525a' : '#6aa9ff');
        (zv.arc.material as THREE.MeshBasicMaterial).color.set('#ee6b6b');
      }
      // the cloth ripples in the wind
      const pos = zv.cloth.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(this.t * 3 + pos.getX(k) * 2.2) * 0.18 * (pos.getX(k) + 1.3) / 2.6);
      pos.needsUpdate = true;
      zv.cloth.position.y = 6.0 - (z.o ? 0 : 0) ;
      (zv.base.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.1 * Math.sin(this.t * 2 + i);
    });
  }
}
