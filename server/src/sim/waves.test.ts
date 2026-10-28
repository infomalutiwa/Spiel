import { describe, it, expect } from 'vitest';
import { WAVES, isBossWave, groupCount, MAPS } from '@burgwacht/shared';
import { createGame, tick } from './index';

/** the spawn schedule the simulation builds when a wave starts */
const schedule = (wave: number) => {
  const s = createGame('meadow', 1);
  s.wave = wave;
  s.players.forEach(p => { p.ready = true; });
  tick(s);
  return s.spawnQueue.map(q => ({ at: q.at, type: q.type }));
};

describe('campaign waves', () => {
  it('has 25 waves and a boss every fifth one, with the big boss (warlord) from the 10th on', () => {
    expect(WAVES.length).toBe(25);
    WAVES.forEach((w, i) => {
      expect(w.name.startsWith('Boss')).toBe(isBossWave(i));
      if (i >= 9 && isBossWave(i)) expect(w.groups.some(g => g.type === 'warlord')).toBe(true);
    });
  });
  it('bosses are not multiplied by the map scale; ordinary groups are', () => {
    const boss = WAVES[9].groups.find(g => g.type === 'warlord')!;
    expect(groupCount(MAPS.valley.waveScale, 9, boss)).toBe(boss.count);
    const foot = WAVES[9].groups.find(g => g.type === 'footman')!;
    expect(groupCount(MAPS.meadow.waveScale, 9, foot)).toBeGreaterThan(foot.count);
  });
  it('a wave marches in as a column, not a lump: scouts first, the siege train last, spread over half a minute or more', () => {
    for (const w of [9, 14, 19, 24]) {
      const q = schedule(w);
      const first = (t: string) => Math.min(...q.filter(x => x.type === t).map(x => x.at));
      const span = Math.max(...q.map(x => x.at)) - Math.min(...q.map(x => x.at));
      expect(span).toBeGreaterThan(25);
      const has = (a: string, b: string) => q.some(x => x.type === a) && q.some(x => x.type === b);
      if (has('raider_rider', 'footman')) expect(first('raider_rider')).toBeLessThan(first('footman'));
      if (has('ram', 'raider_archer')) expect(first('ram')).toBeGreaterThan(first('raider_archer') + 8);
      if (has('warlord', 'ironguard')) expect(first('warlord')).toBeGreaterThan(first('ironguard'));
    }
  });
  it('early waves stay compact so the first minutes are not boring', () => {
    const q = schedule(0);
    expect(Math.max(...q.map(x => x.at))).toBeLessThan(25);
  });
});
