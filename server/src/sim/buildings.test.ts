import { describe, expect, it } from 'vitest';
import { MAPS } from '@burgwacht/shared';
import { applyCommand } from './orders';
import { battle, foe, mine, run } from './helpers';
import { createGame } from './state';
import { buildingsOf } from './buildings';

const spot = (i = 0) => { const z = MAPS.meadow.placeZone; return { x: z.x0 + 10 + i * 8, y: z.y0 + 12 }; };

describe('buildings', () => {
  it('are bought for gold, limited and kept apart', () => {
    const s = createGame('meadow', 1), g0 = s.players[0].gold;
    expect(applyCommand(s, 0, { c: 'build', kind: 'bowtower', ...spot() })).toEqual({ ok: true });
    expect(s.players[0].gold).toBeLessThan(g0);
    expect(applyCommand(s, 0, { c: 'build', kind: 'bowtower', ...spot() })).toMatchObject({ ok: false, reason: 'outside_zone' });
    expect(applyCommand(s, 0, { c: 'build', kind: 'bowtower', x: 5, y: 5 })).toMatchObject({ ok: false });
    s.players[1].gold = 0;
    expect(applyCommand(s, 1, { c: 'build', kind: 'goldmine', ...spot(1) })).toMatchObject({ ok: false, reason: 'not_enough_gold' });
  });
  it('levels up and a goldmine pays its owner only', () => {
    const s = createGame('meadow', 1);
    s.players[0].gold = 5000;
    applyCommand(s, 0, { c: 'build', kind: 'goldmine', ...spot() });
    const m = buildingsOf(s, 0, 'goldmine')[0];
    const before = s.players[0].gold, other = s.players[1].gold;
    run(s, 10);
    expect(s.players[0].gold - before).toBeGreaterThan(8);
    expect(s.players[1].gold).toBe(other);
    expect(applyCommand(s, 1, { c: 'bupgrade', id: m.id })).toMatchObject({ ok: false });
    expect(applyCommand(s, 0, { c: 'bupgrade', id: m.id })).toEqual({ ok: true });
    expect(m.level).toBe(2);
  });
  it('a bow tower shoots enemies in range and an infirmary heals troops', () => {
    const s = battle();
    s.players[0].gold = 5000;
    const p = spot();
    applyCommand(s, 0, { c: 'build', kind: 'bowtower', ...p });
    applyCommand(s, 0, { c: 'build', kind: 'infirmary', x: p.x + 10, y: p.y });
    const e = foe(s, 'footman', p.x + 18, p.y); const hp = e.hp;
    const k = mine(s, 'knight', p.x + 4, p.y - 9); k.hp = k.maxHp * 0.3;
    run(s, 5);
    expect(e.hp).toBeLessThan(hp);
    expect(k.hp).toBeGreaterThan(k.maxHp * 0.35);
  });
});
