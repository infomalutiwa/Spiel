// Screenshot tour for visual review: node e2e/shots.mjs <outDir> <WxH[,WxH...]> [mobile]
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
  const tag = `${outDir}/${size}`;
  await A.goto(BASE + '/?room='); await A.waitForTimeout(2500);
  await A.screenshot({ path: `${tag}-1-lobby.png` });
  await A.evaluate(() => document.querySelector('#create').click()); await A.waitForSelector('.bigcode', { timeout: 40000 });
  const code = await A.textContent('.bigcode');
  await B.goto(BASE + '/?room=' + code); await B.waitForTimeout(1200); await B.evaluate(() => document.querySelector('#join').click());
  await A.waitForSelector('.shop .card', { timeout: 40000 }); await A.waitForTimeout(3500);
  // a sensible setup through the real command channel
  await A.evaluate(() => {
    const c = window.__bw.conn, m = window.__bw.world.map, g = m.barriers[0].gateY, bx = m.barriers[0].x;
    const buy = (t, x, y) => c.cmd({ c: 'buy', troop: t, x, y });
    buy('archer', bx, g - 18); buy('knight', bx - 8, g - 4); buy('catapult', bx - 18, g - 16);
  });
  await B.evaluate(() => {
    const c = window.__bw.conn, m = window.__bw.world.map, g = m.barriers[0].gateY, bx = m.barriers[0].x;
    const buy = (t, x, y) => c.cmd({ c: 'buy', troop: t, x, y });
    buy('crossbowman', bx, g + 18); buy('spearman', bx - 8, g + 6); buy('healer', bx - 18, g + 10);
  });
  await A.waitForTimeout(1500);
  await A.screenshot({ path: `${tag}-2-prep.png` });
  await A.evaluate(() => { const w = window.__bw.world, m = w.map; w.target.set(m.barriers[0].x - 16, 0, m.barriers[0].gateY); w.dist = 52; w.pitch = 0.62; w.yaw = 0.7; });
  await A.waitForTimeout(800);
  await A.screenshot({ path: `${tag}-3-closeup.png` });
  await A.evaluate(() => { const c = window.__bw.controls, w = window.__bw.world; c.wallSel = w.map.walls.findIndex(x => x.kind === 'gate' && x.bar === 0); c.onChange(); const s = c.snapshot(); });
  await A.waitForTimeout(600);
  await A.screenshot({ path: `${tag}-4-wallpanel.png` });
  await A.evaluate(() => { const c = window.__bw.controls; c.wallSel = -1; const s = c.snapshot(); const id = s.units.find(u => u.owner === c.me() && u.type === 'archer')?.id; if (id) c.selectSquad(s.units.find(u => u.id === id).squad); const w = window.__bw.world, m = w.map; w.target.set((m.barriers[0].x + m.barriers[1].x) / 2 - 6, 0, m.depth / 2); w.dist = 100; w.pitch = 0.95; w.yaw = 0; });
  await A.waitForTimeout(800);
  await A.screenshot({ path: `${tag}-5-selected.png` });
  for (const P of [A, B]) await P.evaluate(() => document.querySelector('#ready')?.click());
  await A.waitForFunction(() => window.__bw.conn.latest()?.phase === 'battle', null, { timeout: 60000 });
  await A.waitForTimeout(20000);
  await A.screenshot({ path: `${tag}-6-battle.png` });
  await A.evaluate(() => { const w = window.__bw.world, m = w.map; w.target.set(m.barriers[0].x + 4, 0, m.barriers[0].gateY); w.dist = 55; w.pitch = 0.7; w.yaw = 1.0; });
  await A.waitForTimeout(1000);
  await A.screenshot({ path: `${tag}-7-gate.png` });
  await A.context().close(); await B.context().close();
}
await b.close();
