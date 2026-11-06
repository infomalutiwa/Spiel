import { MAP_ORDER, MAX_TALENTS, TALENTS, unlockedBy, type Difficulty, type TalentId } from '@talwacht/shared';

/** progress between rounds, kept in this browser (export/import code to move it to another phone) */
export interface Meta { stars: Record<string, number>; talents: TalentId[]; diff: Difficulty; map: string }
const KEY = 'tw-meta-v1', SAVE = 'tw-save-v1';

export function loadMeta(): Meta {
  try { const m = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (m && typeof m === 'object') return { stars: m.stars ?? {}, talents: m.talents ?? [], diff: m.diff ?? 'normal', map: m.map ?? 'gruental' }; } catch { /* blocked */ }
  return { stars: {}, talents: [], diff: 'normal', map: 'gruental' };
}
export function saveMeta(m: Meta) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* blocked */ } }
export const totalStars = (m: Meta) => Object.values(m.stars).reduce((a, b) => a + b, 0);
export const unlocks = (m: Meta) => unlockedBy(totalStars(m));
export const mapUnlocked = (m: Meta, id: string) => id === MAP_ORDER[0] || unlocks(m).includes(id);
export const talentUnlocked = (m: Meta, id: TalentId) => (TALENTS.find(t => t.id === id)?.stars ?? 99) <= totalStars(m);

export function recordResult(m: Meta, mapId: string, diff: Difficulty, stars: number): string[] {
  const before = new Set(unlocks(m));
  const key = `${mapId}:${diff}`;
  m.stars[key] = Math.max(m.stars[key] ?? 0, stars);
  saveMeta(m);
  return unlocks(m).filter(u => !before.has(u));
}
export function toggleTalent(m: Meta, id: TalentId) {
  if (m.talents.includes(id)) m.talents = m.talents.filter(t => t !== id);
  else if (m.talents.length < MAX_TALENTS && talentUnlocked(m, id)) m.talents.push(id);
  saveMeta(m);
}
export const exportMeta = (m: Meta) => btoa(unescape(encodeURIComponent(JSON.stringify(m.stars))));
export function importMeta(m: Meta, code: string): boolean {
  try { const s = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (s && typeof s === 'object') { for (const [k, v] of Object.entries(s)) if (typeof v === 'number') m.stars[k] = Math.max(m.stars[k] ?? 0, Math.min(3, v)); saveMeta(m); return true; } } catch { /* bad code */ }
  return false;
}

export interface SavedRound { data: string; wave: number; mapId: string; at: number }
export function storeRound(r: SavedRound) { try { localStorage.setItem(SAVE, JSON.stringify(r)); } catch { /* full or blocked */ } }
export function loadRound(): SavedRound | null { try { return JSON.parse(localStorage.getItem(SAVE) ?? 'null'); } catch { return null; } }
export function clearRound() { try { localStorage.removeItem(SAVE); } catch { /* blocked */ } }
