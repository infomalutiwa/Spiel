import { cellOf, MAPS, STRUCTURES, type StructId, type StructSnap } from '@talwacht/shared';

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
  // damaged run and one being built
  const d = cellOf(m.keep.x + 30, m.keep.y - 70);
  for (let i = 0; i < 6; i++) { const s = put('wall', d.cx + i, d.cy, 2); s.hp = s.maxHp * (i < 2 ? 0.5 : i < 4 ? 0.2 : 1); if (i === 5) s.build = 3; }
  return out;
}
