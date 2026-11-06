import {
  CELL, DIRS, isWallish, SMITHY, STRUCTURES, TROOPS, WALL_TOP,
  type Command, type GameState, type OrderKind, type PlayerId, type Squad, type Structure, type TroopId, type Unit,
} from '@talwacht/shared';
import { handlers } from './commands';
import { structAtCell, structById, terrainOf } from './state';
import { armyCap, soldiers } from './economy';
import { pay, refund, log } from './res';
import { makeUnit, nearby, unitById } from './units';
import { CONTROLLED } from './movement';
import { damage, damageStruct } from './combat';
import type { Result } from './build';

const CLIMB = CONTROLLED + 1;
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

export const slotStruct = (key: number) => key >> 2;
const slotKey = (id: number, k: number) => id * 4 + k;

// ---------- squads ----------
export function spawnSquad(s: GameState, p: PlayerId, troop: TroopId, x: number, y: number): Squad {
  const d = TROOPS[troop];
  const q: Squad = { id: s.nextId++, owner: p, type: troop, order: { k: 'idle', x, y }, members: [], stars: 0, xp: 0 };
  for (let i = 0; i < d.squad; i++) {
    const pos = formationPos(q, i, d.squad, x, y);
    const u = makeUnit(s, troop, 'p', p, pos.x, pos.y);
    u.squad = q.id; u.gx = pos.x; u.gy = pos.y;
    q.members.push(u.id);
  }
  s.squads.push(q);
  return q;
}

/** block formation facing the enemy (towards −y), centred on (x, y) */
export function formationPos(q: Squad, i: number, n: number, x: number, y: number) {
  const sp = TROOPS[q.type].role === 'mounted' ? 2.8 : 1.9;
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.6)));
  const r = Math.floor(i / cols), c = i % cols, rows = Math.ceil(n / cols);
  return { x: x + (c - (cols - 1) / 2) * sp, y: y + (r - (rows - 1) / 2) * sp };
}

const membersOf = (s: GameState, q: Squad) => q.members.map(id => unitById(s, id)).filter((u): u is Unit => !!u);
const centroid = (us: Unit[]) => ({ x: us.reduce((a, u) => a + u.x, 0) / Math.max(1, us.length), y: us.reduce((a, u) => a + u.y, 0) / Math.max(1, us.length) });

// ---------- wall slots ----------
function wallDir(s: GameState, st: Structure) {
  for (const i of [2, 6, 0, 4, 1, 3, 5, 7]) {
    const n = structAtCell(s, st.cx + DIRS[i][0], st.cy + DIRS[i][1]);
    if (n && isWallish(n.kind) && n.kind !== 'keep') { const l = Math.hypot(DIRS[i][0], DIRS[i][1]); return { ax: DIRS[i][0] / l, ay: DIRS[i][1] / l }; }
  }
  return { ax: 1, ay: 0 };
}
/** outward normal (towards the enemy side) of a wall cell running along (ax, ay) */
function outward(s: GameState, st: Structure, ax: number, ay: number) {
  let nx = -ay, ny = ax;
  if (Math.abs(ny) > 0.01) { if (ny > 0) { nx = -nx; ny = -ny; } } // face the enemy (−y)
  else if (nx * ((st.cx + 0.5) * CELL - keepX(s)) < 0) nx = -nx; // side walls face away from the keep
  return { nx, ny };
}
const keepX = (s: GameState) => { const k = structById(s, s.keepId); return k ? (k.cx + k.w / 2) * CELL : 0; };

export const slotsOf = (st: Structure) => (isWallish(st.kind) && st.kind !== 'keep' ? 2 : 0);
export function topOf(st: Structure) {
  const base = WALL_TOP[Math.min(3, st.kind === 'wall' || st.kind === 'gate' ? st.level : 2) - 1];
  return STRUCTURES[st.kind].cat === 'tower' ? base + 2.2 : base;
}
export function slotPos(s: GameState, key: number) {
  const st = structById(s, slotStruct(key));
  if (!st) return null;
  const k = key & 3, { ax, ay } = wallDir(s, st), { nx, ny } = outward(s, st, ax, ay);
  const cx = (st.cx + 0.5) * CELL, cy = (st.cy + 0.5) * CELL, along = k === 0 ? -0.95 : 0.95, out = st.kind === 'wall' && st.level === 1 ? 0.2 : 0.7;
  return { x: cx + ax * along + nx * out, y: cy + ay * along + ny * out, z: topOf(st), fx: cx - nx * 3.2, fy: cy - ny * 3.2, face: Math.atan2(ny, nx) };
}

