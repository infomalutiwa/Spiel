import * as THREE from 'three';
import { fbm, K, polyDist, smooth, type MapDef, type Terrain } from '@talwacht/shared';
import { LOW } from './scene';

interface Palette { g1: string; g2: string; meadow: string; road: string; road2: string; forest: string; rock: string; rock2: string; top: string; shore: string; water: string }
// bright, clean low-poly palette (matches the Quaternius RTS buildings): saturated meadows, light grey rock, turquoise water
const PAL: Record<MapDef['theme'], Palette> = {
  green: { g1: '#5f9f33', g2: '#6eac3b', meadow: '#7fba45', road: '#d9bb83', road2: '#c9a66e', forest: '#5c9a33', rock: '#9c9a94', rock2: '#bdbbb4', top: '#5f9e35', shore: '#e6d59e', water: '#3fb0e8' },
  gorge: { g1: '#65a236', g2: '#76b040', meadow: '#88bd4b', road: '#d5b47c', road2: '#c19e68', forest: '#5b9433', rock: '#a39a8e', rock2: '#c2b9ad', top: '#62a038', shore: '#e2d09a', water: '#3caae2' },
  river: { g1: '#5c9e33', g2: '#6bab3b', meadow: '#7cb945', road: '#d9bb83', road2: '#c9a66e', forest: '#589a33', rock: '#9a9994', rock2: '#bcbab4', top: '#5c9c35', shore: '#e8d8a2', water: '#3db3ec' },
  snow: { g1: '#e4ecf2', g2: '#d6e1ea', meadow: '#dfe8ef', road: '#cdbba2', road2: '#b9a68c', forest: '#7fa08a', rock: '#8e949c', rock2: '#aab0b8', top: '#eef3f7', shore: '#c7d6e2', water: '#58b6e8' },
};

/** visible extent: the playable map plus scenery margins (approach in front, ridges at the sides and back) */
export const EXTENT = { x0: -220, x1: 220, y0: -300, y1: 200 };

export function buildTerrainMesh(t: Terrain): THREE.Mesh {
  const m = t.map, P = PAL[m.theme];
  const step = LOW ? 6 : 4;
  const x0 = EXTENT.x0, x1 = m.w + EXTENT.x1, y0 = EXTENT.y0, y1 = m.d + EXTENT.y1;
  const nx = Math.ceil((x1 - x0) / step), ny = Math.ceil((y1 - y0) / step);
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3), col = new Float32Array((nx + 1) * (ny + 1) * 3), spl = new Float32Array((nx + 1) * (ny + 1) * 4);
  const BASE = { g: new THREE.Color(P.g1).lerp(new THREE.Color(P.g2), 0.5), r: new THREE.Color(P.road), k: new THREE.Color(P.rock).lerp(new THREE.Color(P.rock2), 0.5), f: new THREE.Color(P.forest) };
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
    let wr = 0, wk = 0, wf = 0;
    // soft, ragged patches (not the 4-m cells) so meadows and woods have natural edges
    const blob = (list: [number, number, number][]) => { let k = 0; for (const [bx, by, r] of list) { const rr = r * (0.75 + 0.5 * n); k = Math.max(k, smooth(rr * 1.15, rr * 0.7, Math.hypot(x - bx, y - by))); } return k; };
    const mk = blob(m.meadows), fk = blob(m.forests), rk = blob(m.rocks);
    if (mk) c.lerp(C('meadow'), mk * (0.5 + n2 * 0.3));
    if (fk) { c.lerp(C('forest'), fk * 0.7); wf = fk * 0.75; }
    if (rk) { c.lerp(C('rock2'), rk * (0.5 + n2 * 0.3)); wk = rk * 0.5; }
    const ck = t.crag(x, y);
    if (ck) { c.lerp(b.set(P.rock).lerp(a.set(P.rock2), n2), ck); wk = Math.max(wk, ck); }
    void inMap;
    // roads (also continue out of the map towards the enemy)
    // the main road is a broad track, side lanes are narrow footpaths
    let road = 99, side = false;
    for (const l of m.lanes) { const d = polyDist(x, y, y < 0 ? [[l.pts[0][0], -400], ...l.pts] : l.pts).d * (l.id ? 1.6 : 1); if (d < road) { road = d; side = l.id !== 0; } }
    if (road < 3.6 && out < 0) { const k = smooth(3.6, 1.6, road) * (0.75 + n2 * 0.25) * (side ? 0.55 : 1); c.lerp(C('road'), k).lerp(b.set(P.road2), n2 * 0.6 * k); wr = Math.max(wr, k); }
    if (m.creek) {
      const cd = polyDist(x, y, m.creek).d, w = (m.creekWidth ?? 6) / 2;
      if (cd < w + 3 && out < 0) { c.lerp(C('shore'), smooth(w + 3, w, cd) * 0.8); wr = Math.max(wr, smooth(w + 3, w, cd) * 0.7); }
    }
    // cliffs: rock strata, grassy ledges and wooded tops
    if (out > -3) {
      const rockK = smooth(-3, 4, out);
      const strata = fbm(h * 0.25, (x + y) * 0.04, m.seed + 3);
      a.set(P.rock).lerp(b.set(P.rock2), strata * 0.8 + n2 * 0.4).multiplyScalar(0.85 + fbm(x * 0.3, y * 0.3 + h * 0.2, m.seed + 11) * 0.35);
      c.lerp(a, rockK); wk = Math.max(wk, rockK);
      const topK = smooth(40, 52, h) * smooth(8, 18, out);
      if (topK > 0) { c.lerp(b.set(P.top).lerp(a.set(P.g1), n), topK * (0.75 + n2 * 0.25)); wk *= 1 - topK * 0.85; }
      const snowK = m.theme === 'snow' ? smooth(48, 62, h + n2 * 6) : smooth(80, 95, h + n2 * 6);
      if (snowK > 0) { c.lerp(b.set('#f4f7fa'), snowK); wk = Math.max(0, wk - snowK); }
      // distant ridges: dark forest canopy instead of thousands of trees
      const canopy = smooth(8, 34, out) * smooth(50, 38, h) * (0.65 + 0.35 * fbm(x * 0.03, y * 0.03, m.seed + 77));
      if (canopy > 0) { c.lerp(b.set(P.forest).multiplyScalar(0.8 + n2 * 0.2), canopy); wf = Math.max(wf, canopy * (1 - wk)); }
    }
    // splat weights (grass gets the rest) and a tint = painted colour relative to the layers' own colour
    wk = Math.min(1, wk); wr = Math.min(1 - wk, wr); wf = Math.min(1 - wk - wr, wf);
    const wg = Math.max(0, 1 - wk - wr - wf);
    spl.set([wg, wr, wk, wf], i * 4);
    a.setRGB(0, 0, 0).add(b.copy(BASE.g).multiplyScalar(wg)).add(b.copy(BASE.r).multiplyScalar(wr)).add(b.copy(BASE.k).multiplyScalar(wk)).add(b.copy(BASE.f).multiplyScalar(wf));
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
  g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, terrainMaterial(m.theme));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** stylised ground: painted vertex colours on flat-shaded facets (low-poly look, cheap on phones) */
