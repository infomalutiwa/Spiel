import type { MapDef } from '../types';

export const MAPS: Record<string, MapDef> = {
  meadow: {
    id: 'meadow', name: 'Sonnenwiese',
    width: 150, depth: 90,
    castle: { x: 16, y: 45 },
    spawnX: 142,
    lanes: [24, 45, 66],
    placeZone: { x0: 26, x1: 70, y0: 8, y1: 82 },
    decorSeed: 7,
  },
};
export const DEFAULT_MAP = 'meadow';
