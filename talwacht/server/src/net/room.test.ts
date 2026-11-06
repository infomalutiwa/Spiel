import { describe, expect, it } from 'vitest';
import { fromWire, type ServerMsg } from '@talwacht/shared';
import { Room, type Socket } from './room';
import { createGame, serialize } from '../sim/index';

class FakeSocket implements Socket {
  msgs: ServerMsg[] = []; closed = false;
  send(d: string) { this.msgs.push(JSON.parse(d)); }
  close() { this.closed = true; }
  last<T extends ServerMsg['t']>(t: T) { return [...this.msgs].reverse().find(m => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
}
const opts = { mapId: 'gruental', diff: 'normal' as const, talents: [], unlocks: [] };

describe('room', () => {
  it('seats two players, pauses while one is gone and gives the seat back with the token', () => {
    const r = Room.create('ABCD', opts) as Room;
    const a = new FakeSocket(), b = new FakeSocket();
    r.join(a); r.join(b);
    expect(r.paused).toBe(false);
    const tokB = b.last('joined')!.token;
    r.leave(b);
    expect(r.paused).toBe(true);
    const b2 = new FakeSocket();
    const res = r.join(b2, tokB);
    expect(res).toMatchObject({ you: 1 });
    expect(r.paused).toBe(false);
  });

  it('solo: runs with one player, owns every starting squad, keeps solo across a save', () => {
    const r = Room.create('SOLO', { ...opts, solo: true }) as Room;
    const a = new FakeSocket();
    r.join(a);
    expect(r.paused).toBe(false);
    expect(a.last('joined')!.solo).toBe(true);
    expect(r.state.squads.length).toBe(4);
    expect(r.state.squads.every(q => q.owner === 0)).toBe(true);
    const back = Room.create('SOL2', { ...opts, save: serialize(r.state) }) as Room;
    back.join(new FakeSocket());
    expect(back.paused).toBe(false);
  });

  it('a third player is turned away', () => {
    const r = Room.create('ABCE', opts) as Room;
    r.join(new FakeSocket()); r.join(new FakeSocket());
    expect(r.join(new FakeSocket())).toEqual({ error: 'room_full' });
  });

  it('snapshots carry the full structure list once and deltas afterwards', () => {
    const r = Room.create('ABCF', opts) as Room;
    const a = new FakeSocket(); r.join(a); r.join(new FakeSocket());
    const first = fromWire(a.last('snap')!.s);
    expect(first.structs?.some(x => x.kind === 'keep')).toBe(true);
    r.step(); r.step();
    const later = fromWire(r.snapshot());
    expect(later.structs).toBeUndefined();
  });

  it('resumes a saved round', () => {
    const s = createGame('klamm', 'hard', 5, [], []); s.wave = 7; s.time = 900;
    const r = Room.create('ABCG', { ...opts, save: serialize(s) }) as Room;
    expect(r.state.wave).toBe(7);
    expect(r.state.mapId).toBe('klamm');
  });

  it('refuses a broken save with a reason', () => {
    expect(Room.create('ABCH', { ...opts, save: '{"broken":true}' })).toEqual({ error: 'save_invalid' });
  });

  it('sends a save to both players when a wave starts', () => {
    const r = Room.create('ABCI', opts) as Room;
    const a = new FakeSocket(), b = new FakeSocket(); r.join(a); r.join(b);
    r.state.nextWaveAt = r.state.time + 0.01;
    r.step(); r.step();
    expect(a.last('save')?.wave).toBe(1);
    expect(b.last('save')?.wave).toBe(1);
  });

  it('ignores oversized commands', () => {
    const r = Room.create('ABCJ', opts) as Room;
    r.join(new FakeSocket()); r.join(new FakeSocket());
    const n = r.state.structs.length;
    r.handle(0, JSON.stringify({ t: 'cmd', cmd: { c: 'build', kind: 'wall', cells: Array(3000).fill([60, 60]) } }));
    expect(r.state.structs.length).toBe(n);
  });
});
