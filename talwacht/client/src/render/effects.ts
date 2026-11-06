import * as THREE from 'three';
import { CELL, type GameEvent, type ShellSnap, type StructSnap } from '@talwacht/shared';
import type { World } from './scene';
import type { UnitViews } from './units';
import { TEAM } from './units';

interface Part { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; c: THREE.Color; add: boolean }
interface Fly { s: ShellSnap; left: number }
interface Mark { x: number; z: number; t: number; c: THREE.Color }

const ARC: Record<string, number> = { arrow: 0.12, fire: 0.12, bolt: 0.05, ballista: 0.02, stone: 0.35, pot: 0.35, treb: 0.42, pitch: 0, log: 0, rocks: 0 };

export class Effects {
  private group = new THREE.Group();
  private parts: Part[] = [];
  private flies = new Map<number, Fly>();
  private marks: Mark[] = [];
  private spriteAdd: THREE.InstancedMesh; private spriteMix: THREE.InstancedMesh;
  private arrows: THREE.InstancedMesh; private bolts: THREE.InstancedMesh; private stones: THREE.InstancedMesh; private pots: THREE.InstancedMesh; private logs: THREE.InstancedMesh;
  private ringMesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private v = new THREE.Vector3(); private c = new THREE.Color();
  private rubble: { obj: THREE.Object3D; t: number }[] = [];
  onSound: (name: string, x: number, z: number) => void = () => {};

