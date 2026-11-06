import { DIRS, K, STRUCTURES, type GameState, type Structure } from '@talwacht/shared';
import { occOf, structById, terrainOf } from './state';

/**
 * Enemy routing: one Dijkstra field towards the keep over the 4-m grid.
 * Structures are expensive, never impassable: walling off the whole valley is allowed,
 * the enemy then breaks through where it is cheapest (low hit points, little cover).
 */
export interface Flow { dist: Float64Array; next: Int32Array; rev: number; slot: number; sig: number }

/** coarse fingerprint of rampart hit points: the field only needs a rebuild when costs really moved */
function hpSig(s: GameState) {
  let h = 0;
  for (const st of s.structs) h = (h * 31 + st.id * 7 + Math.floor(st.hp / 150)) % 1_000_000_007;
  return h;
}

const cache = new WeakMap<GameState, Flow>();

export function flowOf(s: GameState): Flow {
  const slot = Math.floor(s.time);
  const c = cache.get(s);
  if (c && c.rev === s.sRev && (c.slot === slot || c.sig === (c.slot = slot, hpSig(s)))) return c;
  const f = buildFlow(s);
  f.slot = slot; f.sig = hpSig(s);
  cache.set(s, f);
  return f;
}

const TERRAIN_COST: Record<number, number> = { [K.grass]: 1, [K.meadow]: 1, [K.road]: 0.6, [K.forest]: 1.8, [K.rock]: 1.4, [K.water]: 6, [K.cliff]: Infinity };

export function structCost(st: Structure): number {
  if (st.kind === 'keep') return 0;
  const cat = STRUCTURES[st.kind].cat;
  if (cat === 'trap') return st.kind === 'moat' ? 4 : 2;
  return 3 + st.hp / 60;
}
/** structures that physically stop a walker (traps and moats do not) */
export const blocks = (st: Structure | undefined) => !!st && st.kind !== 'keep' && STRUCTURES[st.kind].cat !== 'trap';

export function buildFlow(s: GameState): Flow {
  const t = terrainOf(s), occ = occOf(s), n = t.cw * t.ch;
  const enter = new Float64Array(n), solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let c = t.bridge[i] ? 0.6 : TERRAIN_COST[t.kind[i]];
    const id = occ[i];
    if (id) {
      const st = structById(s, id)!;
      if (st.kind === 'moat') c *= 4;
      else c += structCost(st);
      if (blocks(st)) solid[i] = 1;
    }
    enter[i] = c;
  }
  const dist = new Float64Array(n).fill(Infinity), next = new Int32Array(n).fill(-1);
  const heap = new Heap(n);
  const keep = structById(s, s.keepId);
  if (keep) for (let y = keep.cy; y < keep.cy + keep.h; y++) for (let x = keep.cx; x < keep.cx + keep.w; x++) {
    const i = y * t.cw + x; dist[i] = 0; heap.push(i, 0);
  }
  const W = t.cw, H = t.ch;
  const OX = [0, 1, 1, 1, 0, -1, -1, -1], OY = [-1, -1, 0, 1, 1, 1, 0, -1];
  while (heap.size) {
    const i = heap.pop(), d = heap.lastKey;
    if (d > dist[i]) continue; // stale entry
    const x = i % W, y = (i - x) / W;
    const ec = enter[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + OX[k], ny = y + OY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (enter[j] === Infinity) continue;
      let step = ec;
      if (k & 1) { // no corner cutting past cliffs or between two rampart cells
        const a = y * W + nx, b = ny * W + x;
        if (enter[a] === Infinity || enter[b] === Infinity || solid[a] || solid[b]) continue;
        step = ec * 1.4142;
      }
      const nd = d + step;
      if (nd < dist[j]) { dist[j] = nd; next[j] = i; heap.push(j, nd); }
    }
  }
  return { dist, next, rev: s.sRev, slot: 0, sig: 0 };
}

/** cells an enemy would walk from (cx, cy) to the keep (inclusive) */
export function followPath(s: GameState, cx: number, cy: number): [number, number][] {
  const t = terrainOf(s), f = flowOf(s), out: [number, number][] = [];
  let i = cy * t.cw + cx;
  for (let k = 0; k < 4000 && i >= 0; k++) {
    out.push([i % t.cw, Math.floor(i / t.cw)]);
    if (f.dist[i] === 0) break;
    i = f.next[i];
  }
  return out;
}

class Heap {
  private ids: Int32Array; private keys: Float64Array; size = 0; lastKey = 0;
  constructor(cap: number) { this.ids = new Int32Array(cap * 2); this.keys = new Float64Array(cap * 2); }
  push(id: number, key: number) {
    if (this.size >= this.ids.length) { const a = new Int32Array(this.ids.length * 2); a.set(this.ids); this.ids = a; const b = new Float64Array(this.keys.length * 2); b.set(this.keys); this.keys = b; }
    let i = this.size++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.keys[p] <= key) break; this.ids[i] = this.ids[p]; this.keys[i] = this.keys[p]; i = p; }
    this.ids[i] = id; this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0]; this.lastKey = this.keys[0];
    const id = this.ids[--this.size], key = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c]; i = c;
    }
    this.ids[i] = id; this.keys[i] = key;
    return top;
  }
}
