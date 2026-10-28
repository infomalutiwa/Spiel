import {
  MAPS, MAX_ARMY, MAX_WALL_LEVEL, REBUILD_COST, REPAIR_COST, SLOT_WEIGHT, SQUAD_SIZE, TROOPS, UNIT_DEFS, UPGRADE_COST,
  canManWalls, isFixedType, levelHpMul, squadCost, squadSlots, unitPrice, wallLineAt,
  type Command, type Formation, type GameState, type PlayerId, type Result, type TroopType, type Unit, type Vec2,
} from '@burgwacht/shared';
import { castAbility } from './abilities';
import { castleOf, getUnit, spawnStructure, spawnUnit, structureOfSlot } from './state';

/** one slot per unit (same order as input). Short-ranged, tougher units take the front rows. */
export function formationSlots(units: Unit[], f: Formation, center: Vec2, facing: number): Vec2[] {
  const n = units.length;
  const spacing = Math.max(2.4, ...units.map(u => UNIT_DEFS[u.type].radius * 2.6));
  const rank = units.map((u, i) => ({ i, r: UNIT_DEFS[u.type].range - UNIT_DEFS[u.type].hp * 0.001 }))
    .sort((a, b) => a.r - b.r || a.i - b.i);
  const fx = Math.cos(facing), fy = Math.sin(facing), lx = -fy, ly = fx;
  const rows: number[] = []; // units per row, front first
  if (f === 'wedge') for (let left = n, r = 0; left > 0; r++) { const c = Math.min(2 * r + 1, left); rows.push(c); left -= c; }
  else {
    const per = f === 'line' ? Math.min(n, 12) : Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
    for (let left = n; left > 0; left -= per) rows.push(Math.min(per, left));
  }
  const out: Vec2[] = new Array(n);
  let k = 0;
  rows.forEach((count, row) => {
    for (let c = 0; c < count; c++, k++) {
      const lat = (c - (count - 1) / 2) * spacing;
      const back = -row * spacing;
      out[rank[k].i] = { x: center.x + fx * back + lx * lat, y: center.y + fy * back + ly * lat };
    }
  });
  return out;
}

const inZone = (s: GameState, x: number, y: number) => {
  const z = MAPS[s.mapId].placeZone;
  return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
};

/** army slots a player is using right now (a catapult takes three) */
export const armyUsed = (s: GameState, player: PlayerId) =>
  s.units.reduce((n, u) => n + (u.owner === player && u.hp > 0 && u.type in SLOT_WEIGHT ? SLOT_WEIGHT[u.type as TroopType] : 0), 0);

/**
 * Where the members of a group stand when put down around (x, y).
 * Marksmen next to a wall line line up on its crown; everybody else is kept off the wall, behind it.
 */
export function placementSlots(s: GameState, units: Unit[], x: number, y: number, facing = 0): Vec2[] {
  const map = MAPS[s.mapId], z = map.placeZone;
  const bar = wallLineAt(map, x);
  const clamp = (p: Vec2): Vec2 => ({ x: Math.min(z.x1, Math.max(z.x0, p.x)), y: Math.min(z.y1, Math.max(z.y0, p.y)) });
  if (bar >= 0 && units.every(u => u.type in TROOPS && canManWalls(u.type as TroopType))) {
    const bx = map.barriers[bar].x, n = units.length, step = Math.min(1.9, (z.y1 - z.y0) / Math.max(1, n));
    const y0 = Math.min(z.y1 - ((n - 1) * step) / 2, Math.max(z.y0 + ((n - 1) * step) / 2, y));
    return units.map((_, i) => ({ x: bx, y: y0 + (i - (n - 1) / 2) * step }));
  }
  const cx = bar >= 0 ? map.barriers[bar].x - 5.2 : x; // the rest stand behind the wall, not on it
  return formationSlots(units, 'block', { x: cx, y }, facing).map(p => {
    const b = wallLineAt(map, p.x, 4.2);
    return clamp(b >= 0 ? { x: map.barriers[b].x - 5.2, y: p.y } : p);
  });
}

