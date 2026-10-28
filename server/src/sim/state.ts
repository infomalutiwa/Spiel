import {
  CASTLE_DEF, MAPS, PREP_TIME, START_GEMS, START_GOLD, START_STONE, TROOP_ORDER, TROOPS, UNIT_DEFS, isStructureType,
  type GameState, type PlayerId, type PlayerState, type Side, type Unit, type UnitType,
} from '@burgwacht/shared';

export const TICK_DT = 0.05;
import { techMaxHp } from './tech';

/** mulberry32 over state.rng; keeps the sim deterministic and serializable */
export function rand(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const newPlayer = (): PlayerState => ({
  gold: START_GOLD, stone: START_STONE, gems: START_GEMS, barracks: 1,
  tech: Object.fromEntries(TROOP_ORDER.map(t => [t, { level: 1, branch: 0 }])) as PlayerState['tech'],
  ready: false, abilityCd: { arrowRain: 0, rally: 0 }, queue: [],
});

export function createGame(mapId: string, seed: number, endless = false): GameState {
  const map = MAPS[mapId];
  if (!map) throw new Error(`unknown map ${mapId}`);
  const s: GameState = {
    mapId, endless, tick: 0, time: 0, rng: seed >>> 0, nextId: 1, phase: 'prep', timer: PREP_TIME,
    wave: 0, players: [newPlayer(), newPlayer()], units: [], spawnQueue: [], shells: [], battleTime: 0, lastSpawn: 0, events: [],
    zones: map.zones.map(() => ({ owner: 'player' as const, progress: 0, reached: false, hold: 0 })), squads: [],
  };
  const castle = spawnUnit(s, 'player', null, 'castle', map.castle.x, map.castle.y);
  castle.hp = castle.maxHp = CASTLE_DEF.hp;
  map.walls.forEach((_, i) => spawnStructure(s, i));
  return s;
}

/** (re)builds the wall piece / gate / tower of map slot `slot` at level 1 */
export function spawnStructure(s: GameState, slot: number): Unit {
  const w = MAPS[s.mapId].walls[slot];
  const u = spawnUnit(s, 'player', null, w.kind, w.x, w.y);
  u.slot = slot; u.facing = 0;
  return u;
}

export const isStructure = (u: { type: UnitType }) => isStructureType(u.type);
export const structureOfSlot = (s: GameState, slot: number): Unit | undefined =>
  s.units.find(u => u.slot === slot && u.hp > 0);

export function spawnUnit(
  s: GameState, side: Side, owner: PlayerId | null, type: UnitType, x: number, y: number, lane = 1,
): Unit {
  const def = UNIT_DEFS[type];
  const u: Unit = {
    id: s.nextId++, side, owner, type, x, y, hp: def.hp, maxHp: def.hp, cd: 0,
    order: { kind: 'idle', x, y }, postX: x, postY: y, targetId: null,
    level: 1, xp: 0, morale: 100, routed: 0, buff: 0, formation: 'block', charge: 0, facing: side === 'player' ? 0 : Math.PI,
    anim: 0, lane, squad: 0, slot: -1, deck: 0, step: 0,
    branch: 0, burn: 0, burnDps: 0, slow: 0, vx: 0, vy: 0, burnBy: -1, px: x, py: y, t2: 0,
  };
  if (owner !== null && Object.hasOwn(TROOPS, type)) { // troops come out as strong as their owner's upgrades make them
    const t = s.players[owner].tech[type as keyof typeof TROOPS];
    u.level = t.level; u.branch = t.branch;
    u.maxHp = u.hp = techMaxHp(type as keyof typeof TROOPS, t.level, t.branch);
  }
  s.units.push(u);
  return u;
}

export const getUnit = (s: GameState, id: number | null | undefined): Unit | undefined =>
  id == null ? undefined : s.units.find(u => u.id === id && u.hp > 0);

export const castleOf = (s: GameState): Unit | undefined =>
  s.units.find(u => u.type === 'castle');

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** distance between unit edges */
export const edgeDist = (a: Unit, b: Unit) =>
  dist(a, b) - UNIT_DEFS[a.type].radius - UNIT_DEFS[b.type].radius;

export const pushEvent = (s: GameState, e: GameState['events'][number]) => {
  if (s.events.length < 400) s.events.push(e);
};
