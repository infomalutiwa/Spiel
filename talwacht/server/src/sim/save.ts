import { MAPS, SAVE_VERSION, type GameState } from '@talwacht/shared';

export const MAX_SAVE = 1_500_000;

export function serialize(s: GameState): string {
  return JSON.stringify({ ...s, events: [] });
}

export function deserialize(str: string): GameState | { error: string } {
  if (typeof str !== 'string') return { error: 'save_invalid' };
  if (str.length > MAX_SAVE) return { error: 'save_too_big' };
  let o: GameState;
  try { o = JSON.parse(str); } catch { return { error: 'save_invalid' }; }
  if (!o || typeof o !== 'object') return { error: 'save_invalid' };
  if (o.v !== SAVE_VERSION) return { error: o.v === undefined ? 'save_invalid' : 'save_version' };
  const arrays = ['structs', 'units', 'squads', 'formations', 'shells', 'groups', 'plans', 'spawnQ'] as const;
  if (!MAPS[o.mapId] || arrays.some(k => !Array.isArray(o[k])) || !o.res || typeof o.time !== 'number') return { error: 'save_invalid' };
  if (!o.structs.some(st => st.id === o.keepId)) return { error: 'save_invalid' };
  o.events = [];
  o.previews = [null, null];
  return o;
}
