import * as THREE from 'three';
import { CELL, clamp, isWallish, K, lineCells, STRUCTURES, type Snapshot, type StructId, type StructSnap, type Terrain, type UnitSnap } from '@talwacht/shared';
import type { Connection } from '../net/connection';
import type { World } from '../render/scene';
import type { UnitViews } from '../render/units';
import type { StructureViews } from '../render/structures';

export type Mode = { k: 'select' } | { k: 'build'; kind: StructId };

/** what a tap hit */
export interface Pick { x: number; y: number; unit?: UnitSnap; struct?: StructSnap }

/**
 * Touch first: one finger pans (or draws a wall line in wall mode), two fingers zoom and turn,
 * a tap selects or orders, a long press pings. Desktop: left click select, right click order, wheel zoom, WASD pan, Q/E turn.
 */
export class Controls {
  selected = new Set<number>();
  selStruct = -1;
  mode: Mode = { k: 'select' };
  /** cells of the current build preview */
  preview: [number, number][] = [];
  onChange: () => void = () => {};
  onToast: (msg: string, warn?: boolean) => void = () => {};
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private gesture: { pinch: number; angle: number; moved: boolean; longTimer: number; drawing: boolean } | null = null;
  private keys = new Set<string>();
  private lastTap = { t: 0, squad: -1 };
  private previewMesh: THREE.InstancedMesh;
  private lastPreviewSent = 0;
  private ray = new THREE.Raycaster();

