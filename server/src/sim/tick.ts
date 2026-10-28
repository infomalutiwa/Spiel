import type { GameState } from '@burgwacht/shared';
import { stepAbilities } from './abilities';
import { stepCombat } from './combat';
import { stepShells } from './artillery';
import { stepAssault } from './assault';
import { separate, stepMovement } from './movement';
import { TICK_DT } from './state';
import { stepWaves } from './waves';
import { rebuildGrid } from './grid';
import { stepTraining } from './training';
import { stepBuildings } from './buildings';
import { stepDecks, stepRoutes, stepZones } from './fortress';

export function tick(s: GameState, dt = TICK_DT): void {
  if (s.phase === 'won' || s.phase === 'lost') return;
  s.tick++;
  s.time += dt;
  stepWaves(s, dt);
  if (s.phase === 'prep' || s.phase === 'battle') { stepTraining(s, dt); stepBuildings(s, dt); }
  if (s.phase === 'battle') {
    rebuildGrid(s);
    stepDecks(s);
    for (const u of s.units) { u.px = u.x; u.py = u.y; }
    stepRoutes(s);
    stepAssault(s);
    stepAbilities(s, dt);
    stepMovement(s, dt);
    stepCombat(s, dt);
    separate(s);
    for (const u of s.units) { u.vx = u.vx * 0.5 + ((u.x - u.px) / dt) * 0.5; u.vy = u.vy * 0.5 + ((u.y - u.py) / dt) * 0.5; }
    rebuildGrid(s);
    stepShells(s, dt);
    stepZones(s, dt);
  }
}
