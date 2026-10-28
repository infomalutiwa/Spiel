// Beauty shots: node e2e/look.mjs <outDir> <WxH> [night=0..1]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [outDir = '/tmp/shots', size = '1280x720', night = '0'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const BASE = process.env.BASE ?? 'http://localhost:5173';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const A = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
await A.goto(`${BASE}/?night=${night}`); await A.waitForTimeout(2500);
await A.evaluate(() => document.querySelector('#create').click()); await A.waitForSelector('.bigcode', { timeout: 60000 });
await A.addStyleTag({ content: '.overlay{display:none!important}' });
await A.waitForSelector('.shop .card', { timeout: 60000 }).catch(() => {});
await A.evaluate(() => { const c = window.__bw.conn, m = window.__bw.world.map, g = m.barriers[0].gateY, bx = m.barriers[0].x; for (const [t, x, y] of [['archer', bx, g - 18], ['knight', bx - 8, g - 4], ['catapult', bx - 18, g - 16], ['healer', bx - 14, g - 8]]) c.cmd({ c: 'buy', troop: t, x, y }); });
const shot = async (name, f) => { await A.evaluate(f); await A.waitForTimeout(2500); await A.screenshot({ path: `${outDir}/look-${night}-${name}.png` }); };
await shot('overview', () => { const w = window.__bw.world, m = w.map; w.target.set((m.barriers[0].x + m.barriers[1].x) / 2 - 6, 0, m.depth / 2); w.dist = 105; w.pitch = 0.95; w.yaw = 0; });
await shot('gate', () => { const w = window.__bw.world, m = w.map; w.target.set(m.barriers[0].x - 4, 0, m.barriers[0].gateY); w.dist = 46; w.pitch = 0.55; w.yaw = 0.9; });
await shot('courtyard', () => { const w = window.__bw.world, m = w.map; w.target.set(m.barriers[1].x + 24, 0, 18); w.dist = 60; w.pitch = 0.5; w.yaw = -0.5; });
await shot('keep', () => { const w = window.__bw.world, m = w.map; w.target.set(m.castle.x + 16, 0, m.castle.y); w.dist = 62; w.pitch = 0.6; w.yaw = -0.6; });
await b.close();
