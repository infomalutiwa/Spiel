import {
  ENEMIES, MAPS, PREP_TIME, WAVES, waveReward, type GameState, type Phase,
} from '@burgwacht/shared';
import { castleOf, pushEvent, rand, spawnUnit } from './state';

function setPhase(s: GameState, phase: Phase) {
  s.phase = phase;
  pushEvent(s, { k: 'phase', phase });
}

function startBattle(s: GameState) {
  const wave = WAVES[s.wave];
  s.spawnQueue = [];
  s.battleTime = 0;
  s.lastSpawn = 0;
  const scale = MAPS[s.mapId].waveScale * (0.8 + 0.055 * s.wave); // gentle start, growing pressure as both armies fill up
  for (const g of wave.groups) {
    const n = Math.max(1, Math.round(g.count * scale));
    // big groups arrive in a stream, not a lump: the whole group takes ~14 s to file in
    const gap = Math.min(0.55, 14 / n);
    for (let i = 0; i < n; i++)
      s.spawnQueue.push({ at: (g.delay ?? 0) + i * gap, type: g.type, lane: g.lane });
  }
  s.spawnQueue.sort((a, b) => a.at - b.at);
  for (const p of s.players) p.ready = false;
  setPhase(s, 'battle');
  pushEvent(s, { k: 'wave', wave: s.wave });
}

function endBattle(s: GameState) {
  const reward = waveReward(s.wave);
  for (const p of s.players) p.gold += reward;
  for (const u of s.units) { // a night's rest between waves
    if (u.type === 'castle') continue;
    u.hp = u.maxHp; u.morale = 100; u.routed = 0; u.cd = 0; u.targetId = null;
    u.order = { kind: 'idle', x: u.x, y: u.y }; u.postX = u.x; u.postY = u.y;
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
  if (!castle || castle.hp <= 0) return setPhase(s, 'lost');

  s.battleTime += dt;
  while (s.spawnQueue.length && s.spawnQueue[0].at <= s.battleTime) {
    const it = s.spawnQueue.shift()!;
    const sp = map.spawns[it.lane % map.spawns.length];
    const u = spawnUnit(s, 'enemy', null, it.type, sp.x + (rand(s) - 0.5) * 9, sp.y + (rand(s) - 0.5) * 9, it.lane);
    u.order = { kind: 'attackMove', x: castle.x, y: castle.y };
    // later waves arrive battle-hardened: tougher and harder-hitting (stars over their heads)
    u.level = 1 + Math.min(2, Math.floor(s.wave / 3));
    u.maxHp = u.hp = ENEMIES[it.type].hp * (1 + 0.15 * (u.level - 1));
    s.lastSpawn = s.battleTime;
  }
  if (!s.spawnQueue.length && !s.units.some(u => u.side === 'enemy' && u.hp > 0)) endBattle(s);
}
