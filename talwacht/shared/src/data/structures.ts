import { res, type DmgKind, type Res } from './common';
import type { TroopId } from './troops';

export type StructId =
  | 'keep' | 'wall' | 'gate'
  | 'tower_bow' | 'tower_xbow' | 'ballista' | 'tower_catapult' | 'pitch' | 'watchtower'
  | 'spikes' | 'pitfall' | 'pitch_ditch' | 'caltrops' | 'stakes' | 'log_trap' | 'rockslide' | 'powder' | 'moat'
  | 'lumber' | 'quarry' | 'mine' | 'farm' | 'mill' | 'market' | 'house' | 'well'
  | 'barracks' | 'range' | 'stable' | 'infirmary' | 'workshop' | 'smithy';
export type StructCat = 'keep' | 'wall' | 'tower' | 'trap' | 'eco' | 'mil';

export interface TowerSpec {
  /** virtual shooters per level (they never count towards the army) */
  shooters: number[];
  cd: number[]; dmg: number[]; range: number[]; kind: DmgKind;
  minRange?: number; radius?: number; edge?: number;
  maxTargets?: number[]; lineLen?: number;
  /** seconds a hit breaks a shield formation */
  breakFormation?: number;
  /** burn [dps, seconds] per level (0 = none) */
  burn?: [number, number][];
  /** stone per shot */
  stone?: number;
  pierce?: number;
  /** ignores testudo / pavise shields */
  ignoresShields?: boolean;
  /** pitch: box in front (width, depth) */
  box?: [number, number];
  /** what it shoots first */
  prefers: 'weakest' | 'armored' | 'line' | 'cluster' | 'any';
}
export interface TrapSpec {
  trigger: 'auto' | 'manual';
  dmg: number; radius?: number;
  slow?: number; slowFoot?: number; slowDur?: number;
  uses?: number; captures?: number; stop?: boolean; stun?: number;
  only?: 'mounted';
  cd?: number;
  reset?: Res;
  needs?: 'slope' | 'cliff' | 'creek';
  /** line length for rolling logs */
  line?: number;
}
export interface EcoSpec {
  out: Partial<Res>;
  near?: 'forest' | 'rock' | 'cliff' | 'meadow';
  perNear?: number; maxOut?: number; minNear?: number;
  cap?: number; boost?: number;
}
export interface StructDef {
  id: StructId; name: string; icon: string; cat: StructCat; blurb: string;
  w: number; h: number;
  /** hit points per level */
  hp: number[];
  cost: Res;
  /** upgrade cost to level 2, 3 … */
  up: Res[];
  build: number;
  /** burns (fire archers) – per level for walls/gates */
  wooden: boolean[];
  unlock?: string;
  tower?: TowerSpec; trap?: TrapSpec; eco?: EcoSpec;
  trains?: TroopId[];
}

const S = (d: Omit<StructDef, 'wooden'> & { wooden?: boolean[] }): StructDef => ({ wooden: [false], ...d });

