export type PlayerId = 0 | 1;
export type Side = 'player' | 'enemy';
export type ArmorKind = 'light' | 'heavy' | 'mounted' | 'siege' | 'structure';
export type DamageKind = 'slash' | 'pierce' | 'spear' | 'charge' | 'bolt' | 'magic' | 'siege' | 'boulder';
export type TroopType =
  | 'knight' | 'archer' | 'spearman' | 'cavalry'
  | 'crossbowman' | 'mage' | 'healer' | 'catapult';
export type EnemyType =
  | 'footman' | 'raider_archer' | 'raider_rider' | 'ram'
  | 'raider_catapult' | 'shaman' | 'brute' | 'ironguard' | 'warlord';
export type StructureType = 'wall' | 'gate' | 'tower';
export type UnitType = TroopType | EnemyType | StructureType | 'castle';
export type Special = 'heal' | 'aoe' | 'buff';
/** what a unit is good at; the AI in combat.ts picks targets and positions by role (see data/troops.ts) */
export type Role = 'tank' | 'melee' | 'skirmisher' | 'archer' | 'caster' | 'healer' | 'cavalry' | 'artillery' | 'support' | 'siege';
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
  role?: Role;
  /** ranged units shuffle away from melee enemies closer than this (edge distance); artillery cannot fire at anything closer */
  minRange?: number;
  /** tanks: melee enemies within this distance (edge) of the unit prefer to hit it */
  taunt?: number;
  /** artillery: stone per shot */
  stone?: number;
  /** artillery: projectile speed (units per second) */
  shellSpeed?: number;
  /** artillery: fraction of the damage left at the edge of the blast */
  edge?: number;
}

/** `assault`: no point to aim at – the unit keeps attacking the nearest enemy front until none is left */
export type OrderKind = 'idle' | 'move' | 'attackMove' | 'hold' | 'retreat' | 'assault';
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
  /** player troops: id of the squad they belong to (0 = none) */
  squad: number;
  /** structures: index into MapDef.walls (-1 for everything else) */
  slot: number;
  /** ranged defenders standing on a wall: id of the structure under their feet (0 = on the ground) */
  deck: number;
  /** enemies: how far along the route (gate, zone, gate, zone, keep) they are */
  step: number;
  /** player troops: chosen upgrade branch (0 none, 1 / 2 = TECH entry) */
  branch: number;
  /** seconds of burning / slowness left; fire does `burnDps` per second */
  burn: number; burnDps: number; slow: number;
  /** velocity of the last tick (artillery leads moving targets) */
  vx: number; vy: number;
  /** who set the unit on fire (credit for kills): player id, or -1 */
  burnBy: number;
  /** position of the previous tick */
  px: number; py: number;
  /** general purpose timer (healer revive cooldown, dry-fire warning …) */
  t2: number;
}

/** a projectile in flight (catapult stones); lands at (tx, ty) when `t` runs out */
export interface Shell {
  id: number;
  side: Side;
  owner: PlayerId | null;
  /** copy of the shooter at launch time (level, branch, buff decide the damage) */
  src: Unit;
  x: number; y: number; tx: number; ty: number;
  t: number; total: number;
  fire: boolean;
}

export type Phase = 'prep' | 'battle' | 'won' | 'lost';

/** a squad (or a few replacements for one) being trained in the barracks */
export interface TrainItem {
  troop: TroopType;
  /** soldiers to produce */
  count: number;
  /** 0 = brand-new squad, otherwise the squad to reinforce */
  squad: number;
  /** where the soldiers march to after leaving the barracks */
  x: number; y: number;
  /** seconds of training left / in total */
  t: number; total: number;
}

export interface PlayerState {
  gold: number;
  /** catapult ammunition, see STONE_PER_SHOT */
  stone: number;
  /** rare currency for troop upgrades and high barracks levels */
  gems: number;
  /** barracks level (1..MAX_BARRACKS): army capacity and training speed */
  barracks: number;
  /** per troop type: upgrade level (1..3) and chosen branch (0 none) */
  tech: Record<TroopType, { level: number; branch: number }>;
  ready: boolean;
  abilityCd: Record<AbilityId, number>;
  /** barracks training queue; the first entry is being trained */
  queue: TrainItem[];
}

export interface SpawnItem { at: number; type: EnemyType; lane: number }

export type GameEvent =
  | { k: 'shot'; from: number; to: number; x: number; y: number; tx: number; ty: number; kind: DamageKind; /** fire arrows */ fire?: boolean }
  | { k: 'dmg'; x: number; y: number; amt: number }
  | { k: 'heal'; x: number; y: number; amt: number }
  | { k: 'aoe'; x: number; y: number; r: number; kind: 'magic' | 'arrows' | 'rally' | 'siege' | 'frost' | 'fire' }
  /** a shell is in the air: from (x,y) to (tx,ty), lands after `t` seconds */
  | { k: 'lob'; x: number; y: number; tx: number; ty: number; t: number; fire: boolean }
  /** a catapult wants to fire but its owner has no stone */
  | { k: 'dry'; owner: number; x: number; y: number }
  | { k: 'revive'; x: number; y: number }
  | { k: 'death'; x: number; y: number; type: UnitType }
  | { k: 'level'; x: number; y: number }
  | { k: 'wave'; wave: number }
  | { k: 'phase'; phase: Phase }
  | { k: 'zone'; id: number; owner: 'player' | 'enemy' }
  | { k: 'breach'; slot: number; type: StructureType };

