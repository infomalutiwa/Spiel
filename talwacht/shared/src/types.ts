import type { Difficulty, PlayerId, Res } from './data/common';
import type { EnemyId } from './data/enemies';
import type { TalentId } from './data/meta';
import type { SmithyId, StructId } from './data/structures';
import type { TroopId } from './data/troops';

export type UnitType = TroopId | EnemyId;
export type Side = 'p' | 'e';

export interface TrainJob { troop: TroopId; owner: PlayerId; left: number; total: number }

export interface Structure {
  id: number; kind: StructId; cx: number; cy: number; w: number; h: number;
  level: number; hp: number; maxHp: number; owner: PlayerId;
  /** seconds of construction left (0 = finished) */
  build: number; buildTotal: number;
  /** seconds of fire left */
  burning: number;
  /** tower / trap cooldown */
  cd: number;
  /** gate: 1 = open; pitfall: captured count; pitch_ditch: seconds burning; traps: 1 = spent/open */
  state: number;
  /** traps: triggers left */
  uses: number;
  /** pitch nose level mounted on this wall / gate (0 = none) */
  pitch: number; pitchCd: number;
  queue: TrainJob[];
  rally: { x: number; y: number } | null;
  research: { id: SmithyId; left: number; total: number } | null;
  /** seconds a miner has been digging under this cell */
  mined: number;
  /** catapult had no stone for its last shot (HUD hint) */
  dry: number;
  /** hit points still to be restored by a running repair */
  fix: number;
  /** everything paid for this structure (build + upgrades): selling refunds half */
  paid: Res;
}

/** ids at or above this are structures when used as an attack target */
export const STRUCT_TARGET = 1 << 24;

export interface Unit {
  id: number; type: UnitType; side: Side; owner: PlayerId | null;
  x: number; y: number; z: number; vx: number; vy: number;
  hp: number; maxHp: number; cd: number; facing: number;
  /** 0 idle, 1 walk, 2 attack, 3 dying */
  anim: 0 | 1 | 2 | 3;
  squad: number;
  /** wall slot key (structure id * 4 + slot) or -1 */
  slot: number;
  /** current target: unit id, or STRUCT_TARGET + structure id, or 0 */
  target: number;
  stun: number; slow: number; slowT: number; burn: number; burnDps: number;
  /** testudo formation id (0 = none) */
  formation: number;
  /** distance run since the last blow (cavalry charge) */
  charge: number;
  /** enemies: wave group; players: unused */
  group: number;
  /** behaviour sub-state for specials (climbing, digging, docking …) and its timer */
  mode: number; t: number;
  /** where a player unit wants to stand */
  gx: number; gy: number; gz: number;
  dead: number;
}

export type OrderKind = 'idle' | 'move' | 'attack' | 'hold' | 'retreat' | 'wall' | 'gate' | 'breach' | 'sortie' | 'tower';
export interface Order { k: OrderKind; x: number; y: number; target?: number; structure?: number }

export interface Squad {
  id: number; owner: PlayerId; type: TroopId; order: Order; members: number[];
  stars: number; xp: number;
}

export interface Formation {
  id: number; members: number[]; ram: number; broken: number; size0: number; facing: number;
}

export type ShellKind = 'arrow' | 'bolt' | 'ballista' | 'stone' | 'pot' | 'treb' | 'fire' | 'pitch' | 'log' | 'rocks';
export interface Shell {
  id: number; kind: ShellKind; side: Side; owner: PlayerId | null;
  x: number; y: number; z: number; tx: number; ty: number; tz: number;
  t: number; total: number;
  dmg: number; dk: import('./data/common').DmgKind; radius: number; edge: number;
  burn: [number, number] | null; breakF: number; pierce: number; ignoresShields: boolean;
  /** single target (unit id) for arrows/bolts; ballista: list of unit ids along the line */
  target: number; line: number[];
  /** shot from a wall/tower (for shield direction checks) */
  fromStruct: number;
  /** damage statistic key */
  stat: string;
}

export interface Group { id: number; type: EnemyId; lane: number; size0: number; members: number[]; budget: number; retreating: boolean }

export interface WaveGroupPlan { type: EnemyId; n: number; lane: number; delay: number; testudo?: boolean }
export interface WavePlan {
  wave: number; at: number; mainLane: number;
  groups: WaveGroupPlan[];
  scout: string[];
  special: 'night' | 'rain' | null;
  boss: boolean;
}
export interface Memory { wallRangedShare: number; traps: number; gateHp: number; riders: number; moat: number; fire: number }

export interface SpendEntry { p: PlayerId; what: string; t: number }
export interface Ping { p: PlayerId; x: number; y: number; kind: number; t: number }
export interface Preview { kind: StructId; cells: [number, number][] }

export interface GameResult { won: boolean; wave: number; keepMinFrac: number; stars: number; kills: number; dmgBy: Record<string, number> }

