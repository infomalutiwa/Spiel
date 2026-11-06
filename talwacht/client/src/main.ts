import * as THREE from 'three';
import { buildTerrain, MAPS, DEFAULT_MAP, STRUCTURES, type Snapshot, type Terrain } from '@talwacht/shared';
import { initViewport } from './viewport';
import { World } from './render/scene';
import { buildTerrainMesh, buildWater } from './render/terrain';
import { buildScenery } from './render/scenery';
import { StructureViews } from './render/structures';
import { UnitViews } from './render/units';
import { Effects } from './render/effects';
import { castleLayout, unitLayout } from './gallery';
import { loadWallKit } from './render/castlekit';
void loadWallKit();
import { Connection, interpolation } from './net/connection';
import { Controls } from './input/controls';
import { Hud, reasonText } from './ui/hud';
import { showLobby } from './ui/lobby';
import { clearRound, loadMeta, recordResult, storeRound, unlocks } from './ui/meta';
import { audio } from './audio';
import './pwa';

initViewport();
const params = new URLSearchParams(location.search);
const world = new World(document.getElementById('c') as HTMLCanvasElement);
let terrain: Terrain | null = null;
let water: THREE.Mesh | null = null;
let loadedMap = '';

export async function loadMap(id: string) {
  const map = MAPS[id] ?? MAPS[DEFAULT_MAP];
  if (loadedMap === map.id && terrain) return terrain;
  loadedMap = map.id;
  terrain = buildTerrain(map);
  world.clear();
  world.setLook(map.theme);
  const t = terrain;
  world.heightAt = (x, z) => t.height(x, z);
  world.content.add(buildTerrainMesh(t));
  water = buildWater(t);
  if (water) world.content.add(water);
  await buildScenery(t, world.content);
  return t;
}

// ---------- the running game ----------
interface Game { conn: Connection; sv: StructureViews; units: UnitViews; fx: Effects; ctl: Controls; hud: Hud }
let game: Game | null = null;
const INTERP = 110;
let last = performance.now(), miniT = 0, lobbyA = 0;

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const sh = (water?.material as THREE.Material | undefined)?.userData.shader as { uniforms: { time: { value: number } } } | undefined;
  if (sh) sh.uniforms.time.value += dt;
  if (game) {
    const { conn, sv, units, fx, ctl, hud } = game;
    const ip = interpolation(conn.snaps, now - INTERP), s = conn.latest();
    sv.sync(conn.structs, dt);
    units.sync(ip, conn.you, ctl.selected, dt);
    fx.update(dt, units, conn.structs.values());
    ctl.frame(dt, s);
    if (s && Math.abs(world.night - s.night) > 0.01) { world.night += (s.night - world.night) * Math.min(1, dt * 2); world.applyLook(); }
    if ((miniT -= dt) <= 0) { miniT = 0.25; hud.drawMini(); }
  } else if (terrain && !params.has('view') && !params.has('gallery')) { // lobby: slow flight over the valley
    lobbyA += dt * 0.05;
    world.target.set(terrain.map.w / 2 + Math.sin(lobbyA) * 60, 0, terrain.map.d * 0.62 + Math.cos(lobbyA * 0.7) * 40);
    world.dist = 230; world.yaw = Math.sin(lobbyA * 0.6) * 0.35;
  }
  world.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const SFX: Record<string, Parameters<typeof audio.play>[0]> = { boom: 'siege', fire: 'siege', crash: 'siege', arrow: 'arrow', throw: 'siege', ping: 'bell', trap: 'punch', gate: 'siege' };

async function enter(conn: Connection) {
  history.replaceState(null, '', `?room=${conn.code}`);
  const t = await loadMap(conn.mapId);
  const sv = new StructureViews(t, world.content);
  const units = new UnitViews(world, () => sv);
  const fx = new Effects(world);
  const ctl = new Controls(world, conn, t, units, sv, () => conn.latest());
  const hud = new Hud(conn, ctl, world);
  const meta = loadMeta();
  hud.unlocks = unlocks(meta);
  game = { conn, sv, units, fx, ctl, hud };
  fx.onSound = (n, x, z) => {
    const d = Math.hypot(x - world.target.x, z - world.target.z);
    audio.play(SFX[n] ?? 'click', Math.max(0, 1 - d / 260) * (n === 'arrow' ? 0.25 : 0.8));
  };
  const keep = MAPS[conn.mapId].keep;
  world.target.set(keep.x, 0, keep.y - 60); world.dist = 190; world.yaw = 0;
  hud.onMenu = () => menu(conn);
  hud.onEnd = s => endScreen(s, conn);
  wire(conn);
}

