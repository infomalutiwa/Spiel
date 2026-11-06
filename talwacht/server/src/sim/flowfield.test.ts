import { describe, expect, it } from 'vitest';
import { cellOf, K, MAPS, type GameState } from '@talwacht/shared';
import { createGame, newStructure, structAtCell, terrainOf } from './state';
import { flowOf, followPath } from './flowfield';
import { removeStructure } from './build';
import { spawnEnemy } from './movement';
import { tickMovement } from './movement';

const map = MAPS.gruental;
const fresh = () => createGame('gruental', 'normal', 1, [], []);
/** a complete rampart across the valley at `y`, optionally with a gate in the middle lane */
function sealRow(s: GameState, y: number, gateLevel = 0) {
  const t = terrainOf(s), cy = cellOf(0, y).cy, mid = cellOf(map.lanes[0].pts[0][0], y).cx;
  const gx = cellOf(map.keep.x, y).cx;
  for (let cx = 0; cx < t.cw; cx++) {
    if (t.kind[cy * t.cw + cx] === K.cliff) continue;
    const st = newStructure(s, gateLevel && cx === gx ? 'gate' : 'wall', cx, cy, 0, true);
    if (st.kind === 'gate') { st.level = gateLevel; st.maxHp = st.hp = [800, 1600, 2600][gateLevel - 1]; }
  }
  return { cy, mid, gx };
}
const laneStart = (l: number) => cellOf(map.lanes[l].pts[0][0], map.lanes[l].pts[0][1] + 2);

describe('flowfield', () => {
  it('in an open valley every lane leads to the keep', () => {
    const s = fresh();
    for (const l of [0, 1, 2]) {
      const path = followPath(s, laneStart(l).cx, laneStart(l).cy);
      const last = path[path.length - 1];
      expect(structAtCell(s, last[0], last[1])?.kind).toBe('keep');
    }
  });

  it('a sealed valley still has a finite route at the lane start', () => {
    const s = fresh();
    sealRow(s, 300);
    const t = terrainOf(s), c = laneStart(0);
    expect(Number.isFinite(flowOf(s).dist[c.cy * t.cw + c.cx])).toBe(true);
  });

  it('enemies prefer breaking a weak palisade over a strong gate', () => {
    const s = fresh();
    const { cy } = sealRow(s, 300, 2);
    const path = followPath(s, laneStart(0).cx, laneStart(0).cy);
    const hit = path.find(([x, y]) => y === cy)!;
    expect(structAtCell(s, hit[0], hit[1])?.kind).toBe('wall');
  });

  it('a breach is used once a wall cell falls', () => {
    const s = fresh();
    const { cy } = sealRow(s, 300);
    const c = laneStart(2), t = terrainOf(s);
    const before = flowOf(s).dist[c.cy * t.cw + c.cx];
    const crossing = followPath(s, c.cx, c.cy).find(([, y]) => y === cy)!;
    const victim = structAtCell(s, crossing[0], cy)!;
    removeStructure(s, victim);
    const after = flowOf(s).dist[c.cy * t.cw + c.cx];
    expect(after).toBeLessThan(before);
    const path = followPath(s, c.cx, c.cy);
    expect(path.some(([x, y]) => x === victim.cx && y === victim.cy)).toBe(true);
  });

  it('a raider walking for 40 s gets much closer to the keep', () => {
    const s = fresh();
    const [x, y] = map.lanes[0].pts[0];
    const u = spawnEnemy(s, 'e_raider', x, y + 2, 0, 0);
    const d0 = Math.hypot(u.x - map.keep.x, u.y - map.keep.y);
    for (let i = 0; i < 20 * 40; i++) tickMovement(s, 0.05);
    expect(Math.hypot(u.x - map.keep.x, u.y - map.keep.y)).toBeLessThan(d0 - 150);
  });
});
