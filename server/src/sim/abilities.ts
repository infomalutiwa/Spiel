import {
  MAPS, UNIT_DEFS, type AbilityId, type GameState, type PlayerId, type Unit,
} from '@burgwacht/shared';
import { applyDamage } from './combat';
import { moveToward } from './movement';
import { dist, pushEvent } from './state';
import { gridOf, rebuildGrid } from './grid';

const ABILITY_CD: Record<AbilityId, number> = { arrowRain: 22, rally: 38 };
const ARROW_RAIN = { radius: 7, damage: 30 };

/** player-triggered ability; false while on cooldown */
export function castAbility(s: GameState, player: PlayerId, id: AbilityId, x: number, y: number): boolean {
  const p = s.players[player];
  if (p.abilityCd[id] > 0) return false;
  const map = MAPS[s.mapId];
  x = Math.min(map.width, Math.max(0, x)); y = Math.min(map.depth, Math.max(0, y));
  p.abilityCd[id] = ABILITY_CD[id];
  rebuildGrid(s); // positions may have moved since the tick's grid was built
  if (id === 'arrowRain') {
    pushEvent(s, { k: 'aoe', x, y, r: ARROW_RAIN.radius, kind: 'arrows' });
    const hit: Unit[] = [];
    gridOf(s).near(x, y, ARROW_RAIN.radius + 9, v => { if (v.hp > 0 && v.side === 'enemy' && dist(v, { x, y }) <= ARROW_RAIN.radius) hit.push(v); });
    hit.sort((a, b) => a.id - b.id);
    for (const v of hit) {
      const armor = UNIT_DEFS[v.type];
      applyDamage(s, { owner: player }, v, ARROW_RAIN.damage * 100 / (100 + armor.armorValue));
    }
  } else {
    pushEvent(s, { k: 'aoe', x, y, r: 12, kind: 'rally' });
    const allies: Unit[] = [];
    gridOf(s).near(x, y, 12 + 1, u => { if (u.hp > 0 && u.owner === player && u.type !== 'castle' && dist(u, { x, y }) <= 12) allies.push(u); });
    allies.sort((a, b) => a.id - b.id);
    for (const u of allies) {
      const heal = u.maxHp * 0.25;
      u.hp = Math.min(u.maxHp, u.hp + heal);
      u.morale = 100; u.routed = 0;
      pushEvent(s, { k: 'heal', x: u.x, y: u.y, amt: Math.round(heal) });
    }
  }
  return true;
}

const woundedFriends = (s: GameState, u: Unit, within: number) => {
  const out: Unit[] = [];
  gridOf(s).near(u.x, u.y, within, o => {
    if (o.hp > 0 && o.hp < o.maxHp && o.side === u.side && o.type !== 'castle' && o !== u && dist(u, o) <= within) out.push(o);
  });
  return out.sort((a, b) => a.id - b.id);
};

export function stepAbilities(s: GameState, dt: number): void {
  for (const p of s.players)
    for (const id of Object.keys(p.abilityCd) as AbilityId[])
      p.abilityCd[id] = Math.max(0, p.abilityCd[id] - dt);

  for (const u of s.units) u.buff = 0;
  for (const sh of s.units) {
    const def = UNIT_DEFS[sh.type];
    if (sh.hp <= 0 || def.special !== 'buff') continue;
    gridOf(s).near(sh.x, sh.y, def.areaRadius!, o => {
      if (o.hp > 0 && o.side === sh.side && dist(o, sh) <= def.areaRadius!) o.buff = Math.max(o.buff, def.power!);
    });
  }

  for (const u of s.units) {
    if (u.hp <= 0 || u.type === 'castle') continue;
    const def = UNIT_DEFS[u.type];

    // morale: recover slowly, rout when it breaks
    u.morale = Math.min(100, u.morale + 4 * dt);
    if (u.routed > 0) {
      u.routed -= dt;
      const map = MAPS[s.mapId];
      const home = u.side === 'player' ? map.castle : map.spawns[u.lane % map.spawns.length];
      moveToward(u, home.x, home.y, dt, 1.3);
      continue;
    }
    if (u.morale <= 15) { u.routed = 4; u.morale = 45; u.targetId = null; continue; }

    if (def.special === 'heal') {
      if (u.cd > 0) u.cd -= dt;
      const order = u.order.kind;
      if (order === 'move' || order === 'retreat') continue; // stepMovement walks
      const hurt = woundedFriends(s, u, def.range);
      if (hurt.length && u.cd <= 0) {
        u.cd = def.cooldown; u.anim = 2;
        for (const o of woundedFriends(s, u, def.areaRadius!)) {
          const amt = Math.min(def.power!, o.maxHp - o.hp);
          o.hp += amt;
          pushEvent(s, { k: 'heal', x: o.x, y: o.y, amt: Math.round(amt) });
        }
      } else if (!hurt.length && order !== 'hold') {
        const far = woundedFriends(s, u, 30)
          .sort((a, b) => dist(u, a) - dist(u, b) || a.id - b.id)[0];
        if (far) moveToward(u, far.x, far.y, dt);
        else if (dist(u, { x: u.postX, y: u.postY }) > 1.5) moveToward(u, u.postX, u.postY, dt);
        else if (u.anim === 1) u.anim = 0;
      }
    }
  }
}
