import { createGame, tick, applyCommand } from '../src/sim/index';
import { botBuy } from '../src/sim/bot';
import { WAVES } from '@burgwacht/shared';

const mixes: Record<string, any[]> = {
  A: ['knight', 'archer', 'spearman', 'healer', 'archer', 'mage', 'cavalry', 'crossbowman'],
  B: ['knight', 'knight', 'archer', 'archer', 'healer', 'spearman'],
};
const T0 = Date.now();
for (const [name, mix] of Object.entries(mixes)) {
  const s = createGame('meadow', 7);
  let line = `${name}: `;
  let lastWave = -1;
  for (let i = 0; i < 20 * 60 * 25 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    if (s.phase === 'prep' && s.wave !== lastWave) {
      lastWave = s.wave;
      botBuy(s, 0, mix); botBuy(s, 1, mix, 44);
      for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true });
      line += `[w${s.wave + 1} army=${s.units.filter(u => u.side === 'player' && u.type !== 'castle').length} castle=${Math.round(s.units[0].hp)}] `;
    }
    tick(s);
  }
  console.log(line, '->', s.phase, 'wave', s.wave + 1, 'castle', Math.round(s.units[0].hp), 'time', Math.round(s.time));
}
const s = createGame('meadow', 7);
for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true });
for (let i = 0; i < 20 * 600 && s.phase !== 'won' && s.phase !== 'lost'; i++) tick(s);
console.log('sim ms', Date.now() - T0);
console.log('no army ->', s.phase, 'wave', s.wave + 1);
console.log(WAVES.length);
