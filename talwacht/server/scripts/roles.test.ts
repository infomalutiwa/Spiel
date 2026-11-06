import { describe, expect, it } from 'vitest';
import { bench } from './roles';

/** damage per resource spent, 30 s, enemies cannot die (pure output comparison) */
describe('tower roles at equal cost', () => {
  it('(a) testudo with ram: the catapult does ≥ 3× and the pitch nose ≥ 2× the bow tower', () => {
    const bow = bench('testudo', 'tower_bow'), cat = bench('testudo', 'tower_catapult'), pitch = bench('testudo', 'pitch');
    expect(cat).toBeGreaterThanOrEqual(3 * bow);
    expect(pitch).toBeGreaterThanOrEqual(2 * bow);
  });

  it('(b) a swarm of raiders: the bow tower beats the crossbow tower', () => {
    expect(bench('swarm', 'tower_bow')).toBeGreaterThan(bench('swarm', 'tower_xbow'));
  });

  it('(c) heavy soldiers: the crossbow tower does ≥ 1.8× the bow tower', () => {
    expect(bench('heavies', 'tower_xbow')).toBeGreaterThanOrEqual(1.8 * bench('heavies', 'tower_bow'));
  });

  it('(d) a column on a straight lane: the ballista is the best single tower', () => {
    const b = bench('column', 'ballista');
    for (const k of ['tower_bow', 'tower_xbow', 'tower_catapult'] as const) expect(b).toBeGreaterThan(bench('column', k));
  });

  it('(e) a trebuchet at 108 m: only the level-2 catapult reaches it', () => {
    expect(bench('trebuchet', 'tower_catapult', 2)).toBeGreaterThan(0);
    for (const k of ['tower_bow', 'tower_xbow', 'ballista'] as const) expect(bench('trebuchet', k)).toBe(0);
  });
});