  constructor(private world: World, private conn: Connection, private terrain: Terrain, private units: UnitViews, private structs: StructureViews, private snap: () => Snapshot | undefined) {
    const cv = world.canvas;
    cv.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e));
    addEventListener('pointercancel', e => this.up(e, true));
    cv.addEventListener('wheel', e => { e.preventDefault(); this.world.dist *= e.deltaY > 0 ? 1.12 : 0.89; }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => { if (!(e.target instanceof HTMLInputElement)) { this.keys.add(e.key.toLowerCase()); if (e.key === 'Escape') this.cancel(); } });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
    this.previewMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.96, 0.4, CELL * 0.96), mat, 120);
    this.previewMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3);
    this.previewMesh.count = 0; this.previewMesh.frustumCulled = false; this.previewMesh.renderOrder = 4;
    world.scene.add(this.previewMesh);
  }

  setConnection(c: Connection) { this.conn = c; }

  // ---------- picking ----------
  private ndc(x: number, y: number) {
    const r = this.world.canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }
  /** march the view ray: first rampart / building hit, else the ground */
  pick(px: number, py: number): Pick | null {
    this.ray.setFromCamera(this.ndc(px, py), this.world.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    let ground: THREE.Vector3 | null = null, struct: StructSnap | undefined;
    for (let t = 1; t < 2500; t += t < 200 ? 0.8 : 3) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const h = this.terrain.height(x, z);
      const st = this.structs.structAt(Math.floor(x / CELL), Math.floor(z / CELL));
      if (st && !struct) {
        const top = st.kind === 'keep' ? 26 : STRUCTURES[st.kind].cat === 'trap' ? 1 : STRUCTURES[st.kind].cat === 'tower' ? 10 : isWallish(st.kind) ? 6 : 7;
        if (y < h + top) struct = st;
      }
      if (y <= h) { ground = new THREE.Vector3(x, h, z); break; }
    }
    if (!ground) return null;
    // units: nearest on screen within a finger's reach
    const unit = this.pickUnit(px, py);
    return { x: ground.x, y: ground.z, unit, struct };
  }
  private pickUnit(px: number, py: number): UnitSnap | undefined {
    const r = this.world.canvas.getBoundingClientRect();
    let best: UnitSnap | undefined, bd = 26;
    const v = new THREE.Vector3();
    for (const view of this.units.views.values()) {
      const u = view.snap;
      if (u.hp <= 0) continue;
      v.set(view.px, this.world.heightAt(view.px, view.py) + view.pz + 1.4, view.py).project(this.world.camera);
      if (v.z > 1) continue;
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      const dd = Math.hypot(sx - px, sy - py);
      if (dd < bd) { bd = dd; best = u; }
    }
    return best;
  }

  // ---------- gestures ----------
  private down(e: PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 1) {
      const wallMode = this.mode.k === 'build' && (this.mode.kind === 'wall' || STRUCTURES[this.mode.kind].cat === 'trap');
      this.gesture = { pinch: 0, angle: 0, moved: false, drawing: wallMode && e.button !== 2, longTimer: 0 };
      if (this.gesture.drawing) this.startLine(e.clientX, e.clientY);
      else if (this.mode.k === 'build') this.placeSingle(e.clientX, e.clientY);
      this.gesture.longTimer = window.setTimeout(() => this.longPress(e.clientX, e.clientY), 600);
    } else if (this.pointers.size === 2 && this.gesture) {
      clearTimeout(this.gesture.longTimer);
      const [a, b] = [...this.pointers.values()];
      this.gesture.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.gesture.angle = Math.atan2(b.y - a.y, b.x - a.x);
      this.gesture.drawing = false; this.gesture.moved = true;
    }
  }

  private move(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.gesture) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 9 && !this.gesture.moved) { this.gesture.moved = true; clearTimeout(this.gesture.longTimer); }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.gesture.pinch) this.world.dist *= this.gesture.pinch / Math.max(20, dist);
      let da = ang - this.gesture.angle; da = Math.atan2(Math.sin(da), Math.cos(da));
      this.world.yaw = clamp(this.world.yaw - da, -0.75, 0.75);
      this.gesture.pinch = dist; this.gesture.angle = ang;
      this.pan(dx / 2, dy / 2);
      return;
    }
    if (this.gesture.drawing) { this.extendLine(e.clientX, e.clientY); return; }
    if (this.mode.k === 'build' && e.buttons) { this.placeSingle(e.clientX, e.clientY); return; }
    if (this.gesture.moved && (e.buttons || e.pointerType === 'touch')) this.pan(dx, dy);
  }

  private up(e: PointerEvent, cancel = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || !this.gesture) return;
    clearTimeout(this.gesture.longTimer);
    const tap = !this.gesture.moved && !cancel && performance.now() - p.t < 550;
    if (!this.pointers.size) {
      const g = this.gesture; this.gesture = null;
      if (tap && !g.drawing && this.mode.k === 'select') this.tap(e.clientX, e.clientY, e.button === 2);
    }
  }

  private pan(dx: number, dy: number) {
    const k = this.world.dist * 0.0022;
    const cy = Math.cos(this.world.yaw), sy = Math.sin(this.world.yaw);
    this.world.target.x -= (dx * cy + dy * sy) * k;
    this.world.target.z -= (-dx * sy + dy * cy) * k;
    const m = this.terrain.map;
    this.world.target.x = clamp(this.world.target.x, 0, m.w); this.world.target.z = clamp(this.world.target.z, -80, m.d);
  }

  private longPress(x: number, y: number) {
    if (!this.gesture || this.gesture.moved || this.gesture.drawing) return;
    const p = this.pick(x, y);
    if (p) { this.conn.cmd({ c: 'ping', x: p.x, y: p.y, kind: 0 }); navigator.vibrate?.(30); }
    this.gesture.moved = true;
  }

  // ---------- selection and orders ----------
  private tap(x: number, y: number, right: boolean) {
    const p = this.pick(x, y);
    if (!p) return;
    const you = this.conn.you;
    const u = p.unit;
    if (u && u.side === 'p' && u.owner === you && u.squad && !right) {
      const now = performance.now();
      if (now - this.lastTap.t < 380 && this.lastTap.squad === u.squad) { // double tap: every squad of that type
        const s = this.snap(); const q = s?.squads.find(x => x.id === u.squad);
        if (s && q) for (const o of s.squads) if (o.owner === you && o.type === q.type) this.selected.add(o.id);
      } else { this.selected.clear(); this.selected.add(u.squad); }
      this.lastTap = { t: now, squad: u.squad };
      this.selStruct = -1; this.onChange();
      return;
    }
    if (this.selected.size) {
      const target = u && u.side === 'e' ? u.id : undefined;
      const struct = !target && p.struct && p.struct.kind !== 'keep' && STRUCTURES[p.struct.kind].cat !== 'trap' ? p.struct.id : undefined;
      this.conn.cmd({ c: 'order', squads: [...this.selected], x: p.x, y: p.y, target, structure: struct });
      this.marker(p.x, p.y, target ? '#ff6a5a' : struct ? '#7fd3ff' : '#ffe27a');
      return;
    }
    if (p.struct) { this.selStruct = p.struct.id; this.onChange(); return; }
    if (this.selStruct >= 0) { this.selStruct = -1; this.onChange(); }
  }

  selectSquads(ids: number[], add = false) { if (!add) this.selected.clear(); ids.forEach(i => this.selected.add(i)); this.selStruct = -1; this.onChange(); }
  stance(k: 'hold' | 'retreat' | 'attack' | 'wall') {
    if (!this.selected.size) return this.onToast('Erst einen Trupp antippen');
    this.conn.cmd({ c: 'order', squads: [...this.selected], x: 0, y: 0, stance: k });
  }
  cancel() { this.mode = { k: 'select' }; this.preview = []; this.selected.clear(); this.selStruct = -1; this.sendPreview(true); this.onChange(); }

  /** quick feedback ring where an order went */
  marks: { x: number; y: number; t: number; c: string }[] = [];
  private marker(x: number, y: number, c: string) { this.marks.push({ x, y, t: 0.8, c }); }

  // ---------- building ----------
  setBuild(kind: StructId | null) {
    this.mode = kind ? { k: 'build', kind } : { k: 'select' };
    this.preview = [];
    if (kind) { this.selected.clear(); this.selStruct = -1; }
    this.sendPreview(true);
    this.onChange();
  }
  private cellAt(x: number, y: number): [number, number] | null {
    const p = this.pick(x, y);
    return p ? [Math.floor(p.x / CELL), Math.floor(p.y / CELL)] : null;
  }
  private lineStart: [number, number] | null = null;
  private startLine(x: number, y: number) { this.lineStart = this.cellAt(x, y); if (this.lineStart) { this.preview = [this.lineStart]; this.sendPreview(); this.onChange(); } }
  private extendLine(x: number, y: number) {
    const c = this.cellAt(x, y);
    if (!c || !this.lineStart) return;
    if (this.mode.k === 'build' && this.mode.kind !== 'wall') { // traps: paint cells
      if (!this.preview.some(([a, b]) => a === c[0] && b === c[1]) && this.preview.length < 30) this.preview.push(c);
    } else this.preview = lineCells(this.lineStart[0], this.lineStart[1], c[0], c[1]).slice(0, 60);
    this.sendPreview(); this.onChange();
  }
  private placeSingle(x: number, y: number) {
    if (this.mode.k !== 'build') return;
    const c = this.cellAt(x, y);
    if (!c) return;
    const d = STRUCTURES[this.mode.kind];
    this.preview = [[c[0] - Math.floor((d.w - 1) / 2), c[1] - Math.floor((d.h - 1) / 2)]];
    this.sendPreview(); this.onChange();
  }
  /** client-side guess whether a cell can take the piece (server decides) */
  cellOk(cx: number, cy: number, kind: StructId) {
    const t = this.terrain, d = STRUCTURES[kind];
    for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) {
      if (x < 0 || y < 0 || x >= t.cw || y >= t.ch) return false;
      const k = t.kind[y * t.cw + x];
      if (k === K.cliff) return false;
      if (k === K.water && kind !== 'wall' && kind !== 'gate' && kind !== 'moat') return false;
      const st = this.structs.structAt(x, y);
      if (st && !(kind === 'pitch' && (st.kind === 'wall' || st.kind === 'gate')) && !((kind === 'gate' || (isWallish(kind) && kind !== 'keep')) && st.kind === 'wall' && d.w === 1)) return false;
    }
    return true;
  }
  confirmBuild() {
    if (this.mode.k !== 'build' || !this.preview.length) return;
    const kind = this.mode.kind;
    if (kind === 'wall' || STRUCTURES[kind].cat === 'trap') {
      if (kind === 'wall') this.conn.cmd({ c: 'build', kind, cells: this.preview });
      else for (const c of this.preview) this.conn.cmd({ c: 'build', kind, cells: [c] });
    } else this.conn.cmd({ c: 'build', kind, cells: [this.preview[0]] });
    this.preview = [];
    this.sendPreview(true);
    this.onChange();
  }
  private sendPreview(force = false) {
    const now = performance.now();
    if (!force && now - this.lastPreviewSent < 250) return;
    this.lastPreviewSent = now;
    this.conn.cmd({ c: 'preview', kind: this.mode.k === 'build' && this.preview.length ? this.mode.kind : null, cells: this.preview });
  }

  /** per frame: keyboard camera, preview cells (yours and your partner's), order markers */
  frame(dt: number, snap: Snapshot | undefined) {
    const sp = this.world.dist * 1.1 * dt;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.pan(0, sp / (this.world.dist * 0.0022));
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.pan(0, -sp / (this.world.dist * 0.0022));
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.pan(sp / (this.world.dist * 0.0022), 0);
    if (this.keys.has('d') || this.keys.has('arrowright')) this.pan(-sp / (this.world.dist * 0.0022), 0);
    if (this.keys.has('q')) this.world.yaw = clamp(this.world.yaw + dt, -0.75, 0.75);
    if (this.keys.has('e')) this.world.yaw = clamp(this.world.yaw - dt, -0.75, 0.75);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    const draw = (cells: [number, number][], kind: StructId, mine: boolean) => {
      const d = STRUCTURES[kind];
      for (const [cx, cy] of cells) {
        const ok = this.cellOk(cx, cy, kind);
        for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
          if (n >= 120) return;
          const wx = (cx + x + 0.5) * CELL, wz = (cy + y + 0.5) * CELL;
          m.makeTranslation(wx, this.terrain.height(wx, wz) + 0.3, wz);
          this.previewMesh.setMatrixAt(n, m);
          this.previewMesh.setColorAt(n, mine ? col.set(ok ? '#6dff7a' : '#ff4a4a') : col.set('#ee7f9b'));
          n++;
        }
      }
    };
    if (this.mode.k === 'build') draw(this.preview, this.mode.kind, true);
    const other = snap?.previews[1 - this.conn.you];
    if (other) draw(other.cells, other.kind, false);
    this.previewMesh.count = n; this.previewMesh.instanceMatrix.needsUpdate = true; if (this.previewMesh.instanceColor) this.previewMesh.instanceColor.needsUpdate = true;
    for (const mk of this.marks) mk.t -= dt;
    this.marks = this.marks.filter(mk => mk.t > 0);
    // drop selections of squads that no longer exist
    if (snap) for (const id of [...this.selected]) if (!snap.squads.some(q => q.id === id)) this.selected.delete(id);
  }
}
