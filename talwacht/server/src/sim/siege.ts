import { CELL, STRUCT_TARGET, STRUCTURES, type Formation, type GameState, type Shell, type Structure, type Unit } from '@talwacht/shared';
import { damage, damageStruct, destroyStruct, fireShell, hooks, kill, landHooks } from './combat';
import { CONTROLLED, distToStruct, spawnEnemy, speedOf } from './movement';
import { structAtCell, structById } from './state';
import { nearby, unitById } from './units';
import { topOf, wallNormal } from './squads';
import { removeStructure } from './build';

export const M = { PLANT: CONTROLLED + 10, CLIMB: CONTROLLED + 11, DOCK: CONTROLLED + 20, DIG: CONTROLLED + 30, DEPLOY: CONTROLLED + 40, WORK: CONTROLLED + 50 };
const near: Unit[] = [];
const RAMPART = new Set(['wall', 'gate', 'tower_bow', 'tower_xbow', 'ballista', 'tower_catapult']);

// ---------- testudo ----------
export function spawnTestudo(s: GameState, x: number, y: number, lane: number, n: number, group: number): Formation {
  const ram = spawnEnemy(s, 'ram', x, y, lane, group);
  const f: Formation = { id: s.nextId++, members: [], ram: ram.id, broken: 0, size0: n, facing: Math.PI / 2 };
  for (let i = 0; i < n; i++) {
    const p = slotOf(f, i, n, ram);
    const u = spawnEnemy(s, 'e_shield', p.x, p.y, lane, group);
    u.formation = f.id; u.facing = f.facing;
    f.members.push(u.id);
  }
  s.formations.push(f);
  return f;
}
const LAT = [-2.5, -1.25, 1.25, 2.5];
function slotOf(f: Formation, i: number, n: number, ram: { x: number; y: number }) {
  const rows = Math.ceil(n / 4), r = Math.floor(i / 4), c = i % 4;
  const along = ((rows - 1) / 2 - r) * 1.35, lat = LAT[c];
  const fx = Math.cos(f.facing), fy = Math.sin(f.facing);
  return { x: ram.x + fx * along - fy * lat, y: ram.y + fy * along + fx * lat };
}
export const intact = (s: GameState, f: Formation) => f.broken <= 0 && !!unitById(s, f.ram) && f.members.length >= f.size0 * 0.6;
const hash01 = (n: number) => { const v = Math.sin(n * 57.3 + 7.7) * 43758.5453; return v - Math.floor(v); };

function formationTick(s: GameState, dt: number) {
  for (let i = s.formations.length - 1; i >= 0; i--) {
    const f = s.formations[i];
    const ram = unitById(s, f.ram);
    const alive = f.members.map(id => unitById(s, id)).filter((u): u is Unit => !!u);
    f.members = alive.map(u => u.id);
    if (!ram || alive.length < f.size0 * 0.6) { // the formation dissolves into ordinary soldiers
      for (const u of alive) u.formation = 0;
      s.formations.splice(i, 1);
      continue;
    }
    if (Math.hypot(ram.vx, ram.vy) > 0.2) f.facing = Math.atan2(ram.vy, ram.vx);
    if (f.broken > 0) f.broken -= dt;
    alive.forEach((u, k) => {
      if (u.stun > 0) return;
      const p = slotOf(f, k, alive.length, ram);
      let gx = p.x, gy = p.y;
      if (f.broken > 0) { gx += (hash01(u.id) - 0.5) * 5; gy += (hash01(u.id + 9) - 0.5) * 5; }
      const dx = gx - u.x, dy = gy - u.y, d = Math.hypot(dx, dy), v = speedOf(s, u) * 1.6 * dt;
      if (d > 0.02) { const st = Math.min(d, v); u.x += (dx / d) * st; u.y += (dy / d) * st; }
      u.vx = ram.vx; u.vy = ram.vy;
      if (u.anim !== 2) { u.facing = f.facing; u.anim = Math.hypot(ram.vx, ram.vy) > 0.2 ? 1 : 0; }
    });
  }
}

/** shields: arrows barely hurt an intact testudo; flanks are weak to melee; fire roasts siege towers */
hooks.shield = (s, t, o) => {
  if (t.type === 'siege_tower' && o.kind === 'fire') return 2;
  let f: Formation | undefined;
  if (t.formation) f = s.formations.find(x => x.id === t.formation);
  else if (t.type === 'ram') f = s.formations.find(x => x.ram === t.id);
  if (!f || !intact(s, f)) return 1;
  if (o.ranged) return 0.15;
  if (o.attacker && o.attacker.side === 'p') {
    const a = Math.atan2(o.attacker.y - t.y, o.attacker.x - t.x);
    let d = Math.abs(a - f.facing) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
    if (d > Math.PI / 3 && d < Math.PI * 2 / 3) return o.attacker.type === 'halberdier' ? 2 : 1.6;
  }
  return 1;
};