function wire(conn: Connection) {
  const g = game!;
  g.conn = conn; g.ctl.setConnection(conn);
  if (document.hidden) conn.send({ t: 'vis', hidden: true });
  conn.onSnapshot = (s: Snapshot) => {
    g.hud.update(s);
    g.fx.events(s.events);
    g.fx.syncShells(s.shells);
    for (const q of s.squads) g.units.squadStars.set(q.id, q.stars);
    for (const [id, gp] of g.sv.garrison) if (s.shells.some(sh => Math.abs(sh.x - gp.x) < 3 && Math.abs(sh.y - gp.y) < 3)) g.units.towerFire.set(id, 1.2);
    for (const e of s.events) if (e.k === 'wave') audio.play('horn', 0.8);
  };
  conn.onError = r => g.hud.toast(reasonText(r), true);
  conn.onPeer = p => { if (!p) g.hud.toast('Deine Mitspielerin hat die Verbindung verloren', true); else g.hud.toast('💗 Deine Mitspielerin ist da!'); };
  conn.onSave = (data, wave, mapId) => storeRound({ data, wave, mapId, at: Date.now() });
  conn.onClose = () => reconnect(conn.code);
}

async function reconnect(code: string) {
  game?.hud.toast('Verbindung verloren – steige wieder ein …', true);
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, Math.min(5000, 600 * (i + 1))));
    try { const c = await Connection.open({ code }); c.structs = game!.conn.structs; wire(c); game?.hud.toast('Wieder verbunden!'); return; }
    catch (e) { const r = (e as Error).message; if (r === 'room_not_found' || r === 'room_full') break; }
  }
  game?.hud.toast('Keine Verbindung mehr – Seite neu laden (dein Spielstand ist gespeichert)', true);
}

function menu(conn: Connection) {
  const ui = document.getElementById('ui')!;
  const m = document.createElement('div');
  m.id = 'menu';
  m.innerHTML = `<div class="panel card"><h2>Menü</h2><p>Code <b class="code">${conn.code}</b></p>
    <button class="btn" id="mSound">${audio.muted ? '🔇 Ton an' : '🔊 Ton aus'}</button>
    <button class="btn" id="mFull">⛶ Vollbild</button>
    <button class="btn" id="mShare">🔗 Einladung teilen</button>
    <button class="btn ghost" id="mLeave">🚪 Zur Lobby (Spielstand bleibt gespeichert)</button>
    <button class="btn gold" id="mBack">Weiterspielen</button>
    <p class="hint">Steuerung: Ziehen = Kamera · zwei Finger = Zoom/Drehen · Trupp antippen, dann Ziel · lange drücken = Markierung für deine Mitspielerin</p></div>`;
  ui.appendChild(m);
  m.querySelector('#mSound')!.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); m.remove(); });
  m.querySelector('#mFull')!.addEventListener('click', async () => { try { await document.documentElement.requestFullscreen(); await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* not allowed */ } m.remove(); });
  m.querySelector('#mShare')!.addEventListener('click', () => { import('./ui/hud').then(h => h.shareInvite(conn.code)); m.remove(); });
  m.querySelector('#mLeave')!.addEventListener('click', () => { conn.onClose = () => {}; conn.close(); location.href = location.pathname; });
  m.querySelector('#mBack')!.addEventListener('click', () => m.remove());
}