  constructor(private world: World) {
    world.scene.add(this.group);
    const tex = (() => { // soft round puff
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    })();
    const sprite = (blend: THREE.Blending) => {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: blend, vertexColors: false }), 1500);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1500 * 3), 3);
      im.frustumCulled = false; im.count = 0; im.renderOrder = 8; this.group.add(im); return im;
    };
    this.spriteMix = sprite(THREE.NormalBlending);
    this.spriteAdd = sprite(THREE.AdditiveBlending);
    const inst = (g: THREE.BufferGeometry, mat: THREE.Material, n: number) => { const im = new THREE.InstancedMesh(g, mat, n); im.frustumCulled = false; im.count = 0; im.castShadow = false; this.group.add(im); return im; };
    this.arrows = inst(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f3e3b8' }), 400);
    this.bolts = inst(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d8d0c0' }), 300);
    this.stones = inst(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: '#8a8278', flatShading: true }), 60);
    this.pots = inst(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: '#ffb04a' }), 60);
    this.logs = inst(new THREE.CylinderGeometry(0.45, 0.45, 3.6, 7).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8a6440', flatShading: true }), 20);
    this.ringMesh = inst(new THREE.RingGeometry(1.4, 2, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }), 20);
    this.ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(20 * 3), 3);
  }

  private h(x: number, z: number) { return this.world.heightAt(x, z); }

  puff(x: number, y: number, z: number, color: string, n: number, size: number, opt: { up?: number; spread?: number; life?: number; add?: boolean; grow?: number } = {}) {
    for (let i = 0; i < n && this.parts.length < 1400; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opt.spread ?? 2) * Math.random();
      const life = (opt.life ?? 1.2) * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: (opt.up ?? 1.5) * (0.5 + Math.random()), vz: Math.sin(a) * sp, life, max: life, size: size * (0.7 + Math.random() * 0.6), grow: opt.grow ?? 1.6, c: new THREE.Color(color), add: !!opt.add });
    }
  }

  /** server shells: keep flying them locally between snapshots */
  syncShells(shells: ShellSnap[]) {
    const seen = new Set<number>();
    for (const s of shells) {
      seen.add(s.id);
      const f = this.flies.get(s.id);
      if (!f) { this.flies.set(s.id, { s, left: s.t }); if (s.kind === 'stone' || s.kind === 'treb') this.onSound('throw', s.x, s.y); else if (s.kind === 'arrow' || s.kind === 'bolt') this.onSound('arrow', s.x, s.y); }
    }
    for (const [id, f] of this.flies) if (!seen.has(id) && f.left > 0.25) this.flies.delete(id);
  }

  events(evs: GameEvent[]) {
    for (const e of evs) {
      switch (e.k) {
        case 'boom': {
          const y = this.h(e.x, e.y);
          this.puff(e.x, y + 0.5, e.y, '#c9b896', 10 + e.r * 2, 2.2 + e.r * 0.3, { spread: e.r * 0.8, up: 2.5, life: 1.4 });
          if (e.fire) this.puff(e.x, y + 0.6, e.y, '#ff8a2a', 12, 1.6, { spread: e.r * 0.5, up: 3, life: 0.9, add: true });
          this.onSound(e.fire ? 'fire' : 'boom', e.x, e.y);
          break;
        }
        case 'die': this.puff(e.x, this.h(e.x, e.y) + 0.4, e.y, '#d8ccb0', 3, 1.0, { spread: 0.8, up: 0.8, life: 0.8 }); break;
        case 'destroyed': {
          const y = this.h(e.x, e.y);
          this.puff(e.x, y + 1, e.y, '#bfb29a', 26, 3, { spread: 3, up: 3, life: 2.2 });
          this.addRubble(e.x, y, e.y);
          this.onSound('crash', e.x, e.y);
          break;
        }
        case 'heal': this.puff(e.x, this.h(e.x, e.y) + 1.6, e.y, '#9dffb0', 3, 0.5, { spread: 0.4, up: 1.4, life: 0.7, add: true }); break;
        case 'trap': this.puff(e.x, this.h(e.x, e.y) + 0.3, e.y, '#a8946e', 8, 1.4, { spread: 1.5, up: 1.5 }); this.onSound('trap', e.x, e.y); break;
        case 'ping': this.marks.push({ x: e.x, z: e.y, t: 4, c: TEAM[e.p].clone() }); this.onSound('ping', e.x, e.y); break;
        case 'gate': this.onSound('gate', 0, 0); break;
      }
    }
  }

  private addRubble(x: number, y: number, z: number) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#9a8f7d', flatShading: true, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.6, 0), mat);
      r.position.set(x + (Math.random() - 0.5) * 3.6, y + 0.2, z + (Math.random() - 0.5) * 3.6); r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      r.castShadow = true; g.add(r);
    }
    this.group.add(g); this.rubble.push({ obj: g, t: 0 });
  }

  update(dt: number, units: UnitViews, structs: Iterable<StructSnap>) {
    // flames on burning buildings and soldiers
    for (const st of structs) if (st.burning && Math.random() < dt * 14) {
      const x = (st.cx + st.w / 2) * CELL + (Math.random() - 0.5) * st.w * CELL * 0.7, z = (st.cy + st.h / 2) * CELL + (Math.random() - 0.5) * st.h * CELL * 0.7;
      const y = this.h(x, z) + 1 + Math.random() * 3;
      this.puff(x, y, z, '#ff7a22', 1, 1.6, { spread: 0.3, up: 2.2, life: 0.7, add: true });
      if (Math.random() < 0.4) this.puff(x, y + 2, z, '#4a4440', 1, 2.4, { spread: 0.4, up: 2, life: 2.2 });
    }
    for (const b of units.burning) if (Math.random() < dt * 8) this.puff(b.x, b.z, b.y, '#ff8a2a', 1, 0.9, { spread: 0.2, up: 1.6, life: 0.5, add: true });

    // projectiles
    let na = 0, nb = 0, ns = 0, np = 0, nl = 0;
    const { m, q, s, v } = this;
    for (const [id, f] of this.flies) {
      f.left -= dt;
      const sh = f.s;
      if (f.left <= -0.05) { this.flies.delete(id); continue; }
      const k = 1 - Math.max(0, f.left) / Math.max(0.01, sh.total);
      const x0 = sh.x, z0 = sh.y, x1 = sh.tx, z1 = sh.ty;
      const y0 = sh.kind === 'log' ? this.h(x0, z0) + 0.5 : this.h(x0, z0) + sh.z, y1 = sh.kind === 'log' ? this.h(x1, z1) + 0.5 : this.h(x1, z1) + sh.tz;
      const dist = Math.hypot(x1 - x0, z1 - z0);
      const arc = (ARC[sh.kind] ?? 0.1) * dist * 4 * k * (1 - k);
      const x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k, y = (sh.kind === 'log' ? this.h(x, z) + 0.5 : y0 + (y1 - y0) * k) + arc;
      // heading along the flight path
      const k2 = Math.min(1, k + 0.02), arc2 = (ARC[sh.kind] ?? 0.1) * dist * 4 * k2 * (1 - k2);
      v.set(x0 + (x1 - x0) * k2 - x, y0 + (y1 - y0) * k2 + arc2 - y, z0 + (z1 - z0) * k2 - z).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.lengthSq() ? v : new THREE.Vector3(0, 0, 1));
      const pos = new THREE.Vector3(x, y, z);
      if (sh.kind === 'arrow' || sh.kind === 'fire') { s.set(1, 1, 1); m.compose(pos, q, s); if (na < 400) this.arrows.setMatrixAt(na++, m); if (sh.kind === 'fire' && Math.random() < 0.5) this.puff(x, y, z, '#ff9a3a', 1, 0.5, { spread: 0.05, up: 0.2, life: 0.25, add: true }); }
      else if (sh.kind === 'bolt' || sh.kind === 'ballista') { s.set(sh.kind === 'ballista' ? 2.4 : 1, sh.kind === 'ballista' ? 2.4 : 1, sh.kind === 'ballista' ? 3 : 1); m.compose(pos, q, s); if (nb < 300) this.bolts.setMatrixAt(nb++, m); }
      else if (sh.kind === 'stone' || sh.kind === 'treb' || sh.kind === 'rocks') { s.setScalar(sh.kind === 'treb' ? 1.8 : 1); m.compose(pos, q.identity(), s); if (ns < 60) this.stones.setMatrixAt(ns++, m); }
      else if (sh.kind === 'pot') { s.setScalar(1); m.compose(pos, q.identity(), s); if (np < 60) this.pots.setMatrixAt(np++, m); if (Math.random() < 0.6) this.puff(x, y, z, '#ff8a2a', 1, 0.7, { spread: 0.1, up: 0.3, life: 0.3, add: true }); }
      else if (sh.kind === 'pitch') { if (Math.random() < 0.8) this.puff(x, y, z, '#1c1612', 2, 0.8, { spread: 0.6, up: -2, life: 0.5 }); }
      else if (sh.kind === 'log') { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(x1 - x0, z1 - z0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), k * 20)); s.setScalar(1); m.compose(pos, q, s); if (nl < 20) this.logs.setMatrixAt(nl++, m); }
    }
    for (const [im, n] of [[this.arrows, na], [this.bolts, nb], [this.stones, ns], [this.pots, np], [this.logs, nl]] as const) { im.count = n; im.instanceMatrix.needsUpdate = true; }

    // particles
    const camQ = this.world.camera.quaternion;
    let ia = 0, im = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.96; p.vz *= 0.96;
      const f = p.life / p.max, size = p.size * (1 + (1 - f) * p.grow);
      s.set(size, size, size); m.compose(v.set(p.x, p.y, p.z), camQ, s);
      this.c.copy(p.c).multiplyScalar(p.add ? f : 0.6 + 0.4 * f);
      if (p.add) { this.spriteAdd.setMatrixAt(ia, m); this.spriteAdd.setColorAt(ia, this.c); ia++; }
      else { this.spriteMix.setMatrixAt(im, m); this.spriteMix.setColorAt(im, this.c); im++; }
    }
    for (const [mesh, n] of [[this.spriteAdd, ia], [this.spriteMix, im]] as const) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    (this.spriteMix.material as THREE.MeshBasicMaterial).opacity = 0.75;

    // ping markers
    let nr = 0;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mk = this.marks[i]; mk.t -= dt;
      if (mk.t <= 0) { this.marks.splice(i, 1); continue; }
      const sc = 1 + ((4 - mk.t) % 1) * 1.5;
      s.set(sc, 1, sc); m.compose(v.set(mk.x, this.h(mk.x, mk.z) + 0.3, mk.z), q.identity(), s);
      this.ringMesh.setMatrixAt(nr, m); this.ringMesh.setColorAt(nr, mk.c); nr++;
    }
    this.ringMesh.count = nr; this.ringMesh.instanceMatrix.needsUpdate = true; if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    for (let i = this.rubble.length - 1; i >= 0; i--) {
      const r = this.rubble[i]; r.t += dt;
      if (r.t > 25) { r.obj.position.y -= dt * 0.5; if (r.t > 28) { this.group.remove(r.obj); this.rubble.splice(i, 1); } }
    }
  }
}