// ---------- ladders, siege towers, miners, pioneers, trebuchets ----------
function wallUnder(s: GameState, u: Unit) { return structAtCell(s, Math.floor(u.x / CELL), Math.floor(u.y / CELL)); }

function onWallTick(s: GameState, u: Unit, dt: number) {
  const st = wallUnder(s, u);
  if (!st || !RAMPART.has(st.kind)) { u.z = 0; u.mode = 0; return; } // the wall fell away
  u.z = topOf(st);
  if (u.anim === 2) return;
  let foe: Unit | undefined, fd = 14;
  for (const o of nearby(s, u.x, u.y, 14, near)) if (o.side === 'p' && o.hp > 0 && Math.abs(o.z - u.z) < 1.2) { const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < fd) { fd = d; foe = o; } }
  if (foe) {
    const v = speedOf(s, u) * 0.8 * dt, dx = foe.x - u.x, dy = foe.y - u.y, d = Math.hypot(dx, dy) || 1;
    u.x += (dx / d) * Math.min(v, d); u.y += (dy / d) * Math.min(v, d); u.facing = Math.atan2(dy, dx); u.anim = 1; u.t = 0;
    return;
  }
  u.t += dt; u.anim = 0;
  if (u.t > 3) { // nobody left up here: climb down on the inside
    const n = wallNormal(s, st);
    u.z = 0; u.x = (st.cx + 0.5) * CELL - n.nx * 3.5; u.y = (st.cy + 0.5) * CELL - n.ny * 3.5; u.t = 0; u.target = 0;
  }
}

function climbOnto(s: GameState, u: Unit, st: Structure) {
  const n = wallNormal(s, st);
  u.x = (st.cx + 0.5) * CELL + n.nx * 0.4 + (hash01(u.id) - 0.5) * 2.4 * n.ax;
  u.y = (st.cy + 0.5) * CELL + n.ny * 0.4 + (hash01(u.id) - 0.5) * 2.4 * n.ay;
  u.z = topOf(st); u.mode = 0; u.t = 0; u.target = 0; u.facing = Math.atan2(-n.ny, -n.nx);
}

const blockingTarget = (s: GameState, u: Unit) => (u.target >= STRUCT_TARGET ? structById(s, u.target - STRUCT_TARGET) : undefined);

export function siegeTick(s: GameState, dt: number) {
  formationTick(s, dt);
  for (const u of s.units) {
    if (u.side !== 'e' || u.hp <= 0 || u.stun > 0) continue;
    if (u.z > 0 && u.mode < CONTROLLED) { onWallTick(s, u, dt); continue; }
    switch (u.type) {
      case 'e_ladder': {
        const st = blockingTarget(s, u);
        if (u.mode === M.PLANT) {
          u.anim = 2; u.t -= dt;
          if (!st) { u.mode = 0; break; }
          if (u.t <= 0) { u.mode = M.CLIMB; u.t = 1.2; }
        } else if (u.mode === M.CLIMB) {
          u.t -= dt; u.anim = 1;
          if (!st) { u.mode = 0; break; }
          if (u.t <= 0) climbOnto(s, u, st);
        } else if (st && RAMPART.has(st.kind) && distToStruct(u.x, u.y, st) < 2.8) { u.mode = M.PLANT; u.t = 4; u.vx = u.vy = 0; }
        break;
      }
      case 'siege_tower': {
        const st = blockingTarget(s, u);
        if (u.mode === M.DOCK) {
          if (!st) { u.mode = 0; break; }
          u.t -= dt;
          if (u.charge > 0 && u.t <= 0) {
            const e = spawnEnemy(s, 'e_soldier', u.x, u.y, 0, u.group);
            climbOnto(s, e, st);
            u.charge--; u.t = 10 / 12;
          }
        } else if (st && RAMPART.has(st.kind) && distToStruct(u.x, u.y, st) < 3.6) {
          u.mode = M.DOCK; u.t = 1; u.charge = 12; u.vx = u.vy = 0;
          s.events.push({ k: 'toast', text: '🗼 Ein Belagerungsturm hat angedockt!', warn: true });
        }
        break;
      }
      case 'miner': {
        const st = blockingTarget(s, u);
        if (u.mode === M.DIG) {
          if (!st) { u.mode = 0; break; }
          u.anim = 2;
          for (const o of nearby(s, u.x, u.y, 10, near)) if (o.side === 'p' && o.type === 'engineer' && o.hp > 0) {
            kill(s, u, o); st.mined = Math.max(0, st.mined - 10);
            s.events.push({ k: 'toast', text: '🔨 Gegenmine: Mineur ausgeschaltet' });
            break;
          }
          if (u.hp <= 0) break;
          st.mined += dt;
          if (st.mined >= 25) { destroyStruct(s, st); s.events.push({ k: 'toast', text: '⛏️ Unterminiert – ein Mauerstück stürzt ein!', warn: true }); u.mode = 0; }
        } else if (st && RAMPART.has(st.kind) && u.t >= 0 && distToStruct(u.x, u.y, st) < 2.8) {
          const moat = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => structAtCell(s, st.cx + dx, st.cy + dy)?.kind === 'moat');
          if (moat) u.t = -1; else { u.mode = M.DIG; u.vx = u.vy = 0; }
        }
        break;
      }
      case 'pioneer': pioneerTick(s, u, dt); break;
      case 'trebuchet': trebuchetTick(s, u, dt); break;
    }
  }
}

