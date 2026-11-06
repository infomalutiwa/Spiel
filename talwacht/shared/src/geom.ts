/** small deterministic helpers shared by server (rules) and client (rendering) */
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** mulberry32-style generator: same seed, same sequence on every machine */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (i: number, j: number, s: number) => {
  const n = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
/** smooth value noise in 0..1 */
export function noise2(x: number, y: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi, seed), hash(xi + 1, yi, seed), u), lerp(hash(xi, yi + 1, seed), hash(xi + 1, yi + 1, seed), u), v);
}
/** fractal noise, 0..1 */
export function fbm(x: number, y: number, seed = 0, oct = 3) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { a += noise2(x * f, y * f, seed + o * 13) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return a / n;
}

/** distance from point to polyline, plus the index/param of the closest segment */
export function polyDist(px: number, py: number, pts: [number, number][]) {
  let best = Infinity, seg = 0, tt = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best) { best = d; seg = i; tt = t; }
  }
  return { d: best, seg, t: tt };
}

/** Catmull-Rom through control values sampled at increasing keys */
export function spline(keys: number[], vals: number[], k: number) {
  const n = keys.length;
  if (k <= keys[0]) return vals[0];
  if (k >= keys[n - 1]) return vals[n - 1];
  let i = 0;
  while (k > keys[i + 1]) i++;
  const t = (k - keys[i]) / (keys[i + 1] - keys[i]);
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
