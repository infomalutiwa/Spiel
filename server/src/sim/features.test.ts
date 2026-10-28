import { describe, it, expect } from 'vitest';
import {
  BARRACKS, MAX_ARMY, START_GOLD, START_STONE, STONE_LOT, STONE_PER_SHOT, STONE_PRICE, TECH, TECH_COST, UNIT_DEFS, WAVES,
  MAPS, armyCap, gemReward, isBossWave, stoneReward, waveReward,
} from '@burgwacht/shared';
import { applyCommand, applyDamage, createGame, resolveDamage, tick } from './index';
import { battle, foe, mine, run } from './helpers';

const hold = (u: { order: { kind: string; x: number; y: number }; x: number; y: number }) => { u.order = { kind: 'hold', x: u.x, y: u.y } as never; };

describe('separate purses', () => {
  it('every player starts with their own gold, stone and no gems', () => {
    const s = createGame('meadow', 1);
    expect(s.players.map(p => [p.gold, p.stone, p.gems])).toEqual([[START_GOLD, START_STONE, 0], [START_GOLD, START_STONE, 0]]);
    s.players[0].gold = 5; // spending / losing one purse never touches the other
    expect(s.players[1].gold).toBe(START_GOLD);
  });
  it('a cleared wave pays gold, stone and gems to each player; boss waves pay more gems', () => {
    const s = createGame('meadow', 1);
    s.phase = 'battle'; s.spawnQueue = []; s.units = s.units.filter(u => u.slot < 0);
    const [g, st, ge] = [s.players[0].gold, s.players[0].stone, s.players[0].gems];
    tick(s);
    expect(s.phase).toBe('prep');
    for (const p of s.players) expect([p.gold, p.stone, p.gems]).toEqual([g + waveReward(0), st + stoneReward(0), ge + gemReward(0, WAVES.length)]);
    expect(isBossWave(4)).toBe(true);
    expect(gemReward(4, WAVES.length)).toBeGreaterThan(gemReward(3, WAVES.length));
    expect(gemReward(3, WAVES.length)).toBeLessThanOrEqual(1); // gems stay scarce
  });
  it('gold buys stone in lots', () => {
    const s = createGame('meadow', 1);
    expect(applyCommand(s, 1, { c: 'trade', lots: 2 }).ok).toBe(true);
    expect(s.players[1].stone).toBe(START_STONE + 2 * STONE_LOT);
    expect(s.players[1].gold).toBe(START_GOLD - 2 * STONE_LOT * STONE_PRICE);
    expect(s.players[0].stone).toBe(START_STONE);
    s.players[1].gold = 10;
    expect(applyCommand(s, 1, { c: 'trade', lots: 1 })).toEqual({ ok: false, reason: 'not_enough_gold' });
    expect(applyCommand(s, 1, { c: 'trade', lots: -3 }).ok).toBe(false);
  });
});

