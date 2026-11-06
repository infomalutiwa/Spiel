import { DIFFICULTY, K, RES_KEYS, res, STRUCTURES, type GameState, type PlayerId, type Res, type Structure } from '@talwacht/shared';
import { terrainOf } from './state';

const UPKEEP = 0.15; // food per soldier per minute
const BASE_CAP = 30;

export function nearCount(s: GameState, st: Structure, r: number, kind: number) {
  const t = terrainOf(s);
  let n = 0;
  for (let y = st.cy - r; y < st.cy + st.h + r; y++) for (let x = st.cx - r; x < st.cx + st.w + r; x++) {
    if (x < 0 || y < 0 || x >= t.cw || y >= t.ch) continue;
    if (t.kind[y * t.cw + x] === kind) n++;
  }
  return n;
}
const near = (a: Structure, b: Structure, r: number) =>
  Math.abs(a.cx + a.w / 2 - (b.cx + b.w / 2)) <= r + (a.w + b.w) / 2 && Math.abs(a.cy + a.h / 2 - (b.cy + b.h / 2)) <= r + (a.h + b.h) / 2;

/** cached per structure revision: what the town makes per minute (before upkeep) */
const cache = new WeakMap<GameState, { rev: number; out: Res }>();
export function production(s: GameState): Res {
  const c = cache.get(s);
  if (c && c.rev === s.sRev) return c.out;
  const out = res();
  const mult = DIFFICULTY[s.diff].res;
  const mills = s.structs.filter(m => m.kind === 'mill' && m.build === 0);
  for (const st of s.structs) {
    const e = STRUCTURES[st.kind].eco;
    if (!e || st.build > 0) continue;
    for (const k of RES_KEYS) {
      let v = e.out[k] ?? 0;
      if (!v) continue;
      if (e.perNear && e.near && k === Object.keys(e.out)[0]) {
        const kind = e.near === 'forest' ? K.forest : e.near === 'rock' ? K.rock : e.near === 'meadow' ? K.meadow : K.cliff;
        const n = nearCount(s, st, e.near === 'meadow' ? 0 : 3, kind);
        v = e.near === 'meadow' ? v + (n >= 2 ? 4 : 0) : v + e.perNear * n;
        if (e.maxOut) v = Math.min(e.maxOut, v);
      }
      if (st.kind === 'farm' && mills.some(m => near(m, st, 4))) v *= 1.25;
      out[k] += v;
    }
  }
  for (const k of RES_KEYS) out[k] *= mult;
  if (s.talents.includes('wood')) out.wood *= 1.1;
  cache.set(s, { rev: s.sRev, out });
  return out;
}

export const soldiers = (s: GameState, p?: PlayerId) => s.units.reduce((n, u) => n + (u.side === 'p' && !u.dead && (p === undefined || u.owner === p) ? 1 : 0), 0);

export function armyCap(s: GameState, _p: PlayerId) {
  let cap = BASE_CAP;
  for (const st of s.structs) if (st.build === 0 && STRUCTURES[st.kind].eco?.cap) cap += STRUCTURES[st.kind].eco!.cap!;
  return Math.min(100, cap);
}

/** net change per minute including army upkeep (HUD) */
export function rate(s: GameState): Res {
  const p = { ...production(s) };
  p.food -= UPKEEP * soldiers(s);
  return p;
}

export function economyTick(s: GameState, dt: number) {
  const p = production(s), k = dt / 60;
  for (const key of RES_KEYS) s.res[key] += p[key] * k;
  s.res.food -= UPKEEP * soldiers(s) * k;
  if (s.res.food <= 0) { s.res.food = 0; s.hunger = rate(s).food < 0; } else s.hunger = false;
}
