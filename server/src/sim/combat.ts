import {
  DAMAGE_VS_ARMOR, DECK_COVER, DECK_DAMAGE, DECK_RANGE, TROOPS, UNIT_DEFS, branchOf, isFixedType, isStructureType, levelArmorBonus,
  type GameState, type PlayerId, type Unit,
} from '@burgwacht/shared';
import { edgeDist, getUnit, pushEvent } from './state';
import { dropFromWall } from './fortress';
import { castlePos, moveToward } from './movement';
import { gridOf } from './grid';
import { levelDamage } from './tech';
import { artilleryTurn, nearestThreat } from './artillery';

const isTroop = (u: Unit) => Object.hasOwn(TROOPS, u.type);
const roleOf = (u: Unit) => UNIT_DEFS[u.type].role;
const isRanged = (u: Unit) => { const r = roleOf(u); return r === 'archer' || r === 'caster'; };
const slowOf = (u: Unit) => (u.slow > 0 ? 0.6 : 1);

/** how far a unit looks for trouble; fast riders scan wide so they get a run-up for their charge */
const aggroOf = (u: Unit) => {
  const def = UNIT_DEFS[u.type];
  if (branchOf(u.type, u.branch) === 'flank') return 34;
  return def.speed >= 6 ? 26 : Math.max(rangeOf(u) + 3, 9);
};
/** effective weapon range: wall crowns and some upgrade branches add reach */
export const rangeOf = (u: Unit) => {
  const b = branchOf(u.type, u.branch);
  let r = UNIT_DEFS[u.type].range;
  if (b === 'javelin') r = 8;
  else if (b === 'pike') r += 0.8;
  else if (b === 'sniper') r *= 1.4;
  return r * (u.deck > 0 ? DECK_RANGE : 1);
};

export const CHARGE_MIN = 14;
const chargeReady = (u: Unit) => UNIT_DEFS[u.type].damageKind === 'charge' && u.charge >= CHARGE_MIN;

/** damage `attacker` deals to `target` in one hit (counter table, armor, level, branches, shaman buff) */
export function resolveDamage(attacker: Unit, target: Unit): number {
  const a = UNIT_DEFS[attacker.type], t = UNIT_DEFS[target.type];
  if (a.damage <= 0) return 0;
  const br = branchOf(attacker.type, attacker.branch), tb = branchOf(target.type, target.branch);
  const deep = attacker.level >= 3 ? 1.3 : 1; // level 3 deepens the branch
  let pierce = a.armorPierce ?? 0;
  if (br === 'pierce') pierce = Math.max(pierce, 0.6);
  if (br === 'sniper') pierce = Math.max(pierce, 0.85);
  const mult = DAMAGE_VS_ARMOR[a.damageKind][t.armor];
  const armor = (t.armorValue + (isStructureType(target.type) ? levelArmorBonus(target.level) : 0)) * (1 - pierce);
  const lv = isTroop(attacker) ? levelDamage(attacker.level) : 1 + 0.12 * (attacker.level - 1);
  let raw = a.damage * mult * lv * (1 + attacker.buff);
  if (br === 'pierce') raw *= 1.1;
  if (br === 'berserk') raw *= (1.35 * deep) * (attacker.hp < attacker.maxHp * 0.5 ? 1.25 : 1);
  if (br === 'boulder') raw *= 1.25;
  if (br === 'javelin') raw *= 0.9;
  if (br === 'pike' && t.armor === 'mounted') raw *= 1.6 * (deep > 1 ? 1.1 : 1);
  const spearWall = a.damageKind === 'charge' && t.damageKind === 'spear' && (target.order.kind === 'hold' || tb === 'pike');
  if (chargeReady(attacker) && !spearWall) raw *= (attacker.formation === 'wedge' ? 2.8 : 2.2) * (br === 'lance' ? 1.5 * deep : 1); // Sturmangriff
  if (spearWall) raw *= 0.35;                                                                     // Speerwall stops riders
  if (a.range >= 8 && attacker.formation === 'line') raw *= 1.15;                                 // firing line
  if (t.range < 4 && target.formation === 'block') raw *= 0.85;                                   // shield wall
  if (attacker.deck > 0) raw *= DECK_DAMAGE;                                                      // firing from the crown of a wall
  if (target.deck > 0 && a.range >= 8) raw *= DECK_COVER;                                         // crenellations give cover
  if (tb === 'shield' && (a.range >= 5 || a.damageKind === 'magic')) raw *= 0.5;                  // shield wall blocks missiles
  return Math.max(1, (raw * 100) / (100 + armor));
}

