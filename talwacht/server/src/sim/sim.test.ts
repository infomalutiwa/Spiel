import { describe, expect, it } from 'vitest';
import { cellOf, FIRST_WAVE_AT, MAPS } from '@talwacht/shared';
import { createGame, terrainOf, structById } from './state';
import { applyCommand, tick, serialize, deserialize } from './index';

const map = MAPS.gruental;

function fortify() {
  const s = createGame('gruental', 'normal', 3, [], []), t = terrainOf(s);
  const row = cellOf(0, map.keep.y - 44).cy, cells: [number, number][] = [];
  for (let cx = 0; cx < t.cw; cx++) if (t.kind[row * t.cw + cx] !== 5) cells.push([cx, row]);
  expect(applyCommand(s, 0, { c: 'build', kind: 'wall', cells })).toEqual({ ok: true });
  const mid = cellOf(map.keep.x, 0).cx;
  expect(applyCommand(s, 0, { c: 'build', kind: 'tower_bow', cells: [[mid - 2, row]] })).toEqual({ ok: true });
  expect(applyCommand(s, 1, { c: 'build', kind: 'tower_bow', cells: [[mid + 2, row]] })).toEqual({ ok: true });
  return s;
}

describe('simulation', () => {
  it('a palisade with two bow towers holds the first two waves', () => {
    const s = fortify();
    while (s.time < FIRST_WAVE_AT + 330 && s.phase === 'play') tick(s);
    expect(s.phase).toBe('play');
    expect(s.wave).toBeGreaterThanOrEqual(2);
    expect(s.kills).toBeGreaterThan(10);
    expect(structById(s, s.keepId)!.hp).toBeGreaterThan(0);
  });

  it('the round is lost when the keep falls', () => {
    const s = fortify();
    structById(s, s.keepId)!.hp = 0;
    tick(s);
    expect(s.phase).toBe('lost');
    expect(s.result?.won).toBe(false);
  });

  it('the round is won when the last wave is beaten', () => {
    const s = fortify(); s.waveCount = 1;
    while (s.phase === 'play' && s.time < FIRST_WAVE_AT + 200) tick(s);
    expect(s.phase).toBe('won');
    expect(s.result?.stars).toBeGreaterThanOrEqual(1);
  });
});

describe('saves', () => {
  it('round-trips a running game exactly', () => {
    const s = fortify();
    for (let i = 0; i < 20 * 200; i++) tick(s);
    const back = deserialize(serialize(s));
    expect('error' in back).toBe(false);
    expect(back).toEqual({ ...s, events: [] });
  });

  it('rejects saves from another version', () => {
    const s = fortify();
    const bad = serialize(s).replace('"v":1', '"v":99');
    expect(deserialize(bad)).toEqual({ error: 'save_version' });
  });

  it('rejects oversized or broken saves', () => {
    expect(deserialize('x'.repeat(1_600_000))).toEqual({ error: 'save_too_big' });
    expect(deserialize('{"v":1}')).toEqual({ error: 'save_invalid' });
    expect(deserialize('nope')).toEqual({ error: 'save_invalid' });
  });
});
