import {
  CELL, centre, isWallish, K, polyDist, STRUCTURES, MAPS,
  type GameState, type PlayerId, type StructId, type Structure,
} from '@talwacht/shared';
import { newStructure, occOf, structAtCell, structById, terrainOf } from './state';
import { add, pay, refund, scale } from './res';

export type Result = { ok: true } | { ok: false; reason: string };
const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

const trapDiscount = (s: GameState, kind: StructId) => (STRUCTURES[kind].cat === 'trap' && s.talents.includes('traps') ? 0.85 : 1);

function countNear(s: GameState, cx: number, cy: number, w: number, h: number, r: number, kind: number) {
  const t = terrainOf(s);
  let n = 0;
  for (let y = cy - r; y < cy + h + r; y++) for (let x = cx - r; x < cx + w + r; x++) {
    if (x < 0 || y < 0 || x >= t.cw || y >= t.ch) continue;
    if (t.kind[y * t.cw + x] === kind) n++;
  }
  return n;
}
const cliffAdjacent = (s: GameState, cx: number, cy: number, w: number, h: number) => countNear(s, cx, cy, w, h, 1, K.cliff) > 0;

/** enemies standing on a cell block construction there */
function enemyOn(s: GameState, cx: number, cy: number) {
  return s.units.some(u => u.side === 'e' && Math.floor(u.x / CELL) === cx && Math.floor(u.y / CELL) === cy);
}

/** null when the footprint at (cx, cy) is fine for `kind` */
export function siteProblem(s: GameState, kind: StructId, cx: number, cy: number): string | null {
  const d = STRUCTURES[kind], t = terrainOf(s), occ = occOf(s);
  for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) {
    if (x < 0 || y < 0 || x >= t.cw || y >= t.ch) return 'outside';
    const i = y * t.cw + x;
    if (kind === 'moat' || kind === 'wall' || kind === 'gate') { if (t.kind[i] === K.cliff) return 'blocked'; } // ramparts may span the creek
    else if (!t.buildable(i)) return 'blocked';
    if (occ[i]) return 'occupied';
    if (enemyOn(s, x, y)) return 'enemy_near';
  }
  const eco = d.eco, trap = d.trap;
  if (eco?.near === 'forest' && countNear(s, cx, cy, d.w, d.h, 3, K.forest) < (eco.minNear ?? 1)) return 'needs_forest';
  if (eco?.near === 'rock' && countNear(s, cx, cy, d.w, d.h, 3, K.rock) < (eco.minNear ?? 1)) return 'needs_rocks';
  if (eco?.near === 'cliff' && !cliffAdjacent(s, cx, cy, d.w, d.h)) return 'needs_cliff';
  if (trap?.needs === 'cliff' && !cliffAdjacent(s, cx, cy, 1, 1)) return 'needs_cliff';
  if (trap?.needs === 'slope' && t.slope(cy * t.cw + cx) < 4) return 'needs_slope';
  if (trap?.needs === 'creek') {
    const m = MAPS[s.mapId], c = centre(cx, cy);
    if (!m.creek || polyDist(c.x, c.y, m.creek).d > 40) return 'needs_creek';
  }
  return null;
}

function isLocked(s: GameState, kind: StructId) {
  const u = STRUCTURES[kind].unlock;
  return !!u && !s.unlocks.includes(u);
}

