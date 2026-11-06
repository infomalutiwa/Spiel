import type { DmgKind } from './common';

export type EnemyId = 'e_raider' | 'e_soldier' | 'e_xbow' | 'e_rider' | 'e_shield' | 'ram' | 'e_ladder' | 'siege_tower'
  | 'miner' | 'pioneer' | 'fire_archer' | 'trebuchet' | 'warlord';
export type EnemyRole = 'foot' | 'ranged' | 'mounted' | 'siege' | 'special' | 'boss';

export interface EnemyDef {
  id: EnemyId; name: string; icon: string;
  model: string; scale: number; tint?: string;
  hp: number; armor: number; dmg: number; kind: DmgKind; range: number; cd: number; speed: number; radius: number;
  /** cost for the commander's wave budget */
  budget: number;
  role: EnemyRole;
  heavy?: boolean; mounted?: boolean; charge?: number;
  /** damage multiplier against structures (rams, trebuchets) */
  vsStructure?: number;
  pierce?: number;
  /** pavise: ranged damage from the front reduced while standing */
  pavise?: number;
  /** extra info for special behaviour */
  carries?: number;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  e_raider: { id: 'e_raider', name: 'Plünderer', icon: '🪓', model: 'e_raider', scale: 1.38, hp: 70, armor: 1, dmg: 9, kind: 'slash', range: 2, cd: 1.0, speed: 5.2, radius: 0.6, budget: 6, role: 'foot' },
  e_soldier: { id: 'e_soldier', name: 'Söldner', icon: '⚔️', model: 'e_soldier', scale: 1.42, hp: 130, armor: 6, dmg: 14, kind: 'slash', range: 2, cd: 1.0, speed: 4.4, radius: 0.6, budget: 10, role: 'foot', heavy: true },
  e_xbow: { id: 'e_xbow', name: 'Pavesen-Armbrust', icon: '🎯', model: 'crossbowman', scale: 1.38, tint: '#ff9b8c', hp: 80, armor: 2, dmg: 22, kind: 'bolt', range: 36, cd: 2.6, speed: 4.0, radius: 0.6, budget: 12, role: 'ranged', pierce: 0.5, pavise: 0.6 },
  e_rider: { id: 'e_rider', name: 'Plünderreiter', icon: '🐎', model: 'cavalry', scale: 1.45, tint: '#ff8f80', hp: 130, armor: 3, dmg: 15, kind: 'charge', range: 2.2, cd: 1.0, speed: 9, radius: 0.9, budget: 14, role: 'mounted', mounted: true, charge: 2 },
  e_shield: { id: 'e_shield', name: 'Schildträger (Schildkröte)', icon: '🐢', model: 'e_shield', scale: 1.42, hp: 160, armor: 5, dmg: 12, kind: 'slash', range: 2, cd: 1.1, speed: 3.2, radius: 0.6, budget: 14, role: 'foot', heavy: true },
  ram: { id: 'ram', name: 'Rammbock', icon: '🐏', model: 'siege-ram', scale: 5, hp: 900, armor: 8, dmg: 60, kind: 'siege', range: 3, cd: 2.0, speed: 3.0, radius: 2.2, budget: 30, role: 'siege', vsStructure: 1 },
  e_ladder: { id: 'e_ladder', name: 'Sturmleiter', icon: '🪜', model: 'e_soldier', scale: 1.42, hp: 130, armor: 6, dmg: 14, kind: 'slash', range: 2, cd: 1.0, speed: 4.0, radius: 0.6, budget: 9, role: 'special', heavy: true, carries: 1 },
  siege_tower: { id: 'siege_tower', name: 'Belagerungsturm', icon: '🗼', model: 'siege-tower', scale: 1, hp: 900, armor: 6, dmg: 0, kind: 'siege', range: 3, cd: 1, speed: 2.4, radius: 3.2, budget: 120, role: 'siege', carries: 12 },
  miner: { id: 'miner', name: 'Mineur', icon: '⛏️', model: 'e_raider', scale: 1.3, tint: '#b49070', hp: 100, armor: 2, dmg: 6, kind: 'slash', range: 2, cd: 1.0, speed: 4.4, radius: 0.6, budget: 20, role: 'special' },
  pioneer: { id: 'pioneer', name: 'Pionier', icon: '🧰', model: 'e_pioneer', scale: 1.36, hp: 70, armor: 1, dmg: 6, kind: 'slash', range: 2, cd: 1.0, speed: 5.0, radius: 0.55, budget: 10, role: 'special' },
  fire_archer: { id: 'fire_archer', name: 'Brandpfeil-Schütze', icon: '🔥', model: 'archer', scale: 1.38, tint: '#ff7b5a', hp: 70, armor: 1, dmg: 8, kind: 'fire', range: 40, cd: 1.6, speed: 4.4, radius: 0.55, budget: 14, role: 'ranged' },
  trebuchet: { id: 'trebuchet', name: 'Trebuchet', icon: '🏹', model: 'siege-trebuchet', scale: 9, hp: 600, armor: 6, dmg: 120, kind: 'stone', range: 110, cd: 8, speed: 2.0, radius: 3, budget: 140, role: 'siege', vsStructure: 1 },
  warlord: { id: 'warlord', name: 'Kriegsfürst', icon: '👑', model: 'e_warlord', scale: 2.2, hp: 4000, armor: 8, dmg: 45, kind: 'slash', range: 2.8, cd: 1.3, speed: 3.6, radius: 1.2, budget: 200, role: 'boss', heavy: true },
};
export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
