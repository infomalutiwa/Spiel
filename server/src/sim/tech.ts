import { LEVEL_DMG, LEVEL_HP, TROOPS, branchOf, type GameState, type PlayerId, type TroopType } from '@burgwacht/shared';

/** maximum health of a troop of the given upgrade level / branch */
export function techMaxHp(type: TroopType, level: number, branch: number): number {
  const b = branchOf(type, branch);
  return Math.round(TROOPS[type].hp * LEVEL_HP[Math.min(LEVEL_HP.length, Math.max(1, level)) - 1] * (b === 'shield' ? 1.15 : b === 'flank' ? 0.95 : 1));
}
export const levelDamage = (level: number) => LEVEL_DMG[Math.min(LEVEL_DMG.length, Math.max(1, level)) - 1];

/** after an upgrade: every living troop of that type of the player takes on the new level (health scales with it) */
export function applyTech(s: GameState, player: PlayerId, troop: TroopType): void {
  const t = s.players[player].tech[troop];
  for (const u of s.units) {
    if (u.owner !== player || u.type !== troop || u.hp <= 0) continue;
    const old = u.maxHp, fresh = techMaxHp(troop, t.level, t.branch);
    u.level = t.level; u.branch = t.branch;
    u.maxHp = fresh; u.hp = Math.min(fresh, u.hp + (fresh - old));
  }
}
