import * as THREE from 'three';
import { UNIT_DEFS, type PlayerId, type UnitSnap } from '@burgwacht/shared';
import { PAL } from './palette';
import { buildRig, type Rig } from './models';
import type { Interp } from '../net/connection';
import type { World } from './scene';

interface View {
  id: number; rig: Rig; snap: UnitSnap; px: number; py: number; yaw: number;
  walk: number; attackT: number; flashT: number; spawnT: number; dyingT: number; phase: number;
  bar: THREE.Group; fill: THREE.Mesh; stars: THREE.Group; select: THREE.Mesh; hover: THREE.Mesh;
  lastLevel: number; speed: number;
}

const barBg = new THREE.MeshBasicMaterial({ color: '#2b2230', transparent: true, opacity: 0.75, depthTest: false });
const barGeo = new THREE.PlaneGeometry(1, 1);
const starGeo = new THREE.SphereGeometry(0.09, 6, 6);
const starMat = new THREE.MeshBasicMaterial({ color: '#ffd75e', depthTest: false, transparent: true });
const ringGeo = new THREE.RingGeometry(0.82, 1, 32);
/** figures are drawn larger than their sim radius so they read well from the RTS camera */
export const UNIT_SCALE = 1.7;

export class UnitViews {
  views = new Map<number, View>();
  group = new THREE.Group();
  hoverId: number | null = null;
  private t = 0;

  constructor(private world: World) { world.scene.add(this.group); }

  /** world position of a unit view (after interpolation) */
  posOf(id: number): { x: number; y: number } | undefined {
    const v = this.views.get(id);
    return v && { x: v.px, y: v.py };
  }
  lunge(id: number, tx: number, tz: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.attackT = 0.32;
    v.yaw = Math.atan2(tx - v.px, tz - v.py);
  }
  flash(id: number) { const v = this.views.get(id); if (v) v.flashT = 0.16; }

