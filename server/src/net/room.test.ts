import { describe, it, expect } from 'vitest';
import { START_GOLD, type ServerMsg } from '@burgwacht/shared';
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
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop: 'knight', x: 60, y: 60 } }));
    expect(r.state.units.some(u => u.type === 'knight')).toBe(true);
    r.state.players[0].gold = 0;
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop: 'knight', x: 60, y: 64 } }));
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
    r.handle(1, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop: 'knight', x: 60, y: 60 } }));
    expect(r.state.units.some(u => u.type === 'knight')).toBe(false);
    expect(r.join(fake(), sa.token)).toMatchObject({ you: 0, token: sa.token });
    expect(r.paused).toBe(false);
  });
  it('does not run while only one player is in the room', () => {
    const r = new Room('ABCD', 1);
    r.join(fake());
    expect(r.paused).toBe(true);
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'ready', ready: true } }));
    expect(r.state.players[0].ready).toBe(false);
    r.join(fake());
    expect(r.paused).toBe(false);
  });
  it('pauses while either player has the app in the background', () => {
    const r = new Room('ABCD', 1);
    const a = fake(), b = fake();
    r.join(a); r.join(b);
    r.handle(1, JSON.stringify({ t: 'vis', hidden: true }));
    expect(r.paused).toBe(true);
    expect(a.got.at(-1)).toMatchObject({ t: 'snap' });
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop: 'knight', x: 60, y: 60 } }));
    expect(r.state.units.some(u => u.type === 'knight')).toBe(false);
    r.handle(1, JSON.stringify({ t: 'vis', hidden: false }));
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

describe('Room hardening', () => {
  it('a token holder reclaims their own seat even while the old socket looks alive', () => {
    const r = new Room('ABCD', 1);
    const a = fake(), b = fake();
    const sa = r.join(a) as { token: string };
    const sb = r.join(b) as { token: string };
    const a2 = fake();
    expect(r.join(a2, sa.token)).toMatchObject({ you: 0, token: sa.token });
    expect(r.tokens[1]).toBe(sb.token); // partner's token untouched
    expect(r.sockets[1]).toBe(b);
  });
  it('rejects non-troop keys like "constructor" without touching gold', () => {
    const r = new Room('ABCD', 1);
    r.join(fake()); r.join(fake());
    for (const troop of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
      r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'buy', troop, x: 60, y: 60 } }));
    expect(r.state.players[0].gold).toBe(START_GOLD);
    expect(r.state.units.length).toBe(1);
  });
  it('finished games stop their timer and registries cap the number of rooms', async () => {
    const { RoomRegistry, MAX_ROOMS } = await import('./room');
    const reg = new RoomRegistry();
    const made = Array.from({ length: MAX_ROOMS + 5 }, () => reg.create());
    expect(made.filter(Boolean).length).toBe(MAX_ROOMS);
    expect(made[MAX_ROOMS]).toBeNull();
    reg.sweep(Date.now() + 3 * 60_000); // nobody ever joined
    expect(reg.rooms.size).toBe(0);
  });
});
