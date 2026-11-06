import { describe, expect, it } from 'vitest';
import { MAP_ORDER, type StructId } from '@talwacht/shared';
import { createGame } from './state';
import { starterBase } from './starter';
import { applyCommand } from './commands';
import { tick } from './tick';

describe('starter base', () => {
  for (const id of MAP_ORDER) it(`${id}: wall with gate and towers, barracks, range, houses and a manned wall`, () => {
    const s = createGame(id, 'normal', 7, [], []);
    starterBase(s);
    const n = (k: StructId) => s.structs.filter(x => x.kind === k).length;
    expect(n('wall')).toBeGreaterThanOrEqual(8);
    expect(n('gate')).toBe(1);
    expect(n('tower_bow')).toBe(2);
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
