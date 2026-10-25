import type { GameState, Unit } from '@burgwacht/shared';

/** uniform hash grid so neighbour queries stay O(units nearby) with hundreds of units */
export class Grid {
  private cells = new Map<number, Unit[]>();
  constructor(readonly cell = 8) {}

  private key(cx: number, cy: number) { return cx * 4096 + cy; }

  rebuild(units: Unit[]) {
    this.cells.clear();
    for (const u of units) {
      if (u.hp <= 0) continue;
      const k = this.key(Math.floor(u.x / this.cell), Math.floor(u.y / this.cell));
      const c = this.cells.get(k);
      if (c) c.push(u); else this.cells.set(k, [u]);
    }
  }

  /** visit every unit whose cell touches the circle (callers still do the exact distance check) */
  near(x: number, y: number, r: number, fn: (u: Unit) => void) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (const u of list) fn(u);
      }
  }
}

const grids = new WeakMap<GameState, Grid>();
export function gridOf(s: GameState): Grid {
  let g = grids.get(s);
  if (!g) { g = new Grid(); grids.set(s, g); g.rebuild(s.units); }
  return g;
}
export const rebuildGrid = (s: GameState) => gridOf(s).rebuild(s.units);
