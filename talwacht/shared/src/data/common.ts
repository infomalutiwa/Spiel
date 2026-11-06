export interface Res { wood: number; stone: number; food: number; gold: number }
export const RES_KEYS = ['wood', 'stone', 'food', 'gold'] as const;
export const res = (wood = 0, stone = 0, food = 0, gold = 0): Res => ({ wood, stone, food, gold });

/** damage kinds; armor reduces all but fire, stone and siege by 10/(10+armor) */
export type DmgKind = 'slash' | 'pierce' | 'spear' | 'bolt' | 'charge' | 'stone' | 'fire' | 'siege';
export type PlayerId = 0 | 1;
export type Difficulty = 'easy' | 'normal' | 'hard';
