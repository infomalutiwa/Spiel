import { describe, it, expect } from 'vitest';
import { TROOPS, ENEMIES, DAMAGE_VS_ARMOR, WAVES, MAPS } from '../index';

describe('data tables', () => {
  it('has exactly the 8 spec troops', () => {
    expect(Object.keys(TROOPS).sort()).toEqual(
      ['archer', 'catapult', 'cavalry', 'crossbowman', 'healer', 'knight', 'mage', 'spearman']);
  });
  it('has positive stats everywhere (healer/shaman damage may be 0)', () => {
    for (const d of [...Object.values(TROOPS), ...Object.values(ENEMIES)]) {
      expect(d.hp).toBeGreaterThan(0);
      expect(d.speed).toBeGreaterThan(0);
      expect(d.cooldown).toBeGreaterThan(0);
      expect(d.radius).toBeGreaterThan(0);
    }
  });
  it('encodes the counters', () => {
    expect(DAMAGE_VS_ARMOR[TROOPS.spearman.damageKind].mounted).toBeGreaterThan(1);
    expect(DAMAGE_VS_ARMOR[TROOPS.cavalry.damageKind].light).toBeGreaterThan(1);
    expect(DAMAGE_VS_ARMOR.bolt.heavy).toBeGreaterThanOrEqual(DAMAGE_VS_ARMOR.pierce.heavy);
    expect(DAMAGE_VS_ARMOR.siege.structure).toBeGreaterThan(1);
  });
  it('covers every armor kind in every row', () => {
    for (const row of Object.values(DAMAGE_VS_ARMOR))
      expect(Object.keys(row).sort()).toEqual(['heavy', 'light', 'mounted', 'siege', 'structure']);
  });
  it('waves reference existing enemies and lanes', () => {
    for (const w of WAVES) for (const g of w.groups) {
      expect(ENEMIES[g.type]).toBeDefined();
      expect(g.lane).toBeGreaterThanOrEqual(0);
      expect(g.count).toBeGreaterThan(0);
    }
  });
  it('maps are self-consistent: everything inside bounds, spawns far from the build zone', () => {
    expect(Object.keys(MAPS).length).toBeGreaterThanOrEqual(3);
    for (const m of Object.values(MAPS)) {
      expect(m.spawns.length).toBeGreaterThanOrEqual(3);
      const inside = (p: { x: number; y: number }) => p.x > 0 && p.x < m.width && p.y > 0 && p.y < m.depth;
      expect(inside(m.castle)).toBe(true);
      m.spawns.forEach(sp => {
        expect(inside(sp)).toBe(true);
        expect(Math.hypot(sp.x - m.castle.x, sp.y - m.castle.y)).toBeGreaterThan(80);
        const z = m.placeZone;
        const dx = Math.max(z.x0 - sp.x, 0, sp.x - z.x1), dy = Math.max(z.y0 - sp.y, 0, sp.y - z.y1);
        expect(Math.hypot(dx, dy)).toBeGreaterThan(40);
      });
      const z = m.placeZone;
      expect(z.x0).toBeGreaterThanOrEqual(0); expect(z.x1).toBeLessThanOrEqual(m.width);
      expect(z.y0).toBeGreaterThanOrEqual(0); expect(z.y1).toBeLessThanOrEqual(m.depth);
    }
  });
});
