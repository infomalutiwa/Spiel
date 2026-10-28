import {
  COLUMN_OFFSET, ENEMIES, groupCount, MAPS, PREP_TIME, WAVES, gemReward, waveSpread, stoneReward, waveReward, type GameState, type Phase,
} from '@burgwacht/shared';
import { isFixedType } from '@burgwacht/shared';
import { castleOf, pushEvent, rand, spawnUnit } from './state';

function setPhase(s: GameState, phase: Phase) {
  s.phase = phase;
  pushEvent(s, { k: 'phase', phase });
}

function startBattle(s: GameState) {
  const wave = WAVES[s.wave];
  s.spawnQueue = [];
  s.shells = [];
  s.battleTime = 0;
  s.lastSpawn = 0;
  const spread = waveSpread(s.wave);
  for (const g of wave.groups) {
    const n = groupCount(MAPS[s.mapId].waveScale, s.wave, g); // gentle start, growing pressure as both armies fill up
    // a march column, not a lump: every type leaves the gate at its own point of the column (scouts, foot, bowmen,
    // heavies, siege) and a group files in over a window that grows with its size
    const start = COLUMN_OFFSET[g.type] * spread + (g.delay ?? 0);
    const window = Math.min(22, Math.max(4, n * 0.6));
    for (let i = 0; i < n; i++)
      s.spawnQueue.push({ at: start + (i * window) / n, type: g.type, lane: g.lane });
  }
  s.spawnQueue.sort((a, b) => a.at - b.at);
  for (const p of s.players) p.ready = false;
  setPhase(s, 'battle');
  pushEvent(s, { k: 'wave', wave: s.wave });
}

function endBattle(s: GameState) {
  const reward = waveReward(s.wave);
  for (const p of s.players) { p.gold += reward; p.stone += stoneReward(s.wave); p.gems += gemReward(s.wave, WAVES.length); }
  s.zones.forEach(z => { z.owner = 'player'; z.progress = 0; z.reached = false; z.hold = 0; });
  for (const u of s.units) { // a night's rest between waves; buildings mend a third of the damage on their own
    if (isFixedType(u.type)) { if (u.type !== 'castle') u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - u.hp) * 0.35); continue; }
    u.hp = u.maxHp; u.morale = 100; u.routed = 0; u.cd = 0; u.targetId = null; u.burn = 0; u.slow = 0;
    if (u.order.kind !== 'hold') u.order = { kind: 'idle', x: u.x, y: u.y }; // holding position survives the night
    u.postX = u.x; u.postY = u.y;
  }
  const castle = castleOf(s);
  if (castle) castle.hp = Math.min(castle.maxHp, castle.hp + castle.maxHp * 0.2);
  s.wave++;
  if (s.wave >= WAVES.length) return setPhase(s, 'won');
  s.timer = PREP_TIME;
  setPhase(s, 'prep');
}

export function stepWaves(s: GameState, dt: number): void {
  const map = MAPS[s.mapId];
  const castle = castleOf(s);
  if (s.phase === 'prep') {
    s.timer -= dt;
    if (s.timer <= 0 || s.players.every(p => p.ready)) startBattle(s);
    return;
  }
  if (s.phase !== 'battle') return;
  if (!castle || castle.hp <= 0 || s.zones[s.zones.length - 1].owner === 'enemy') return setPhase(s, 'lost');

  s.battleTime += dt;
  while (s.spawnQueue.length && s.spawnQueue[0].at <= s.battleTime) {
    const it = s.spawnQueue.shift()!;
    const sp = map.spawns[it.lane % map.spawns.length];
    const u = spawnUnit(s, 'enemy', null, it.type, sp.x + (rand(s) - 0.5) * 9, sp.y + (rand(s) - 0.5) * 9, it.lane);
    u.order = { kind: 'attackMove', x: sp.x - 20, y: sp.y }; // stepRoutes steers from here
    // later waves arrive battle-hardened: tougher and harder-hitting (stars over their heads)
    u.level = 1 + Math.min(2, Math.floor(s.wave / 8));
    u.maxHp = u.hp = ENEMIES[it.type].hp * (1 + 0.15 * (u.level - 1)) * (1 + 0.06 * s.wave);
    s.lastSpawn = s.battleTime;
  }
  if (!s.spawnQueue.length && !s.units.some(u => u.side === 'enemy' && u.hp > 0)) endBattle(s);
}
