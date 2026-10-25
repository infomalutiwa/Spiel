import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
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
  '.svg': 'image/svg+xml', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.gltf', '.bin', '.glb', '.svg', '.wasm']);
const gzCache = new Map<string, { key: string; z: Buffer }>();
const send = (req: IncomingMessage, res: ServerResponse, file: string, data: Buffer, type: string) => {
  const gz = COMPRESSIBLE.has(extname(file)) && data.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  const headers: Record<string, string> = { 'content-type': type, 'cache-control': file.includes('/assets/') && !file.endsWith('index.html') ? 'public, max-age=3600' : 'no-cache' };
  if (!gz) { res.writeHead(200, headers); return res.end(data); }
  const key = `${data.length}:${data[0]}:${data[data.length - 1]}:${data[data.length >> 1]}`; // cheap content fingerprint: a rebuild never serves stale bytes
  let z = gzCache.get(file)?.z;
  if (!z || gzCache.get(file)!.key !== key) { z = gzipSync(data, { level: 6 }); if (gzCache.size < 400) gzCache.set(file, { key, z }); }
  res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
  res.end(z);
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel === '/' || rel === '\\' ? 'index.html' : rel);
  try {
    if (!file.startsWith(DIST)) throw new Error('outside');
    const data = await readFile(file);
    send(req, res, file, data, MIME[extname(file)] ?? 'application/octet-stream');
  } catch {
    if (extname(url.pathname)) { res.writeHead(404); return res.end('not found'); } // a missing asset must be a 404, not index.html
    try {
      const idx = join(DIST, 'index.html');
      send(req, res, idx, await readFile(idx), MIME['.html']);
    } catch {
      res.writeHead(404); res.end('client not built – run `npm run build`');
    }
  }
});

const rooms = new RoomRegistry();
// optional: ALLOWED_ORIGINS=https://my-game.web.app,https://my-game.firebaseapp.com keeps other sites from using this server
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
const wss = new WebSocketServer({
  server: http, maxPayload: 16 * 1024,
  verifyClient: ({ origin }: { origin?: string }) => ALLOWED.length === 0 || (!!origin && ALLOWED.includes(origin)),
});
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

// room creation is rate-limited per client address (behind Cloud Run / proxies the real address is in x-forwarded-for)
const creates = new Map<string, number[]>();
const mayCreate = (ip: string) => {
  const now = Date.now(), list = (creates.get(ip) ?? []).filter(t => now - t < 10 * 60_000);
  if (list.length >= 12) { creates.set(ip, list); return false; }
  list.push(now); creates.set(ip, list);
  if (creates.size > 5000) for (const [k, v] of creates) if (!v.some(t => now - t < 10 * 60_000)) creates.delete(k);
  return true;
};

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim();
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
        if (!mayCreate(ip)) return err('too_many_rooms');
        room = rooms.create(typeof msg.mapId === 'string' ? msg.mapId : undefined);
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
