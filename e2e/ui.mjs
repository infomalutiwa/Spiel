// Focused UI shots (prep + battle) for several screen sizes: node e2e/ui.mjs <outDir> <WxH,...> [mobile]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const [outDir = '/tmp/shots', sizes = '1280x720', mobile = ''] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:5173';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const size of sizes.split(',')) {
  const [w, h] = size.split('x').map(Number);
  const opts = mobile ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent } : { viewport: { width: w, height: h } };
  const A = await (await b.newContext(opts)).newPage(), B = await (await b.newContext(opts)).newPage();
  const tag = `${outDir}/${mobile ? 'm' : 'd'}${size}`;
  await A.goto(BASE + '/'); await A.waitForTimeout(3000);
  await A.screenshot({ path: `${tag}-1-lobby.png` });
  await A.evaluate(() => document.querySelector('#create').click()); await A.waitForSelector('.bigcode', { timeout: 60000 });
  const code = await A.textContent('.bigcode');
  await A.screenshot({ path: `${tag}-2-waiting.png` });
  await B.goto(BASE + '/?room=' + code); await B.waitForTimeout(1500); await B.evaluate(() => document.querySelector('#join').click());
  await A.waitForSelector('.shop .card', { timeout: 60000 }); await A.waitForTimeout(2500);
  const setup = (side) => (window) => 0;
  await A.evaluate(() => { const c = window.__bw.conn, m = window.__bw.world.map, g = m.barriers[0].gateY, bx = m.barriers[0].x; for (const [t, x, y] of [['archer', bx, g - 18], ['knight', bx - 8, g - 4], ['catapult', bx - 18, g - 16], ['healer', bx - 16, g - 8]]) c.cmd({ c: 'buy', troop: t, x, y }); });
  await B.evaluate(() => { const c = window.__bw.conn, m = window.__bw.world.map, g = m.barriers[0].gateY, bx = m.barriers[0].x; for (const [t, x, y] of [['crossbowman', bx, g + 18], ['spearman', bx - 8, g + 4], ['cavalry', bx - 24, g + 8]]) c.cmd({ c: 'buy', troop: t, x, y }); });
  await A.waitForTimeout(1500);
  await A.screenshot({ path: `${tag}-3-prep.png` });
  await A.evaluate(() => { const c = window.__bw.controls, w = window.__bw.world; c.wallSel = w.map.walls.findIndex(x => x.kind === 'gate' && x.bar === 0); c.onChange(); });
  await A.waitForTimeout(800);
  await A.screenshot({ path: `${tag}-4-wallpanel.png` });
  await A.evaluate(() => { window.__bw.controls.wallSel = -1; window.__bw.controls.onChange(); });
  for (const P of [A, B]) await P.evaluate(() => document.querySelector('#ready')?.click());
  await A.waitForFunction(() => window.__bw.conn.latest()?.phase === 'battle', null, { timeout: 90000, polling: 100 });
  await A.evaluate(() => { const c = window.__bw.controls, s = c.snapshot(); const sq = s.units.find(u => u.owner === c.me() && u.type === 'archer')?.squad; if (sq) c.selectSquad(sq); });
  await A.screenshot({ path: `${tag}-6-battle-sel.png` });
  await A.evaluate(() => { window.__bw.controls.clearSelection(); });
  await A.screenshot({ path: `${tag}-5-battle-nosel.png` });
  await A.context().close(); await B.context().close();
}
await b.close();
