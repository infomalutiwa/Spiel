import { buildTerrain, MAPS, DEFAULT_MAP, type Terrain } from '@talwacht/shared';
import { initViewport } from './viewport';
import { World } from './render/scene';
import { buildTerrainMesh, buildWater } from './render/terrain';
import { buildScenery } from './render/scenery';
import { StructureViews } from './render/structures';
import { castleLayout, unitLayout } from './gallery';
import { UnitViews } from './render/units';
import { Effects } from './render/effects';

initViewport();
const params = new URLSearchParams(location.search);
const world = new World(document.getElementById('c') as HTMLCanvasElement);
let terrain: Terrain;
let water: THREE_Mesh | null = null;
type THREE_Mesh = ReturnType<typeof buildWater>;

export async function loadMap(id: string) {
  const map = MAPS[id] ?? MAPS[DEFAULT_MAP];
  terrain = buildTerrain(map);
  world.clear();
  world.setLook(map.theme);
  world.heightAt = (x, z) => terrain.height(x, z);
  world.content.add(buildTerrainMesh(terrain));
  water = buildWater(terrain);
  if (water) world.content.add(water);
  await buildScenery(terrain, world.content);
  return terrain;
}

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const sh = (water?.material as { userData: { shader?: { uniforms: { time: { value: number } } } } } | undefined)?.userData.shader;
  if (sh) sh.uniforms.time.value += dt;
  world.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (params.get('gallery') === 'units') {
  loadMap('gruental').then(t => {
    const sv = new StructureViews(t, world.content);
    const views = new UnitViews(world, () => sv);
    const fx = new Effects(world);
    const layout = castleLayout();
    sv.sync(layout, 0.016);
    const units = unitLayout(t.map.keep.x - 40, t.map.keep.y - 110);
    const snap = { units } as never;
    let tt = 0;
    setInterval(() => { tt += 0.05; for (const u of units) if (u.anim === 2) u.facing = -Math.PI / 2; views.sync({ a: snap, b: snap, alpha: 0 }, 0, new Set([units[0].squad]), 0.05); fx.update(0.05, views, layout.values()); }, 50);
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
  const id = params.get('map') ?? DEFAULT_MAP;
  loadMap(id).then(t => {
    const m = t.map;
    world.target.set(m.w / 2, 0, m.d * 0.55); world.dist = Number(params.get('dist') ?? 470); world.yaw = Number(params.get('yaw') ?? 0);
    if (params.has('tx')) world.target.set(Number(params.get('tx')), 0, Number(params.get('tz')));
    (window as unknown as { __ready: boolean }).__ready = true;
  });
} else {
  const ui = document.getElementById('ui')!;
  ui.innerHTML = `<div id="lobby"><div class="card panel"><h1>Talwacht</h1><p class="sub">Verteidigt euer Tal – zu zweit.</p></div></div>`;
  loadMap(DEFAULT_MAP).then(t => { world.target.set(t.map.w / 2, 0, t.map.d * 0.7); world.dist = 260; });
}
