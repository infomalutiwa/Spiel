import * as THREE from 'three';
import { fbm, K, polyDist, smooth, type MapDef, type Terrain } from '@talwacht/shared';
import { LOW } from './scene';

interface Palette { g1: string; g2: string; meadow: string; road: string; road2: string; forest: string; rock: string; rock2: string; top: string; shore: string; water: string }
const PAL: Record<MapDef['theme'], Palette> = {
  green: { g1: '#6f9f45', g2: '#8fb553', meadow: '#a9c65c', road: '#c4ab80', road2: '#a99070', forest: '#5d8a3a', rock: '#7c766d', rock2: '#9d958a', top: '#6d9a42', shore: '#c9b98a', water: '#3f8fbf' },
  gorge: { g1: '#7aa24a', g2: '#98b958', meadow: '#b0c862', road: '#c0a47c', road2: '#a68c6c', forest: '#5a8238', rock: '#85776a', rock2: '#a5968a', top: '#6a8f40', shore: '#c4b28a', water: '#3d88b6' },
  river: { g1: '#6a9f44', g2: '#8cb655', meadow: '#a8c860', road: '#c4ab80', road2: '#a99070', forest: '#57873a', rock: '#7a756e', rock2: '#9c968c', top: '#689a42', shore: '#cdbd8e', water: '#3a92c4' },
  snow: { g1: '#e6eef5', g2: '#d3dfea', meadow: '#dfe9f1', road: '#c8b9a6', road2: '#ad9c88', forest: '#c3d1dc', rock: '#7f8996', rock2: '#9aa4b0', top: '#e9f0f6', shore: '#c9d5df', water: '#5b9fcb' },
};

/** visible extent: the playable map plus scenery margins (approach in front, ridges at the sides and back) */
export const EXTENT = { x0: -220, x1: 220, y0: -300, y1: 200 };

export function buildTerrainMesh(t: Terrain): THREE.Mesh {
  const m = t.map, P = PAL[m.theme];
  const step = LOW ? 6 : 4;
  const x0 = EXTENT.x0, x1 = m.w + EXTENT.x1, y0 = EXTENT.y0, y1 = m.d + EXTENT.y1;
  const nx = Math.ceil((x1 - x0) / step), ny = Math.ceil((y1 - y0) / step);
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3), col = new Float32Array((nx + 1) * (ny + 1) * 3);
  const c = new THREE.Color(), a = new THREE.Color(), b = new THREE.Color();
  const C = (k: keyof Palette) => a.set(P[k]);
  let i = 0;
  for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++, i++) {
    const x = x0 + ix * step, y = y0 + iy * step;
    const h = t.height(x, y), out = t.outside(x, y);
    pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = y;
    const n = fbm(x * 0.045, y * 0.045, m.seed + 21), n2 = fbm(x * 0.15, y * 0.15, m.seed + 7);
    c.copy(C('g1')).lerp(b.set(P.g2), n * 0.9 + n2 * 0.2);
    const inMap = x >= 0 && y >= 0 && x < m.w && y < m.d;
    const kind = inMap ? t.kind[t.cellAt(x, y)] : K.grass;
    if (kind === K.meadow) c.lerp(C('meadow'), 0.55 + n2 * 0.3);
    if (kind === K.forest) c.lerp(C('forest'), 0.7);
    if (kind === K.rock) c.lerp(C('rock2'), 0.5 + n2 * 0.3);
    // roads (also continue out of the map towards the enemy)
    let road = 99;
    for (const l of m.lanes) road = Math.min(road, polyDist(x, y, y < 0 ? [[l.pts[0][0], -400], ...l.pts] : l.pts).d);
    if (road < 3.6 && out < 0) { const k = smooth(3.6, 1.6, road) * (0.75 + n2 * 0.25); c.lerp(C('road'), k).lerp(b.set(P.road2), n2 * 0.6 * k); }
    if (m.creek) {
      const cd = polyDist(x, y, m.creek).d, w = (m.creekWidth ?? 6) / 2;
      if (cd < w + 3 && out < 0) c.lerp(C('shore'), smooth(w + 3, w, cd) * 0.8);
    }
    // cliffs: rock strata, grassy ledges and wooded tops
    if (out > -3) {
      const rockK = smooth(-3, 4, out);
      const strata = fbm(h * 0.25, (x + y) * 0.04, m.seed + 3);
      a.set(P.rock).lerp(b.set(P.rock2), strata * 0.8 + n2 * 0.4).multiplyScalar(0.85 + fbm(x * 0.3, y * 0.3 + h * 0.2, m.seed + 11) * 0.35);
      c.lerp(a, rockK);
      const topK = smooth(40, 52, h) * smooth(8, 18, out);
      if (topK > 0) c.lerp(b.set(P.top).lerp(a.set(P.g1), n), topK * (0.75 + n2 * 0.25));
      // distant ridges: dark forest canopy instead of thousands of trees
      const canopy = smooth(8, 34, out) * (0.65 + 0.35 * fbm(x * 0.03, y * 0.03, m.seed + 77));
      if (canopy > 0) c.lerp(b.set(P.forest).multiplyScalar(0.62 + n2 * 0.22), canopy);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const idx: number[] = [];
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const p = iy * (nx + 1) + ix, q = p + nx + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** creek ribbon following the bed; a gentle flowing shimmer in the shader */
export function buildWater(t: Terrain): THREE.Mesh | null {
  const m = t.map;
  if (!m.creek) return null;
  const pts = m.creek, w = (m.creekWidth ?? 6) / 2 + 1.2;
  // resample the polyline every 3 m
  const samp: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k < n; k++) samp.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  samp.push(pts[pts.length - 1]);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let along = 0;
  samp.forEach(([x, y], i) => {
    const [px, py] = samp[Math.max(0, i - 1)], [qx, qy] = samp[Math.min(samp.length - 1, i + 1)];
    const dx = qx - px, dy = qy - py, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    if (i) along += Math.hypot(x - samp[i - 1][0], y - samp[i - 1][1]);
    const h = Math.min(t.height(x, y), t.height(x + nx * 2, y + ny * 2), t.height(x - nx * 2, y - ny * 2)) + 0.75;
    pos.push(x + nx * w, h, y + ny * w, x - nx * w, h, y - ny * w);
    uv.push(0, along / 8, 1, along / 8);
    if (i) { const p = (i - 1) * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: PAL[m.theme].water, roughness: 0.15, metalness: 0.15, transparent: true, opacity: 0.88 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.time = { value: 0 };
    (mat.userData as { shader?: unknown }).shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vUv2;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv2 = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float time; varying vec2 vUv2;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat ripple = sin(vUv2.y * 2.3 - time * 1.6 + sin(vUv2.x * 5.0 + vUv2.y) * 1.2) * 0.5 + 0.5;\ntotalEmissiveRadiance += vec3(0.02, 0.04, 0.05) * ripple;');
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.name = 'water';
  return mesh;
}