/** enemies that have been on the field a long time with the spawner empty go berserk */
const frenzied = (s: GameState, u: Unit) =>
  u.side === 'enemy' && s.spawnQueue.length === 0 && s.battleTime - s.lastSpawn > 60;

export interface Credit { owner: PlayerId | null; unit?: Unit }

/** a downed trooper next to a reviving healer gets up again */
function tryRevive(s: GameState, victim: Unit): boolean {
  if (victim.owner === null || !isTroop(victim)) return false;
  let healer: Unit | undefined;
  gridOf(s).near(victim.x, victim.y, 11, h => {
    if (h.hp <= 0 || h.owner !== victim.owner || h.type !== 'healer' || h.t2 > 0 || h === victim) return;
    if (branchOf('healer', h.branch) !== 'revive' || Math.hypot(h.x - victim.x, h.y - victim.y) > 10) return;
    if (!healer || h.id < healer.id) healer = h;
  });
  if (!healer) return false;
  healer.t2 = healer.level >= 3 ? 12 : 18;
  victim.hp = victim.maxHp * (healer.level >= 3 ? 0.6 : 0.45);
  victim.cd = 1; victim.burn = 0; victim.routed = 0; victim.targetId = null;
  pushEvent(s, { k: 'revive', x: victim.x, y: victim.y });
  return true;
}

/** applies damage, handles kill rewards and morale shock; `quiet` skips the floating number (burning) */
export function applyDamage(s: GameState, credit: Credit, victim: Unit, amt: number, quiet = false): void {
  if (victim.hp <= 0 || amt <= 0) return;
  victim.hp -= amt;
  if (!quiet) pushEvent(s, { k: 'dmg', x: victim.x, y: victim.y, amt: Math.round(amt) });
  if (victim.hp > 0) return;
  victim.hp = 0;
  if (tryRevive(s, victim)) return;
  pushEvent(s, { k: 'death', x: victim.x, y: victim.y, type: victim.type });
  if (victim.side === 'enemy' && credit.owner !== null)
    s.players[credit.owner].gold += Math.round(UNIT_DEFS[victim.type].cost * 0.6);
  if (isStructureType(victim.type)) { // a breach: let everyone know and drop the crew from the wall
    pushEvent(s, { k: 'breach', slot: victim.slot, type: victim.type });
    dropFromWall(s, victim);
    return;
  }
  gridOf(s).near(victim.x, victim.y, 7, o => {
    if (o.hp <= 0 || o.side !== victim.side || isFixedType(o.type)) return;
    if (Math.hypot(o.x - victim.x, o.y - victim.y) < 7)
      o.morale -= (7 * 100) / UNIT_DEFS[o.type].morale;
  });
}

/** set a unit on fire: `dps` for `secs` seconds (the stronger fire wins, the timer refreshes) */
export function ignite(victim: Unit, owner: PlayerId | null, dps: number, secs: number): void {
  if (victim.hp <= 0 || isFixedType(victim.type)) return;
  if (dps >= victim.burnDps || victim.burn <= 0) { victim.burnDps = dps; victim.burnBy = owner ?? -1; }
  victim.burn = Math.max(victim.burn, secs);
}

/** per-tick status effects: burning pulses twice a second and spreads to neighbours, slowness runs out */
function stepStatus(s: GameState, u: Unit, dt: number): void {
  if (u.t2 > 0 && isStructureType(u.type)) u.t2 = Math.max(0, u.t2 - dt); // repair cooldown of walls, gates and towers
  if (u.slow > 0) u.slow = Math.max(0, u.slow - dt);
  if (u.burn <= 0) return;
  const before = u.burn;
  u.burn = Math.max(0, u.burn - dt);
  if (u.burn <= 0) { u.burnDps = 0; u.burnBy = -1; }
  if (Math.floor(before * 2) === Math.floor(u.burn * 2)) return;
  const owner = u.burnBy >= 0 ? (u.burnBy as PlayerId) : null;
  applyDamage(s, { owner }, u, u.burnDps * 0.5, true);
  if (u.hp > 0 && Math.floor(before) !== Math.floor(u.burn)) // once a second the fire jumps to a close neighbour
    gridOf(s).near(u.x, u.y, 3, o => {
      if (o.hp <= 0 || o.side !== u.side || o === u || o.burn > 0 || isFixedType(o.type)) return;
      if (Math.hypot(o.x - u.x, o.y - u.y) < 2.2) ignite(o, owner, u.burnDps * 0.6, 2);
    });
}

