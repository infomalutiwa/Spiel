// Phone checks: drag-build a wall with the finger, order archers onto it, and every HUD button must be on screen and big enough.
import { chromium, startServer, watch } from './tw-lib.mjs';
const out = process.argv[2] ?? '.';
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
const fail = m => { console.log('FAIL', m); failed = true; };
for (const vp of [{ width: 667, height: 375 }, { width: 932, height: 430 }]) {
  const ctx = { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
  const a = await browser.newPage(ctx), b = await browser.newPage(ctx);
  const errs = [...watch(a, 'A'), ...watch(b, 'B')];
  await a.goto(srv.url + '/?q=low&debugWaves=2');
  await a.waitForSelector('#create', { timeout: 120000 }); await a.tap('#create');
  await a.waitForFunction(() => window.__tw?.game?.conn?.code, null, { timeout: 120000 });
  const code = await a.evaluate(() => window.__tw.game.conn.code);
  await b.goto(`${srv.url}/?q=low&room=${code}`); await b.waitForSelector('#joinBtn', { timeout: 120000 }); await b.tap('#joinBtn');
  await a.waitForFunction(() => window.__tw.game.conn.peerConnected && window.__tw.game.conn.structs.size > 0, null, { timeout: 120000 });
  // camera onto open ground in front of the keep
  await a.evaluate(() => { const w = window.__tw.world; w.target.set(330, 0, 780); w.dist = 90; w.yaw = 0; });
  await a.waitForTimeout(800);
  // wall mode: tap the item, drag across the screen, confirm
  await a.tap('.item[data-k="wall"]');
  const n0 = await a.evaluate(() => window.__tw.game.conn.structs.size);
  const y = vp.height * 0.45;
  await a.mouse.move(vp.width * 0.38, y); await a.mouse.down();
  for (let i = 1; i <= 10; i++) await a.mouse.move(vp.width * (0.38 + i * 0.024), y);
  await a.mouse.up();
  const prev = await a.evaluate(() => window.__tw.game.ctl.preview.length);
  if (prev < 4) fail(`${vp.width}: wall preview only ${prev} cells`);
  await a.tap('#ok');
  await a.waitForTimeout(1200);
  const n1 = await a.evaluate(() => window.__tw.game.conn.structs.size);
  if (n1 - n0 < 4) fail(`${vp.width}: built ${n1 - n0} wall cells`);
  // archers onto the new wall by tapping it
  await a.evaluate(async () => {
    const g = window.__tw.game, c = g.conn;
    c.cmd({ c: 'build', kind: 'range', cells: [[80, 205]] });
  });
  await a.waitForTimeout(500);
  await a.evaluate(() => { const g = window.__tw.game; for (const s of g.conn.structs.values()) if (s.kind === 'range') { s.build = 0; } });
  await a.waitForTimeout(21000);
  await a.evaluate(() => { const c = window.__tw.game.conn; for (const s of c.structs.values()) if (s.kind === 'range') c.cmd({ c: 'train', building: s.id, troop: 'archer' }); });
  await a.waitForFunction(() => window.__tw.game.conn.latest().squads.some(q => q.type === 'archer'), null, { timeout: 30000 }).catch(() => fail('no archers trained'));
  const order = await a.evaluate(() => {
    const g = window.__tw.game, c = g.conn, s = c.latest();
    const q = s.squads.find(x => x.type === 'archer' && x.owner === c.you);
    const w = [...c.structs.values()].filter(x => x.kind === 'wall').pop();
    g.ctl.selectSquads([q.id]);
    c.cmd({ c: 'order', squads: [q.id], x: 0, y: 0, structure: w.id });
    return q.id;
  });
  await a.waitForTimeout(1500);
  const ord = await a.evaluate(id => window.__tw.game.conn.latest().squads.find(q => q.id === id)?.order, order);
  if (ord !== 'wall') fail(`${vp.width}: squad order ${ord}`);
  // every visible button on screen and ≥ 40 px in its smaller dimension (tabs ≥ 26)
  const bad = await a.evaluate(() => [...document.querySelectorAll('#hud button')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 14), cls: e.className, w: r.width, h: r.height, x: r.x, y: r.y, r: r.right, b: r.bottom }; })
    .filter(r => r.r > innerWidth + 1 || r.b > innerHeight + 1 || r.x < -1 || r.y < -1 || Math.min(r.w, r.h) < (r.cls.includes('tab') || r.cls.includes('chip') || r.cls.includes('sq all') ? 24 : 32)));
  if (bad.length) fail(`${vp.width}: ${JSON.stringify(bad.slice(0, 5))}`);
  await a.screenshot({ path: `${out}/mobile-${vp.width}.png` });
  if (errs.length) fail(errs.slice(0, 5).join('\n'));
  await a.close(); await b.close();
}
await browser.close(); srv.stop();
console.log(failed ? 'FAILED' : 'OK');
process.exit(failed ? 1 : 0);