export const STRUCTURES: Record<StructId, StructDef> = {
  keep: S({ id: 'keep', name: 'Bergfried', icon: '🏰', cat: 'keep', blurb: 'Fällt er, ist die Runde verloren.', w: 4, h: 4, hp: [5000, 7000, 9800], cost: res(), up: [res(150, 250, 0, 150), res(200, 400, 0, 300)], build: 0 }),
  wall: S({ id: 'wall', name: 'Mauer', icon: '🧱', cat: 'wall', blurb: 'Palisade → Steinmauer → verstärkte Mauer. Schützen auf dem Wehrgang.', w: 1, h: 1, hp: [300, 900, 1600], cost: res(6), up: [res(0, 10), res(0, 16, 0, 10)], build: 4, wooden: [true, false, false] }),
  gate: S({ id: 'gate', name: 'Tor', icon: '🚪', cat: 'wall', blurb: 'Holztor → beschlagenes Tor → Torhaus mit Fallgitter. Öffnet für eigene Truppen.', w: 1, h: 1, hp: [800, 1600, 2600], cost: res(20, 10), up: [res(20, 30, 0, 20), res(0, 60, 0, 60)], build: 12, wooden: [true, false, false] }),

  tower_bow: S({ id: 'tower_bow', name: 'Bogenturm', icon: '🏹', cat: 'tower', blurb: 'Viele schnelle Pfeile gegen leichte Gegner. Stufe 3: Brandpfeile.', w: 1, h: 1, hp: [700, 950, 1250], cost: res(60, 40), up: [res(30, 40, 0, 20), res(40, 60, 0, 40)], build: 20,
    tower: { shooters: [2, 3, 4], cd: [0.9, 0.9, 0.9], dmg: [11, 12, 13], range: [40, 42, 44], kind: 'pierce', burn: [[0, 0], [0, 0], [4, 3]], prefers: 'weakest' } }),
  tower_xbow: S({ id: 'tower_xbow', name: 'Armbrustturm', icon: '🎯', cat: 'tower', blurb: 'Langsamer, aber jeder Bolzen durchschlägt Rüstung.', w: 1, h: 1, hp: [800, 1100], cost: res(80, 70, 0, 40), up: [res(40, 60, 0, 60)], build: 24,
    tower: { shooters: [2, 3], cd: [2.2, 2.2], dmg: [36, 40], range: [46, 48], kind: 'bolt', pierce: 0.7, prefers: 'armored' } }),
  ballista: S({ id: 'ballista', name: 'Ballista', icon: '🗡️', cat: 'tower', blurb: 'Riesenbolzen durchschlägt eine ganze Reihe – auch Schilde.', w: 1, h: 1, hp: [800, 1100], cost: res(100, 60, 0, 60), up: [res(60, 60, 0, 80)], build: 26, unlock: 'ballista',
    tower: { shooters: [1, 1], cd: [4, 4], dmg: [90, 120], range: [60, 62], kind: 'bolt', maxTargets: [6, 8], lineLen: 45, ignoresShields: true, prefers: 'line' } }),
  tower_catapult: S({ id: 'tower_catapult', name: 'Katapultturm', icon: '🪨', cat: 'tower', blurb: 'Großer Flächenschaden, sprengt Schildkröten auf. Braucht Stein.', w: 1, h: 1, hp: [900, 1200], cost: res(120, 120, 0, 60), up: [res(80, 80, 0, 80)], build: 30,
    tower: { shooters: [1, 1], cd: [5, 5], dmg: [70, 85], range: [85, 110], minRange: 30, radius: 6, edge: 0.4, breakFormation: 6, stone: 3, kind: 'stone', ignoresShields: true, burn: [[0, 0], [8, 5]], prefers: 'cluster' } }),
  pitch: S({ id: 'pitch', name: 'Pechnase', icon: '🫕', cat: 'tower', blurb: 'Gießt brennendes Pech vor Tor oder Mauer – der Konter gegen die Schildkröte.', w: 1, h: 1, hp: [500, 700], cost: res(40, 40, 0, 30), up: [res(30, 30, 0, 40)], build: 14,
    tower: { shooters: [1, 1], cd: [8, 8], dmg: [60, 90], range: [7, 7], box: [8, 6], kind: 'fire', ignoresShields: true, burn: [[10, 4], [15, 4]], prefers: 'any' } }),
  watchtower: S({ id: 'watchtower', name: 'Wachturm', icon: '🔭', cat: 'tower', blurb: 'Genauer Spähbericht, Moral in der Nähe, hebt die Nacht auf.', w: 1, h: 1, hp: [500], cost: res(50, 20), up: [], build: 14, wooden: [true] }),

  spikes: S({ id: 'spikes', name: 'Stachelgrube', icon: '🔺', cat: 'trap', blurb: 'Schaden und Verlangsamung, 12 Auslösungen.', w: 1, h: 1, hp: [200], cost: res(15), up: [], build: 5,
    trap: { trigger: 'auto', dmg: 25, slow: 0.4, slowFoot: 0.4, slowDur: 2, uses: 12, reset: res(10) } }),
  pitfall: S({ id: 'pitfall', name: 'Fallgrube', icon: '🕳️', cat: 'trap', blurb: 'Verschluckt die ersten drei Fußsoldaten.', w: 1, h: 1, hp: [200], cost: res(20), up: [], build: 6,
    trap: { trigger: 'auto', dmg: 9999, captures: 3, reset: res(20) } }),
  pitch_ditch: S({ id: 'pitch_ditch', name: 'Pechgraben', icon: '🛢️', cat: 'trap', blurb: 'Klebrig; angezündet ein Flammenmeer.', w: 1, h: 1, hp: [200], cost: res(10, 0, 0, 20), up: [], build: 6,
    trap: { trigger: 'manual', dmg: 0, slow: 0.5, slowFoot: 0.5, slowDur: 1, radius: 4, reset: res(0, 0, 0, 20) } }),
  caltrops: S({ id: 'caltrops', name: 'Krähenfüße', icon: '✴️', cat: 'trap', blurb: 'Bremst Reiter stark.', w: 1, h: 1, hp: [200], cost: res(10), up: [], build: 4,
    trap: { trigger: 'auto', dmg: 4, slow: 0.7, slowFoot: 0.2, slowDur: 2.5 } }),
  stakes: S({ id: 'stakes', name: 'Spießwall', icon: '🪵', cat: 'trap', blurb: 'Reiter prallen ab, Fußvolk geht durch.', w: 1, h: 1, hp: [400], cost: res(20), up: [], build: 6,
    trap: { trigger: 'auto', dmg: 40, only: 'mounted', stop: true, cd: 2 } }),
  log_trap: S({ id: 'log_trap', name: 'Baumstamm-Lawine', icon: '🌲', cat: 'trap', blurb: 'Am Hang: rollt per Auslöser bergab.', w: 1, h: 1, hp: [300], cost: res(40), up: [], build: 8,
    trap: { trigger: 'manual', dmg: 80, stun: 1.5, line: 40, cd: 20, reset: res(30), needs: 'slope' } }),
  rockslide: S({ id: 'rockslide', name: 'Steinlawine', icon: '🪨', cat: 'trap', blurb: 'An der Klippe: riesiger Flächenschaden.', w: 1, h: 1, hp: [500], cost: res(0, 60), up: [], build: 12, unlock: 'rockslide',
    trap: { trigger: 'manual', dmg: 150, radius: 10, stun: 2, cd: 90, needs: 'cliff' } }),
  powder: S({ id: 'powder', name: 'Sprengfass', icon: '🛢️', cat: 'trap', blurb: 'Explodiert bei Nähe oder Feuer.', w: 1, h: 1, hp: [100], cost: res(0, 0, 0, 40), up: [], build: 5, unlock: 'powder',
    trap: { trigger: 'auto', dmg: 120, radius: 7, uses: 1 } }),
  moat: S({ id: 'moat', name: 'Wassergraben', icon: '🌊', cat: 'trap', blurb: 'Bremst stark, stoppt Belagerungstürme und Mineure.', w: 1, h: 1, hp: [9999], cost: res(0, 25), up: [], build: 8,
    trap: { trigger: 'auto', dmg: 0, slow: 0.6, slowFoot: 0.6, slowDur: 0.5, needs: 'creek' } }),

  lumber: S({ id: 'lumber', name: 'Holzfäller', icon: '🪓', cat: 'eco', blurb: 'Mehr Bäume in der Nähe, mehr Holz.', w: 2, h: 2, hp: [400], cost: res(30), up: [], build: 15, wooden: [true],
    eco: { out: { wood: 6 }, near: 'forest', perNear: 0.6, maxOut: 18, minNear: 4 } }),
  quarry: S({ id: 'quarry', name: 'Steinbruch', icon: '⛏️', cat: 'eco', blurb: 'Bricht Stein aus nahen Felsen.', w: 2, h: 2, hp: [500], cost: res(40), up: [], build: 18, wooden: [true],
    eco: { out: { stone: 4 }, near: 'rock', perNear: 0.5, maxOut: 12, minNear: 3 } }),
  mine: S({ id: 'mine', name: 'Mine', icon: '⚒️', cat: 'eco', blurb: 'An der Klippe: Stein und etwas Gold.', w: 2, h: 2, hp: [600], cost: res(60, 20), up: [], build: 25,
    eco: { out: { stone: 8, gold: 4 }, near: 'cliff', minNear: 1 } }),
  farm: S({ id: 'farm', name: 'Hof', icon: '🌾', cat: 'eco', blurb: 'Nahrung für die Armee, mehr auf Wiesen.', w: 2, h: 2, hp: [350], cost: res(25), up: [], build: 15, wooden: [true],
    eco: { out: { food: 8 }, near: 'meadow', perNear: 1, maxOut: 12 } }),
  mill: S({ id: 'mill', name: 'Mühle', icon: '🌀', cat: 'eco', blurb: '+25 % für Höfe in der Nähe.', w: 2, h: 2, hp: [450], cost: res(50, 20), up: [], build: 20, wooden: [true], eco: { out: {}, boost: 0.25 } }),
  market: S({ id: 'market', name: 'Markt', icon: '🪙', cat: 'eco', blurb: 'Gold für Truppen und Ausbau.', w: 2, h: 2, hp: [450], cost: res(60, 20), up: [], build: 20, wooden: [true], eco: { out: { gold: 12 } } }),
  house: S({ id: 'house', name: 'Haus', icon: '🏠', cat: 'eco', blurb: '+8 Armeeplätze für beide, etwas Steuer.', w: 2, h: 2, hp: [350], cost: res(30, 10), up: [], build: 12, wooden: [true], eco: { out: { gold: 2 }, cap: 8 } }),
  well: S({ id: 'well', name: 'Brunnen', icon: '💧', cat: 'eco', blurb: 'Brände in der Nähe gehen schneller aus.', w: 1, h: 1, hp: [300], cost: res(10, 15), up: [], build: 8, eco: { out: {} } }),

  barracks: S({ id: 'barracks', name: 'Kaserne', icon: '⚔️', cat: 'mil', blurb: 'Speerträger, Schildträger, Hellebardiere (Stufe 2).', w: 2, h: 2, hp: [800, 1100], cost: res(60, 30), up: [res(60, 60, 0, 60)], build: 20, wooden: [true, false], trains: ['spearman', 'shieldman', 'halberdier'] }),
  range: S({ id: 'range', name: 'Schießplatz', icon: '🎯', cat: 'mil', blurb: 'Bogen- und Armbrustschützen, Langbogen (Stufe 3).', w: 2, h: 2, hp: [700, 950, 1200], cost: res(60, 20), up: [res(40, 40, 0, 40), res(60, 60, 0, 80)], build: 20, wooden: [true, true, false], trains: ['archer', 'crossbowman', 'longbow'] }),
  stable: S({ id: 'stable', name: 'Stall', icon: '🐎', cat: 'mil', blurb: 'Leichte Reiter, Ritter (Stufe 2).', w: 2, h: 2, hp: [700, 950], cost: res(80, 20, 20), up: [res(60, 60, 0, 80)], build: 22, wooden: [true, true], trains: ['rider', 'knight'] }),
  infirmary: S({ id: 'infirmary', name: 'Lazarett', icon: '✚', cat: 'mil', blurb: 'Feldscher; heilt Verwundete in der Nähe.', w: 2, h: 2, hp: [600], cost: res(50, 30), up: [], build: 18, wooden: [true], trains: ['medic'] }),
  workshop: S({ id: 'workshop', name: 'Werkstatt', icon: '🔨', cat: 'mil', blurb: 'Ingenieure: reparieren, löschen, Gegenminen.', w: 2, h: 2, hp: [600], cost: res(60, 20), up: [], build: 18, wooden: [true], trains: ['engineer'] }),
  smithy: S({ id: 'smithy', name: 'Schmiede', icon: '⚒️', cat: 'mil', blurb: 'Rüstung, Waffen, Brandpfeile, Pavesen für eure Truppen.', w: 2, h: 2, hp: [700], cost: res(60, 60), up: [], build: 22 }),
};
export const STRUCT_IDS = Object.keys(STRUCTURES) as StructId[];

