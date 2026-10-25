import { ENEMIES, TROOP_ORDER, type UnitType } from '@burgwacht/shared';
import * as THREE from 'three';
import { loadBaked } from './render/baked';
import { PAL } from './render/palette';
import type { World } from './render/scene';

/** `?gallery` – lines up every troop and enemy type (all animation frames of one clip) for a close look at the models */
export async function showGallery(world: World) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const rows: { types: UnitType[]; z: number; tint: THREE.Color }[] = [
    { types: TROOP_ORDER.filter(t => t !== 'catapult'), z: 76, tint: new THREE.Color(0.8, 0.95, 1.3) },
    { types: (Object.keys(ENEMIES) as UnitType[]).filter(t => !['ram', 'raider_catapult'].includes(t)), z: 84, tint: new THREE.Color(1, 1, 1) },
  ];
  for (const row of rows) {
    for (const [i, t] of row.types.entries()) {
      const m = await loadBaked(t);
      if (!m) continue;
      const g = m.frames[m.clips.walk[0] + 2];
      const mesh = new THREE.Mesh(g, mat.clone());
      (mesh.material as THREE.MeshStandardMaterial).color.copy(row.tint);
      mesh.scale.setScalar(t === 'brute' ? 2.1 : 1.45);
      mesh.position.set(40 + i * 7, 0, row.z);
      mesh.rotation.y = 0.5;
      mesh.castShadow = true;
      world.scene.add(mesh);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 24), new THREE.MeshBasicMaterial({ color: row.tint.r > 1 ? PAL.team[1] : row.tint.b > 1.2 ? PAL.team[0] : PAL.enemy, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(40 + i * 7, 0.1, row.z); world.scene.add(ring);
    }
  }
  world.target.set(65, 0, 80); world.dist = 40; world.pitch = 0.9;
  document.getElementById('ui')!.style.display = 'none';
}
