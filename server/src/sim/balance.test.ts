import { describe, it, expect } from 'vitest';
import { type TroopType } from '@burgwacht/shared';
import { applyCommand, createGame, tick } from './index';
import { botBuy } from './bot';

const MIX: TroopType[] = ['archer', 'knight', 'catapult', 'spearman', 'healer', 'crossbowman', 'cavalry', 'mage'];

function play(army: boolean, maxSeconds = 1500) {
  const s = createGame('meadow', 7);
  let last = -1;
  for (let i = 0; i < maxSeconds * 20 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    if (s.phase === 'prep' && s.wave !== last) {
      last = s.wave;
      if (army) { botBuy(s, 0, MIX); botBuy(s, 1, MIX); }
      for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true });
    }
    tick(s);
  }
  return s;
}

describe('balance', { timeout: 90_000 }, () => {
  it('an idle army holds the early waves but not the whole game; no army falls fast', () => {
    const withArmy = play(true);
    expect(withArmy.phase).toBe('lost');
    expect(withArmy.wave).toBeGreaterThanOrEqual(5); // survives the first waves without any micro
    const without = play(false);
    expect(without.phase).toBe('lost');
    expect(without.wave).toBeLessThanOrEqual(2);
  });
  it('every wave ends — no stalemates (e.g. a lone shaman keeping its distance)', () => {
    const s = play(true);
    expect(s.time).toBeLessThan(1500);
  });
  it('the castle never levels up from kills', () => {
    const s = play(true);
    expect(s.units.find(u => u.type === 'castle')!.level).toBe(1);
  });
});