  private create(u: UnitSnap, you: PlayerId): View {
    const enemy = u.side === 'enemy';
    const color = enemy ? PAL.enemy : PAL.team[u.owner ?? you];
    const rig = buildRig(u.type, color, enemy, u.id);
    const def = UNIT_DEFS[u.type];
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, barBg); bg.scale.set(1.5, 0.2, 1); bg.renderOrder = 10;
    const fill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: '#7be09a', depthTest: false, transparent: true })); fill.renderOrder = 11;
    fill.scale.set(1.4, 0.12, 1); fill.position.z = 0.001;
    const stars = new THREE.Group(); stars.position.y = 0.28;
    bar.add(bg, fill, stars); bar.position.y = rig.height + 0.5; bar.scale.setScalar(Math.max(1, def.radius * 1.1));
    rig.root.add(bar);
    const mk = (opacity: number, color: THREE.ColorRepresentation) => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.1; m.scale.setScalar((def.radius * 1.5 + 0.4) / UNIT_SCALE); m.visible = false; m.renderOrder = 5;
      rig.root.add(m); return m;
    };
    const select = mk(0.95, '#ffe27a'), hover = mk(0.7, '#ffffff');
    rig.root.scale.setScalar(UNIT_SCALE);
    bar.scale.setScalar(Math.max(1, def.radius * 1.1));
    this.group.add(rig.root);
    const v: View = {
      id: u.id, rig, snap: u, px: u.x, py: u.y, yaw: Math.PI / 2 - u.facing, walk: 0, attackT: 0, flashT: 0,
      spawnT: 0, dyingT: 0, phase: Math.random() * 6.28, bar, fill, stars, select, hover, lastLevel: 0, speed: 0,
    };
    this.views.set(u.id, v);
    return v;
  }

  sync(ip: Interp | undefined, you: PlayerId, selected: Set<number>, dt: number) {
    this.t += dt;
    if (!ip) return;
    const a = new Map(ip.a.units.map(u => [u.id, u]));
    const seen = new Set<number>();
    for (const b of ip.b.units) {
      if (b.type === 'castle') continue;
      seen.add(b.id);
      const v = this.views.get(b.id) ?? this.create(b, you);
      const pa = a.get(b.id) ?? b;
      const nx = pa.x + (b.x - pa.x) * ip.alpha, ny = pa.y + (b.y - pa.y) * ip.alpha;
      v.speed = Math.hypot(nx - v.px, ny - v.py) / Math.max(dt, 0.001);
      v.px = nx; v.py = ny; v.snap = b; v.dyingT = 0;
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.dyingT += dt;
        if (v.dyingT > 0.2) { this.dispose(v); this.views.delete(id); continue; }
        v.rig.root.scale.multiplyScalar(0.8);
      }
      this.animate(v, dt, selected.has(id));
    }
  }

  /** free everything that belongs to one view (shared bar/ring/star resources stay) */
  private dispose(v: View) {
    this.group.remove(v.rig.root);
    const shared = new Set<unknown>([barBg, barGeo, starGeo, starMat, ringGeo]);
    v.rig.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!shared.has(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.Material;
      if (!shared.has(mat)) mat.dispose();
    });
  }

  private animate(v: View, dt: number, selected: boolean) {
    const u = v.snap, def = UNIT_DEFS[u.type];
    const r = v.rig;
    v.spawnT = Math.min(1, v.spawnT + dt * 4);
    r.root.position.set(v.px, this.world.height(v.px, v.py), v.py);
    // smooth turning toward facing (model faces +z; sim facing is measured from +x)
    const want = Math.PI / 2 - u.facing;
    let d = want - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (v.attackT <= 0) v.yaw += d * Math.min(1, dt * 12);
    r.root.rotation.y = v.yaw;

    const moving = v.speed > 0.6;
    v.walk += dt * (moving ? Math.min(14, 4 + v.speed * 1.4) : 0);
    const bob = moving ? Math.abs(Math.sin(v.walk)) * 0.14 : Math.sin(this.t * 2 + v.phase) * 0.02;
    r.body.position.y = bob;
    const gallop = u.type === 'cavalry' || u.type === 'raider_rider';
    r.body.rotation.x = moving ? (gallop ? Math.sin(v.walk * 1.2) * 0.05 : 0.08) : 0;
    r.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(v.walk + (i % 2 ? Math.PI : 0) + (gallop && i > 1 ? 1.2 : 0)) * (gallop ? 0.7 : 0.8) : 0; });
    if (v.attackT > 0) {
      v.attackT -= dt;
      const k = Math.sin((1 - Math.max(0, v.attackT) / 0.32) * Math.PI);
      const melee = def.range < 4;
      if (r.arm) r.arm.rotation.x = -k * (melee ? 1.9 : 1.2);
      r.body.position.z = k * (melee ? 0.35 : -0.1);
    } else if (r.arm) { r.arm.rotation.x = moving ? Math.sin(v.walk) * 0.5 : Math.sin(this.t * 2 + v.phase) * 0.04; r.body.position.z = 0; }

    // hit flash: warm white wash
    if (v.flashT > 0) v.flashT -= dt;
    r.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial).emissive) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.userData.baseEmissive === undefined) { mat.userData.baseEmissive = mat.emissiveIntensity; }
        if (v.flashT > 0) { mat.emissive.set('#ffffff'); mat.emissiveIntensity = 0.55; }
        else if (mat.userData.flashed) { mat.emissive.copy(mat.userData.emissiveColor ?? new THREE.Color(0)); mat.emissiveIntensity = mat.userData.baseEmissive; }
        mat.userData.flashed = v.flashT > 0;
      }
    });

    // health bar (billboard), shown when hurt, hovered or selected
    const hurt = u.hp < u.maxHp;
    v.bar.visible = hurt || selected || v.hover.visible;
    if (v.bar.visible) {
      v.bar.quaternion.copy(this.world.camera.quaternion).premultiply(r.root.quaternion.clone().invert());
      const f = Math.max(0, u.hp / u.maxHp);
      v.fill.scale.x = 1.4 * f; v.fill.position.x = -0.7 * (1 - f);
      (v.fill.material as THREE.MeshBasicMaterial).color.set(f > 0.55 ? '#7be09a' : f > 0.25 ? '#f6c85f' : '#ee6b6b');
    }
    if (v.lastLevel !== u.level) {
      v.lastLevel = u.level;
      v.stars.clear();
      for (let i = 0; i < u.level - 1; i++) {
        const s = new THREE.Mesh(starGeo, starMat); s.position.x = (i - (u.level - 2) / 2) * 0.24; s.renderOrder = 12; v.stars.add(s);
      }
    }
    v.select.visible = selected;
    if (selected) v.select.scale.setScalar(((def.radius * 1.5 + 0.4) / UNIT_SCALE) * (1 + Math.sin(this.t * 5) * 0.04));
    v.hover.visible = this.hoverId === v.id && !selected;
  }
}
