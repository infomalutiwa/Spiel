// Two-window smoke test: one player creates a room, the other joins by code, both buy troops,
// ready up, a wave spawns and fighting starts. Needs the game server running (npm run dev / npm start)
// and the `playwright` package with a Chromium browser.
// usage: BASE=http://localhost:5173 node e2e/smoke.mjs
import { createRequire } from 'node:module';
// require() honours NODE_PATH, so a globally installed playwright works too
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/GLTFLoader|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return p;
};
const check = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  :', msg); };
const snap = p => p.evaluate(() => window.__bw.conn.latest());
const until = async (p, fn, ms = 30000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (fn(await snap(p))) return true; await p.waitForTimeout(250); }
  return false;
};

const a = await open(), b = await open();
await a.goto(BASE); await a.click('#create');
await a.waitForSelector('.bigcode');
const code = (await a.textContent('.bigcode')).trim();
check(/^[A-Z]{4}$/.test(code), `room code ${code}`);
await b.goto(`${BASE}/?room=${code}`); await b.click('#join');
check(await until(a, s => s && !s.paused), 'both players connected, game running');

const buy = (p, list) => p.evaluate(l => l.forEach(([t, x, y]) => window.__bw.conn.cmd({ c: 'buy', troop: t, x, y })), list);
await buy(a, [['knight', 44, 38], ['archer', 40, 44], ['spearman', 44, 50]]);
await buy(b, [['cavalry', 48, 32], ['healer', 38, 46], ['archer', 40, 40]]);
check(await until(a, s => s.units.filter(u => u.owner !== null && u.type !== 'castle').length === 6), 'six troops bought and placed');

// third client is turned away
const c = await open(); await c.goto(`${BASE}/?room=${code}`); await c.click('#join');
await c.waitForSelector('.err:not(:empty)');
check((await c.textContent('.err')).includes('voll'), 'third player is rejected with a clear message');

await a.keyboard.press('Space'); await b.keyboard.press('Space');
check(await until(a, s => s.phase === 'battle'), 'battle starts when both are ready');
check(await until(a, s => s.units.some(u => u.side === 'enemy')), 'enemy wave spawns');

// one player drops and rejoins: game pauses, seat is restored
await b.reload();
await b.waitForSelector('#lobby');
await b.click('#join');
check(await until(a, s => !s.paused, 15000), 'rejoin by code resumes the game');

check(await until(a, s => s.units.some(u => u.side === 'enemy' && u.hp < u.maxHp) || s.players[0].gold > 0 && s.units.filter(u => u.side === 'enemy').length < 6, 90000), 'fighting happens');
check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
