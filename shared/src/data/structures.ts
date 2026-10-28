import type { BuildingType, StructureType, UnitDef } from '../types';

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

/** buildings: towers shoot, the mine pays, the infirmary mends (see server/src/sim/buildings.ts) */
export const BUILDINGS: Record<BuildingType, UnitDef> = {
  bowtower: {
    name: 'Bogenturm', hp: 900, armor: 'structure', armorValue: 25, damage: 13, damageKind: 'pierce',
    range: 26, speed: 0.01, cost: 0, morale: 100, cooldown: 0.9, radius: 2.6, role: 'archer',
  },
  ballista: {
    name: 'Ballista', hp: 650, armor: 'structure', armorValue: 18, damage: 70, damageKind: 'pierce', armorPierce: 0.5,
    range: 38, speed: 0.01, cost: 0, morale: 100, cooldown: 3.6, radius: 2.4, role: 'archer', prefers: ['heavy', 'mounted'],
  },
  goldmine: {
    name: 'Goldmine', hp: 700, armor: 'structure', armorValue: 20, damage: 0, damageKind: 'pierce',
    range: 0, speed: 0.01, cost: 0, morale: 100, cooldown: 1, radius: 2.8,
  },
  infirmary: {
    name: 'Lazarett', hp: 800, armor: 'structure', armorValue: 20, damage: 0, damageKind: 'pierce',
    range: 0, speed: 0.01, cost: 0, morale: 100, cooldown: 1, radius: 2.8,
  },
};
export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];
export const isBuildingType = (t: string): t is BuildingType => t in BUILDINGS;
/** gold to put it up, and to go from level 1→2 and 2→3; at most `max` of a kind per player */
export const BUILD_INFO: Record<BuildingType, { gold: number; up: [number, number]; max: number; blurb: string }> = {
  bowtower: { gold: 260, up: [320, 520], max: 6, blurb: 'Schießt Pfeile auf alles in 26 Metern Reichweite.' },
  ballista: { gold: 420, up: [480, 760], max: 3, blurb: 'Ein mächtiger Bolzen alle paar Sekunden, durchschlägt Rüstung, 38 Meter weit.' },
  goldmine: { gold: 320, up: [300, 520], max: 3, blurb: 'Bringt dir ständig Gold – je höher die Stufe, desto mehr.' },
  infirmary: { gold: 380, up: [420, 700], max: 2, blurb: 'Heilt Truppen in der Nähe, auch im Kampf.' },
};
/** gold per second a goldmine pays at a level */
export const MINE_INCOME = [0.9, 1.6, 2.5];
/** health per second (fraction of max) the infirmary restores at a level, and its reach */
export const INFIRMARY_HEAL = [0.02, 0.035, 0.05];
export const INFIRMARY_RADIUS = 15;
export const MAX_BUILDING_LEVEL = 3;
export const BUILDING_SPACING = 6;

export const STRUCTURE_TYPES = Object.keys(STRUCTURES) as StructureType[];
export const isWallType = (t: string): t is StructureType => t === 'wall' || t === 'gate' || t === 'tower';
/** walls, gates, towers and buildings: fixed, hard targets that never count as a zone's defenders */
export const isStructureType = (t: string): t is StructureType | BuildingType => isWallType(t) || isBuildingType(t);
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

/** seconds before a wall piece can be repaired again during a battle (preparation: no limit) */
export const REPAIR_COOLDOWN = 30;
