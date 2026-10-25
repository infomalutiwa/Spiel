import {
  DEFAULT_MAP, MAPS, WAVES, toWire, type ClientMsg, type PlayerId, type ServerMsg, type Snapshot,
} from '@burgwacht/shared';
import { applyCommand, createGame, tick } from '../sim';
import type { GameState } from '@burgwacht/shared';

export interface Socket { send(data: string): void; close(): void }

const TICK_MS = 50;
const SNAP_EVERY = 2;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class Room {
  state: GameState;
  sockets: [Socket | null, Socket | null] = [null, null];
  tokens: [string, string];
  lastActive = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  private everFull = false;

  constructor(public code: string, seed = (Math.random() * 2 ** 32) >>> 0, mapId = DEFAULT_MAP) {
    this.state = createGame(Object.hasOwn(MAPS, mapId) ? mapId : DEFAULT_MAP, seed);
    this.tokens = [token(), token()];
  }

  get connected(): boolean { return !!(this.sockets[0] && this.sockets[1]); }
  get paused(): boolean { return !this.connected; }

  /** seat a socket; returns the seat or an error reason */
  join(ws: Socket, tok?: string): { you: PlayerId; token: string } | { error: string } {
    let seat: PlayerId | undefined;
    if (tok) {
      const i = this.tokens.indexOf(tok);
      if (i >= 0) { // the token holder always gets their own seat back, even if the old socket looks alive (half-open connection)
        seat = i as PlayerId;
        const old = this.sockets[i];
        this.sockets[i] = null;
        if (old && old !== ws) try { old.close(); } catch { /* already gone */ }
      }
    }
    if (seat === undefined) seat = this.sockets[0] ? (this.sockets[1] ? undefined : 1) : 0;
    if (seat === undefined) return { error: 'room_full' };
    if (!tok || this.tokens[seat] !== tok) this.tokens[seat] = token();
    this.sockets[seat] = ws;
    this.lastActive = Date.now();
    this.send(ws, { t: 'joined', code: this.code, you: seat, token: this.tokens[seat], mapId: this.state.mapId });
    this.broadcast({ t: 'peer', connected: this.connected });
    if (this.connected) this.everFull = true;
    this.sendSnapshot();
    return { you: seat, token: this.tokens[seat] };
  }

  leave(ws: Socket) {
    const i = this.sockets.indexOf(ws);
    if (i < 0) return;
    this.sockets[i] = null;
    this.lastActive = Date.now();
    this.broadcast({ t: 'peer', connected: false });
  }

  handle(player: PlayerId, raw: string) {
    if (raw.length > 8192) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || msg.t !== 'cmd') return;
    this.lastActive = Date.now();
    if (this.paused) return;
    const res = applyCommand(this.state, player, msg.cmd);
    if (!res.ok) this.send(this.sockets[player], { t: 'error', reason: res.reason });
  }

  get finished() { return this.state.phase === 'won' || this.state.phase === 'lost'; }

  start() {
    let n = 0;
    this.timer = setInterval(() => {
      if (!this.paused) {
        tick(this.state);
        if (++n % SNAP_EVERY === 0 || this.finished) this.sendSnapshot();
        if (this.finished) this.stop(); // final state delivered; nothing left to simulate
      } else if (++n % 10 === 0) this.sendSnapshot();
    }, TICK_MS);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  snapshot(): Snapshot {
    const s = this.state;
    const snap: Snapshot = {
      tick: s.tick, time: s.time, phase: s.phase, timer: s.timer, wave: s.wave, waveCount: WAVES.length,
      players: s.players,
      units: s.units.map(u => ({
        id: u.id, type: u.type, side: u.side, owner: u.owner, x: +u.x.toFixed(2), y: +u.y.toFixed(2),
        hp: Math.max(0, Math.round(u.hp)), maxHp: Math.round(u.maxHp), facing: +u.facing.toFixed(2),
        anim: u.anim, level: u.level,
      })),
      events: s.events,
      paused: this.paused,
    };
    s.events = [];
    return snap;
  }

  private sendSnapshot() {
    this.broadcast({ t: 'snap', s: toWire(this.snapshot()) });
  }
  private broadcast(m: ServerMsg) { for (const ws of this.sockets) if (ws) this.send(ws, m); }
  private send(ws: Socket | null, m: ServerMsg) { try { ws?.send(JSON.stringify(m)); } catch { /* socket gone */ } }
  get wasFull() { return this.everFull; }
}

const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

export const MAX_ROOMS = 200;

export class RoomRegistry {
  rooms = new Map<string, Room>();
  readonly createdAt = new WeakMap<Room, number>();

  /** null when the server is full */
  create(mapId?: string): Room | null {
    this.sweep();
    if (this.rooms.size >= MAX_ROOMS) return null;
    let code: string;
    do { code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
    while (this.rooms.has(code));
    const room = new Room(code, undefined, mapId);
    room.start();
    this.rooms.set(code, room);
    this.createdAt.set(room, Date.now());
    return room;
  }
  get(code: string) { return this.rooms.get(String(code).toUpperCase()); }
  /** drops rooms nobody is in: abandoned games after 30 min, never-joined rooms after 2 min, finished games after 5 min */
  sweep(now = Date.now()) {
    for (const [code, r] of this.rooms) {
      const empty = !r.sockets[0] && !r.sockets[1];
      const idle = now - r.lastActive;
      const neverJoined = !r.wasFull && now - (this.createdAt.get(r) ?? now) > 120_000 && empty;
      if ((empty && idle > 30 * 60_000) || neverJoined || (r.finished && empty && idle > 5 * 60_000)) {
        r.stop(); this.rooms.delete(code);
      }
    }
  }
}
