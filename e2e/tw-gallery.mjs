// Screenshots for visual review: node e2e/tw-gallery.mjs <outdir> [query ...]  (each query like "view=map&map=klamm")
import { chromium, startServer, watch } from './tw-lib.mjs';
const out = process.argv[2] ?? '.';
const queries = process.argv.slice(3);
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
for (const q of queries) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
  const errors = watch(page, q);
  await page.goto(`${srv.url}/?${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
  const name = q.replace(/[^a-z0-9]+/gi, '_');
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
  console.log('shot', name, errors.length ? errors : '');
  if (errors.length) failed = true;
  await page.close();
}
await browser.close(); srv.stop();
process.exit(failed ? 1 : 0);
