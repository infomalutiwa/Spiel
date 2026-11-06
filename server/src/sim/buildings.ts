import {
  BUILDINGS, BUILDING_SPACING, BUILD_INFO, INFIRMARY_HEAL, INFIRMARY_RADIUS, MAPS, MAX_BUILDING_LEVEL, MINE_INCOME, PITCH_BURN, PITCH_DPS, PIT_DAMAGE,
  buildArea, isBuildingType, isTrapType, levelHpMul,
  UNIT_DEFS, type BuildingType, type GameState, type PlayerId, type Unit,
} from '@burgwacht/shared';
import { applyDamage, ignite } from './combat';
import { isTroopUnit } from './helpers-b';
import { pushEvent, spawnUnit } from './state';

export const buildingsOf = (s: GameState, player: PlayerId, kind?: BuildingType): Unit[] =>
  s.units.filter(u => u.hp > 0 && u.owner === player && isBuildingType(u.type) && (!kind || u.type === kind));

/** where a building may stand: the courtyard, clear of other fixed things */
export function buildSpot(s: GameState, kind: BuildingType, x: number, y: number): boolean {
  const map = MAPS[s.mapId], z = buildArea(map, kind);
  if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) return false;
  const trap = isTrapType(kind);
  return !s.units.some(u => u.hp > 0 && (isBuildingType(u.type) || u.type === 'castle' || u.slot >= 0)
    && Math.hypot(u.x - x, u.y - y) < (trap && isTrapType(u.type) ? BUILDINGS[kind].radius + BUILDINGS[u.type].radius : trap ? BUILDINGS[kind].radius + 3 : BUILDING_SPACING));
}

export function build(s: GameState, player: PlayerId, kind: BuildingType, x: number, y: number): string | undefined {
  if (!isBuildingType(kind) || !Number.isFinite(x) || !Number.isFinite(y)) return 'bad_command';
  const me = s.players[player], info = BUILD_INFO[kind];
  if (buildingsOf(s, player, kind).length >= info.max) return 'building_max';
  if (info.gold > me.gold) return 'not_enough_gold';
  if (!buildSpot(s, kind, x, y)) return 'outside_zone';
  me.gold -= info.gold;
  const u = spawnUnit(s, 'player', player, kind, x, y);
  u.hp = u.maxHp = BUILDINGS[kind].hp; u.facing = 0;
  return undefined;
}

export function upgradeBuilding(s: GameState, player: PlayerId, id: number): string | undefined {
  const u = s.units.find(o => o.id === id);
  if (!u || u.hp <= 0 || u.owner !== player || !isBuildingType(u.type)) return 'bad_command';
  if (u.level >= MAX_BUILDING_LEVEL || isTrapType(u.type)) return 'max_level';
  const cost = BUILD_INFO[u.type].up[u.level - 1], me = s.players[player];
  if (cost > me.gold) return 'not_enough_gold';
  me.gold -= cost;
  const old = u.maxHp;
  u.level++; u.maxHp = BUILDINGS[u.type].hp * levelHpMul(u.level); u.hp += u.maxHp - old;
  return undefined;
}

/** sets a pitch ditch alight (no-op if it already burns); returns whether it caught fire */
export function lightPitch(s: GameState, p: Unit): boolean {
  if (p.type !== 'pitch' || p.hp <= 0 || p.t2 > 0) return false;
  p.t2 = PITCH_BURN; p.burn = PITCH_BURN; p.burnDps = 0;
  pushEvent(s, { k: 'aoe', x: p.x, y: p.y, r: BUILDINGS.pitch.radius, kind: 'fire' });
  return true;
}
/** fire landing at (x, y) lights every pitch ditch it touches */
export function fireAt(s: GameState, x: number, y: number, r = 1.5): void {
  for (const p of s.units) if (p.type === 'pitch' && p.hp > 0 && Math.hypot(p.x - x, p.y - y) <= BUILDINGS.pitch.radius + r) lightPitch(s, p);
}

function stepTraps(s: GameState, dt: number): void {
  for (const t of s.units) {
    if (t.hp <= 0 || !isTrapType(t.type)) continue;
    const r = BUILDINGS[t.type].radius;
    if (t.type === 'pitch') {
      if (t.t2 <= 0) continue;
      t.t2 = Math.max(0, t.t2 - dt); t.burn = t.t2;
      for (const e of s.units)
        if (e.hp > 0 && e.side === 'enemy' && Math.hypot(e.x - t.x, e.y - t.y) <= r) ignite(e, t.owner, PITCH_DPS, 2);
      if (t.t2 <= 0) t.hp = 0; // burnt out: the ditch is used up
    } else {
      const victims = s.units.filter(e => e.hp > 0 && e.side === 'enemy' && UNIT_DEFS[e.type].armor !== 'siege' && Math.hypot(e.x - t.x, e.y - t.y) <= r);
      if (!victims.length) continue;
      for (const v of victims) applyDamage(s, { owner: t.owner }, v, PIT_DAMAGE);
      pushEvent(s, { k: 'aoe', x: t.x, y: t.y, r, kind: 'siege' });
      t.hp = 0;
    }
  }
}

/** goldmines pay out, infirmaries mend troops around them */
export function stepBuildings(s: GameState, dt: number): void {
  if (s.phase === 'battle') stepTraps(s, dt);
  else for (const p of s.units) if (p.type === 'pitch' && p.t2 > 0) p.hp = 0; // a ditch still burning when the wave ends is spent
  for (const b of s.units) {
    if (b.hp <= 0 || b.owner === null) continue;
    if (b.type === 'goldmine') s.players[b.owner].gold += MINE_INCOME[b.level - 1] * dt;
    else if (b.type === 'infirmary') {
      const rate = INFIRMARY_HEAL[b.level - 1] * dt;
      for (const u of s.units)
        if (u.hp > 0 && u.side === 'player' && isTroopUnit(u) && u.hp < u.maxHp && Math.hypot(u.x - b.x, u.y - b.y) <= INFIRMARY_RADIUS)
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * rate);
    }
  }
}
