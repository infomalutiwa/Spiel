import {
  BOSS_WAVES, budget, CELL, DIFFICULTY, ENEMIES, MAPS, NIGHT_WAVES, RAIN_WAVES, STRUCTURES, TECH, TROOPS, towerDps,
  type EnemyId, type GameState, type Memory, type WaveGroupPlan, type WavePlan,
} from '@talwacht/shared';
import { followPath } from './flowfield';
import { blocks } from './flowfield';
import { rand, structAtCell } from './state';
import { isTroop } from './units';

/** what the enemy has learned about your defence (smoothed over the round) */
export function observe(s: GameState): Memory {
  const mine = s.units.filter(u => u.side === 'p' && u.hp > 0);
  const ranged = mine.filter(u => isTroop(u.type) && TROOPS[u.type].role === 'ranged');
  const garrisons = s.structs.filter(st => STRUCTURES[st.kind].tower?.kind === 'pierce' || STRUCTURES[st.kind].tower?.kind === 'bolt').length * 3;
  const onWall = ranged.filter(u => u.z > 0).length + garrisons;
  const share = (mine.length + garrisons) ? onWall / (mine.length + garrisons) : 0;
  const wooden = s.structs.filter(st => STRUCTURES[st.kind].wooden[st.level - 1]).length;
  const now: Memory = {
    wallRangedShare: share,
    traps: s.structs.filter(st => STRUCTURES[st.kind].cat === 'trap' && st.kind !== 'moat').length,
    gateHp: Math.max(0, ...s.structs.filter(st => st.kind === 'gate').map(st => st.maxHp)),
    riders: mine.filter(u => isTroop(u.type) && TROOPS[u.type].role === 'mounted').length,
    moat: s.structs.filter(st => st.kind === 'moat').length,
    fire: s.structs.length ? wooden / s.structs.length : 0,
  };
  const m = s.memory;
  const k = s.wave <= 1 ? 1 : 0.6;
  return {
    wallRangedShare: m.wallRangedShare * (1 - k) + now.wallRangedShare * k, traps: Math.max(now.traps, m.traps * 0.7), gateHp: now.gateHp,
    riders: now.riders, moat: now.moat, fire: now.fire,
  };
}

/** how hard a lane is to push through (fire covering it, ramparts, traps) */
export function laneScore(s: GameState, lane: number): number {
  const l = MAPS[s.mapId].lanes[lane];
  const [x, y] = l.pts[0];
  const path = followPath(s, Math.floor(x / CELL), Math.floor((y + 2) / CELL));
  let score = 0, crossed = false;
  const pts: [number, number][] = [];
  for (let i = 0; i < path.length; i += 2) pts.push([(path[i][0] + 0.5) * CELL, (path[i][1] + 0.5) * CELL]);
  for (const [cx, cy] of path) {
    const st = structAtCell(s, cx, cy);
    if (!crossed && st && blocks(st)) { score += st.hp / 100; crossed = true; }
  }
  for (const st of s.structs) {
    if (st.build > 0) continue;
    const sx = (st.cx + 0.5) * CELL, sy = (st.cy + 0.5) * CELL;
    const spec = STRUCTURES[st.kind];
    const dmin = Math.min(...pts.map(([px, py]) => Math.hypot(px - sx, py - sy)));
    if (spec.tower && st.kind !== 'pitch' && spec.tower.range[0] && dmin < spec.tower.range[Math.min(st.level, spec.tower.range.length) - 1]) score += towerDps(st.kind, Math.min(st.level, spec.tower.shooters.length));
    if (spec.cat === 'trap' && dmin < 8) score += 20;
    if (st.pitch && dmin < 10) score += 30;
  }
  return score;
}

const BASE_W: Partial<Record<EnemyId, number>> = {
  e_raider: 3, e_soldier: 2, e_rider: 1, e_xbow: 1, ram: 0.8, pioneer: 0.5, fire_archer: 0.8, e_shield: 1.4, e_ladder: 1, trebuchet: 0.5, siege_tower: 0.5, miner: 0.6,
};
const SIEGE = new Set<EnemyId>(['ram', 'trebuchet', 'siege_tower']);
const testudoCost = (n: number) => n * ENEMIES.e_shield.budget + ENEMIES.ram.budget;

