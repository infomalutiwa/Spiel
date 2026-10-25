import { createGame, tick, applyCommand } from '../src/sim/index';
import { botBuy, botAbilities, botFortify, botRepair } from '../src/sim/bot';
import { MAPS, type TroopType } from '@burgwacht/shared';

const mixes: Record<string, TroopType[]> = {
  mixed: ['archer', 'knight', 'catapult', 'spearman', 'healer', 'crossbowman', 'cavalry', 'mage'],
  melee: ['knight', 'archer', 'spearman', 'knight', 'healer', 'catapult'],
  ranged: ['archer', 'crossbowman', 'catapult', 'knight', 'mage', 'healer', 'archer', 'spearman'],
};
const mapId = process.argv[2] ?? 'meadow';
if (process.argv[3]) MAPS[mapId].waveScale = Number(process.argv[3]);
const only = process.argv[4];
for (const smart of [false, true]) for (const [name, mix] of Object.entries(mixes)) {
  if (only && only !== name) continue;
  const s = createGame(mapId, 7);
  let line = `${mapId} ${smart ? 'abilities' : 'passive  '} ${name.padEnd(7)}: `, last = -1;
  for (let i = 0; i < 20 * 60 * 25 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    if (s.phase === 'prep' && s.wave !== last) {
      last = s.wave;
      if (smart) botFortify(s, 'troops');
      botBuy(s, 0, mix); botBuy(s, 1, mix);
      if (smart) botFortify(s, 'walls');
      for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true });
      line += `${s.units.filter(u => u.side === 'player' && u.owner !== null).length}u/${Math.round(s.units.filter(u => u.slot >= 0).reduce((a, u) => a + u.hp, 0) / 100)}w `;
    }
    tick(s);
    if (smart && i % 20 === 0 && s.phase === 'battle') { botAbilities(s); botRepair(s); }
  }
  console.log(line, '->', s.phase === 'won' ? 'WON' : `lost in wave ${s.wave + 1}`, `keep ${Math.round(s.units[0].hp)}/${s.units[0].maxHp} zones ${s.zones.map(z => z.owner[0]).join('')}`, `${Math.round(s.time)}s`);
}

