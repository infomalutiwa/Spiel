import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, PlayerId } from '@burgwacht/shared';
import { RoomRegistry, type Room } from './room';

const PORT = Number(process.env.PORT ?? 2567);
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '../../../client/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel === '/' || rel === '\\' ? 'index.html' : rel);
  try {
    if (!file.startsWith(DIST)) throw new Error('outside');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    try {
      const data = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('client not built – run `npm run build`');
    }
  }
});

const rooms = new RoomRegistry();
const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });
setInterval(() => rooms.sweep(), 60_000).unref();

// half-open connections (sleeping laptop, dropped wifi) never emit 'close': ping everyone and cut those that stay silent
const alive = new WeakSet<WebSocket>();
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) { ws.terminate(); continue; }
    alive.delete(ws);
    try { ws.ping(); } catch { /* closing */ }
  }
}, 8_000).unref();

wss.on('connection', (ws: WebSocket) => {
  let seat: { room: Room; you: PlayerId } | null = null;
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  const err = (reason: string) => { try { ws.send(JSON.stringify({ t: 'error', reason })); } catch { /* closed */ } };

  ws.on('message', data => {
    try {
      alive.add(ws);
      const raw = data.toString();
      if (seat) return seat.room.handle(seat.you, raw);
      let msg: ClientMsg;
      try { msg = JSON.parse(raw); } catch { return err('bad_message'); }
      if (!msg || typeof msg !== 'object') return err('bad_message');
      let room: Room | undefined | null;
      if (msg.t === 'create') {
        room = rooms.create();
        if (!room) return err('server_full');
      } else if (msg.t === 'join') {
        room = typeof msg.code === 'string' ? rooms.get(msg.code) : undefined;
        if (!room) return err('room_not_found');
      } else return err('bad_message');
      const res = room.join(ws, msg.t === 'join' && typeof msg.token === 'string' ? msg.token : undefined);
      if ('error' in res) return err(res.error);
      seat = { room, you: res.you };
    } catch (e) { // one bad message must never take every room down
      console.error('message handler failed', e);
      err('bad_message');
    }
  });
  ws.on('close', () => seat?.room.leave(ws));
  ws.on('error', () => seat?.room.leave(ws));
});

http.listen(PORT, () => console.log(`Burgwacht server on http://localhost:${PORT}`));
