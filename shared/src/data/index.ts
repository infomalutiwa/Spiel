import type { UnitDef, UnitType } from '../types';
import { TROOPS } from './troops';
import { ENEMIES, CASTLE_DEF } from './enemies';
import { BUILDINGS, STRUCTURES } from './structures';

export * from './counters';
export * from './troops';
export * from './enemies';
export * from './waves';
export * from './maps';
export * from './structures';
export * from './squads';
export * from './economy';
export * from './upgrades';

export const UNIT_DEFS: Record<UnitType, UnitDef> = { ...TROOPS, ...ENEMIES, ...STRUCTURES, ...BUILDINGS, castle: CASTLE_DEF };
export const TROOP_ORDER = Object.keys(TROOPS) as (keyof typeof TROOPS)[];
