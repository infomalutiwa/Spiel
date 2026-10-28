/**
 * Balance matrix: scripted players (see src/sim/bot.ts) fight the whole campaign with a given army.
 *
 *   npx tsx server/scripts/balance.ts [map] [armies] [--waves N] [--plain]
 *
 *   map     meadow | forest | valley          (default meadow)
 *   armies  comma list of: none, mono:<troop>, mix:<name>, all    (default: all)
 *   --waves stop after N waves (default: the whole campaign)
 *   --plain no abilities / upgrades / repairs: only what the first purchase gives
 *
 * Prints one row per army: waves survived, result, castle health and the gold / stone / gems it still holds.
 * Targets: every mono army has a window where it is useful, no mono army wins everything, mixes win.
 */
import { createGame, tick, applyCommand } from '../src/sim/index';
import { botBuy, botAbilities, botFortify, botRepair, botEconomy } from '../src/sim/bot';
import { MAPS, TROOP_ORDER, WAVES, type TroopType } from '@burgwacht/shared';

const MIXES: Record<string, TroopType[]> = {
  mixed: ['archer', 'knight', 'catapult', 'spearman', 'healer', 'crossbowman', 'cavalry', 'mage'],
  melee: ['knight', 'spearman', 'knight', 'cavalry', 'healer', 'spearman'],
  ranged: ['archer', 'crossbowman', 'catapult', 'mage', 'healer', 'archer'],
  wall: ['archer', 'crossbowman', 'knight', 'healer', 'archer', 'mage'],
};
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flag = (n: string) => process.argv.includes(`--${n}`);
const waveLimit = (() => { const i = process.argv.indexOf('--waves'); return i >= 0 ? Number(process.argv[i + 1]) : WAVES.length; })();
const mapId = args[0] && MAPS[args[0]] ? args[0] : 'meadow';
const want = (args.find(a => !MAPS[a]) ?? 'all').split(',');
const smart = !flag('plain');

const armies: [string, TroopType[]][] = [['none', []]];
for (const t of TROOP_ORDER) armies.push([`mono:${t}`, [t]]);
for (const [n, m] of Object.entries(MIXES)) armies.push([`mix:${n}`, m]);

function run(name: string, mix: TroopType[]) {
  const s = createGame(mapId, 7);
  let last = -1, tooLong = false;
  for (let i = 0; i < 20 * 60 * 90 && s.phase !== 'won' && s.phase !== 'lost' && s.wave < waveLimit; i++) {
    if (s.phase === 'prep' && s.wave !== last) {
      last = s.wave;
      if (mix.length) {
        if (smart) { botEconomy(s, mix); botFortify(s, 'troops'); }
        botBuy(s, 0, mix); botBuy(s, 1, mix);
        if (smart) botFortify(s, 'walls');
      }
      for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true });
    }
    tick(s);
    if (smart && mix.length && i % 20 === 0 && s.phase === 'battle') { botAbilities(s); botRepair(s); }
    if (s.phase === 'battle' && s.battleTime > 420) { tooLong = true; break; } // a wave that never ends is a bug
  }
  const keep = s.units.find(u => u.type === 'castle')!;
  const res = tooLong ? `STAU in Welle ${s.wave + 1}` : s.phase === 'won' ? 'GEWONNEN' : s.wave >= waveLimit && s.phase !== 'lost' ? `bis Welle ${waveLimit} gehalten` : `verloren in Welle ${s.wave + 1}`;
  const p = s.players[0];
  console.log(`${mapId.padEnd(7)} ${name.padEnd(18)} ${res.padEnd(24)} Burg ${String(Math.round(keep.hp)).padStart(4)}/${keep.maxHp}  Gold ${String(Math.round(p.gold)).padStart(5)} Stein ${String(Math.round(p.stone)).padStart(3)} 💎${p.gems}  Kaserne ${p.barracks}  ${Math.round(s.time)}s`);
}

for (const [name, mix] of armies) {
  if (!want.includes('all') && !want.includes(name)) continue;
  run(name, mix);
}
