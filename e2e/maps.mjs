// One prep-phase shot per map plus the lobby: node e2e/maps.mjs <outDir> [maps,...]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? '/tmp/shots', maps = (process.argv[3] ?? 'frost,oasis,ridge').split(',');
const BASE = process.env.BASE ?? 'http://localhost:5173';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [i, map] of maps.entries()) {
  const A = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), B = await (await b.newContext()).newPage();
  await A.goto(BASE + '/'); await A.waitForTimeout(3000);
  if (i === 0) await A.screenshot({ path: `${out}/lobby.png` });
  await A.evaluate(m => document.querySelector(`.mapcard[data-map="${m}"]`).click(), map); await A.waitForTimeout(1500);
  await A.evaluate(() => document.querySelector('#create').click()); await A.waitForSelector('.bigcode', { timeout: 60000 });
  const code = await A.textContent('.bigcode');
  await B.goto(BASE + '/?room=' + code); await B.waitForTimeout(1500); await B.evaluate(() => document.querySelector('#join').click());
  await A.waitForSelector('.shop .card', { timeout: 60000 }); await B.bringToFront(); await A.bringToFront(); await A.waitForTimeout(2500);
  await A.evaluate(() => {
    const c = window.__bw.conn, m = window.__bw.world.map, z = m.placeZone, mid = (z.y0 + z.y1) / 2;
    [['bowtower', 14, -8], ['goldmine', 24, 6]].forEach(([k, dx, dy]) => c.cmd({ c: 'build', kind: k, x: z.x0 + dx, y: mid + dy }));
    for (const [t, dx, dy] of [['knight', 30, -4], ['archer', 36, 8], ['catapult', 44, -10]]) c.cmd({ c: 'buy', troop: t, x: m.barriers[1].x + 14 + dx * 0.2, y: mid + dy });
    window.__bw.world.target.set(m.barriers[1].x, 0, m.depth / 2);
  });
  await A.waitForTimeout(2500);
  await A.screenshot({ path: `${out}/map-${map}.png` });
  await A.context().close(); await B.context().close();
}
await b.close();
