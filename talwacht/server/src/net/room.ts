import {
  MAPS, DEFAULT_MAP, PROTOCOL_VERSION, structDeltas, toWire, TALENTS, UNLOCKS,
  type ClientMsg, type Difficulty, type GameState, type PlayerId, type ServerMsg, type Snapshot, type StructSnap, type TalentId, type WireSnapshot,
} from '@talwacht/shared';
import { trapSpent } from '../sim/traps';
import { applyCommand, armyCap, createGame, starterBase, deserialize, rate, serialize, soldiers, tick, timeline } from '../sim/index';

export interface Socket { send(data: string): void; close(): void }
export interface RoomOpts { mapId: string; diff: Difficulty; talents: TalentId[]; unlocks: string[]; save?: string; debugWaves?: number }

const TICK_MS = 50;
const SNAP_EVERY = 2;
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

export class Room {
  sockets: [Socket | null, Socket | null] = [null, null];
  tokens: [string, string] = [token(), token()];
  lastActive = Date.now();
  createdAt = Date.now();
  everFull = false;
  private timer?: ReturnType<typeof setInterval>;
  private away: [boolean, boolean] = [false, false];
  private sentRev = -1;
  private prevStructs = new Map<number, string>();
  private savedWave = -1;
  private n = 0;

  private constructor(public code: string, public state: GameState) {}

  static create(code: string, o: RoomOpts): Room | { error: string } {
    if (o.save) {
      const s = deserialize(o.save);
      if ('error' in s) return s;
      return new Room(code, s);
    }
    const map = Object.hasOwn(MAPS, o.mapId) ? o.mapId : DEFAULT_MAP;
    const diff = DIFFS.includes(o.diff) ? o.diff : 'normal';
    const talents = (Array.isArray(o.talents) ? o.talents : []).filter(t => TALENTS.some(x => x.id === t)).slice(0, 3);
    const unlocks = (Array.isArray(o.unlocks) ? o.unlocks : []).filter(u => UNLOCKS.some(x => x.id === u));
    const s = createGame(map, diff, (Math.random() * 2 ** 32) >>> 0, talents, unlocks);
    starterBase(s); // a small working settlement to start from
    if (o.debugWaves && o.debugWaves > 0) { s.waveCount = Math.min(s.waveCount, Math.floor(o.debugWaves)); s.debugWaves = s.waveCount; }
    return new Room(code, s);
  }

  get connected() { return !!(this.sockets[0] && this.sockets[1]); }
  get paused() { return !this.connected || this.away[0] || this.away[1]; }
  get finished() { return this.state.phase !== 'play'; }

  join(ws: Socket, tok?: string): { you: PlayerId; token: string } | { error: string } {
    let seat: PlayerId | undefined;
    if (tok) {
      const i = this.tokens.indexOf(tok);
      if (i >= 0) {
        seat = i as PlayerId;
        const old = this.sockets[i];
        this.sockets[i] = null;
        if (old && old !== ws) try { old.close(); } catch { /* gone */ }
      }
    }
    if (seat === undefined) seat = this.sockets[0] ? (this.sockets[1] ? undefined : 1) : 0;
    if (seat === undefined) return { error: 'room_full' };
    if (!tok || this.tokens[seat] !== tok) this.tokens[seat] = token();
    this.sockets[seat] = ws;
    this.away[seat] = false;
    this.lastActive = Date.now();
    this.send(ws, { t: 'joined', code: this.code, you: seat, token: this.tokens[seat], mapId: this.state.mapId, v: PROTOCOL_VERSION });
    this.broadcast({ t: 'peer', connected: this.connected });
    if (this.connected) this.everFull = true;
    this.sentRev = -1; // newcomers need the full structure list
    this.prevStructs.clear();
    this.broadcast({ t: 'snap', s: this.snapshot() });
    return { you: seat, token: this.tokens[seat] };
  }

  leave(ws: Socket) {
    const i = this.sockets.indexOf(ws);
    if (i < 0) return;
    this.sockets[i] = null; this.away[i] = false; this.lastActive = Date.now();
    this.broadcast({ t: 'peer', connected: false });
  }

