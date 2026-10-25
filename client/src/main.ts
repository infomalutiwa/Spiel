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
  conn = c;
  history.replaceState(null, '', `?room=${c.code}`);
  ui.hideLobby();
  controls = new Controls(world, views, c, () => c.latest());
  ui.buildHud(c, controls);
  controls.onError = m => ui.toast(m, true);
  world.target.set(52, 0, 45); world.yaw = 0; world.dist = 70;
  c.onSnapshot = s => {
    fx.schedule(s.events, INTERP_MS);
    ui.update(s, c, controls!);
    if (c.peerConnected) ui.hideWaiting();
  };
  c.onError = r => ui.toast(reasonText(r), true);
  c.onPeer = p => { if (!p && c.latest()?.phase !== 'won') ui.toast('Deine Mitspielerin hat die Verbindung verloren'); if (p) ui.hideWaiting(); };
  c.onClose = () => ui.toast('Verbindung zum Server verloren – Seite neu laden', true);
  if (!c.peerConnected) ui.showWaiting(c.code);
  const s = c.latest(); if (s) ui.update(s, c, controls);
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
