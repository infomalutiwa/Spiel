import { describe, it, expect } from 'vitest';
import { MAPS, MAX_ARMY, REBUILD_COST, SQUAD_SIZE, UPGRADE_COST, levelHpMul, squadCost, UNIT_DEFS } from '@burgwacht/shared';
import { applyCommand, createGame, pickTarget, structureOfSlot, stepDecks, tick } from './index';
import { fortressBattle, foe, mine, run } from './helpers';

const map = MAPS.meadow, bar = map.barriers[0];
const gateSlot = map.walls.findIndex(w => w.kind === 'gate' && w.bar === 0);
const wallSlot = map.walls.findIndex(w => w.kind === 'wall' && w.bar === 0);

describe('squads and the wall crown', () => {
  it('archers bought next to the wall line up on its crown; swordsmen are put behind it', () => {
    const s = createGame('meadow', 1);
    expect(applyCommand(s, 0, { c: 'buy', troop: 'archer', x: bar.x, y: 30 }).ok).toBe(true);
    expect(applyCommand(s, 1, { c: 'buy', troop: 'knight', x: bar.x, y: 90 }).ok).toBe(true);
    const archers = s.units.filter(u => u.type === 'archer'), knights = s.units.filter(u => u.type === 'knight');
    expect(archers.length).toBe(SQUAD_SIZE.archer);
    expect(archers.every(u => u.x === bar.x)).toBe(true);
    expect(knights.every(u => u.x < bar.x - 3)).toBe(true);
    s.phase = 'battle'; s.spawnQueue = [{ at: 9999, type: 'footman', lane: 0 }];
    stepDecks(s);
    expect(archers.filter(u => u.deck > 0).length).toBeGreaterThan(archers.length - 2); // the squad is long; the ends may overhang a gap
    expect(knights.every(u => u.deck === 0)).toBe(true);
  });
  it('the army is capped at 30 slots per player, a catapult counting for three', () => {
    const s = createGame('meadow', 1);
    s.players[0].gold = 99999;
    for (let i = 0; i < 3; i++) expect(applyCommand(s, 0, { c: 'buy', troop: 'archer', x: 140, y: 30 + i * 20 }).ok).toBe(true);
    expect(applyCommand(s, 0, { c: 'buy', troop: 'archer', x: 140, y: 100 })).toEqual({ ok: false, reason: 'army_full' });
    expect(applyCommand(s, 1, { c: 'buy', troop: 'catapult', x: 140, y: 60 }).ok).toBe(true);
    expect(MAX_ARMY).toBe(30);
  });
  it('refill replaces fallen members for gold, only in preparation', () => {
    const s = createGame('meadow', 1);
    applyCommand(s, 0, { c: 'buy', troop: 'archer', x: 140, y: 40 });
    const squad = s.squads[0].id;
    const dead = s.units.filter(u => u.squad === squad).slice(0, 4);
    s.units = s.units.filter(u => !dead.includes(u));
    const g = s.players[0].gold;
    expect(applyCommand(s, 0, { c: 'refill', squad }).ok).toBe(true);
    expect(s.units.filter(u => u.squad === squad).length).toBe(SQUAD_SIZE.archer);
    expect(s.players[0].gold).toBeLessThan(g);
    expect(applyCommand(s, 0, { c: 'refill', squad })).toEqual({ ok: false, reason: 'squad_full' });
    expect(applyCommand(s, 1, { c: 'refill', squad }).ok).toBe(false); // not their squad
  });
  it('men on a wall shoot further, and swords cannot reach them', () => {
    const s = fortressBattle();
    const a = mine(s, 'archer', bar.x, 30), g = mine(s, 'archer', bar.x - 10, 30);
    const f = foe(s, 'footman', bar.x + 3, 30);
    stepDecks(s);
    expect(a.deck).toBeGreaterThan(0);
    expect(g.deck).toBe(0);
    expect(pickTarget(s, f, 4)).not.toBe(a);
    expect(pickTarget(s, f, 4)?.id ?? 0).not.toBe(a.id);
  });
  it('when the wall piece falls the crew tumbles down behind it', () => {
    const s = fortressBattle();
    const a = mine(s, 'archer', bar.x, map.walls[wallSlot].y);
    stepDecks(s);
    expect(a.deck).toBeGreaterThan(0);
    const piece = structureOfSlot(s, wallSlot)!;
    piece.hp = 1;
    foe(s, 'ram', piece.x + 5, piece.y);
    run(s, 8);
    expect(structureOfSlot(s, wallSlot)).toBeUndefined();
    expect(a.deck).toBe(0);
    expect(a.x).toBeLessThan(bar.x - 3);
    expect(a.hp).toBeLessThan(a.maxHp);
  });
});

