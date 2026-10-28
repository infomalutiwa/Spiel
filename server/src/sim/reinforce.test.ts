import { describe, it, expect } from 'vitest';
import { MAPS, QUEUE_MAX, SQUAD_SIZE, ZONE_FALL_PAUSE, squadCost } from '@burgwacht/shared';
import { applyCommand, createGame, tick } from './index';
import { fortressBattle, foe, mine, run } from './helpers';

const map = MAPS.meadow;

describe('reinforcements during battle', () => {
  it('a squad bought in battle is queued, trained, and walks out of the barracks to its rally point', () => {
    const s = fortressBattle();
    const gold = s.players[0].gold;
    const r = applyCommand(s, 0, { c: 'buy', troop: 'knight', x: map.barriers[0].x - 14, y: map.barriers[0].gateY - 6 });
    expect(r.ok).toBe(true);
    expect(s.players[0].gold).toBe(gold - squadCost('knight'));
    expect(s.players[0].queue).toHaveLength(1);
    expect(s.units.filter(u => u.owner === 0 && u.type === 'knight')).toHaveLength(0);
    run(s, 14);
    const knights = s.units.filter(u => u.owner === 0 && u.type === 'knight');
    expect(knights).toHaveLength(SQUAD_SIZE.knight);
    expect(s.players[0].queue).toHaveLength(0);
    run(s, 30);
    for (const k of knights) expect(Math.hypot(k.x - (map.barriers[0].x - 14), k.y - (map.barriers[0].gateY - 6))).toBeLessThan(14);
  });
  it('the queue is limited and refuses when full', () => {
    const s = fortressBattle();
    s.players[0].gold = 99999;
    for (let i = 0; i < QUEUE_MAX; i++) expect(applyCommand(s, 0, { c: 'buy', troop: 'healer', x: 100, y: 40 + i }).ok).toBe(true);
    expect(applyCommand(s, 0, { c: 'buy', troop: 'healer', x: 100, y: 50 })).toEqual({ ok: false, reason: 'queue_full' });
  });
  it('refill in battle trains replacements instead of failing', () => {
    const s = fortressBattle();
    s.players[0].gold = 5000;
    applyCommand(s, 0, { c: 'buy', troop: 'archer', x: 100, y: 40 });
    run(s, 12);
    const squad = s.squads[0];
    const archers = s.units.filter(u => u.squad === squad.id);
    for (const a of archers.slice(0, 4)) a.hp = 0;
    run(s, 0.1);
    expect(applyCommand(s, 0, { c: 'refill', squad: squad.id }).ok).toBe(true);
    expect(applyCommand(s, 0, { c: 'refill', squad: squad.id })).toEqual({ ok: false, reason: 'squad_full' });
    run(s, 12);
    expect(s.units.filter(u => u.squad === squad.id && u.hp > 0)).toHaveLength(SQUAD_SIZE.archer);
  });
});

describe('a fallen zone buys the defenders time', () => {
  it('attackers pause in the fallen zone instead of racing on, and the defence can reinforce meanwhile', () => {
    const s = fortressBattle();
    s.units = s.units.filter(u => u.slot < 0);
    s.spawnQueue = [];
    for (let i = 0; i < 5; i++) foe(s, 'footman', map.zones[0].x + i, map.zones[0].y + (i % 2));
    s.zones[0].progress = 0.999;
    run(s, 2);
    expect(s.zones[0].owner).toBe('enemy');
    expect(s.zones[0].hold).toBeGreaterThan(ZONE_FALL_PAUSE - 3);
    const inner = map.zones[1];
    // during the pause nobody has reached the next zone
    run(s, ZONE_FALL_PAUSE - 6);
    const enemies = s.units.filter(u => u.side === 'enemy');
    expect(enemies.length).toBeGreaterThan(0);
    for (const e of enemies) expect(Math.hypot(e.x - inner.x, e.y - inner.y)).toBeGreaterThan(inner.r);
    expect(s.zones[1].progress).toBe(0);
    // buy new troops while the pause is on; the emergency levy trains them faster than normal
    s.players[0].gold = 5000;
    expect(applyCommand(s, 0, { c: 'buy', troop: 'spearman', x: inner.x + 10, y: inner.y }).ok).toBe(true);
    run(s, 6);
    expect(s.units.filter(u => u.owner === 0 && u.type === 'spearman').length).toBe(SQUAD_SIZE.spearman);
  });
  it('a held zone with defenders: the wave is survived after reinforcements arrive', () => {
    const s = createGame('meadow', 3);
    s.phase = 'battle'; s.units = s.units.filter(u => u.slot < 0);
    s.spawnQueue = [];
    for (let i = 0; i < 6; i++) foe(s, 'footman', map.zones[0].x + i, map.zones[0].y);
    s.zones[0].progress = 0.999; s.zones[0].owner = 'player';
    s.players[0].gold = s.players[1].gold = 5000;
    run(s, 2);
    expect(s.zones[0].owner).toBe('enemy');
    applyCommand(s, 0, { c: 'buy', troop: 'knight', x: map.zones[1].x + 6, y: map.zones[1].y - 4 });
    applyCommand(s, 1, { c: 'buy', troop: 'archer', x: map.zones[1].x + 8, y: map.zones[1].y + 4 });
    for (let i = 0; i < 20 * 120 && s.units.some(u => u.side === 'enemy' && u.hp > 0); i++) tick(s);
    expect(s.units.some(u => u.side === 'enemy' && u.hp > 0)).toBe(false);
    expect(s.zones[1].owner).toBe('player');
    expect(s.phase).not.toBe('lost');
  });
});
