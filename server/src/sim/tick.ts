import type { GameState } from '@burgwacht/shared';
import { stepAbilities } from './abilities';
import { stepCombat } from './combat';
import { separate, stepMovement } from './movement';
import { TICK_DT } from './state';
import { stepWaves } from './waves';

export function tick(s: GameState, dt = TICK_DT): void {
  if (s.phase === 'won' || s.phase === 'lost') return;
  s.tick++;
  s.time += dt;
  stepWaves(s, dt);
  if (s.phase === 'battle') {
    stepAbilities(s, dt);
    stepMovement(s, dt);
    stepCombat(s, dt);
    separate(s);
  }
}