function endScreen(s: Snapshot, conn: Connection) {
  const r = s.result!;
  const meta = loadMeta();
  const fresh = recordResult(meta, s.mapId, s.diff, r.stars);
  clearRound();
  audio.play(r.won ? 'win' : 'lose');
  const top = Object.entries(r.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const NAME: Record<string, string> = { Feuer: '🔥 Feuer', Sturz: 'Stürze' };
  const label = (k: string) => NAME[k] ?? (STRUCTURES[k as keyof typeof STRUCTURES] ? `${STRUCTURES[k as keyof typeof STRUCTURES].icon} ${STRUCTURES[k as keyof typeof STRUCTURES].name}` : k);
  const el = document.createElement('div');
  el.id = 'end';
  el.innerHTML = `<div class="panel card"><h1>${r.won ? '🏆 Das Tal ist gehalten!' : '💀 Der Bergfried ist gefallen'}</h1>
    <div class="bigstars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div>
    <p>Welle ${r.wave} von ${s.waveCount} · ${r.kills} Gegner besiegt · Bergfried nie unter ${Math.round(r.keepMinFrac * 100)} %</p>
    <div class="dmg">${top.map(([k, v]) => `<div><span>${label(k)}</span><b>${Math.round(v)}</b></div>`).join('')}</div>
    ${fresh.length ? `<p class="new">Neu freigeschaltet: ${fresh.join(', ')}</p>` : ''}
    <button class="btn gold big" id="again">Zur Lobby</button></div>`;
  document.getElementById('ui')!.appendChild(el);
  el.querySelector('#again')!.addEventListener('click', () => { conn.onClose = () => {}; conn.close(); location.href = location.pathname; });
}

// ---------- entry ----------
if (params.get('gallery') === 'units') {
  loadMap('gruental').then(t => {
    const sv = new StructureViews(t, world.content);
    const views = new UnitViews(world, () => sv);
    const fx = new Effects(world);
    const layout = castleLayout();
    sv.sync(layout, 0.016);
    const units = unitLayout(t.map.keep.x - 40, t.map.keep.y - 110);
    const snap = { units } as never;
    setInterval(() => { views.sync({ a: snap, b: snap, alpha: 0 }, 0, new Set([units[0].squad]), 0.05); fx.update(0.05, views, layout.values()); }, 50);
    world.target.set(t.map.keep.x - 18, 0, t.map.keep.y - 104); world.dist = Number(params.get('dist') ?? 48); world.yaw = Number(params.get('yaw') ?? 0.2);
    setTimeout(() => ((window as unknown as { __ready: boolean }).__ready = true), 4000);
  });
} else if (params.get('gallery') === 'castle') {
  loadMap('gruental').then(t => {
    const views = new StructureViews(t, world.content);
    const layout = castleLayout();
    views.sync(layout, 0.016);
    setInterval(() => views.sync(layout, 0.05), 50);
    world.target.set(t.map.keep.x - 20, 0, t.map.keep.y - 50); world.dist = Number(params.get('dist') ?? 95); world.yaw = Number(params.get('yaw') ?? 0.25);
    if (params.has('tx')) world.target.set(Number(params.get('tx')), 0, Number(params.get('tz')));
    setTimeout(() => ((window as unknown as { __ready: boolean }).__ready = true), 2500);
  });
} else if (params.get('view') === 'map') {
  loadMap(params.get('map') ?? DEFAULT_MAP).then(t => {
    const m = t.map;
    world.target.set(m.w / 2, 0, m.d * 0.55); world.dist = Number(params.get('dist') ?? 470); world.yaw = Number(params.get('yaw') ?? 0);
    if (params.has('tx')) world.target.set(Number(params.get('tx')), 0, Number(params.get('tz')));
    (window as unknown as { __ready: boolean }).__ready = true;
  });
} else {
  const meta = loadMeta();
  const debugWaves = Number(params.get('debugWaves')) || undefined;
  showLobby(meta, {
    preview: id => { void loadMap(id); },
    create: async (map, diff) => enter(await Connection.open({ mapId: map, diff, talents: meta.talents, unlocks: unlocks(meta), debugWaves })),
    join: async code => { if (code.length !== 4) throw new Error('room_not_found'); await enter(await Connection.open({ code })); },
    resume: async save => enter(await Connection.open({ mapId: meta.map, diff: meta.diff, talents: meta.talents, unlocks: unlocks(meta), save })),
  }, params.get('room')?.toUpperCase());
}

// debugging / automated tests
(window as unknown as { __tw: unknown }).__tw = { get game() { return game; }, world };

addEventListener('pointerdown', e => { audio.unlock(); if ((e.target as HTMLElement | null)?.closest('button')) audio.play('click', 0.4); }, { capture: true });
for (const ev of ['touchend', 'click']) addEventListener(ev, () => audio.unlock(), { capture: true });
addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('visibilitychange', () => game?.conn.send({ t: 'vis', hidden: document.hidden }));
