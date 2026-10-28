import type { TroopType } from '../types';

/**
 * Troop branches. From level 2 a type specialises (the player chooses once, together with the first upgrade);
 * level 3 deepens the chosen branch. `id` is read by the simulation (combat.ts), `name` / `blurb` by the UI.
 */
export type BranchId =
  | 'fire' | 'pierce'          // archer
  | 'shield' | 'berserk'       // knight
  | 'pike' | 'javelin'         // spearman
  | 'lance' | 'flank'          // cavalry
  | 'chain' | 'frost'          // mage
  | 'aura' | 'revive'          // healer
  | 'salvo' | 'sniper'         // crossbowman
  | 'napalm' | 'boulder';      // catapult

export interface BranchDef { id: BranchId; name: string; blurb: string }

export const TECH: Record<TroopType, [BranchDef, BranchDef]> = {
  archer: [
    { id: 'fire', name: 'Feuerpfeile', blurb: 'Pfeile entzünden das Ziel: Brandschaden über 3 Sekunden (ignoriert die Hälfte der Rüstung).' },
    { id: 'pierce', name: 'Durchschlag', blurb: 'Pfeile durchschlagen Rüstung (60 %) und treffen härter.' },
  ],
  knight: [
    { id: 'shield', name: 'Schildwall', blurb: 'Blockt Pfeile, Bolzen und Magie zur Hälfte; Spott reicht weiter.' },
    { id: 'berserk', name: 'Berserker', blurb: '+35 % Schaden, schnellere Schläge, unter halber Gesundheit noch einmal +25 %.' },
  ],
  spearman: [
    { id: 'pike', name: 'Pikenwall', blurb: 'Reiter prallen ab: +60 % gegen Reiter, längere Spieße, Reiter verlieren ihren Anlauf.' },
    { id: 'javelin', name: 'Wurfspeere', blurb: 'Wirft Speere aus 8 Metern Entfernung, bevor es zum Nahkampf kommt.' },
  ],
  cavalry: [
    { id: 'lance', name: 'Lanzenangriff', blurb: 'Der Sturmangriff trifft 1,5× so hart und wirft Gegner zurück.' },
    { id: 'flank', name: 'Flankenläufer', blurb: '+25 % Tempo, jagen Fernkämpfer und Heiler quer über das Feld.' },
  ],
  mage: [
    { id: 'chain', name: 'Kettenblitz', blurb: 'Der Zauber springt auf bis zu drei weitere Gegner außerhalb des Radius über.' },
    { id: 'frost', name: 'Frost', blurb: 'Getroffene sind 3 Sekunden lang halb so schnell und schlagen langsamer zu.' },
  ],
  healer: [
    { id: 'aura', name: 'Heilaura', blurb: 'Alle Verbündeten im Umkreis regenerieren ständig; stärkerer Einzelheilzauber.' },
    { id: 'revive', name: 'Wiederbelebung', blurb: 'Gefallene Kameraden stehen mit 45 % Gesundheit wieder auf (alle 18 Sekunden).' },
  ],
  crossbowman: [
    { id: 'salvo', name: 'Salve', blurb: 'Feuert zwei Bolzen kurz nacheinander (schneller nachgeladen).' },
    { id: 'sniper', name: 'Scharfschütze', blurb: '+40 % Reichweite, durchschlägt Rüstung fast vollständig, bevorzugt Anführer.' },
  ],
  catapult: [
    { id: 'napalm', name: 'Brandsteine', blurb: 'Einschläge entzünden alle im Radius: Brandschaden über 4 Sekunden.' },
    { id: 'boulder', name: 'Felsbrocken', blurb: 'Größerer Einschlagsradius (+35 %) und +25 % Schaden, verbraucht aber 1 Stein mehr.' },
  ],
};

/** the active branch of a unit: 0 = none, 1 / 2 = first / second entry of TECH[type] */
export const branchOf = (type: string, branch: number): BranchId | undefined =>
  branch > 0 && type in TECH ? TECH[type as TroopType][branch - 1]?.id : undefined;
