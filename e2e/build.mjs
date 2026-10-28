// Builds all four buildings in the courtyard, opens the panel of one and shoots the result: node e2e/build.mjs <outDir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? '/tmp/shots';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const A = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), B = await (await b.newContext()).newPage();
await A.goto(BASE + '/'); await A.waitForTimeout(3000);
await A.evaluate(() => document.querySelector('#create').click()); await A.waitForSelector('.bigcode', { timeout: 60000 });
const code = await A.textContent('.bigcode');
await B.goto(BASE + '/?room=' + code); await B.waitForTimeout(1500); await B.evaluate(() => document.querySelector('#join').click());
await A.waitForSelector('.shop .card', { timeout: 60000 }); await B.bringToFront(); await A.bringToFront(); await A.waitForTimeout(3000);
await A.evaluate(() => {
  const c = window.__bw.conn, z = window.__bw.world.map.placeZone;
  [['bowtower', 0, 0], ['goldmine', 10, 10], ['ballista', 10, 0], ['infirmary', 0, 10]].forEach(([k, dx, dy]) => c.cmd({ c: 'build', kind: k, x: z.x0 + 12 + dx, y: (z.y0 + z.y1) / 2 - 5 + dy }));
});
await A.waitForTimeout(3000);
const ids = await A.evaluate(() => window.__bw.controls.snapshot().units.filter(u => ['bowtower','ballista','goldmine','infirmary'].includes(u.type)).map(u => u.type));
console.log('buildings in snapshot:', ids.join(','));
await A.evaluate(() => { const c = window.__bw.controls; const u = c.snapshot().units.find(u => u.type === 'bowtower'); c.buildingSel = u.id; c.onChange(); window.__bw.world.target.set(u.x + 6, 0, u.y + 5); });
await A.waitForTimeout(800);
await A.screenshot({ path: `${out}/build.png` });
await b.close();
