import { describe, expect, it } from 'vitest';
import { TROOPS, TROOP_IDS } from './troops';
import { ENEMIES, ENEMY_IDS } from './enemies';
import { STRUCTURES, STRUCT_IDS, towerDps } from './structures';
import { DIFFICULTY, TECH, budget, BOSS_WAVES } from './waves';
import { UNLOCKS, TALENTS, starsFor } from './meta';

const total = (c: object) => (Object.values(c) as number[]).reduce((a, b) => a + b, 0);

describe('data tables', () => {
  it('every troop, enemy and structure costs something and has hit points', () => {
    for (const id of TROOP_IDS) { expect(total(TROOPS[id].cost)).toBeGreaterThan(0); expect(TROOPS[id].hp).toBeGreaterThan(0); }
    for (const id of ENEMY_IDS) { expect(ENEMIES[id].budget).toBeGreaterThan(0); expect(ENEMIES[id].hp).toBeGreaterThan(0); }
    for (const id of STRUCT_IDS) { if (id !== 'keep') expect(total(STRUCTURES[id].cost)).toBeGreaterThan(0); expect(STRUCTURES[id].hp[0]).toBeGreaterThan(0); }
  });

  it('wave budget grows 16 % per wave', () => {
    expect(budget(10, 'normal')).toBeCloseTo(60 * 1.16 ** 9, 2);
    expect(budget(10, 'hard')).toBeCloseTo(60 * 1.16 ** 9 * 1.3, 2);
  });

  it('every tech entry is a real enemy and every enemy is reachable through tech', () => {
    for (const t of TECH) expect(ENEMIES[t.id]).toBeDefined();
  });

  it('crossbow tower: slower than the bow tower, much harder hits, more damage per shooter', () => {
    const bow = STRUCTURES.tower_bow.tower!, xb = STRUCTURES.tower_xbow.tower!;
    expect(xb.cd[0]).toBeGreaterThan(bow.cd[0]);
    expect(xb.dmg[0]).toBeGreaterThanOrEqual(3 * bow.dmg[0]);
    expect(towerDps('tower_xbow', 1) / xb.shooters[0]).toBeGreaterThan(towerDps('tower_bow', 1) / bow.shooters[0]);
  });

  it('ballista pierces a line of 6, catapult blasts 6 m and breaks formations for 6 s', () => {
    expect(STRUCTURES.ballista.tower!.maxTargets![0]).toBe(6);
    expect(STRUCTURES.tower_catapult.tower!.radius).toBe(6);
    expect(STRUCTURES.tower_catapult.tower!.breakFormation).toBe(6);
  });

  it('bow tower garrison grows 2 → 3 → 4', () => {
    expect(STRUCTURES.tower_bow.tower!.shooters).toEqual([2, 3, 4]);
  });

  it('difficulties: easy and normal 25 waves, hard 30', () => {
    expect(DIFFICULTY.easy.waves).toBe(25); expect(DIFFICULTY.normal.waves).toBe(25); expect(DIFFICULTY.hard.waves).toBe(30);
    expect(BOSS_WAVES).toContain(5);
  });

  it('meta: unlocks reference real things, talents need increasing stars', () => {
    for (const u of UNLOCKS) expect(u.stars).toBeGreaterThan(0);
    expect(TALENTS.length).toBe(8);
    expect(starsFor({ won: true, keepMinFrac: 0.6, diff: 'hard' })).toBe(3);
    expect(starsFor({ won: true, keepMinFrac: 0.3, diff: 'normal' })).toBe(1);
    expect(starsFor({ won: false, keepMinFrac: 1, diff: 'hard' })).toBe(0);
  });
});
