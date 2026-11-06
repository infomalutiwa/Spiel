// Two phones play together: create, join, build, train, call a wave. Screenshots into <outdir>.
import { chromium, startServer, watch } from './tw-lib.mjs';
const out = process.argv[2] ?? '.';
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = { viewport: { width: 844, height: 390 }, deviceScaleFactor: Number(process.env.DPR ?? 1), hasTouch: true, isMobile: true };
const a = await browser.newPage(ctx), b = await browser.newPage(ctx);
const errs = [...watch(a, 'A'), ...watch(b, 'B')];
const errsA = watch(a, 'A'), errsB = watch(b, 'B');
await a.goto(srv.url + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await a.waitForSelector('#create', { timeout: 120000 });
await a.waitForTimeout(1500);
await a.screenshot({ path: `${out}/01-lobby.png` });
await a.click('#create');
await a.waitForFunction(() => window.__tw?.game?.conn?.code, null, { timeout: 120000 });
const code = await a.evaluate(() => window.__tw.game.conn.code);
console.log('room', code);
await b.goto(`${srv.url}/?room=${code}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await b.waitForSelector('#joinBtn', { timeout: 120000 });
await b.click('#joinBtn');
await b.waitForFunction(() => window.__tw?.game?.conn?.peerConnected, null, { timeout: 120000 });
await a.waitForTimeout(2500);
await a.screenshot({ path: `${out}/02-start.png` });
// the pre-built settlement up close, then the building guide
await a.evaluate(() => { const w = window.__tw.world, k = [...window.__tw.game.conn.structs.values()].find(x => x.kind === 'keep'); w.target.set((k.cx + 2) * 4, 0, (k.cy + 2) * 4 - 34); w.dist = 230; });
await a.waitForTimeout(2500);
await a.screenshot({ path: `${out}/02-base.png` });
await a.click('#codex');
await a.waitForTimeout(500);
await a.screenshot({ path: `${out}/02-codex.png` });
await a.click('.codex .x');
// build a little fortress through the real command path
await a.evaluate(() => {
  const g = window.__tw.game, c = g.conn, k = [...c.structs.values()].find(x => x.kind === 'keep'), m = { keep: { x: (k.cx + 2) * 4, y: (k.cy + 2) * 4 } };
  const row = Math.floor((m.keep.y - 70) / 4), cells = [];
  const kx = Math.floor(m.keep.x / 4); for (let x = kx - 14; x < kx + 14; x++) cells.push([x, row]);
  c.cmd({ c: 'build', kind: 'wall', cells });
  c.cmd({ c: 'build', kind: 'gate', cells: [[kx, row]] });
  c.cmd({ c: 'build', kind: 'tower_bow', cells: [[kx - 5, row]] });
  c.cmd({ c: 'build', kind: 'tower_bow', cells: [[kx + 5, row]] });
  c.cmd({ c: 'build', kind: 'barracks', cells: [[kx - 4, row + 6]] });
  c.cmd({ c: 'build', kind: 'range', cells: [[kx + 3, row + 6]] });
  window.__tw.world.target.set(m.keep.x, 0, m.keep.y - 80); window.__tw.world.dist = 110;
});
await a.waitForTimeout(26000);
await a.evaluate(() => {
  const g = window.__tw.game, c = g.conn;
  for (const s of c.structs.values()) {
    if (s.kind === 'range') c.cmd({ c: 'train', building: s.id, troop: 'archer' });
    if (s.kind === 'barracks') c.cmd({ c: 'train', building: s.id, troop: 'spearman' });
  }
});
await b.evaluate(() => { const c = window.__tw.game.conn; for (const s of c.structs.values()) if (s.kind === 'range') c.cmd({ c: 'train', building: s.id, troop: 'crossbowman' }); });
await a.waitForTimeout(14000);
await a.evaluate(() => {
  const g = window.__tw.game, c = g.conn, s = c.latest();
  const wall = [...c.structs.values()].find(x => x.kind === 'wall');
  const mine = s.squads.filter(q => q.owner === c.you && q.type === 'archer').map(q => q.id);
  if (wall && mine.length) c.cmd({ c: 'order', squads: mine, x: 0, y: 0, structure: wall.id });
  g.ctl.selectSquads(mine);
  c.cmd({ c: 'callWave' });
});
await a.waitForTimeout(6000);
await a.screenshot({ path: `${out}/03-built.png` });
await b.screenshot({ path: `${out}/03-partner.png` });
await a.evaluate(() => { window.__tw.world.target.set(360, 0, 600); window.__tw.world.dist = 170; });
await a.waitForTimeout(30000);
await a.screenshot({ path: `${out}/04-battle.png` });
const st = await a.evaluate(() => { const s = window.__tw.game.conn.latest(); return { wave: s.wave, enemies: s.units.filter(u => u.side === 'e').length, mine: s.units.filter(u => u.side === 'p').length, structs: window.__tw.game.conn.structs.size, kills: s.result }; });
console.log(JSON.stringify(st));
await browser.close(); srv.stop();
const all = [...errsA, ...errsB];
if (all.length) { console.log(all.slice(0, 10).join('\n')); process.exit(1); }
console.log('OK');
