import {
  buildTerrain, cellOf, DIFFICULTY, FIRST_WAVE_AT, MAPS, DEFAULT_MAP, res, SAVE_VERSION, STRUCTURES,
  type Difficulty, type GameState, type PlayerId, type StructId, type Structure, type TalentId, type Terrain,
} from '@talwacht/shared';

const terrains = new Map<string, Terrain>();
export const terrainFor = (mapId: string) => {
  let t = terrains.get(mapId);
  if (!t) { t = buildTerrain(MAPS[mapId] ?? MAPS[DEFAULT_MAP]); terrains.set(mapId, t); }
  return t;
};
export const terrainOf = (s: GameState) => terrainFor(s.mapId);

/** deterministic random numbers that live in the save */
export function rand(s: GameState) {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function newStructure(s: GameState, kind: StructId, cx: number, cy: number, owner: PlayerId, built = false): Structure {
  const d = STRUCTURES[kind];
  let hp = d.hp[0];
  if ((kind === 'wall' || kind === 'gate') && s.talents.includes('walls')) hp *= 1.05;
  if (kind === 'keep' && s.talents.includes('keep')) hp *= 1.15;
  const st: Structure = {
    id: s.nextId++, kind, cx, cy, w: d.w, h: d.h, level: 1, hp: built ? hp : Math.max(1, hp * 0.15), maxHp: hp, owner,
    build: built ? 0 : d.build, buildTotal: d.build, burning: 0, cd: 0, state: 0, uses: d.trap?.uses ?? 0,
    pitch: 0, pitchCd: 0, queue: [], rally: null, research: null, mined: 0, dry: 0, fix: 0, paid: { ...d.cost },
  };
  s.structs.push(st);
  s.sRev++;
  return st;
}

/** occupancy grid (structure id per cell), rebuilt lazily when the structure revision changes */
const occCache = new WeakMap<GameState, { rev: number; occ: Int32Array }>();
export function occOf(s: GameState): Int32Array {
  const c = occCache.get(s);
  if (c && c.rev === s.sRev) return c.occ;
  const t = terrainOf(s), occ = new Int32Array(t.cw * t.ch);
  for (const st of s.structs) for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) occ[(st.cy + y) * t.cw + st.cx + x] = st.id;
  occCache.set(s, { rev: s.sRev, occ });
  return occ;
}
const byIdCache = new WeakMap<GameState, { rev: number; n: number; map: Map<number, Structure> }>();
export function structById(s: GameState, id: number): Structure | undefined {
  let c = byIdCache.get(s);
  if (!c || c.rev !== s.sRev || c.n !== s.structs.length) { c = { rev: s.sRev, n: s.structs.length, map: new Map(s.structs.map(x => [x.id, x])) }; byIdCache.set(s, c); }
  return c.map.get(id);
}
export const structAtCell = (s: GameState, cx: number, cy: number) => {
  const t = terrainOf(s);
  if (cx < 0 || cy < 0 || cx >= t.cw || cy >= t.ch) return undefined;
  const id = occOf(s)[cy * t.cw + cx];
  return id ? structById(s, id) : undefined;
};

export function createGame(mapId: string, diff: Difficulty, seed: number, talents: TalentId[], unlocks: string[]): GameState {
  const map = MAPS[mapId] ?? MAPS[DEFAULT_MAP];
  const d = DIFFICULTY[diff];
  const s: GameState = {
    v: SAVE_VERSION, mapId: map.id, diff, seed, rngState: seed >>> 0, tick: 0, time: 0, phase: 'play',
    res: res(Math.round(400 * d.res), Math.round(200 * d.res), Math.round(150 * d.res), Math.round(300 * d.res)), spent: [],
    talents: talents.slice(0, 3), unlocks: [...unlocks], research: [],
    structs: [], units: [], squads: [], formations: [], shells: [], groups: [],
    nextId: 1, sRev: 0,
    wave: 0, waveCount: d.waves, nextWaveAt: FIRST_WAVE_AT, plans: [], spawnQ: [],
    memory: { wallRangedShare: 0, traps: 0, gateHp: 0, riders: 0, moat: 0, fire: 0 }, bonusBudget: 0,
    keepId: 0, keepMinFrac: 1, kills: 0, dmgBy: {},
    hunger: false, night: 0, rain: false, special: null, events: [], pings: [], previews: [null, null], result: null,
  };
  const k = cellOf(map.keep.x, map.keep.y);
  const keep = newStructure(s, 'keep', k.cx - 2, k.cy - 2, 0, true);
  s.keepId = keep.id;
  if (s.talents.includes('palisade')) {
    const t = terrainFor(map.id), y = k.cy - 9;
    for (let x = k.cx - 8; x <= k.cx + 8; x++) if (t.buildable(y * t.cw + x)) newStructure(s, 'wall', x, y, 0, true);
  }
  return s;
}
