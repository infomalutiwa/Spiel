import type { GameState, PlayerId, TroopType } from '@burgwacht/shared';
import { MAPS, canManWalls, squadCost } from '@burgwacht/shared';
import { applyCommand } from './orders';
import { castAbility } from './abilities';

/**
 * Scripted player for balance tests. Spends all gold on squads in `mix` order and places them like a sensible human:
 * marksmen on the outer wall beside the gate, melee squads in the courtyard just behind the gate, healers and
 * catapults behind them, cavalry in reserve. The two players take the north / south side of the gate.
 */
export function botBuy(s: GameState, player: PlayerId, mix: TroopType[]): number {
  const map = MAPS[s.mapId], bar = map.barriers[0], me = s.players[player];
  const side = player === 0 ? -1 : 1;
  const used = { wall: 0, melee: 0, back: 0, reserve: 0 };
  let bought = 0, i = 0;
  for (let guard = 0; guard < 40; guard++) {
    const t = mix[i++ % mix.length];
    if (squadCost(t) > me.gold) {
      if (mix.every(m => squadCost(m) > me.gold)) break;
      continue;
    }
    let x: number, y: number;
    if (canManWalls(t)) { x = bar.x; y = bar.gateY + side * (15 + used.wall++ * 12.5); }
    else if (t === 'knight' || t === 'spearman') { x = bar.x - 9 - (used.melee % 2) * 3; y = bar.gateY + side * (4 + Math.floor(used.melee++ / 2) * 5.5); }
    else if (t === 'cavalry') { x = bar.x - 24; y = bar.gateY + side * (6 + used.reserve++ * 8); }
    else { x = bar.x - 17; y = bar.gateY + side * (7 + used.back++ * 8); } // healers, catapults
    y = Math.min(map.depth - 8, Math.max(8, y));
    if (applyCommand(s, player, { c: 'buy', troop: t, x, y }).ok) bought++;
    else if (!canManWalls(t)) continue;
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

/** preparation-phase upkeep like a careful player: refill squads, rebuild and repair, then upgrade gates and towers first */
export function botFortify(s: GameState, step: 'troops' | 'walls'): void {
  const map = MAPS[s.mapId];
  for (const p of [0, 1] as PlayerId[]) {
    if (step === 'troops') { for (const q of s.squads.filter(q => q.owner === p)) applyCommand(s, p, { c: 'refill', squad: q.id }); continue; }
    const order = map.walls.map((w, slot) => ({ w, slot })).sort((a, b) =>
      a.w.bar - b.w.bar || (a.w.kind === 'gate' ? 0 : a.w.kind === 'tower' ? 1 : 2) - (b.w.kind === 'gate' ? 0 : b.w.kind === 'tower' ? 1 : 2)
      || Math.abs(a.w.y - map.barriers[a.w.bar].gateY) - Math.abs(b.w.y - map.barriers[b.w.bar].gateY));
    for (const { slot } of order) { applyCommand(s, p, { c: 'wall', op: 'rebuild', slot }); applyCommand(s, p, { c: 'wall', op: 'repair', slot }); }
    for (let level = 0; level < 2; level++)
      for (const { slot } of order.filter(o => o.w.bar === 0 || o.w.kind !== 'wall')) applyCommand(s, p, { c: 'wall', op: 'upgrade', slot });
  }
}

/** in battle: mend the gate and towers when they are about to fall (call about once a second) */
export function botRepair(s: GameState): void {
  const map = MAPS[s.mapId];
  for (const u of s.units) {
    if (u.slot < 0 || u.hp <= 0 || u.hp > u.maxHp * 0.4 || map.walls[u.slot].kind === 'wall') continue;
    applyCommand(s, s.players[0].gold >= s.players[1].gold ? 0 : 1, { c: 'wall', op: 'repair', slot: u.slot });
  }
}
