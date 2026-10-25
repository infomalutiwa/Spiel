import { MAPS, DEFAULT_MAP } from '@burgwacht/shared';
import { Connection, interpolation } from './net/connection';
import { World } from './render/scene';
import { UnitViews } from './render/units';
import { Effects } from './render/effects';
import { Controls } from './input/controls';
import { Ui, reasonText } from './ui/ui';
import { showGallery } from './gallery';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const world = new World(canvas, MAPS[DEFAULT_MAP]);
const views = new UnitViews(world);
const fx = new Effects(world, views);
const ui = new Ui();
let conn: Connection | undefined;
let controls: Controls | undefined;

const INTERP_MS = 120;
let last = performance.now();
let lobbyAngle = 0;

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (conn && controls) {
    const ip = interpolation(conn.snaps, now - INTERP_MS);
    const s = conn.latest();
    controls.prune(s ?? ({ units: [] } as never));
    views.sync(ip, conn.you, controls.selected, dt);
    world.setPlacementZone(s?.phase === 'prep');
    fx.update(dt);
    controls.frame(dt);
  } else if (gallery) { world.frame(dt, { x: 0, z: 0 }, 0); }
  else { // lobby: slow cinematic orbit over the castle
    lobbyAngle += dt * 0.08;
    world.target.set(30 + Math.sin(lobbyAngle) * 8, 0, 45);
    world.yaw = Math.sin(lobbyAngle * 0.7) * 0.35;
    world.frame(dt, { x: 0, z: 0 }, 0);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

async function enter(c: Connection) {
  history.replaceState(null, '', `?room=${c.code}`);
  ui.hideLobby();
  conn = c;
  controls = new Controls(world, views, c, () => c.latest());
  ui.buildHud(c, controls);
  controls.onError = m => ui.toast(m, true);
  world.target.set(52, 0, 45); world.yaw = 0; world.dist = 70;
  wire(c, true);
}

/** attach a (new) connection to the running game */
function wire(c: Connection, first = false) {
  conn = c;
  controls!.setConnection(c);
  c.onSnapshot = s => {
    fx.schedule(s.events, INTERP_MS);
    ui.update(s, c, controls!);
    if (c.peerConnected) ui.hideWaiting();
  };
  c.onError = r => ui.toast(reasonText(r), true);
  c.onPeer = p => { if (!p && c.latest()?.phase !== 'won') ui.toast('Deine Mitspielerin hat die Verbindung verloren'); if (p) ui.hideWaiting(); };
  c.onClose = () => reconnect(c.code);
  if (first && !c.peerConnected) ui.showWaiting(c.code);
  const s = c.latest(); if (s) ui.update(s, c, controls!);
}

/** the server keeps the seat for our token, so just knock again with a growing delay */
async function reconnect(code: string) {
  ui.toast('Verbindung verloren – versuche, wieder einzusteigen …', true);
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(r => setTimeout(r, Math.min(5000, 600 * (attempt + 1))));
    try {
      const c = await Connection.open(code);
      wire(c);
      ui.toast('Wieder verbunden!');
      return;
    } catch (e) {
      const reason = String((e as Error).message);
      if (reason === 'room_not_found' || reason === 'room_full') break;
    }
  }
  ui.toast('Keine Verbindung mehr – bitte die Seite neu laden', true);
}

const params = new URLSearchParams(location.search);
const preset = params.get('room')?.toUpperCase() ?? undefined;
const gallery = params.has('gallery');
if (gallery) showGallery(world); else ui.showLobby({
  create: async () => enter(await Connection.open()),
  join: async code => {
    if (code.length !== 4) throw new Error('room_not_found');
    await enter(await Connection.open(code));
  },
}, preset);

// handy for automated tests and debugging
(window as unknown as { __bw: unknown }).__bw = { get conn() { return conn; }, get controls() { return controls; }, world, views };
