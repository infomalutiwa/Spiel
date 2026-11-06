import { BOSS_WAVES, ENEMIES, interval, MAPS, polyDist, type GameState, type Group, type Unit, type WaveInfo } from '@talwacht/shared';
import { handlers } from './commands';
import { laneName, observe, planWave } from './commander';
import { spawnTestudo } from './siege';
import { CONTROLLED, spawnEnemy, speedOf } from './movement';
import { nearby } from './units';
import { rand } from './state';

const RETREAT = CONTROLLED + 60;
const near: Unit[] = [];

function ensurePlans(s: GameState) {
  while (s.plans.length < 3 && s.wave + s.plans.length + 1 <= s.waveCount) s.plans.push(planWave(s, s.wave + s.plans.length + 1));
}

export function startWave(s: GameState) {
  s.memory = observe(s);
  s.wave++;
  const plan = s.plans.length && s.plans[0].wave === s.wave ? s.plans.shift()! : planWave(s, s.wave);
  if (s.plans.length && s.plans[0].wave <= s.wave) s.plans = [];
  // later plans adapt to what the enemy saw this wave
  s.plans = s.plans.map(p => planWave(s, p.wave));
  s.bonusBudget = 0;
  plan.at = s.time;
  s.special = plan.special;
  s.rain = plan.special === 'rain';
  const lanes = MAPS[s.mapId].lanes;
  for (const g of plan.groups) {
    const group: Group = { id: s.nextId++, type: g.type, lane: g.lane, size0: g.testudo ? g.n + 1 : g.n, members: [], budget: ENEMIES[g.type].budget * g.n, retreating: false };
    s.groups.push(group);
    if (g.testudo) { s.spawnQ.push({ at: s.time + g.delay, type: 'e_shield', lane: g.lane, group: group.id, formation: g.n, idx: 0 }); continue; }
    for (let i = 0; i < g.n; i++) s.spawnQ.push({ at: s.time + g.delay + Math.floor(i / 4) * 1.1, type: g.type, lane: g.lane, group: group.id, formation: 0, idx: i % 4 });
  }
  s.spawnQ.sort((a, b) => a.at - b.at);
  s.nextWaveAt = s.time + interval(s.wave, s.diff);
  s.events.push({ k: 'wave', n: s.wave, boss: plan.boss, special: plan.special });
  void lanes;
  ensurePlans(s);
}

export function callWave(s: GameState) {
  if (s.wave >= s.waveCount) return false;
  const left = Math.max(0, s.nextWaveAt - s.time);
  s.res.gold += Math.floor(left);
  startWave(s);
  return true;
}

function spawnDue(s: GameState) {
  const lanes = MAPS[s.mapId].lanes;
  while (s.spawnQ.length && s.spawnQ[0].at <= s.time) {
    const q = s.spawnQ.shift()!;
    const lane = lanes.find(l => l.id === q.lane) ?? lanes[0];
    const [x, y] = lane.pts[0];
    const g = s.groups.find(gr => gr.id === q.group);
    const jitter = (q.idx - 1.5) * 2.2 + (rand(s) - 0.5);
    if (q.formation) {
      const f = spawnTestudo(s, x, y + 3, q.lane, q.formation, q.group);
      g?.members.push(f.ram, ...f.members);
      continue;
    }
    const u = spawnEnemy(s, q.type, x + jitter, y + 2 + rand(s), q.lane, q.group);
    g?.members.push(u.id);
    if (q.type === 'warlord') s.events.push({ k: 'toast', text: '👑 Der Kriegsfürst betritt das Tal!', warn: true });
  }
}

function bossTick(s: GameState) {
  for (const b of s.units) {
    if (b.type !== 'warlord' || b.hp <= 0) continue;
    for (const u of nearby(s, b.x, b.y, 20, near)) if (u.side === 'e' && u !== b && u.slow <= 0) { u.slow = -0.25; u.slowT = 0.3; }
    if (b.hp < b.maxHp * 0.5 && b.charge >= 0) {
      b.charge = -1; // once
      for (let i = 0; i < 12; i++) {
        const e = spawnEnemy(s, 'e_soldier', b.x + (i % 4 - 1.5) * 2, b.y - 6 - Math.floor(i / 4) * 2, 0, b.group);
        s.groups.find(g => g.id === b.group)?.members.push(e.id);
      }
      s.events.push({ k: 'toast', text: '👑 Der Kriegsfürst ruft seine Leibwache!', warn: true });
    }
  }
}