export function build(s: GameState, p: PlayerId, kind: StructId, cells: [number, number][]): Result {
  const d = STRUCTURES[kind];
  if (!d || kind === 'keep') return fail('bad_kind');
  if (isLocked(s, kind)) return fail('locked');
  if (!Array.isArray(cells) || !cells.length || cells.length > 80) return fail('bad_cells');

  if (kind === 'pitch') {
    const host = structAtCell(s, cells[0][0], cells[0][1]);
    if (!host || (host.kind !== 'wall' && host.kind !== 'gate')) return fail('needs_wall');
    if (host.build > 0) return fail('not_ready');
    if (host.pitch) return fail('occupied');
    if (!pay(s, d.cost, p, `${d.icon} ${d.name}`)) return fail('no_resources');
    host.pitch = 1; host.paid = add(host.paid, d.cost); s.sRev++;
    return OK;
  }

  if (kind === 'wall') {
    const todo: [number, number][] = [];
    const seen = new Set<string>();
    for (const [cx, cy] of cells) {
      const key = `${cx},${cy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!siteProblem(s, kind, cx, cy)) todo.push([cx, cy]);
    }
    if (!todo.length) {
      const why = siteProblem(s, kind, cells[0][0], cells[0][1]);
      return fail(why ?? 'occupied');
    }
    const cost = scale(d.cost, todo.length);
    if (!pay(s, cost, p, `${d.icon} ${d.name} ×${todo.length}`)) return fail('no_resources');
    for (const [cx, cy] of todo) newStructure(s, kind, cx, cy, p);
    return OK;
  }

  const [cx, cy] = cells[0];
  // gates and wall-line towers may replace a wall cell
  const host = d.w === 1 && d.h === 1 ? structAtCell(s, cx, cy) : undefined;
  const replaces = host && host.kind === 'wall' && (kind === 'gate' || isWallish(kind)) ? host : undefined;
  if (host && !replaces) return fail('occupied');
  let why: string | null = null;
  if (replaces) {
    s.structs.splice(s.structs.indexOf(replaces), 1); s.sRev++;
    why = siteProblem(s, kind, cx, cy);
    if (why) { s.structs.push(replaces); s.sRev++; return fail(why); }
  } else why = siteProblem(s, kind, cx, cy);
  if (why) return fail(why);
  const cost = scale(d.cost, trapDiscount(s, kind));
  if (!pay(s, cost, p, `${d.icon} ${d.name}`)) {
    if (replaces) { s.structs.push(replaces); s.sRev++; }
    return fail('no_resources');
  }
  const st = newStructure(s, kind, cx, cy, p);
  st.paid = cost;
  if (replaces) st.paid = add(st.paid, scale(replaces.paid, 1));
  return OK;
}

export function upgrade(s: GameState, p: PlayerId, st: Structure): Result {
  const d = STRUCTURES[st.kind];
  if (st.build > 0) return fail('not_ready');
  if (st.level > d.up.length) {
    // pitch nose level 2 rides on the wall's own upgrade button once the wall is maxed
    if (st.pitch === 1) {
      const c = STRUCTURES.pitch.up[0];
      if (!pay(s, c, p, `${STRUCTURES.pitch.icon} Pechnase verbessert`)) return fail('no_resources');
      st.pitch = 2; st.paid = add(st.paid, c); s.sRev++;
      return OK;
    }
    return fail('max_level');
  }
  const c = d.up[st.level - 1];
  if (!pay(s, c, p, `${d.icon} ${d.name} → Stufe ${st.level + 1}`)) return fail('no_resources');
  const frac = st.hp / st.maxHp;
  st.level++;
  let hp = d.hp[st.level - 1];
  if ((st.kind === 'wall' || st.kind === 'gate') && s.talents.includes('walls')) hp *= 1.05;
  if (st.kind === 'keep' && s.talents.includes('keep')) hp *= 1.15;
  st.maxHp = hp; st.hp = Math.max(st.hp, hp * frac);
  st.build = Math.max(3, d.build * 0.6); st.buildTotal = st.build;
  st.paid = add(st.paid, c);
  s.sRev++;
  return OK;
}

export function repair(s: GameState, p: PlayerId, st: Structure): Result {
  const missing = st.maxHp - st.hp - st.fix;
  if (missing < 1) return fail('not_damaged');
  const d = STRUCTURES[st.kind];
  const base = d.cost.wood + d.cost.stone + d.cost.gold > 0 ? d.cost : { wood: 0, stone: 200, food: 0, gold: 100 };
  const c = scale(base, (0.3 * missing) / st.maxHp);
  const rounded = { wood: Math.ceil(c.wood), stone: Math.ceil(c.stone), food: 0, gold: Math.ceil(c.gold) };
  if (!pay(s, rounded, p, `🔧 ${d.name} repariert`)) return fail('no_resources');
  st.fix += missing;
  return OK;
}

export function sell(s: GameState, p: PlayerId, st: Structure): Result {
  if (st.kind === 'keep') return fail('cannot_sell');
  refund(s, scale(st.paid, 0.5));
  removeStructure(s, st);
  s.spent.push({ p, what: `↩️ ${STRUCTURES[st.kind].name} abgerissen`, t: Math.round(s.time) });
  return OK;
}

export function removeStructure(s: GameState, st: Structure) {
  const i = s.structs.indexOf(st);
  if (i >= 0) s.structs.splice(i, 1);
  s.sRev++;
  // defenders standing on it lose their footing (handled in squads.ts via slot lookup)
}

/** construction, repairs; called every tick */
export function buildTick(s: GameState, dt: number) {
  for (const st of s.structs) {
    if (st.build > 0) {
      const d = STRUCTURES[st.kind];
      const rate = st.maxHp * 0.85 / Math.max(1, st.buildTotal);
      st.build = Math.max(0, st.build - dt);
      if (st.level === 1) st.hp = Math.min(st.maxHp, st.hp + rate * dt);
      if (st.build === 0) { s.events.push({ k: 'built', id: st.id }); if (st.level === 1) st.hp = Math.max(st.hp, st.maxHp * (d.cat === 'trap' ? 1 : 1)); }
    }
    if (st.fix > 0) {
      const h = Math.min(st.fix, 25 * dt, st.maxHp - st.hp);
      st.hp += h; st.fix = h <= 0 ? 0 : st.fix - h;
    }
  }
}

export { structById };
