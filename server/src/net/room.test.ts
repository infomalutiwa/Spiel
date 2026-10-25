import { describe, it, expect } from 'vitest';
import type { ServerMsg } from '@burgwacht/shared';
import { Room, type Socket } from './room';

const fake = () => {
  const got: ServerMsg[] = [];
  const ws: Socket & { got: ServerMsg[] } = { got, send: d => { got.push(JSON.parse(d)); }, close() {} };
  return ws;
};

describe('Room', () => {
  it('seats two players and rejects a third without disturbing the game', () => {
    const r = new Room('ABCD', 1);
    const a = fake(), b = fake(), c = fake();
    expect(r.join(a)).toMatchObject({ you: 0 });
    expect(r.join(b)).toMatchObject({ you: 1 });
    expect(r.join(c)).toEqual({ error: 'room_full' });
    expect(r.connected).toBe(true);
    expect(c.got.length).toBe(0);
  });
  it('ignores malformed messages', () => {
    const r = new Room('ABCD', 1);
    r.join(fake()); r.join(fake());
    r.handle(0, '{nope');
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: null }));
    r.handle(0, 'x'.repeat(9000));
    expect(r.state.phase).toBe('prep');
  });
  it('applies commands and rejects unaffordable ones with an error to the sender only', () => {
    const r = new Room('ABCD', 1);
    const a = fake(), b = fake();
    r.join(a); r.join(b);
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop: 'knight', x: 40, y: 40 } }));
    expect(r.state.units.some(u => u.type === 'knight')).toBe(true);
    r.state.players[0].gold = 0;
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop: 'knight', x: 40, y: 44 } }));
    expect(a.got.some(m => m.t === 'error')).toBe(true);
    expect(b.got.some(m => m.t === 'error')).toBe(false);
  });
  it('pauses on disconnect and restores the seat by token', () => {
    const r = new Room('ABCD', 1);
    const a = fake(), b = fake();
    const sa = r.join(a) as { token: string };
    r.join(b);
    r.leave(a);
    expect(r.paused).toBe(true);
    r.handle(1, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop: 'knight', x: 40, y: 40 } }));
    expect(r.state.units.some(u => u.type === 'knight')).toBe(false);
    expect(r.join(fake(), sa.token)).toMatchObject({ you: 0, token: sa.token });
    expect(r.paused).toBe(false);
  });
  it('snapshots contain no server-only fields and drain events', () => {
    const r = new Room('ABCD', 1);
    r.join(fake()); r.join(fake());
    const s = r.snapshot();
    expect(Object.keys(s.units[0]).sort()).toEqual(
      ['anim', 'facing', 'hp', 'id', 'level', 'maxHp', 'owner', 'side', 'type', 'x', 'y']);
    expect(r.state.events.length).toBe(0);
  });
});