/** `reached`: the enemy has taken this zone at some point this wave, so the next one opens up even if defenders win it back */
export interface ZoneState { owner: 'player' | 'enemy'; progress: number; reached: boolean; /** seconds the attackers still pause here after the zone fell */ hold: number }
/** a bought group of troops that is placed and ordered together */
export interface SquadInfo { id: number; troop: TroopType; owner: PlayerId; x: number; y: number }

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
  shells: Shell[];
  zones: ZoneState[];
  squads: SquadInfo[];
  battleTime: number;
  /** battleTime of the most recent enemy spawn */
  lastSpawn: number;
  events: GameEvent[];
}

export type Command =
  /** buys a whole squad (see SQUAD_SIZE) centred on (x, y); in battle it is queued in the barracks and marches to (x, y) */
  | { c: 'buy'; troop: TroopType; x: number; y: number }
  /** replaces fallen members of a squad for gold (in battle they are trained first and arrive from the barracks) */
  | { c: 'refill'; squad: number }
  /** walls, gates and towers: upgrade a level, repair (also in battle) or rebuild a destroyed one (preparation only) */
  /** buys `lots` lots of stone for gold */
  | { c: 'trade'; lots: number }
  /** upgrades a troop type of the player (level 1→2 needs a branch 1 | 2, level 2→3 deepens it) */
  | { c: 'tech'; troop: TroopType; branch?: number }
  /** upgrades the player's barracks */
  | { c: 'barracks' }
  | { c: 'wall'; op: 'upgrade' | 'repair' | 'rebuild'; slot: number }
  | { c: 'place'; ids: number[]; x: number; y: number }
  | { c: 'move'; ids: number[]; x: number; y: number; formation?: Formation }
  /** without x / y: attack the nearest enemy front, no target needed; with them: attack-move to that point */
  | { c: 'attack'; ids: number[]; x?: number; y?: number; targetId?: number; formation?: Formation }
  | { c: 'hold'; ids: number[] }
  | { c: 'retreat'; ids: number[] }
  | { c: 'ability'; id: AbilityId; x: number; y: number }
  | { c: 'ready'; ready: boolean };

export type MapTheme = 'meadow' | 'forest' | 'valley';

export interface Rect { x0: number; x1: number; y0: number; y1: number }
/** one wall segment, gate or tower; walls run north–south, the enemy comes from the east */
export interface WallDef { kind: StructureType; x: number; y: number; bar: number }
/** the enemy needs a gate (or a breach) to pass a barrier; barrier 0 is the outermost */
export interface Barrier { x: number; gateY: number }
/** capture point: enemies must hold it to advance; zone 0 is the first one they reach */
export interface ZoneDef { id: number; name: string; x: number; y: number; r: number }

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  width: number;
  depth: number;
  /** the keep (king) in the far west */
  castle: Vec2;
  /** where enemy waves enter; a wave group's `lane` indexes this list */
  spawns: Vec2[];
  barriers: Barrier[];
  walls: WallDef[];
  zones: ZoneDef[];
  /** where each player's barracks stands (new troops walk out of it) */
  barracks: [Vec2, Vec2];
  /** where the player may put troops (inside the walls, on top of them, and a bit outside the outer gate) */
  placeZone: Rect;
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
  | { t: 'cmd'; cmd: Command }
  /** the tab went to / came back from the background; the game waits while either player is away */
  | { t: 'vis'; hidden: boolean };

export interface UnitSnap {
  id: number; type: UnitType; side: Side; owner: PlayerId | null;
  x: number; y: number; hp: number; maxHp: number; facing: number; anim: number; level: number;
  /** squad id for player troops, 0 otherwise */
  squad: number;
  /** upgrade branch (0 none) and status effects */
  branch: number; burning: boolean; slowed: boolean;
}
export interface ZoneSnap { p: number; o: 0 | 1; /** seconds of siege pause left */ h: number }
export interface Snapshot {
  tick: number; time: number; phase: Phase; timer: number; wave: number; waveCount: number;
  players: [PlayerState, PlayerState];
  /** decoded unit list (on the wire: base64 in `u`, see codec.ts) */
  units: UnitSnap[];
  zones: ZoneSnap[];
  events: GameEvent[];
  paused: boolean;
}
/** the snapshot as sent over the wire */
export type WireSnapshot = Omit<Snapshot, 'units'> & { u: string };
/** bumped whenever the wire format changes; the client asks for a reload on mismatch */
export const PROTOCOL_VERSION = 2;
export type ServerMsg =
  | { t: 'joined'; code: string; you: PlayerId; token: string; mapId: string; v: number }
  | { t: 'error'; reason: string }
  | { t: 'snap'; s: WireSnapshot }
  | { t: 'peer'; connected: boolean };
