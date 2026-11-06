import { fromWire, type ClientMsg, type Command, type Difficulty, type PlayerId, type ServerMsg, type Snapshot, type StructSnap, type TalentId } from '@talwacht/shared';

export interface Timed { at: number; snap: Snapshot }
export interface CreateOpts { mapId: string; diff: Difficulty; talents: TalentId[]; unlocks: string[]; save?: string; debugWaves?: number }

/** WebSocket wrapper: buffers snapshots for interpolation and keeps the full structure list up to date */
export class Connection {
  you: PlayerId = 0;
  code = '';
  mapId = 'gruental';
  peerConnected = false;
  snaps: Timed[] = [];
  structs = new Map<number, StructSnap>();
  structRev = -1;
  onSnapshot: (s: Snapshot) => void = () => {};
  onError: (reason: string) => void = () => {};
  onPeer: (connected: boolean) => void = () => {};
  onSave: (data: string, wave: number, mapId: string) => void = () => {};
  onClose: () => void = () => {};
  private ws!: WebSocket;

  static url(): string {
    const remote = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (remote) return remote.replace(/^http/, 'ws');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return import.meta.env.DEV ? `${proto}://${location.hostname}:2568` : `${proto}://${location.host}`;
  }

  /** create a room (opts) or join one (code) */
  static open(target: { code: string } | CreateOpts): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const c = new Connection();
      c.ws = new WebSocket(Connection.url());
      let settled = false;
      c.ws.onopen = () => {
        if ('code' in target) {
          let tok: string | undefined;
          try { tok = sessionStorage.getItem(`tw-token-${target.code.toUpperCase()}`) ?? undefined; } catch { /* blocked storage */ }
          c.send({ t: 'join', code: target.code.toUpperCase(), token: tok });
        } else c.send({ t: 'create', ...target });
      };
      c.ws.onmessage = ev => {
        const m: ServerMsg = JSON.parse(ev.data);
        switch (m.t) {
          case 'joined':
            c.you = m.you; c.code = m.code; c.mapId = m.mapId;
            try { sessionStorage.setItem(`tw-token-${m.code}`, m.token); } catch { /* private mode */ }
            settled = true; resolve(c);
            break;
          case 'error':
            if (!settled) { settled = true; reject(new Error(m.reason)); } else c.onError(m.reason);
            break;
          case 'peer': c.peerConnected = m.connected; c.onPeer(m.connected); break;
          case 'save': c.onSave(m.data, m.wave, m.mapId); break;
          case 'snap': {
            const snap = fromWire(m.s);
            c.applyStructs(snap);
            c.snaps.push({ at: performance.now(), snap });
            if (c.snaps.length > 6) c.snaps.shift();
            c.onSnapshot(snap);
            break;
          }
        }
      };
      c.ws.onerror = () => { if (!settled) { settled = true; reject(new Error('connection_failed')); } };
      c.ws.onclose = () => { if (!settled) { settled = true; reject(new Error('connection_failed')); } else c.onClose(); };
    });
  }

  private applyStructs(s: Snapshot) {
    if (s.structs) {
      this.structs = new Map(s.structs.map(x => [x.id, x]));
      this.structRev = s.sRev;
    }
    for (const [id, hp, state, build, burning] of s.sHp) {
      const st = this.structs.get(id);
      if (st) { st.hp = hp; st.state = state; st.build = build; st.burning = burning; }
    }
  }

  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  cmd(cmd: Command) { this.send({ t: 'cmd', cmd }); }
  latest(): Snapshot | undefined { return this.snaps[this.snaps.length - 1]?.snap; }
  close() { try { this.ws.close(); } catch { /* closed */ } }
}

export interface Interp { a: Snapshot; b: Snapshot; alpha: number }
export function interpolation(snaps: Timed[], renderAt: number): Interp | undefined {
  if (!snaps.length) return undefined;
  if (snaps.length === 1) return { a: snaps[0].snap, b: snaps[0].snap, alpha: 0 };
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1], b = snaps[i];
    if (renderAt >= a.at) return { a: a.snap, b: b.snap, alpha: Math.min(1, Math.max(0, (renderAt - a.at) / Math.max(1, b.at - a.at))) };
  }
  return { a: snaps[0].snap, b: snaps[1].snap, alpha: 0 };
}
