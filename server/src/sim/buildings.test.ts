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

describe('traps', () => {
  const front = () => ({ x: MAPS.meadow.barriers[0].x + 20, y: MAPS.meadow.barriers[0].gateY });
  it('may be built in front of the outer wall, buildings may not', () => {
    const s = createGame('meadow', 1);
    expect(applyCommand(s, 0, { c: 'build', kind: 'pit', ...front() })).toEqual({ ok: true });
    expect(applyCommand(s, 0, { c: 'build', kind: 'bowtower', ...front() })).toMatchObject({ ok: false, reason: 'outside_zone' });
  });
  it('a pit hits whoever steps in once, then is gone; enemies never attack traps', () => {
    const s = battle(); s.players[0].gold = 5000;
    const p = front();
    applyCommand(s, 0, { c: 'build', kind: 'pit', ...p });
    const e = foe(s, 'footman', p.x + 1, p.y), hp = e.hp;
    run(s, 0.5);
    expect(e.hp).toBeLessThan(hp);
    expect(buildingsOf(s, 0, 'pit')).toHaveLength(0);
  });
  it('a pitch ditch burns enemies once lit and is used up afterwards', () => {
    const s = battle(); s.players[0].gold = 5000;
    const p = front();
    applyCommand(s, 0, { c: 'build', kind: 'pitch', ...p });
    const ditch = buildingsOf(s, 0, 'pitch')[0];
    const e = foe(s, 'ironguard', p.x, p.y + 2), hp = e.hp;
    run(s, 1);
    expect(e.hp).toBe(hp); // not lit yet: nothing happens
    expect(applyCommand(s, 0, { c: 'ignite', id: ditch.id })).toEqual({ ok: true });
    run(s, 3);
    expect(e.hp).toBeLessThan(hp);
    run(s, 9);
    expect(buildingsOf(s, 0, 'pitch')).toHaveLength(0);
  });
});