function retreatTick(s: GameState, dt: number) {
  for (const g of s.groups) {
    if (g.retreating || g.size0 < 4 || g.type === 'warlord') continue;
    if (s.spawnQ.some(q => q.group === g.id)) continue;
    const alive = g.members.filter(id => s.units.some(u => u.id === id && u.hp > 0)).length;
    if (alive > 0 && alive < g.size0 * 0.4) {
      g.retreating = true;
      for (const u of s.units) if (g.members.includes(u.id) && u.hp > 0 && u.z === 0 && u.type !== 'siege_tower') { u.mode = RETREAT; u.formation = 0; u.target = 0; }
      s.events.push({ k: 'toast', text: `🏳️ ${ENEMIES[g.type].name} ziehen sich zurück` });
    }
  }
  const lanes = MAPS[s.mapId].lanes;
  for (const u of s.units) {
    if (u.mode !== RETREAT || u.hp <= 0) continue;
    const lane = lanes.find(l => l.id === u.gx) ?? lanes[0];
    const [x, y] = lane.pts[0];
    const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
    if (d < 6 || u.y < 3) { // gone: half of what is left of them comes back next wave
      u.hp = 0; u.dead = 0.01;
      s.bonusBudget += ENEMIES[u.type as keyof typeof ENEMIES].budget * 0.5;
      continue;
    }
    // follow the lane back (nearest polyline segment start)
    const pd = polyDist(u.x, u.y, lane.pts);
    const tgt = lane.pts[Math.max(0, pd.seg)];
    const tx = pd.d > 8 ? tgt[0] : x, ty = pd.d > 8 ? tgt[1] : y;
    const ex = tx - u.x, ey = ty - u.y, e = Math.hypot(ex, ey) || 1, v = speedOf(s, u) * dt;
    u.x += (ex / e) * v; u.y += (ey / e) * v; u.facing = Math.atan2(ey, ex); u.anim = 1;
  }
}

export function wavesTick(s: GameState, dt: number) {
  if (s.wave < s.waveCount && s.time >= s.nextWaveAt) startWave(s);
  else ensurePlans(s);
  spawnDue(s);
  bossTick(s);
  retreatTick(s, dt);
  s.groups = s.groups.filter(g => g.members.some(id => s.units.some(u => u.id === id)) || s.spawnQ.some(q => q.group === g.id));
  s.night += ((s.special === 'night' ? 1 : 0) - s.night) * Math.min(1, dt * 0.3);
}

export function allClear(s: GameState) {
  return s.wave >= s.waveCount && !s.spawnQ.length && !s.units.some(u => u.side === 'e' && u.hp > 0);
}

/** what the HUD's wave timeline shows; detail depends on watchtowers */
export function timeline(s: GameState): WaveInfo[] {
  const watch = s.structs.some(st => st.kind === 'watchtower' && st.build === 0);
  return s.plans.slice(0, 3).map((p, i) => {
    const at = s.nextWaveAt + s.plans.slice(0, i).reduce((a, q) => a + interval(q.wave, s.diff), 0);
    const icons = [...new Set(p.groups.map(g => (g.testudo ? '🐢' : ENEMIES[g.type].icon)))];
    return {
      wave: p.wave, in: Math.max(0, Math.round(at - s.time)), lane: p.mainLane, boss: p.boss || BOSS_WAVES.includes(p.wave), special: p.special,
      icons: watch || i === 0 ? icons.slice(0, 6) : ['❔'],
      scout: watch ? [`Hauptstoß: ${laneName(p.mainLane)}`, ...p.scout] : i === 0 ? p.scout.slice(0, 2) : [],
    };
  });
}

handlers.callWave = s => (callWave(s) ? { ok: true } : { ok: false, reason: 'no_more_waves' });
