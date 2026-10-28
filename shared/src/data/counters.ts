import type { ArmorKind, DamageKind } from '../types';

/** damage multiplier by damage kind against armor kind */
export const DAMAGE_VS_ARMOR: Record<DamageKind, Record<ArmorKind, number>> = {
  slash:  { light: 1.2, heavy: 1.0, mounted: 1.0, siege: 1.1, structure: 0.5 },
  pierce: { light: 1.3, heavy: 0.6, mounted: 1.0, siege: 0.8, structure: 0.3 },
  spear:  { light: 1.0, heavy: 0.8, mounted: 1.9, siege: 0.8, structure: 0.3 },
  charge: { light: 1.5, heavy: 0.8, mounted: 1.0, siege: 1.2, structure: 0.4 },
  bolt:   { light: 1.1, heavy: 1.1, mounted: 1.1, siege: 0.7, structure: 0.3 },
  magic:  { light: 1.0, heavy: 1.3, mounted: 1.0, siege: 1.0, structure: 0.6 },
  siege:  { light: 0.6, heavy: 0.9, mounted: 0.6, siege: 1.5, structure: 3.0 },
  /** catapult stones: devastating against walls, rams and tight groups (the blast does the rest) */
  boulder: { light: 1.0, heavy: 1.15, mounted: 1.0, siege: 1.7, structure: 2.5 },
};
