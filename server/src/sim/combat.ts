import {
  DAMAGE_VS_ARMOR, UNIT_DEFS, type GameState, type PlayerId, type Unit,
} from '@burgwacht/shared';
import { edgeDist, getUnit, pushEvent } from './state';
import { castlePos, moveToward } from './movement';

const aggroOf = (u: Unit) => Math.max(UNIT_DEFS[u.type].range + 3, 9);

/** damage `attacker` deals to `target` in one hit (counter table, armor, level, shaman buff) */
export function resolveDamage(attacker: Unit, target: Unit): number {
  const a = UNIT_DEFS[attacker.type], t = UNIT_DEFS[target.type];
  if (a.damage <= 0) return 0;
  const mult = DAMAGE_VS_ARMOR[a.damageKind][t.armor];
  const armor = t.armorValue * (1 - (a.armorPierce ?? 0));
  const raw = a.damage * mult * (1 + 0.12 * (attacker.level - 1)) * (1 + attacker.buff);
  return Math.max(1, (raw * 100) / (100 + armor));
}

const XP_FOR_LEVEL = [0, 3, 8];

export interface Credit { owner: PlayerId | null; unit?: Unit }

/** applies damage, handles kill rewards, xp and morale shock */
export function applyDamage(s: GameState, credit: Credit, victim: Unit, amt: number): void {
  if (victim.hp <= 0 || amt <= 0) return;
  victim.hp -= amt;
  pushEvent(s, { k: 'dmg', x: victim.x, y: victim.y, amt: Math.round(amt) });
  if (victim.hp > 0) return;
  victim.hp = 0;
  pushEvent(s, { k: 'death', x: victim.x, y: victim.y, type: victim.type });
  if (victim.side === 'enemy' && credit.owner !== null)
    s.players[credit.owner].gold += Math.round(UNIT_DEFS[victim.type].cost * 0.8);
  const k = credit.unit;
  if (k && k.hp > 0) {
    k.xp += 1;
    if (k.level < 3 && k.xp >= XP_FOR_LEVEL[k.level]) {
      k.level++;
      const gain = k.maxHp * 0.15;
      k.maxHp += gain; k.hp += gain;
      pushEvent(s, { k: 'level', x: k.x, y: k.y });
    }
  }
  for (const o of s.units) {
    if (o.hp <= 0 || o.side !== victim.side || o.type === 'castle') continue;
    if (Math.hypot(o.x - victim.x, o.y - victim.y) < 7)
      o.morale -= (7 * 100) / UNIT_DEFS[o.type].morale;
  }
}

/** best target for u within `reach` (edge distance); preferred armor kinds first, else nearest */
export function pickTarget(s: GameState, u: Unit, reach: number): Unit | undefined {
  const def = UNIT_DEFS[u.type];
  let best: Unit | undefined, bestD = Infinity;
  let pref: Unit | undefined, prefD = Infinity;
  for (const o of s.units) {
    if (o.hp <= 0 || o.side === u.side) continue;
    const d = edgeDist(u, o);
    if (d > reach) continue;
    if (d < bestD) { best = o; bestD = d; }
    if (def.prefers?.includes(UNIT_DEFS[o.type].armor) && d < prefD) { pref = o; prefD = d; }
  }
  return pref ?? best;
}

function attack(s: GameState, u: Unit, t: Unit): void {
  const def = UNIT_DEFS[u.type];
  u.cd = def.cooldown;
  u.anim = 2;
  u.facing = Math.atan2(t.y - u.y, t.x - u.x);
  const credit: Credit = { owner: u.owner, unit: u };
  pushEvent(s, { k: 'shot', from: u.id, to: t.id, x: u.x, y: u.y, tx: t.x, ty: t.y, kind: def.damageKind });
  if (def.special === 'aoe' && def.areaRadius) {
    pushEvent(s, { k: 'aoe', x: t.x, y: t.y, r: def.areaRadius, kind: def.damageKind === 'siege' ? 'siege' : 'magic' });
    for (const v of s.units) {
      if (v.hp <= 0 || v.side === u.side) continue;
      const d = Math.hypot(v.x - t.x, v.y - t.y);
      if (d > def.areaRadius) continue;
      applyDamage(s, credit, v, resolveDamage(u, v) * (1 - 0.4 * (d / def.areaRadius)));
    }
  } else {
    applyDamage(s, credit, t, resolveDamage(u, t));
  }
}

export function stepCombat(s: GameState, dt: number): void {
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const def = UNIT_DEFS[u.type];
    if (u.cd > 0) u.cd -= dt;
    if (u.anim === 2 && u.cd < def.cooldown - 0.35) u.anim = 0;
    if (u.routed > 0 || def.special === 'heal') continue; // routed: abilities.ts; healers: abilities.ts
    if (u.order.kind === 'move' || u.order.kind === 'retreat') continue;
    if (def.damage <= 0 && def.special !== 'buff') continue;

    const hold = u.order.kind === 'hold' || u.type === 'castle';
    const reach = hold ? def.range : aggroOf(u);
    let t = getUnit(s, u.targetId);
    if (t && (t.side === u.side || edgeDist(u, t) > reach + 4)) t = undefined;
    const forced = getUnit(s, u.order.targetId);
    if (forced && forced.side !== u.side) t = forced;
    if (!t) t = pickTarget(s, u, reach);
    u.targetId = t?.id ?? null;

    if (def.special === 'buff') { // shamans keep their distance, never attack
      if (t && edgeDist(u, t) < 11) { u.anim = 0; continue; }
      t = undefined;
    }

    if (t) {
      const d = edgeDist(u, t);
      if (d <= def.range) {
        u.facing = Math.atan2(t.y - u.y, t.x - u.x);
        if (u.cd <= 0) attack(s, u, t);
      } else if (!hold) {
        moveToward(u, t.x, t.y, dt);
      }
      continue;
    }
    if (u.type === 'castle') continue;
    if (u.order.kind === 'attackMove') {
      if (moveToward(u, u.order.x, u.order.y, dt)) {
        if (u.side === 'player') {
          u.order = { kind: 'idle', x: u.x, y: u.y };
          u.postX = u.x; u.postY = u.y;
        }
        u.anim = 0;
      }
    } else if (u.order.kind === 'idle' && Math.hypot(u.postX - u.x, u.postY - u.y) > 1.5) {
      moveToward(u, u.postX, u.postY, dt);
    } else if (u.anim === 1) {
      u.anim = 0;
    }
  }
  s.units = s.units.filter(u => u.hp > 0 || u.type === 'castle');
}

export { castlePos };
