import { CELL, cellOf, MAPS, STRUCTURES, type GameState, type StructId } from '@talwacht/shared';
import { newStructure, structById, terrainOf } from './state';
import { siteProblem } from './build';
import { setOrder, spawnSquad } from './squads';

/** level a freshly placed starter structure up without paying (hp scales with the level) */
function atLevel(s: GameState, id: number, level: number) {
  const st = structById(s, id)!, d = STRUCTURES[st.kind];
  st.level = Math.min(level, d.hp.length);
  st.maxHp = st.hp = d.hp[st.level - 1];
}

/** nearest free site for `kind` around (cx, cy), searching in growing rings */
function siteNear(s: GameState, kind: StructId, cx: number, cy: number, maxR = 14, minY = -1): [number, number] | null {
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || cy + dy < minY) continue;
    if (!siteProblem(s, kind, cx + dx, cy + dy)) return [cx + dx, cy + dy];
  }
  return null;
}
function place(s: GameState, kind: StructId, cx: number, cy: number, level = 1, maxR = 14, minY = -1) {
  const at = siteNear(s, kind, cx, cy, maxR, minY);
  if (!at) return null;
  const st = newStructure(s, kind, at[0], at[1], 0, true);
  if (level > 1) atLevel(s, st.id, level);
  return st;
}

/**
 * A small working settlement at round start, so the first minutes are about expanding, not bootstrapping:
 * a stone wall across the main road with a gate and two bow towers, barracks and archery range, houses, a farm,
 * a woodcutter and a well, plus one archer squad on the wall and one spear squad behind the gate per player.
 */
export function starterBase(s: GameState) {
  const m = MAPS[s.mapId], t = terrainOf(s), k = cellOf(m.keep.x, m.keep.y);
  // the wall row ~64 m in front of the keep, centred where the main road crosses it
  const wy = k.cy - 16, rowY = (wy + 0.5) * CELL;
  const road = m.lanes[0].pts.reduce((a, b) => (Math.abs(b[1] - rowY) < Math.abs(a[1] - rowY) ? b : a));
  const gx = Math.floor(road[0] / CELL);
  const wallIds: number[] = [];
  for (let x = gx - 6; x <= gx + 6; x++) {
    if (x === gx) continue;
    const i = wy * t.cw + x;
    if (x < 0 || x >= t.cw || !t.buildable(i) || siteProblem(s, 'wall', x, wy)) continue;
    wallIds.push(newStructure(s, 'wall', x, wy, 0, true).id);
  }
  for (const id of wallIds) atLevel(s, id, 2);
  if (!siteProblem(s, 'gate', gx, wy)) atLevel(s, newStructure(s, 'gate', gx, wy, 0, true).id, 2);
  for (const x of [gx - 7, gx + 7]) if (!siteProblem(s, 'tower_bow', x, wy)) newStructure(s, 'tower_bow', x, wy, 0, true);

  // the town between wall and keep
  place(s, 'barracks', k.cx - 7, k.cy - 9);
  place(s, 'range', k.cx + 5, k.cy - 9);
  place(s, 'house', k.cx - 7, k.cy - 1);
  place(s, 'house', k.cx + 5, k.cy - 1);
  place(s, 'well', k.cx + 3, k.cy - 5);
  // farm on the nearest meadow, woodcutter at the nearest wood (both need their ground; skipped if there is none nearby)
  place(s, 'farm', k.cx - 11, k.cy - 4, 1, 20);
  place(s, 'farm', k.cx - 11, k.cy - 9, 1, 20);
  // woodcutter at the nearest wood, quarry at the nearest rocks (or a mine at the cliff), searched behind the wall line
  const behind = (kind: StructId) => place(s, kind, k.cx, k.cy - 6, 1, 40, wy + 2);
  if (!behind('lumber')) place(s, 'lumber', k.cx, k.cy - 6, 1, 70); // no wood behind the wall: the woodcutter works out front and needs guarding
  if (!behind('quarry')) behind('mine');

  // a garrison for each player: archers man the wall, spearmen hold behind the gate
  const wall = wallIds.length ? structById(s, wallIds[Math.floor(wallIds.length / 2)]) : undefined;
  for (const p of [0, 1] as const) {
    const ax = (gx + (p ? 3 : -3) + 0.5) * CELL, ay = (wy + 3) * CELL;
    const a = spawnSquad(s, p, 'archer', ax, ay);
    if (wall) setOrder(s, a, 'wall', ax, ay, { structure: wall.id });
    const sp = spawnSquad(s, p, 'spearman', (gx + (p ? 2 : -2) + 0.5) * CELL, (wy + 6) * CELL);
    setOrder(s, sp, 'hold', (gx + (p ? 2 : -2) + 0.5) * CELL, (wy + 6) * CELL);
  }
  s.sRev++;
}
