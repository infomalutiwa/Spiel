import type { TroopType, UnitDef } from '../types';

export const TROOPS: Record<TroopType, UnitDef> = {
  knight: {
    name: 'Ritter', hp: 220, armor: 'heavy', armorValue: 40, damage: 22, damageKind: 'slash',
    range: 1.6, speed: 3.2, cost: 100, morale: 100, cooldown: 1.0, radius: 0.9,
  },
  archer: {
    name: 'Bogenschütze', hp: 62, armor: 'light', armorValue: 4, damage: 14, damageKind: 'pierce',
    range: 17, speed: 3.6, cost: 60, morale: 70, cooldown: 1.1, radius: 0.7,
  },
  spearman: {
    name: 'Speerträger', hp: 150, armor: 'light', armorValue: 22, damage: 17, damageKind: 'spear',
    range: 2.4, speed: 3.4, cost: 70, morale: 90, cooldown: 1.0, radius: 0.8,
  },
  cavalry: {
    name: 'Reiter', hp: 210, armor: 'mounted', armorValue: 22, damage: 24, damageKind: 'charge',
    range: 1.8, speed: 7.2, cost: 130, morale: 85, cooldown: 1.2, radius: 1.1,
    prefers: ['light'], // dives for archers, mages and healers
  },
  crossbowman: {
    name: 'Armbrustschütze', hp: 80, armor: 'light', armorValue: 10, damage: 42, damageKind: 'bolt',
    range: 13, speed: 3.2, cost: 110, morale: 70, cooldown: 2.6, radius: 0.75, armorPierce: 0.5,
  },
  mage: {
    name: 'Magier', hp: 75, armor: 'light', armorValue: 0, damage: 32, damageKind: 'magic',
    range: 12, speed: 3.3, cost: 140, morale: 60, cooldown: 2.2, radius: 0.7,
    special: 'aoe', areaRadius: 3.8,
  },
  healer: {
    name: 'Heiler', hp: 70, armor: 'light', armorValue: 2, damage: 0, damageKind: 'magic',
    range: 9, speed: 3.6, cost: 90, morale: 80, cooldown: 1.6, radius: 0.7,
    special: 'heal', areaRadius: 7, power: 16,
  },
  catapult: {
    name: 'Katapult', hp: 150, armor: 'siege', armorValue: 12, damage: 60, damageKind: 'siege',
    range: 22, speed: 1.8, cost: 180, morale: 100, cooldown: 4.5, radius: 1.5,
    prefers: ['siege', 'structure'], special: 'aoe', areaRadius: 2.6,
  },
};