function pioneerTick(s: GameState, u: Unit, dt: number) {
  let st = blockingTarget(s, u);
  if (u.mode !== M.WORK) {
    // look for an armed trap or moat ahead
    let best: Structure | undefined, bd = 30;
    for (const t of s.structs) {
      if (STRUCTURES[t.kind].cat !== 'trap' || t.build > 0) continue;
      const cy = (t.cy + 0.5) * CELL; if (cy < u.y - 4) continue;
      const d = Math.hypot((t.cx + 0.5) * CELL - u.x, cy - u.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) return;
    u.mode = M.WORK; u.target = STRUCT_TARGET + best.id; u.t = best.kind === 'moat' ? 6 : 4; st = best;
  }
  if (!st) { u.mode = 0; u.target = 0; return; }
  const tx = (st.cx + 0.5) * CELL, ty = (st.cy + 0.5) * CELL - 1.5, d = Math.hypot(tx - u.x, ty - u.y);
  if (d > 1) { const v = speedOf(s, u) * dt; u.x += ((tx - u.x) / d) * Math.min(v, d); u.y += ((ty - u.y) / d) * Math.min(v, d); u.anim = 1; u.facing = Math.atan2(ty - u.y, tx - u.x); return; }
  u.anim = 2; u.t -= dt;
  if (u.t <= 0) {
    if (st.kind === 'powder') { damage(s, u, 999, 'stone'); }
    removeStructure(s, st); s.events.push({ k: 'trap', id: st.id, x: tx, y: ty });
    u.mode = 0; u.target = 0;
  }
}

function trebuchetTick(s: GameState, u: Unit, dt: number) {
  const R = 110;
  if (u.mode !== M.DEPLOY) {
    const close = s.structs.some(st => STRUCTURES[st.kind].cat !== 'trap' && distToStruct(u.x, u.y, st) <= R);
    if (close) { u.mode = M.DEPLOY; u.vx = u.vy = 0; u.cd = 3; s.events.push({ k: 'toast', text: '🏹 Ein Trebuchet hat Stellung bezogen!', warn: true }); }
    return;
  }
  u.cd -= dt; u.anim = 0;
  if (u.cd > 0) return;
  let best: Structure | undefined, score = Infinity;
  for (const st of s.structs) {
    const cat = STRUCTURES[st.kind].cat;
    if (cat === 'trap') continue;
    const d = distToStruct(u.x, u.y, st);
    if (d > R) continue;
    const sc = d + (cat === 'tower' ? -60 : cat === 'wall' ? 0 : 30);
    if (sc < score) { score = sc; best = st; }
  }
  if (!best) { u.mode = 0; return; }
  u.cd = 8; u.anim = 2;
  fireShell(s, 'treb', { x: u.x, y: u.y, z: 6 }, { x: (best.cx + best.w / 2) * CELL, y: (best.cy + best.h / 2) * CELL, z: 2 }, { dmg: 120, dk: 'stone', side: 'e', radius: 3 });
}

function landTreb(s: GameState, sh: Shell): boolean {
  if (sh.kind !== 'treb') return false;
  for (const st of [...s.structs]) if (STRUCTURES[st.kind].cat !== 'trap' && distToStruct(sh.tx, sh.ty, st) <= sh.radius) damageStruct(s, st, sh.dmg, 'stone');
  for (const u of nearby(s, sh.tx, sh.ty, sh.radius + 1, near)) if (u.side === 'p') damage(s, u, sh.dmg * 0.5, 'stone');
  s.events.push({ k: 'boom', x: sh.tx, y: sh.ty, r: 4 });
  return true;
}
landHooks.push(landTreb);
