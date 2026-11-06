import { CELL, ENEMIES, STRUCTURES, type GameState, type Structure, type Unit } from '@talwacht/shared';
import { handlers } from './commands';
import { damage, kill } from './combat';
import { removeStructure, type Result } from './build';
import { nearby } from './units';
import { structById, terrainOf } from './state';
import { pay } from './res';

const near: Unit[] = [];
const fail = (reason: string): Result => ({ ok: false, reason });

export const trapSpent = (st: Structure) => { const t = STRUCTURES[st.kind].trap; return !!t && t.uses !== undefined && st.uses <= 0; };
export function resetTrap(st: Structure) { const t = STRUCTURES[st.kind].trap!; st.uses = t.uses ?? 0; st.state = 0; }

const isFoot = (u: Unit) => { const d = ENEMIES[u.type as keyof typeof ENEMIES]; return !!d && !d.mounted && d.role !== 'siege' && d.role !== 'boss'; };
const isMountedE = (u: Unit) => !!ENEMIES[u.type as keyof typeof ENEMIES]?.mounted;

function onCell(s: GameState, st: Structure, pad = 0) {
  const x0 = st.cx * CELL - pad, y0 = st.cy * CELL - pad, x1 = (st.cx + st.w) * CELL + pad, y1 = (st.cy + st.h) * CELL + pad;
  nearby(s, (x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2, near);
  return near.filter(u => u.side === 'e' && u.hp > 0 && u.z === 0 && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1);
}

/** fire landing nearby lights pitch ditches and powder kegs */
export function igniteNear(s: GameState, x: number, y: number, r: number) {
  if (s.rain) return;
  for (const st of [...s.structs]) {
    const d = Math.hypot((st.cx + 0.5) * CELL - x, (st.cy + 0.5) * CELL - y);
    if (d > r + 2.5) continue;
    if (st.kind === 'pitch_ditch' && st.build === 0 && !trapSpent(st) && st.state <= 0) st.state = STRUCTURES.pitch_ditch.trap!.cd ?? 6;
    if (st.kind === 'powder' && st.build === 0) explode(s, st);
  }
}

function explode(s: GameState, st: Structure) {
  const t = STRUCTURES.powder.trap!, x = (st.cx + 0.5) * CELL, y = (st.cy + 0.5) * CELL;
  removeStructure(s, st);
  nearby(s, x, y, t.radius!, near);
  const broken = new Set<number>();
  for (const u of [...near]) if (u.side === 'e' && u.hp > 0) {
    damage(s, u, t.dmg * (1 - 0.5 * Math.hypot(u.x - x, u.y - y) / t.radius!), 'stone', { ignoresShields: true, stat: 'powder' });
    if (u.formation) broken.add(u.formation);
  }
  for (const f of s.formations) if (broken.has(f.id)) f.broken = Math.max(f.broken, 6);
  s.events.push({ k: 'boom', x, y, r: t.radius!, fire: true });
  igniteNear(s, x, y, t.radius!);
}

export function trapTick(s: GameState, dt: number) {
  for (const st of [...s.structs]) {
    const t = STRUCTURES[st.kind].trap;
    if (!t || st.build > 0) continue;
    st.cd -= dt;
    const x = (st.cx + 0.5) * CELL, y = (st.cy + 0.5) * CELL;
    switch (st.kind) {
      case 'spikes': {
        if (trapSpent(st) || st.cd > 0) break;
        const us = onCell(s, st);
        if (!us.length) break;
        for (const u of us) { damage(s, u, t.dmg, 'pierce', { ignoresShields: true, stat: 'spikes' }); u.slow = Math.max(u.slow, t.slow!); u.slowT = t.slowDur!; }
        st.uses--; st.cd = 1.2;
        s.events.push({ k: 'trap', id: st.id, x, y });
        break;
      }
      case 'pitfall': {
        if (trapSpent(st)) break;
        for (const u of onCell(s, st)) {
          if (!isFoot(u) || st.uses <= 0) continue;
          kill(s, u); u.dead = 0.3; st.uses--;
          s.dmgBy.pitfall = (s.dmgBy.pitfall ?? 0) + u.maxHp;
          s.events.push({ k: 'trap', id: st.id, x, y });
        }
        if (st.uses <= 0) s.sRev++; // open pit looks different
        break;
      }
      case 'pitch_ditch': {
        const us = onCell(s, st, st.state > 0 ? 2 : 0);
        for (const u of us) { u.slow = Math.max(u.slow, t.slow!); u.slowT = 0.3; }
        if (st.state > 0) {
          st.state -= dt;
          for (const u of us) { u.burn = Math.max(u.burn, 3); u.burnDps = Math.max(u.burnDps, t.dmg); }
          if (s.rain) st.state = 0;
          if (st.state <= 0) { st.state = 0; st.uses = 0; s.sRev++; }
        }
        break;
      }
      case 'caltrops': {
        if (st.cd > 0) break;
        for (const u of onCell(s, st)) { u.slow = Math.max(u.slow, isMountedE(u) ? t.slow! : t.slowFoot!); u.slowT = t.slowDur!; damage(s, u, t.dmg, 'pierce', { ignoresShields: true, stat: 'caltrops' }); }
        st.cd = 1.5;
        break;
      }
      case 'stakes': {
        if (st.cd > 0) break;
        const riders = onCell(s, st, 1).filter(isMountedE);
        if (!riders.length) break;
        for (const u of riders) { damage(s, u, t.dmg, 'pierce', { ignoresShields: true, stat: 'stakes' }); u.stun = Math.max(u.stun, 0.8); }
        st.cd = t.cd ?? 2;
        break;
      }
      case 'powder': {
        if (onCell(s, st, 3).length) explode(s, st);
        break;
      }
      case 'moat': {
        for (const u of onCell(s, st)) { u.slow = Math.max(u.slow, t.slow!); u.slowT = 0.4; }
        break;
      }
    }
  }
}

function roll(s: GameState, st: Structure) {
  const t = STRUCTURES.log_trap.trap!, ter = terrainOf(s);
  const x = (st.cx + 0.5) * CELL, y = (st.cy + 0.5) * CELL;
  // downhill direction from the height field
  const gx = ter.height(x + 3, y) - ter.height(x - 3, y), gy = ter.height(x, y + 3) - ter.height(x, y - 3);
  const l = Math.hypot(gx, gy) || 1, ux = -gx / l, uy = -gy / l, len = t.line!;
  nearby(s, x + ux * len / 2, y + uy * len / 2, len / 2 + 3, near);
  for (const u of [...near]) {
    if (u.side !== 'e' || u.hp <= 0) continue;
    const along = (u.x - x) * ux + (u.y - y) * uy, side = Math.abs((u.x - x) * uy - (u.y - y) * ux);
    if (along < 0 || along > len || side > 2.6) continue;
    damage(s, u, t.dmg, 'stone', { ignoresShields: true, stat: 'log_trap' });
    u.stun = Math.max(u.stun, t.stun!);
  }
  s.shells.push({ id: -st.id, kind: 'log', side: 'p', owner: st.owner, x, y, z: 0.6, tx: x + ux * len, ty: y + uy * len, tz: 0.6, t: 1.6, total: 1.6,
    dmg: 0, dk: 'stone', radius: 0, edge: 1, burn: null, breakF: 0, pierce: 0, ignoresShields: true, target: 0, line: [], fromStruct: st.id, stat: 'log_trap' });
}

function slide(s: GameState, st: Structure) {
  const t = STRUCTURES.rockslide.trap!, x = (st.cx + 0.5) * CELL, y = (st.cy + 0.5) * CELL;
  nearby(s, x, y, t.radius!, near);
  const broken = new Set<number>();
  for (const u of [...near]) if (u.side === 'e' && u.hp > 0) {
    damage(s, u, t.dmg, 'stone', { ignoresShields: true, stat: 'rockslide' });
    u.stun = Math.max(u.stun, t.stun!);
    if (u.formation) broken.add(u.formation);
  }
  for (const f of s.formations) if (broken.has(f.id)) f.broken = Math.max(f.broken, 6);
  s.events.push({ k: 'boom', x, y, r: t.radius! });
}

handlers.trigger = (s, _p, cmd) => {
  const st = structById(s, (cmd as { id: number }).id);
  if (!st) return fail('not_found');
  const t = STRUCTURES[st.kind].trap;
  if (!t || t.trigger !== 'manual') return fail('not_trigger');
  if (st.build > 0) return fail('not_ready');
  if (trapSpent(st)) return fail('spent');
  if (st.cd > 0) return fail('cooldown');
  if (st.kind === 'pitch_ditch') { if (s.rain) return fail('rain'); st.state = t.cd ?? 6; }
  if (st.kind === 'log_trap') { roll(s, st); st.uses = 0; st.cd = t.cd ?? 20; s.sRev++; }
  if (st.kind === 'rockslide') { slide(s, st); st.cd = t.cd ?? 90; }
  s.events.push({ k: 'trap', id: st.id, x: (st.cx + 0.5) * CELL, y: (st.cy + 0.5) * CELL });
  return { ok: true };
};
handlers.reset = (s, p, cmd) => {
  const st = structById(s, (cmd as { id: number }).id);
  if (!st) return fail('not_found');
  const t = STRUCTURES[st.kind].trap;
  if (!t?.reset || !trapSpent(st)) return fail('not_spent');
  if (!pay(s, t.reset, p, `${STRUCTURES[st.kind].icon} ${STRUCTURES[st.kind].name} neu gesetzt`)) return fail('no_resources');
  resetTrap(st); s.sRev++;
  return { ok: true };
};
