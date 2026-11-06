import { centre, CELL, K, STRUCT_TARGET, type EnemyId, type GameState, type Unit } from '@talwacht/shared';
import { blocks, flowOf } from './flowfield';
import { occOf, structById, terrainOf } from './state';
import { defOf, makeUnit, nearby, rebuildHash } from './units';

/** units with mode ≥ CONTROLLED are steered by siege.ts / squads.ts (climbing, docking, digging …) */
export const CONTROLLED = 100;

export function spawnEnemy(s: GameState, type: EnemyId, x: number, y: number, lane: number, group: number): Unit {
  const u = makeUnit(s, type, 'e', null, x, y);
  u.group = group; u.gx = lane;
  return u;
}

const hash01 = (n: number) => { const v = Math.sin(n * 91.7 + 13.1) * 43758.5453; return v - Math.floor(v); };

function terrainSpeed(s: GameState, u: Unit) {
  if (u.z > 0) return 1;
  const t = terrainOf(s), c = t.cellAt(u.x, u.y);
  const k = t.kind[c];
  if (k === K.water && !t.bridge[c]) return 0.5;
  if (k === K.forest) return 0.8;
  return 1;
}

export function speedOf(s: GameState, u: Unit) {
  return defOf(u.type).speed * (1 - u.slow) * terrainSpeed(s, u) * (s.hunger && u.side === 'p' ? 0.85 : 1);
}

function stepTo(u: Unit, gx: number, gy: number, v: number, dt: number) {
  const dx = gx - u.x, dy = gy - u.y, d = Math.hypot(dx, dy);
  if (d < 0.05) { u.vx = u.vy = 0; return 0; }
  const step = Math.min(d, v * dt);
  u.vx = (dx / d) * v; u.vy = (dy / d) * v;
  u.x += (dx / d) * step; u.y += (dy / d) * step;
  u.facing = Math.atan2(dy, dx);
  return step;
}

/** edge distance from a point to a structure footprint */
export function distToStruct(x: number, y: number, st: { cx: number; cy: number; w: number; h: number }) {
  const x0 = st.cx * CELL, y0 = st.cy * CELL, x1 = x0 + st.w * CELL, y1 = y0 + st.h * CELL;
  const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
  return Math.hypot(dx, dy);
}

function moveEnemy(s: GameState, u: Unit, dt: number) {
  const t = terrainOf(s), f = flowOf(s), occ = occOf(s);
  const c = t.cellAt(u.x, u.y);
  const v = speedOf(s, u);
  if (f.dist[c] === 0 || f.next[c] < 0) { u.target = STRUCT_TARGET + s.keepId; return; }
  const n = f.next[c];
  const st = occ[n] ? structById(s, occ[n]) : undefined;
  if (blocks(st) && !(st!.kind === 'gate' && st!.state === 1)) {
    if (u.target === 0 || u.target >= STRUCT_TARGET) u.target = STRUCT_TARGET + st!.id;
    const r = defOf(u.type).range + defOf(u.type).radius * 0.5;
    if (distToStruct(u.x, u.y, st!) > r) {
      const p = centre(n % t.cw, Math.floor(n / t.cw));
      u.charge += stepTo(u, p.x, p.y, v, dt);
      u.anim = 1;
    } else { u.vx = u.vy = 0; }
    return;
  }
  if (u.target >= STRUCT_TARGET && u.target !== STRUCT_TARGET + s.keepId) u.target = 0; // the obstacle is gone
  const p = centre(n % t.cw, Math.floor(n / t.cw));
  // spread a column over the road instead of walking single file
  const off = (hash01(u.id) - 0.5) * 2.6;
  const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy) || 1;
  u.charge += stepTo(u, p.x - (dy / d) * off, p.y + (dx / d) * off, v, dt);
  u.anim = 1;
}

function movePlayer(s: GameState, u: Unit, dt: number) {
  const d = Math.hypot(u.gx - u.x, u.gy - u.y);
  if (d < 0.3) { u.vx = u.vy = 0; if (u.anim === 1) u.anim = 0; return; }
  u.charge += stepTo(u, u.gx, u.gy, speedOf(s, u), dt);
  u.anim = 1;
}

const near: Unit[] = [];
function separate(s: GameState) {
  for (const u of s.units) {
    if (u.hp <= 0 || u.z > 0 || u.formation || u.mode >= CONTROLLED) continue;
    const r = defOf(u.type).radius;
    nearby(s, u.x, u.y, r + 1.2, near);
    for (const o of near) {
      if (o === u || o.z > 0 || o.formation) continue;
      const rr = r + defOf(o.type).radius, dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy);
      if (d >= rr || d === 0) continue;
      const push = (rr - d) * (u.side === o.side ? 0.35 : 0.15);
      u.x += (dx / d) * push; u.y += (dy / d) * push;
    }
  }
}

export function tickMovement(s: GameState, dt: number) {
  rebuildHash(s);
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    if (u.slowT > 0) { u.slowT -= dt; if (u.slowT <= 0) u.slow = 0; }
    if (u.stun > 0) { u.stun -= dt; u.vx = u.vy = 0; continue; }
    if (u.mode >= CONTROLLED || u.formation) continue;
    if (u.anim === 2) { u.vx = u.vy = 0; continue; } // fighting this tick
    if (u.side === 'e') moveEnemy(s, u, dt); else movePlayer(s, u, dt);
  }
  separate(s);
}
