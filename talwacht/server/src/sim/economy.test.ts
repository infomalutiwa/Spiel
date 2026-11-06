import { describe, expect, it } from 'vitest';
import { K, type GameState, type Unit } from '@talwacht/shared';
import { createGame, newStructure, terrainOf } from './state';
import { armyCap, economyTick, production, nearCount } from './economy';
import { siteProblem } from './build';

const fresh = () => createGame('gruental', 'normal', 1, [], []);
/** first free 2×2 site whose surroundings satisfy `ok` */
function site(s: GameState, kind: 'lumber' | 'farm' | 'mill' | 'house', ok: (cx: number, cy: number) => boolean = () => true) {
  const t = terrainOf(s);
  for (let cy = 20; cy < t.ch - 20; cy++) for (let cx = 10; cx < t.cw - 10; cx++)
    if (!siteProblem(s, kind, cx, cy) && ok(cx, cy)) return [cx, cy] as const;
  throw new Error('no site');
}
const soldier = (s: GameState, i: number): Unit => ({
  id: 10_000 + i, type: 'spearman', side: 'p', owner: 0, x: 250, y: 500, z: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, cd: 0, facing: 0, anim: 0,
  squad: 1, slot: -1, target: 0, stun: 0, slow: 0, slowT: 0, burn: 0, burnDps: 0, formation: 0, charge: 0, group: 0, mode: 0, t: 0, gx: 0, gy: 0, gz: 0, dead: 0,
});

describe('economy', () => {
  it('a lumber camp yields 6 + 0.6 per forest cell within 3 cells, at most 18 wood/min', () => {
    const s = fresh();
    const [cx, cy] = site(s, 'lumber');
    const st = newStructure(s, 'lumber', cx, cy, 0, true);
    const n = nearCount(s, st, 3, K.forest);
    expect(n).toBeGreaterThanOrEqual(4);
    expect(production(s).wood).toBeCloseTo(Math.min(18, 6 + 0.6 * n), 5);
  });

  it('unfinished buildings produce nothing', () => {
    const s = fresh();
    const [cx, cy] = site(s, 'lumber');
    newStructure(s, 'lumber', cx, cy, 0, false);
    expect(production(s).wood).toBe(0);
  });

  it('a mill next to a farm adds 25 %', () => {
    const s = fresh();
    const [fx, fy] = site(s, 'farm');
    const farm = newStructure(s, 'farm', fx, fy, 0, true);
    const before = production(s).food;
    const t = terrainOf(s);
    const [mx, my] = site(s, 'mill', (cx, cy) => Math.abs(cx - farm.cx) <= 4 && Math.abs(cy - farm.cy) <= 4 && t.kind[cy * t.cw + cx] !== K.road);
    newStructure(s, 'mill', mx, my, 0, true);
    expect(production(s).food).toBeCloseTo(before * 1.25, 5);
  });

  it('each house gives both players 8 army places, capped at 100', () => {
    const s = fresh();
    expect(armyCap(s, 0)).toBe(30);
    for (let i = 0; i < 2; i++) { const [cx, cy] = site(s, 'house'); newStructure(s, 'house', cx, cy, 0, true); }
    expect(armyCap(s, 0)).toBe(46); expect(armyCap(s, 1)).toBe(46);
    for (let i = 0; i < 12; i++) { const [cx, cy] = site(s, 'house'); newStructure(s, 'house', cx, cy, 1, true); }
    expect(armyCap(s, 1)).toBe(100);
  });

  it('an army without farms eats the stock and goes hungry', () => {
    const s = fresh();
    for (let i = 0; i < 50; i++) s.units.push(soldier(s, i));
    s.res.food = 1;
    for (let i = 0; i < 20 * 60; i++) economyTick(s, 0.05);
    expect(s.res.food).toBe(0);
    expect(s.hunger).toBe(true);
  });

  it('production accumulates into the shared stock over a minute', () => {
    const s = fresh();
    const [cx, cy] = site(s, 'lumber');
    newStructure(s, 'lumber', cx, cy, 0, true);
    const per = production(s).wood, w0 = s.res.wood;
    for (let i = 0; i < 20 * 60; i++) economyTick(s, 0.05);
    expect(s.res.wood - w0).toBeCloseTo(per, 0);
  });
});
