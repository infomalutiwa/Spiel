import type { StructureType, UnitDef } from '../types';

/** walls, gates and towers are units that never move; the enemy has to break them */
export const STRUCTURES: Record<StructureType, UnitDef> = {
  wall: {
    name: 'Mauer', hp: 1100, armor: 'structure', armorValue: 35, damage: 0, damageKind: 'pierce',
    range: 0, speed: 0.01, cost: 0, morale: 100, cooldown: 1, radius: 3.4,
  },
  gate: {
    name: 'Tor', hp: 1500, armor: 'structure', armorValue: 30, damage: 0, damageKind: 'pierce',
    range: 0, speed: 0.01, cost: 0, morale: 100, cooldown: 1, radius: 4.6,
  },
  tower: {
    name: 'Turm', hp: 1900, armor: 'structure', armorValue: 40, damage: 7, damageKind: 'pierce',
    range: 16, speed: 0.01, cost: 0, morale: 100, cooldown: 1, radius: 4.0,
  },
};

export const STRUCTURE_TYPES = Object.keys(STRUCTURES) as StructureType[];
export const isStructureType = (t: string): t is StructureType => t === 'wall' || t === 'gate' || t === 'tower';
/** structures and the keep never move and are never pushed around */
export const isFixedType = (t: string) => t === 'castle' || isStructureType(t);

export const MAX_WALL_LEVEL = 3;
/** gold to go from level 1→2 and 2→3 */
export const UPGRADE_COST: Record<StructureType, [number, number]> = { wall: [180, 360], gate: [260, 480], tower: [320, 600] };
/** gold to repair from 0 % to full (scaled by what is missing) */
export const REPAIR_COST: Record<StructureType, number> = { wall: 140, gate: 220, tower: 260 };
export const REBUILD_COST: Record<StructureType, number> = { wall: 260, gate: 420, tower: 480 };
export const levelHpMul = (level: number) => 1 + 0.7 * (level - 1);
export const levelArmorBonus = (level: number) => 12 * (level - 1);
