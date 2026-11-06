import { RES_KEYS, type GameState, type PlayerId, type Res } from '@talwacht/shared';

export const scale = (c: Res, k: number): Res => ({ wood: c.wood * k, stone: c.stone * k, food: c.food * k, gold: c.gold * k });
export const add = (a: Res, b: Res): Res => ({ wood: a.wood + b.wood, stone: a.stone + b.stone, food: a.food + b.food, gold: a.gold + b.gold });
export const canPay = (s: GameState, c: Res) => RES_KEYS.every(k => s.res[k] >= c[k] - 1e-9);
export function pay(s: GameState, c: Res, p: PlayerId, what: string): boolean {
  if (!canPay(s, c)) return false;
  for (const k of RES_KEYS) s.res[k] -= c[k];
  log(s, p, what);
  return true;
}
export function refund(s: GameState, c: Res) { for (const k of RES_KEYS) s.res[k] += c[k]; }
export function log(s: GameState, p: PlayerId, what: string) {
  s.spent.push({ p, what, t: Math.round(s.time) });
  if (s.spent.length > 8) s.spent.shift();
}
