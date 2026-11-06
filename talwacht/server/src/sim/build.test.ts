import { describe, expect, it } from 'vitest';
import { cellOf, MAPS, STRUCTURES, K } from '@talwacht/shared';
import { createGame, terrainOf } from './state';
import { applyCommand } from './commands';

const fresh = (unlocks: string[] = []) => createGame('gruental', 'normal', 1, [], unlocks);
/** ten cells straight across the middle lane, 120 m in front of the keep */
const line = () => {
  const m = MAPS.gruental, c = cellOf(m.keep.x, m.keep.y - 120);
  return Array.from({ length: 10 }, (_, i) => [c.cx - 5 + i, c.cy] as [number, number]);
};

describe('building', () => {
  it('a palisade line of 10 cells costs 60 wood and starts building', () => {
    const s = fresh(), wood = s.res.wood;
    expect(applyCommand(s, 0, { c: 'build', kind: 'wall', cells: line() })).toEqual({ ok: true });
    const walls = s.structs.filter(x => x.kind === 'wall');
    expect(walls.length).toBe(10);
    expect(s.res.wood).toBe(wood - 60);
    expect(walls.every(w => w.build > 0 && w.level === 1)).toBe(true);
  });

  it('building on the same cells again is rejected as occupied', () => {
    const s = fresh();
    applyCommand(s, 0, { c: 'build', kind: 'wall', cells: line() });
    expect(applyCommand(s, 1, { c: 'build', kind: 'wall', cells: line() })).toEqual({ ok: false, reason: 'occupied' });
  });

  it('without enough wood nothing is built', () => {
    const s = fresh(); s.res.wood = 5;
    expect(applyCommand(s, 0, { c: 'build', kind: 'wall', cells: line() })).toEqual({ ok: false, reason: 'no_resources' });
    expect(s.structs.filter(x => x.kind === 'wall').length).toBe(0);
  });

  it('a tower placed on a wall cell replaces that wall cell', () => {
    const s = fresh(), cells = line();
    applyCommand(s, 0, { c: 'build', kind: 'wall', cells });
    expect(applyCommand(s, 0, { c: 'build', kind: 'tower_bow', cells: [cells[4]] })).toEqual({ ok: true });
    expect(s.structs.filter(x => x.kind === 'wall').length).toBe(9);
    expect(s.structs.some(x => x.kind === 'tower_bow' && x.cx === cells[4][0] && x.cy === cells[4][1])).toBe(true);
  });

  it('a quarry needs rocks nearby', () => {
    const s = fresh(), t = terrainOf(s);
    let far: [number, number] | null = null;
    for (let cy = 60; cy < 120 && !far; cy++) for (let cx = 40; cx < 80; cx++) {
      let rocks = 0;
      for (let dy = -4; dy <= 5; dy++) for (let dx = -4; dx <= 5; dx++) if (t.kind[(cy + dy) * t.cw + cx + dx] === K.rock) rocks++;
      const ok = [0, 1].every(dy => [0, 1].every(dx => t.buildable((cy + dy) * t.cw + cx + dx)));
      if (!rocks && ok) { far = [cx, cy]; break; }
    }
    expect(far).not.toBeNull();
    expect(applyCommand(s, 0, { c: 'build', kind: 'quarry', cells: [far!] })).toEqual({ ok: false, reason: 'needs_rocks' });
  });

  it('a locked ballista is refused until unlocked', () => {
    const cell = line()[2];
    expect(applyCommand(fresh(), 0, { c: 'build', kind: 'ballista', cells: [cell] })).toEqual({ ok: false, reason: 'locked' });
    expect(applyCommand(fresh(['ballista']), 0, { c: 'build', kind: 'ballista', cells: [cell] })).toEqual({ ok: true });
  });

  it('selling refunds half of what was paid', () => {
    const s = fresh(), cell = line()[0];
    applyCommand(s, 0, { c: 'build', kind: 'tower_bow', cells: [cell] });
    const t = s.structs.find(x => x.kind === 'tower_bow')!, wood = s.res.wood, stone = s.res.stone;
    expect(applyCommand(s, 0, { c: 'sell', id: t.id })).toEqual({ ok: true });
    expect(s.res.wood).toBe(wood + STRUCTURES.tower_bow.cost.wood / 2);
    expect(s.res.stone).toBe(stone + STRUCTURES.tower_bow.cost.stone / 2);
    expect(s.structs.includes(t)).toBe(false);
  });

  it('a pitch nose mounts on a finished gate', () => {
    const s = fresh(), cell = line()[5];
    applyCommand(s, 0, { c: 'build', kind: 'gate', cells: [cell] });
    const g = s.structs.find(x => x.kind === 'gate')!;
    expect(applyCommand(s, 0, { c: 'build', kind: 'pitch', cells: [cell] })).toEqual({ ok: false, reason: 'not_ready' });
    g.build = 0;
    expect(applyCommand(s, 0, { c: 'build', kind: 'pitch', cells: [cell] })).toEqual({ ok: true });
    expect(g.pitch).toBe(1);
  });

  it('the game starts with the keep and the starting stock', () => {
    const s = fresh();
    expect(s.structs.filter(x => x.kind === 'keep').length).toBe(1);
    expect(s.res).toEqual({ wood: 600, stone: 300, food: 150, gold: 400 });
  });
});
