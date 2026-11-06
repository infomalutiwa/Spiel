import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, PlayerId } from '@talwacht/shared';
import { RoomRegistry, type Room } from './room';

const PORT = Number(process.env.TW_PORT ?? process.env.PORT ?? 2568);
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '../../../client/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.gltf', '.bin', '.glb', '.svg']);
const gz = new Map<string, { key: string; z: Buffer }>();

function send(req: IncomingMessage, res: ServerResponse, file: string, data: Buffer, type: string) {
  const zip = COMPRESSIBLE.has(extname(file)) && data.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  const headers: Record<string, string> = { 'content-type': type, 'cache-control': file.includes('/assets/') ? 'public, max-age=3600' : 'no-cache' };
  if (!zip) { res.writeHead(200, headers); return res.end(data); }
  const key = createHash('sha1').update(data).digest('hex');
  let z = gz.get(file)?.key === key ? gz.get(file)!.z : undefined;
  if (!z) { z = gzipSync(data, { level: 6 }); if (gz.size < 500) gz.set(file, { key, z }); }
  res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
  res.end(z);
}

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, rel === '/' || rel === '\\' ? 'index.html' : rel);
  try {
    if (!file.startsWith(DIST)) throw new Error('outside');
    send(req, res, file, await readFile(file), MIME[extname(file)] ?? 'application/octet-stream');
  } catch {
    if (extname(url.pathname)) { res.writeHead(404); return res.end('not found'); }
    try { const idx = join(DIST, 'index.html'); send(req, res, idx, await readFile(idx), MIME['.html']); }
    catch { res.writeHead(404); res.end('Client nicht gebaut – bitte `npm run build:tw` ausführen'); }
  }
});

const rooms = new RoomRegistry();
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
// saved rounds are uploaded with the create message, so the very first message may be large
const wss = new WebSocketServer({ server: http, maxPayload: 2 * 1024 * 1024, verifyClient: ({ origin }: { origin?: string }) => !ALLOWED.length || (!!origin && ALLOWED.includes(origin)) });
setInterval(() => rooms.sweep(), 60_000).unref();

const alive = new WeakSet<WebSocket>();
setInterval(() => {
  for (const ws of wss.clients) { if (!alive.has(ws)) { ws.terminate(); continue; } alive.delete(ws); try { ws.ping(); } catch { /* closing */ } }
}, 8_000).unref();

const creates = new Map<string, number[]>();
const mayCreate = (ip: string) => {
  const now = Date.now(), list = (creates.get(ip) ?? []).filter(t => now - t < 600_000);
  if (list.length >= 12) { creates.set(ip, list); return false; }
  list.push(now); creates.set(ip, list);
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
      let room: Room | { error: string } | undefined;
      if (msg?.t === 'create') {
        if (!mayCreate(ip)) return err('too_many_rooms');
        room = rooms.create({ mapId: String(msg.mapId), diff: msg.diff, talents: msg.talents, unlocks: msg.unlocks, save: typeof msg.save === 'string' ? msg.save : undefined, debugWaves: Number(msg.debugWaves) || undefined });
      } else if (msg?.t === 'join') {
        room = typeof msg.code === 'string' ? rooms.get(msg.code) : undefined;
        if (!room) return err('room_not_found');
      } else return err('bad_message');
      if ('error' in room) return err(room.error);
      const r = room.join(ws, msg.t === 'join' && typeof msg.token === 'string' ? msg.token : undefined);
      if ('error' in r) return err(r.error);
      seat = { room, you: r.you };
    } catch (e) { console.error('message failed', e); err('bad_message'); }
  });
  ws.on('close', () => seat?.room.leave(ws));
  ws.on('error', () => seat?.room.leave(ws));
});

http.listen(PORT, () => console.log(`Talwacht-Server auf http://localhost:${PORT}`));
