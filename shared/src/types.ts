export type PlayerId = 0 | 1;
export type Side = 'player' | 'enemy';
export type ArmorKind = 'light' | 'heavy' | 'mounted' | 'siege' | 'structure';
export type DamageKind = 'slash' | 'pierce' | 'spear' | 'charge' | 'bolt' | 'magic' | 'siege';
export type TroopType =
  | 'knight' | 'archer' | 'spearman' | 'cavalry'
  | 'crossbowman' | 'mage' | 'healer' | 'catapult';
export type EnemyType =
  | 'footman' | 'raider_archer' | 'raider_rider' | 'ram'
  | 'raider_catapult' | 'shaman' | 'brute' | 'ironguard';
export type UnitType = TroopType | EnemyType | 'castle';
export type Special = 'heal' | 'aoe' | 'buff';
export type Formation = 'line' | 'wedge' | 'block';
export type AbilityId = 'arrowRain' | 'rally';

export interface Vec2 { x: number; y: number }

export interface UnitDef {
  name: string;
  hp: number;
  armor: ArmorKind;
  armorValue: number;
  damage: number;
  damageKind: DamageKind;
  range: number;
  speed: number;
  cost: number;
  morale: number;
  cooldown: number;
  radius: number;
  /** armor kinds this unit targets first when several are in range */
  prefers?: ArmorKind[];
  special?: Special;
  /** aoe / heal / buff radius */
  areaRadius?: number;
  /** heal amount per pulse, or buff damage bonus (0.25 = +25%) */
  power?: number;
  /** fraction of the target's armorValue ignored */
  armorPierce?: number;
}

export type OrderKind = 'idle' | 'move' | 'attackMove' | 'hold' | 'retreat';
export interface Order { kind: OrderKind; x: number; y: number; targetId?: number }

export interface Unit {
  id: number;
  side: Side;
  owner: PlayerId | null;
  type: UnitType;
  x: number; y: number;
  hp: number; maxHp: number;
  cd: number;
  order: Order;
  /** post to return to when guarding */
  postX: number; postY: number;
  targetId: number | null;
  level: number; xp: number;
  morale: number;
  routed: number;
  /** damage bonus from nearby shamans (0.3 = +30%) */
  buff: number;
  /** formation of the last move order (gives small combat bonuses, see combat.ts) */
  formation: Formation;
  /** distance run at speed since the last blow; cavalry turn it into a charge */
  charge: number;
  facing: number;
  /** 0 idle, 1 moving, 2 attacking */
  anim: 0 | 1 | 2;
  /** lane assigned to enemies (for pathing) */
  lane: number;
}

export type Phase = 'prep' | 'battle' | 'won' | 'lost';

export interface PlayerState {
  gold: number;
  ready: boolean;
  abilityCd: Record<AbilityId, number>;
}

export interface SpawnItem { at: number; type: EnemyType; lane: number }

export type GameEvent =
  | { k: 'shot'; from: number; to: number; x: number; y: number; tx: number; ty: number; kind: DamageKind }
  | { k: 'dmg'; x: number; y: number; amt: number }
  | { k: 'heal'; x: number; y: number; amt: number }
  | { k: 'aoe'; x: number; y: number; r: number; kind: 'magic' | 'arrows' | 'rally' | 'siege' }
  | { k: 'death'; x: number; y: number; type: UnitType }
  | { k: 'level'; x: number; y: number }
  | { k: 'wave'; wave: number }
  | { k: 'phase'; phase: Phase };

export interface GameState {
  mapId: string;
  tick: number;
  time: number;
  rng: number;
  nextId: number;
  phase: Phase;
  /** seconds left in prep, or battle clock */
  timer: number;
  /** index of the wave being fought / about to be fought (0-based) */
  wave: number;
  players: [PlayerState, PlayerState];
  units: Unit[];
  spawnQueue: SpawnItem[];
  battleTime: number;
  /** battleTime of the most recent enemy spawn */
  lastSpawn: number;
  events: GameEvent[];
}

export type Command =
  | { c: 'buy'; troop: TroopType; x: number; y: number }
  | { c: 'place'; ids: number[]; x: number; y: number }
  | { c: 'move'; ids: number[]; x: number; y: number; formation?: Formation }
  | { c: 'attack'; ids: number[]; x: number; y: number; targetId?: number; formation?: Formation }
  | { c: 'hold'; ids: number[] }
  | { c: 'retreat'; ids: number[] }
  | { c: 'ability'; id: AbilityId; x: number; y: number }
  | { c: 'ready'; ready: boolean };

export type MapTheme = 'meadow' | 'forest' | 'valley';

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  width: number;
  depth: number;
  castle: Vec2;
  /** where enemy waves enter; a wave group's `lane` indexes this list */
  spawns: Vec2[];
  placeZone: { x0: number; x1: number; y0: number; y1: number };
  theme: MapTheme;
  decorSeed: number;
  /** multiplier on enemy counts per wave */
  waveScale: number;
}

export interface WaveGroup { type: EnemyType; count: number; lane: number; delay?: number }
export interface WaveDef { name: string; groups: WaveGroup[] }

export type Result = { ok: true } | { ok: false; reason: string };

/* ---- network protocol ---- */
export type ClientMsg =
  | { t: 'create'; mapId?: string }
  | { t: 'join'; code: string; token?: string }
  | { t: 'cmd'; cmd: Command };

export interface UnitSnap {
  id: number; type: UnitType; side: Side; owner: PlayerId | null;
  x: number; y: number; hp: number; maxHp: number; facing: number; anim: number; level: number;
}
export interface Snapshot {
  tick: number; time: number; phase: Phase; timer: number; wave: number; waveCount: number;
  players: [PlayerState, PlayerState];
  /** decoded unit list (on the wire: base64 in `u`, see codec.ts) */
  units: UnitSnap[];
  events: GameEvent[];
  paused: boolean;
}
/** the snapshot as sent over the wire */
export type WireSnapshot = Omit<Snapshot, 'units'> & { u: string };
export type ServerMsg =
  | { t: 'joined'; code: string; you: PlayerId; token: string; mapId: string }
  | { t: 'error'; reason: string }
  | { t: 'snap'; s: WireSnapshot }
  | { t: 'peer'; connected: boolean };
