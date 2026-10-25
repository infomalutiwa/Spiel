import { audio } from '../audio';
import * as THREE from 'three';
import {
  SQUAD_SIZE, UNIT_DEFS, canManWalls, wallLineAt, type AbilityId, type Command, type Formation, type Snapshot, type TroopType, type UnitSnap,
} from '@burgwacht/shared';
import type { Connection } from '../net/connection';
import type { World } from '../render/scene';
import type { UnitViews } from '../render/units';
import { loadBaked } from '../render/baked';
import { modelInstance } from '../render/assets';
import type { FortressViews } from '../render/fortress';

export type Mode =
  | { k: 'select' }
  | { k: 'buy'; troop: TroopType }
  | { k: 'attackMove' }
  | { k: 'ability'; id: AbilityId };

/** converts a screen drag into the set of own unit ids inside it */
export function idsInBox(
  units: UnitSnap[], project: (u: UnitSnap) => { x: number; y: number; visible: boolean },
  you: number, x0: number, y0: number, x1: number, y1: number,
): number[] {
  const [lx, hx] = [Math.min(x0, x1), Math.max(x0, x1)], [ly, hy] = [Math.min(y0, y1), Math.max(y0, y1)];
  return units.filter(u => u.owner === you && u.type !== 'castle').filter(u => {
    const p = project(u);
    return p.visible && p.x >= lx && p.x <= hx && p.y >= ly && p.y <= hy;
  }).map(u => u.id);
}

