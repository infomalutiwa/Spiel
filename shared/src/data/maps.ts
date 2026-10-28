import type { Barrier, MapDef, WallDef, ZoneDef } from '../types';

/** wall circles are ~6 apart and overlap, so nothing slips between two pieces */
const GATE_FLANK = 7;
const SEG = 6.3;

/**
 * Builds one wall line at x = bar.x from the north edge to the south edge:
 * gate in the middle of its gap, a tower on each side of the gate, towers at both ends and wall pieces in between
 * (every `towerEvery`-th piece becomes a tower).
 */
function wallLine(bar: Barrier, index: number, depth: number, towerEvery = 0): WallDef[] {
  const out: WallDef[] = [{ kind: 'gate', x: bar.x, y: bar.gateY, bar: index }];
  for (const dir of [-1, 1]) {
    const from = bar.gateY + dir * GATE_FLANK, to = dir < 0 ? 2.5 : depth - 2.5;
    out.push({ kind: 'tower', x: bar.x, y: from, bar: index }, { kind: 'tower', x: bar.x, y: to, bar: index });
    const n = Math.max(1, Math.round(Math.abs(to - from) / SEG));
    for (let i = 1; i < n; i++)
      out.push({ kind: towerEvery && i % towerEvery === 0 ? 'tower' : 'wall', x: bar.x, y: from + ((to - from) * i) / n, bar: index });
  }
  return out.sort((a, b) => a.y - b.y);
}

interface FortOpts {
  id: string; name: string; blurb: string; theme: MapDef['theme']; width: number; depth: number;
  keep: number; outer: Barrier; inner: Barrier; zones: Omit<ZoneDef, 'id'>[]; towerEvery?: number;
  spawnYs: number[]; decorSeed: number; waveScale: number;
}
function fortress(o: FortOpts): MapDef {
  const barriers = [o.outer, o.inner];
  return {
    id: o.id, name: o.name, blurb: o.blurb, theme: o.theme, width: o.width, depth: o.depth,
    castle: { x: o.keep, y: o.depth / 2 },
    spawns: o.spawnYs.map(y => ({ x: o.width - 8, y })),
    barriers,
    walls: barriers.flatMap((b, i) => wallLine(b, i, o.depth, o.towerEvery ?? 0)),
    zones: o.zones.map((z, i) => ({ id: i, ...z })),
    barracks: [{ x: o.keep + 15, y: o.depth / 2 - 22 }, { x: o.keep + 15, y: o.depth / 2 + 22 }],
    placeZone: { x0: o.keep + 12, x1: o.outer.x + 3, y0: 14, y1: o.depth - 14 },
    decorSeed: o.decorSeed, waveScale: o.waveScale,
  };
}

export const MAPS: Record<string, MapDef> = {
  meadow: fortress({
    id: 'meadow', name: 'Sonnenwiese', theme: 'meadow',
    blurb: 'Gerade Straße, Tore auf einer Linie – der gemütliche Einstieg.',
    width: 270, depth: 120, keep: 28,
    outer: { x: 172, gateY: 60 }, inner: { x: 94, gateY: 60 },
    zones: [
      { name: 'Vorhof', x: 133, y: 60, r: 26 },
      { name: 'Schlossplatz', x: 72, y: 60, r: 16 },
      { name: 'Thronvorplatz', x: 47, y: 60, r: 10 },
    ],
    spawnYs: [42, 78], decorSeed: 7, waveScale: 1.75,
  }),
  forest: fortress({
    id: 'forest', name: 'Waldpass', theme: 'forest',
    blurb: 'Die Tore sind versetzt: Im Vorhof laufen Angreifer im Zickzack durchs Feuer.',
    width: 300, depth: 140, keep: 28,
    outer: { x: 190, gateY: 94 }, inner: { x: 102, gateY: 46 },
    zones: [
      { name: 'Vorhof', x: 146, y: 70, r: 32 },
      { name: 'Schlossplatz', x: 76, y: 70, r: 18 },
      { name: 'Thronvorplatz', x: 48, y: 70, r: 10 },
    ],
    spawnYs: [50, 92], decorSeed: 21, waveScale: 1.9,
  }),
  valley: fortress({
    id: 'valley', name: 'Bergfeste', theme: 'valley',
    blurb: 'Hohe Berge, viele Türme – und härtere Wellen für Erfahrene.',
    width: 300, depth: 160, keep: 30,
    outer: { x: 186, gateY: 80 }, inner: { x: 100, gateY: 80 }, towerEvery: 3,
    zones: [
      { name: 'Vorhof', x: 143, y: 80, r: 30 },
      { name: 'Schlossplatz', x: 74, y: 80, r: 18 },
      { name: 'Thronvorplatz', x: 49, y: 80, r: 10 },
    ],
    spawnYs: [62, 98], decorSeed: 33, waveScale: 2.0,
  }),
  frost: fortress({
    id: 'frost', name: 'Eistal', theme: 'snow',
    blurb: 'Enges, verschneites Tal: Die Tore liegen an den Rändern, Angreifer müssen quer durch den Schusshagel.',
    width: 300, depth: 100, keep: 26,
    outer: { x: 196, gateY: 16 }, inner: { x: 104, gateY: 84 }, towerEvery: 4,
    zones: [
      { name: 'Eispass', x: 150, y: 50, r: 30 },
      { name: 'Schneehof', x: 76, y: 50, r: 18 },
      { name: 'Thronvorplatz', x: 47, y: 50, r: 10 },
    ],
    spawnYs: [30, 70], decorSeed: 45, waveScale: 1.85,
  }),
  oasis: fortress({
    id: 'oasis', name: 'Wüstenoase', theme: 'desert',
    blurb: 'Weite, offene Höfe und drei Angriffsrichtungen – viel Platz zum Bauen.',
    width: 340, depth: 150, keep: 30,
    outer: { x: 222, gateY: 75 }, inner: { x: 114, gateY: 75 }, towerEvery: 2,
    zones: [
      { name: 'Karawanserei', x: 168, y: 75, r: 36 },
      { name: 'Oase', x: 82, y: 75, r: 22 },
      { name: 'Thronvorplatz', x: 52, y: 75, r: 11 },
    ],
    spawnYs: [38, 75, 112], decorSeed: 57, waveScale: 2.05,
  }),
  ridge: fortress({
    id: 'ridge', name: 'Bergpfad', theme: 'ridge',
    blurb: 'Der Aufstieg zur Burg: Die Tore sitzen an den entgegengesetzten Enden – ein langer Zickzackweg nach oben.',
    width: 320, depth: 170, keep: 28,
    outer: { x: 206, gateY: 150 }, inner: { x: 108, gateY: 20 }, towerEvery: 3,
    zones: [
      { name: 'Serpentine', x: 156, y: 90, r: 34 },
      { name: 'Burgtor', x: 78, y: 70, r: 20 },
      { name: 'Thronvorplatz', x: 50, y: 85, r: 11 },
    ],
    spawnYs: [120, 150], decorSeed: 71, waveScale: 2.15,
  }),
};
export const DEFAULT_MAP = 'meadow';
