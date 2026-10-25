import { createGame, tick, applyCommand } from '../src/sim/index';
import { botBuy } from '../src/sim/bot';
const mix: any[] = ['knight', 'archer', 'spearman', 'healer', 'archer', 'mage', 'cavalry', 'crossbowman'];
const s = createGame('meadow', 7);
let last = -1;
for (let i = 0; i < 20 * 900 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
  if (s.phase === 'prep' && s.wave !== last) { last = s.wave; botBuy(s, 0, mix); botBuy(s, 1, mix); for (const p of [0, 1] as const) applyCommand(s, p, { c: 'ready', ready: true }); }
  tick(s);
  if (s.wave === 6 && s.phase === 'battle' && s.battleTime > 200 && i % 400 === 0) {
    const en = s.units.filter(u => u.side === 'enemy');
    console.log('t', Math.round(s.battleTime), 'enemies', en.length, 'queue', s.spawnQueue.length, 'player', s.units.filter(u => u.side === 'player').length);
    console.log(en.slice(0, 6).map(u => `${u.type}@${u.x.toFixed(0)},${u.y.toFixed(0)} hp${Math.round(u.hp)} ord=${u.order.kind} routed=${u.routed.toFixed(1)}`).join(' | '));
    const c = en[0]; console.log('DBG', c.type, 'cd', c.cd.toFixed(2), 'target', c.targetId, 'anim', c.anim, 'near player units:', s.units.filter(u => u.side==='player' && Math.hypot(u.x-c.x,u.y-c.y)<30).map(u=>u.type+':'+Math.hypot(u.x-c.x,u.y-c.y).toFixed(0)).join(','));
    if (s.battleTime > 260) break;
  }
}
