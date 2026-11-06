import { ENEMIES, TROOPS, type EnemyId, type GameState, type PlayerId, type TroopId, type Unit, type UnitType } from '@talwacht/shared';

export const isTroop = (t: UnitType): t is TroopId => t in TROOPS;
export const defOf = (t: UnitType) => (isTroop(t) ? TROOPS[t] : ENEMIES[t as EnemyId]);

export function makeUnit(s: GameState, type: UnitType, side: 'p' | 'e', owner: PlayerId | null, x: number, y: number): Unit {
  const d = defOf(type);
  const u: Unit = {
    id: s.nextId++, type, side, owner, x, y, z: 0, vx: 0, vy: 0, hp: d.hp, maxHp: d.hp, cd: Math.random() * 0.5, facing: side === 'e' ? Math.PI / 2 : -Math.PI / 2,
    anim: 0, squad: 0, slot: -1, target: 0, stun: 0, slow: 0, slowT: 0, burn: 0, burnDps: 0, formation: 0, charge: 0, group: 0, mode: 0, t: 0,
    gx: x, gy: y, gz: 0, dead: 0,
  };
  s.units.push(u);
  return u;
}

/** units by id, rebuilt once per tick (call `indexUnits` at the start of the tick) */
const idx = new WeakMap<GameState, Map<number, Unit>>();
export function indexUnits(s: GameState) { idx.set(s, new Map(s.units.map(u => [u.id, u]))); }
export function unitById(s: GameState, id: number): Unit | undefined {
  let m = idx.get(s);
  if (!m || (m.size !== s.units.length)) { indexUnits(s); m = idx.get(s)!; }
  const u = m.get(id);
  return u && u.hp > 0 ? u : undefined;
}

/** spatial hash of living units for neighbourhood queries */
const CELLSZ = 8;
interface Hash { cols: number; rows: number; buckets: Map<number, Unit[]> }
const hashes = new WeakMap<GameState, Hash>();
export function rebuildHash(s: GameState) {
  const buckets = new Map<number, Unit[]>();
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const k = Math.floor(u.y / CELLSZ) * 4096 + Math.floor(u.x / CELLSZ);
    let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(u);
  }
  hashes.set(s, { cols: 0, rows: 0, buckets });
}
export function nearby(s: GameState, x: number, y: number, r: number, out: Unit[] = []): Unit[] {
  let h = hashes.get(s);
  if (!h) { rebuildHash(s); h = hashes.get(s)!; }
  out.length = 0;
  const x0 = Math.floor((x - r) / CELLSZ), x1 = Math.floor((x + r) / CELLSZ), y0 = Math.floor((y - r) / CELLSZ), y1 = Math.floor((y + r) / CELLSZ);
  const r2 = r * r;
  for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) {
    const b = h.buckets.get(by * 4096 + bx);
    if (!b) continue;
    for (const u of b) if (u.hp > 0 && (u.x - x) ** 2 + (u.y - y) ** 2 <= r2) out.push(u);
  }
  return out;
}