function weights(s: GameState, w: number, mem: Memory) {
  const a = DIFFICULTY[s.diff].adapt;
  const W: Partial<Record<EnemyId, number>> = {};
  const boost = (id: EnemyId, m: number) => { if (W[id]) W[id]! *= 1 + a * (m - 1); };
  for (const t of TECH) if (t.wave <= w && BASE_W[t.id]) W[t.id] = BASE_W[t.id]!;
  if (W.e_raider) W.e_raider = Math.max(0.6, 3 - w * 0.15);
  if (mem.wallRangedShare > 0.4) { boost('e_shield', 2); boost('e_xbow', 1.6); boost('trebuchet', 1.6); }
  if (mem.traps > 8) boost('pioneer', 3);
  if (mem.gateHp > 1500) { boost('e_ladder', 2); boost('siege_tower', 2); boost('miner', 2); }
  if (mem.riders > 12) boost('e_soldier', 1.6);
  if (mem.moat > 6) { boost('trebuchet', 2); boost('siege_tower', 0.3); }
  if (mem.fire > 0.5) boost('fire_archer', 2);
  return W;
}

function pickType(s: GameState, W: Partial<Record<EnemyId, number>>, left: number): EnemyId | null {
  const opts = (Object.keys(W) as EnemyId[]).filter(id => (id === 'e_shield' ? testudoCost(6) : ENEMIES[id].budget * (SIEGE.has(id) ? 1 : 3)) <= left);
  if (!opts.length) return null;
  const sum = opts.reduce((a, id) => a + W[id]!, 0);
  let r = rand(s) * sum;
  for (const id of opts) { r -= W[id]!; if (r <= 0) return id; }
  return opts[opts.length - 1];
}

function fillLane(s: GameState, lane: number, money: number, W: Partial<Record<EnemyId, number>>, forced: EnemyId[]): WaveGroupPlan[] {
  const out: WaveGroupPlan[] = [];
  let left = money;
  const add = (type: EnemyId) => {
    if (type === 'e_shield') {
      const n = Math.max(6, Math.min(20, Math.floor((Math.min(left, money * 0.8) - ENEMIES.ram.budget) / ENEMIES.e_shield.budget)));
      if (testudoCost(n) > left) return false;
      out.push({ type, n, lane, delay: 0, testudo: true }); left -= testudoCost(n); return true;
    }
    const c = ENEMIES[type].budget;
    if (SIEGE.has(type)) { if (c > left) return false; out.push({ type, n: 1, lane, delay: 0 }); left -= c; return true; }
    const n = Math.max(3, Math.floor(Math.min(left, money * 0.45) / c));
    if (n * c > left) return false;
    out.push({ type, n, lane, delay: 0 }); left -= n * c; return true;
  };
  for (const f of forced) add(f);
  for (let guard = 0; guard < 12 && left >= ENEMIES.e_raider.budget * 3; guard++) {
    const t = pickType(s, W, left);
    if (!t || !add(t)) break;
  }
  if (left >= ENEMIES.e_raider.budget && W.e_raider) out.push({ type: 'e_raider', n: Math.floor(left / ENEMIES.e_raider.budget), lane, delay: 0 });
  // merge equal plain groups
  const merged: WaveGroupPlan[] = [];
  for (const g of out) {
    const m = !g.testudo && !SIEGE.has(g.type) ? merged.find(x => x.type === g.type && !x.testudo) : undefined;
    if (m) m.n += g.n; else merged.push(g);
  }
  return merged;
}

const ORDER: Partial<Record<EnemyId, number>> = { pioneer: 0, e_rider: 2, e_raider: 6, e_soldier: 10, e_ladder: 12, miner: 14, e_shield: 16, fire_archer: 20, e_xbow: 22, ram: 24, siege_tower: 28, trebuchet: 32, warlord: 18 };

