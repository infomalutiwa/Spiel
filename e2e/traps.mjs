// Pitch ditch + pits in front of the outer wall, lit in battle: node e2e/traps.mjs <outDir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? '/tmp/shots', BASE = process.env.BASE ?? 'http://localhost:5173';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const A = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), B = await (await b.newContext()).newPage();
await A.goto(BASE + '/'); await A.waitForTimeout(3000);
await A.evaluate(() => document.querySelector('#create').click()); await A.waitForSelector('.bigcode', { timeout: 60000 });
const code = await A.textContent('.bigcode');
await B.goto(BASE + '/?room=' + code); await B.waitForTimeout(1500); await B.evaluate(() => document.querySelector('#join').click());
await A.waitForSelector('.shop .card', { timeout: 60000 }); await B.bringToFront(); await A.bringToFront(); await A.waitForTimeout(2500);
await A.evaluate(() => {
  const c = window.__bw.conn, m = window.__bw.world.map, o = m.barriers[0];
  c.cmd({ c: 'build', kind: 'pitch', x: o.x + 16, y: o.gateY });
  c.cmd({ c: 'build', kind: 'pit', x: o.x + 30, y: o.gateY - 4 }); c.cmd({ c: 'build', kind: 'pit', x: o.x + 30, y: o.gateY + 5 });
  c.cmd({ c: 'buy', troop: 'archer', x: o.x, y: o.gateY - 14 });
  window.__bw.world.target.set(o.x + 18, 0, o.gateY);
});
await A.waitForTimeout(2000);
await A.screenshot({ path: `${out}/traps-prep.png` });
for (const P of [A, B]) await P.evaluate(() => document.querySelector('#ready')?.click());
await A.waitForFunction(() => window.__bw.conn.latest()?.phase === 'battle', null, { timeout: 90000, polling: 200 });
await A.waitForFunction(() => window.__bw.conn.latest()?.units.some(u => u.side === 'enemy' && u.x < window.__bw.world.map.barriers[0].x + 30), null, { timeout: 90000, polling: 200 });
await A.evaluate(() => { const c = window.__bw.conn, p = c.latest().units.find(u => u.type === 'pitch'); c.cmd({ c: 'ignite', id: p.id }); });
await A.waitForTimeout(2500);
await A.screenshot({ path: `${out}/traps-fire.png` });
console.log(await A.evaluate(() => JSON.stringify(window.__bw.conn.latest().units.filter(u => u.type === 'pitch' || u.type === 'pit').map(u => [u.type, u.burning]))));
await b.close();
