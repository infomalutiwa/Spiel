import { describe, it, expect } from 'vitest';
import { UNIT_DEFS, WAVES, MAPS, START_GOLD, SQUAD_SIZE, squadCost, type Command } from '@burgwacht/shared';
import { createGame, applyCommand, resolveDamage, castAbility, tick, stepMovement, separate, getUnit, SPEED_SCALE } from './index';
import { battle, mine, foe, run } from './helpers';

describe('movement', () => {
  it('arrives at the move target and never exceeds speed*dt', () => {
    const s = battle();
    const u = mine(s, 'knight', 40, 40);
    u.order = { kind: 'move', x: 50, y: 40 };
    const before = u.x;
    stepMovement(s, 0.05);
    expect(u.x - before).toBeLessThanOrEqual(UNIT_DEFS.knight.speed * SPEED_SCALE * 0.05 + 1e-9);
    run(s, 6);
    expect(Math.hypot(u.x - 50, u.y - 40)).toBeLessThan(0.5);
    expect(u.order.kind).toBe('idle');
  });
  it('separates units at identical positions without NaN', () => {
    const s = battle();
    const a = mine(s, 'knight', 40, 40), b = mine(s, 'knight', 40, 40);
    separate(s);
    expect(Number.isFinite(a.x + a.y + b.x + b.y)).toBe(true);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
  });
  it('keeps units inside the map', () => {
    const s = battle();
    const u = mine(s, 'cavalry', 3, 3);
    u.order = { kind: 'move', x: -50, y: -50 };
    run(s, 3);
    expect(u.x).toBeGreaterThanOrEqual(1);
    expect(u.y).toBeGreaterThanOrEqual(1);
  });
});

describe('combat and counters', () => {
  it('spearman hurts cavalry more than a knight does', () => {
    const s = battle();
    const horse = foe(s, 'raider_rider', 80, 40);
    expect(resolveDamage(mine(s, 'spearman', 78, 40), horse))
      .toBeGreaterThan(resolveDamage(mine(s, 'knight', 78, 41), horse));
  });
  it('cavalry beats archers, bolts beat armor, archers bounce off knights', () => {
    const s = battle();
    const archer = mine(s, 'archer', 30, 30), knight = mine(s, 'knight', 30, 34);
    const rider = foe(s, 'raider_rider', 60, 30);
    expect(resolveDamage(rider, archer)).toBeGreaterThan(UNIT_DEFS.raider_rider.damage);
    const xbow = mine(s, 'crossbowman', 20, 20), bow = mine(s, 'archer', 20, 24);
    expect(resolveDamage(xbow, foe(s, 'brute', 60, 40))).toBeGreaterThan(resolveDamage(bow, foe(s, 'brute', 60, 44)) * 3);
    expect(resolveDamage(bow, knight)).toBeLessThan(UNIT_DEFS.archer.damage);
  });
  it('respects attack cooldown', () => {
    const s = battle();
    const k = mine(s, 'knight', 60, 40), e = foe(s, 'footman', 61.5, 40);
    k.order = { kind: 'hold', x: 60, y: 40 };
    run(s, 0.1); // first swing
    const hp1 = e.hp;
    run(s, 0.4); // still cooling down
    expect(e.hp).toBe(hp1);
    run(s, 1.2);
    expect(e.hp).toBeLessThan(hp1);
  });
  it('does not damage a target out of range while holding', () => {
    const s = battle();
    const k = mine(s, 'knight', 60, 40), e = foe(s, 'footman', 70, 40);
    k.order = { kind: 'hold', x: 60, y: 40 };
    e.order = { kind: 'hold', x: 70, y: 40 };
    run(s, 3);
    expect(e.hp).toBe(e.maxHp);
  });
  it('removes the dead, retargets, pays gold only to the killer’s owner', () => {
    const s = battle();
    const a = mine(s, 'knight', 60, 40, 1);
    const e1 = foe(s, 'footman', 62, 40), e2 = foe(s, 'footman', 62, 42);
    e1.hp = 1;
    const g0 = s.players[0].gold, g1 = s.players[1].gold;
    run(s, 3);
    expect(getUnit(s, e1.id)).toBeUndefined();
    expect(a.targetId).not.toBe(e1.id);
    expect(s.players[1].gold).toBeGreaterThan(g1);
    expect(s.players[0].gold).toBe(g0);
    expect(e2.hp).toBeLessThan(e2.maxHp);
  });
});

