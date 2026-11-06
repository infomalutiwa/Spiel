import {
  ENEMIES, STRUCT_TARGET, STRUCTURES, TROOPS,
  type DmgKind, type GameState, type Shell, type ShellKind, type Side, type Structure, type Unit,
} from '@talwacht/shared';
import { structById } from './state';
import { removeStructure } from './build';
import { defOf, isTroop, nearby, unitById } from './units';
import { CONTROLLED, distToStruct } from './movement';

export interface HitOpts {
  attacker?: Unit; x?: number; y?: number; z?: number;
  ranged?: boolean; pierce?: number; ignoresShields?: boolean; stat?: string; side?: Side;
}
/** hooks other systems plug in (testudo shields from siege.ts) */
export const hooks = {
  shield: (_s: GameState, _t: Unit, _o: HitOpts): number => 1,
  onKill: (_s: GameState, _t: Unit) => {},
};

const ARMORED: DmgKind[] = ['slash', 'pierce', 'spear', 'bolt', 'charge'];
const RANGED: DmgKind[] = ['pierce', 'bolt'];

export const isMounted = (u: Unit) => (isTroop(u.type) ? TROOPS[u.type].role === 'mounted' : !!ENEMIES[u.type].mounted);
export const isHeavy = (u: Unit) => (isTroop(u.type) ? TROOPS[u.type].armor >= 6 : !!ENEMIES[u.type].heavy);
export const armorOf = (s: GameState, u: Unit) => defOf(u.type).armor + (u.side === 'p' && s.research.includes('armor') ? 2 : 0);
export const squadOf = (s: GameState, u: Unit) => (u.squad ? s.squads.find(q => q.id === u.squad) : undefined);
export const starMult = (s: GameState, u: Unit) => 1 + 0.08 * (squadOf(s, u)?.stars ?? 0);

/** is the source in front of the target (within 60° of where it faces)? */
function fromFront(t: Unit, x: number | undefined, y: number | undefined) {
  if (x === undefined || y === undefined) return false;
  const a = Math.atan2(y - t.y, x - t.x);
  let d = Math.abs(a - t.facing) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
  return d < Math.PI / 3;
}

export function damage(s: GameState, t: Unit, amount: number, kind: DmgKind, o: HitOpts = {}): number {
  if (t.hp <= 0) return 0;
  const a = o.attacker;
  let dmg = amount;
  if (a) {
    const ad = defOf(a.type) as { vsMounted?: number; vsHeavy?: number };
    if (ad.vsMounted && isMounted(t)) dmg *= ad.vsMounted;
    if (ad.vsHeavy && isHeavy(t)) dmg *= ad.vsHeavy;
    if (a.side === 'p') { dmg *= starMult(s, a); if (s.research.includes('weapons')) dmg *= 1.15; }
  }
  if (ARMORED.includes(kind)) {
    const pierce = o.pierce ?? (a ? (defOf(a.type) as { pierce?: number }).pierce ?? 0 : 0);
    dmg *= 10 / (10 + armorOf(s, t) * (1 - pierce));
  }
  const ranged = o.ranged ?? RANGED.includes(kind);
  const sx = o.x ?? a?.x, sy = o.y ?? a?.y;
  if (ranged) {
    if (t.z > 0) dmg *= 0.7;
    const td = defOf(t.type) as { frontBlock?: number; pavise?: number };
    if (td.frontBlock && fromFront(t, sx, sy)) dmg *= 1 - td.frontBlock;
    if (td.pavise && Math.hypot(t.vx, t.vy) < 0.2 && fromFront(t, sx, sy)) dmg *= 1 - td.pavise;
    if (t.side === 'p' && t.z === 0 && s.research.includes('pavise') && isTroop(t.type) && TROOPS[t.type].role === 'ranged') dmg *= 0.7;
  }
  if (!o.ignoresShields) dmg *= hooks.shield(s, t, { ...o, x: sx, y: sy, ranged });
  if (t.side === 'p' && s.hunger) dmg *= 1.1;
  dmg = Math.max(0, dmg);
  t.hp -= dmg;
  if (t.side === 'e') {
    const key = o.stat ?? a?.type ?? 'andere';
    s.dmgBy[key] = (s.dmgBy[key] ?? 0) + Math.min(dmg, dmg + t.hp);
    if (a?.squad) { const q = squadOf(s, a); if (q) addXp(q, dmg / 10); }
  }
  if (t.hp <= 0) kill(s, t, a);
  return dmg;
}

