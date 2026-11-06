import { describe, expect, it } from 'vitest';
import { cellOf, MAPS, STRUCTURES, type GameState, type Unit } from '@talwacht/shared';
import { createGame, newStructure } from './state';
import { towerTick } from './towers';
import { trapTick } from './traps';
import { combatTick, shellTick, fireShell } from './combat';
import { makeUnit, rebuildHash } from './units';
import { applyCommand } from './commands';
import './towers';
import './traps';

const map = MAPS.gruental;
const c0 = cellOf(map.keep.x, map.keep.y - 120);
const fresh = () => { const s = createGame('gruental', 'normal', 1, [], ['ballista']); s.res.stone = 1000; return s; };
const tower = (s: GameState, kind: Parameters<typeof newStructure>[1]) => newStructure(s, kind, c0.cx, c0.cy, 0, true);
const enemy = (s: GameState, type: Parameters<typeof makeUnit>[1], x: number, y: number) => makeUnit(s, type, 'e', null, x, y);
function run(s: GameState, sec: number, onTick?: () => void) {
  for (let i = 0; i < sec * 20; i++) { s.time += 0.05; rebuildHash(s); towerTick(s, 0.05); trapTick(s, 0.05); shellTick(s, 0.05); combatTick(s, 0.05); onTick?.(); }
}
const tx = (c0.cx + 0.5) * 4, ty = (c0.cy + 0.5) * 4;

describe('tower roles', () => {
  it('a level-1 bow tower kills a raider in range within 8 s', () => {
    const s = fresh(); tower(s, 'tower_bow');
    const r = enemy(s, 'e_raider', tx, ty - 25);
    run(s, 8);
    expect(r.hp).toBeLessThanOrEqual(0);
  });

  it('the crossbow tower shoots slower than the bow tower but hits at least 3× harder', () => {
    const a = fresh(); tower(a, 'tower_xbow');
    const b = fresh(); tower(b, 'tower_bow');
    for (const s of [a, b]) { const e = enemy(s, 'e_soldier', tx, ty - 25); e.hp = e.maxHp = 1e6; }
    const sa = new Set<number>(), sb = new Set<number>();
    let da = 0, db = 0;
    run(a, 22, () => { for (const sh of a.shells) { sa.add(sh.id); da = sh.dmg; } });
    run(b, 22, () => { for (const sh of b.shells) { sb.add(sh.id); db = sh.dmg; } });
    const na = sa.size, nb = sb.size;
    expect(na / 2).toBeLessThanOrEqual(22 / 2.2 + 1); // per shooter
    expect(nb / 2).toBeGreaterThan(na / 2);
    expect(da).toBeGreaterThanOrEqual(3 * db);
  });

  it('a ballista bolt goes through at most 6 enemies standing in a line', () => {
    const s = fresh(); tower(s, 'ballista');
    const line: Unit[] = [];
    for (let i = 0; i < 10; i++) { const e = enemy(s, 'e_soldier', tx, ty - 12 - i * 2.5); e.hp = e.maxHp = 1e5; line.push(e); }
    run(s, 2.5);
    expect(line.filter(e => e.hp < 1e5).length).toBe(6);
  });

  it('one catapult stone hurts a packed group of 16 and breaks their shield formation for 6 s', () => {
    const s = fresh(); tower(s, 'tower_catapult');
    const f = { id: 99, members: [] as number[], ram: 0, broken: 0, size0: 16, facing: Math.PI / 2 };
    s.formations.push(f);
    const group: Unit[] = [];
    for (let i = 0; i < 16; i++) { const e = enemy(s, 'e_shield', tx - 3 + (i % 4) * 1.8, ty - 55 - Math.floor(i / 4) * 1.8); e.hp = e.maxHp = 1e4; e.formation = 99; f.members.push(e.id); group.push(e); }
    run(s, 5);
    expect(group.filter(e => e.hp < 1e4).length).toBeGreaterThanOrEqual(10);
    expect(f.broken).toBeGreaterThanOrEqual(5);
  });

  it('a catapult without stone stays dry', () => {
    const s = fresh(); s.res.stone = 0; const t = tower(s, 'tower_catapult');
    enemy(s, 'e_raider', tx, ty - 55);
    run(s, 3);
    expect(s.shells.length).toBe(0);
    expect(t.dry).toBe(1);
  });

  it('a pitch nose on a gate pours burning pitch on enemies in front', () => {
    const s = fresh(); const g = tower(s, 'gate'); g.pitch = 1;
    const es = [0, 1, 2].map(i => enemy(s, 'e_shield', tx - 2 + i * 2, ty - 5));
    run(s, 2);
    expect(es.every(e => e.hp < e.maxHp)).toBe(true);
    expect(es.some(e => e.burn > 0)).toBe(true);
  });
});

describe('traps', () => {
  it('a pitfall swallows exactly three foot soldiers and is then spent', () => {
    const s = fresh(); const t = tower(s, 'pitfall');
    const es = Array.from({ length: 5 }, () => enemy(s, 'e_raider', tx, ty));
    run(s, 0.2);
    expect(es.filter(e => e.hp <= 0).length).toBe(3);
    expect(t.uses).toBe(0);
  });

  it('stakes stop riders but let foot soldiers through', () => {
    const s = fresh(); tower(s, 'stakes');
    const rider = enemy(s, 'e_rider', tx, ty), foot = enemy(s, 'e_raider', tx + 0.5, ty);
    run(s, 0.2);
    expect(rider.hp).toBeLessThan(rider.maxHp); expect(rider.stun).toBeGreaterThan(0);
    expect(foot.hp).toBe(foot.maxHp);
  });

  it('a fire arrow landing next to a powder keg blows it up', () => {
    const s = fresh(); const keg = tower(s, 'powder');
    const e = enemy(s, 'e_soldier', tx + 4, ty - 4); e.hp = e.maxHp = 1000;
    fireShell(s, 'fire', { x: tx, y: ty + 30, z: 5 }, { x: tx + 1, y: ty, z: 0 }, { dmg: 5, dk: 'fire', side: 'p', burn: [4, 3] });
    run(s, 2);
    expect(s.structs.includes(keg)).toBe(false);
    expect(e.hp).toBeLessThan(1000 - 50);
  });

  it('a pitch ditch can be lit by hand and burns those standing in it', () => {
    const s = fresh(); const d = tower(s, 'pitch_ditch');
    const e = enemy(s, 'e_raider', tx, ty); e.hp = e.maxHp = 1000; e.stun = 99;
    expect(applyCommand(s, 0, { c: 'trigger', id: d.id })).toEqual({ ok: true });
    run(s, 3);
    expect(e.hp).toBeLessThan(1000 - 15);
    expect(STRUCTURES.pitch_ditch.trap!.uses).toBe(1);
  });
});
