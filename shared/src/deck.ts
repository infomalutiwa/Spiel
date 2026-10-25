import { SLOT_WEIGHT, canManWalls } from './data/squads';
import { TROOPS } from './data/troops';
import { isFixedType, isStructureType } from './data/structures';
import type { MapDef, TroopType, UnitType } from './types';

/** how far from a wall's centre line a unit counts as standing on it */
export const DECK_REACH = 3.2;
/** ranged defenders on a wall shoot this much further and hit this much harder */
export const DECK_RANGE = 1.3;
export const DECK_DAMAGE = 1.1;
export const DECK_COVER = 0.75;
/** how high the wall crown is above the ground (render only) */
export const DECK_HEIGHT = 3.3;
export const TOWER_HEIGHT = 6.4;
export const deckHeight = (t: UnitType) => (t === 'tower' ? TOWER_HEIGHT : t === 'wall' ? DECK_HEIGHT : 0);

export { isFixedType, isStructureType };

/** which barrier's wall line is this x on (|dx| < reach), if any */
export function wallLineAt(map: MapDef, x: number, reach = DECK_REACH + 0.6): number {
  return map.barriers.findIndex(b => Math.abs(x - b.x) < reach);
}

interface Struct { id: number; type: UnitType; x: number; y: number; hp: number }

/** the wall piece (not a gate) a point stands on, if any */
export function deckAt<T extends Struct>(structs: Iterable<T>, x: number, y: number): T | undefined {
  let best: T | undefined, bd = Infinity;
  for (const s of structs) {
    if (s.hp <= 0 || (s.type !== 'wall' && s.type !== 'tower')) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    const reach = s.type === 'tower' ? 4.2 : 3.4;
    if (d < reach + 0.5 && d < bd && Math.abs(s.x - x) < DECK_REACH) { best = s; bd = d; }
  }
  return best;
}

export const armySlots = (t: TroopType) => SLOT_WEIGHT[t];
export const rangedOnWall = (t: UnitType) => t in TROOPS && canManWalls(t as TroopType);
