import {
  DAMAGE_VS_ARMOR, DECK_COVER, DECK_DAMAGE, DECK_RANGE, UNIT_DEFS, isFixedType, isStructureType, levelArmorBonus,
  type GameState, type PlayerId, type Unit,
} from '@burgwacht/shared';
import { edgeDist, getUnit, pushEvent } from './state';
import { dropFromWall } from './fortress';
import { castlePos, moveToward } from './movement';
import { gridOf } from './grid';

/** how far a unit looks for trouble; fast riders scan wide so they get a run-up for their charge */
const aggroOf = (u: Unit) => (UNIT_DEFS[u.type].speed >= 6 ? 26 : Math.max(UNIT_DEFS[u.type].range + 3, 9));
/** effective weapon range: wall crowns add reach */
export const rangeOf = (u: Unit) => UNIT_DEFS[u.type].range * (u.deck > 0 ? DECK_RANGE : 1);

export const CHARGE_MIN = 14;
const chargeReady = (u: Unit) => UNIT_DEFS[u.type].damageKind === 'charge' && u.charge >= CHARGE_MIN;

/** damage `attacker` deals to `target` in one hit (counter table, armor, level, shaman buff) */
export function resolveDamage(attacker: Unit, target: Unit): number {
  const a = UNIT_DEFS[attacker.type], t = UNIT_DEFS[target.type];
  if (a.damage <= 0) return 0;
  const mult = DAMAGE_VS_ARMOR[a.damageKind][t.armor];
  const armor = (t.armorValue + (isStructureType(target.type) ? levelArmorBonus(target.level) : 0)) * (1 - (a.armorPierce ?? 0));
  let raw = a.damage * mult * (1 + 0.12 * (attacker.level - 1)) * (1 + attacker.buff);
  const spearWall = a.damageKind === 'charge' && t.damageKind === 'spear' && target.order.kind === 'hold';
  if (chargeReady(attacker) && !spearWall) raw *= attacker.formation === 'wedge' ? 2.8 : 2.2; // Sturmangriff
  if (spearWall) raw *= 0.35;                                                                     // Speerwall stops riders
  if (a.range >= 8 && attacker.formation === 'line') raw *= 1.15;                                 // firing line
  if (t.range < 4 && target.formation === 'block') raw *= 0.85;                                   // shield wall
  if (attacker.deck > 0) raw *= DECK_DAMAGE;                                                      // firing from the crown of a wall
  if (target.deck > 0 && a.range >= 8) raw *= DECK_COVER;                                         // crenellations give cover
  return Math.max(1, (raw * 100) / (100 + armor));
}

/** enemies that have been on the field a long time with the spawner empty go berserk */
const frenzied = (s: GameState, u: Unit) =>
  u.side === 'enemy' && s.spawnQueue.length === 0 && s.battleTime - s.lastSpawn > 60;

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
  if (isStructureType(victim.type)) { // a breach: let everyone know and drop the crew from the wall
    pushEvent(s, { k: 'breach', slot: victim.slot, type: victim.type });
    dropFromWall(s, victim);
    return;
  }
  const k = credit.unit;
  if (k && k.hp > 0 && !isFixedType(k.type)) {
    k.xp += 1;
    if (k.level < 3 && k.xp >= XP_FOR_LEVEL[k.level]) {
      k.level++;
      const gain = k.maxHp * 0.15;
      k.maxHp += gain; k.hp += gain;
      pushEvent(s, { k: 'level', x: k.x, y: k.y });
    }
  }
  gridOf(s).near(victim.x, victim.y, 7, o => {
    if (o.hp <= 0 || o.side !== victim.side || isFixedType(o.type)) return;
    if (Math.hypot(o.x - victim.x, o.y - victim.y) < 7)
      o.morale -= (7 * 100) / UNIT_DEFS[o.type].morale;
  });
}

/** best target for u within `reach` (edge distance); preferred armor kinds first, else nearest.
 *  Soldiers go for people first; walls only matter to siege gear, gates to everybody. Nobody can reach a man on a wall crown. */
export function pickTarget(s: GameState, u: Unit, reach: number): Unit | undefined {
  const def = UNIT_DEFS[u.type];
  const melee = def.range < 4;
  const siege = def.armor === 'siege';
  let best: Unit | undefined, bestD = Infinity;
  let pref: Unit | undefined, prefD = Infinity;
  let build: Unit | undefined, buildD = Infinity;
  gridOf(s).near(u.x, u.y, reach + 10, o => { // +10 covers the largest unit radius (castle 8.5)
    if (o.hp <= 0 || o.side === u.side) return;
    const d = edgeDist(u, o);
    if (d > reach) return;
    if (isStructureType(o.type)) {
      if (u.side !== 'enemy' || (!siege && o.type !== 'gate')) return;
      if (d < buildD || (d === buildD && build && o.id < build.id)) { build = o; buildD = d; }
      return;
    }
    if (o.deck > 0 && melee) return; // out of reach of swords
    if (d < bestD || (d === bestD && best && o.id < best.id)) { best = o; bestD = d; }
    if (def.prefers?.includes(UNIT_DEFS[o.type].armor) && (d < prefD || (d === prefD && pref && o.id < pref.id))) { pref = o; prefD = d; }
  });
  if (siege && build && (!best || def.prefers?.includes('structure'))) return build; // rams and trebuchets want walls
  return pref ?? best ?? build;
}

