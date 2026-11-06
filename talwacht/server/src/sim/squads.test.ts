import { describe, expect, it } from 'vitest';
import { cellOf, MAPS, type GameState, type Squad } from '@talwacht/shared';
import { createGame, newStructure, structById } from './state';
import { applyCommand } from './commands';
import { spawnSquad, squadTick, trainTick, slotStruct } from './squads';
import { armorFactor, combatTick, damage } from './combat';
import { tickMovement } from './movement';
import { removeStructure } from './build';
import { makeUnit } from './units';
import './squads';

const map = MAPS.gruental;
const fresh = () => createGame('gruental', 'normal', 1, [], []);
const base = cellOf(map.keep.x, map.keep.y - 100);
function wallLine(s: GameState, n: number, x0 = base.cx - 3, withTowerAt = -1) {
  return Array.from({ length: n }, (_, i) => newStructure(s, i === withTowerAt ? 'tower_bow' : 'wall', x0 + i, base.cy, 0, true));
}
function run(s: GameState, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) { s.time += 0.05; trainTick(s, 0.05); squadTick(s, 0.05); combatTick(s, 0.05); tickMovement(s, 0.05); }
}
const members = (s: GameState, q: Squad) => q.members.map(id => s.units.find(u => u.id === id)!);

describe('wall slots', () => {
  it('ten archers tapped onto a 7-cell wall each get their own crenel on that wall', () => {
    const s = fresh(), walls = wallLine(s, 7);
    const q = spawnSquad(s, 0, 'archer', map.keep.x, map.keep.y - 60);
    expect(applyCommand(s, 0, { c: 'order', squads: [q.id], x: 0, y: 0, structure: walls[2].id })).toEqual({ ok: true });
    const us = members(s, q);
    const slots = us.map(u => u.slot);
    expect(slots.every(k => k >= 0)).toBe(true);
    expect(new Set(slots).size).toBe(10);
    const ids = new Set(walls.map(w => w.id));
    expect(us.every(u => ids.has(slotStruct(u.slot)))).toBe(true);
  });

  it('a squad larger than the wall fills it and the rest waits at the foot', () => {
    const s = fresh(), walls = wallLine(s, 3, base.cx - 1, 1); // wall, tower, wall = 6 crenels
    const q = spawnSquad(s, 0, 'archer', map.keep.x, map.keep.y - 60);
    q.members.push(...spawnSquad(s, 0, 'archer', map.keep.x, map.keep.y - 60).members.slice(0, 2));
    for (const id of q.members) s.units.find(u => u.id === id)!.squad = q.id;
    applyCommand(s, 0, { c: 'order', squads: [q.id], x: 0, y: 0, structure: walls[0].id });
    const us = members(s, q);
    expect(us.filter(u => u.slot >= 0).length).toBe(6);
    expect(q.order.k).toBe('wall');
  });

  it('archers climb up, and fall and find new crenels when their wall cell is destroyed', () => {
    const s = fresh(), walls = wallLine(s, 8);
    const q = spawnSquad(s, 0, 'archer', walls[3].cx * 4 + 2, walls[3].cy * 4 + 12);
    applyCommand(s, 0, { c: 'order', squads: [q.id], x: 0, y: 0, structure: walls[3].id });
    run(s, 15);
    const us = members(s, q);
    expect(us.every(u => u.z > 0)).toBe(true);
    const victim = structById(s, slotStruct(us[0].slot))!;
    const onIt = us.filter(u => slotStruct(u.slot) === victim.id);
    expect(onIt.length).toBeGreaterThanOrEqual(1);
    removeStructure(s, victim);
    run(s, 0.1);
    for (const u of onIt) { expect(u.z).toBe(0); expect(u.slot).toBeGreaterThanOrEqual(0); expect(slotStruct(u.slot)).not.toBe(victim.id); }
  });
});

describe('combat roles', () => {
  it('spearmen deal 2.5× damage to riders', () => {
    const s = fresh();
    const sp = makeUnit(s, 'spearman', 'p', 0, 100, 100), rider = makeUnit(s, 'e_rider', 'e', null, 101, 100), foot = makeUnit(s, 'e_raider', 'e', null, 101, 101);
    rider.hp = rider.maxHp = 10000; foot.hp = foot.maxHp = 10000;
    damage(s, rider, 14, 'spear', { attacker: sp }); damage(s, foot, 14, 'spear', { attacker: sp });
    const dr = 10000 - rider.hp, df = 10000 - foot.hp;
    expect(dr / armorFactor(3)).toBeCloseTo(2.5 * (df / armorFactor(1)), 3);
  });
});

describe('training', () => {
  it('a barracks trains a squad that walks out, also during a wave', () => {
    const s = fresh(); s.wave = 3;
    const b = newStructure(s, 'barracks', base.cx, base.cy + 6, 0, true);
    expect(applyCommand(s, 0, { c: 'train', building: b.id, troop: 'spearman' })).toEqual({ ok: true });
    run(s, 12);
    expect(s.squads.length).toBe(1);
    expect(s.squads[0].members.length).toBe(10);
  });

  it('refuses training beyond the army cap', () => {
    const s = fresh(); s.res.gold = 10_000; s.res.food = 10_000;
    const b = newStructure(s, 'barracks', base.cx, base.cy + 6, 0, true);
    for (let i = 0; i < 3; i++) expect(applyCommand(s, 0, { c: 'train', building: b.id, troop: 'spearman' })).toEqual({ ok: true });
    expect(applyCommand(s, 0, { c: 'train', building: b.id, troop: 'spearman' })).toEqual({ ok: false, reason: 'army_full' });
  });
});
