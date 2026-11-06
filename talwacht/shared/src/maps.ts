/**
 * Hand-made valley maps. Sim coordinates: x left→right, y front (enemy side, y = 0) → back (keep).
 * A valley is described by a winding centre line with a varying half-width; side basins widen it,
 * rock crags stand inside it as natural obstacles. terrain.ts roughens all borders so nothing looks geometric.
 * Attacks only ever come from the front (y = 0).
 */
export type MapTheme = 'green' | 'gorge' | 'river' | 'snow';
export type LaneId = 0 | 1 | 2;

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  theme: MapTheme;
  w: number; d: number; seed: number;
  /** valley floor borders sampled along y (derived from the centre line) */
  edges: { y: number; left: number; right: number }[];
  /** extra floor: circular side basins [x, y, r] */
  basins: [number, number, number][];
  /** rock outcrops inside the valley [x, y, r, height] */
  crags: [number, number, number, number][];
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

type Spine = [number, number, number][]; // [y, centre x, half-width]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function at(sp: Spine, y: number): [number, number] {
  let i = 0;
  while (i < sp.length - 2 && sp[i + 1][0] < y) i++;
  const [y0, x0, w0] = sp[i], [y1, x1, w1] = sp[i + 1];
  const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  const s = t * t * (3 - 2 * t);
  return [lerp(x0, x1, s), lerp(w0, w1, s)];
}
const edgesOf = (sp: Spine) => sp.map(([y, x, w]) => ({ y, left: x - w, right: x + w }));
/** a lane following the centre line at a side offset (fraction of the half-width) that fades out by `mergeY` */
function lane(sp: Spine, off: number, mergeY: number, endY: number, step = 60): [number, number][] {
  const pts: [number, number][] = [];
  for (let y = 0; y <= endY; y += step) {
    const [x, w] = at(sp, y), k = Math.max(0, 1 - y / mergeY);
    pts.push([Math.round(x + off * w * k), y]);
  }
  return pts;
}

// ---------- Grüntal: a meandering meadow valley with side basins ----------
const G: Spine = [[0, 360, 290], [120, 380, 250], [250, 330, 200], [380, 400, 175], [500, 330, 210], [620, 380, 165], [740, 350, 150], [860, 360, 140], [960, 360, 130]];
// ---------- Klamm: a long winding gorge opening into a basin at the back ----------
const KL: Spine = [[0, 270, 210], [140, 290, 140], [240, 240, 80], [340, 310, 64], [440, 230, 70], [540, 290, 80], [640, 270, 150], [760, 270, 190], [900, 270, 140]];
// ---------- Flusstal: broad river valley ----------
const FL: Spine = [[0, 390, 330], [180, 400, 300], [340, 380, 260], [480, 410, 220], [620, 380, 190], [760, 390, 160], [900, 390, 150]];
// ---------- Winterpass: terraces up to a narrow pass, then a high basin ----------
const WP: Spine = [[0, 330, 280], [160, 320, 220], [300, 350, 180], [420, 330, 95], [500, 320, 90], [600, 340, 170], [740, 320, 175], [900, 330, 140]];

