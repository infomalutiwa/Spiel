import { MAPS, UNIT_DEFS, type GameState, type Unit } from '@burgwacht/shared';
import { castleOf, rand } from './state';
import { gridOf } from './grid';

/** walk u toward (gx,gy) by up to speed*dt; returns true once arrived */
/** the maps are big: everyone covers ground this much faster than their listed speed */
export const SPEED_SCALE = 1.6;

export function moveToward(u: Unit, gx: number, gy: number, dt: number, speedMul = 1): boolean {
  const def = UNIT_DEFS[u.type];
  const dx = gx - u.x, dy = gy - u.y;
  const d = Math.hypot(dx, dy);
  const step = def.speed * SPEED_SCALE * speedMul * dt;
  u.anim = 1;
  if (d <= Math.max(step, 0.05)) {
    if (d > 0.001) u.facing = Math.atan2(dy, dx);
    u.x = gx; u.y = gy;
    return true;
  }
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
  u.facing = Math.atan2(dy, dx);
  return false;
}

/** executes explicit move / retreat orders; combat.ts handles the rest */
export function stepMovement(s: GameState, dt: number): void {
  for (const u of s.units) {
    if (u.hp <= 0 || u.type === 'castle') continue;
    if (u.routed > 0) continue; // handled by morale logic
    if (u.order.kind === 'move' || u.order.kind === 'retreat') {
      u.anim = 0;
      const arrived = moveToward(u, u.order.x, u.order.y, dt);
      if (arrived) {
        u.order = { kind: 'idle', x: u.x, y: u.y };
        u.postX = u.x; u.postY = u.y;
        u.anim = 0;
      }
    }
  }
}

/** keep units from stacking and inside the map; the castle never moves */
export function separate(s: GameState): void {
  const map = MAPS[s.mapId];
  const grid = gridOf(s);
  grid.rebuild(s.units);
  for (const a of s.units) {
    if (a.hp <= 0) continue;
    const ra = UNIT_DEFS[a.type].radius;
    grid.near(a.x, a.y, ra + 3.5, b => {
      if (b.id <= a.id || b.hp <= 0) return; // each pair once, in id order
      const min = (ra + UNIT_DEFS[b.type].radius) * 0.75;
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= min) return;
      if (d < 1e-4) {
        const ang = rand(s) * Math.PI * 2;
        dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
      }
      const push = Math.min(min - d, 0.5);
      const nx = dx / d, ny = dy / d;
      const aFixed = a.type === 'castle', bFixed = b.type === 'castle';
      const wa = aFixed ? 0 : bFixed ? 1 : 0.5, wb = bFixed ? 0 : aFixed ? 1 : 0.5;
      a.x -= nx * push * wa; a.y -= ny * push * wa;
      b.x += nx * push * wb; b.y += ny * push * wb;
    });
  }
  for (const u of s.units) {
    u.x = Math.min(map.width - 1, Math.max(1, u.x));
    u.y = Math.min(map.depth - 1, Math.max(1, u.y));
  }
}

export const castlePos = (s: GameState) => {
  const c = castleOf(s);
  return c ? { x: c.x, y: c.y } : MAPS[s.mapId].castle;
};