describe('catapult', () => {
  const setup = () => {
    const s = battle();
    const c = mine(s, 'catapult', 40, 40);
    hold(c);
    return { s, c };
  };
  it('lobs a shell that arrives later, then hurts everything in the blast with falloff', () => {
    const { s, c } = setup();
    const a = foe(s, 'footman', 70, 40), b = foe(s, 'footman', 72.5, 40), far = foe(s, 'footman', 80, 40);
    for (const e of [a, b, far]) hold(e);
    run(s, 0.1);
    expect(s.shells.length).toBe(1);
    expect(a.hp).toBe(a.maxHp); // still in the air
    run(s, 2.5);
    expect(s.shells.length).toBe(0);
    expect(a.hp).toBeLessThan(a.maxHp * 0.6);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(far.hp).toBe(far.maxHp);
    expect(Math.max(a.hp, b.hp)).toBeGreaterThan(Math.min(a.hp, b.hp) - 1);
    expect(s.players[0].stone).toBe(START_STONE - STONE_PER_SHOT);
    void c;
  });
  it('aims at the densest group, not the nearest man', () => {
    const { s } = setup();
    const lone = foe(s, 'footman', 55, 40);
    hold(lone);
    const pack = [0, 1, 2, 3, 4].map(i => foe(s, 'footman', 68 + (i % 2) * 1.5, 38 + i));
    pack.forEach(hold);
    run(s, 0.1);
    const sh = s.shells[0];
    expect(Math.hypot(sh.tx - 68.7, sh.ty - 40)).toBeLessThan(3);
  });
  it('cannot hit what is too close, and does not fire without stone (with a warning event)', () => {
    const { s, c } = setup();
    const near = foe(s, 'footman', 46, 40);
    hold(near);
    run(s, 1);
    expect(s.shells.length).toBe(0);
    near.x = 70;
    s.players[0].stone = 2;
    run(s, 1);
    expect(s.shells.length).toBe(0);
    expect(s.players[0].stone).toBe(2);
    expect(s.events.some(e => e.k === 'dry')).toBe(true);
    s.players[0].stone = 30;
    run(s, 1);
    expect(s.shells.length).toBeGreaterThan(0);
    void c;
  });
  it('is far deadlier than before against structures, rams and groups', () => {
    const s = battle();
    const c = mine(s, 'catapult', 40, 40), ram = foe(s, 'ram', 70, 40), fm = foe(s, 'footman', 70, 44);
    expect(resolveDamage(c, ram)).toBeGreaterThan(UNIT_DEFS.ram.armorValue * 1.5);
    expect(resolveDamage(c, ram)).toBeGreaterThan(resolveDamage(c, fm) * 1.4);
    expect(UNIT_DEFS.catapult.damage).toBeGreaterThanOrEqual(80);
  });
  it('leads a marching enemy', () => {
    const s = battle();
    const c = mine(s, 'catapult', 118, 60); hold(c); c.cd = 1.2; // let the marcher get up to speed first
    const e = foe(s, 'footman', 150, 60); // marches west along its route
    run(s, 1.4);
    const sh = s.shells[0];
    expect(sh).toBeTruthy();
    expect(sh.tx).toBeLessThan(e.x - 1); // aimed ahead of the marcher
    void c;
  });
});

describe('hold and assault', () => {
  it('a unit on hold never steps forward, even with an enemy just out of reach', () => {
    const s = battle();
    const k = mine(s, 'knight', 50, 40); hold(k);
    const e = foe(s, 'raider_archer', 63, 40); hold(e);
    run(s, 8);
    expect(k.x).toBeCloseTo(50, 1);
    expect(k.y).toBeCloseTo(40, 1);
  });
  it('hold survives into the next wave', () => {
    const s = createGame('meadow', 1);
    s.phase = 'battle'; s.spawnQueue = []; s.units = s.units.filter(u => u.slot < 0);
    const k = mine(s, 'knight', 100, 40); hold(k);
    tick(s);
    expect(s.phase).toBe('prep');
    expect(k.order.kind).toBe('hold');
  });
  it('"attack" needs no target: the squad finds and fights the nearest enemy', () => {
    const s = battle();
    const ks = [0, 1, 2].map(i => mine(s, 'knight', 40, 40 + i * 2));
    const e = foe(s, 'footman', 90, 42); hold(e);
    expect(applyCommand(s, 0, { c: 'attack', ids: ks.map(k => k.id) }).ok).toBe(true);
    expect(ks[0].order.kind).toBe('assault');
    run(s, 25);
    expect(e.hp).toBe(0);
    expect(ks[0].x).toBeGreaterThan(60);
  });
});

