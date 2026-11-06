import { res, type DmgKind, type Res } from './common';

export type TroopId = 'spearman' | 'shieldman' | 'halberdier' | 'archer' | 'crossbowman' | 'longbow' | 'rider' | 'knight' | 'medic' | 'engineer';
export type TroopRole = 'melee' | 'ranged' | 'mounted' | 'support';

export interface TroopDef {
  id: TroopId; name: string; icon: string; blurb: string;
  /** baked model id + tint tweak for look-alikes */
  model: string; scale: number; tint?: string;
  building: 'barracks' | 'range' | 'stable' | 'infirmary' | 'workshop';
  /** building level needed */
  needs: number;
  squad: number; hp: number; armor: number; dmg: number; kind: DmgKind;
  range: number; cd: number; speed: number; radius: number;
  cost: Res; train: number; role: TroopRole;
  /** multipliers against target classes */
  vsMounted?: number; vsHeavy?: number; vsTestudoFlank?: number;
  /** fraction of armor ignored */
  pierce?: number;
  /** ranged damage taken from the front is reduced by this fraction */
  frontBlock?: number;
  charge?: number;
  heal?: { amount: number; radius: number };
  repair?: number;
  unlock?: string;
}

export const TROOPS: Record<TroopId, TroopDef> = {
  spearman: { id: 'spearman', name: 'Speerträger', icon: '🔱', blurb: 'Günstige Front, Konter gegen Reiter.', model: 'spearman', scale: 1.4,
    building: 'barracks', needs: 1, squad: 10, hp: 110, armor: 3, dmg: 14, kind: 'spear', range: 2.4, cd: 1.1, speed: 4.2, radius: 0.6,
    cost: res(0, 0, 10, 60), train: 9, role: 'melee', vsMounted: 2.5 },
  shieldman: { id: 'shieldman', name: 'Schildträger', icon: '🛡️', blurb: 'Zähe Front, hält Lücken und Tore.', model: 'knight', scale: 1.4,
    building: 'barracks', needs: 1, squad: 10, hp: 150, armor: 6, dmg: 16, kind: 'slash', range: 2, cd: 1.0, speed: 4.0, radius: 0.6,
    cost: res(0, 0, 10, 70), train: 10, role: 'melee', frontBlock: 0.4 },
  halberdier: { id: 'halberdier', name: 'Hellebardiere', icon: '🪓', blurb: 'Brechen Schwere und Schildkröten von der Flanke.', model: 'halberdier', scale: 1.42,
    building: 'barracks', needs: 2, squad: 8, hp: 160, armor: 5, dmg: 26, kind: 'slash', range: 2.6, cd: 1.4, speed: 3.8, radius: 0.6,
    cost: res(0, 0, 12, 90), train: 12, role: 'melee', vsHeavy: 1.8, vsTestudoFlank: 2, unlock: 'halberdier' },
  archer: { id: 'archer', name: 'Bogenschützen', icon: '🏹', blurb: 'Dauerbeschuss gegen leichte Gegner.', model: 'archer', scale: 1.38,
    building: 'range', needs: 1, squad: 10, hp: 60, armor: 1, dmg: 11, kind: 'pierce', range: 38, cd: 1.0, speed: 4.4, radius: 0.55,
    cost: res(0, 0, 8, 50), train: 9, role: 'ranged' },
  crossbowman: { id: 'crossbowman', name: 'Armbrustschützen', icon: '🎯', blurb: 'Langsam, aber durchschlagend gegen Rüstung.', model: 'crossbowman', scale: 1.38,
    building: 'range', needs: 1, squad: 8, hp: 70, armor: 2, dmg: 34, kind: 'bolt', range: 42, cd: 2.4, speed: 4.0, radius: 0.55,
    cost: res(0, 0, 8, 70), train: 10, role: 'ranged', pierce: 0.7 },
  longbow: { id: 'longbow', name: 'Langbogen', icon: '🎋', blurb: 'Größte Reichweite unter den Schützen.', model: 'archer', scale: 1.45, tint: '#c8e0a0',
    building: 'range', needs: 3, squad: 8, hp: 60, armor: 1, dmg: 16, kind: 'pierce', range: 55, cd: 1.2, speed: 4.4, radius: 0.55,
    cost: res(0, 0, 8, 80), train: 11, role: 'ranged', unlock: 'longbow' },
  rider: { id: 'rider', name: 'Leichte Reiter', icon: '🐎', blurb: 'Schnell für Ausfälle, jagen Schützen.', model: 'cavalry', scale: 1.45,
    building: 'stable', needs: 1, squad: 6, hp: 140, armor: 3, dmg: 16, kind: 'charge', range: 2.2, cd: 1.0, speed: 9, radius: 0.9,
    cost: res(0, 0, 12, 70), train: 11, role: 'mounted', charge: 2.2 },
  knight: { id: 'knight', name: 'Ritter', icon: '🏇', blurb: 'Schwere Reiterei, zerschlägt Belagerer.', model: 'cavalry', scale: 1.55, tint: '#d8dde6',
    building: 'stable', needs: 2, squad: 6, hp: 240, armor: 8, dmg: 26, kind: 'charge', range: 2.2, cd: 1.1, speed: 7.5, radius: 0.95,
    cost: res(0, 0, 15, 130), train: 14, role: 'mounted', charge: 2.5, unlock: 'knight' },
  medic: { id: 'medic', name: 'Feldscher', icon: '✚', blurb: 'Heilen Verwundete in der Nähe.', model: 'healer', scale: 1.38,
    building: 'infirmary', needs: 1, squad: 3, hp: 60, armor: 1, dmg: 0, kind: 'slash', range: 8, cd: 1.5, speed: 4.2, radius: 0.55,
    cost: res(0, 0, 6, 60), train: 9, role: 'support', heal: { amount: 12, radius: 8 } },
  engineer: { id: 'engineer', name: 'Ingenieure', icon: '🔨', blurb: 'Reparieren, setzen Fallen zurück, löschen, graben Gegenminen.', model: 'engineer', scale: 1.38,
    building: 'workshop', needs: 1, squad: 4, hp: 70, armor: 2, dmg: 6, kind: 'slash', range: 3, cd: 1.0, speed: 4.2, radius: 0.55,
    cost: res(0, 0, 6, 50), train: 9, role: 'support', repair: 20 },
};
export const TROOP_IDS = Object.keys(TROOPS) as TroopId[];
