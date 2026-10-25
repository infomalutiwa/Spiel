import type { GameState, PlayerId, Unit, UnitType } from '@burgwacht/shared';
import { createGame, spawnUnit } from './state';
import { tick } from './tick';

/** a game already in the battle phase with no enemies queued, for focused tests */
export function battle(seed = 1): GameState {
  const s = createGame('meadow', seed);
  s.phase = 'battle';
  s.spawnQueue = [{ at: 9999, type: 'footman', lane: 1 }];
  return s;
}
export const mine = (s: GameState, t: UnitType, x: number, y: number, o: PlayerId = 0): Unit =>
  spawnUnit(s, 'player', o, t, x, y);
export const foe = (s: GameState, t: UnitType, x: number, y: number): Unit =>
  spawnUnit(s, 'enemy', null, t, x, y);
export const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) tick(s);
};
