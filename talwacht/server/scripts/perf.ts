import { cellOf, MAPS } from '@talwacht/shared';
import { createGame, terrainOf, applyCommand, tick } from '../src/sim/index';
const map = MAPS.gruental;
const s = createGame('gruental', 'normal', 3, [], []), t = terrainOf(s);
const row = cellOf(0, map.keep.y - 44).cy, cells: [number, number][] = [];
for (let cx = 0; cx < t.cw; cx++) if (t.kind[row * t.cw + cx] !== 5) cells.push([cx, row]);
applyCommand(s, 0, { c: 'build', kind: 'wall', cells });
const t0 = performance.now(); let last = t0;
for (let i = 0; i < 10200; i++) { tick(s); if (i % 2000 === 0) { const n = performance.now(); console.log(i, (n - last).toFixed(0) + 'ms', 'units', s.units.length, 'wave', s.wave); last = n; } }
console.log('total', (performance.now() - t0).toFixed(0), 'ms', 'kills', s.kills, s.phase);
