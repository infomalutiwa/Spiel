/**
 * Hand-made valley maps. Sim coordinates: x left→right, y front (enemy side, y = 0) → back (keep).
 * `edges` are the valley-floor borders at a few depths; terrain.ts smooths and roughens them so the
 * funnel never looks geometric. Everything outside the floor rises into cliffs and wooded ridges.
 */
export type MapTheme = 'green' | 'gorge' | 'river' | 'snow';
export type LaneId = 0 | 1 | 2;

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  theme: MapTheme;
  w: number; d: number; seed: number;
  edges: { y: number; left: number; right: number }[];
  backY: number;
  keep: { x: number; y: number };
  lanes: { id: LaneId; opensAt: number; pts: [number, number][] }[];
  creek?: [number, number][];
  creekWidth?: number;
  forests: [number, number, number][];
  rocks: [number, number, number][];
  meadows: [number, number, number][];
  hills: [number, number, number, number][];
}

export const MAPS: Record<string, MapDef> = {
  gruental: {
    id: 'gruental', name: 'Grüntal', blurb: 'Breites Wiesental mit Bach – der gemütliche Einstieg.', theme: 'green',
    w: 500, d: 600, seed: 11,
    edges: [
      { y: 0, left: 28, right: 472 }, { y: 140, left: 62, right: 440 }, { y: 290, left: 118, right: 392 },
      { y: 410, left: 160, right: 345 }, { y: 510, left: 196, right: 312 }, { y: 600, left: 214, right: 296 },
    ],
    backY: 574, keep: { x: 254, y: 546 },
    lanes: [
      { id: 0, opensAt: 1, pts: [[250, 0], [244, 140], [258, 290], [250, 430], [254, 522]] },
      { id: 1, opensAt: 6, pts: [[88, 0], [112, 120], [166, 250], [222, 380], [248, 440]] },
      { id: 2, opensAt: 10, pts: [[420, 0], [402, 130], [344, 270], [280, 400], [254, 440]] },
    ],
    creek: [[300, 600], [294, 500], [318, 400], [356, 280], [384, 150], [404, 0]], creekWidth: 6,
    forests: [[150, 330, 34], [360, 190, 30], [186, 470, 18], [96, 90, 26], [410, 330, 18]],
    rocks: [[322, 452, 14], [126, 206, 16], [232, 400, 9], [190, 540, 12]],
    meadows: [[290, 350, 40], [206, 250, 36], [300, 470, 24]],
    hills: [[150, 330, 30, 5], [380, 300, 26, 4]],
  },
  klamm: {
    id: 'klamm', name: 'Klamm', blurb: 'Enge Schlucht mit Bachbrücke. Fallen und Steinlawinen lohnen sich.', theme: 'gorge',
    w: 380, d: 600, seed: 23,
    edges: [
      { y: 0, left: 36, right: 344 }, { y: 150, left: 74, right: 304 }, { y: 290, left: 118, right: 262 },
      { y: 370, left: 124, right: 254 }, { y: 460, left: 98, right: 282 }, { y: 600, left: 128, right: 252 },
    ],
    backY: 578, keep: { x: 190, y: 548 },
    lanes: [
      { id: 0, opensAt: 1, pts: [[190, 0], [184, 150], [190, 300], [188, 440], [190, 524]] },
      { id: 1, opensAt: 6, pts: [[80, 0], [104, 120], [150, 240], [184, 330]] },
    ],
    creek: [[100, 238], [180, 246], [270, 252]], creekWidth: 6,
    forests: [[80, 60, 22], [290, 90, 20], [130, 480, 18]],
    rocks: [[150, 330, 12], [240, 420, 14], [110, 170, 12], [260, 520, 10]],
    meadows: [[220, 470, 28], [160, 420, 20]],
    hills: [[240, 470, 22, 4]],
  },
  flusstal: {
    id: 'flusstal', name: 'Flusstal', blurb: 'Ein Fluss quert das Tal – Brücken sind die Schlüsselstellen.', theme: 'river',
    w: 520, d: 600, seed: 37,
    edges: [
      { y: 0, left: 30, right: 490 }, { y: 160, left: 70, right: 452 }, { y: 300, left: 128, right: 400 },
      { y: 420, left: 172, right: 352 }, { y: 520, left: 204, right: 318 }, { y: 600, left: 220, right: 300 },
    ],
    backY: 576, keep: { x: 260, y: 548 },
    lanes: [
      { id: 0, opensAt: 1, pts: [[262, 0], [258, 150], [262, 300], [258, 440], [260, 524]] },
      { id: 1, opensAt: 6, pts: [[90, 0], [120, 140], [180, 280], [236, 400], [256, 444]] },
      { id: 2, opensAt: 10, pts: [[440, 0], [420, 140], [350, 280], [286, 400], [262, 444]] },
    ],
    creek: [[20, 196], [150, 226], [262, 214], [380, 236], [500, 208]], creekWidth: 14,
    forests: [[120, 330, 30], [400, 330, 26], [210, 480, 18], [440, 110, 28]],
    rocks: [[330, 470, 14], [150, 110, 16], [300, 380, 9]],
    meadows: [[300, 300, 40], [200, 360, 30], [90, 60, 30]],
    hills: [[330, 300, 30, 5]],
  },
  winterpass: {
    id: 'winterpass', name: 'Winterpass', blurb: 'Verschneiter Pass mit Hängen – Baumstamm-Fallen rollen hier weit.', theme: 'snow',
    w: 460, d: 600, seed: 53,
    edges: [
      { y: 0, left: 30, right: 430 }, { y: 150, left: 66, right: 396 }, { y: 300, left: 112, right: 352 },
      { y: 420, left: 150, right: 316 }, { y: 520, left: 180, right: 288 }, { y: 600, left: 196, right: 272 },
    ],
    backY: 574, keep: { x: 232, y: 546 },
    lanes: [
      { id: 0, opensAt: 1, pts: [[230, 0], [226, 150], [234, 300], [230, 440], [232, 522]] },
      { id: 1, opensAt: 6, pts: [[86, 0], [110, 130], [160, 250], [210, 390], [228, 440]] },
      { id: 2, opensAt: 10, pts: [[380, 0], [362, 140], [310, 270], [252, 400], [234, 440]] },
    ],
    creek: [[244, 600], [262, 480], [244, 380]], creekWidth: 5,
    forests: [[130, 300, 26], [340, 200, 30], [180, 470, 16], [380, 60, 24]],
    rocks: [[300, 430, 14], [110, 180, 14], [200, 540, 10]],
    meadows: [[290, 470, 22]],
    hills: [[164, 262, 46, 14], [320, 330, 40, 12]],
  },
};

export const DEFAULT_MAP = 'gruental';
export const MAP_ORDER = ['gruental', 'klamm', 'flusstal', 'winterpass'];
