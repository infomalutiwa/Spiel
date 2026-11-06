import { starsFor, type GameState } from '@talwacht/shared';
import { economyTick } from './economy';
import { buildTick } from './build';
import { allClear, wavesTick } from './waves';
import { siegeTick } from './siege';
import { squadTick, trainTick } from './squads';
import { cleanup, combatTick, shellTick } from './combat';
import { towerTick } from './towers';
import { trapTick } from './traps';
import { tickMovement } from './movement';
import { indexUnits } from './units';
import { structById } from './state';

export const DT = 0.05;

export function tick(s: GameState) {
  if (s.phase !== 'play') return;
  const dt = DT;
  s.tick++; s.time += dt;
  indexUnits(s);
  economyTick(s, dt);
  buildTick(s, dt);
  wavesTick(s, dt);
  siegeTick(s, dt);
  trainTick(s, dt);
  squadTick(s, dt);
  combatTick(s, dt);
  towerTick(s, dt);
  trapTick(s, dt);
  shellTick(s, dt);
  tickMovement(s, dt);
  cleanup(s, dt);
  s.pings = s.pings.filter(p => s.time - p.t < 8);

  const keep = structById(s, s.keepId);
  const frac = keep ? Math.max(0, keep.hp / keep.maxHp) : 0;
  s.keepMinFrac = Math.min(s.keepMinFrac, frac);
  if (frac <= 0) end(s, false);
  else if (allClear(s)) end(s, true);
}

function end(s: GameState, won: boolean) {
  s.phase = won ? 'won' : 'lost';
  s.result = { won, wave: s.wave, keepMinFrac: s.keepMinFrac, stars: starsFor({ won, keepMinFrac: s.keepMinFrac, diff: s.diff }), kills: s.kills, dmgBy: { ...s.dmgBy } };
  s.events.push({ k: 'toast', text: won ? '🏆 Das Tal ist gehalten!' : '💀 Der Bergfried ist gefallen …', warn: !won });
}