describe('special troops', () => {
  it('healer heals wounded allies and idles cleanly when nobody is hurt', () => {
    const s = battle();
    const h = mine(s, 'healer', 50, 40), k = mine(s, 'knight', 53, 40);
    run(s, 1);
    expect(Number.isFinite(h.x + h.y)).toBe(true);
    k.hp = 50;
    run(s, 2);
    expect(k.hp).toBeGreaterThan(50);
  });
  it('mage splashes everything near the target', () => {
    const s = battle();
    const m = mine(s, 'mage', 50, 40);
    const a = foe(s, 'footman', 58, 40), b = foe(s, 'footman', 59, 41), far = foe(s, 'footman', 58, 60);
    far.order = { kind: 'hold', x: 58, y: 60 };
    a.order = b.order = { kind: 'hold', x: 58, y: 40 };
    m.order = { kind: 'hold', x: 50, y: 40 };
    run(s, 0.2);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });
  it('crossbow ignores part of heavy armor', () => {
    const s = battle();
    const x = mine(s, 'crossbowman', 40, 40), brute = foe(s, 'brute', 60, 40);
    brute.formation = 'line'; // no shield-wall bonus, so the plain armor math applies
    const withPierce = resolveDamage(x, brute);
    const noPierce = UNIT_DEFS.crossbowman.damage * 1.1 * 100 / (100 + UNIT_DEFS.brute.armorValue);
    expect(withPierce).toBeGreaterThan(noPierce);
  });
  it('shaman buffs allies and arrow rain respects cooldown', () => {
    const s = battle();
    const sh = foe(s, 'shaman', 100, 40), f = foe(s, 'footman', 102, 40);
    run(s, 0.1);
    expect(f.buff).toBeGreaterThan(0);
    expect(sh.buff).toBeGreaterThan(0);
    foe(s, 'footman', 90, 20);
    expect(castAbility(s, 0, 'arrowRain', 90, 20)).toBe(true);
    expect(castAbility(s, 0, 'arrowRain', 90, 20)).toBe(false);
    run(s, 23);
    expect(castAbility(s, 0, 'arrowRain', 90, 20)).toBe(true);
  });
});

describe('orders', () => {
  it('buy checks gold, zone and phase; a purchase is a whole squad', () => {
    const s = createGame('meadow', 1);
    expect(applyCommand(s, 0, { c: 'buy', troop: 'knight', x: 140, y: 60 })).toEqual({ ok: true });
    expect(s.players[0].gold).toBe(START_GOLD - squadCost('knight'));
    const knights = s.units.filter(u => u.type === 'knight');
    expect(knights.length).toBe(SQUAD_SIZE.knight);
    expect(new Set(knights.map(u => u.squad)).size).toBe(1);
    s.players[0].gold = 10;
    expect(applyCommand(s, 0, { c: 'buy', troop: 'knight', x: 140, y: 60 })).toEqual({ ok: false, reason: 'not_enough_gold' });
    expect(s.players[0].gold).toBe(10);
    s.players[0].gold = 5000;
    expect(applyCommand(s, 0, { c: 'buy', troop: 'knight', x: 5, y: 5 })).toEqual({ ok: false, reason: 'outside_zone' });
    expect(applyCommand(s, 0, { c: 'buy', troop: 'nope' as never, x: 140, y: 60 }).ok).toBe(false);
    expect(applyCommand(s, 0, { c: 'buy', troop: 'knight', x: NaN, y: 60 }).ok).toBe(false);
    s.phase = 'won';
    expect(applyCommand(s, 0, { c: 'buy', troop: 'knight', x: 140, y: 60 })).toEqual({ ok: false, reason: 'not_prep' });
  });
  it('rejects orders for units the player does not own, changing nothing', () => {
    const s = battle();
    const theirs = mine(s, 'knight', 50, 40, 1), own = mine(s, 'knight', 50, 44, 0);
    const r = applyCommand(s, 0, { c: 'move', ids: [own.id, theirs.id], x: 60, y: 40 });
    expect(r.ok).toBe(false);
    expect(own.order.kind).toBe('idle');
    expect(theirs.order.kind).toBe('idle');
    expect(applyCommand(s, 0, { c: 'move', ids: [999], x: 60, y: 40 }).ok).toBe(false);
    expect(applyCommand(s, 0, { c: 'move', ids: [], x: 60, y: 40 }).ok).toBe(false);
  });
  it('formations give distinct slots and wedge puts one unit at the tip', () => {
    const slots = (f: 'line' | 'wedge' | 'block') => {
      const s = battle();
      const us = Array.from({ length: 9 }, (_, i) => mine(s, 'knight', 40, 20 + i * 3));
      applyCommand(s, 0, { c: 'move', ids: us.map(u => u.id), x: 80, y: 45, formation: f });
      return us.map(u => `${u.order.x.toFixed(1)},${u.order.y.toFixed(1)}`);
    };
    const [line, wedge, block] = [slots('line'), slots('wedge'), slots('block')];
    expect(new Set(wedge).size).toBe(9);
    expect(line).not.toEqual(wedge);
    expect(block).not.toEqual(wedge);
    const xs = (a: string[]) => a.map(p => +p.split(',')[0]);
    expect(xs(wedge).filter(x => x === Math.max(...xs(wedge))).length).toBe(1);
  });
  it('hold stops chasing; retreat heads to the castle', () => {
    const s = battle();
    const k = mine(s, 'knight', 60, 40), e = foe(s, 'footman', 70, 40);
    e.order = { kind: 'hold', x: 70, y: 40 };
    applyCommand(s, 0, { c: 'hold', ids: [k.id] });
    run(s, 3);
    expect(k.x).toBeCloseTo(60, 0);
    applyCommand(s, 0, { c: 'retreat', ids: [k.id] });
    run(s, 25);
    expect(k.x).toBeLessThan(45);
  });
  it('placement only in prep and inside the zone', () => {
    const s = createGame('meadow', 1);
    applyCommand(s, 0, { c: 'buy', troop: 'knight', x: 140, y: 60 });
    const u = s.units.find(x => x.type === 'knight')!;
    expect(applyCommand(s, 0, { c: 'place', ids: [u.id], x: 150, y: 60 }).ok).toBe(true);
    expect(u.x).toBeGreaterThan(140);
    expect(applyCommand(s, 0, { c: 'place', ids: [u.id], x: 230, y: 30 })).toEqual({ ok: false, reason: 'outside_zone' });
  });
});

