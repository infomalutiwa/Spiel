import { MAPS, DEFAULT_MAP } from '@burgwacht/shared';
import { Minimap } from './ui/minimap';
import { Connection, interpolation } from './net/connection';
import { World } from './render/scene';
import { UnitViews } from './render/units';
import { Effects } from './render/effects';
import { FortressViews } from './render/fortress';
import { nightLevel } from './render/night';
import { Controls } from './input/controls';
import { Ui, reasonText } from './ui/ui';
import { showGallery } from './gallery';
import { audio } from './audio';
import { standalone } from './pwa';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const world = new World(canvas, MAPS[DEFAULT_MAP]);
const views = new UnitViews(world);
const fx = new Effects(world, views);
const fortress = new FortressViews(world);
const ui = new Ui();
let conn: Connection | undefined;
let controls: Controls | undefined;
let minimap: Minimap | undefined;

const INTERP_MS = 120;
const nightParam = new URLSearchParams(location.search).has('night') ? Number(new URLSearchParams(location.search).get('night') || 1) : undefined;
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
    fortress.sync(ip?.b.units ?? [], s?.zones, dt);
    fortress.showCrown(s?.phase === 'prep');
    world.night.target = nightParam ?? nightLevel(s?.wave ?? 0);
    world.setPlacementZone(s?.phase === 'prep');
    fx.update(dt);
    controls.frame(dt);
    minimap?.draw(s, conn.you);
  } else if (gallery) { world.frame(dt, { x: 0, z: 0 }, 0); }
  else { // lobby: slow cinematic orbit over the castle
    lobbyAngle += dt * 0.08;
    const o = world.map.barriers[0];
    world.target.set(o.x - 12 + Math.sin(lobbyAngle) * 14, 0, o.gateY + Math.cos(lobbyAngle * 0.8) * 6);
    world.dist = 62; world.pitch = 0.5;
    world.yaw = 0.9 + Math.sin(lobbyAngle * 0.7) * 0.3;
    world.frame(dt, { x: 0, z: 0 }, 0);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

async function enter(c: Connection) {
  history.replaceState(null, '', `?room=${c.code}`);
  ui.hideLobby();
  world.setMap(MAPS[c.mapId] ?? MAPS[DEFAULT_MAP]);
  conn = c;
  controls = new Controls(world, views, c, () => c.latest());
  ui.buildHud(c, controls);
  controls.onError = m => ui.toast(m, true);
  controls.fortress = fortress;
  fx.onBanner = t => ui.fortressBanner(t, world.map);
  const [outer, inner] = world.map.barriers;
  world.target.set((outer.x + inner.x) / 2 - 6, 0, world.map.depth / 2); world.yaw = 0; world.dist = 100; world.pitch = 0.95;
  minimap = new Minimap(world, document.getElementById('ui')!);
  wire(c, true);
}

/** attach a (new) connection to the running game */
function wire(c: Connection, first = false) {
  conn = c;
  if (document.hidden) c.send({ t: 'vis', hidden: true });
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
if (gallery) void showGallery(world); else ui.showLobby({
  preview: id => world.setMap(MAPS[id]),
  create: async mapId => enter(await Connection.open(undefined, mapId)),
  join: async code => {
    if (code.length !== 4) throw new Error('room_not_found');
    await enter(await Connection.open(code));
  },
}, preset);

// handy for automated tests and debugging
(window as unknown as { __bw: unknown }).__bw = { get conn() { return conn; }, get controls() { return controls; }, world, views };

// sound: browsers need a gesture first; button clicks get a small tick; M or the speaker toggles mute
addEventListener('pointerdown', e => {
  audio.unlock();
  if ((e.target as HTMLElement | null)?.closest('button')) audio.play('click', 0.5);
}, { capture: true });
// iOS only lets audio start from touchend/click, not pointerdown
for (const t of ['touchend', 'click']) addEventListener(t, () => audio.unlock(), { capture: true });
// stop the browser's own pinch / double-tap zoom and long-press menus while playing
addEventListener('gesturestart', e => e.preventDefault());
addEventListener('contextmenu', e => { if ((e.target as HTMLElement).id === 'c') e.preventDefault(); });

// fullscreen + landscape lock where the browser allows it (Android Chrome); an installed app is already fullscreen
if (document.fullscreenEnabled && !standalone() && matchMedia('(pointer: coarse)').matches) {
  const fs = document.createElement('button');
  fs.id = 'fs'; fs.title = 'Vollbild'; fs.textContent = '⛶';
  fs.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'); }
    } catch { /* not allowed – fine */ }
  };
  document.body.appendChild(fs);
}
const mute = document.createElement('button');
mute.id = 'mute'; mute.title = 'Ton an/aus (M)';
const showMute = () => { mute.textContent = audio.muted ? '🔇' : '🔊'; };
mute.onclick = () => { audio.unlock(); audio.toggleMute(); showMute(); };
showMute();
document.body.appendChild(mute);
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'm' && !(e.target instanceof HTMLInputElement)) { audio.unlock(); audio.toggleMute(); showMute(); } });

// the game waits while either of you has the tab / app in the background
document.addEventListener('visibilitychange', () => conn?.send({ t: 'vis', hidden: document.hidden }));
