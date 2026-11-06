/**
 * Tower role benchmark: damage each tower type deals per resource spent in fixed scenarios.
 * `npx tsx talwacht/server/scripts/roles.ts` prints the matrix; roles.test.ts asserts the intended roles.
 */
import { cellOf, MAPS, RES_KEYS, STRUCTURES, type GameState, type StructId, type Unit } from '@talwacht/shared';
import { createGame, newStructure } from '../src/sim/state';
import { spawnTestudo, siegeTick } from '../src/sim/siege';
import { spawnEnemy } from '../src/sim/movement';
import { combatTick, shellTick } from '../src/sim/combat';
import { towerTick } from '../src/sim/towers';
import { indexUnits, rebuildHash } from '../src/sim/units';
import '../src/sim/index';

export type Scenario = 'testudo' | 'swarm' | 'heavies' | 'column' | 'trebuchet';
const HP = 1e6;

function costOf(kind: StructId, level: number) {
  const d = STRUCTURES[kind];
  let c = RES_KEYS.reduce((a, k) => a + d.cost[k], 0);
  for (let l = 1; l < level; l++) c += RES_KEYS.reduce((a, k) => a + d.up[l - 1][k], 0);
  return c;
}

export function bench(scenario: Scenario, kind: StructId, level = 1, seconds = 30): number {
  const s: GameState = createGame('gruental', 'normal', 1, [], ['ballista']);
  s.res.stone = 1e5;
  const m = MAPS.gruental, c = cellOf(m.keep.x, m.keep.y - 200);
  const tx = (c.cx + 0.5) * 4, ty = (c.cy + 0.5) * 4;
  if (kind === 'pitch') { const g = newStructure(s, 'gate', c.cx, c.cy, 0, true); g.pitch = level; }
  else { const t = newStructure(s, kind, c.cx, c.cy, 0, true); t.level = level; }
  const foes: Unit[] = [];
  const add = (u: Unit) => { u.hp = u.maxHp = HP; u.stun = 1e9; foes.push(u); return u; };
  switch (scenario) {
    case 'testudo': {
      const f = spawnTestudo(s, tx, kind === 'pitch' ? ty - 6.5 : ty - 38, 0, 16, 1);
      for (const id of [f.ram, ...f.members]) add(s.units.find(u => u.id === id)!);
      break;
    }
    case 'swarm': for (let i = 0; i < 40; i++) add(spawnEnemy(s, 'e_raider', tx - 6 + (i % 8) * 1.6, ty - 28 - Math.floor(i / 8) * 1.6, 0, 1)); break;
    case 'heavies': for (let i = 0; i < 8; i++) add(spawnEnemy(s, 'e_soldier', tx - 7 + i * 2, ty - 30, 0, 1)); break;
    case 'column': for (let i = 0; i < 20; i++) add(spawnEnemy(s, 'e_soldier', tx, ty - 15 - i * 2, 0, 1)); break;
    case 'trebuchet': add(spawnEnemy(s, 'trebuchet', tx, ty - 108, 0, 1)); break;
  }
  for (let i = 0; i < seconds * 20; i++) {
    s.time += 0.05; s.tick++;
    indexUnits(s); rebuildHash(s);
    siegeTick(s, 0.05); towerTick(s, 0.05); shellTick(s, 0.05); combatTick(s, 0.05);
  }
  const dmg = foes.reduce((a, u) => a + (HP - u.hp), 0);
  return dmg / costOf(kind, level);
}

if (process.argv[1]?.endsWith('roles.ts')) {
  const towers: [StructId, number][] = [['tower_bow', 1], ['tower_xbow', 1], ['ballista', 1], ['tower_catapult', 1], ['tower_catapult', 2], ['pitch', 1]];
  const scen: Scenario[] = ['testudo', 'swarm', 'heavies', 'column', 'trebuchet'];
  console.log('dmg per resource (30 s)'.padEnd(22) + scen.map(x => x.padStart(10)).join(''));
  for (const [k, l] of towers) console.log(`${k} L${l}`.padEnd(22) + scen.map(x => bench(x, k, l).toFixed(2).padStart(10)).join(''));
}
