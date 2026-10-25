import { createRequire } from 'node:module';
import { serve } from './server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const SRC = process.env.KAYKIT_DIR ?? '/tmp/kk';
const { srv, port } = await serve(SRC);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto(`http://localhost:${port}/`);
await p.waitForFunction(() => window.ready);
const files = process.argv.slice(2);
for (const f of files) {
  const out = await p.evaluate(async f => {
    const g = await window.load(f);
    const lines = [];
    g.scene.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { const chain = []; for (let q = o; q && q !== g.scene; q = q.parent) chain.push(q.name); lines.push(chain.join('<') + ' v=' + o.geometry.attributes.position.count + (o.isSkinnedMesh ? ' skinned' : '')); } });
    return lines;
  }, f);
  console.log('==', f.split('/').pop()); console.log(out.join('\n'));
}
await b.close(); srv.close();
