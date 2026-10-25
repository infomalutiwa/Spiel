import {
  DECK_HEIGHT, MAPS, UNIT_DEFS, deckAt, isStructureType, rangedOnWall,
  type GameState, type MapDef, type Unit, type Vec2,
} from '@burgwacht/shared';
import { castleOf, pushEvent } from './state';
import { gridOf } from './grid';

export { DECK_HEIGHT };

/** per-barrier facts for this tick: which slots stand, so enemies know whether to queue at the gate or stream through a breach */
export interface BarrierInfo { gateAlive: boolean; open: Vec2[] }

export function barrierStates(s: GameState): BarrierInfo[] {
  const map = MAPS[s.mapId];
  const alive = new Set<number>();
  for (const u of s.units) if (u.slot >= 0 && u.hp > 0) alive.add(u.slot);
  return map.barriers.map((_, bi) => {
    const open: Vec2[] = [];
    let gateAlive = true;
    map.walls.forEach((w, slot) => {
      if (w.bar !== bi || alive.has(slot)) return;
      open.push({ x: w.x, y: w.y });
      if (w.kind === 'gate') gateAlive = false;
    });
    return { gateAlive, open };
  });
}

/** the route is gate 0 → zone 0 → gate 1 → zone 1 → zone 2 … → keep */
export const routeLength = (map: MapDef) => map.barriers.length * 2 + Math.max(0, map.zones.length - map.barriers.length);

/** where an enemy should head right now; also advances its route progress */
export function enemyGoal(s: GameState, u: Unit, bs: BarrierInfo[], held: Unit[][] = []): Vec2 {
  const map = MAPS[s.mapId], B = map.barriers.length, total = routeLength(map);
  const j = (u.id % 7) - 3;
  while (u.step < total) {
    const gate = u.step < B * 2 && u.step % 2 === 0;
    const idx = u.step < B * 2 ? u.step >> 1 : u.step - B;
    if (gate) {
      const bar = map.barriers[idx], st = bs[idx];
      if (u.x < bar.x - 2.5) { u.step++; continue; }
      if (st.open.length) { // a breach: aim for the nearest hole in the line
        const hole = st.open.reduce((b, h) => (Math.hypot(h.x - u.x, h.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y) ? h : b));
        return { x: hole.x - 6, y: hole.y };
      }
      return { x: bar.x + 5.2 + (u.id % 3) * 1.4, y: bar.gateY + j * 1.2 };
    }
    const z = map.zones[idx];
    if (s.zones[idx].reached) { u.step++; continue; }
    const hold = held[idx];
    if (hold?.length) { // defenders are keeping the zone: go and dislodge the nearest one
      const d = hold.reduce((b, o) => (Math.hypot(o.x - u.x, o.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y) ? o : b));
      return { x: d.x, y: d.y };
    }
    return { x: z.x + j * 0.7, y: z.y + (((u.id >> 3) % 7) - 3) * 0.7 };
  }
  const k = castleOf(s);
  return k ? { x: k.x + 6, y: k.y + j } : map.castle;
}

export function stepRoutes(s: GameState): void {
  const bs = barrierStates(s), map = MAPS[s.mapId];
  const held: Unit[][] = map.zones.map(() => []);
  for (const u of s.units)
    if (u.hp > 0 && u.side === 'player' && u.owner !== null && !isStructureType(u.type))
      map.zones.forEach((z, i) => { if (Math.hypot(u.x - z.x, u.y - z.y) <= z.r) held[i].push(u); });
  for (const u of s.units) {
    if (u.hp <= 0 || u.side !== 'enemy' || u.routed > 0 || u.order.kind === 'hold') continue;
    const g = enemyGoal(s, u, bs, held);
    u.order = { kind: 'attackMove', x: g.x, y: g.y };
  }
}

/** capture points: enemies fill the bar, defenders push it back; zones fall in order and a fallen last zone loses the wave */
export function stepZones(s: GameState, dt: number): void {
  const map = MAPS[s.mapId];
  const grid = gridOf(s);
  map.zones.forEach((zd, i) => {
    const z = s.zones[i];
    let ne = 0, nd = 0;
    grid.near(zd.x, zd.y, zd.r + 1, u => {
      if (u.hp <= 0 || isStructureType(u.type) || u.type === 'castle') return;
      if (Math.hypot(u.x - zd.x, u.y - zd.y) > zd.r) return;
      if (u.side === 'enemy') ne++; else nd++;
    });
    const reachable = i === 0 || s.zones[i - 1].reached;
    let rate = ne * 0.011 - nd * 0.022;
    if (!reachable) rate = Math.min(rate, 0);
    if (ne === 0 && nd === 0) rate = z.owner === 'enemy' ? 0 : -0.01; // an abandoned bar slowly drains
    z.progress = Math.min(1, Math.max(0, z.progress + Math.max(-0.1, Math.min(0.12, rate)) * dt));
    if (z.owner === 'player' && z.progress >= 1) {
      z.owner = 'enemy'; z.reached = true;
      pushEvent(s, { k: 'zone', id: i, owner: 'enemy' });
      for (const u of s.units) if (u.side === 'player' && u.owner !== null && u.hp > 0 && Math.hypot(u.x - zd.x, u.y - zd.y) <= zd.r) u.morale -= 20;
    } else if (z.owner === 'enemy' && i < map.zones.length - 1 && z.progress < 0.4) {
      z.owner = 'player';
      pushEvent(s, { k: 'zone', id: i, owner: 'player' });
    }
  });
}

/** which ranged defenders stand on a wall (they shoot further and cannot be reached by melee) */
export function stepDecks(s: GameState): void {
  const structs = s.units.filter(u => u.hp > 0 && (u.type === 'wall' || u.type === 'tower'));
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    u.deck = u.side === 'player' && u.owner !== null && rangedOnWall(u.type) ? (deckAt(structs, u.x, u.y)?.id ?? 0) : 0;
  }
}

/** a piece of wall fell: everybody on top tumbles down behind it */
export function dropFromWall(s: GameState, fallen: Unit): void {
  for (const u of s.units) {
    if (u.deck !== fallen.id || u.hp <= 0) continue;
    u.deck = 0; u.x -= 4.4;
    u.hp = Math.max(1, u.hp - u.maxHp * 0.12);
    u.postX = u.x; u.postY = u.y;
    pushEvent(s, { k: 'dmg', x: u.x, y: u.y, amt: Math.round(u.maxHp * 0.12) });
  }
}

export const deckRange = (u: Unit) => UNIT_DEFS[u.type].range;