/** smithy research (applies to all your troops) */
export const SMITHY = {
  armor: { name: 'Bessere Rüstung', icon: '🦺', blurb: '+2 Rüstung für alle Truppen', cost: res(0, 40, 0, 120), time: 40 },
  weapons: { name: 'Geschärfte Waffen', icon: '🗡️', blurb: '+15 % Schaden', cost: res(40, 20, 0, 140), time: 45 },
  firearrows: { name: 'Brandpfeile', icon: '🔥', blurb: 'Bogenschützen zünden Pech und setzen in Brand', cost: res(40, 0, 0, 100), time: 35 },
  pavise: { name: 'Pavesen', icon: '🪧', blurb: 'Eure Schützen am Boden: −30 % Fernkampfschaden', cost: res(80, 0, 0, 80), time: 35 },
} as const;
export type SmithyId = keyof typeof SMITHY;

/** walkway height of a wall / gate per level (where defenders stand) */
export const WALL_TOP = [2.6, 4.8, 5.4];
/** sustained damage per second of a tower (all shooters) */
export function towerDps(id: StructId, level: number) {
  const t = STRUCTURES[id].tower!;
  const l = level - 1;
  return (t.shooters[l] * t.dmg[l]) / t.cd[l];
}
/** pieces that join into one continuous rampart (towers sit in the wall line; pitch is mounted on a wall or gate, not a cell of its own) */
export const isWallish = (k: StructId) => k === 'wall' || k === 'gate' || k === 'keep' || (STRUCTURES[k].cat === 'tower' && k !== 'watchtower' && k !== 'pitch');
