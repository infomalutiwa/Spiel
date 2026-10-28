import { describe, it, expect } from 'vitest';
import { decodeUnits, encodeUnits, UNIT_TYPE_LIST } from './codec';
import type { UnitSnap } from './types';

describe('unit codec', () => {
  it('round-trips every field within quantisation error', () => {
    const units: UnitSnap[] = UNIT_TYPE_LIST.map((type, i) => ({
      id: 70000 + i, type, side: i % 2 ? 'enemy' : 'player', owner: i % 3 === 0 ? null : ((i % 2) as 0 | 1),
      x: 12.34 + i, y: 200.55 - i, hp: 100 + i, maxHp: 500, facing: (i * 0.7) % 6.28, anim: i % 3, level: 1 + (i % 3), squad: 1000 + i, branch: i % 3, burning: i % 2 === 0, slowed: i % 4 === 1,
    }));
    const back = decodeUnits(encodeUnits(units));
    expect(back.length).toBe(units.length);
    back.forEach((b, i) => {
      const u = units[i];
      expect([b.id, b.type, b.side, b.owner, b.anim, b.level, b.hp, b.maxHp, b.squad, b.branch, b.burning, b.slowed]).toEqual([u.id, u.type, u.side, u.owner, u.anim, u.level, u.hp, u.maxHp, u.squad, u.branch, u.burning, u.slowed]);
      expect(Math.abs(b.x - u.x)).toBeLessThan(0.01);
      expect(Math.abs(b.y - u.y)).toBeLessThan(0.01);
      expect(Math.abs(Math.atan2(Math.sin(b.facing - u.facing), Math.cos(b.facing - u.facing)))).toBeLessThan(0.03);
    });
  });
  it('handles empty lists and keeps 600 units small', () => {
    expect(decodeUnits(encodeUnits([]))).toEqual([]);
    const many = Array.from({ length: 600 }, (_, i) => ({ id: i, type: 'knight', side: 'player', owner: 0, x: 1, y: 1, hp: 1, maxHp: 2, facing: 0, anim: 0, level: 1, squad: 0, branch: 0, burning: false, slowed: false }) as UnitSnap);
    expect(encodeUnits(many).length).toBeLessThan(15000);
  });
});