const mult = (u: Unit, o: Unit) => DAMAGE_VS_ARMOR[UNIT_DEFS[u.type].damageKind][UNIT_DEFS[o.type].armor];

/** best target for u within `reach` (edge distance).
 *  Melee: taunting tanks first, then preferred armor, else nearest. Archers and mages: the most vulnerable target
 *  (good damage multiplier, already wounded, casters and healers first; mages like dense groups).
 *  Soldiers go for people first; walls only matter to siege gear, gates to everybody. Nobody can reach a man on a wall crown. */
export function pickTarget(s: GameState, u: Unit, reach: number): Unit | undefined {
  const def = UNIT_DEFS[u.type];
  const melee = def.range < 4;
  const siege = def.armor === 'siege';
  const ranged = isRanged(u), role = def.role;
  const noTaunt = role === 'cavalry' || siege;
  let best: Unit | undefined, bestD = Infinity;
  let pref: Unit | undefined, prefD = Infinity;
  let build: Unit | undefined, buildD = Infinity;
  let taunter: Unit | undefined, tauntD = Infinity;
  let top: Unit | undefined, topScore = -Infinity;
  const cands: Unit[] = [];
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
    const tr = UNIT_DEFS[o.type].taunt;
    if (tr && !noTaunt && melee) {
      const reachT = tr + (branchOf(o.type, o.branch) === 'shield' ? 3 : 0);
      if (d <= reachT && (d < tauntD || (d === tauntD && taunter && o.id < taunter.id))) { taunter = o; tauntD = d; }
    }
    if (ranged) cands.push(o);
  });
  if (ranged && cands.length) {
    const aoe = def.special === 'aoe' ? def.areaRadius ?? 0 : 0;
    const snipe = branchOf(u.type, u.branch) === 'sniper';
    for (const o of cands) {
      const od = UNIT_DEFS[o.type];
      let sc = mult(u, o) * (1 + 1.2 * (1 - o.hp / o.maxHp));
      if (od.special === 'buff' || od.special === 'heal') sc *= 1.7;
      else if (od.role === 'archer' || od.role === 'caster' || od.role === 'artillery') sc *= 1.3;
      if (snipe && (od.special === 'buff' || od.role === 'tank' || od.hp >= 600)) sc *= 1.5;
      if (aoe) { let n = 0; for (const p of cands) if (Math.hypot(p.x - o.x, p.y - o.y) <= aoe) n++; sc *= 1 + 0.25 * (n - 1); }
      sc /= 1 + (edgeDist(u, o) / Math.max(1, reach)) * 0.6;
      if (sc > topScore + 1e-9 || (Math.abs(sc - topScore) <= 1e-9 && top && o.id < top.id)) { top = o; topScore = sc; }
    }
    if (top) return top;
  }
  if (siege && build && (!best || def.prefers?.includes('structure'))) return build; // rams and trebuchets want walls
  return taunter ?? pref ?? best ?? build;
}

function hit(s: GameState, u: Unit, t: Unit, credit: Credit): void {
  applyDamage(s, credit, t, resolveDamage(u, t));
  const br = branchOf(u.type, u.branch), deep = u.level >= 3;
  if (br === 'fire' && t.hp > 0) { // fire arrows: the burn is as strong as the arrow itself, over three seconds, ignoring half the armor
    const raw = UNIT_DEFS[u.type].damage * levelDamage(u.level) * (deep ? 1.4 : 1);
    ignite(t, u.owner, ((raw * 100) / (100 + UNIT_DEFS[t.type].armorValue * 0.5)) / 3, 3);
  }
}

