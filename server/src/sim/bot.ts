import type { GameState, PlayerId, TroopType } from '@burgwacht/shared';
import { MAPS, TROOPS } from '@burgwacht/shared';
import { applyCommand } from './orders';
import { castAbility } from './abilities';

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

/** a decent human-ish helper: arrow rain on the densest enemy clump, rally when the army is hurt (call about once a second) */
export function botAbilities(s: GameState): void {
  const enemies = s.units.filter(u => u.side === 'enemy' && u.hp > 0);
  if (enemies.length >= 8) {
    let best: { x: number; y: number } | undefined, bestN = 0;
    for (const e of enemies.filter((_, i) => i % 3 === 0)) {
      const n = enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 7).length;
      if (n > bestN) { bestN = n; best = e; }
    }
    if (best && bestN >= 8) castAbility(s, 0, 'arrowRain', best.x, best.y);
  }
  for (const p of [0, 1] as PlayerId[]) {
    const mine = s.units.filter(u => u.owner === p && u.type !== 'castle' && u.hp > 0);
    const hurt = mine.filter(u => u.hp < u.maxHp * 0.6);
    if (mine.length >= 8 && hurt.length > mine.length * 0.3) {
      const cx = hurt.reduce((a, u) => a + u.x, 0) / hurt.length, cy = hurt.reduce((a, u) => a + u.y, 0) / hurt.length;
      castAbility(s, p, 'rally', cx, cy);
    }
  }
}