function addXp(q: { xp: number; stars: number }, xp: number) {
  q.xp += xp;
  q.stars = q.xp >= 300 ? 3 : q.xp >= 150 ? 2 : q.xp >= 60 ? 1 : 0;
}

export function kill(s: GameState, t: Unit, by?: Unit) {
  t.hp = 0; t.anim = 3; t.dead = 1.6; t.vx = t.vy = 0;
  s.events.push({ k: 'die', x: t.x, y: t.y, side: t.side });
  if (t.side === 'e') {
    s.kills++;
    s.res.gold += Math.round(ENEMIES[t.type as keyof typeof ENEMIES]?.budget * 0.4 || 0);
    if (by?.squad) { const q = squadOf(s, by); if (q) addXp(q, 5); }
  }
  hooks.onKill(s, t);
}

export function damageStruct(s: GameState, st: Structure, amount: number, kind: DmgKind, attacker?: Unit) {
  if (st.hp <= 0) return;
  let dmg = amount;
  const d = STRUCTURES[st.kind];
  if (kind === 'fire') {
    if (d.wooden[st.level - 1] && !s.rain) st.burning = Math.max(st.burning, 20);
    dmg *= 0.5;
  } else if (kind !== 'stone' && kind !== 'siege') dmg *= 0.25; // swords against stone do little
  if (attacker && (defOf(attacker.type) as { vsStructure?: number }).vsStructure) dmg *= 1;
  st.hp -= dmg;
  if (st.fix > 0) st.fix = Math.max(0, st.fix - dmg);
  if (st.hp <= 0) destroyStruct(s, st);
}

export function destroyStruct(s: GameState, st: Structure) {
  st.hp = 0;
  const x = (st.cx + st.w / 2) * 4, y = (st.cy + st.h / 2) * 4;
  s.events.push({ k: 'destroyed', id: st.id, x, y });
  if (st.kind === 'keep') return; // tick.ts ends the round
  removeStructure(s, st);
}

// ---------- projectiles ----------
let shellId = 1;
export function fireShell(s: GameState, kind: ShellKind, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number },
  p: Partial<Shell> & { dmg: number; dk: DmgKind; side: Side }): Shell {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const speed = kind === 'stone' || kind === 'pot' || kind === 'treb' ? 32 : kind === 'ballista' ? 75 : kind === 'bolt' ? 65 : 52;
  const total = Math.max(0.15, d / speed + (kind === 'stone' || kind === 'treb' || kind === 'pot' ? 0.6 : 0));
  const sh: Shell = {
    id: shellId++, kind, side: p.side, owner: p.owner ?? null, x: from.x, y: from.y, z: from.z, tx: to.x, ty: to.y, tz: to.z,
    t: total, total, dmg: p.dmg, dk: p.dk, radius: p.radius ?? 0, edge: p.edge ?? 1, burn: p.burn ?? null, breakF: p.breakF ?? 0,
    pierce: p.pierce ?? 0, ignoresShields: p.ignoresShields ?? false, target: p.target ?? 0, line: p.line ?? [], fromStruct: p.fromStruct ?? 0, stat: p.stat ?? '',
  };
  s.shells.push(sh);
  return sh;
}

/** called when a shell lands; area shells are resolved by towers.ts / siege.ts through this hook */
export const landHooks: ((s: GameState, sh: Shell) => boolean)[] = [];