function attack(s: GameState, u: Unit, t: Unit): void {
  const def = UNIT_DEFS[u.type];
  const br = branchOf(u.type, u.branch);
  u.cd = def.cooldown * (br === 'berserk' ? 0.8 : 1) * (br === 'salvo' ? 1.1 : 1);
  u.anim = 2;
  u.facing = Math.atan2(t.y - u.y, t.x - u.x);
  const credit: Credit = { owner: u.owner, unit: u };
  const charged = chargeReady(u);
  if (charged) pushEvent(s, { k: 'aoe', x: t.x, y: t.y, r: 3.2, kind: 'siege' }); // dust cloud of the charge
  pushEvent(s, { k: 'shot', from: u.id, to: t.id, x: u.x, y: u.y, tx: t.x, ty: t.y, kind: def.damageKind, ...(br === 'fire' ? { fire: true } : {}) });
  if (def.special === 'aoe' && def.areaRadius) { // mages: instant blast around the target
    pushEvent(s, { k: 'aoe', x: t.x, y: t.y, r: def.areaRadius, kind: br === 'frost' ? 'frost' : 'magic' });
    const victims: Unit[] = []; // collect first: applyDamage may touch the grid's neighbours
    gridOf(s).near(t.x, t.y, def.areaRadius + 9, v => { if (v.hp > 0 && v.side !== u.side) victims.push(v); });
    victims.sort((a, b) => a.id - b.id); // iteration order must not depend on hash layout (determinism)
    const struck = new Set<number>();
    for (const v of victims) {
      const d = Math.hypot(v.x - t.x, v.y - t.y);
      if (d > def.areaRadius) continue;
      struck.add(v.id);
      applyDamage(s, credit, v, resolveDamage(u, v) * (1 - 0.4 * (d / def.areaRadius)));
      if (br === 'frost') v.slow = Math.max(v.slow, 3);
    }
    if (br === 'chain') { // the bolt jumps to the nearest enemies outside the blast
      const jumps = victims.filter(v => v.hp > 0 && !struck.has(v.id) && !isStructureType(v.type) && Math.hypot(v.x - t.x, v.y - t.y) <= 10)
        .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y) || a.id - b.id).slice(0, u.level >= 3 ? 4 : 3);
      for (const v of jumps) {
        pushEvent(s, { k: 'shot', from: t.id, to: v.id, x: t.x, y: t.y, tx: v.x, ty: v.y, kind: 'magic' });
        applyDamage(s, credit, v, resolveDamage(u, v) * 0.55);
      }
    }
  } else {
    hit(s, u, t, credit);
    if (br === 'salvo' && t.hp > 0) hit(s, u, t, credit); // second bolt
    if (charged && br === 'lance' && t.hp > 0 && !isFixedType(t.type)) { // lance charge knocks the target back
      const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
      t.x += (dx / d) * 2.5; t.y += (dy / d) * 2.5;
    }
    if (UNIT_DEFS[t.type].damageKind === 'spear' && branchOf(t.type, t.branch) === 'pike' && def.damageKind === 'charge') u.charge = 0;
  }
  u.charge = 0;
}

/** `shuffle`: the unit gives up ground without ever leaving its leash from the post */
function kite(s: GameState, u: Unit, dt: number): boolean {
  const def = UNIT_DEFS[u.type];
  if (!def.minRange || u.deck > 0 || u.order.kind === 'hold' || isFixedType(u.type)) return false;
  const th = nearestThreat(s, u, def.minRange);
  if (!th) return false;
  if (u.side === 'player' && Math.hypot(u.x - u.postX, u.y - u.postY) > 18) return false; // cornered: fight
  const dx = u.x - th.x, dy = u.y - th.y, dd = Math.hypot(dx, dy) || 1;
  moveToward(u, u.x + (dx / dd) * 6, u.y + (dy / dd) * 6, dt, 0.95 * slowOf(u));
  return true;
}