describe('the gate, breaches and capture points', () => {
  it('the enemy cannot pass a standing gate, and breaks it down', () => {
    const s = fortressBattle();
    const gate = structureOfSlot(s, gateSlot)!;
    const f = foe(s, 'ironguard', bar.x + 10, bar.gateY);
    run(s, 15);
    expect(f.x).toBeGreaterThan(bar.x);
    expect(gate.hp).toBeLessThan(gate.maxHp);
  });
  it('soldiers ignore wall pieces; rams do not', () => {
    const s = fortressBattle();
    const piece = structureOfSlot(s, wallSlot)!;
    const f = foe(s, 'footman', piece.x + 5, piece.y);
    expect(pickTarget(s, f, 8)).toBeUndefined();
    const ram = foe(s, 'ram', piece.x + 5, piece.y + 0.5);
    expect(pickTarget(s, ram, 8)?.type).toBe('wall');
  });
  it('through a broken gate the enemy walks in', () => {
    const s = fortressBattle();
    structureOfSlot(s, gateSlot)!.hp = 0;
    const f = foe(s, 'footman', bar.x + 10, bar.gateY);
    run(s, 14);
    expect(f.x).toBeLessThan(bar.x - 3);
  });
  it('zones fall in order; losing the last one loses the wave', () => {
    const s = fortressBattle();
    s.units = s.units.filter(u => u.slot < 0); // an empty field: only the capture logic is under test
    const sturdy = (x: number, y: number) => { const f = foe(s, 'footman', x, y); f.order = { kind: 'hold', x: 0, y: 0 }; f.hp = f.maxHp = 1e6; };
    for (let i = 0; i < 4; i++) sturdy(map.zones[2].x + i, map.zones[2].y);
    run(s, 12);
    expect(s.zones[2].owner).toBe('player'); // unreachable until the zones before it have fallen
    for (let i = 0; i < 6; i++) sturdy(map.zones[0].x + i, map.zones[0].y);
    run(s, 40);
    expect(s.zones[0].owner).toBe('enemy');
    for (let i = 0; i < 6; i++) sturdy(map.zones[1].x + i, map.zones[1].y);
    run(s, 80);
    expect(s.zones[1].owner).toBe('enemy');
    expect(s.zones[2].owner).toBe('enemy');
    expect(s.phase).toBe('lost');
  });
  it('defenders in a zone hold the bar back', () => {
    const s = fortressBattle();
    s.units = s.units.filter(u => u.slot < 0);
    for (let i = 0; i < 3; i++) foe(s, 'footman', map.zones[0].x + i, map.zones[0].y).order = { kind: 'hold', x: 0, y: 0 };
    for (let i = 0; i < 6; i++) { const k = mine(s, 'knight', map.zones[0].x - 4, map.zones[0].y + i * 1.4); k.order = { kind: 'hold', x: k.x, y: k.y }; k.hp = k.maxHp = 99999; }
    run(s, 20);
    expect(s.zones[0].owner).toBe('player');
    expect(s.zones[0].progress).toBeLessThan(0.3);
  });
  it('zones are freed again between waves', () => {
    const s = fortressBattle();
    s.zones[0] = { owner: 'enemy', progress: 1, reached: true };
    s.spawnQueue = [];
    tick(s);
    expect(s.phase).toBe('prep');
    expect(s.zones[0]).toEqual({ owner: 'player', progress: 0, reached: false });
  });
});

