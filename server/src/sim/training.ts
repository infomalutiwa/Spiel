import {
  BARRACKS, LEVY_RATE, MAPS, SLOT_WEIGHT, SQUAD_SIZE, TRAIN_SECONDS, type GameState, type PlayerId, type TrainItem, type TroopType, type Unit,
} from '@burgwacht/shared';
import { spawnUnit } from './state';

/** slots the soldiers waiting in a player's barracks queue will use */
export const queuedSlots = (s: GameState, player: PlayerId): number =>
  s.players[player].queue.reduce((n, it) => n + it.count * SLOT_WEIGHT[it.troop], 0);

/** seconds to train `count` soldiers of a type (a full squad takes TRAIN_SECONDS) */
export const trainTime = (troop: TroopType, count: number): number =>
  Math.max(2, (TRAIN_SECONDS[troop] * count) / SQUAD_SIZE[troop]);

/** soldiers of a squad that are still waiting in the queue */
export const queuedFor = (s: GameState, player: PlayerId, squad: number): number =>
  s.players[player].queue.reduce((n, it) => n + (it.squad === squad ? it.count : 0), 0);

export function enqueue(s: GameState, player: PlayerId, it: Omit<TrainItem, 't' | 'total'>): void {
  const total = trainTime(it.troop, it.count);
  s.players[player].queue.push({ ...it, t: total, total });
}

/** a finished batch leaves the barracks and walks to its rally point */
function release(s: GameState, player: PlayerId, it: TrainItem): void {
  const map = MAPS[s.mapId], b = map.barracks[player];
  const fresh: Unit[] = [];
  for (let i = 0; i < it.count; i++) fresh.push(spawnUnit(s, 'player', player, it.troop, b.x + (i % 3) * 0.8, b.y + Math.floor(i / 3) * 0.8));
  let squad = it.squad;
  if (!squad) { squad = fresh[0].id; s.squads.push({ id: squad, troop: it.troop, owner: player, x: it.x, y: it.y }); }
  const members = [...s.units.filter(u => u.squad === squad && u.hp > 0), ...fresh];
  // new faces line up with the veterans of the squad around the rally point
  const slots = placementFor(s, members, it.x, it.y);
  members.forEach((u, i) => {
    if (!fresh.includes(u)) return;
    u.squad = squad; u.postX = slots[i].x; u.postY = slots[i].y;
    u.order = { kind: 'move', x: slots[i].x, y: slots[i].y };
  });
}

/** set by orders.ts (avoids an import cycle) */
let placementFor: (s: GameState, units: Unit[], x: number, y: number) => { x: number; y: number }[] = (_s, us, x, y) => us.map(() => ({ x, y }));
export const setPlacement = (f: typeof placementFor) => { placementFor = f; };

/** barracks queues: only the first batch trains; a freshly fallen zone triggers an emergency levy (faster training) */
export function stepTraining(s: GameState, dt: number): void {
  const levy = s.zones.some(z => z.hold > 0) ? LEVY_RATE : 1;
  ([0, 1] as PlayerId[]).forEach(p => {
    const q = s.players[p].queue, head = q[0];
    if (!head) return;
    head.t -= dt * levy * BARRACKS[s.players[p].barracks - 1].speed;
    if (head.t <= 0) { q.shift(); release(s, p, head); }
  });
}
