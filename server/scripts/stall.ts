import { createGame, tick, applyCommand } from '../src/sim/index';
import { botBuy } from '../src/sim/bot';
import { MAPS, type TroopType } from '@burgwacht/shared';
const mix: TroopType[] = ['knight', 'archer', 'spearman', 'knight', 'healer', 'catapult'];
const mapId = process.argv[2] ?? 'meadow';
MAPS[mapId].waveScale = Number(process.argv[3] ?? 1);
const s = createGame(mapId, 7);
let last = -1, shown = 0;
for (let i = 0; i < 20 * 60 * 25 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
  if (s.phase === 'prep' && s.wave !== last) { last = s.wave; botBuy(s, 0, mix); botBuy(s, 1, mix); for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true }); }
  tick(s);
  if (s.phase === 'battle' && s.battleTime > 240 && i % 300 === 0 && shown++ < 3) {
    const en = s.units.filter(u => u.side === 'enemy');
    console.log('wave', s.wave + 1, 't', Math.round(s.battleTime), 'queue', s.spawnQueue.length, 'enemies', en.length);
    console.log(en.slice(0, 8).map(e => `${e.type}@${e.x.toFixed(0)},${e.y.toFixed(0)} hp${Math.round(e.hp)} st${e.step} tg${e.targetId} ${e.order.kind}`).join(' | '));
    const t4 = s.units.find(u => u.id === en[0].targetId); console.log('target', t4 && `${t4.type} slot${t4.slot} ${t4.x.toFixed(0)},${t4.y.toFixed(0)} hp${Math.round(t4.hp)}/${Math.round(t4.maxHp)} lvl${t4.level}`, 'zones', JSON.stringify(s.zones.map(z => z.owner[0] + z.progress.toFixed(2))));
    console.log('structures lost:', MAPS[mapId].walls.map((w, k) => (s.units.some(u => u.slot === k) ? '' : `${w.kind}${w.bar}@${w.y.toFixed(0)}`)).filter(Boolean).join(' '));
  }
}
const mine2 = s.units.filter(u => u.owner !== null && u.hp > 0);
console.log('defenders alive', mine2.length, mine2.slice(0, 12).map(u => `${u.type[0]}@${u.x.toFixed(0)},${u.y.toFixed(0)}${u.deck ? 'D' : ''}`).join(' '));
