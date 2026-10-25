import type { GameState, PlayerId, TroopType } from '@burgwacht/shared';
import { TROOPS } from '@burgwacht/shared';
import { applyCommand } from './orders';

/** simple scripted player used by balance tests: spends all gold on a fixed mix and holds a block in front of the castle */
export function botBuy(s: GameState, player: PlayerId, mix: TroopType[], x = 44, spread = 14): number {
  let bought = 0, i = 0;
  const me = s.players[player];
  for (let guard = 0; guard < 200; guard++) {
    const t = mix[i++ % mix.length];
    if (TROOPS[t].cost > me.gold) {
      if (mix.every(m => TROOPS[m].cost > me.gold)) break;
      continue;
    }
    const col = bought % 4, row = Math.floor(bought / 4);
    const y = 45 + (player === 0 ? -1 : 1) * (6 + row * 3.4) + (col - 1.5) * 0;
    const px = x + col * 3.2 + (player === 0 ? 0 : 1.2);
    if (applyCommand(s, player, { c: 'buy', troop: t, x: px, y: Math.min(80, Math.max(10, y)) }).ok) bought++;
    else break;
  }
  void spread;
  return bought;
}
