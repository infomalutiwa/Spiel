import { fbm, noise2, polyDist, smooth, spline } from './geom';
import { CELL, centre, type GridLike } from './grid';
import type { MapDef } from './maps';

/** cell kinds */
export const K = { grass: 0, road: 1, forest: 2, rock: 3, water: 4, cliff: 5, meadow: 6 } as const;
export type Kind = (typeof K)[keyof typeof K];

export interface Terrain extends GridLike {
  map: MapDef;
  kind: Uint8Array;
  /** 1 where a lane crosses water (bridge / ford) */
  bridge: Uint8Array;
  height(x: number, y: number): number;
  /** metres outside the valley floor (negative = inside) */
  outside(x: number, y: number): number;
  left(y: number): number;
  right(y: number): number;
  cellAt(x: number, y: number): number;
  passable(c: number): boolean;
  buildable(c: number): boolean;
  /** height difference across the cell's neighbourhood (slope traps) */
  slope(c: number): number;
}

const CLIFF_H = 42;

export function buildTerrain(map: MapDef): Terrain {
  const ys = map.edges.map(e => e.y), ls = map.edges.map(e => e.left), rs = map.edges.map(e => e.right);
  const left = (y: number) => spline(ys, ls, y) + (fbm(y * 0.012, 3.1, map.seed) - 0.5) * 22 + (noise2(y * 0.05, 9, map.seed) - 0.5) * 6;
  const right = (y: number) => spline(ys, rs, y) + (fbm(y * 0.012, 7.7, map.seed + 1) - 0.5) * 22 + (noise2(y * 0.05, 2, map.seed + 1) - 0.5) * 6;
  const outside = (x: number, y: number) => Math.max(left(y) - x, x - right(y), y - map.backY - (fbm(x * 0.03, 1, map.seed) - 0.5) * 10);
  const creekW = map.creekWidth ?? 6;

  const height = (x: number, y: number) => {
    let h = (fbm(x * 0.018, y * 0.018, map.seed) - 0.5) * 1.8;
    for (const [hx, hy, r, hh] of map.hills) { const d = Math.hypot(x - hx, y - hy); if (d < r) h += hh * smooth(r, 0, d); }
    const out = outside(x, y);
    if (out > -6) {
      const o = Math.max(0, out + 2);
      // terraced rock face: steep, with ledges and a ragged top
      const face = Math.min(CLIFF_H, o * 2.6) + Math.sin(o * 0.35) * Math.min(3, o * 0.2);
      h += face * smooth(-6, 6, out) + (fbm(x * 0.06, y * 0.06, map.seed + 5) - 0.5) * Math.min(10, o * 0.5);
      if (o > 16) h += (fbm(x * 0.012, y * 0.012, map.seed + 9) - 0.3) * 18; // rolling ridge tops
    }
    if (map.creek) {
      const c = polyDist(x, y, map.creek).d;
      if (c < creekW * 1.4 && out < 0) h -= 1.4 * smooth(creekW * 1.4, creekW * 0.3, c);
    }
    return h;
  };

  const cw = Math.ceil(map.w / CELL), ch = Math.ceil(map.d / CELL);
  const kind = new Uint8Array(cw * ch), bridge = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const { x, y } = centre(cx, cy), i = cy * cw + cx;
    const out = outside(x, y);
    let k: Kind = K.grass;
    const n = fbm(x * 0.05, y * 0.05, map.seed + 3);
    const inBlob = (list: [number, number, number][]) => list.some(([bx, by, r]) => Math.hypot(x - bx, y - by) < r * (0.7 + 0.6 * n));
    if (inBlob(map.meadows)) k = K.meadow;
    if (inBlob(map.forests)) k = K.forest;
    if (inBlob(map.rocks)) k = K.rock;
    const water = map.creek ? polyDist(x, y, map.creek).d < creekW / 2 + 1 : false;
    if (water) k = K.water;
    const road = map.lanes.some(l => polyDist(x, y, l.pts).d < 3.6);
    if (road) { if (water) bridge[i] = 1; k = K.road; }
    if (out > 3 || y > map.backY + 3) k = K.cliff;
    kind[i] = k;
  }

  const t: Terrain = {
    map, cw, ch, kind, bridge, height, outside, left, right,
    cellAt: (x, y) => Math.min(ch - 1, Math.max(0, Math.floor(y / CELL))) * cw + Math.min(cw - 1, Math.max(0, Math.floor(x / CELL))),
    passable: c => kind[c] !== K.cliff && kind[c] !== K.water,
    buildable: c => kind[c] !== K.cliff && kind[c] !== K.water,
    slope: c => {
      const { x, y } = centre(c % cw, Math.floor(c / cw));
      const hs = [height(x - 6, y), height(x + 6, y), height(x, y - 6), height(x, y + 6)];
      return Math.max(...hs) - Math.min(...hs);
    },
  };
  return t;
}
