import type { TroopType } from '../types';
import { TROOPS } from './troops';

/** troops are bought, placed and ordered as squads */
export const SQUAD_SIZE: Record<TroopType, number> = {
  archer: 10, knight: 6, spearman: 8, cavalry: 5, crossbowman: 6, mage: 4, healer: 3, catapult: 1,
};
/** army slots one soldier uses up (a catapult is worth three men) */
export const SLOT_WEIGHT: Record<TroopType, number> = {
  archer: 1, knight: 1, spearman: 1, cavalry: 1, crossbowman: 1, mage: 1, healer: 1, catapult: 3,
};
/** army limit of a level-1 barracks, in slots (see BARRACKS in economy.ts for the higher levels) */
export const MAX_ARMY = 30;
/** buying in squads is a little cheaper than buying single soldiers */
export const unitPrice = (t: TroopType) => Math.round((TROOPS[t].cost * (t === 'catapult' ? 1 : 0.85)) / 5) * 5;
export const squadCost = (t: TroopType) => unitPrice(t) * SQUAD_SIZE[t];
export const squadSlots = (t: TroopType) => SQUAD_SIZE[t] * SLOT_WEIGHT[t];
/** ranged troops that may stand on a wall */
export const canManWalls = (t: TroopType) => TROOPS[t].range >= 8 && t !== 'catapult';

/** seconds the barracks needs to train one squad (level 1) */
export const TRAIN_SECONDS: Record<TroopType, number> = {
  archer: 9, knight: 11, spearman: 9, cavalry: 12, crossbowman: 11, mage: 12, healer: 8, catapult: 14,
};
/** squads a barracks can have in its queue at once */
export const QUEUE_MAX = 4;
/** seconds the attackers stay put in a zone they just captured (the defenders' breather) */
export const ZONE_FALL_PAUSE = 22;
/** training runs this much faster while a zone has just fallen (emergency levy) */
export const LEVY_RATE = 2.5;