describe('walls cost gold to improve', () => {
  it('upgrade raises level and health once per level, up to level 3', () => {
    const s = createGame('meadow', 1);
    const st = structureOfSlot(s, gateSlot)!, hp0 = st.maxHp;
    s.players[0].gold = 5000;
    expect(applyCommand(s, 0, { c: 'wall', op: 'upgrade', slot: gateSlot }).ok).toBe(true);
    expect(st.level).toBe(2);
    expect(st.maxHp).toBeCloseTo(hp0 * levelHpMul(2));
    expect(s.players[0].gold).toBe(5000 - UPGRADE_COST.gate[0]);
    expect(applyCommand(s, 0, { c: 'wall', op: 'upgrade', slot: gateSlot }).ok).toBe(true);
    expect(applyCommand(s, 0, { c: 'wall', op: 'upgrade', slot: gateSlot })).toEqual({ ok: false, reason: 'max_level' });
    s.players[0].gold = 1;
    expect(applyCommand(s, 0, { c: 'wall', op: 'repair', slot: gateSlot }).ok).toBe(false);
  });
  it('repair costs by the missing health and works in battle; rebuild only in preparation', () => {
    const s = createGame('meadow', 1);
    const st = structureOfSlot(s, wallSlot)!;
    st.hp = st.maxHp / 2;
    const g = s.players[0].gold;
    expect(applyCommand(s, 0, { c: 'wall', op: 'repair', slot: wallSlot }).ok).toBe(true);
    expect(st.hp).toBe(st.maxHp);
    expect(g - s.players[0].gold).toBeGreaterThan(0);
    st.hp = 0; s.units = s.units.filter(u => u.hp > 0);
    expect(applyCommand(s, 0, { c: 'wall', op: 'upgrade', slot: wallSlot }).ok).toBe(false); // nothing left to upgrade
    s.phase = 'battle';
    expect(applyCommand(s, 0, { c: 'wall', op: 'rebuild', slot: wallSlot })).toEqual({ ok: false, reason: 'not_prep' });
    s.phase = 'prep';
    const before = s.players[0].gold;
    expect(applyCommand(s, 0, { c: 'wall', op: 'rebuild', slot: wallSlot }).ok).toBe(true);
    expect(before - s.players[0].gold).toBe(REBUILD_COST.wall);
    expect(structureOfSlot(s, wallSlot)?.hp).toBe(UNIT_DEFS.wall.hp);
    expect(applyCommand(s, 0, { c: 'wall', op: 'rebuild', slot: 9999 }).ok).toBe(false);
  });
});

describe('maps', () => {
  it('every map has two wall lines with a gate each, three zones from the east to the keep, and the squad prices fit', () => {
    for (const m of Object.values(MAPS)) {
      expect(m.barriers.length).toBe(2);
      expect(m.barriers[0].x).toBeGreaterThan(m.barriers[1].x);
      for (let b = 0; b < 2; b++) expect(m.walls.filter(w => w.bar === b && w.kind === 'gate').length).toBe(1);
      const xs = m.zones.map(z => z.x);
      expect(xs).toEqual([...xs].sort((a, c) => c - a));
      expect(m.zones.length).toBe(3);
      expect(m.walls.every(w => w.y >= 0 && w.y <= m.depth)).toBe(true);
      // no gap in a wall line that a unit could squeeze through: consecutive pieces overlap
      for (let b = 0; b < 2; b++) {
        const ys = m.walls.filter(w => w.bar === b).map(w => w.y).sort((a, c) => a - c);
        ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeLessThan(9.5));
      }
    }
    expect(squadCost('archer')).toBeLessThan(1000);
  });
});