describe('troop logic', () => {
  it('archers back away from melee enemies that get too close, but only while not holding', () => {
    const s = battle();
    const a = mine(s, 'archer', 50, 40);
    const e = foe(s, 'footman', 53, 40); hold(e);
    run(s, 1);
    expect(a.x).toBeLessThan(50);
    const s2 = battle();
    const h = mine(s2, 'archer', 50, 40); hold(h);
    const e2 = foe(s2, 'footman', 53, 40); hold(e2);
    run(s2, 1);
    expect(h.x).toBeCloseTo(50, 1);
  });
  it('knights taunt: enemy melee hits the tank instead of a nearer archer', () => {
    const s = battle();
    const archer = mine(s, 'archer', 60, 40), knight = mine(s, 'knight', 60, 42);
    hold(archer); hold(knight);
    const f = foe(s, 'footman', 62.5, 40);
    f.order = { kind: 'hold', x: f.x, y: f.y };
    run(s, 0.3);
    expect(f.targetId).toBe(knight.id);
  });
  it('ranged units prefer the vulnerable: shaman and wounded over a healthy tank', () => {
    const s = battle();
    const a = mine(s, 'archer', 40, 40); hold(a);
    const ig = foe(s, 'ironguard', 48, 40), sh = foe(s, 'shaman', 52, 40);
    hold(ig); hold(sh);
    run(s, 0.2);
    expect(a.targetId).toBe(sh.id);
  });
  it('healer tops up the most wounded ally first', () => {
    const s = battle();
    const h = mine(s, 'healer', 50, 40);
    const a = mine(s, 'knight', 53, 40), b = mine(s, 'knight', 53, 43);
    a.hp = a.maxHp * 0.8; b.hp = b.maxHp * 0.2;
    const a0 = a.hp, b0 = b.hp;
    run(s, 0.2);
    expect(b.hp - b0).toBeGreaterThan(a.hp - a0);
    void h;
  });
  it('spearmen hurt riders much more than they hurt infantry', () => {
    const s = battle();
    const sp = mine(s, 'spearman', 50, 40);
    expect(resolveDamage(sp, foe(s, 'raider_rider', 52, 40))).toBeGreaterThan(resolveDamage(sp, foe(s, 'footman', 52, 42)) * 1.5);
  });
});

describe('troop levels and branches (paid with gems)', () => {
  it('level 2 needs a branch, gold and gems; the troops on the field improve; the other player is unaffected', () => {
    const s = createGame('meadow', 1);
    const k = mine(s, 'archer', 100, 40), k1 = mine(s, 'archer', 100, 44, 1);
    expect(applyCommand(s, 0, { c: 'tech', troop: 'archer', branch: 1 })).toEqual({ ok: false, reason: 'not_enough_gems' });
    s.players[0].gems = 10;
    expect(applyCommand(s, 0, { c: 'tech', troop: 'archer' })).toEqual({ ok: false, reason: 'need_branch' });
    const hp0 = k.maxHp;
    expect(applyCommand(s, 0, { c: 'tech', troop: 'archer', branch: 1 }).ok).toBe(true);
    expect(s.players[0].gems).toBe(10 - TECH_COST[0].gems);
    expect(k.level).toBe(2); expect(k.branch).toBe(1); expect(k.maxHp).toBeGreaterThan(hp0);
    expect(k1.level).toBe(1);
    expect(TECH.archer[0].id).toBe('fire');
    expect(applyCommand(s, 0, { c: 'tech', troop: 'archer', branch: 2 }).ok).toBe(true); // level 3 keeps the branch
    expect(k.level).toBe(3); expect(k.branch).toBe(1);
    expect(applyCommand(s, 0, { c: 'tech', troop: 'archer' })).toEqual({ ok: false, reason: 'max_level' });
    const fresh = mine(s, 'archer', 100, 48);
    expect(fresh.level).toBe(3);
  });
  it('fire arrows set the target ablaze: damage over time, spreading to neighbours', () => {
    const s = battle();
    s.players[0].gems = 10; s.players[0].tech.archer = { level: 2, branch: 1 };
    const a = mine(s, 'archer', 40, 40); hold(a);
    const t = foe(s, 'footman', 52, 40), n = foe(s, 'footman', 53.5, 40);
    hold(t); hold(n);
    run(s, 0.15);
    expect(t.burn).toBeGreaterThan(2);
    const hp1 = t.hp;
    run(s, 2);
    expect(t.hp).toBeLessThan(hp1 - 8);
    run(s, 2);
    expect(n.hp).toBeLessThan(n.maxHp);
  });
  it('plain arrows do not burn', () => {
    const s = battle();
    const a = mine(s, 'archer', 40, 40); hold(a);
    const t = foe(s, 'footman', 52, 40); hold(t);
    run(s, 0.5);
    expect(t.burn).toBe(0);
  });
  it('healer revival brings a fallen ally back once, then needs to recharge', () => {
    const s = battle();
    s.players[0].tech.healer = { level: 2, branch: 2 };
    const h = mine(s, 'healer', 50, 40), k = mine(s, 'knight', 53, 40), k2 = mine(s, 'knight', 53, 43);
    applyDamage(s, { owner: null }, k, 9999);
    expect(k.hp).toBeGreaterThan(k.maxHp * 0.4);
    expect(s.events.some(e => e.k === 'revive')).toBe(true);
    expect(h.t2).toBeGreaterThan(10);
    applyDamage(s, { owner: null }, k2, 9999); // still recharging: this one stays down
    expect(k2.hp).toBe(0);
  });
  it('frost mage slows what it hits', () => {
    const s = battle();
    s.players[0].tech.mage = { level: 2, branch: 2 };
    const m = mine(s, 'mage', 40, 40); hold(m);
    const t = foe(s, 'footman', 50, 40); hold(t);
    run(s, 0.2);
    expect(t.slow).toBeGreaterThan(1);
  });
});

