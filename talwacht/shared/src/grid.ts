/** 4-m build grid shared by rules, path finding and rendering */
export const CELL = 4;

export interface GridLike { cw: number; ch: number }

export const cellOf = (x: number, y: number) => ({ cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) });
export const centre = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });
export const idx = (g: GridLike, cx: number, cy: number) => cy * g.cw + cx;
export const inside = (g: GridLike, cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < g.cw && cy < g.ch;
export const cx = (g: GridLike, i: number) => i % g.cw;
export const cy = (g: GridLike, i: number) => Math.floor(i / g.cw);

/** N, NE, E, SE, S, SW, W, NW (N = towards the enemy, -y) */
export const DIRS: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

export function neighbours8(g: GridLike, i: number): number[] {
  const x = i % g.cw, y = Math.floor(i / g.cw), out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < g.cw && ny < g.ch) out.push(ny * g.cw + nx);
  }
  return out;
}

/** cells of a straight line between two cells (Bresenham, includes diagonals) */
export function lineCells(ax: number, ay: number, bx: number, by: number): [number, number][] {
  const out: [number, number][] = [];
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === bx && y === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}
