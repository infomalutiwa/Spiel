/**
 * Finds waves that do not end: plays the campaign with a bot army and prints the enemies still alive
 * when a wave runs longer than 240 s.   npx tsx server/scripts/stall.ts [map] [troop,troop,...]
 */
import { createGame, tick, applyCommand } from '../src/sim/index';
import { botBuy, botEconomy, botFortify, botAbilities, botRepair } from '../src/sim/bot';
import { MAPS, type TroopType } from '@burgwacht/shared';
const mapId = process.argv[2] && MAPS[process.argv[2]] ? process.argv[2] : 'meadow';
const mix = (process.argv[3] ?? 'cavalry').split(',') as TroopType[];
const s = createGame(mapId, 7);
let last = -1, shown = 0;
for (let i = 0; i < 20 * 60 * 90 && s.phase !== 'won' && s.phase !== 'lost' && shown < 3; i++) {
  if (s.phase === 'prep' && s.wave !== last) {
    last = s.wave; botEconomy(s, mix); botFortify(s, 'troops'); botBuy(s, 0, mix); botBuy(s, 1, mix); botFortify(s, 'walls');
    for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true });
  }
  tick(s);
  if (i % 20 === 0 && s.phase === 'battle') { botAbilities(s); botRepair(s); }
  if (s.phase === 'battle' && s.battleTime > 240 && i % 600 === 0) {
    shown++;
    const en = s.units.filter(u => u.side === 'enemy');
    console.log('wave', s.wave + 1, 't', Math.round(s.battleTime), 'queue', s.spawnQueue.length, 'enemies', en.length, 'shells', s.shells.length);
    console.log(en.slice(0, 10).map(e => `${e.type}@${e.x.toFixed(0)},${e.y.toFixed(0)} hp${Math.round(e.hp)} st${e.step} tg${e.targetId} ${e.order.kind}`).join(' | '));
    console.log('zones', JSON.stringify(s.zones.map(z => z.owner[0] + z.progress.toFixed(2))), 'structures lost:', MAPS[mapId].walls.map((w, k) => (s.units.some(u => u.slot === k) ? '' : `${w.kind}${w.bar}@${w.y.toFixed(0)}`)).filter(Boolean).join(' '));
    const mine2 = s.units.filter(u => u.owner !== null && u.hp > 0);
    console.log('defenders alive', mine2.length, mine2.slice(0, 12).map(u => `${u.type[0]}@${u.x.toFixed(0)},${u.y.toFixed(0)}${u.deck ? 'D' : ''}${u.order.kind[0]}`).join(' '));
  }
}