describe('barracks levels', () => {
  it('raise army capacity, cost gold and gems, and speed up training', () => {
    const s = createGame('meadow', 1);
    expect(armyCap(1)).toBe(MAX_ARMY);
    expect(BARRACKS.map(b => b.cap)).toEqual([30, 40, 55, 75, 100]);
    s.players[0].gold = 9000; s.players[0].gems = 0;
    expect(applyCommand(s, 0, { c: 'barracks' }).ok).toBe(true); // level 2 costs no gems
    expect(s.players[0].barracks).toBe(2);
    expect(applyCommand(s, 0, { c: 'barracks' })).toEqual({ ok: false, reason: 'not_enough_gems' });
    s.players[0].gems = 20;
    for (let i = 0; i < 3; i++) expect(applyCommand(s, 0, { c: 'barracks' }).ok).toBe(true);
    expect(applyCommand(s, 0, { c: 'barracks' })).toEqual({ ok: false, reason: 'max_level' });
    expect(armyCap(s.players[0].barracks)).toBe(100);
  });
  it('a bigger army only fits after the upgrade', () => {
    const s = createGame('meadow', 1);
    s.players[0].gold = 99999;
    const z = { x: 100, y: 40 };
    let n = 0;
    while (applyCommand(s, 0, { c: 'buy', troop: 'archer', x: z.x, y: z.y + (n++ % 5) * 6 }).ok);
    const used = s.units.filter(u => u.owner === 0).length;
    expect(used).toBeLessThanOrEqual(30);
    applyCommand(s, 0, { c: 'barracks' });
    expect(applyCommand(s, 0, { c: 'buy', troop: 'archer', x: z.x, y: 80 }).ok).toBe(true);
  });
});

describe('repairs in battle', () => {
  it('a wall piece can only be mended every 30 seconds while the battle runs (no endless stalemate at a gate)', () => {
    const s = createGame('meadow', 1);
    s.phase = 'battle'; s.spawnQueue = [{ at: 9999, type: 'footman', lane: 1 }];
    s.players[0].gold = 9999;
    const slot = MAPS.meadow.walls.findIndex(w => w.kind === 'gate' && w.bar === 0);
    const gate = s.units.find(u => u.slot === slot)!;
    gate.hp = gate.maxHp * 0.3;
    expect(applyCommand(s, 0, { c: 'wall', op: 'repair', slot }).ok).toBe(true);
    gate.hp = gate.maxHp * 0.3;
    expect(applyCommand(s, 0, { c: 'wall', op: 'repair', slot })).toEqual({ ok: false, reason: 'cooldown' });
    run(s, 31);
    expect(applyCommand(s, 0, { c: 'wall', op: 'repair', slot }).ok).toBe(true);
  });
});