function attack(s: GameState, u: Unit, t: Unit): void {
  const def = UNIT_DEFS[u.type];
  u.cd = def.cooldown;
  u.anim = 2;
  u.facing = Math.atan2(t.y - u.y, t.x - u.x);
  const credit: Credit = { owner: u.owner, unit: u };
  if (chargeReady(u)) pushEvent(s, { k: 'aoe', x: t.x, y: t.y, r: 3.2, kind: 'siege' }); // dust cloud of the charge
  pushEvent(s, { k: 'shot', from: u.id, to: t.id, x: u.x, y: u.y, tx: t.x, ty: t.y, kind: def.damageKind });
  if (def.special === 'aoe' && def.areaRadius) {
    pushEvent(s, { k: 'aoe', x: t.x, y: t.y, r: def.areaRadius, kind: def.damageKind === 'siege' ? 'siege' : 'magic' });
    const victims: Unit[] = []; // collect first: applyDamage may touch the grid's neighbours
    gridOf(s).near(t.x, t.y, def.areaRadius + 9, v => { if (v.hp > 0 && v.side !== u.side) victims.push(v); });
    victims.sort((a, b) => a.id - b.id); // iteration order must not depend on hash layout (determinism)
    for (const v of victims) {
      const d = Math.hypot(v.x - t.x, v.y - t.y) - UNIT_DEFS[v.type].radius * 0;
      if (d > def.areaRadius) continue;
      applyDamage(s, credit, v, resolveDamage(u, v) * (1 - 0.4 * (d / def.areaRadius)));
    }
  } else {
    applyDamage(s, credit, t, resolveDamage(u, t));
  }
  u.charge = 0;
}

export function stepCombat(s: GameState, dt: number): void {
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const def = UNIT_DEFS[u.type];
    if (u.cd > 0) u.cd -= dt;
    if (u.anim === 2 && u.cd < def.cooldown - 0.35) u.anim = 0;
    if (u.routed > 0 || def.special === 'heal') continue; // routed: abilities.ts; healers: abilities.ts
    if (u.order.kind === 'move' || u.order.kind === 'retreat') continue;
    if (def.damage <= 0 && def.special !== 'buff') { if (!frenzied(s, u)) continue; }
    const rng = rangeOf(u);

    if (frenzied(s, u) && !isFixedType(u.type)) { // nobody left to reinforce: stop sniping from afar and press on along the route, so waves always end
      if (def.damage > 0) { const tt = pickTarget(s, u, rng); if (tt && u.cd <= 0) attack(s, u, tt); }
      if (!pickTarget(s, u, Math.min(def.range, 5))) moveToward(u, u.order.x, u.order.y, dt); // stepRoutes already aimed this order along the route
      continue;
    }

    const hold = u.order.kind === 'hold' || isFixedType(u.type) || u.deck > 0;
    const reach = hold ? rng : aggroOf(u);
    let t = getUnit(s, u.targetId);
    if (t && (t.side === u.side || edgeDist(u, t) > reach + 4)) t = undefined;
    const forced = getUnit(s, u.order.targetId);
    if (forced && forced.side !== u.side) t = forced;
    if (!t) t = pickTarget(s, u, reach);
    u.targetId = t?.id ?? null;

    if (def.special === 'buff') { // shamans keep their distance, never attack – unless they are the last ones standing
      const escort = s.units.some(o => o !== u && o.hp > 0 && o.side === u.side && UNIT_DEFS[o.type].special !== 'buff');
      if (t && escort && edgeDist(u, t) < 11) { u.anim = 0; continue; }
      t = undefined;
    }

    // ranged troops fall back while reloading when melee enemies get too close (stay near the post)
    if (t && !hold && def.range >= 8 && def.special !== 'buff' && !isStructureType(t.type) && UNIT_DEFS[t.type].range < 4
      && edgeDist(u, t) < Math.min(5, def.range * 0.3) && u.cd > 0.15 && Math.hypot(u.x - u.postX, u.y - u.postY) < 16) {
      const dx = u.x - t.x, dy = u.y - t.y, dd = Math.hypot(dx, dy) || 1;
      moveToward(u, u.x + (dx / dd) * 6, u.y + (dy / dd) * 6, dt, 0.9);
      continue;
    }
    if (u.anim !== 1) u.charge = Math.max(0, u.charge - 10 * dt);

    if (t) {
      const d = edgeDist(u, t);
      if (d <= rng) {
        u.facing = Math.atan2(t.y - u.y, t.x - u.x);
        if (u.cd <= 0) attack(s, u, t);
      } else if (!hold) {
        moveToward(u, t.x, t.y, dt);
      }
      continue;
    }
    if (isFixedType(u.type)) continue;
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
