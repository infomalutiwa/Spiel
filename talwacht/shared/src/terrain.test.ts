import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import { buildTerrain, K } from './terrain';
import { CELL, cellOf, idx, neighbours8 } from './grid';

describe('terrain', () => {
  for (const map of Object.values(MAPS)) {
    describe(map.id, () => {
      const t = buildTerrain(map);
      const keep = cellOf(map.keep.x, map.keep.y);

      it('keep cell is buildable', () => {
        expect(t.buildable(idx(t, keep.cx, keep.cy))).toBe(true);
      });

      it('every lane starts on open ground', () => {
        for (const l of map.lanes) {
          const [x, y] = l.pts[0];
          expect(t.kind[t.cellAt(x, y + 2)]).not.toBe(K.cliff);
        }
      });

      it('ground well outside the valley is a high cliff', () => {
        let x = 2;
        while (x < map.w / 2 && t.outside(x + 4, 300) > 40) x += 4;
        expect(t.outside(x, 300)).toBeGreaterThan(40);
        expect(t.kind[t.cellAt(x, 300)]).toBe(K.cliff);
        expect(t.height(x, 300)).toBeGreaterThan(20);
      });

      it('each lane start reaches the keep over passable cells', () => {
        for (const l of map.lanes) {
          const [x, y] = l.pts[0];
          const start = t.cellAt(x, y + 2), goal = idx(t, keep.cx, keep.cy);
          const seen = new Uint8Array(t.cw * t.ch); const q = [start]; seen[start] = 1;
          while (q.length) {
            const c = q.pop()!;
            for (const n of neighbours8(t, c)) if (!seen[n] && t.passable(n)) { seen[n] = 1; q.push(n); }
          }
          expect(seen[goal]).toBe(1);
        }
      });

      it('is deterministic', () => {
        const t2 = buildTerrain(map);
        expect(Buffer.from(t2.kind).equals(Buffer.from(t.kind))).toBe(true);
        expect(t2.height(123.4, 222.2)).toBe(t.height(123.4, 222.2));
      });
    });
  }

  it('cells are 4 m', () => { expect(CELL).toBe(4); });
});
