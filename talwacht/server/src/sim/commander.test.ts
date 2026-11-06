import { describe, expect, it } from 'vitest';
import { cellOf, ENEMIES, FIRST_WAVE_AT, MAPS } from '@talwacht/shared';
import { createGame, newStructure, terrainOf } from './state';
import { planWave } from './commander';
import { callWave, wavesTick } from './waves';
import { applyCommand } from './commands';
import './waves';

const fresh = () => createGame('gruental', 'normal', 7, [], []);
const cost = (g: { type: keyof typeof ENEMIES; n: number }) => ENEMIES[g.type].budget * g.n;

describe('commander', () => {
  it('wave 1 is only raiders on the middle lane', () => {
    const p = planWave(fresh(), 1);
    expect(p.groups.length).toBeGreaterThan(0);
    expect(p.groups.every(g => g.type === 'e_raider' && g.lane === 0)).toBe(true);
  });

  it('a heavily defended lane gets less than 40 % of the budget', () => {
    const s = fresh(), t = terrainOf(s), lane = MAPS.gruental.lanes[1];
    const [x, y] = lane.pts[2];
    for (let i = 0; i < 8; i++) {
      const c = cellOf(x - 16 + (i % 4) * 8, y + 20 + Math.floor(i / 4) * 8);
      if (t.buildable(c.cy * t.cw + c.cx)) newStructure(s, 'tower_xbow', c.cx, c.cy, 0, true);
    }
    const p = planWave(s, 12);
    const total = p.groups.reduce((a, g) => a + cost(g), 0);
    const onLane1 = p.groups.filter(g => g.lane === 1).reduce((a, g) => a + cost(g), 0);
    expect(onLane1 / total).toBeLessThan(0.4);
    expect(p.mainLane).not.toBe(1);
  });

  it('many archers on the walls bring a testudo by wave 9', () => {
    const s = fresh(); s.memory.wallRangedShare = 0.6;
    const plans = [8, 9].map(w => planWave(s, w));
    expect(plans.some(p => p.groups.some(g => g.testudo))).toBe(true);
    expect(plans.some(p => p.scout.some(l => /Schild/.test(l)))).toBe(true);
  });

  it('every fifth wave brings the warlord', () => {
    const p = planWave(fresh(), 5);
    expect(p.boss).toBe(true);
    expect(p.groups.some(g => g.type === 'warlord')).toBe(true);
  });
});

describe('waves', () => {
  it('the first wave starts after the build-up time and spawns enemies', () => {
    const s = fresh();
    s.time = FIRST_WAVE_AT - 1; wavesTick(s, 0.05);
    expect(s.wave).toBe(0);
    s.time = FIRST_WAVE_AT + 0.1;
    for (let i = 0; i < 20 * 30; i++) { s.time += 0.05; wavesTick(s, 0.05); }
    expect(s.wave).toBe(1);
    expect(s.units.filter(u => u.side === 'e').length).toBeGreaterThan(3);
  });

  it('calling the next wave early pays one gold per second skipped', () => {
    const s = fresh(); s.time = 10;
    const gold = s.res.gold, left = s.nextWaveAt - s.time;
    expect(applyCommand(s, 0, { c: 'callWave' })).toEqual({ ok: true });
    expect(s.res.gold).toBe(gold + Math.floor(left));
    expect(s.wave).toBe(1);
    expect(callWave).toBeTypeOf('function');
  });
});