export interface GameState {
  v: number;
  mapId: string; diff: Difficulty; seed: number; rngState: number;
  tick: number; time: number; phase: 'play' | 'won' | 'lost';
  res: Res; spent: SpendEntry[];
  talents: TalentId[]; unlocks: string[]; research: SmithyId[];
  structs: Structure[]; units: Unit[]; squads: Squad[]; formations: Formation[]; shells: Shell[]; groups: Group[];
  nextId: number; sRev: number;
  wave: number; waveCount: number; nextWaveAt: number; plans: WavePlan[];
  spawnQ: { at: number; type: import('./data/enemies').EnemyId; lane: number; group: number; formation: number; idx: number }[];
  memory: Memory; bonusBudget: number;
  keepId: number; keepMinFrac: number;
  kills: number; dmgBy: Record<string, number>;
  hunger: boolean; night: number; rain: boolean;
  /** special conditions of the current wave */
  special: 'night' | 'rain' | null;
  events: GameEvent[]; pings: Ping[]; previews: [Preview | null, Preview | null];
  result: GameResult | null;
  /** debug: total waves override (tests, ?debugWaves) */
  debugWaves?: number;
}

export type GameEvent =
  | { k: 'shot'; s: ShellKind; x: number; y: number; z: number; tx: number; ty: number; tz: number; t: number }
  | { k: 'boom'; x: number; y: number; r: number; fire?: boolean }
  | { k: 'hit'; x: number; y: number; z: number; d: number }
  | { k: 'die'; x: number; y: number; side: Side }
  | { k: 'wave'; n: number; boss: boolean; special: 'night' | 'rain' | null }
  | { k: 'toast'; text: string; warn?: boolean }
  | { k: 'built'; id: number } | { k: 'destroyed'; id: number; x: number; y: number }
  | { k: 'trap'; id: number; x: number; y: number }
  | { k: 'gate'; id: number; open: boolean }
  | { k: 'ping'; p: PlayerId; x: number; y: number; kind: number }
  | { k: 'heal'; x: number; y: number };

// ---------- network ----------
export interface UnitSnap {
  id: number; type: UnitType; side: Side; owner: PlayerId | null;
  x: number; y: number; z: number; hp: number; maxHp: number; facing: number;
  anim: 0 | 1 | 2 | 3; squad: number;
  burning: boolean; slowed: boolean; stunned: boolean; shielded: boolean;
}
export interface StructSnap {
  id: number; kind: StructId; cx: number; cy: number; w: number; h: number; level: number;
  hp: number; maxHp: number; owner: PlayerId; build: number; state: number; burning: number; pitch: number;
  /** trap used up (open pit, burnt ditch, rolled logs) */
  spent?: boolean;
}
export interface QueueSnap { id: number; jobs: [TroopId, PlayerId, number][]; research: [SmithyId, number] | null; rally: [number, number] | null; dry: boolean }
export interface SquadSnap { id: number; owner: PlayerId; type: TroopId; n: number; hp: number; order: OrderKind; stars: number }
export interface ShellSnap { id: number; kind: ShellKind; x: number; y: number; z: number; tx: number; ty: number; tz: number; t: number; total: number }
export interface WaveInfo { wave: number; in: number; lane: number; boss: boolean; special: 'night' | 'rain' | null; icons: string[]; scout: string[] }

export interface Snapshot {
  tick: number; time: number; phase: GameState['phase']; wave: number; waveCount: number; nextWaveIn: number;
  timeline: WaveInfo[]; res: Res; rate: Res; cap: [number, number]; army: [number, number];
  units: UnitSnap[]; sRev: number; structs?: StructSnap[]; sHp: [number, number, number, number, number][];
  squads: SquadSnap[]; queues: QueueSnap[]; shells: ShellSnap[]; events: GameEvent[];
  previews: [Preview | null, Preview | null]; paused: boolean; night: number; rain: boolean; hunger: boolean;
  research: SmithyId[]; spent: SpendEntry[]; formations: [number, number, number][];
  result: GameResult | null; boss: [number, number] | null; mapId: string; diff: Difficulty; lanesOpen: number[];
}
export type WireSnapshot = Omit<Snapshot, 'units'> & { u: string };

export type Command =
  | { c: 'build'; kind: StructId; cells: [number, number][] }
  | { c: 'upgrade' | 'repair' | 'sell' | 'trigger' | 'reset'; id: number }
  | { c: 'train'; building: number; troop: TroopId }
  | { c: 'research'; building: number; what: SmithyId }
  | { c: 'cancel'; building: number }
  | { c: 'rally'; building: number; x: number; y: number }
  | { c: 'order'; squads: number[]; x: number; y: number; target?: number; structure?: number; stance?: OrderKind }
  | { c: 'disband'; squad: number }
  | { c: 'callWave' }
  | { c: 'ping'; x: number; y: number; kind: number }
  | { c: 'preview'; kind: StructId | null; cells: [number, number][] };

export type ClientMsg =
  | { t: 'create'; mapId: string; diff: Difficulty; talents: TalentId[]; unlocks: string[]; save?: string; debugWaves?: number }
  | { t: 'join'; code: string; token?: string }
  | { t: 'cmd'; cmd: Command }
  | { t: 'vis'; hidden: boolean };
export type ServerMsg =
  | { t: 'joined'; code: string; you: PlayerId; token: string; mapId: string; v: number }
  | { t: 'peer'; connected: boolean }
  | { t: 'snap'; s: WireSnapshot }
  | { t: 'save'; data: string; wave: number; mapId: string }
  | { t: 'error'; reason: string };

export const PROTOCOL_VERSION = 1;
export const SAVE_VERSION = 1;
