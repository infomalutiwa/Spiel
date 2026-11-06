import type { Difficulty } from './common';
import type { EnemyId } from './enemies';

export interface DiffDef { name: string; budget: number; res: number; waves: number; interval: number; adapt: number }
export const DIFFICULTY: Record<Difficulty, DiffDef> = {
  easy: { name: 'Leicht', budget: 0.75, res: 1.3, waves: 25, interval: 1.15, adapt: 0.5 },
  normal: { name: 'Normal', budget: 1, res: 1, waves: 25, interval: 1, adapt: 1 },
  hard: { name: 'Schwer', budget: 1.3, res: 0.9, waves: 30, interval: 0.85, adapt: 1.5 },
};

/** first wave each enemy type can appear in */
export const TECH: { id: EnemyId; wave: number }[] = [
  { id: 'e_raider', wave: 1 }, { id: 'e_soldier', wave: 2 }, { id: 'e_rider', wave: 3 }, { id: 'e_xbow', wave: 4 },
  { id: 'ram', wave: 5 }, { id: 'pioneer', wave: 6 }, { id: 'fire_archer', wave: 7 }, { id: 'e_shield', wave: 8 },
  { id: 'e_ladder', wave: 10 }, { id: 'trebuchet', wave: 12 }, { id: 'siege_tower', wave: 14 }, { id: 'miner', wave: 18 },
];
export const techAt = (id: EnemyId) => TECH.find(t => t.id === id)?.wave ?? 999;

export const BOSS_WAVES = [5, 10, 15, 20, 25, 30];
export const NIGHT_WAVES = [7, 16, 23, 28];
export const RAIN_WAVES = [12, 21, 27];

export const FIRST_WAVE_AT = 180;
export const budget = (wave: number, diff: Difficulty) => 60 * 1.16 ** (wave - 1) * DIFFICULTY[diff].budget;
/** seconds between the start of wave w and wave w+1 */
export function interval(wave: number, diff: Difficulty) {
  const base = 75 + ((wave * 37) % 36) + (BOSS_WAVES.includes(wave + 1) ? 20 : 0);
  return Math.round(base * DIFFICULTY[diff].interval);
}