function terrainMaterial(_theme: MapDef['theme']) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
}

/** creek ribbon following the bed; a gentle flowing shimmer in the shader */
export function buildWater(t: Terrain): THREE.Mesh | null {
  const m = t.map;
  if (!m.creek) return null;
  const pts = m.creek;
  const w = (m.creekWidth ?? 6) / 2 + 1.2;
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
  // physically based water: dark deep middle, lighter shallows, foam at the banks, flowing ripples that reflect the sky
  const mat = new THREE.MeshPhysicalMaterial({ color: PAL[m.theme].water, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.92, clearcoat: 0.4, clearcoatRoughness: 0.15, envMapIntensity: 0.8 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.time = { value: 0 };
    (mat.userData as { shader?: unknown }).shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vUv2;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv2 = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float time; varying vec2 vUv2;
float wv(vec2 p) { return sin(p.x * 1.7 + p.y * 0.9) * 0.5 + sin(p.x * -1.1 + p.y * 2.3 + 1.3) * 0.35 + sin(p.x * 3.1 - p.y * 1.4 + 2.1) * 0.15; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float edge = abs(vUv2.x - 0.5) * 2.0;
diffuseColor.rgb = mix(diffuseColor.rgb * 0.82, diffuseColor.rgb * 1.18 + vec3(0.08, 0.1, 0.08), smoothstep(0.3, 0.95, edge));
float foam = smoothstep(0.82, 1.0, edge) * (0.55 + 0.45 * sin(vUv2.y * 40.0 - time * 3.0 + vUv2.x * 9.0));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.95), foam * 0.55);
diffuseColor.a *= mix(0.95, 0.55, smoothstep(0.7, 1.0, edge));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec2 p = vec2(vUv2.x * 6.0, vUv2.y * 7.0 - time * 1.3); float e = 0.05;
  float h0 = wv(p), hx = wv(p + vec2(e, 0.0)), hy = wv(p + vec2(0.0, e));
  vec3 pn = normalize(vec3(-(hx - h0) / e * 0.12, 1.0, -(hy - h0) / e * 0.12));
  normal = normalize((viewMatrix * vec4(pn, 0.0)).xyz); }`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.name = 'water';
  return mesh;
}