export function shellTick(s: GameState, dt: number) {
  for (let i = s.shells.length - 1; i >= 0; i--) {
    const sh = s.shells[i];
    sh.t -= dt;
    if (sh.t > 0) continue;
    s.shells.splice(i, 1);
    if (landHooks.some(h => h(s, sh))) continue;
    if (sh.target >= STRUCT_TARGET) {
      const st = structById(s, sh.target - STRUCT_TARGET);
      if (st) damageStruct(s, st, sh.dmg, sh.dk);
      continue;
    }
    const t = unitById(s, sh.target);
    if (!t || Math.hypot(t.x - sh.tx, t.y - sh.ty) > 3) continue; // dodged
    damage(s, t, sh.dmg, sh.dk, { x: sh.x, y: sh.y, pierce: sh.pierce, ignoresShields: sh.ignoresShields, ranged: true, stat: sh.stat, side: sh.side,
      attacker: sh.fromStruct ? undefined : unitById(s, (sh as unknown as { by?: number }).by ?? -1) });
    if (sh.burn && t.hp > 0 && !s.rain) { t.burn = Math.max(t.burn, sh.burn[1]); t.burnDps = Math.max(t.burnDps, sh.burn[0]); }
  }
}

// ---------- unit fighting ----------
const near: Unit[] = [];
const RANGED_ROLES = new Set(['ranged']);

function isRanged(u: Unit) {
  if (isTroop(u.type)) return RANGED_ROLES.has(TROOPS[u.type].role);
  return ENEMIES[u.type].role === 'ranged';
}
export function rangeOf(u: Unit) { return defOf(u.type).range * (u.z > 0 ? 1.2 : 1); }
const edge = (a: Unit, b: Unit) => Math.hypot(a.x - b.x, a.y - b.y) - defOf(a.type).radius - defOf(b.type).radius;

/** pick a target among enemies in range by role */
function pick(s: GameState, u: Unit, r: number): Unit | undefined {
  nearby(s, u.x, u.y, r + 2, near);
  let best: Unit | undefined, score = Infinity;
  const crossbow = u.type === 'crossbowman', ranged = isRanged(u);
  for (const o of near) {
    if (o.side === u.side || o.hp <= 0 || o.dead) continue;
    if (!ranged && Math.abs(o.z - u.z) > 1) continue; // swords do not reach the wall walk
    const d = edge(u, o);
    if (d > r) continue;
    let sc = d;
    if (ranged) sc = crossbow ? -armorOf(s, o) * 10 + d * 0.1 : o.hp + d * 0.5;
    if (u.type === 'spearman' && isMounted(o)) sc -= 50;
    if (u.side === 'e' && o.z > 0 && !ranged) continue;
    if (sc < score) { score = sc; best = o; }
  }
  return best;
}

export function leash(o: string) { return o === 'hold' || o === 'wall' || o === 'gate' || o === 'breach' || o === 'tower' ? 1.5 : o === 'sortie' ? 25 : 9; }