function takenSlots(s: GameState, except?: Set<number>) {
  const t = new Set<number>();
  for (const u of s.units) if (u.slot >= 0 && u.hp > 0 && !(except && except.has(u.id))) t.add(u.slot);
  return t;
}

/** BFS over the connected rampart from `start`, handing out free crenels nearest first */
export function assignWallSlots(s: GameState, us: Unit[], start: Structure): number {
  const mine = new Set(us.map(u => u.id));
  const taken = takenSlots(s, mine);
  const free: number[] = [];
  const seen = new Set<number>([start.id]);
  const queue = [start];
  while (queue.length && free.length < us.length) {
    const st = queue.shift()!;
    for (let k = 0; k < slotsOf(st); k++) { const key = slotKey(st.id, k); if (!taken.has(key)) free.push(key); }
    for (const [dx, dy] of DIRS) {
      const n = structAtCell(s, st.cx + dx, st.cy + dy);
      if (n && !seen.has(n.id) && isWallish(n.kind) && n.kind !== 'keep') { seen.add(n.id); queue.push(n); }
    }
  }
  // closest units take the closest crenels
  const sorted = [...us].sort((a, b) => (a.slot >= 0 ? -1 : 0) - (b.slot >= 0 ? -1 : 0));
  sorted.forEach((u, i) => { u.slot = i < free.length ? free[i] : -1; });
  return Math.min(us.length, free.length);
}

function climbDown(u: Unit) {
  if (u.z > 0) { u.mode = CLIMB; u.t = 0.8; u.gz = 0; }
  u.slot = -1;
}

// ---------- orders ----------
export function setOrder(s: GameState, q: Squad, k: OrderKind, x: number, y: number, extra: { target?: number; structure?: number } = {}) {
  q.order = { k, x, y, ...extra };
  const us = membersOf(s, q);
  if (k !== 'wall') for (const u of us) if (u.slot >= 0 || u.z > 0) climbDown(u);
  for (const u of us) u.target = 0;
  if (k === 'wall') {
    const st = structById(s, extra.structure ?? 0);
    if (st) assignWallSlots(s, us, st);
  }
  if (k === 'sortie') q.order.target = Math.round(s.time * 10); // sortie start (tenths of a second)
}

export function orderSquads(s: GameState, p: PlayerId, cmd: Extract<Command, { c: 'order' }>): Result {
  const qs = s.squads.filter(q => q.owner === p && cmd.squads.includes(q.id));
  if (!qs.length) return fail('no_squad');
  const st = cmd.structure ? structById(s, cmd.structure) : undefined;
  for (const q of qs) {
    const role = TROOPS[q.type].role, us = membersOf(s, q), c = centroid(us);
    if (cmd.stance === 'hold') { setOrder(s, q, 'hold', c.x, c.y); continue; }
    if (cmd.stance === 'retreat') { const k = structById(s, s.keepId)!; setOrder(s, q, 'retreat', (k.cx + 2) * CELL, (k.cy - 3) * CELL); continue; }
    if (cmd.stance === 'attack') { setOrder(s, q, 'attack', c.x, c.y); continue; }
    if (cmd.stance === 'wall') {
      const wall = nearestRampart(s, c.x, c.y, 60);
      if (wall && role === 'ranged') setOrder(s, q, 'wall', c.x, c.y, { structure: wall.id });
      continue;
    }
    if (st && st.kind !== 'keep') {
      const sx = (st.cx + st.w / 2) * CELL, sy = (st.cy + st.h / 2) * CELL;
      if (role === 'ranged' && isWallish(st.kind)) { setOrder(s, q, 'wall', sx, sy, { structure: st.id }); continue; }
      if (role === 'mounted' && st.kind === 'gate') { setOrder(s, q, 'sortie', sx, sy - 18, { structure: st.id }); continue; }
      if (role === 'melee' && st.kind === 'gate') { setOrder(s, q, 'gate', sx, sy + 5, { structure: st.id }); continue; }
      if ((role === 'melee' || role === 'mounted') && isWallish(st.kind)) { setOrder(s, q, 'breach', sx, sy + 4.5, { structure: st.id }); continue; }
      setOrder(s, q, 'move', sx, sy + (st.h * CELL) / 2 + 3, { structure: st.id });
      continue;
    }
    if (cmd.target && unitById(s, cmd.target)?.side === 'e') { setOrder(s, q, 'attack', cmd.x, cmd.y, { target: cmd.target }); continue; }
    setOrder(s, q, 'move', +cmd.x || c.x, +cmd.y || c.y);
  }
  return OK;
}

