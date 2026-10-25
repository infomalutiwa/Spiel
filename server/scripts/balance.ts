import { createGame, tick, applyCommand } from '../src/sim/index';
import { botBuy, botAbilities } from '../src/sim/bot';
import { MAPS, type TroopType } from '@burgwacht/shared';

const mixes: Record<string, TroopType[]> = {
  mixed: ['knight', 'archer', 'spearman', 'healer', 'archer', 'mage', 'cavalry', 'crossbowman'],
  melee: ['knight', 'knight', 'archer', 'archer', 'healer', 'spearman'],
  ranged: ['archer', 'archer', 'crossbowman', 'knight', 'mage', 'healer', 'spearman', 'cavalry'],
};
const mapId = process.argv[2] ?? 'meadow';
for (const smart of [false, true]) for (const [name, mix] of Object.entries(mixes)) {
  const s = createGame(mapId, 7);
  let line = `${mapId} ${smart ? 'abilities' : 'passive  '} ${name.padEnd(7)}: `, last = -1;
  for (let i = 0; i < 20 * 60 * 25 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    if (s.phase === 'prep' && s.wave !== last) {
      last = s.wave;
      botBuy(s, 0, mix); botBuy(s, 1, mix);
      for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true });
      line += `${s.units.filter(u => u.side === 'player' && u.type !== 'castle').length} `;
    }
    tick(s);
    if (smart && i % 20 === 0 && s.phase === 'battle') botAbilities(s);
  }
  console.log(line, '->', s.phase === 'won' ? 'WON' : `lost in wave ${s.wave + 1}`, `castle ${Math.round(s.units[0].hp)}/${s.units[0].maxHp}`, `${Math.round(s.time)}s`);
}
void MAPS;
