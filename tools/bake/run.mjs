// Bakes the animated characters into compact frame data for the client.
//   npm i -D playwright (or have it globally) ; get the CC0 KayKit packs:
//   git clone https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 $KAYKIT_DIR/…  (and …-Skeletons-1.0)
//   KAYKIT_DIR=/tmp/kk node tools/bake/run.mjs [id ...]
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const SRC = process.env.KAYKIT_DIR ?? '/tmp/kk';
const OUT = join(fileURLToPath(new URL('.', import.meta.url)), '../../client/public/assets/units');
await mkdir(OUT, { recursive: true });
const { srv, port } = await serve(SRC);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('console error', m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.specsReady, null, { timeout: 60000 });
const only = process.argv.slice(2);
const ids = await page.evaluate(() => window.SPECS.map(s => s.id));
let manifest = {};
try { manifest = JSON.parse(await readFile(join(OUT, 'manifest.json'), 'utf8')); } catch { /* first run */ }
for (const id of ids.filter(i => !only.length || only.includes(i))) {
  const t0 = Date.now();
  const res = await page.evaluate(id => window.bakeModel(window.SPECS.find(s => s.id === id)), id);
  await writeFile(join(OUT, `${id}.bin`), Buffer.from(res.b64, 'base64'));
  manifest[id] = res.meta;
  console.log(id.padEnd(14), `${res.meta.verts} verts, ${res.meta.frames} frames, ${(Buffer.from(res.b64, 'base64').length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest));
await browser.close(); srv.close();
