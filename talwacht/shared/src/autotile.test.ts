import { describe, expect, it } from 'vitest';
import { wallMask, B } from './autotile';

const grid = (rows: string[]) => {
  const at = (x: number, y: number) => rows[y]?.[x] ?? ' ';
  return {
    wall: (x: number, y: number) => at(x, y) === 'W',
    cliff: (x: number, y: number) => at(x, y) === '#',
  };
};

describe('wallMask', () => {
  it('middle of an east-west line connects east and west only', () => {
    const g = grid(['WWW']);
    expect(wallMask(g.wall, g.cliff, 1, 0)).toBe(B.E | B.W);
  });

  it('an L corner joins north and east without a diagonal', () => {
    const g = grid(['W ', 'WW']);
    expect(wallMask(g.wall, g.cliff, 0, 1)).toBe(B.N | B.E);
  });

  it('a diagonal staircase uses diagonal bits', () => {
    const g = grid(['W  ', ' W ', '  W']);
    expect(wallMask(g.wall, g.cliff, 1, 1)).toBe(B.NW | B.SE);
  });

  it('a diagonal is dropped when an orthogonal neighbour already links the two', () => {
    const g = grid(['WW', ' W']);
    expect(wallMask(g.wall, g.cliff, 0, 0) & B.SE).toBe(0);
  });

  it('a wall end anchors into an adjacent cliff', () => {
    const g = grid(['#WWW']);
    expect(wallMask(g.wall, g.cliff, 1, 0)).toBe(B.W | B.E);
  });

  it('a lone cell with nothing around has mask 0', () => {
    const g = grid(['   ', ' W ', '   ']);
    expect(wallMask(g.wall, g.cliff, 1, 1)).toBe(0);
  });
});
