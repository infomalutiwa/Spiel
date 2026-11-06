// Talwacht smoke test: build first (npm run build:tw), then `node e2e/tw-smoke.mjs`
import { chromium, startServer, watch } from './tw-lib.mjs';
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = watch(page, 'p1');
await page.goto(srv.url + '/?q=low');
await page.waitForSelector('#lobby h1', { timeout: 20000 });
console.log('lobby title:', await page.textContent('#lobby h1'));
await browser.close(); srv.stop();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log('OK');