const ownUnits = (s: GameState, player: PlayerId, ids: number[]): Unit[] | undefined => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 80) return undefined;
  const out: Unit[] = [];
  for (const id of new Set(ids)) {
    const u = getUnit(s, id);
    if (!u || u.owner !== player || isFixedType(u.type)) return undefined;
    out.push(u);
  }
  return out;
};

const finite = (...n: unknown[]) => n.every(v => typeof v === 'number' && Number.isFinite(v));

function facingTo(units: Unit[], x: number, y: number): number {
  const cx = units.reduce((a, u) => a + u.x, 0) / units.length;
  const cy = units.reduce((a, u) => a + u.y, 0) / units.length;
  return Math.hypot(x - cx, y - cy) < 1 ? 0 : Math.atan2(y - cy, x - cx);
}

export function applyCommand(s: GameState, player: PlayerId, c: Command): Result {
  const me = s.players[player];
  const fail = (reason: string): Result => ({ ok: false, reason });
  if (!c || typeof c !== 'object') return fail('bad_command');
  const prepOnly = s.phase === 'prep', battle = s.phase === 'battle';

  switch (c.c) {
    case 'ready':
      if (!prepOnly) return fail('not_prep');
      me.ready = !!c.ready;
      return { ok: true };

    case 'buy': {
      if (!prepOnly) return fail('not_prep');
      if (typeof c.troop !== 'string' || !Object.hasOwn(TROOPS, c.troop)) return fail('bad_command');
      if (!finite(c.x, c.y)) return fail('bad_command');
      const cost = squadCost(c.troop);
      if (cost > me.gold) return fail('not_enough_gold');
      if (armyUsed(s, player) + squadSlots(c.troop) > MAX_ARMY) return fail('army_full');
      if (!inZone(s, c.x, c.y)) return fail('outside_zone');
      me.gold -= cost;
      const members: Unit[] = [];
      for (let i = 0; i < SQUAD_SIZE[c.troop]; i++) members.push(spawnUnit(s, 'player', player, c.troop, c.x, c.y));
      const squad = members[0].id;
      const slots = placementSlots(s, members, c.x, c.y);
      members.forEach((u, i) => {
        u.squad = squad; u.x = u.postX = slots[i].x; u.y = u.postY = slots[i].y; u.order = { kind: 'idle', x: u.x, y: u.y };
      });
      s.squads.push({ id: squad, troop: c.troop, owner: player, x: c.x, y: c.y });
      return { ok: true };
    }

    case 'refill': {
      if (!prepOnly) return fail('not_prep');
      const sq = s.squads.find(q => q.id === c.squad && q.owner === player);
      if (!sq) return fail('bad_command');
      const alive = s.units.filter(u => u.squad === sq.id && u.hp > 0);
      const missing = SQUAD_SIZE[sq.troop] - alive.length;
      if (missing <= 0) return fail('squad_full');
      if (unitPrice(sq.troop) * missing > me.gold) return fail('not_enough_gold');
      if (armyUsed(s, player) + missing * SLOT_WEIGHT[sq.troop] > MAX_ARMY) return fail('army_full');
      me.gold -= unitPrice(sq.troop) * missing;
      const fresh: Unit[] = [];
      for (let i = 0; i < missing; i++) fresh.push(spawnUnit(s, 'player', player, sq.troop, sq.x, sq.y));
      const all = [...alive, ...fresh];
      const slots = placementSlots(s, all, sq.x, sq.y);
      all.forEach((u, i) => { if (fresh.includes(u)) { u.squad = sq.id; u.x = u.postX = slots[i].x; u.y = u.postY = slots[i].y; u.order = { kind: 'idle', x: u.x, y: u.y }; } });
      return { ok: true };
    }

    case 'wall': {
      if (c.op !== 'upgrade' && c.op !== 'repair' && c.op !== 'rebuild') return fail('bad_command');
      const map = MAPS[s.mapId];
      if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= map.walls.length) return fail('bad_command');
      const st = structureOfSlot(s, c.slot), kind = map.walls[c.slot].kind;
      if (c.op === 'rebuild') {
        if (!prepOnly) return fail('not_prep');
        if (st) return fail('bad_command');
        if (REBUILD_COST[kind] > me.gold) return fail('not_enough_gold');
        me.gold -= REBUILD_COST[kind];
        spawnStructure(s, c.slot);
        return { ok: true };
      }
      if (!st || !(prepOnly || battle)) return fail('bad_command');
      if (c.op === 'upgrade') {
        if (st.level >= MAX_WALL_LEVEL) return fail('max_level');
        const cost = UPGRADE_COST[kind][st.level - 1];
        if (cost > me.gold) return fail('not_enough_gold');
        me.gold -= cost;
        const old = st.maxHp;
        st.level++; st.maxHp = UNIT_DEFS[st.type].hp * levelHpMul(st.level); st.hp += st.maxHp - old;
        return { ok: true };
      }
      if (st.hp >= st.maxHp - 0.5) return fail('bad_command');
      const cost = Math.max(20, Math.round((REPAIR_COST[kind] * (1 - st.hp / st.maxHp)) / 5) * 5);
      if (cost > me.gold) return fail('not_enough_gold');
      me.gold -= cost; st.hp = st.maxHp;
      return { ok: true };
    }

    case 'place': {
      if (!prepOnly) return fail('not_prep');
      const us = ownUnits(s, player, c.ids);
      if (!us || !finite(c.x, c.y)) return fail('bad_command');
      if (!inZone(s, c.x, c.y)) return fail('outside_zone');
      const slots = placementSlots(s, us, c.x, c.y);
      us.forEach((u, i) => {
        u.x = slots[i].x; u.y = slots[i].y;
        u.postX = u.x; u.postY = u.y; u.order = { kind: 'idle', x: u.x, y: u.y };
      });
      const moved = new Set(us.map(u => u.squad));
      for (const q of s.squads) if (moved.has(q.id)) { q.x = c.x; q.y = c.y; }
      return { ok: true };
    }

    case 'move':
    case 'attack': {
      if (!battle) return fail('not_battle');
      const us = ownUnits(s, player, c.ids);
      if (!us || !finite(c.x, c.y)) return fail('bad_command');
      const map = MAPS[s.mapId];
      const x = Math.min(map.width - 1, Math.max(1, c.x)), y = Math.min(map.depth - 1, Math.max(1, c.y));
      const form: Formation = c.formation === 'line' || c.formation === 'wedge' ? c.formation : 'block';
      const slots = formationSlots(us, form, { x, y }, facingTo(us, x, y));
      const focus = c.c === 'attack' ? getUnit(s, c.targetId) : undefined;
      us.forEach((u, i) => {
        const p = { x: Math.min(map.width - 1, Math.max(1, slots[i].x)), y: Math.min(map.depth - 1, Math.max(1, slots[i].y)) };
        u.order = { kind: c.c === 'move' ? 'move' : 'attackMove', x: p.x, y: p.y,
          targetId: focus && focus.side === 'enemy' ? focus.id : undefined };
        u.postX = p.x; u.postY = p.y; u.targetId = null; u.formation = form;
      });
      return { ok: true };
    }

    case 'hold': {
      if (!battle) return fail('not_battle');
      const us = ownUnits(s, player, c.ids);
      if (!us) return fail('bad_command');
      for (const u of us) { u.order = { kind: 'hold', x: u.x, y: u.y }; u.postX = u.x; u.postY = u.y; }
      return { ok: true };
    }

    case 'retreat': {
      if (!battle) return fail('not_battle');
      const us = ownUnits(s, player, c.ids);
      if (!us) return fail('bad_command');
      const castle = castleOf(s)!;
      const slots = formationSlots(us, 'block', { x: castle.x + 11, y: castle.y }, 0);
      us.forEach((u, i) => { u.order = { kind: 'retreat', x: slots[i].x, y: slots[i].y }; u.targetId = null; });
      return { ok: true };
    }

    case 'ability':
      if (!battle) return fail('not_battle');
      if (!finite(c.x, c.y) || (c.id !== 'arrowRain' && c.id !== 'rally')) return fail('bad_command');
      return castAbility(s, player, c.id, c.x, c.y) ? { ok: true } : fail('cooldown');
  }
  return fail('bad_command');
}
