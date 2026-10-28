import type { EnemyType, WaveDef, WaveGroup } from '../types';

const g = (type: EnemyType, count: number, lane: number, delay = 0): WaveGroup => ({ type, count, lane, delay });

/**
 * Seconds after the start of a wave at which the first man of a type leaves the spawn (before the wave's `spread`).
 * A wave is a column: scouts and riders first, then the foot, bowmen behind them, then the heavies, the shamans,
 * the siege train and the stragglers. This is what makes a wave arrive over 30–60 seconds instead of as one lump.
 */
export const COLUMN_OFFSET: Record<EnemyType, number> = {
  raider_rider: 0, footman: 7, raider_archer: 13, ironguard: 18, shaman: 22, brute: 24, ram: 29, raider_catapult: 33, warlord: 38,
};
/** how stretched the column is: early waves are compact, later ones stretch out to a minute */
export const waveSpread = (wave: number) => Math.min(1, 0.5 + wave * 0.06);

/** the 5th, 10th, 15th … wave bring a boss (see isBossWave in economy.ts) */
export const WAVES: WaveDef[] = [
  { name: 'Erste Besucher', groups: [g('footman', 5, 1)] },
  { name: 'Doppelter Besuch', groups: [g('footman', 5, 0), g('footman', 5, 2, 3)] },
  { name: 'Pfeilregen', groups: [g('footman', 5, 1), g('raider_archer', 5, 1)] },
  { name: 'Hufgetrappel', groups: [g('raider_rider', 4, 0), g('footman', 6, 2)] },
  { name: 'Boss: Der Rammbock', groups: [
    g('brute', 1, 1), g('ironguard', 3, 0), g('ram', 3, 1), g('footman', 8, 1), g('raider_archer', 5, 2)] },
  { name: 'Schamanenzirkel', groups: [
    g('shaman', 2, 1), g('footman', 9, 1), g('raider_rider', 4, 0), g('raider_archer', 6, 2)] },
  { name: 'Belagerung', groups: [
    g('ironguard', 4, 0), g('raider_catapult', 2, 1), g('ram', 2, 0), g('footman', 10, 2), g('shaman', 1, 1)] },
  { name: 'Dreiseitiger Sturm', groups: [
    g('footman', 9, 0), g('raider_rider', 5, 1), g('raider_archer', 8, 2), g('ram', 2, 2)] },
  { name: 'Eiserne Faust', groups: [
    g('ironguard', 6, 2), g('brute', 2, 1), g('footman', 10, 0), g('shaman', 2, 2), g('raider_catapult', 2, 1)] },
  { name: 'Boss: Kriegsherr Gorrak', groups: [
    g('warlord', 1, 1), g('ironguard', 6, 0), g('footman', 12, 1), g('raider_rider', 6, 2), g('shaman', 3, 1), g('ram', 3, 2)] },
  { name: 'Hinterhalt', groups: [
    g('raider_archer', 12, 0), g('raider_rider', 7, 2), g('footman', 10, 1), g('shaman', 2, 0)] },
  { name: 'Der lange Zug', groups: [
    g('footman', 16, 0), g('footman', 16, 2), g('ironguard', 6, 1), g('raider_catapult', 3, 1), g('shaman', 3, 0)] },
  { name: 'Reiterflut', groups: [
    g('raider_rider', 12, 0), g('raider_rider', 8, 2), g('raider_archer', 8, 1), g('brute', 3, 1)] },
  { name: 'Schildmauer', groups: [
    g('ironguard', 14, 1), g('shaman', 4, 1), g('raider_archer', 10, 2), g('ram', 4, 0)] },
  { name: 'Boss: Der Belagerungsfürst', groups: [
    g('warlord', 1, 1), g('raider_catapult', 4, 0), g('ram', 5, 2), g('brute', 4, 1), g('ironguard', 8, 1), g('shaman', 4, 1), g('raider_archer', 12, 2)] },
  { name: 'Feuer und Eisen', groups: [
    g('brute', 6, 1), g('footman', 20, 0), g('raider_catapult', 4, 2), g('shaman', 4, 1), g('raider_rider', 8, 2)] },
  { name: 'Die Wolfsmeute', groups: [
    g('raider_rider', 16, 0), g('raider_rider', 12, 2), g('footman', 16, 1), g('raider_archer', 12, 1)] },
  { name: 'Der Wall aus Stahl', groups: [
    g('ironguard', 18, 0), g('brute', 5, 1), g('ram', 5, 2), g('shaman', 5, 1), g('raider_archer', 14, 2)] },
  { name: 'Sturm aus allen Richtungen', groups: [
    g('footman', 22, 0), g('footman', 22, 2), g('raider_rider', 10, 1), g('raider_catapult', 5, 1), g('shaman', 5, 0), g('brute', 5, 1)] },
  { name: 'Boss: Die Eiserne Horde', groups: [
    g('warlord', 2, 1), g('brute', 8, 0), g('ironguard', 14, 2), g('footman', 20, 1), g('shaman', 6, 1), g('ram', 6, 0), g('raider_archer', 14, 2)] },
  { name: 'Aschenregen', groups: [
    g('raider_archer', 22, 0), g('raider_catapult', 7, 1), g('brute', 6, 2), g('raider_rider', 12, 1), g('shaman', 6, 0)] },
  { name: 'Marsch der Giganten', groups: [
    g('brute', 12, 1), g('ironguard', 16, 0), g('ram', 7, 2), g('shaman', 6, 1), g('footman', 20, 2)] },
  { name: 'Letzte Ruhe', groups: [
    g('footman', 26, 0), g('footman', 26, 2), g('raider_rider', 16, 1), g('raider_archer', 18, 1), g('raider_catapult', 7, 0), g('shaman', 7, 1)] },
  { name: 'Das letzte Aufgebot', groups: [
    g('brute', 10, 1), g('ironguard', 16, 0), g('raider_rider', 14, 2), g('raider_archer', 18, 1), g('raider_catapult', 6, 2), g('shaman', 7, 0), g('ram', 6, 1)] },
  { name: 'Boss: Der letzte Sturm', groups: [
    g('warlord', 3, 1), g('brute', 12, 0), g('ironguard', 18, 2), g('footman', 24, 1), g('raider_rider', 14, 2), g('ram', 8, 0),
    g('raider_catapult', 7, 1), g('shaman', 8, 1), g('raider_archer', 18, 0)] },
];

/** endless mode: after the last campaign wave the final waves repeat, ever bigger, and every 5th wave brings the boss column */
export function waveAt(i: number): WaveDef {
  if (i < WAVES.length) return WAVES[i];
  const over = i - WAVES.length + 1, base = WAVES[WAVES.length - 1 - (over % 5 === 0 ? 0 : 1 + (over % 4))];
  const k = 1 + 0.18 * over;
  return { name: `Endlos ${i + 1}: ${base.name}`, groups: base.groups.map(g => ({ ...g, count: g.type === 'warlord' ? g.count + Math.floor(over / 3) : Math.ceil(g.count * k) })) };
}

/** how many of a group actually come: the map's scale and the wave number stretch ordinary groups, bosses stay as written */
export const groupCount = (mapScale: number, wave: number, g: WaveGroup) =>
  g.type === 'warlord' ? g.count : Math.max(1, Math.round(g.count * mapScale * (0.8 + 0.045 * wave)));
