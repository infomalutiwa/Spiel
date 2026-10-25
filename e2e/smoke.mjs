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
  const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
  p.setDefaultTimeout(90000); // software rendering is slow; the 3D scene hogs the main thread
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/GLTFLoader|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return p;
};
// clicking through the page's own event loop avoids 'element not stable' while the 3D scene is busy
const jsClick = (p, sel) => p.evaluate(s => document.querySelector(s).click(), sel);
const check = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  :', msg); };
const snap = p => p.evaluate(() => window.__bw.conn.latest());
const until = async (p, fn, ms = 30000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (fn(await snap(p))) return true; await p.waitForTimeout(250); }
  return false;
};

const a = await open(), b = await open();
await a.goto(BASE); await jsClick(a, '#create');
await a.waitForSelector('.bigcode');
const code = (await a.textContent('.bigcode')).trim();
check(/^[A-Z]{4}$/.test(code), `room code ${code}`);
await b.goto(`${BASE}/?room=${code}`); await jsClick(b, '#join');
check(await until(a, s => s && !s.paused), 'both players connected, game running');

const buy = (p, list) => p.evaluate(l => l.forEach(([t, x, y]) => window.__bw.conn.cmd({ c: 'buy', troop: t, x, y })), list);
// troops come as squads: archers go onto the wall crown, knights stand behind the gate
const gy = await a.evaluate(() => window.__bw.world.map.barriers[0].gateY), bx = await a.evaluate(() => window.__bw.world.map.barriers[0].x);
await buy(a, [['archer', bx, gy - 18], ['knight', bx - 8, gy - 4]]);
await buy(b, [['crossbowman', bx, gy + 18], ['healer', bx - 16, gy + 8]]);
check(await until(a, s => s.units.filter(u => u.owner !== null && u.squad > 0).length === 10 + 6 + 6 + 3), 'four squads bought and placed');
check(await until(a, s => s.units.filter(u => u.type === 'archer').every(u => Math.abs(u.x - bx) < 0.01)), 'archers stand on the wall line');
await a.waitForSelector('.chip');
check((await a.$$('.chip')).length === 2, 'squad chips show up');

// third client is turned away
const c = await open(); await c.goto(`${BASE}/?room=${code}`); await jsClick(c, '#join');
await c.waitForSelector('.err:not(:empty)');
check((await c.textContent('.err')).includes('voll'), 'third player is rejected with a clear message');

await a.keyboard.press('Space'); await b.keyboard.press('Space');
check(await until(a, s => s.phase === 'battle'), 'battle starts when both are ready');
check(await until(a, s => s.units.some(u => u.side === 'enemy')), 'enemy wave spawns');

// one player drops and rejoins: game pauses, seat is restored
await b.reload();
await b.waitForSelector('#lobby');
await jsClick(b, '#join');
check(await until(a, s => !s.paused, 90000), 'rejoin by code resumes the game');

check(await until(a, s => s.units.some(u => u.side === 'enemy' && u.hp < u.maxHp), 150000), 'fighting happens (enemies take damage)');
check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
