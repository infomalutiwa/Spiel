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
    const lanes = MAPS.meadow.lanes.length;
    for (const w of WAVES) for (const g of w.groups) {
      expect(ENEMIES[g.type]).toBeDefined();
      expect(g.lane).toBeLessThan(lanes);
    }
  });
});
