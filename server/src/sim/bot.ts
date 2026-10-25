import type { GameState, PlayerId, TroopType } from '@burgwacht/shared';
import { MAPS, TROOPS } from '@burgwacht/shared';
import { applyCommand } from './orders';

/** simple scripted player used by balance tests: spends all gold on a fixed mix and holds a block in front of the castle */
export function botBuy(s: GameState, player: PlayerId, mix: TroopType[], x?: number): number {
  const z = MAPS[s.mapId].placeZone, cy = (z.y0 + z.y1) / 2;
  const x0 = x ?? z.x0 + 6;
  let bought = 0, i = 0;
  const me = s.players[player];
  for (let guard = 0; guard < 600; guard++) {
    const t = mix[i++ % mix.length];
    if (TROOPS[t].cost > me.gold) {
      if (mix.every(m => TROOPS[m].cost > me.gold)) break;
      continue;
    }
    // blocks of 8 columns; players take the north / south half of the zone
    const col = bought % 8, row = Math.floor(bought / 8);
    const y = cy + (player === 0 ? -1 : 1) * (6 + row * 3.4);
    const px = x0 + col * 3.2 + (player === 0 ? 0 : 1.2);
    if (applyCommand(s, player, { c: 'buy', troop: t, x: px, y: Math.min(z.y1, Math.max(z.y0, y)) }).ok) bought++;
    else break;
  }
  return bought;
}
