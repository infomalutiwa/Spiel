import type { WaveDef } from '../types';

export const WAVES: WaveDef[] = [
  { name: 'Erste Besucher', groups: [{ type: 'footman', count: 6, lane: 1 }] },
  { name: 'Doppelter Besuch', groups: [
    { type: 'footman', count: 6, lane: 0 }, { type: 'footman', count: 6, lane: 2 }] },
  { name: 'Pfeilregen', groups: [
    { type: 'footman', count: 6, lane: 1 }, { type: 'raider_archer', count: 6, lane: 1, delay: 3 }] },
  { name: 'Hufgetrappel', groups: [
    { type: 'raider_rider', count: 5, lane: 0 }, { type: 'footman', count: 8, lane: 2 }] },
  { name: 'Der Rammbock', groups: [
    { type: 'ram', count: 2, lane: 1 }, { type: 'footman', count: 8, lane: 1, delay: 2 },
    { type: 'raider_archer', count: 5, lane: 2, delay: 4 }] },
  { name: 'Schamanenzirkel', groups: [
    { type: 'shaman', count: 2, lane: 1 }, { type: 'footman', count: 10, lane: 1, delay: 1 },
    { type: 'raider_rider', count: 5, lane: 0, delay: 4 }, { type: 'raider_archer', count: 6, lane: 2, delay: 3 }] },
  { name: 'Belagerung', groups: [
    { type: 'raider_catapult', count: 2, lane: 1 }, { type: 'ram', count: 2, lane: 0, delay: 2 },
    { type: 'footman', count: 12, lane: 2, delay: 3 }, { type: 'shaman', count: 1, lane: 1, delay: 5 }] },
  { name: 'Dreiseitiger Sturm', groups: [
    { type: 'footman', count: 10, lane: 0 }, { type: 'raider_rider', count: 6, lane: 1, delay: 2 },
    { type: 'raider_archer', count: 8, lane: 2, delay: 1 }, { type: 'ram', count: 2, lane: 2, delay: 4 }] },
  { name: 'Eiserne Faust', groups: [
    { type: 'brute', count: 2, lane: 1 }, { type: 'footman', count: 12, lane: 0, delay: 3 },
    { type: 'shaman', count: 2, lane: 2, delay: 3 }, { type: 'raider_catapult', count: 2, lane: 1, delay: 6 }] },
  { name: 'Der große Sturm', groups: [
    { type: 'brute', count: 3, lane: 1 }, { type: 'raider_rider', count: 8, lane: 0, delay: 3 },
    { type: 'ram', count: 3, lane: 2, delay: 2 }, { type: 'footman', count: 16, lane: 1, delay: 4 },
    { type: 'shaman', count: 3, lane: 1, delay: 6 }, { type: 'raider_archer', count: 10, lane: 2, delay: 5 }] },
];

/** gold both players receive after clearing wave index w */
export const waveReward = (w: number) => 160 + w * 32;
export const START_GOLD = 360;
export const PREP_TIME = 40;
