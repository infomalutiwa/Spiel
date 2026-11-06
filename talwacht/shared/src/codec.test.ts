import { describe, expect, it } from 'vitest';
import { decodeUnits, encodeUnits, structDeltas } from './codec';
import type { UnitSnap } from './types';
import { rng } from './geom';

describe('unit codec', () => {
  it('round-trips 300 random units within 2 cm', () => {
    const r = rng(5);
    const units: UnitSnap[] = Array.from({ length: 300 }, (_, i) => ({
      id: 1000 + i, type: i % 2 ? 'archer' : 'e_shield', side: i % 2 ? 'p' : 'e', owner: i % 2 ? (i % 4 === 1 ? 0 : 1) : null,
      x: r() * 520, y: r() * 600, z: r() * 6, hp: Math.round(r() * 160), maxHp: 160, facing: r() * 6.28,
      anim: (i % 4) as 0 | 1 | 2 | 3, squad: i % 50, burning: r() < 0.3, slowed: r() < 0.3, stunned: r() < 0.2, shielded: r() < 0.5,
    }));
    const back = decodeUnits(encodeUnits(units));
    expect(back.length).toBe(300);
    back.forEach((u, i) => {
      const a = units[i];
      expect(u.id).toBe(a.id); expect(u.type).toBe(a.type); expect(u.side).toBe(a.side); expect(u.owner).toBe(a.owner);
      expect(Math.abs(u.x - a.x)).toBeLessThan(0.02); expect(Math.abs(u.y - a.y)).toBeLessThan(0.02); expect(Math.abs(u.z - a.z)).toBeLessThan(0.06);
      expect(u.hp).toBe(a.hp); expect(u.anim).toBe(a.anim); expect(u.squad).toBe(a.squad);
      expect([u.burning, u.slowed, u.stunned, u.shielded]).toEqual([a.burning, a.slowed, a.stunned, a.shielded]);
    });
  });
});

describe('structure deltas', () => {
  it('only reports structures whose hp or state changed', () => {
    const prev = new Map<number, string>();
    const s = [{ id: 1, hp: 100, state: 0, build: 0, burning: 0, pitch: 0 }, { id: 2, hp: 50, state: 0, build: 0, burning: 0, pitch: 0 }];
    expect(structDeltas(s as never, prev).length).toBe(2);
    s[1].hp = 40;
    const d = structDeltas(s as never, prev);
    expect(d).toEqual([[2, 40, 0, 0, 0]]);
  });
});
