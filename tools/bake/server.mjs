// tiny static server for the baker: serves this folder, three.js from node_modules and the KayKit source packs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.bin': 'application/octet-stream' };

export function serve(srcDir, port = 0) {
  const mounts = [['/three/', join(ROOT, 'node_modules/three/')], ['/src/', srcDir], ['/', HERE]];
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    for (const [prefix, dir] of mounts) {
      if (!path.startsWith(prefix)) continue;
      const file = normalize(join(dir, path.slice(prefix.length) || 'index.html'));
      if (!file.startsWith(dir)) break;
      try {
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        return res.end(data);
      } catch { /* try next mount */ }
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise(r => srv.listen(port, () => r({ srv, port: srv.address().port })));
}