export function planWave(s: GameState, w: number): WavePlan {
  const map = MAPS[s.mapId];
  const open = map.lanes.filter(l => l.opensAt <= w).map(l => l.id as number);
  const mem = observe(s);
  const scores = open.map(l => ({ l, sc: laneScore(s, l) + rand(s) * 0.01 }));
  scores.sort((a, b) => a.sc - b.sc);
  const main = scores[0].l;
  const total = budget(w, s.diff) + (w === s.wave + 1 ? s.bonusBudget : 0);
  const share = open.length === 1 ? 1 : open.length === 2 ? 0.7 : 0.6;
  const W = weights(s, w, mem);
  const forced: EnemyId[] = [];
  const a = DIFFICULTY[s.diff].adapt;
  if (mem.wallRangedShare > 0.4 && W.e_shield && a >= 0.5) forced.push('e_shield');
  if (mem.traps > 8 && W.pioneer) forced.push('pioneer');
  if (mem.gateHp > 1500 && W.e_ladder && a >= 1) forced.push('e_ladder');
  const groups: WaveGroupPlan[] = [];
  const boss = BOSS_WAVES.includes(w) && w <= s.waveCount;
  let mainMoney = total * share;
  if (boss) { groups.push({ type: 'warlord', n: 1, lane: main, delay: 18 }, { type: 'e_soldier', n: 10, lane: main, delay: 20 }); mainMoney = Math.max(mainMoney * 0.6, mainMoney - 300); }
  groups.push(...fillLane(s, main, mainMoney, W, forced));
  for (const { l } of scores.slice(1)) groups.push(...fillLane(s, l, (total * (1 - share)) / (open.length - 1), W, []));
  for (const g of groups) if (g.type !== 'warlord' && !(boss && g.type === 'e_soldier' && g.n === 10 && g.delay === 20)) g.delay = (ORDER[g.type] ?? 10) + rand(s) * 6;
  const special = NIGHT_WAVES.includes(w) ? 'night' : RAIN_WAVES.includes(w) ? 'rain' : null;
  return { wave: w, at: 0, mainLane: main, groups, scout: scoutText(groups, boss, special), special, boss };
}

const LANE_NAME = ['Mitte', 'links', 'rechts'];
export const laneName = (l: number) => LANE_NAME[l] ?? '?';

function scoutText(groups: WaveGroupPlan[], boss: boolean, special: 'night' | 'rain' | null): string[] {
  const has = (t: EnemyId) => groups.some(g => g.type === t);
  const out: string[] = [];
  if (boss) out.push('👑 Der Kriegsfürst führt den Angriff an!');
  if (groups.some(g => g.testudo)) out.push('🐢 Viele Schilde mit Rammbock – Pech, Feuer und Katapulte helfen');
  if (has('siege_tower')) out.push('🗼 Belagerungsturm – ein Wassergraben hält ihn auf');
  if (has('trebuchet')) out.push('🏹 Trebuchet – Ausfall reiten oder Katapult Stufe 2');
  if (has('miner')) out.push('⛏️ Mineure graben – Ingenieure und Wassergraben');
  if (has('e_ladder')) out.push('🪜 Sturmleitern – haltet Nahkämpfer bereit');
  if (has('pioneer')) out.push('🧰 Pioniere räumen eure Fallen');
  if (has('fire_archer')) out.push('🔥 Brandpfeile – Brunnen und Ingenieure');
  if (has('e_rider')) out.push('🐎 Reiterei – Speerträger und Spießwall');
  if (has('e_xbow')) out.push('🎯 Armbrüste mit Pavesen beschießen eure Mauer');
  if (special === 'night') out.push('🌙 Nachtangriff – Wachtürme sehen weiter');
  if (special === 'rain') out.push('🌧️ Regen – Feuer und Pech wirken nicht');
  if (!out.length) out.push('⚔️ Fußvolk und Plünderer');
  return out;
}
