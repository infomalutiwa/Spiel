// iPhone-style check: touch emulation at phone viewports. Every visible button must lie inside the screen and be
// the topmost element at its centre (no overlay eats the tap); real touch taps must drive lobby, shop and ready button.
// usage: NODE_PATH=$(npm root -g) BASE=http://localhost:5173 node e2e/mobile.mjs [shotDir]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://localhost:2567';
const shotDir = process.argv[2];
const ALL = [[844, 390], [667, 375], [932, 430]];
const SIZES = process.env.SIZES ? ALL.filter(([w, h]) => process.env.SIZES.split(',').includes(`${w}x${h}`)) : ALL; // SIZES=667x375 runs one viewport
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const check = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  :', msg); };
const errors = [];
const ctxOpts = (w, h) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent });

/** buttons that are visible but cut off by the screen or covered by another element */
const deadButtons = p => p.evaluate(() => {
  const bad = [];
  const vw = window.visualViewport?.width ?? innerWidth, vh = window.visualViewport?.height ?? innerHeight;
  for (const b of document.querySelectorAll('button, .codeinput')) {
    let r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    let hidden = false;
    for (let e = b; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).display === 'none') hidden = true;
    if (hidden) continue;
    // inside a horizontally scrollable strip (shop cards) only reachability after scrolling matters
    for (let e = b.parentElement; e; e = e.parentElement) { const cs2 = getComputedStyle(e); if ((/auto|scroll/.test(cs2.overflowX) && e.scrollWidth > e.clientWidth) || (/auto|scroll/.test(cs2.overflowY) && e.scrollHeight > e.clientHeight)) { b.scrollIntoView({ block: 'nearest', inline: 'center' }); break; } }
    const name = (b.id || b.className || b.textContent).toString().slice(0, 28);
    r = b.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) { bad.push(`${name}: outside screen ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)} of ${vw}x${vh}`); continue; }
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || !(b === top || b.contains(top))) bad.push(`${name}: covered by ${top?.tagName}.${String(top?.className).slice(0, 20)}#${top?.id}`);
  }
  return bad;
});
const tap = async (p, sel) => {
  const r = await p.evaluate(s => { const e = document.querySelector(s); e.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
  await p.touchscreen.tap(r.x, r.y);
};
const snap = p => p.evaluate(() => window.__bw.conn.latest());
const until = async (p, fn, ms = 60000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (fn(await snap(p))) return true; await p.waitForTimeout(250); } return false; };
const open = async (w, h) => {
  const ctx = await browser.newContext(ctxOpts(w, h)), p = await ctx.newPage();
  p.setDefaultTimeout(90000);
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/GLTFLoader|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return p;
};

for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`;
  const A = await open(w, h), B = await open(w, h);
  await A.goto(`${BASE}/?q=low`); await A.waitForFunction(() => !!document.querySelector('#create'), null, { polling: 250 });
  check((await deadButtons(A)).length === 0, `${tag} lobby: all buttons reachable ${JSON.stringify(await deadButtons(A))}`);
  check(await A.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1), `${tag} no page scroll`);
  if (shotDir) await A.screenshot({ path: `${shotDir}/${tag}-1-lobby.png` });
  await tap(A, '#create');
  await A.waitForFunction(() => !!document.querySelector('.bigcode'), null, { polling: 250 });
  check(true, `${tag} touch-tap on "Neues Spiel" works`);
  const code = (await A.evaluate(() => document.querySelector('.bigcode').textContent)).trim();
  await B.goto(`${BASE}/?q=low&room=${code}`); await B.waitForFunction(() => !!document.querySelector('#join'), null, { polling: 250 });
  await tap(B, '#join');
  check(await until(A, s => s && !s.paused), `${tag} touch-tap on "Beitreten" works`);
  await A.waitForFunction(() => !!document.querySelector('.shop .card'), null, { polling: 250 }); await A.waitForTimeout(1500);
  check((await deadButtons(A)).length === 0, `${tag} prep HUD: all buttons reachable ${JSON.stringify(await deadButtons(A))}`);
  if (shotDir) await A.screenshot({ path: `${shotDir}/${tag}-2-prep.png` });
  // shop card by touch
  await tap(A, '.shop .card:nth-child(2)');
  check(await A.evaluate(() => window.__bw.controls.mode.k === 'buy'), `${tag} touch-tap on a shop card arms buying`);
  await tap(A, '.shop .card:nth-child(2)');
  // the tap on the ground buys a squad
  const gold0 = (await snap(A)).players[0].gold;
  await tap(A, '.shop .card:nth-child(1)');
  // tap the middle of the screen: whatever lies there inside the courtyard must accept a squad
  const pt = await A.evaluate(() => ({ x: innerWidth * 0.5, y: innerHeight * 0.5 }));
  await A.touchscreen.tap(pt.x, pt.y);
  check(await until(A, s => s.players[0].gold < gold0, 15000), `${tag} touch-tap on the ground buys a squad`);
  await tap(A, '#ready'); await tap(B, '#ready');
  check(await until(A, s => s.phase === 'battle'), `${tag} touch-tap on "Bereit" starts the battle`);
  await A.waitForTimeout(1200);
  await A.evaluate(() => { const c = window.__bw.controls, s = c.snapshot(); const q = s.units.find(u => u.owner === c.me() && u.squad > 0)?.squad; if (q) c.selectSquad(q); });
  await A.waitForTimeout(500);
  check((await deadButtons(A)).length === 0, `${tag} battle HUD: all buttons reachable ${JSON.stringify(await deadButtons(A))}`);
  if (shotDir) await A.screenshot({ path: `${shotDir}/${tag}-3-battle.png` });
  await tap(A, '.cmd[data-a="hold"]');
  check(await until(A, s => s.units.some(u => u.owner === 0 && u.squad > 0), 5000), `${tag} order buttons answer to touch`);
  // in battle the barracks shop is one tap away: buy stone with a finger
  await tap(A, '#tabtog');
  check(await A.evaluate(() => getComputedStyle(document.querySelector('#shop')).display !== 'none'), `${tag} battle: "Ausbilden" tab shows the shop`);
  check((await deadButtons(A)).length === 0, `${tag} battle shop: all buttons reachable ${JSON.stringify(await deadButtons(A))}`);
  const stone0 = (await snap(A)).players[0].stone;
  await tap(A, '.card.util[data-u="stone"]');
  check(await until(A, s => s.players[0].stone > stone0, 8000), `${tag} touch-tap on "Stein" trades gold for stone`);
  await tap(A, '.card.util[data-u="tech"]');
  check(await A.evaluate(() => getComputedStyle(document.querySelector('#sheet')).display !== 'none'), `${tag} "Ausbau" sheet opens`);
  check((await deadButtons(A)).length === 0, `${tag} upgrade sheet: all buttons reachable ${JSON.stringify(await deadButtons(A))}`);
  if (shotDir) await A.screenshot({ path: `${shotDir}/${tag}-4-sheet.png` });
  await tap(A, '#sheet .x');
  await A.context().close(); await B.context().close();
}
check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
