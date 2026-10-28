import { MAPS, UNIT_DEFS, branchOf, isStructureType, type GameState, type Unit } from '@burgwacht/shared';
import { applyDamage, ignite, resolveDamage } from './combat';
import { moveToward } from './movement';
import { gridOf } from './grid';
import { pushEvent } from './state';

/** nearest melee enemy within `minRange` (edge distance): the thing marksmen back away from */
export function nearestThreat(s: GameState, u: Unit, minRange: number): Unit | undefined {
  let best: Unit | undefined, bd = Infinity;
  const ru = UNIT_DEFS[u.type].radius;
  gridOf(s).near(u.x, u.y, minRange + 10, o => {
    if (o.hp <= 0 || o.side === u.side || isStructureType(o.type) || o.type === 'castle') return;
    const od = UNIT_DEFS[o.type];
    if (od.range >= 4) return;
    const d = Math.hypot(o.x - u.x, o.y - u.y) - ru - od.radius;
    if (d <= minRange && (d < bd || (d === bd && best && o.id < best.id))) { best = o; bd = d; }
  });
  return best;
}

/** stone a shot costs (boulder branch throws bigger rocks) */
export const stoneCost = (u: Unit) => (UNIT_DEFS[u.type].stone ?? 0) + (branchOf(u.type, u.branch) === 'boulder' ? 1 : 0);
export const blastRadius = (u: Unit) => (UNIT_DEFS[u.type].areaRadius ?? 3) * (branchOf(u.type, u.branch) === 'boulder' ? 1.35 : 1);

const flightTime = (u: Unit, d: number) => Math.max(0.7, d / (UNIT_DEFS[u.type].shellSpeed ?? 16));

interface Aim { x: number; y: number; score: number; flight: number }

/** the spot that hurts most: sum of the damage share of everybody inside the blast; structures / siege count extra; moving targets are led */
function chooseAim(s: GameState, u: Unit): Aim | undefined {
  const def = UNIT_DEFS[u.type], min = def.minRange ?? 0, max = def.range, R = blastRadius(u), edge = def.edge ?? 0.5;
  const map = MAPS[s.mapId];
  const foes: Unit[] = [];
  gridOf(s).near(u.x, u.y, max + 10, o => {
    if (o.hp <= 0 || o.side === u.side) return;
    if (o.type === 'castle' || (isStructureType(o.type) && u.side === 'player')) return;
    if (Math.hypot(o.x - u.x, o.y - u.y) <= max + 2) foes.push(o);
  });
  if (!foes.length) return undefined;
  foes.sort((a, b) => a.id - b.id);
  const weight = (o: Unit) => {
    const od = UNIT_DEFS[o.type];
    if (isStructureType(o.type) || o.type === 'castle') return 2.5;
    if (od.armor === 'siege') return u.side === 'player' ? 2 : 1;
    return 1;
  };
  const lead = (o: Unit, T: number) => ({
    x: Math.min(map.width - 1, Math.max(1, o.x + o.vx * T)), y: Math.min(map.depth - 1, Math.max(1, o.y + o.vy * T)),
  });
  let best: Aim | undefined;
  for (const c of foes.length > 70 ? foes.filter((_, i) => i % Math.ceil(foes.length / 70) === 0) : foes) {
    const d0 = Math.hypot(c.x - u.x, c.y - u.y), T = flightTime(u, d0), p = lead(c, T);
    const d = Math.hypot(p.x - u.x, p.y - u.y);
    if (d < min || d > max) continue;
    let score = 0;
    for (const o of foes) {
      const q = lead(o, T);
      const dd = Math.max(0, Math.hypot(q.x - p.x, q.y - p.y) - (isStructureType(o.type) ? UNIT_DEFS[o.type].radius * 0.6 : 0));
      if (dd <= R) score += weight(o) * (1 - (1 - edge) * (dd / R));
    }
    if (!best || score > best.score + 1e-9) best = { x: p.x, y: p.y, score, flight: T };
  }
  return best && best.score >= 0.9 ? best : undefined;
}

/**
 * One tick of a catapult: fire at the best cluster when reloaded and loaded with stone.
 * Player catapults never move on their own; enemy ones stop to shoot once something is in reach, otherwise keep marching.
 */
export function artilleryTurn(s: GameState, u: Unit, dt: number, advance = false): void {
  const def = UNIT_DEFS[u.type];
  if (u.t2 > 0) u.t2 -= dt;
  const aim = chooseAim(s, u);
  if (!aim) {
    if (u.side === 'enemy' && (u.order.kind === 'attackMove' || u.order.kind === 'assault')) moveToward(u, u.order.x, u.order.y, dt, u.slow > 0 ? 0.6 : 1);
    else if (u.anim === 1) u.anim = 0;
    return;
  }
  u.facing = Math.atan2(aim.y - u.y, aim.x - u.x);
  if (advance && u.side === 'enemy') moveToward(u, u.order.x, u.order.y, dt, u.slow > 0 ? 0.6 : 1); // nobody left to wait for: keep rolling along the route
  if (u.cd > 0) return;
  if (u.owner !== null) {
    const me = s.players[u.owner], need = stoneCost(u);
    if (me.stone < need) { // out of ammunition: say so (not more often than every few seconds)
      if (u.t2 <= 0) { u.t2 = 6; pushEvent(s, { k: 'dry', owner: u.owner, x: u.x, y: u.y }); }
      return;
    }
    me.stone -= need;
  }
  u.cd = def.cooldown; u.anim = 2;
  const fire = branchOf(u.type, u.branch) === 'napalm';
  s.shells.push({ id: s.nextId++, side: u.side, owner: u.owner, src: { ...u, order: { ...u.order } }, x: u.x, y: u.y, tx: aim.x, ty: aim.y, t: aim.flight, total: aim.flight, fire });
  pushEvent(s, { k: 'lob', x: u.x, y: u.y, tx: aim.x, ty: aim.y, t: aim.flight, fire });
}

/** shells in flight: on landing everything of the other side inside the blast takes damage with falloff towards the rim */
export function stepShells(s: GameState, dt: number): void {
  if (!s.shells.length) return;
  const keep: typeof s.shells = [];
  for (const sh of s.shells) {
    sh.t -= dt;
    if (sh.t > 0) { keep.push(sh); continue; }
    const def = UNIT_DEFS[sh.src.type], R = blastRadius(sh.src), edge = def.edge ?? 0.5;
    pushEvent(s, { k: 'aoe', x: sh.tx, y: sh.ty, r: R, kind: sh.fire ? 'fire' : 'siege' });
    const victims: Unit[] = [];
    gridOf(s).near(sh.tx, sh.ty, R + 9, v => { if (v.hp > 0 && v.side !== sh.side) victims.push(v); });
    victims.sort((a, b) => a.id - b.id);
    const credit = { owner: sh.owner };
    for (const v of victims) {
      const rv = isStructureType(v.type) || v.type === 'castle' ? UNIT_DEFS[v.type].radius * 0.6 : 0;
      const d = Math.max(0, Math.hypot(v.x - sh.tx, v.y - sh.ty) - rv);
      if (d > R) continue;
      const dmg = resolveDamage(sh.src, v) * (1 - (1 - edge) * (d / R));
      applyDamage(s, credit, v, dmg);
      if (sh.fire && v.hp > 0) ignite(v, sh.owner, (dmg * 0.9) / 4, 4);
    }
  }
  s.shells = keep;
}
