import {
  BUILDINGS, BUILDING_SPACING, BUILD_INFO, INFIRMARY_HEAL, INFIRMARY_RADIUS, MAPS, MAX_BUILDING_LEVEL, MINE_INCOME, isBuildingType, levelHpMul,
  type BuildingType, type GameState, type PlayerId, type Unit,
} from '@burgwacht/shared';
import { isTroopUnit } from './helpers-b';
import { spawnUnit } from './state';

export const buildingsOf = (s: GameState, player: PlayerId, kind?: BuildingType): Unit[] =>
  s.units.filter(u => u.hp > 0 && u.owner === player && isBuildingType(u.type) && (!kind || u.type === kind));

/** where a building may stand: the courtyard, clear of other fixed things */
export function buildSpot(s: GameState, x: number, y: number): boolean {
  const z = MAPS[s.mapId].placeZone;
  if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) return false;
  return !s.units.some(u => u.hp > 0 && (isBuildingType(u.type) || u.type === 'castle' || u.slot >= 0) && Math.hypot(u.x - x, u.y - y) < BUILDING_SPACING);
}

export function build(s: GameState, player: PlayerId, kind: BuildingType, x: number, y: number): string | undefined {
  if (!isBuildingType(kind) || !Number.isFinite(x) || !Number.isFinite(y)) return 'bad_command';
  const me = s.players[player], info = BUILD_INFO[kind];
  if (buildingsOf(s, player, kind).length >= info.max) return 'building_max';
  if (info.gold > me.gold) return 'not_enough_gold';
  if (!buildSpot(s, x, y)) return 'outside_zone';
  me.gold -= info.gold;
  const u = spawnUnit(s, 'player', player, kind, x, y);
  u.hp = u.maxHp = BUILDINGS[kind].hp; u.facing = 0;
  return undefined;
}

export function upgradeBuilding(s: GameState, player: PlayerId, id: number): string | undefined {
  const u = s.units.find(o => o.id === id);
  if (!u || u.hp <= 0 || u.owner !== player || !isBuildingType(u.type)) return 'bad_command';
  if (u.level >= MAX_BUILDING_LEVEL) return 'max_level';
  const cost = BUILD_INFO[u.type].up[u.level - 1], me = s.players[player];
  if (cost > me.gold) return 'not_enough_gold';
  me.gold -= cost;
  const old = u.maxHp;
  u.level++; u.maxHp = BUILDINGS[u.type].hp * levelHpMul(u.level); u.hp += u.maxHp - old;
  return undefined;
}

/** goldmines pay out, infirmaries mend troops around them */
export function stepBuildings(s: GameState, dt: number): void {
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
