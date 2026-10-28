import * as THREE from 'three';
import type { DamageKind, GameEvent } from '@burgwacht/shared';
import type { World } from './scene';
import type { UnitViews } from './units';
import { audio } from '../audio';

interface Particle {
  s: THREE.Sprite; vx: number; vy: number; vz: number; g: number; life: number; max: number;
  s0: number; s1: number; o0: number;
}
interface Proj {
  m: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; arc: number; spin: boolean;
  trail?: THREE.ColorRepresentation; hitId?: number; onHit?: () => void;
}
interface Ring { m: THREE.Mesh; t: number; dur: number; r: number }

const glow = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!; const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();

/** projectile parts are shared, so firing thousands of arrows never allocates GPU resources */
const SHARED = {
  shaft: new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5),
  boltShaft: new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5),
  rainShaft: new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5),
  tip: new THREE.ConeGeometry(0.07, 0.2, 6),
  rainTip: new THREE.ConeGeometry(0.09, 0.25, 6),
  stone: new THREE.SphereGeometry(0.5, 10, 8),
  arrowMat: new THREE.MeshBasicMaterial({ color: '#f3e6c4' }),
  boltMat: new THREE.MeshBasicMaterial({ color: '#ffe9a8' }),
  tipMat: new THREE.MeshBasicMaterial({ color: '#d7dde3' }),
  stoneMat: new THREE.MeshStandardMaterial({ color: '#8b8580', roughness: 1 }),
  fireArrowMat: new THREE.MeshBasicMaterial({ color: '#ff7a1c' }),
  fireStoneMat: new THREE.MeshStandardMaterial({ color: '#4a2a18', emissive: '#ff6a1c', emissiveIntensity: 1.2, roughness: 1 }),
  orbMat: new THREE.SpriteMaterial({ map: glow, color: '#b78cff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
};
const MAX_PROJECTILES = 160, MAX_QUEUE = 500, MAX_EVENT_AGE_MS = 600;

export class Effects {
  private particles: Particle[] = [];
  private projs: Proj[] = [];
  private rings: Ring[] = [];
  private queue: { at: number; ev: GameEvent }[] = [];
  private group = new THREE.Group();
  private layer: HTMLElement;
  private floaters = 0;
  onBanner: (text: string) => void = () => {};

  constructor(private world: World, private views: UnitViews) {
    world.scene.add(this.group);
    this.layer = document.getElementById('floaters')!;
  }

  /** events arrive with a snapshot; play them slightly late to line up with interpolated motion */
  schedule(events: GameEvent[], delayMs: number) {
    if (document.hidden) return; // rAF is paused in background tabs; don't pile up a burst for when we come back
    const at = performance.now() + delayMs;
    for (const ev of events) if (this.queue.length < MAX_QUEUE) this.queue.push({ at, ev });
  }

  private spark(x: number, y: number, z: number, color: THREE.ColorRepresentation, o: Partial<{ n: number; speed: number; up: number; g: number; life: number; s0: number; s1: number; o0: number }> = {}) {
    const n = o.n ?? 6;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 500) return;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.NormalBlending }));
      const a = Math.random() * 6.28, v = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      sp.position.set(x, y, z);
      this.group.add(sp);
      this.particles.push({
        s: sp, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: (o.up ?? 2) * (0.5 + Math.random()),
        g: o.g ?? 6, life: 0, max: (o.life ?? 0.7) * (0.7 + Math.random() * 0.6), s0: o.s0 ?? 0.5, s1: o.s1 ?? 1.3, o0: o.o0 ?? 0.9,
      });
    }
  }

  private ring(x: number, z: number, r: number, color: THREE.ColorRepresentation, dur = 0.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z); m.scale.setScalar(0.1);
    this.group.add(m); this.rings.push({ m, t: 0, dur, r });
  }

  private float(x: number, y: number, text: string, cls: string) {
    if (this.floaters > 36) return;
    const p = this.world.worldToScreen(x, y, 2.6);
    if (!p.visible) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`; el.textContent = text;
    el.style.left = `${p.x + (Math.random() - 0.5) * 18}px`; el.style.top = `${p.y}px`;
    this.layer.appendChild(el); this.floaters++;
    setTimeout(() => { el.remove(); this.floaters--; }, 900);
  }

  private shot(ev: Extract<GameEvent, { k: 'shot' }>) {
    const tt = this.views.typeOf(ev.to);
    const aim = tt === 'gate' ? 2.4 : tt === 'wall' ? 2.4 : tt === 'tower' ? 4.2 : 1.0 + this.views.liftOf(ev.to);
    const from = new THREE.Vector3(ev.x, 1.4 + this.views.liftOf(ev.from), ev.y), to = new THREE.Vector3(ev.tx, aim, ev.ty);
    const d = from.distanceTo(to);
    const overWall = this.world.map.barriers.some(b => (ev.x - b.x) * (ev.tx - b.x) < 0); // the shot crosses a wall line
    const kind: DamageKind = ev.kind;
    if (kind === 'slash' || kind === 'spear' || kind === 'charge') { // melee: small impact spark at the target
      this.queue.push({ at: performance.now() + 90, ev: { k: 'dmg', x: -1e9, y: ev.to, amt: 0 } });
      this.spark(to.x, 1.2, to.z, '#fff4d0', { n: 4, speed: 2.5, up: 1.5, life: 0.35, s0: 0.35, s1: 0.8 });
      this.views.lunge(ev.from, to.x, to.z);
      this.views.flash(ev.to);
      if (tt === 'gate' || tt === 'wall' || tt === 'tower') { audio.play('siege', 0.55 * this.vol(ev.tx, ev.ty)); this.world.shake(0.12); this.spark(to.x, 1.6, to.z, '#d8c8a8', { n: 3, speed: 2.2, up: 2, life: 0.5, s0: 0.5, s1: 1.1 }); }
      return;
    }
    this.views.lunge(ev.from, to.x, to.z);
    if (this.projs.length >= MAX_PROJECTILES) return;
    let m: THREE.Object3D, speed = 28, arc = Math.max(d * 0.12, overWall ? 4.5 : 0), spin = false, trail: THREE.ColorRepresentation | undefined;
    if (kind === 'pierce' || kind === 'bolt') {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(kind === 'bolt' ? SHARED.boltShaft : SHARED.shaft, ev.fire ? SHARED.fireArrowMat : kind === 'bolt' ? SHARED.boltMat : SHARED.arrowMat);
      shaft.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(SHARED.tip, ev.fire ? SHARED.fireArrowMat : SHARED.tipMat);
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.5;
      g.add(shaft, tip); m = g;
      if (ev.fire) trail = '#ff9a3c';
      if (kind === 'bolt') { speed = 48; arc = Math.max(d * 0.02, overWall ? 2.2 : 0); }
    } else if (kind === 'magic') {
      m = new THREE.Sprite(SHARED.orbMat);
      m.scale.setScalar(1.6); speed = 20; arc = 0.5; trail = '#c9a8ff';
    } else {
      m = new THREE.Mesh(SHARED.stone, SHARED.stoneMat);
      speed = 14; arc = Math.max(5, d * 0.35, overWall ? 9 : 0); spin = true;
    }
    const dur = Math.max(0.12, d / speed);
    m.position.copy(from);
    this.group.add(m);
    this.projs.push({ m, from, to, t: 0, dur, arc, spin, trail, hitId: ev.to, onHit: () => {
      this.views.flash(ev.to);
      if (kind === 'siege') {
        this.spark(to.x, 0.4, to.z, '#cbbd9d', { n: 9, speed: 4, up: 3, life: 0.8, s0: 0.8, s1: 2.2 });
      } else this.spark(to.x, 1.0, to.z, kind === 'magic' ? '#c9a8ff' : '#fff1c9', { n: 4, speed: 2, up: 1.5, life: 0.35, s0: 0.3, s1: 0.8 });
    } });
  }

  /** loudness falls off with distance from what the camera looks at */
  private vol(x: number, y: number) {
    const t = this.world.target, d = Math.hypot(x - t.x, y - t.z);
    return Math.max(0, 1 - d / (this.world.dist * 1.1 + 25));
  }

  private play(ev: GameEvent) {
    switch (ev.k) {
      case 'shot': {
        this.shot(ev);
        const v = this.vol(ev.tx, ev.ty);
        const k = ev.kind;
        audio.play(k === 'slash' ? 'slash' : k === 'spear' ? 'spear' : k === 'charge' ? 'charge' : k === 'pierce' ? 'arrow' : k === 'bolt' ? 'bolt' : k === 'magic' ? 'magic' : 'siege', v);
        break;
      }
      case 'dmg':
        if (ev.amt > 0) this.float(ev.x, ev.y, String(ev.amt), ev.amt >= 40 ? 'big' : '');
        break;
      case 'heal':
        this.float(ev.x, ev.y, `+${ev.amt}`, 'heal'); audio.play('heal', this.vol(ev.x, ev.y) * 0.6);
        this.spark(ev.x, 0.8, ev.y, '#7be09a', { n: 3, speed: 0.8, up: 2.4, g: -1, life: 0.9, s0: 0.35, s1: 0.2 });
        break;
      case 'aoe': {
        const col = { magic: '#b78cff', arrows: '#ffe3a8', rally: '#ffd75e', siege: '#d8c8a8', frost: '#9fdcff', fire: '#ff9a3c' }[ev.kind];
        this.ring(ev.x, ev.y, ev.r, col, ev.kind === 'rally' ? 0.9 : 0.5);
        audio.play(ev.kind === 'rally' ? 'rally' : ev.kind === 'magic' || ev.kind === 'frost' ? 'magic' : ev.kind === 'arrows' ? 'arrow' : 'siege', Math.max(0.5, this.vol(ev.x, ev.y)));
        if (ev.kind === 'siege' && ev.r >= 2.5) { // a stone lands: dust column, flying rubble, the ground shakes
          this.spark(ev.x, 0.6, ev.y, '#cbbd9d', { n: 22, speed: ev.r * 1.3, up: 5, g: 9, life: 1.0, s0: 1.0, s1: 3.2, o0: 0.9 });
          this.spark(ev.x, 1.2, ev.y, '#7d756d', { n: 10, speed: ev.r * 1.2, up: 8, g: 16, life: 0.8, s0: 0.5, s1: 0.9 });
          this.ring(ev.x, ev.y, ev.r * 0.6, '#fff1c9', 0.3);
          this.world.shake(0.25 * this.vol(ev.x, ev.y) + 0.05);
        }
        if (ev.kind === 'fire') {
          this.spark(ev.x, 0.8, ev.y, '#ff8a2c', { n: 26, speed: ev.r * 1.2, up: 5, g: -1.5, life: 1.2, s0: 1.0, s1: 0.3, o0: 0.95 });
          this.spark(ev.x, 0.6, ev.y, '#ffd27a', { n: 14, speed: ev.r * 0.8, up: 4, g: -1, life: 0.8, s0: 0.7, s1: 0.2 });
          this.world.shake(0.2 * this.vol(ev.x, ev.y) + 0.05);
        }
        if (ev.kind === 'frost') this.spark(ev.x, 0.8, ev.y, '#bfe9ff', { n: 14, speed: ev.r, up: 2, g: 1, life: 0.8, s0: 0.5, s1: 1.2 });
        if (ev.kind === 'arrows') this.arrowRain(ev.x, ev.y, ev.r);
        if (ev.kind === 'rally') this.spark(ev.x, 0.5, ev.y, '#ffd75e', { n: 26, speed: ev.r * 0.7, up: 5, g: 1, life: 1.1, s0: 0.5, s1: 0.2 });
        if (ev.kind === 'magic') this.spark(ev.x, 0.8, ev.y, '#c9a8ff', { n: 12, speed: ev.r, up: 2, life: 0.6, s0: 0.6, s1: 1.4 });
        break;
      }
      case 'death':
        audio.play('death', this.vol(ev.x, ev.y));
        this.spark(ev.x, 0.8, ev.y, '#f2ead7', { n: 7, speed: 2.6, up: 2, life: 0.7, s0: 0.8, s1: 2.0, o0: 0.8 });
        this.spark(ev.x, 1.2, ev.y, '#ffd75e', { n: 3, speed: 1.5, up: 4, g: 8, life: 0.6, s0: 0.3, s1: 0.1 });
        break;
      case 'lob': this.lob(ev); break;
      case 'dry': this.onBanner(`dry:${ev.owner}`); this.float(ev.x, ev.y, 'Kein Stein!', 'big'); break;
      case 'revive':
        audio.play('heal', this.vol(ev.x, ev.y));
        this.ring(ev.x, ev.y, 2.6, '#9af0b4', 0.8);
        this.spark(ev.x, 0.5, ev.y, '#ffe9a3', { n: 14, speed: 1.4, up: 5, g: 1, life: 1.1, s0: 0.5, s1: 0.15 });
        break;
      case 'level':
        audio.play('level', this.vol(ev.x, ev.y));
        this.ring(ev.x, ev.y, 2.4, '#ffd75e', 0.7);
        this.spark(ev.x, 1.0, ev.y, '#ffd75e', { n: 12, speed: 2.5, up: 5, g: 6, life: 0.9, s0: 0.45, s1: 0.1 });
        break;
      case 'breach': {
        const w = this.world.map.walls[ev.slot];
        if (w) {
          this.spark(w.x, 1.2, w.y, '#cbbd9d', { n: 26, speed: 6, up: 5, g: 8, life: 1.3, s0: 1.4, s1: 3.6, o0: 0.9 });
          this.spark(w.x, 3, w.y, '#8b8580', { n: 12, speed: 4, up: 7, g: 14, life: 1.0, s0: 0.5, s1: 0.9 });
          this.ring(w.x, w.y, 5, '#cbbd9d', 0.8);
          audio.play('siege', 1); audio.play('death', 0.8);
        }
        this.world.shake(ev.type === 'gate' ? 1.1 : 0.7);
        this.onBanner(`breach:${ev.type}`);
        break;
      }
      case 'zone': audio.play('horn'); this.world.shake(0.5); this.onBanner(`zone:${ev.id}:${ev.owner}`); break;
      case 'wave': audio.play('horn'); this.onBanner(`wave:${ev.wave}`); break;
      case 'phase': if (ev.phase === 'won') audio.play('win'); else if (ev.phase === 'lost') audio.play('lose'); this.onBanner(`phase:${ev.phase}`); break;
    }
  }

  /** a catapult stone in flight: a high lazy arc that lasts exactly as long as the shell does in the simulation */
  private lob(ev: Extract<GameEvent, { k: 'lob' }>) {
    if (this.projs.length >= MAX_PROJECTILES) return;
    const from = new THREE.Vector3(ev.x, 2.2, ev.y), to = new THREE.Vector3(ev.tx, 0.4, ev.ty);
    const d = from.distanceTo(to);
    const m = new THREE.Mesh(SHARED.stone, ev.fire ? SHARED.fireStoneMat : SHARED.stoneMat);
    m.scale.setScalar(ev.fire ? 0.95 : 0.85);
    m.position.copy(from); this.group.add(m);
    audio.play('siege', this.vol(ev.x, ev.y) * 0.8);
    this.spark(ev.x, 2.4, ev.y, '#e8dcc0', { n: 8, speed: 2.5, up: 3, life: 0.5, s0: 0.6, s1: 1.4 }); // the arm snaps forward
    this.projs.push({ m, from, to, t: 0, dur: Math.max(0.3, ev.t), arc: Math.max(6, d * 0.42), spin: true, trail: ev.fire ? '#ff9a3c' : '#bdb4a4' });
  }

  private arrowRain(cx: number, cz: number, r: number) {
    for (let i = 0; i < 26 && this.projs.length < MAX_PROJECTILES; i++) {
      const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r;
      const to = new THREE.Vector3(cx + Math.cos(a) * rr, 0.2, cz + Math.sin(a) * rr);
      const from = new THREE.Vector3(to.x - 6, 26 + Math.random() * 6, to.z);
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(SHARED.rainShaft, SHARED.arrowMat);
      const tip = new THREE.Mesh(SHARED.rainTip, SHARED.tipMat);
      tip.position.y = -0.7; tip.rotation.x = Math.PI;
      g.add(shaft, tip);
      g.visible = false;
      this.group.add(g);
      const delay = Math.random() * 0.45;
      this.projs.push({ m: g, from, to, t: -delay, dur: 0.38, arc: 0, spin: false, onHit: () => this.spark(to.x, 0.3, to.z, '#f6ecd0', { n: 2, speed: 1.5, up: 1.5, life: 0.3, s0: 0.3, s1: 0.6 }) });
    }
  }

  private flameT = 0;

  update(dt: number) {
    const now = performance.now();
    this.flameT -= dt;
    if (this.flameT <= 0) { // burning units shed flames and smoke
      this.flameT = 0.14;
      let n = 0;
      for (const b of this.views.burning) { if (n++ > 24) break; this.spark(b.x, 1.0 + b.h, b.y, Math.random() < 0.5 ? '#ff9a3c' : '#ffd27a', { n: 1, speed: 0.5, up: 2.4, g: -2, life: 0.55, s0: 0.5, s1: 0.1, o0: 0.9 }); if (Math.random() < 0.3) this.spark(b.x, 1.9 + b.h, b.y, '#4a4440', { n: 1, speed: 0.3, up: 1.6, g: -1, life: 0.8, s0: 0.3, s1: 0.9, o0: 0.5 }); }
    }
    for (let i = 0; i < this.queue.length; ) {
      if (this.queue[i].at <= now) {
        const { at, ev } = this.queue.splice(i, 1)[0];
        if (now - at > MAX_EVENT_AGE_MS) continue; // stale after a stall: skip instead of replaying a burst
        if (!(ev.k === 'dmg' && ev.x < -1e8)) this.play(ev);
      }
      else i++;
    }
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.t += dt;
      if (p.t < 0) continue;
      const k = Math.min(1, p.t / p.dur);
      p.m.visible = true;
      p.m.position.lerpVectors(p.from, p.to, k);
      p.m.position.y += Math.sin(k * Math.PI) * p.arc;
      const nx = k + 0.02;
      const look = new THREE.Vector3().lerpVectors(p.from, p.to, nx);
      look.y += Math.sin(Math.min(1, nx) * Math.PI) * p.arc;
      if (!(p.m as THREE.Sprite).isSprite && !p.spin) p.m.lookAt(look);
      if (p.spin) p.m.rotation.x += dt * 8;
      if (p.trail) this.spark(p.m.position.x, p.m.position.y, p.m.position.z, p.trail, { n: 1, speed: 0.3, up: 0, g: 0, life: 0.35, s0: 0.5, s1: 0.1, o0: 0.7 });
      if (k >= 1) { p.onHit?.(); this.group.remove(p.m); this.projs.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      r.m.scale.setScalar(Math.max(0.1, r.r * (1 - Math.pow(1 - Math.min(1, k), 3))));
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) { this.group.remove(r.m); r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { this.group.remove(p.s); p.s.material.dispose(); this.particles.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      p.s.position.x += p.vx * dt; p.s.position.y = Math.max(0.05, p.s.position.y + p.vy * dt); p.s.position.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
      p.s.material.opacity = p.o0 * (1 - k * k);
    }
  }
}
