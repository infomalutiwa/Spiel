import { describe, expect, it } from 'vitest';
import { K, MAP_ORDER, type StructId } from '@talwacht/shared';
import { createGame, terrainOf } from './state';
import { starterBase } from './starter';
import { applyCommand } from './commands';
import { tick } from './tick';

describe('starter base', () => {
  for (const id of MAP_ORDER) it(`${id}: wall with gate and towers, barracks, range, houses and a manned wall`, () => {
    const s = createGame(id, 'normal', 7, [], []);
    starterBase(s);
    const n = (k: StructId) => s.structs.filter(x => x.kind === k).length;
    expect(n('gate')).toBe(1);
    expect(n('tower_bow')).toBeGreaterThanOrEqual(2);
    // the curtain closes the valley: no gap in the row, rock (or the map edge) beyond both ends
    const gate = s.structs.find(x => x.kind === 'gate')!, row = s.structs.filter(x => x.cy === gate.cy && ['wall', 'gate', 'tower_bow'].includes(x.kind)).map(x => x.cx).sort((a, b) => a - b);
    expect(row.length).toBe(row[row.length - 1] - row[0] + 1);
    expect(row.length).toBeGreaterThanOrEqual(20);
    const t = terrainOf(s);
    for (const x of [row[0] - 1, row[row.length - 1] + 1]) expect(x < 0 || x >= t.cw || t.kind[gate.cy * t.cw + x] === K.cliff).toBe(true);
    expect(n('barracks')).toBe(1);
    expect(n('range')).toBe(1);
    expect(n('house')).toBe(2);
    expect(s.squads.length).toBe(4);
    for (let i = 0; i < 20 * 30; i++) tick(s); // archers climb the wall within half a minute
    const archers = s.units.filter(u => u.type === 'archer');
    expect(archers.filter(u => u.z > 0).length).toBeGreaterThanOrEqual(archers.length * 0.75);
  });

  it('players can build, upgrade and repair on top of it', () => {
    const s = createGame('gruental', 'normal', 7, [], []);
    starterBase(s);
    const wall = s.structs.find(x => x.kind === 'wall')!;
    expect(applyCommand(s, 0, { c: 'upgrade', id: wall.id }).ok).toBe(true);
    for (let i = 0; i < 20 * 20; i++) tick(s);
    expect(wall.level).toBe(3);
    wall.hp = wall.maxHp * 0.4;
    expect(applyCommand(s, 1, { c: 'repair', id: wall.id }).ok).toBe(true);
    for (let i = 0; i < 20 * 60; i++) tick(s);
    expect(wall.hp).toBeGreaterThan(wall.maxHp * 0.95);
  });
});
