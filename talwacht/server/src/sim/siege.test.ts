import { describe, expect, it } from 'vitest';
import { cellOf, MAPS, type GameState, type Unit } from '@talwacht/shared';
import { createGame, newStructure, terrainOf, structAtCell } from './state';
import { followPath } from './flowfield';
import { spawnTestudo, siegeTick } from './siege';
import { combatTick, damage, fireShell, shellTick, cleanup } from './combat';
import { tickMovement, spawnEnemy } from './movement';
import { towerTick } from './towers';
import { trapTick } from './traps';
import { squadTick, spawnSquad, setOrder } from './squads';
import { indexUnits } from './units';
import './towers'; import './traps'; import './siege';

const map = MAPS.gruental;
const fresh = () => createGame('gruental', 'normal', 1, [], []);
const W = cellOf(map.keep.x, map.keep.y - 160); // wall row in front of the keep
const wx = (W.cx + 0.5) * 4, wy = (W.cy + 0.5) * 4;
function wallRow(s: GameState, gateAtMid = false) {
  const t = terrainOf(s);
  for (let cx = 0; cx < t.cw; cx++) if (t.kind[W.cy * t.cw + cx] !== 5) {
    const st = newStructure(s, 'wall', cx, W.cy, 0, true);
    st.level = 2; st.hp = st.maxHp = 900;
  }
  if (gateAtMid) { // the gate goes where the enemy route meets the wall
    const hit = crossing(s);
    s.structs.splice(s.structs.indexOf(structAtCell(s, hit, W.cy)!), 1); s.sRev++;
    newStructure(s, 'gate', hit, W.cy, 0, true);
  }
}
/** wall cell where enemies coming down the middle meet the wall row */
const crossing = (s: GameState) => followPath(s, W.cx, W.cy - 12).find(([, y]) => y === W.cy)![0];
function run(s: GameState, sec: number) {
  for (let i = 0; i < sec * 20; i++) {
    s.time += 0.05; s.tick++; indexUnits(s);
    siegeTick(s, 0.05); squadTick(s, 0.05); combatTick(s, 0.05); towerTick(s, 0.05); trapTick(s, 0.05); shellTick(s, 0.05); tickMovement(s, 0.05); cleanup(s, 0.05);
  }
}

describe('testudo', () => {
  it('arrows from the front do at most 15 % of their normal damage to an intact testudo', () => {
    const a = fresh(), b = fresh();
    const f = spawnTestudo(a, wx, wy - 60, 0, 16, 1);
    const plain: Unit[] = [];
    for (const id of f.members) { const u = a.units.find(x => x.id === id)!; plain.push(spawnEnemy(b, 'e_shield', u.x, u.y, 0, 1)); }
    let da = 0, db = 0;
    for (let i = 0; i < 30; i++) {
      const ua = a.units.find(x => x.id === f.members[i % 16])!, ub = plain[i % 16];
      ua.facing = ub.facing = -Math.PI / 2;
      da += damage(a, ua, 11, 'pierce', { x: ua.x, y: ua.y - 30 });
      db += damage(b, ub, 11, 'pierce', { x: ub.x, y: ub.y - 30 });
    }
    expect(da).toBeLessThanOrEqual(db * 0.15 + 1e-6);
  });

  it('one catapult stone breaks the formation for 6 s', () => {
    const s = fresh();
    const f = spawnTestudo(s, wx, wy - 60, 0, 16, 1);
    const ram = s.units.find(u => u.id === f.ram)!;
    fireShell(s, 'stone', { x: wx, y: wy, z: 8 }, { x: ram.x, y: ram.y, z: 0 }, { dmg: 70, dk: 'stone', side: 'p', radius: 6, edge: 0.4, breakF: 6, ignoresShields: true });
    shellTick(s, 5);
    expect(f.broken).toBeGreaterThanOrEqual(5.9);
  });

  it('a pitch nose over the gate kills at least 30 % of a 16-shield testudo within 20 s', () => {
    const s = fresh(); wallRow(s, true);
    const gate = s.structs.find(x => x.kind === 'gate')!; gate.pitch = 1;
    const f = spawnTestudo(s, (gate.cx + 0.5) * 4, wy - 30, 0, 16, 1);
    run(s, 20);
    const alive = f.members.filter(id => s.units.some(u => u.id === id && u.hp > 0)).length;
    expect(16 - alive).toBeGreaterThanOrEqual(5);
  });
});

describe('siege', () => {
  it('a ladder team gets at least one man onto the wall walk', () => {
    const s = fresh(); wallRow(s);
    for (let i = 0; i < 4; i++) spawnEnemy(s, 'e_ladder', wx - 6 + i * 3, wy - 25, 0, 1);
    let up = false;
    for (let k = 0; k < 40 && !up; k++) { run(s, 1); up = s.units.some(u => u.side === 'e' && u.z > 0); }
    expect(up).toBe(true);
  });

  it('a siege tower cannot cross a moat', () => {
    const s = fresh(); wallRow(s);
    const t = terrainOf(s), my = W.cy - 3;
    for (let cx = 0; cx < t.cw; cx++) if (t.kind[my * t.cw + cx] !== 5) newStructure(s, 'moat', cx, my, 0, true);
    const tower = spawnEnemy(s, 'siege_tower', wx, wy - 50, 0, 1);
    run(s, 40);
    expect(tower.y).toBeLessThan(my * 4);
  });

  it('a miner brings a wall cell down after 25 s', () => {
    const s = fresh(); wallRow(s);
    const cx = crossing(s), target = structAtCell(s, cx, W.cy)!;
    const m = spawnEnemy(s, 'miner', (cx + 0.5) * 4, wy - 3.5, 0, 1); m.hp = m.maxHp = 1e6;
    run(s, 24);
    expect(s.structs.includes(target)).toBe(true);
    run(s, 1.6);
    expect(s.structs.includes(target)).toBe(false);
  });

  it('engineers nearby stop a miner', () => {
    const s = fresh(); wallRow(s);
    const cx = crossing(s), target = structAtCell(s, cx, W.cy)!, mx = (cx + 0.5) * 4;
    spawnEnemy(s, 'miner', mx, wy - 3.5, 0, 1);
    const q = spawnSquad(s, 0, 'engineer', mx, wy + 6);
    setOrder(s, q, 'hold', mx, wy + 6);
    run(s, 27);
    expect(s.structs.includes(target)).toBe(true);
  });
});
