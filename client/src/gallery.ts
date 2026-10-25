import { ENEMIES, TROOP_ORDER, UNIT_DEFS, type UnitType } from '@burgwacht/shared';
import { buildRig } from './render/models';
import { PAL } from './render/palette';
import { UNIT_SCALE } from './render/units';
import type { World } from './render/scene';

/** `?gallery` – lines up every troop and enemy type for a close look at the models */
export function showGallery(world: World) {
  const rows: { types: UnitType[]; enemy: boolean; z: number }[] = [
    { types: TROOP_ORDER, enemy: false, z: 40 },
    { types: Object.keys(ENEMIES) as UnitType[], enemy: true, z: 48 },
  ];
  for (const row of rows) {
    row.types.forEach((t, i) => {
      const rig = buildRig(t, row.enemy ? PAL.enemy : PAL.team[i % 2], row.enemy, i + 3);
      rig.root.scale.setScalar(UNIT_SCALE);
      rig.root.position.set(44 + i * 6.2, 0, row.z);
      rig.root.rotation.y = 0.35; // slight turn toward the camera
      world.scene.add(rig.root);
      void UNIT_DEFS;
    });
  }
  world.target.set(62, 0, 46); world.dist = 38; world.pitch = 0.82;
  document.getElementById('ui')!.style.display = 'none';
}
