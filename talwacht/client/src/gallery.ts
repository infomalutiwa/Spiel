import { cellOf, ENEMY_IDS, MAPS, STRUCTURES, TROOP_IDS, type StructId, type StructSnap, type UnitSnap } from '@talwacht/shared';

/** a test layout of every rampart shape, tier, gate and tower (`?gallery=castle`) */
export function castleLayout(): Map<number, StructSnap> {
  const m = MAPS.gruental, out = new Map<number, StructSnap>();
  let id = 1;
  const put = (kind: StructId, cx: number, cy: number, level = 1, extra: Partial<StructSnap> = {}) => {
    const d = STRUCTURES[kind];
    const s: StructSnap = { id: id++, kind, cx, cy, w: d.w, h: d.h, level, hp: d.hp[Math.min(level, d.hp.length) - 1], maxHp: d.hp[Math.min(level, d.hp.length) - 1], owner: 0, build: 0, state: 0, burning: 0, pitch: 0, ...extra };
    out.set(s.id, s);
    return s;
  };
  const k = cellOf(m.keep.x, m.keep.y);
  put('keep', k.cx - 2, k.cy - 2);
  const base = cellOf(m.keep.x - 50, m.keep.y - 30);
  for (let tier = 1; tier <= 3; tier++) {
    const y = base.cy - (tier - 1) * 7, x0 = base.cx;
    for (let i = 0; i < 9; i++) if (i !== 4) put('wall', x0 + i, y, tier);
    put('gate', x0 + 4, y, tier, { pitch: tier === 3 ? 1 : 0 });
    put('wall', x0, y - 1, tier); put('wall', x0, y - 2, tier); // corner going forward
    put('wall', x0 + 6, y + 1, tier); // T junction going back
    for (let i = 1; i <= 3; i++) put('wall', x0 + 8 + i, y - i, tier); // diagonal run
    put(tier === 1 ? 'tower_bow' : tier === 2 ? 'tower_xbow' : 'ballista', x0 + 9, y, tier === 3 ? 1 : tier);
  }
  // free-standing towers in a row
  const t = cellOf(m.keep.x + 30, m.keep.y - 40);
  (['tower_bow', 'tower_bow', 'tower_bow', 'tower_xbow', 'tower_catapult', 'watchtower'] as StructId[]).forEach((kd, i) => put(kd, t.cx + i * 2, t.cy, kd === 'tower_bow' ? i + 1 : 1));
  // the town: every economy and military building in a row
  const town = cellOf(m.keep.x - 110, m.keep.y - 110);
  (['house', 'house', 'house', 'farm', 'lumber', 'quarry', 'mine', 'mill', 'market', 'well', 'barracks', 'range', 'stable', 'infirmary', 'workshop', 'smithy'] as StructId[])
    .forEach((kd, i) => put(kd, town.cx + (i % 8) * 3, town.cy + Math.floor(i / 8) * 3));
  // damaged run and one being built
  const d = cellOf(m.keep.x + 30, m.keep.y - 70);
  for (let i = 0; i < 6; i++) { const s = put('wall', d.cx + i, d.cy, 2); s.hp = s.maxHp * (i < 2 ? 0.5 : i < 4 ? 0.2 : 1); if (i === 5) s.build = 3; }
  return out;
}

/** every troop (two rows, one per player) and every enemy, plus a small testudo (`?gallery=units`) */
export function unitLayout(x0: number, y0: number): UnitSnap[] {
  const out: UnitSnap[] = [];
  let id = 1000;
  const add = (type: UnitSnap['type'], side: 'p' | 'e', owner: 0 | 1 | null, x: number, y: number, extra: Partial<UnitSnap> = {}) =>
    out.push({ id: id++, type, side, owner, x, y, z: 0, hp: 100, maxHp: 100, facing: side === 'p' ? -Math.PI / 2 : Math.PI / 2, anim: 0, squad: side === 'p' ? 7 + (owner ?? 0) : 0, burning: false, slowed: false, stunned: false, shielded: false, ...extra });
  TROOP_IDS.forEach((t, i) => { add(t, 'p', 0, x0 + i * 4.5, y0 + 6); add(t, 'p', 1, x0 + i * 4.5, y0 + 11, { hp: 60 }); });
  ENEMY_IDS.filter(t => t !== 'ram' && t !== 'trebuchet' && t !== 'siege_tower').forEach((t, i) => add(t, 'e', null, x0 + i * 4.5, y0 - 4, { anim: i % 3 === 0 ? 2 : 0 }));
  add('ram', 'e', null, x0 + 50, y0 - 14);
  for (let i = 0; i < 12; i++) add('e_shield', 'e', null, x0 + 47.5 + (i % 4) * 1.25 * 1.3, y0 - 17 + Math.floor(i / 4) * 2.2, { shielded: true });
  add('trebuchet', 'e', null, x0 + 10, y0 - 22);
  add('siege_tower', 'e', null, x0 + 26, y0 - 22, { burning: true });
  return out;
}
