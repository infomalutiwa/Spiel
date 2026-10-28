import type { EnemyType, UnitDef } from '../types';

export const ENEMIES: Record<EnemyType, UnitDef> = {
  footman: {
    name: 'Raufbold', hp: 100, armor: 'light', armorValue: 15, damage: 12, damageKind: 'slash',
    range: 1.6, speed: 3.0, cost: 10, morale: 80, cooldown: 1.1, radius: 0.85, role: 'melee',
  },
  raider_archer: {
    name: 'Wegelagerer', hp: 55, armor: 'light', armorValue: 3, damage: 10, damageKind: 'pierce',
    range: 16, speed: 3.3, cost: 12, morale: 60, cooldown: 1.3, radius: 0.7, role: 'archer', minRange: 5,
  },
  raider_rider: {
    name: 'Plünderer', hp: 140, armor: 'mounted', armorValue: 15, damage: 18, damageKind: 'charge',
    range: 1.8, speed: 6.6, cost: 20, morale: 80, cooldown: 1.3, radius: 1.1,
    prefers: ['light'], role: 'cavalry',
  },
  ram: {
    name: 'Rammbock', hp: 320, armor: 'siege', armorValue: 30, damage: 70, damageKind: 'siege',
    range: 2.2, speed: 2.2, cost: 30, morale: 100, cooldown: 3.0, radius: 1.6,
    prefers: ['structure'], role: 'siege',
  },
  raider_catapult: {
    name: 'Wurfmaschine', hp: 130, armor: 'siege', armorValue: 10, damage: 70, damageKind: 'siege',
    range: 27, speed: 1.6, cost: 30, morale: 100, cooldown: 5.0, radius: 1.5,
    prefers: ['structure'], special: 'aoe', areaRadius: 2.4, role: 'artillery', minRange: 8, shellSpeed: 15, edge: 0.4,
  },
  shaman: {
    name: 'Schamane', hp: 90, armor: 'light', armorValue: 2, damage: 0, damageKind: 'magic',
    range: 9, speed: 3.0, cost: 25, morale: 70, cooldown: 1.5, radius: 0.75,
    special: 'buff', areaRadius: 8, power: 0.3, role: 'support',
  },
  ironguard: {
    name: 'Eisenwache', hp: 260, armor: 'heavy', armorValue: 55, damage: 18, damageKind: 'slash',
    range: 1.7, speed: 2.8, cost: 22, morale: 100, cooldown: 1.2, radius: 0.95, role: 'tank', taunt: 5,
  },
  brute: {
    name: 'Grobian', hp: 700, armor: 'heavy', armorValue: 35, damage: 40, damageKind: 'slash',
    range: 2.4, speed: 2.4, cost: 80, morale: 100, cooldown: 1.6, radius: 1.5, role: 'melee',
  },
  /** boss of the big waves */
  warlord: {
    name: 'Kriegsherr', hp: 2600, armor: 'heavy', armorValue: 50, damage: 55, damageKind: 'slash',
    range: 2.8, speed: 2.5, cost: 400, morale: 100, cooldown: 1.7, radius: 2.0, role: 'tank', taunt: 8,
  },
};

export const CASTLE_DEF: UnitDef = {
  name: 'Burg', hp: 5000, armor: 'structure', armorValue: 30, damage: 9, damageKind: 'pierce',
  range: 19, speed: 0, cost: 0, morale: 100, cooldown: 0.7, radius: 8.5,
};
