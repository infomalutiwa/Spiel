import type { Difficulty } from './common';

export interface Unlock { id: string; kind: 'map' | 'troop' | 'struct'; name: string; stars: number }
/** unlocked by the total number of stars collected over all maps and difficulties */
export const UNLOCKS: Unlock[] = [
  { id: 'ballista', kind: 'struct', name: 'Ballista', stars: 1 },
  { id: 'klamm', kind: 'map', name: 'Karte: Klamm', stars: 2 },
  { id: 'halberdier', kind: 'troop', name: 'Hellebardiere', stars: 2 },
  { id: 'powder', kind: 'struct', name: 'Sprengfass', stars: 3 },
  { id: 'longbow', kind: 'troop', name: 'Langbogen', stars: 3 },
  { id: 'knight', kind: 'troop', name: 'Ritter', stars: 4 },
  { id: 'flusstal', kind: 'map', name: 'Karte: Flusstal', stars: 5 },
  { id: 'rockslide', kind: 'struct', name: 'Steinlawine', stars: 5 },
  { id: 'winterpass', kind: 'map', name: 'Karte: Winterpass', stars: 8 },
];
export const unlockedBy = (stars: number) => UNLOCKS.filter(u => u.stars <= stars).map(u => u.id);

export type TalentId = 'walls' | 'training' | 'palisade' | 'wood' | 'range' | 'traps' | 'medics' | 'keep';
export interface Talent { id: TalentId; name: string; blurb: string; stars: number }
export const TALENTS: Talent[] = [
  { id: 'walls', name: 'Steinmetze', blurb: '+5 % Leben für Mauern und Tore', stars: 0 },
  { id: 'training', name: 'Drillmeister', blurb: '+10 % Ausbildungstempo', stars: 1 },
  { id: 'palisade', name: 'Vorbereitet', blurb: 'Start mit einer Palisadenlinie vor dem Bergfried', stars: 2 },
  { id: 'wood', name: 'Holzrecht', blurb: '+10 % Holz', stars: 3 },
  { id: 'range', name: 'Hohe Zinnen', blurb: '+5 % Turmreichweite', stars: 4 },
  { id: 'traps', name: 'Fallensteller', blurb: '−15 % Kosten für Fallen', stars: 6 },
  { id: 'medics', name: 'Kräuterkunde', blurb: '+20 % Heilung', stars: 8 },
  { id: 'keep', name: 'Trutzburg', blurb: '+15 % Leben für den Bergfried', stars: 10 },
];
export const MAX_TALENTS = 3;

export function starsFor(r: { won: boolean; keepMinFrac: number; diff: Difficulty }): number {
  if (!r.won) return 0;
  return 1 + (r.keepMinFrac >= 0.5 ? 1 : 0) + (r.diff === 'hard' ? 1 : 0);
}