export function stepCombat(s: GameState, dt: number): void {
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const def = UNIT_DEFS[u.type];
    stepStatus(s, u, dt);
    if (u.hp <= 0) continue;
    if (u.cd > 0) u.cd -= dt * slowOf(u);
    if (u.anim === 2 && u.cd < def.cooldown - 0.35) u.anim = 0;
    if (u.routed > 0 || def.special === 'heal') continue; // routed: abilities.ts; healers: abilities.ts
    if (u.order.kind === 'move' || u.order.kind === 'retreat') continue;
    if (def.role === 'artillery') { artilleryTurn(s, u, dt, frenzied(s, u)); continue; }
    if (def.damage <= 0 && def.special !== 'buff') { if (!frenzied(s, u)) continue; }
    const rng = rangeOf(u);

    if (frenzied(s, u) && !isFixedType(u.type)) { // nobody left to reinforce: stop sniping from afar and press on along the route, so waves always end
      if (def.damage > 0) { const tt = pickTarget(s, u, rng); if (tt && u.cd <= 0) { u.buff += isStructureType(tt.type) ? 1.5 : 0.5; attack(s, u, tt); } } // berserk: hits much harder, so a wave can never stall at a repaired gate
      if (!pickTarget(s, u, Math.min(def.range, 5))) moveToward(u, u.order.x, u.order.y, dt, slowOf(u)); // stepRoutes already aimed this order along the route
      continue;
    }

    const hold = u.order.kind === 'hold' || isFixedType(u.type) || u.deck > 0;
    const reach = hold ? rng : aggroOf(u);
    let t = getUnit(s, u.targetId);
    if (t && (t.side === u.side || edgeDist(u, t) > reach + 4)) t = undefined;
    const forced = getUnit(s, u.order.targetId);
    if (forced && forced.side !== u.side) t = forced;
    if (!t || (isRanged(u) && u.cd <= 0.05)) t = pickTarget(s, u, reach) ?? t; // marksmen look for the best victim before every shot
    u.targetId = t?.id ?? null;

    if (def.special === 'buff') { // shamans keep their distance, never attack – unless they are the last ones standing
      const escort = s.units.some(o => o !== u && o.hp > 0 && o.side === u.side && UNIT_DEFS[o.type].special !== 'buff');
      if (t && escort && edgeDist(u, t) < 11) { u.anim = 0; continue; }
      t = undefined;
    }

    // shoot and scoot: marksmen fire when ready, otherwise give ground to melee enemies that got too close
    const readyShot = !!t && u.cd <= 0 && edgeDist(u, t) <= rng;
    if (!readyShot && def.minRange && !(t && isStructureType(t.type)) && kite(s, u, dt)) continue;
    if (u.anim !== 1) u.charge = Math.max(0, u.charge - 10 * dt);

    if (t) {
      const d = edgeDist(u, t);
      if (d <= rng) {
        u.facing = Math.atan2(t.y - u.y, t.x - u.x);
        if (u.cd <= 0) attack(s, u, t);
      } else if (!hold) {
        let gx = t.x, gy = t.y;
        if (def.role === 'cavalry' && d > 14) { // riders swing out to the flank instead of running straight into the front
          const dx = t.x - u.x, dy = t.y - u.y, dd = Math.hypot(dx, dy) || 1;
          const side = u.id % 2 ? 1 : -1, k = Math.min(1, (d - 14) / 18) * (branchOf(u.type, u.branch) === 'flank' ? 13 : 8);
          gx += (-dy / dd) * side * k; gy += (dx / dd) * side * k;
        }
        moveToward(u, gx, gy, dt, slowOf(u));
      }
      continue;
    }
    if (isFixedType(u.type)) continue;
    if (u.order.kind === 'attackMove' || u.order.kind === 'assault') {
      if (moveToward(u, u.order.x, u.order.y, dt, slowOf(u)) && u.order.kind === 'attackMove') {
        if (u.side === 'player') {
          u.order = { kind: 'idle', x: u.x, y: u.y };
          u.postX = u.x; u.postY = u.y;
        }
        u.anim = 0;
      }
    } else if (u.order.kind === 'idle' && Math.hypot(u.postX - u.x, u.postY - u.y) > 1.5) {
      moveToward(u, u.postX, u.postY, dt, slowOf(u));
    } else if (u.anim === 1) {
      u.anim = 0;
    }
  }
  s.units = s.units.filter(u => u.hp > 0 || u.type === 'castle');
}

export { castlePos };
