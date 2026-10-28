import { UNIT_DEFS, isStructureType, type GameState, type Unit } from '@burgwacht/shared';

/**
 * "Angriff" needs no target: every unit under an `assault` order heads for the nearest living enemy
 * (people first; buildings do not count) and fights whatever it meets on the way. Artillery stays where it is.
 * With nobody left the unit waits where it stands and picks up again when the next enemies show up.
 */
export function stepAssault(s: GameState): void {
  let foes: Unit[] | undefined;
  for (const u of s.units) {
    if (u.hp <= 0 || u.order.kind !== 'assault' || u.routed > 0) continue;
    if (UNIT_DEFS[u.type].role === 'artillery') continue;
    foes ??= s.units.filter(e => e.hp > 0 && e.side === 'enemy' && !isStructureType(e.type));
    let best: Unit | undefined, bd = Infinity;
    for (const e of foes) { const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd || (d === bd && best && e.id < best.id)) { best = e; bd = d; } }
    u.order = best ? { kind: 'assault', x: best.x, y: best.y } : { kind: 'assault', x: u.x, y: u.y };
  }
}