  handle(player: PlayerId, raw: string) {
    if (raw.length > 8192) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg?.t === 'vis') {
      if (this.away[player] !== !!msg.hidden) { this.away[player] = !!msg.hidden; this.broadcast({ t: 'snap', s: this.snapshot() }); }
      return;
    }
    if (msg?.t !== 'cmd' || !msg.cmd) return;
    this.lastActive = Date.now();
    if (this.paused && msg.cmd.c !== 'preview') return;
    try {
      const res = applyCommand(this.state, player, msg.cmd);
      if (!res.ok) this.send(this.sockets[player], { t: 'error', reason: res.reason });
    } catch (e) { console.error('command failed', e); }
  }

  /** one simulation step plus the network side effects */
  step() {
    if (!this.paused) {
      tick(this.state);
      if (this.state.wave !== this.savedWave && this.state.wave > 0) {
        this.savedWave = this.state.wave;
        this.broadcast({ t: 'save', data: serialize(this.state), wave: this.state.wave, mapId: this.state.mapId });
      }
      if (++this.n % SNAP_EVERY === 0 || this.finished) this.broadcast({ t: 'snap', s: this.snapshot() });
    } else if (++this.n % 10 === 0) this.broadcast({ t: 'snap', s: this.snapshot() });
  }

  start() {
    this.timer = setInterval(() => {
      try { this.step(); } catch (e) { console.error('tick failed', e); }
    }, TICK_MS);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  snapshot(): WireSnapshot {
    const s = this.state;
    const intact = new Map<number, boolean>();
    for (const f of s.formations) { const ok = f.broken <= 0; for (const id of f.members) intact.set(id, ok); intact.set(f.ram, ok); }
    const full = s.sRev !== this.sentRev;
    if (full) { this.sentRev = s.sRev; this.prevStructs.clear(); }
    const sHp = structDeltas(s.structs, this.prevStructs);
    const structs: StructSnap[] | undefined = full ? s.structs.map(st => ({
      id: st.id, kind: st.kind, cx: st.cx, cy: st.cy, w: st.w, h: st.h, level: st.level, hp: Math.round(st.hp), maxHp: Math.round(st.maxHp),
      owner: st.owner, build: Math.round(st.build * 10) / 10, state: st.state, burning: st.burning > 0 ? 1 : 0, pitch: st.pitch,
      spent: trapSpent(st) || undefined,
    })) : undefined;
    const boss = s.units.find(u => u.type === 'warlord' && u.hp > 0);
    const snap: Snapshot = {
      tick: s.tick, time: Math.round(s.time * 10) / 10, phase: s.phase, wave: s.wave, waveCount: s.waveCount, nextWaveIn: Math.max(0, Math.round(s.nextWaveAt - s.time)),
      timeline: timeline(s), res: roundRes(s.res), rate: roundRes(rate(s)), cap: [armyCap(s, 0), armyCap(s, 1)], army: [soldiers(s, 0), soldiers(s, 1)],
      units: s.units.map(u => ({
        id: u.id, type: u.type, side: u.side, owner: u.owner, x: u.x, y: u.y, z: u.z, hp: Math.max(0, Math.round(u.hp)), maxHp: Math.round(u.maxHp),
        facing: u.facing, anim: u.anim, squad: u.squad, burning: u.burn > 0, slowed: u.slow > 0.05, stunned: u.stun > 0, shielded: intact.get(u.id) ?? false,
      })),
      sRev: s.sRev, structs, sHp: full ? [] : sHp,
      squads: s.squads.map(q => {
        const ms = q.members.map(id => s.units.find(u => u.id === id)).filter(u => u && u.hp > 0);
        return { id: q.id, owner: q.owner, type: q.type, n: ms.length, hp: Math.round(100 * ms.reduce((a, u) => a + u!.hp / u!.maxHp, 0) / Math.max(1, ms.length)), order: q.order.k, stars: q.stars };
      }),
      queues: s.structs.filter(st => st.queue.length || st.research || st.rally || st.dry).map(st => ({
        id: st.id, jobs: st.queue.map(j => [j.troop, j.owner, Math.round((1 - j.left / j.total) * 100) / 100] as [typeof j.troop, PlayerId, number]),
        research: st.research ? [st.research.id, Math.round((1 - st.research.left / st.research.total) * 100) / 100] : null,
        rally: st.rally ? [Math.round(st.rally.x), Math.round(st.rally.y)] : null, dry: st.dry > 0,
      })),
      shells: s.shells.map(sh => ({ id: sh.id, kind: sh.kind, x: sh.x, y: sh.y, z: sh.z, tx: sh.tx, ty: sh.ty, tz: sh.tz, t: Math.round(sh.t * 100) / 100, total: Math.round(sh.total * 100) / 100 })),
      events: s.events, previews: s.previews, paused: this.paused, night: Math.round(s.night * 100) / 100, rain: s.rain, hunger: s.hunger,
      research: s.research, spent: s.spent, formations: s.formations.map(f => [f.ram, f.broken > 0 ? 0 : 1, Math.round(f.facing * 100)]),
      result: s.result, boss: boss ? [Math.round(boss.hp), boss.maxHp] : null, mapId: s.mapId, diff: s.diff,
      lanesOpen: MAPS[s.mapId].lanes.filter(l => l.opensAt <= Math.max(1, s.wave + 1)).map(l => l.id),
    };
    s.events = [];
    return toWire(snap);
  }

  private broadcast(m: ServerMsg) { const d = JSON.stringify(m); for (const ws of this.sockets) if (ws) try { ws.send(d); } catch { /* gone */ } }
  private send(ws: Socket | null, m: ServerMsg) { try { ws?.send(JSON.stringify(m)); } catch { /* gone */ } }
}

const roundRes = (r: { wood: number; stone: number; food: number; gold: number }) => ({ wood: Math.floor(r.wood), stone: Math.floor(r.stone), food: Math.floor(r.food), gold: Math.floor(r.gold) });
const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const MAX_ROOMS = 200;

export class RoomRegistry {
  rooms = new Map<string, Room>();
  create(o: RoomOpts): Room | { error: string } {
    this.sweep();
    if (this.rooms.size >= MAX_ROOMS) return { error: 'server_full' };
    let code: string;
    do { code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (this.rooms.has(code));
    const r = Room.create(code, o);
    if ('error' in r) return r;
    r.start();
    this.rooms.set(code, r);
    return r;
  }
  get(code: string) { return this.rooms.get(String(code).toUpperCase()); }
  /** abandoned games after 30 min, never-joined rooms after 3 min, finished games after 10 min */
  sweep(now = Date.now()) {
    for (const [code, r] of this.rooms) {
      const empty = !r.sockets[0] && !r.sockets[1], idle = now - r.lastActive;
      if ((empty && idle > 30 * 60_000) || (!r.everFull && empty && now - r.createdAt > 180_000) || (r.finished && empty && idle > 10 * 60_000)) { r.stop(); this.rooms.delete(code); }
    }
  }
}