export class Controls {
  selected = new Set<number>();
  /** wall / gate / tower slot whose panel is open, or -1 */
  wallSel = -1;
  fortress?: FortressViews;
  mode: Mode = { k: 'select' };
  formation: Formation = 'block';
  onChange: () => void = () => {};
  onError: (msg: string) => void = () => {};
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, in: false };
  private drag?: { x: number; y: number; moved: boolean };
  private zoomImpulse = 0;
  private ghost?: THREE.Group;
  private ghostFor?: string;
  private ringGhost: THREE.Mesh;
  private crownGhost: THREE.Mesh;
  private lastClick = { t: 0, id: -1 };
  private box = document.getElementById('selbox')!;
  /** touch gestures: tap = click, drag = pan, pinch = zoom, long-press + drag = box select */
  private touches = new Map<number, { x: number; y: number }>();
  private tg?: { sx: number; sy: number; moved: boolean; boxing: boolean; timer: number; pinch: number; t: number };
  readonly isTouch = matchMedia('(pointer: coarse)').matches;

  constructor(private world: World, private views: UnitViews, private conn: Connection, private snapshot: () => Snapshot | undefined) {
    const cv = world.canvas;
    cv.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e));
    addEventListener('pointercancel', e => this.up(e));
    cv.addEventListener('contextmenu', e => { e.preventDefault(); this.rightClick(e); });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomImpulse += Math.sign(e.deltaY) * 0.06; }, { passive: false });
    cv.addEventListener('pointerleave', () => { this.mouse.in = false; });
    addEventListener('keydown', e => this.keydown(e));
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    this.ringGhost = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    this.ringGhost.rotation.x = -Math.PI / 2; this.ringGhost.visible = false; this.ringGhost.renderOrder = 6;
    world.scene.add(this.ringGhost);
    this.crownGhost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.crownGhost.rotation.x = -Math.PI / 2; this.crownGhost.visible = false; this.crownGhost.renderOrder = 7;
    world.scene.add(this.crownGhost);
  }

  /** every member of the squads the given units belong to */
  private expandSquads(ids: Iterable<number>): Set<number> {
    const s = this.snapshot(), out = new Set<number>(ids);
    if (!s) return out;
    const squads = new Set(s.units.filter(u => out.has(u.id) && u.squad > 0).map(u => u.squad));
    for (const u of s.units) if (u.owner === this.me() && squads.has(u.squad)) out.add(u.id);
    return out;
  }

  selectSquad(squad: number, focus = false) {
    const s = this.snapshot();
    if (!s) return;
    const mem = s.units.filter(u => u.owner === this.me() && u.squad === squad);
    this.selected = new Set(mem.map(u => u.id)); this.wallSel = -1;
    if (focus && mem.length) this.world.focus(mem.reduce((a, u) => a + u.x, 0) / mem.length, mem.reduce((a, u) => a + u.y, 0) / mem.length);
    this.onChange();
  }

  /** swap in a fresh socket after a reconnect */
  setConnection(c: Connection) { this.conn = c; }

  private me = () => this.conn.you;
  private send(c: Command) { this.conn.cmd(c); }
  private ids() { return [...this.selected]; }
  private phase() { return this.snapshot()?.phase; }

  setMode(m: Mode) { this.mode = m; this.onChange(); }
  cancel() { this.setMode({ k: 'select' }); }

  private groundAt(e: { clientX: number; clientY: number }) { return this.world.screenToGround(e.clientX, e.clientY); }

  /** nearest unit near a ground point, or undefined */
  private pick(g: { x: number; y: number }, own?: boolean): UnitSnap | undefined {
    const s = this.snapshot();
    if (!s) return;
    let best: UnitSnap | undefined, bd = Infinity;
    for (const u of s.units) {
      if (u.type === 'castle') continue;
      if (own === true && u.owner !== this.me()) continue;
      if (own === false && u.side !== 'enemy') continue;
      const p = this.views.posOf(u.id) ?? u;
      const r = Math.max(1.3, UNIT_DEFS[u.type].radius * 1.35);
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d < r && d < bd) { best = u; bd = d; }
    }
    return best;
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'touch') return this.touchDown(e);
    if (e.button !== 0 && e.button !== 1) return;
    this.drag = { x: e.clientX, y: e.clientY, moved: false };
  }

  private move(e: PointerEvent) {
    if (e.pointerType === 'touch') return this.touchMove(e);
    this.mouse = { x: e.clientX, y: e.clientY, in: e.target === this.world.canvas };
    if (this.drag && e.buttons & 1) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved && this.mode.k === 'select') {
        Object.assign(this.box.style, {
          display: 'block', left: `${Math.min(e.clientX, this.drag.x)}px`, top: `${Math.min(e.clientY, this.drag.y)}px`,
          width: `${Math.abs(dx)}px`, height: `${Math.abs(dy)}px`,
        });
      }
    }
    const g = this.groundAt(e);
    const hover = g ? this.pick(g) : undefined;
    this.views.hoverId = hover?.id ?? null;
    this.world.canvas.style.cursor = this.mode.k !== 'select' ? 'crosshair' : hover ? (hover.side === 'enemy' ? 'crosshair' : 'pointer') : 'default';
  }

  private up(e: PointerEvent) {
    if (e.pointerType === 'touch') return this.touchUp(e);
    const d = this.drag; this.drag = undefined;
    this.box.style.display = 'none';
    if (!d || e.button !== 0 || (e.target as HTMLElement)?.id !== 'c') return;
    const s = this.snapshot();
    if (!s) return;
    if (d.moved && this.mode.k === 'select') {
      const ids = idsInBox(s.units, u => { const p = this.views.posOf(u.id) ?? u; return this.world.worldToScreen(p.x, p.y, 1); },
        this.me(), d.x, d.y, e.clientX, e.clientY);
      if (!e.shiftKey) this.selected.clear();
      this.expandSquads(ids).forEach(i => this.selected.add(i));
      this.wallSel = -1;
      this.onChange();
      return;
    }
    const g = this.groundAt(e);
    if (!g) return;
    this.click(g, e);
  }

  private click(g: { x: number; y: number }, e: { shiftKey: boolean }) {
    const m = this.mode;
    if (m.k === 'buy') {
      if (this.phase() !== 'prep') return this.cancel();
      this.send({ c: 'buy', troop: m.troop, x: g.x, y: g.y }); audio.play('coins', 0.7);
      return;
    }
    if (m.k === 'ability') { this.send({ c: 'ability', id: m.id, x: g.x, y: g.y }); this.cancel(); return; }
    if (m.k === 'attackMove') {
      if (this.selected.size) this.send({ c: 'attack', ids: this.ids(), x: g.x, y: g.y, formation: this.formation });
      this.cancel(); return;
    }
    const u = this.pick(g, true);
    if (u) {
      this.wallSel = -1;
      const dbl = performance.now() - this.lastClick.t < 350 && this.lastClick.id === u.id;
      this.lastClick = { t: performance.now(), id: u.id };
      const squad = this.expandSquads([u.id]);
      if (dbl) { // select every own squad of this type
        if (!e.shiftKey) this.selected.clear();
        this.snapshot()?.units.filter(x => x.owner === this.me() && x.type === u.type).forEach(x => this.selected.add(x.id));
      } else if (e.shiftKey) { const all = [...squad].every(i => this.selected.has(i)); squad.forEach(i => (all ? this.selected.delete(i) : this.selected.add(i))); }
      else { this.selected = squad; }
    } else {
      const slot = this.fortress?.slotAt(g.x, g.y, 2.4) ?? -1;
      if (slot >= 0 && (!this.isTouch || !this.selected.size)) { this.wallSel = slot; this.selected.clear(); }
      else if (!e.shiftKey) { this.selected.clear(); this.wallSel = -1; }
    }
    this.onChange();
  }

  private rightClick(e: MouseEvent) {
    const g = this.groundAt(e);
    if (!g) return;
    if (this.mode.k !== 'select') return this.cancel();
    this.command(g);
  }

  /** order the selection to place / move / attack at a ground point */
  private command(g: { x: number; y: number }) {
    if (!this.selected.size) return;
    const phase = this.phase();
    if (phase === 'prep') {
      const z = this.world.map.placeZone;
      this.send({ c: 'place', ids: this.ids(), x: Math.min(z.x1, Math.max(z.x0, g.x)), y: Math.min(z.y1, Math.max(z.y0, g.y)) });
    } else if (phase === 'battle') {
      const foe = this.pick(g, false);
      if (foe) this.send({ c: 'attack', ids: this.ids(), x: foe.x, y: foe.y, targetId: foe.id, formation: this.formation });
      else this.send({ c: 'move', ids: this.ids(), x: g.x, y: g.y, formation: this.formation });
    }
  }


  /* ---------- touch ---------- */
  private touchDown(e: PointerEvent) {
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.mouse = { x: e.clientX, y: e.clientY, in: this.mode.k !== 'select' };
    if (this.touches.size === 1) {
      const tg = { sx: e.clientX, sy: e.clientY, moved: false, boxing: false, timer: 0, pinch: 0, t: performance.now() };
      // long press arms box selection (only when nothing else wants the next touch)
      tg.timer = window.setTimeout(() => {
        if (!tg.moved && this.mode.k === 'select' && this.tg === tg) { tg.boxing = true; navigator.vibrate?.(15); }
      }, 380);
      this.tg = tg;
    } else if (this.tg) {
      clearTimeout(this.tg.timer);
      this.tg.moved = true; this.tg.boxing = false; this.box.style.display = 'none';
      this.tg.pinch = this.pinchDist();
    }
  }

  private pinchDist() {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private touchMove(e: PointerEvent) {
    const prev = this.touches.get(e.pointerId), tg = this.tg;
    if (!prev || !tg) return;
    const cur = { x: e.clientX, y: e.clientY };
    const mid = (m: Map<number, { x: number; y: number }>) => {
      const v = [...m.values()]; return { x: v.reduce((a, p) => a + p.x, 0) / v.length, y: v.reduce((a, p) => a + p.y, 0) / v.length };
    };
    const before = mid(this.touches);
    this.touches.set(e.pointerId, cur);
    const after = mid(this.touches);
    if (this.touches.size >= 2) {
      const d = this.pinchDist();
      if (tg.pinch > 0 && d > 0) this.zoomImpulse += tg.pinch / d - 1;
      tg.pinch = d;
      this.panBy(before, after);
      return;
    }
    if (!tg.moved && Math.hypot(cur.x - tg.sx, cur.y - tg.sy) > 10) {
      tg.moved = true; clearTimeout(tg.timer);
    }
    this.mouse = { x: cur.x, y: cur.y, in: this.mode.k !== 'select' && !tg.moved };
    if (tg.boxing) {
      Object.assign(this.box.style, {
        display: 'block', left: `${Math.min(cur.x, tg.sx)}px`, top: `${Math.min(cur.y, tg.sy)}px`,
        width: `${Math.abs(cur.x - tg.sx)}px`, height: `${Math.abs(cur.y - tg.sy)}px`,
      });
    } else if (tg.moved) this.panBy(before, after);
  }

  /** drag the world so the ground point under the finger stays under the finger */
  private panBy(from: { x: number; y: number }, to: { x: number; y: number }) {
    const a = this.world.screenToGround(from.x, from.y), b = this.world.screenToGround(to.x, to.y);
    if (a && b) this.world.focus(this.world.target.x + a.x - b.x, this.world.target.z + a.y - b.y);
  }

  private touchUp(e: PointerEvent) {
    const had = this.touches.delete(e.pointerId);
    const tg = this.tg;
    if (!had || !tg) return;
    if (this.touches.size > 0) return; // still a multi-touch gesture; wait for the last finger
    clearTimeout(tg.timer); this.tg = undefined; this.box.style.display = 'none'; this.mouse.in = false;
    const s = this.snapshot();
    if (!s || e.type === 'pointercancel') return;
    if (tg.boxing) {
      const ids = idsInBox(s.units, u => { const p = this.views.posOf(u.id) ?? u; return this.world.worldToScreen(p.x, p.y, 1); },
        this.me(), tg.sx, tg.sy, e.clientX, e.clientY);
      this.selected = this.expandSquads(ids); this.wallSel = -1; this.onChange();
      return;
    }
    if (tg.moved) return;
    const g = this.groundAt(e);
    if (!g) return;
    if (this.mode.k !== 'select') return this.click(g, { shiftKey: false });
    // select mode: tap own unit = select, tap anything else = order (or deselect when nothing is selected)
    if (this.pick(g, true)) return this.click(g, { shiftKey: false });
    if (this.selected.size && (this.phase() === 'prep' || this.phase() === 'battle')) { this.command(g); return; }
    this.click(g, { shiftKey: false });
  }

  selectAll() {
    this.selected = new Set(this.snapshot()?.units.filter(u => u.owner === this.me() && u.type !== 'castle').map(u => u.id));
    this.onChange();
  }
  clearSelection() { this.selected.clear(); this.wallSel = -1; this.cancel(); this.onChange(); }

  private keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    const battle = this.phase() === 'battle';
    if (k === 'escape') { this.cancel(); this.selected.clear(); this.wallSel = -1; this.onChange(); }
    else if (k === 'a' && e.ctrlKey) {
      e.preventDefault();
      this.selected = new Set(this.snapshot()?.units.filter(u => u.owner === this.me() && u.type !== 'castle').map(u => u.id));
      this.onChange();
    }
    else if (k === 'a' && battle && this.selected.size) this.setMode({ k: 'attackMove' });
    else if (k === 'h' && battle && this.selected.size) this.send({ c: 'hold', ids: this.ids() });
    else if (k === 'x' && battle && this.selected.size) this.send({ c: 'retreat', ids: this.ids() });
    else if (k === 'q' && battle) this.setMode({ k: 'ability', id: 'arrowRain' });
    else if (k === 'e' && battle) this.setMode({ k: 'ability', id: 'rally' });
    else if (k === '1') { this.formation = 'line'; this.onChange(); }
    else if (k === '2') { this.formation = 'wedge'; this.onChange(); }
    else if (k === '3') { this.formation = 'block'; this.onChange(); }
    else if (k === ' ' && this.phase() === 'prep') {
      e.preventDefault();
      const me = this.snapshot()?.players[this.me()];
      if (me) this.send({ c: 'ready', ready: !me.ready });
    }
  }

  /** drop dead / foreign ids so the selection never points at ghosts */
  prune(s: Snapshot) {
    const alive = new Set(s.units.filter(u => u.owner === this.me()).map(u => u.id));
    let changed = false;
    for (const id of this.selected) if (!alive.has(id)) { this.selected.delete(id); changed = true; }
    if (changed) this.onChange();
  }

  /** camera input + placement ghost, once per frame */
  frame(dt: number) {
    const p = { x: 0, z: 0 };
    const k = this.keys;
    if (k.has('arrowleft')) p.x -= 1;
    if (k.has('arrowright')) p.x += 1;
    if (k.has('arrowup')) p.z -= 1;
    if (k.has('arrowdown')) p.z += 1;
    if (this.mouse.in && !this.drag?.moved && !this.isTouch) {
      const m = 14;
      if (this.mouse.x < m) p.x -= 1; if (this.mouse.x > innerWidth - m) p.x += 1;
      if (this.mouse.y < m) p.z -= 1; if (this.mouse.y > innerHeight - m) p.z += 1;
    }
    const z = this.zoomImpulse * Math.min(1, dt * 14); this.zoomImpulse -= z;
    this.world.frame(dt, p, z);

    // placement ghost
    const mode = this.mode;
    const g = this.mouse.in ? this.world.screenToGround(this.mouse.x, this.mouse.y) : undefined;
    if (mode.k === 'buy' && g) {
      if (this.ghostFor !== mode.troop) {
        const troop = mode.troop;
        if (this.ghost) this.world.scene.remove(this.ghost);
        this.ghost = undefined; this.ghostFor = troop;
        const tint = this.me() === 0 ? new THREE.Color(0.85, 0.97, 1.25) : new THREE.Color(1.25, 0.88, 0.97);
        void (async () => {
          let obj: THREE.Object3D | null = null;
          if (troop === 'catapult') obj = await modelInstance('siege-catapult', 4.6);
          else {
            const m = await loadBaked(troop);
            if (m) {
              const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, transparent: true, opacity: 0.62 });
              mat.color.copy(tint);
              obj = new THREE.Mesh(m.frames[m.clips.idle[0]], mat);
              obj.scale.setScalar(1.45);
            }
          }
          if (!obj || this.ghostFor !== troop) return;
          obj.rotation.y = Math.PI / 2;
          const g = new THREE.Group(); g.add(obj); this.ghost = g; this.world.scene.add(g);
        })();
      }
      const zn = this.world.map.placeZone, map = this.world.map, troop = mode.troop, n = SQUAD_SIZE[troop];
      const ok = g.x >= zn.x0 && g.x <= zn.x1 && g.y >= zn.y0 && g.y <= zn.y1;
      const bar = wallLineAt(map, g.x), crown = bar >= 0 && canManWalls(troop);
      const px = crown ? map.barriers[bar].x : bar >= 0 ? map.barriers[bar].x - 5.2 : g.x;
      const radius = 1.2 + Math.sqrt(n) * 1.15;
      if (this.ghost) { this.ghost.visible = !crown; this.ghost.position.set(px, 0, g.y); }
      this.crownGhost.visible = crown;
      if (crown) { const len = Math.min(map.depth - 12, n * 1.9 + 1.2); this.crownGhost.position.set(px, 3.55, Math.min(map.depth - 6 - len / 2, Math.max(6 + len / 2, g.y))); this.crownGhost.scale.set(1.6, len, 1); }
      this.ringGhost.visible = !crown; this.ringGhost.position.set(px, 0.15, g.y);
      this.ringGhost.scale.setScalar(radius);
      (this.ringGhost.material as THREE.MeshBasicMaterial).color.set(ok ? '#fff3c4' : '#ff8d8d');
      (this.crownGhost.material as THREE.MeshBasicMaterial).color.set(ok ? '#ffe08a' : '#ff8d8d');
    } else {
      if (this.ghost) this.ghost.visible = false;
      this.crownGhost.visible = false;
      if (mode.k === 'ability' && g) {
        this.ringGhost.visible = true; this.ringGhost.position.set(g.x, 0.15, g.y);
        this.ringGhost.scale.setScalar(mode.id === 'arrowRain' ? 7 : 12);
        (this.ringGhost.material as THREE.MeshBasicMaterial).color.set(mode.id === 'arrowRain' ? '#ffe3a8' : '#ffd75e');
      } else this.ringGhost.visible = false;
    }
  }
}