describe('waves and phases', () => {
  it('starts the battle when both players are ready and spawns the wave', () => {
    const s = createGame('meadow', 1);
    applyCommand(s, 0, { c: 'ready', ready: true });
    tick(s);
    expect(s.phase).toBe('prep');
    applyCommand(s, 1, { c: 'ready', ready: true });
    tick(s);
    expect(s.phase).toBe('battle');
    const total = WAVES[0].groups.reduce((a, g) => a + Math.max(1, Math.round(g.count * MAPS.meadow.waveScale * 0.8)), 0);
    expect(s.spawnQueue.length).toBe(total);
    run(s, 16);
    expect(s.spawnQueue.length).toBe(0);
    expect(s.units.filter(u => u.side === 'enemy').length).toBeGreaterThan(0);
    const spawnPoints = MAPS.meadow.spawns;
    for (const e of s.units.filter(u => u.side === 'enemy')) expect(e.x).toBeGreaterThan(spawnPoints[0].x - 200);
  });
  it('starts the battle when the prep timer ends', () => {
    const s = createGame('meadow', 1);
    s.timer = 0.1;
    tick(s); tick(s); tick(s);
    expect(s.phase).toBe('battle');
  });
  it('clearing a wave pays gold, heals, and returns to prep', () => {
    const s = battle();
    s.spawnQueue = [];
    const k = mine(s, 'knight', 40, 40);
    k.hp = 10;
    const gold = s.players[0].gold;
    tick(s);
    expect(s.phase).toBe('prep');
    expect(s.wave).toBe(1);
    expect(s.players[0].gold).toBeGreaterThan(gold);
    expect(k.hp).toBe(k.maxHp);
  });
  it('castle at 0 hp is a loss; last wave cleared is a win', () => {
    const lost = battle();
    lost.units.find(u => u.type === 'castle')!.hp = 0;
    tick(lost);
    expect(lost.phase).toBe('lost');
    const won = battle();
    won.spawnQueue = []; won.wave = WAVES.length - 1;
    tick(won);
    expect(won.phase).toBe('won');
  });
  it('is deterministic for the same seed and commands', () => {
    const play = () => {
      const s = createGame('meadow', 42);
      const cmds: Command[] = [
        { c: 'buy', troop: 'knight', x: 60, y: 60 }, { c: 'buy', troop: 'archer', x: 36, y: 44 },
        { c: 'ready', ready: true },
      ];
      cmds.forEach(c => applyCommand(s, 0, c));
      applyCommand(s, 1, { c: 'ready', ready: true });
      for (let i = 0; i < 1000; i++) tick(s);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });
  it('survives a full wave with units dying mid-tick without throwing', () => {
    const s = createGame('meadow', 3);
    for (let i = 0; i < 4; i++) applyCommand(s, (i % 2) as 0 | 1, { c: 'buy', troop: 'knight', x: 40, y: 30 + i * 8 });
    s.timer = 0;
    expect(() => { for (let i = 0; i < 3000; i++) tick(s); }).not.toThrow();
    for (const u of s.units) expect(Number.isFinite(u.x + u.y + u.hp)).toBe(true);
    expect(MAPS.meadow.width).toBeGreaterThan(0);
  });
});

describe('role mechanics', () => {
  it('cavalry that has built up a run-up hits far harder (Sturmangriff), wedge more so', () => {
    const s = battle();
    const archer = foe(s, 'raider_archer', 80, 40);
    const horse = mine(s, 'cavalry', 70, 40);
    const base = resolveDamage(horse, archer);
    horse.charge = 20;
    const charged = resolveDamage(horse, archer);
    expect(charged).toBeGreaterThan(base * 2);
    horse.formation = 'wedge';
    expect(resolveDamage(horse, archer)).toBeGreaterThan(charged * 1.2);
    horse.charge = 5; // too little run-up
    expect(resolveDamage(horse, archer)).toBeLessThan(charged);
  });
  it('a holding spear wall blunts a charge; moving spearmen do not', () => {
    const s = battle();
    const horse = foe(s, 'raider_rider', 80, 40);
    horse.charge = 30;
    const wall = mine(s, 'spearman', 75, 40), loose = mine(s, 'spearman', 75, 44);
    wall.order = { kind: 'hold', x: 75, y: 40 };
    expect(resolveDamage(horse, wall)).toBeLessThan(resolveDamage(horse, loose) * 0.4);
  });
  it('a charge is spent by the blow and builds up again only by running', () => {
    const s = battle();
    const horse = mine(s, 'cavalry', 60, 40), victim = foe(s, 'footman', 82, 40);
    victim.order = { kind: 'hold', x: 82, y: 40 };
    run(s, 4);
    expect(victim.hp).toBeLessThan(victim.maxHp);
    expect(horse.charge).toBeLessThan(14);
  });
  it('formations matter: firing line for ranged damage, block for melee defence', () => {
    const s = battle();
    const archer = mine(s, 'archer', 50, 40), knight = mine(s, 'knight', 50, 44), dummy = foe(s, 'ironguard', 60, 40);
    const plain = resolveDamage(archer, dummy);
    archer.formation = 'line';
    expect(resolveDamage(archer, dummy)).toBeCloseTo(plain * 1.15, 5);
    const foeKnight = foe(s, 'footman', 55, 44);
    knight.formation = 'wedge';
    const open = resolveDamage(foeKnight, knight);
    knight.formation = 'block';
    expect(resolveDamage(foeKnight, knight)).toBeCloseTo(open * 0.85, 5);
  });
  it('archers step back while reloading when a melee enemy closes in, but stay near their post', () => {
    const s = battle();
    const archer = mine(s, 'archer', 60, 40), grunt = foe(s, 'footman', 62.5, 40);
    grunt.order = { kind: 'hold', x: 62.5, y: 40 };
    archer.cd = 1;
    const x0 = archer.x;
    run(s, 0.5);
    expect(archer.x).toBeLessThan(x0 - 1);
    run(s, 10);
    expect(Math.hypot(archer.x - archer.postX, archer.y - archer.postY)).toBeLessThan(18);
  });
  it('riders hunt soft targets: cavalry picks an archer over a nearer knight', () => {
    const s = battle();
    const horse = mine(s, 'cavalry', 50, 40);
    const knight = foe(s, 'ironguard', 56, 40), archer = foe(s, 'raider_archer', 68, 40);
    for (const e of [knight, archer]) e.order = { kind: 'hold', x: e.x, y: e.y };
    run(s, 0.1);
    expect(horse.targetId).toBe(archer.id);
    void knight;
  });
});
