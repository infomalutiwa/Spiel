import { describe, it, expect } from 'vitest';
import type { Snapshot } from '@burgwacht/shared';
import { interpolation } from './connection';

const snap = (tick: number) => ({ tick } as unknown as Snapshot);

describe('interpolation', () => {
  it('returns the midpoint between two snapshots', () => {
    const r = interpolation([{ at: 1000, snap: snap(1) }, { at: 1100, snap: snap(2) }], 1050)!;
    expect(r.a.tick).toBe(1); expect(r.b.tick).toBe(2); expect(r.alpha).toBeCloseTo(0.5);
  });
  it('clamps when render time is ahead of the newest snapshot', () => {
    const r = interpolation([{ at: 1000, snap: snap(1) }, { at: 1100, snap: snap(2) }], 5000)!;
    expect(r.alpha).toBe(1);
  });
  it('handles empty and single-snapshot buffers', () => {
    expect(interpolation([], 0)).toBeUndefined();
    expect(interpolation([{ at: 1, snap: snap(1) }], 5)!.alpha).toBe(0);
  });
});
