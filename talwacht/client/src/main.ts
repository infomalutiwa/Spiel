import { buildTerrain, MAPS, DEFAULT_MAP, type Terrain } from '@talwacht/shared';
import { initViewport } from './viewport';
import { World } from './render/scene';
import { buildTerrainMesh, buildWater } from './render/terrain';
import { buildScenery } from './render/scenery';

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

if (params.get('view') === 'map') {
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
