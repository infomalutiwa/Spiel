import { CELL, STRUCTURES, type GameState, type Shell, type Structure, type Unit } from '@talwacht/shared';
import { armorOf, damage, fireShell, landHooks } from './combat';
import { nearby } from './units';
import { topOf, wallNormal } from './squads';
import { igniteNear } from './traps';

const near: Unit[] = [];
const live = (u: Unit) => u.side === 'e' && u.hp > 0;

function rangeMult(s: GameState, st: Structure) {
  let m = s.talents.includes('range') ? 1.05 : 1;
  if (s.night > 0.5) {
    const lit = s.structs.some(w => w.kind === 'watchtower' && w.build === 0 && Math.hypot(w.cx - st.cx, w.cy - st.cy) * CELL < 60);
    if (!lit) m *= 0.75;
  }
  return m;
}

function inFormation(s: GameState, u: Unit) {
  if (!u.formation) return false;
  const f = s.formations.find(x => x.id === u.formation);
  return !!f && f.broken <= 0;
}

export function towerTick(s: GameState, dt: number) {
  for (const st of s.structs) {
    if (st.build > 0 || st.hp <= 0) continue;
    if (st.pitch) pitchTick(s, st, dt);
    const spec = STRUCTURES[st.kind].tower;
    if (!spec || st.kind === 'pitch') continue;
    st.cd -= dt;
    if (st.cd > 0) continue;
    const l = Math.min(st.level, spec.shooters.length) - 1;
    const ox = (st.cx + 0.5) * CELL, oy = (st.cy + 0.5) * CELL, oz = topOf(st) + 1.2;
    const range = spec.range[l] * rangeMult(s, st), minR = spec.minRange ?? 0;
    nearby(s, ox, oy, range, near);
    const cands = near.filter(u => live(u) && Math.hypot(u.x - ox, u.y - oy) >= minR);
    if (!cands.length) { st.cd = 0.2; continue; }
    const stagger = spec.cd[l] / spec.shooters[l];
    const burn = spec.burn?.[l] && spec.burn[l][0] ? spec.burn[l] : null;
    const common = { dmg: spec.dmg[l], dk: spec.kind, side: 'p' as const, owner: st.owner, fromStruct: st.id, stat: st.kind, pierce: spec.pierce ?? 0, ignoresShields: !!spec.ignoresShields, burn };
    const from = { x: ox, y: oy, z: oz };

    if (spec.prefers === 'cluster') {
      if (spec.stone && s.res.stone < spec.stone) { st.dry = 1; st.cd = 1; continue; }
      let best = cands[0], score = -1;
      for (const c of cands) {
        let n = 0;
        for (const o of cands) if (Math.hypot(o.x - c.x, o.y - c.y) < (spec.radius ?? 6)) n += o.formation ? 1.5 : 1;
        if (n > score) { score = n; best = c; }
      }
      const t = Math.hypot(best.x - ox, best.y - oy) / 32 + 0.6;
      if (spec.stone) s.res.stone -= spec.stone;
      st.dry = 0;
      fireShell(s, spec.burn?.[l]?.[0] ? 'pot' : 'stone', from, { x: best.x + best.vx * t, y: best.y + best.vy * t, z: 0 },
        { ...common, radius: spec.radius, edge: spec.edge, breakF: spec.breakFormation ?? 0 });
      st.cd = spec.cd[l];
      continue;
    }
    if (spec.prefers === 'line') {
      const max = spec.maxTargets?.[l] ?? 6;
      let bestLine: Unit[] = [], bestScore = 0, aim = cands[0];
      for (const c of cands.slice(0, 24)) {
        const dx = c.x - ox, dy = c.y - oy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const hit = cands.filter(o => {
          const along = (o.x - ox) * ux + (o.y - oy) * uy;
          if (along < 0 || along > range) return false;
          return Math.abs((o.x - ox) * uy - (o.y - oy) * ux) < 1.3;
        }).sort((a, b) => Math.hypot(a.x - ox, a.y - oy) - Math.hypot(b.x - ox, b.y - oy)).slice(0, max);
        const sc = hit.reduce((a, o) => a + (inFormation(s, o) ? 1.5 : 1), 0);
        if (sc > bestScore) { bestScore = sc; bestLine = hit; aim = c; }
      }
      fireShell(s, 'ballista', from, { x: aim.x, y: aim.y, z: 1 }, { ...common, line: bestLine.map(u => u.id) });
      st.cd = spec.cd[l];
      continue;
    }
    // single target shooters
    let best = cands[0], score = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c.x - ox, c.y - oy);
      const shielded = inFormation(s, c) ? 400 : 0;
      const sc = spec.prefers === 'armored' ? -armorOf(s, c) * 10 - (c.type === 'warlord' ? 100 : 0) + d * 0.1 + shielded : c.hp + d * 0.3 + shielded;
      if (sc < score) { score = sc; best = c; }
    }
    const flight = Math.hypot(best.x - ox, best.y - oy) / (spec.kind === 'bolt' ? 65 : 52);
    fireShell(s, spec.kind === 'bolt' ? 'bolt' : 'arrow', from, { x: best.x + best.vx * flight, y: best.y + best.vy * flight, z: best.z + 1 }, { ...common, target: best.id });
    st.cd = stagger;
  }
}