export function nearestRampart(s: GameState, x: number, y: number, r: number) {
  let best: Structure | undefined, bd = r;
  for (const st of s.structs) {
    if (!slotsOf(st) || st.build > 0) continue;
    const d = Math.hypot((st.cx + 0.5) * CELL - x, (st.cy + 0.5) * CELL - y);
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

// ---------- per tick ----------
const near: Unit[] = [];
export function squadTick(s: GameState, dt: number) {
  for (const q of s.squads) {
    const us = membersOf(s, q);
    if (!us.length) continue;
    const o = q.order;
    if (o.k === 'wall') wallTick(s, q, us, dt);
    if (o.k === 'sortie') sortieTick(s, q, us);
    if (o.k === 'attack' && !o.target) {
      const c = centroid(us);
      let best: Unit | undefined, bd = 90;
      for (const e of nearby(s, c.x, c.y, 90, near)) if (e.side === 'e' && e.z === 0) { const d = Math.hypot(e.x - c.x, e.y - c.y); if (d < bd) { bd = d; best = e; } }
      if (best) { o.x = best.x; o.y = best.y; }
    }
    us.forEach((u, i) => {
      if (u.mode === CLIMB) { // climbing up or down a ladder/stair
        u.t -= dt; u.anim = 1;
        if (u.t <= 0) {
          u.mode = 0;
          if (u.gz > 0 && u.slot >= 0) { const p = slotPos(s, u.slot); if (p) { u.x = p.x; u.y = p.y; u.z = p.z; u.facing = p.face; } }
          else { u.z = 0; u.x += (Math.random() - 0.5); }
        }
        return;
      }
      if (o.k === 'wall' && u.slot >= 0) return; // wallTick steers
      if (u.target && TROOPS[q.type].role !== 'ranged') return; // chasing (combat.ts)
      let gx = o.x, gy = o.y;
      if (o.k === 'gate' || o.k === 'breach') { const p = formationPos(q, i, us.length, o.x, o.y); gx = p.x; gy = p.y; }
      else if (o.k === 'attack' && o.target) { const t = unitById(s, o.target); if (t) { gx = t.x; gy = t.y; } else o.target = undefined; }
      else { const p = formationPos(q, i, us.length, o.x, o.y); gx = p.x; gy = p.y; }
      u.gx = gx; u.gy = gy;
    });
    supportTick(s, q, us, dt);
  }
}

function wallTick(s: GameState, q: Squad, us: Unit[], _dt: number) {
  let reassign = false;
  for (const u of us) {
    if (u.slot < 0) { reassign = true; continue; }
    const p = slotPos(s, u.slot);
    if (!p) { // the wall under them is gone
      if (u.z > 0) { u.z = 0; damage(s, u, u.maxHp * 0.1, 'stone', { stat: 'Sturz' }); }
      u.slot = -1; u.mode = 0; reassign = true; continue;
    }
    if (u.mode === CLIMB) continue;
    if (u.z > 0) { u.gx = p.x; u.gy = p.y; if (Math.abs(u.z - p.z) > 0.01) u.z = p.z; if (u.anim !== 2) u.facing = p.face; continue; }
    if (Math.hypot(u.x - p.fx, u.y - p.fy) < 1.2) { u.mode = CLIMB; u.t = 1; u.gz = p.z; }
    else { u.gx = p.fx; u.gy = p.fy; }
  }
  if (reassign && (s.tick % 20 === 0 || us.some(u => u.slot < 0 && u.z === 0 && u.mode === 0 && s.tick % 2 === 0))) {
    const st = structById(s, q.order.structure ?? 0) ?? nearestRampart(s, centroid(us).x, centroid(us).y, 40);
    if (!st) { setOrder(s, q, 'hold', centroid(us).x, centroid(us).y); return; }
    q.order.structure = st.id;
    const waiting = us.filter(u => u.slot < 0);
    assignWallSlots(s, waiting, st);
    for (const u of waiting) if (u.slot < 0) { u.gx = (st.cx + 0.5) * CELL; u.gy = (st.cy + 0.5) * CELL + 5; }
  }
}

function sortieTick(s: GameState, q: Squad, us: Unit[]) {
  const gate = structById(s, q.order.structure ?? 0);
  const started = (q.order.target ?? 0) / 10;
  const out = s.time - started;
  const anyOut = us.some(u => gate && u.y < (gate.cy + 0.5) * CELL);
  if (gate && gate.kind === 'gate') {
    const passing = us.some(u => Math.hypot(u.x - (gate.cx + 0.5) * CELL, u.y - (gate.cy + 0.5) * CELL) < 7);
    const want = passing ? 1 : 0;
    if (gate.state !== want) { gate.state = want; s.events.push({ k: 'gate', id: gate.id, open: !!want }); }
  }
  if (out > 25 && gate) { // ride back in and hold behind the gate
    q.order = { k: 'gate', x: (gate.cx + 0.5) * CELL, y: (gate.cy + 0.5) * CELL + 7, structure: gate.id };
    if (!anyOut && gate.state) { gate.state = 0; s.events.push({ k: 'gate', id: gate.id, open: false }); }
  }
}

function supportTick(s: GameState, q: Squad, us: Unit[], dt: number) {
  const d = TROOPS[q.type];
  if (d.heal) {
    for (const u of us) {
      if (u.cd > 0 || u.hp <= 0) continue;
      let best: Unit | undefined, frac = 0.98;
      for (const a of nearby(s, u.x, u.y, d.heal.radius, near)) if (a.side === 'p' && a.hp > 0 && a.hp / a.maxHp < frac) { frac = a.hp / a.maxHp; best = a; }
      if (best) {
        const amt = d.heal.amount * (s.talents.includes('medics') ? 1.2 : 1);
        best.hp = Math.min(best.maxHp, best.hp + amt);
        u.cd = d.cd; u.anim = 2; u.facing = Math.atan2(best.y - u.y, best.x - u.x);
        s.events.push({ k: 'heal', x: best.x, y: best.y });
      } else if (u.anim === 2) u.anim = 0;
    }
  }
  if (d.repair) {
    for (const u of us) {
      let work: Structure | undefined, wd = 7;
      for (const st of s.structs) {
        if (st.hp >= st.maxHp && st.burning <= 0 && !(STRUCTURES[st.kind].trap && st.state === 1)) continue;
        const dd = Math.hypot((st.cx + st.w / 2) * CELL - u.x, (st.cy + st.h / 2) * CELL - u.y) - st.w * 2;
        if (dd < wd) { wd = dd; work = st; }
      }
      if (!work) { if (u.anim === 2) u.anim = 0; continue; }
      u.anim = 2; u.facing = Math.atan2((work.cy + 0.5) * CELL - u.y, (work.cx + 0.5) * CELL - u.x);
      if (work.burning > 0) work.burning = Math.max(0, work.burning - dt * 7);
      else if (work.hp < work.maxHp) work.hp = Math.min(work.maxHp, work.hp + d.repair * dt);
      else if (STRUCTURES[work.kind].trap && work.state === 1) { work.state = 0; work.uses = STRUCTURES[work.kind].trap!.uses ?? 0; }
    }
  }
}

// ---------- training & research ----------
const queued = (s: GameState, p: PlayerId) => s.structs.reduce((n, st) => n + st.queue.filter(j => j.owner === p).reduce((m, j) => m + TROOPS[j.troop].squad, 0), 0);

function train(s: GameState, p: PlayerId, cmd: Extract<Command, { c: 'train' }>): Result {
  const b = structById(s, cmd.building), d = TROOPS[cmd.troop];
  if (!b || !d) return fail('not_found');
  if (b.build > 0) return fail('not_ready');
  if (!STRUCTURES[b.kind].trains?.includes(cmd.troop)) return fail('bad_troop');
  if (d.unlock && !s.unlocks.includes(d.unlock)) return fail('locked');
  if (b.level < d.needs) return fail('needs_level');
  if (b.queue.length >= 5) return fail('queue_full');
  if (soldiers(s, p) + queued(s, p) + d.squad > armyCap(s, p)) return fail('army_full');
  if (!pay(s, d.cost, p, `${d.icon} ${d.name} ausgebildet`)) return fail('no_resources');
  const time = d.train / (s.talents.includes('training') ? 1.1 : 1);
  b.queue.push({ troop: cmd.troop, owner: p, left: time, total: time });
  return OK;
}

export function trainTick(s: GameState, dt: number) {
  for (const b of s.structs) {
    if (b.queue.length && b.build === 0) {
      const j = b.queue[0];
      j.left -= dt;
      if (j.left <= 0) {
        b.queue.shift();
        const x = (b.cx + b.w / 2) * CELL, y = (b.cy + b.h) * CELL + 3;
        const q = spawnSquad(s, j.owner, j.troop, x, y);
        const r = b.rally ?? { x, y: y + 4 };
        setOrder(s, q, 'move', r.x, r.y);
        s.events.push({ k: 'toast', text: `${TROOPS[j.troop].icon} ${TROOPS[j.troop].name} sind bereit` });
      }
    }
    if (b.research && b.build === 0) {
      b.research.left -= dt;
      if (b.research.left <= 0) {
        s.research.push(b.research.id);
        s.events.push({ k: 'toast', text: `${SMITHY[b.research.id].icon} ${SMITHY[b.research.id].name} erforscht` });
        b.research = null;
      }
    }
  }
}

handlers.train = (s, p, cmd) => train(s, p, cmd as Extract<Command, { c: 'train' }>);
handlers.order = (s, p, cmd) => orderSquads(s, p, cmd as Extract<Command, { c: 'order' }>);
handlers.cancel = (s, p, cmd) => {
  const b = structById(s, (cmd as { building: number }).building);
  if (!b) return fail('not_found');
  const i = b.queue.map(j => j.owner).lastIndexOf(p);
  if (i < 0) return fail('nothing_queued');
  const [j] = b.queue.splice(i, 1);
  refund(s, TROOPS[j.troop].cost);
  return OK;
};
handlers.rally = (s, _p, cmd) => {
  const c = cmd as Extract<Command, { c: 'rally' }>, b = structById(s, c.building);
  if (!b) return fail('not_found');
  b.rally = { x: +c.x, y: +c.y };
  return OK;
};
handlers.research = (s, p, cmd) => {
  const c = cmd as Extract<Command, { c: 'research' }>, b = structById(s, c.building), r = SMITHY[c.what];
  if (!b || b.kind !== 'smithy' || !r) return fail('not_found');
  if (b.build > 0) return fail('not_ready');
  if (b.research || s.research.includes(c.what)) return fail('busy');
  if (!pay(s, r.cost, p, `${r.icon} ${r.name}`)) return fail('no_resources');
  b.research = { id: c.what, left: r.time, total: r.time };
  return OK;
};
handlers.disband = (s, p, cmd) => {
  const q = s.squads.find(x => x.id === (cmd as { squad: number }).squad && x.owner === p);
  if (!q) return fail('not_found');
  for (const u of membersOf(s, q)) { u.hp = 0; u.dead = 0.01; }
  log(s, p, `${TROOPS[q.type].icon} Trupp entlassen`);
  return OK;
};

export { terrainOf, damageStruct };
