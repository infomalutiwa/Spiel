import type { TroopType, UnitDef } from '../types';

/**
 * Troop values and their roles. Ranges are in world units, speeds before SPEED_SCALE, edge-to-edge distances.
 *
 * role        what the AI (server/src/sim/combat.ts) makes of it
 * ----------  ------------------------------------------------------------------------------------------------
 * tank        Knight. `taunt`: enemy melee units within that distance prefer to hit him (aggro). Holds the line.
 * melee       Spearman. Prefers `prefers` armor (mounted) and hits cavalry for double.
 * archer      Archer / crossbow. Long range, keeps ≥ `minRange` from melee enemies (shoot and scoot), picks the
 *             most vulnerable target (best damage multiplier, wounded first, casters / shamans first).
 * caster      Mage. Like archers, but the blast hits groups: aims at the densest cluster of enemies.
 * healer      Heals the most wounded ally within `range`, a little splash around it; stays behind the line.
 * cavalry     Fast. Dives for light targets (`prefers`) on a curved, flanking approach and charges.
 * artillery   Catapult. Cannot hit anything closer than `minRange`. Lobs a shell that flies for a while and bursts
 *             for area damage (falloff to `edge` of the damage at the rim). Aims at the best cluster – structures
 *             and siege weapons count double – and leads moving targets. Each shot costs `stone` from the owner.
 *
 *            hp    dmg  kind      range  min  cd    speed  notes
 * knight     260   28   slash     1.6    –    1.0   3.2    armor 40 heavy, taunt 7
 * archer      62   14   pierce   17      6    1.1   3.6    longest regular range, wall crown +20 %
 * spearman   165   21   spear     2.4    –    1.0   3.4    ×1.9 vs mounted
 * cavalry    220   28   charge    1.8    –    1.2   7.2    charge ×2.2 after 14 units of run-up
 * crossbow    80   42   bolt     13      5    2.6   3.2    pierces 50 % armor
 * mage        75   32   magic    12      7    2.2   3.3    blast radius 3.8
 * healer      70   –    –         9      5    1.6   3.6    heals 2.2 × power to the most wounded ally in range
 * catapult   150   95   boulder  34     12    5.5   1.8    blast 4.2, 3 stone / shot, ×2.5 vs structures, ×1.7 vs siege
 */
export const TROOPS: Record<TroopType, UnitDef> = {
  knight: {
    name: 'Ritter', hp: 260, armor: 'heavy', armorValue: 40, damage: 28, damageKind: 'slash',
    range: 1.6, speed: 3.2, cost: 100, morale: 100, cooldown: 1.0, radius: 0.9,
    role: 'tank', taunt: 7,
  },
  archer: {
    name: 'Bogenschütze', hp: 62, armor: 'light', armorValue: 4, damage: 14, damageKind: 'pierce',
    range: 17, speed: 3.6, cost: 60, morale: 70, cooldown: 1.1, radius: 0.7,
    role: 'archer', minRange: 6,
  },
  spearman: {
    name: 'Speerträger', hp: 165, armor: 'light', armorValue: 26, damage: 21, damageKind: 'spear',
    range: 2.4, speed: 3.4, cost: 70, morale: 90, cooldown: 1.0, radius: 0.8,
    role: 'melee', prefers: ['mounted'],
  },
  cavalry: {
    name: 'Reiter', hp: 220, armor: 'mounted', armorValue: 22, damage: 28, damageKind: 'charge',
    range: 1.8, speed: 7.2, cost: 130, morale: 85, cooldown: 1.2, radius: 1.1,
    prefers: ['light'], // dives for archers, mages and healers
    role: 'cavalry',
  },
  crossbowman: {
    name: 'Armbrustschütze', hp: 80, armor: 'light', armorValue: 10, damage: 42, damageKind: 'bolt',
    range: 13, speed: 3.2, cost: 110, morale: 70, cooldown: 2.6, radius: 0.75, armorPierce: 0.5,
    role: 'archer', minRange: 5,
  },
  mage: {
    name: 'Magier', hp: 75, armor: 'light', armorValue: 0, damage: 32, damageKind: 'magic',
    range: 12, speed: 3.3, cost: 140, morale: 60, cooldown: 2.2, radius: 0.7,
    special: 'aoe', areaRadius: 3.8, role: 'caster', minRange: 7,
  },
  healer: {
    name: 'Heiler', hp: 70, armor: 'light', armorValue: 2, damage: 0, damageKind: 'magic',
    range: 9, speed: 3.6, cost: 90, morale: 80, cooldown: 1.6, radius: 0.7,
    special: 'heal', areaRadius: 7, power: 16, role: 'healer', minRange: 5,
  },
  catapult: {
    name: 'Katapult', hp: 150, armor: 'siege', armorValue: 12, damage: 95, damageKind: 'boulder',
    range: 34, speed: 1.8, cost: 180, morale: 100, cooldown: 5.5, radius: 1.5,
    prefers: ['siege', 'structure'], special: 'aoe', areaRadius: 4.2,
    role: 'artillery', minRange: 12, stone: 3, shellSpeed: 17, edge: 0.45,
  },
};
