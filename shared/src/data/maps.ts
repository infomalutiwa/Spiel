import type { MapDef } from '../types';

export const MAPS: Record<string, MapDef> = {
  meadow: {
    id: 'meadow', name: 'Sonnenwiese', theme: 'meadow',
    blurb: 'Weite Wiesen, drei Wege von Osten. Der gemütliche Einstieg.',
    width: 240, depth: 150,
    castle: { x: 26, y: 75 },
    spawns: [{ x: 232, y: 30 }, { x: 232, y: 75 }, { x: 232, y: 120 }],
    placeZone: { x0: 44, x1: 118, y0: 14, y1: 136 },
    decorSeed: 7, waveScale: 2.9,
  },
  forest: {
    id: 'forest', name: 'Waldpass', theme: 'forest',
    blurb: 'Dichter Wald, Gegner aus Nordosten und Südosten – viel Platz für Hinterhalte.',
    width: 280, depth: 180,
    castle: { x: 30, y: 90 },
    spawns: [{ x: 270, y: 30 }, { x: 270, y: 150 }, { x: 215, y: 8 }, { x: 215, y: 172 }],
    placeZone: { x0: 48, x1: 130, y0: 20, y1: 160 },
    decorSeed: 21, waveScale: 3.1,
  },
  valley: {
    id: 'valley', name: 'Burg im Tal', theme: 'valley',
    blurb: 'Die Burg liegt mittendrin – Angriffe aus allen vier Himmelsrichtungen.',
    width: 260, depth: 200,
    castle: { x: 130, y: 100 },
    spawns: [{ x: 8, y: 100 }, { x: 252, y: 100 }, { x: 130, y: 8 }, { x: 130, y: 192 }],
    placeZone: { x0: 60, x1: 200, y0: 55, y1: 145 },
    decorSeed: 33, waveScale: 2.6,
  },
};
export const DEFAULT_MAP = 'meadow';