/** pitch nose mounted on a wall or gate: pours on everything in a box in front */
function pitchTick(s: GameState, st: Structure, dt: number) {
  st.pitchCd -= dt;
  if (st.pitchCd > 0) return;
  const spec = STRUCTURES.pitch.tower!, l = Math.min(st.pitch, 2) - 1;
  const { ax, ay, nx, ny } = wallNormal(s, st);
  const [w, d] = spec.box!;
  const cx = (st.cx + 0.5) * CELL + nx * (2 + d / 2), cy = (st.cy + 0.5) * CELL + ny * (2 + d / 2);
  nearby(s, cx, cy, Math.hypot(w, d) / 2 + 1, near);
  const inBox = near.filter(u => live(u) && u.z === 0 && Math.abs((u.x - cx) * ax + (u.y - cy) * ay) <= w / 2 && Math.abs((u.x - cx) * nx + (u.y - cy) * ny) <= d / 2);
  if (!inBox.length) { st.pitchCd = 0.25; return; }
  fireShell(s, 'pitch', { x: (st.cx + 0.5) * CELL, y: (st.cy + 0.5) * CELL, z: topOf(st) + 0.5 }, { x: cx, y: cy, z: 0 },
    { dmg: spec.dmg[l], dk: 'fire', side: 'p', owner: st.owner, fromStruct: st.id, stat: 'pitch', ignoresShields: true, burn: spec.burn![l], radius: 0, line: inBox.map(u => u.id) });
  st.pitchCd = spec.cd[l];
}

/** area / line resolution for tower shells (and trebuchet stones in siege.ts) */
function land(s: GameState, sh: Shell): boolean {
  if (sh.kind === 'ballista' || sh.kind === 'pitch') {
    for (const id of sh.line) {
      const u = s.units.find(x => x.id === id);
      if (!u || u.hp <= 0) continue;
      damage(s, u, sh.dmg, sh.dk, { x: sh.x, y: sh.y, ignoresShields: true, ranged: sh.kind === 'ballista', stat: sh.stat, pierce: 0.5 });
      if (sh.burn && !s.rain && u.hp > 0) { u.burn = Math.max(u.burn, sh.burn[1]); u.burnDps = Math.max(u.burnDps, sh.burn[0]); }
    }
    if (sh.kind === 'pitch') { s.events.push({ k: 'boom', x: sh.tx, y: sh.ty, r: 4, fire: true }); igniteNear(s, sh.tx, sh.ty, 5); }
    return true;
  }
  if ((sh.kind === 'stone' || sh.kind === 'pot') && sh.side === 'p') {
    const r = sh.radius || 6;
    nearby(s, sh.tx, sh.ty, r, near);
    const broken = new Set<number>();
    for (const u of near) {
      if (!live(u)) continue;
      const k = 1 - (1 - sh.edge) * (Math.hypot(u.x - sh.tx, u.y - sh.ty) / r);
      damage(s, u, sh.dmg * k, 'stone', { x: sh.x, y: sh.y, ignoresShields: true, stat: sh.stat });
      if (sh.burn && !s.rain && u.hp > 0) { u.burn = Math.max(u.burn, sh.burn[1]); u.burnDps = Math.max(u.burnDps, sh.burn[0]); }
      if (u.formation) broken.add(u.formation);
    }
    if (sh.breakF) for (const f of s.formations) if (broken.has(f.id)) f.broken = Math.max(f.broken, sh.breakF);
    s.events.push({ k: 'boom', x: sh.tx, y: sh.ty, r, fire: sh.kind === 'pot' });
    if (sh.burn) igniteNear(s, sh.tx, sh.ty, r);
    return true;
  }
  if (sh.burn || sh.kind === 'fire') igniteNear(s, sh.tx, sh.ty, 3);
  return false;
}
landHooks.push(land);
