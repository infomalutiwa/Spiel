import type { ClientMsg, Command, PlayerId, ServerMsg, Snapshot } from '@burgwacht/shared';

export interface Timed { at: number; snap: Snapshot }

/** websocket wrapper that buffers snapshots for interpolation */
export class Connection {
  you: PlayerId = 0;
  code = '';
  peerConnected = false;
  snaps: Timed[] = [];
  onSnapshot: (s: Snapshot) => void = () => {};
  onError: (reason: string) => void = () => {};
  onPeer: (connected: boolean) => void = () => {};
  onClose: () => void = () => {};
  private ws!: WebSocket;

  static url(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return import.meta.env.DEV ? `${proto}://${location.hostname}:2567` : `${proto}://${location.host}`;
  }

  /** open a socket and either create a room (no code) or join one */
  static open(code?: string): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const c = new Connection();
      c.ws = new WebSocket(Connection.url());
      let settled = false;
      c.ws.onopen = () => {
        const saved = code ? sessionStorage.getItem(`bw-token-${code.toUpperCase()}`) ?? undefined : undefined;
        c.send(code ? { t: 'join', code: code.toUpperCase(), token: saved } : { t: 'create' });
      };
      c.ws.onmessage = ev => {
        const m: ServerMsg = JSON.parse(ev.data);
        switch (m.t) {
          case 'joined':
            c.you = m.you; c.code = m.code;
            try { sessionStorage.setItem(`bw-token-${m.code}`, m.token); } catch { /* private mode */ }
            settled = true; resolve(c);
            break;
          case 'error':
            if (!settled) { settled = true; reject(new Error(m.reason)); } else c.onError(m.reason);
            break;
          case 'peer': c.peerConnected = m.connected; c.onPeer(m.connected); break;
          case 'snap':
            c.snaps.push({ at: performance.now(), snap: m.s });
            if (c.snaps.length > 6) c.snaps.shift();
            c.onSnapshot(m.s);
            break;
        }
      };
      c.ws.onerror = () => { if (!settled) { settled = true; reject(new Error('connection_failed')); } };
      c.ws.onclose = () => { if (!settled) { settled = true; reject(new Error('connection_failed')); } else c.onClose(); };
    });
  }

  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  cmd(cmd: Command) { this.send({ t: 'cmd', cmd }); }

  latest(): Snapshot | undefined { return this.snaps[this.snaps.length - 1]?.snap; }
}

export interface Interp { a: Snapshot; b: Snapshot; alpha: number }

/** pick the two snapshots around `renderAt` (performance.now() - delay) */
export function interpolation(snaps: Timed[], renderAt: number): Interp | undefined {
  if (!snaps.length) return undefined;
  if (snaps.length === 1) return { a: snaps[0].snap, b: snaps[0].snap, alpha: 0 };
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1], b = snaps[i];
    if (renderAt >= a.at) {
      const alpha = Math.min(1, Math.max(0, (renderAt - a.at) / Math.max(1, b.at - a.at)));
      return { a: a.snap, b: b.snap, alpha };
    }
  }
  return { a: snaps[0].snap, b: snaps[1].snap, alpha: 0 };
}
