// equal-gold skirmishes: how well does each troop type do against each enemy type? (run: npx tsx server/scripts/arena.ts)
import { ENEMIES, TROOPS, UNIT_DEFS, type EnemyType, type TroopType } from '@burgwacht/shared';
import { createGame, spawnUnit, tick } from '../src/sim/index';

const GOLD = 1600;
function fight(a: TroopType, b: EnemyType, seconds = 70) {
  const s = createGame('meadow', 5);
  s.phase = 'battle'; s.spawnQueue = [{ at: 99999, type: 'footman', lane: 0 }];
  const na = Math.max(1, Math.round(GOLD / TROOPS[a].cost)), nb = Math.max(1, Math.round(GOLD / (ENEMIES[b].cost * 8)));
  const cols = 8;
  for (let i = 0; i < na; i++) { const u = spawnUnit(s, 'player', 0, a, 100 + (i % cols) * 2.6, 75 - 12 + Math.floor(i / cols) * 3 * (i % 2 ? 1 : 1)); u.order = { kind: 'idle', x: u.x, y: u.y }; }
  for (let i = 0; i < nb; i++) { const u = spawnUnit(s, 'enemy', null, b, 150 + (i % cols) * 2.6, 75 - 12 + Math.floor(i / cols) * 3); u.order = { kind: 'attackMove', x: 26, y: 75 }; }
  const hp0 = s.units.filter(u => u.side === 'player').reduce((x, u) => x + u.hp, 0);
  const ehp0 = s.units.filter(u => u.side === 'enemy').reduce((x, u) => x + u.hp, 0);
  for (let i = 0; i < seconds * 20; i++) tick(s);
  const hp = s.units.filter(u => u.side === 'player' && u.type !== 'castle').reduce((x, u) => x + u.hp, 0);
  const ehp = s.units.filter(u => u.side === 'enemy').reduce((x, u) => x + u.hp, 0);
  return { you: Math.round((hp / hp0) * 100), foe: Math.round((ehp / ehp0) * 100), na, nb };
}
const T = Object.keys(TROOPS) as TroopType[], E = Object.keys(ENEMIES) as EnemyType[];
console.log('rows: your troops (equal gold), cols: enemy types; value = % of your hp left / % of enemy hp left');
console.log('troop'.padEnd(13) + E.map(e => e.slice(0, 11).padEnd(13)).join(''));
for (const t of T) console.log(t.padEnd(13) + E.map(e => { const r = fight(t, e); return `${r.you}/${r.foe}`.padEnd(13); }).join(''));
void UNIT_DEFS;