export function combatTick(s: GameState, dt: number) {
  // fire on structures
  for (const st of s.structs) if (st.burning > 0) {
    if (s.rain) { st.burning = 0; continue; }
    const well = s.structs.some(w => w.kind === 'well' && w.build === 0 && Math.abs(w.cx - st.cx) <= 8 && Math.abs(w.cy - st.cy) <= 8);
    st.burning -= dt * (well ? 2 : 1);
    damageStruct(s, st, 6 * dt, 'siege'); // 6 hp/s
  }
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    if (u.burn > 0) { u.burn -= dt; damage(s, u, u.burnDps * dt, 'fire', { stat: 'Feuer' }); if (u.hp <= 0) continue; }
    u.cd -= dt;
    if (u.stun > 0 || u.mode >= CONTROLLED) continue;
    const d = defOf(u.type);
    if (u.side === 'e' && (u.type === 'trebuchet' || u.type === 'siege_tower')) continue; // siege.ts
    if (isTroop(u.type) && (TROOPS[u.type].role === 'support')) continue; // squads.ts heals / repairs
    const q = u.side === 'p' ? squadOf(s, u) : undefined;
    const r = rangeOf(u);
    // keep the current unit target if still valid
    let tu = u.target && u.target < STRUCT_TARGET ? unitById(s, u.target) : undefined;
    if (tu && (tu.hp <= 0 || edge(u, tu) > r + (q ? leash(q.order.k) + 6 : 4))) { tu = undefined; u.target = 0; }
    if (q?.order.k === 'attack' && q.order.target) { const ft = unitById(s, q.order.target); if (ft) tu = ft; }
    if (!tu && u.type !== 'ram') {
      const reach = u.side === 'e' ? (isRanged(u) ? r : 3) : isRanged(u) ? r : leash(q?.order.k ?? 'idle') + r;
      tu = pick(s, u, reach);
      if (u.type === 'fire_archer' && !tu) {
        const wood = s.structs.find(st => STRUCTURES[st.kind].wooden[st.level - 1] && st.burning <= 0 && distToStruct(u.x, u.y, st) < r);
        if (wood) u.target = STRUCT_TARGET + wood.id;
      }
    }
    if (tu) {
      if (u.side === 'e' || tu.id !== u.target) u.target = tu.id;
      const dist = edge(u, tu);
      if (dist <= r) {
        u.anim = 2; u.facing = Math.atan2(tu.y - u.y, tu.x - u.x);
        if (u.cd <= 0) { u.cd = d.cd * (u.side === 'p' && s.hunger ? 1.15 : 1); strike(s, u, tu); }
      } else {
        u.anim = u.anim === 2 ? 1 : u.anim;
        if (u.side === 'p' && !isRanged(u) && q && leash(q.order.k) > 2) { u.gx = tu.x; u.gy = tu.y; }
      }
      continue;
    }
    // structures (enemies breaking through)
    if (u.side === 'e' && u.target >= STRUCT_TARGET) {
      const st = structById(s, u.target - STRUCT_TARGET);
      if (!st) { u.target = 0; if (u.anim === 2) u.anim = 1; continue; }
      if (distToStruct(u.x, u.y, st) <= r + d.radius * 0.5 + 0.3) {
        u.anim = 2;
        u.facing = Math.atan2((st.cy + st.h / 2) * 4 - u.y, (st.cx + st.w / 2) * 4 - u.x);
        if (u.cd <= 0) {
          u.cd = d.cd;
          if (isRanged(u)) fireShell(s, u.type === 'fire_archer' ? 'fire' : 'bolt', { x: u.x, y: u.y, z: 1.6 }, { x: (st.cx + 0.5) * 4, y: (st.cy + 0.5) * 4, z: 2 }, { dmg: d.dmg, dk: d.kind, side: 'e', target: STRUCT_TARGET + st.id });
          else damageStruct(s, st, d.dmg, d.kind, u);
        }
      } else if (u.anim === 2) u.anim = 1;
      continue;
    }
    if (u.anim === 2) u.anim = u.side === 'p' ? 0 : 1;
  }
}

function strike(s: GameState, u: Unit, t: Unit) {
  const d = defOf(u.type);
  if (isRanged(u)) {
    const kind: ShellKind = u.type === 'crossbowman' || u.type === 'e_xbow' ? 'bolt' : u.type === 'fire_archer' ? 'fire' : 'arrow';
    const fire = u.side === 'p' && s.research.includes('firearrows') && kind === 'arrow';
    const sh = fireShell(s, kind, { x: u.x, y: u.y, z: u.z + 1.5 }, { x: t.x + t.vx * 0.5, y: t.y + t.vy * 0.5, z: t.z + 1 },
      { dmg: d.dmg, dk: d.kind, side: u.side, owner: u.owner, target: t.id, pierce: (d as { pierce?: number }).pierce ?? 0, stat: u.type, burn: fire ? [4, 3] : null });
    (sh as unknown as { by: number }).by = u.id;
    return;
  }
  let dmg = d.dmg;
  const ch = (d as { charge?: number }).charge;
  if (ch && u.charge > 12) { dmg *= ch; u.charge = 0; } else u.charge = Math.max(0, u.charge - 4);
  damage(s, t, dmg, d.kind, { attacker: u });
}

/** remove the fallen once their death animation has played */
export function cleanup(s: GameState, dt: number) {
  let removed = false;
  for (const u of s.units) if (u.hp <= 0) { u.dead -= dt; if (u.dead <= 0) removed = true; }
  if (!removed) return;
  const gone = new Set<number>();
  s.units = s.units.filter(u => { if (u.hp <= 0 && u.dead <= 0) { gone.add(u.id); return false; } return true; });
  for (const q of s.squads) q.members = q.members.filter(id => !gone.has(id));
  s.squads = s.squads.filter(q => q.members.length);
  for (const f of s.formations) f.members = f.members.filter(id => !gone.has(id));
  for (const g of s.groups) g.members = g.members.filter(id => !gone.has(id));
}
