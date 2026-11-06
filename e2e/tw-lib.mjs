// shared helpers for the Talwacht end-to-end scripts: start the server on a free port, open pages
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const { chromium, webkit } = require('playwright');

export async function startServer(port = 2600 + Math.floor(Math.random() * 300)) {
  const p = spawn('npx', ['tsx', 'talwacht/server/src/net/server.ts'], { env: { ...process.env, TW_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  p.stdout.on('data', d => (log += d)); p.stderr.on('data', d => (log += d));
  for (let i = 0; i < 100 && !log.includes('Talwacht-Server'); i++) await new Promise(r => setTimeout(r, 100));
  if (!log.includes('Talwacht-Server')) throw new Error('server did not start: ' + log);
  return { url: `http://localhost:${port}`, stop: () => { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } }, log: () => log };
}

/** collects console errors and page errors */
export function watch(page, name) {
  const errors = [];
  page.on('pageerror', e => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text().slice(0, 300)}`); });
  return errors;
}
