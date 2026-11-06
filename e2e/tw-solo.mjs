// One player alone: create a solo round, the game runs without a partner, call the first wave, fight. Screenshots into <outdir>.
import { chromium, startServer, watch } from './tw-lib.mjs';
const out = process.argv[2] ?? '.';
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const a = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const errs = watch(a, 'solo');
await a.goto(srv.url + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await a.waitForSelector('#solo', { timeout: 120000 });
await a.screenshot({ path: `${out}/solo-1-lobby.png` });
await a.click('#solo');
await a.waitForFunction(() => window.__tw?.game?.conn?.latest?.(), null, { timeout: 120000 });
await a.waitForTimeout(3000);
const st = await a.evaluate(() => { const c = window.__tw.game.conn, s = c.latest(); return { solo: c.solo, paused: s.paused, squads: document.querySelectorAll('#squads .sq, #squads > *').length }; });
console.log('state', JSON.stringify(st));
if (!st.solo || st.paused) throw new Error('solo round did not start: ' + JSON.stringify(st));
await a.screenshot({ path: `${out}/solo-2-start.png` });
await a.evaluate(() => window.__tw.game.conn.cmd({ c: 'callWave' }));
await a.waitForTimeout(25000);
const after = await a.evaluate(() => { const s = window.__tw.game.conn.latest(); return { wave: s.wave, paused: s.paused, enemies: s.units ? s.units.length : -1 }; });
console.log('after', JSON.stringify(after));
await a.screenshot({ path: `${out}/solo-3-battle.png` });
await browser.close(); srv.stop();
if (errs.length) { console.log(errs); process.exit(1); }
if (after.paused || after.wave < 1) { console.log('FAIL'); process.exit(1); }
console.log('OK');
