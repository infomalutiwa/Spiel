import { DIRS } from './grid';

/** connection bits, same order as grid.DIRS: N, NE, E, SE, S, SW, W, NW (N = towards the enemy) */
export const B = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

/**
 * Which neighbours a rampart cell joins. The renderer builds every wall cell from a centre post plus one
 * half-arm per set bit, so straight runs, corners, T-junctions, crossings, diagonals and cliff anchors all
 * come out right without any per-piece rotation table.
 * - orthogonal: neighbour is rampart
 * - diagonal: neighbour is rampart and neither orthogonal between them is (no double links)
 * - cliff: an open wall end (≤ 1 link) reaches into an adjacent cliff cell
 */
export function wallMask(isWall: (x: number, y: number) => boolean, isCliff: (x: number, y: number) => boolean, cx: number, cy: number): number {
  let m = 0;
  const w = (i: number) => isWall(cx + DIRS[i][0], cy + DIRS[i][1]);
  for (const i of [0, 2, 4, 6]) if (w(i)) m |= 1 << i;
  for (const i of [1, 3, 5, 7]) {
    const a = (i + 7) % 8, b = (i + 1) % 8; // the two orthogonals next to the diagonal
    if (w(i) && !(m & (1 << a)) && !(m & (1 << b)) && !w(a) && !w(b)) m |= 1 << i;
  }
  let links = 0;
  for (let i = 0; i < 8; i++) if (m & (1 << i)) links++;
  if (links <= 1) {
    for (const i of [6, 2, 0, 4]) {
      if (links > 1) break;
      if (!(m & (1 << i)) && isCliff(cx + DIRS[i][0], cy + DIRS[i][1])) { m |= 1 << i; links++; }
    }
  }
  return m;
}
