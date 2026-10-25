import {
  MAPS, TROOPS, UNIT_DEFS, type Command, type Formation, type GameState, type PlayerId,
  type Result, type Unit, type Vec2,
} from '@burgwacht/shared';
import { castAbility } from './abilities';
import { castleOf, getUnit, spawnUnit } from './state';

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

const ownUnits = (s: GameState, player: PlayerId, ids: number[]): Unit[] | undefined => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) return undefined;
  const out: Unit[] = [];
  for (const id of new Set(ids)) {
    const u = getUnit(s, id);
    if (!u || u.owner !== player || u.type === 'castle') return undefined;
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
      const def = TROOPS[c.troop];
      if (!finite(c.x, c.y)) return fail('bad_command');
      if (def.cost > me.gold) return fail('not_enough_gold');
      if (!inZone(s, c.x, c.y)) return fail('outside_zone');
      me.gold -= def.cost;
      spawnUnit(s, 'player', player, c.troop, c.x, c.y);
      return { ok: true };
    }

    case 'place': {
      if (!prepOnly) return fail('not_prep');
      const us = ownUnits(s, player, c.ids);
      if (!us || !finite(c.x, c.y)) return fail('bad_command');
      if (!inZone(s, c.x, c.y)) return fail('outside_zone');
      const slots = formationSlots(us, 'block', { x: c.x, y: c.y }, 0);
      us.forEach((u, i) => {
        const z = MAPS[s.mapId].placeZone;
        u.x = Math.min(z.x1, Math.max(z.x0, slots[i].x));
        u.y = Math.min(z.y1, Math.max(z.y0, slots[i].y));
        u.postX = u.x; u.postY = u.y; u.order = { kind: 'idle', x: u.x, y: u.y };
      });
      return { ok: true };
    }

    case 'move':
    case 'attack': {
      if (!battle) return fail('not_battle');
      const us = ownUnits(s, player, c.ids);
      if (!us || !finite(c.x, c.y)) return fail('bad_command');
      const map = MAPS[s.mapId];
      const x = Math.min(map.width - 1, Math.max(1, c.x)), y = Math.min(map.depth - 1, Math.max(1, c.y));
      const slots = formationSlots(us, c.formation === 'line' || c.formation === 'wedge' ? c.formation : 'block', { x, y }, facingTo(us, x, y));
      const focus = c.c === 'attack' ? getUnit(s, c.targetId) : undefined;
      us.forEach((u, i) => {
        const p = { x: Math.min(map.width - 1, Math.max(1, slots[i].x)), y: Math.min(map.depth - 1, Math.max(1, slots[i].y)) };
        u.order = { kind: c.c === 'move' ? 'move' : 'attackMove', x: p.x, y: p.y,
          targetId: focus && focus.side === 'enemy' ? focus.id : undefined };
        u.postX = p.x; u.postY = p.y; u.targetId = null;
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