export const MAPS: Record<string, MapDef> = {
  gruental: {
    id: 'gruental', name: 'Grüntal', blurb: 'Ein grünes Wiesental mit Bach, Kurven und Seitenkesseln – der Einstieg.', theme: 'green',
    w: 720, d: 940, seed: 11, edges: edgesOf(G),
    basins: [[140, 470, 95], [600, 300, 85], [560, 690, 70]],
    crags: [[250, 350, 26, 22], [470, 560, 22, 18], [250, 640, 18, 16]],
    backY: 910, keep: { x: 360, y: 875 },
    lanes: [
      { id: 0, opensAt: 1, pts: lane(G, 0, 1, 860) },
      { id: 1, opensAt: 6, pts: lane(G, -0.55, 700, 760) },
      { id: 2, opensAt: 10, pts: lane(G, 0.55, 700, 760) },
    ],
    creek: [[470, 940], [440, 800], [470, 690], [420, 560], [500, 420], [470, 280], [560, 140], [600, 0]], creekWidth: 7,
    forests: [[130, 470, 55], [610, 290, 45], [300, 160, 40], [560, 700, 35], [240, 760, 30]],
    rocks: [[255, 360, 34], [475, 565, 30], [420, 830, 18]],
    meadows: [[380, 470, 70], [330, 260, 60], [420, 650, 50], [180, 120, 60]],
    hills: [[200, 560, 60, 7], [520, 200, 70, 6], [300, 700, 40, 4]],
  },
  klamm: {
    id: 'klamm', name: 'Klamm', blurb: 'Lange gewundene Schlucht mit Bachbrücke, hinten ein weiter Kessel. Fallen und Steinlawinen lohnen sich.', theme: 'gorge',
    w: 560, d: 940, seed: 23, edges: edgesOf(KL),
    basins: [[140, 760, 90], [400, 720, 80]],
    crags: [[300, 110, 22, 20], [210, 700, 20, 16]],
    backY: 910, keep: { x: 270, y: 875 },
    lanes: [
      { id: 0, opensAt: 1, pts: lane(KL, 0, 1, 860) },
      { id: 1, opensAt: 6, pts: lane(KL, -0.6, 230, 260) },
    ],
    creek: [[150, 330], [240, 360], [330, 370], [400, 350]], creekWidth: 7,
    forests: [[110, 760, 50], [420, 720, 40], [270, 40, 50]],
    rocks: [[300, 120, 30], [230, 450, 20], [330, 540, 18], [210, 705, 26]],
    meadows: [[280, 770, 80], [150, 30, 50]],
    hills: [[330, 800, 40, 4]],
  },
  flusstal: {
    id: 'flusstal', name: 'Flusstal', blurb: 'Ein breites Tal, ein Fluss quert es – Brücken und Furten sind die Schlüsselstellen.', theme: 'river',
    w: 780, d: 920, seed: 37, edges: edgesOf(FL),
    basins: [[110, 600, 90], [680, 560, 80]],
    crags: [[250, 520, 24, 20], [560, 640, 22, 18]],
    backY: 890, keep: { x: 390, y: 855 },
    lanes: [
      { id: 0, opensAt: 1, pts: lane(FL, 0, 1, 840) },
      { id: 1, opensAt: 6, pts: lane(FL, -0.6, 640, 700) },
      { id: 2, opensAt: 10, pts: lane(FL, 0.6, 640, 700) },
    ],
    creek: [[0, 300], [160, 330], [300, 300], [420, 340], [560, 310], [700, 350], [780, 330]], creekWidth: 16,
    forests: [[110, 600, 60], [680, 560, 55], [200, 150, 60], [620, 120, 55]],
    rocks: [[250, 525, 30], [560, 645, 26]],
    meadows: [[400, 470, 90], [300, 680, 60], [500, 160, 80]],
    hills: [[520, 470, 60, 6], [260, 720, 50, 5]],
  },
  winterpass: {
    id: 'winterpass', name: 'Winterpass', blurb: 'Verschneite Terrassen bis zu einem engen Pass – Baumstamm-Fallen rollen hier weit.', theme: 'snow',
    w: 660, d: 940, seed: 53, edges: edgesOf(WP),
    basins: [[160, 230, 80], [500, 680, 75]],
    crags: [[230, 120, 26, 24], [450, 270, 24, 22], [260, 650, 20, 18]],
    backY: 910, keep: { x: 330, y: 875 },
    lanes: [
      { id: 0, opensAt: 1, pts: lane(WP, 0, 1, 860) },
      { id: 1, opensAt: 6, pts: lane(WP, -0.55, 380, 400) },
      { id: 2, opensAt: 10, pts: lane(WP, 0.55, 380, 400) },
    ],
    creek: [[340, 940], [380, 800], [340, 700]], creekWidth: 6,
    forests: [[150, 230, 50], [500, 680, 45], [330, 60, 40]],
    rocks: [[235, 125, 34], [455, 275, 30], [330, 460, 16]],
    meadows: [[330, 760, 60]],
    hills: [[230, 330, 70, 16], [450, 160, 60, 14], [340, 560, 50, 10]],
  },
};

export const DEFAULT_MAP = 'gruental';
export const MAP_ORDER = ['gruental', 'klamm', 'flusstal', 'winterpass'];
