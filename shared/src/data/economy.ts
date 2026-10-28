import type { TroopType } from '../types';

/**
 * The whole economy in one place. Every player has their OWN purse: gold, stone and gems are never shared.
 *
 *  gold   – buys squads, repairs, wall upgrades. Comes from kills (80 % of the enemy's value) and every cleared wave.
 *  stone  – catapult ammunition (a shot costs STONE_PER_SHOT). Comes from every cleared wave; gold can be traded for more.
 *  gems   – rare. Pay for troop upgrades (level 2 / 3 + branch) and the higher barracks levels. A few per wave,
 *           more for boss waves, so every upgrade is a decision.
 */
export const START_GOLD = 1500;
export const START_STONE = 12;
export const START_GEMS = 0;
export const PREP_TIME = 40;

/** gold both players receive after clearing wave index w */
export const waveReward = (w: number) => 460 + w * 60;
/** stone each player receives after clearing wave index w */
export const stoneReward = (w: number) => 8 + Math.floor(w * 0.8);
/** boss waves are the 5th, 10th, 15th … wave */
export const isBossWave = (w: number) => (w + 1) % 5 === 0;
/** gems each player receives after clearing wave index w (`total` = number of waves in the campaign) */
export const gemReward = (w: number, total: number) => (w + 1 >= total ? 6 : isBossWave(w) ? 3 : 1);

/** stone a catapult shot uses up */
export const STONE_PER_SHOT = 3;
/** the shop sells stone in lots */
export const STONE_LOT = 10;
export const STONE_PRICE = 10; // gold per stone
export const stoneLotCost = () => STONE_LOT * STONE_PRICE;

/** barracks levels: army capacity (slots), training speed and what the upgrade INTO that level costs */
export interface BarracksLevel { cap: number; speed: number; gold: number; gems: number }
export const BARRACKS: BarracksLevel[] = [
  { cap: 30, speed: 1, gold: 0, gems: 0 },
  { cap: 40, speed: 1.25, gold: 450, gems: 0 },
  { cap: 55, speed: 1.6, gold: 800, gems: 1 },
  { cap: 75, speed: 2, gold: 1300, gems: 2 },
  { cap: 100, speed: 2.5, gold: 2000, gems: 4 },
];
export const MAX_BARRACKS = BARRACKS.length;
export const armyCap = (barracksLevel: number) => BARRACKS[Math.min(BARRACKS.length, Math.max(1, barracksLevel)) - 1].cap;

/** troop upgrades (per player and troop type): into level 2 (also picks the branch) and into level 3 */
export const TECH_COST: [{ gold: number; gems: number }, { gold: number; gems: number }] = [
  { gold: 300, gems: 3 },
  { gold: 600, gems: 5 },
];
export const MAX_TROOP_LEVEL = 3;
/** all troops of an upgraded type get tougher and hit harder; branches come on top (see upgrades.ts) */
export const LEVEL_HP = [1, 1.2, 1.45];
export const LEVEL_DMG = [1, 1.2, 1.45];
export type TroopTech = Record<TroopType, { level: number; branch: number }>;
