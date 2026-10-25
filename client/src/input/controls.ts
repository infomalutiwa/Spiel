import * as THREE from 'three';
import {
  MAPS, UNIT_DEFS, type AbilityId, type Command, type Formation, type Snapshot, type TroopType, type UnitSnap,
} from '@burgwacht/shared';
import type { Connection } from '../net/connection';
import type { World } from '../render/scene';
import type { UnitViews } from '../render/units';
import { PAL } from '../render/palette';
import { buildRig } from '../render/models';

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
  private lastClick = { t: 0, id: -1 };
  private box = document.getElementById('selbox')!;

  constructor(private world: World, private views: UnitViews, private conn: Connection, private snapshot: () => Snapshot | undefined) {
    const cv = world.canvas;
    cv.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e));
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
  }

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
    if (e.button !== 0 && e.button !== 1) return;
    this.drag = { x: e.clientX, y: e.clientY, moved: false };
  }

  private move(e: PointerEvent) {
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
    const d = this.drag; this.drag = undefined;
    this.box.style.display = 'none';
    if (!d || e.button !== 0 || (e.target as HTMLElement)?.id !== 'c') return;
    const s = this.snapshot();
    if (!s) return;
    if (d.moved && this.mode.k === 'select') {
      const ids = idsInBox(s.units, u => { const p = this.views.posOf(u.id) ?? u; return this.world.worldToScreen(p.x, p.y, 1); },
        this.me(), d.x, d.y, e.clientX, e.clientY);
      if (!e.shiftKey) this.selected.clear();
      ids.forEach(i => this.selected.add(i));
      this.onChange();
      return;
    }
    const g = this.groundAt(e);
    if (!g) return;
    this.click(g, e);
  }

  private click(g: { x: number; y: number }, e: PointerEvent) {
    const m = this.mode;
    if (m.k === 'buy') {
      if (this.phase() !== 'prep') return this.cancel();
      this.send({ c: 'buy', troop: m.troop, x: g.x, y: g.y });
      return;
    }
    if (m.k === 'ability') { this.send({ c: 'ability', id: m.id, x: g.x, y: g.y }); this.cancel(); return; }
    if (m.k === 'attackMove') {
      if (this.selected.size) this.send({ c: 'attack', ids: this.ids(), x: g.x, y: g.y, formation: this.formation });
      this.cancel(); return;
    }
    const u = this.pick(g, true);
    if (u) {
      const dbl = performance.now() - this.lastClick.t < 350 && this.lastClick.id === u.id;
      this.lastClick = { t: performance.now(), id: u.id };
      if (dbl) { // select every own unit of this type
        if (!e.shiftKey) this.selected.clear();
        this.snapshot()?.units.filter(x => x.owner === this.me() && x.type === u.type).forEach(x => this.selected.add(x.id));
      } else if (e.shiftKey) { this.selected.has(u.id) ? this.selected.delete(u.id) : this.selected.add(u.id); }
      else { this.selected = new Set([u.id]); }
    } else if (!e.shiftKey) this.selected.clear();
    this.onChange();
  }

  private rightClick(e: MouseEvent) {
    const g = this.groundAt(e);
    if (!g) return;
    if (this.mode.k !== 'select') return this.cancel();
    if (!this.selected.size) return;
    const phase = this.phase();
    if (phase === 'prep') {
      const z = MAPS.meadow.placeZone;
      this.send({ c: 'place', ids: this.ids(), x: Math.min(z.x1, Math.max(z.x0, g.x)), y: Math.min(z.y1, Math.max(z.y0, g.y)) });
    } else if (phase === 'battle') {
      const foe = this.pick(g, false);
      if (foe) this.send({ c: 'attack', ids: this.ids(), x: foe.x, y: foe.y, targetId: foe.id, formation: this.formation });
      else this.send({ c: 'move', ids: this.ids(), x: g.x, y: g.y, formation: this.formation });
    }
  }

  private keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    const battle = this.phase() === 'battle';
    if (k === 'escape') { this.cancel(); this.selected.clear(); this.onChange(); }
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
    if (this.mouse.in && !this.drag?.moved) {
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
        if (this.ghost) this.world.scene.remove(this.ghost);
        const rig = buildRig(mode.troop, PAL.team[this.me()], false, 5);
        rig.root.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.material = (m.material as THREE.Material).clone(); (m.material as THREE.Material).transparent = true; (m.material as THREE.Material).opacity = 0.62; m.castShadow = false; }
        });
        rig.root.rotation.y = Math.PI / 2;
        this.ghost = rig.root; this.ghostFor = mode.troop; this.world.scene.add(rig.root);
      }
      const zn = MAPS.meadow.placeZone;
      const ok = g.x >= zn.x0 && g.x <= zn.x1 && g.y >= zn.y0 && g.y <= zn.y1;
      this.ghost!.visible = true; this.ghost!.position.set(g.x, 0, g.y);
      this.ringGhost.visible = true; this.ringGhost.position.set(g.x, 0.15, g.y);
      this.ringGhost.scale.setScalar(Math.max(1.4, UNIT_DEFS[mode.troop].radius * 1.7));
      (this.ringGhost.material as THREE.MeshBasicMaterial).color.set(ok ? '#fff3c4' : '#ff8d8d');
    } else {
      if (this.ghost) this.ghost.visible = false;
      if (mode.k === 'ability' && g) {
        this.ringGhost.visible = true; this.ringGhost.position.set(g.x, 0.15, g.y);
        this.ringGhost.scale.setScalar(mode.id === 'arrowRain' ? 7 : 12);
        (this.ringGhost.material as THREE.MeshBasicMaterial).color.set(mode.id === 'arrowRain' ? '#ffe3a8' : '#ffd75e');
      } else this.ringGhost.visible = false;
    }
  }
}
