// What to bake: which KayKit character, which gear is visible, which animation clips (and how many sampled frames each).
// Loaded in the baker page after bake.js. All source art is CC0 (KayKit Adventurers / Skeletons packs).
const ADV = window.PACKS.adv, SKEL = window.PACKS.skel;
const T = window.THREE;

const std = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const mesh = (g, c) => new T.Mesh(g, std(c));

/** cylinder spear with a leaf blade, grip at the origin pointing up */
const spear = () => {
  const g = new T.Group();
  const shaft = mesh(new T.CylinderGeometry(0.03, 0.03, 2.2, 6), '#8b5a2b'); shaft.position.y = 0.4;
  const head = mesh(new T.ConeGeometry(0.09, 0.34, 6), '#c9d1d9'); head.position.y = 1.66;
  const collar = mesh(new T.CylinderGeometry(0.045, 0.045, 0.08, 6), '#d9b13b'); collar.position.y = 1.5;
  g.add(shaft, head, collar); return g;
};
/** simple recurve bow in the left hand */
const bow = () => {
  const g = new T.Group();
  const arc = mesh(new T.TorusGeometry(0.55, 0.035, 6, 16, Math.PI), '#8b5a2b'); arc.rotation.z = Math.PI / 2; arc.position.set(0, 0.05, 0);
  const string = mesh(new T.CylinderGeometry(0.008, 0.008, 1.1, 4), '#f2ead7'); string.position.set(-0.02, 0.05, 0);
  g.add(arc, string); g.rotation.set(0, 0, 0); return g;
};

const WALK = { name: 'Walking_A', frames: 8 };
const IDLE = { name: 'Idle', frames: 2 };
const DEATH = { name: 'Death_A', frames: 6, mode: 'once' };
const mk = (id, char, extra) => ({ id, char, clips: { idle: IDLE, walk: WALK, death: DEATH }, ...extra });

const HIDE_KNIGHT = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'];

/** horse built from primitives, legs on pivots so every frame can swing them */
function makeHorse(coat, mane) {
  const g = new T.Group();
  const body = mesh(new T.CapsuleGeometry(0.42, 1.0, 6, 12), coat); body.rotation.x = Math.PI / 2; body.position.set(0, 1.05, 0);
  const chest = mesh(new T.SphereGeometry(0.46, 12, 10), coat); chest.position.set(0, 1.08, 0.55);
  const rump = mesh(new T.SphereGeometry(0.46, 12, 10), coat); rump.position.set(0, 1.08, -0.55);
  const neckPivot = new T.Group(); neckPivot.position.set(0, 1.35, 0.7);
  const neck = mesh(new T.CapsuleGeometry(0.2, 0.55, 4, 8), coat); neck.position.set(0, 0.3, 0.2); neck.rotation.x = 0.55;
  const head = mesh(new T.CapsuleGeometry(0.17, 0.4, 4, 8), coat); head.position.set(0, 0.68, 0.48); head.rotation.x = 1.05;
  const maneM = mesh(new T.BoxGeometry(0.1, 0.62, 0.22), mane); maneM.position.set(0, 0.42, 0.04); maneM.rotation.x = 0.55;
  const ears = [-0.09, 0.09].map(x => { const e = mesh(new T.ConeGeometry(0.05, 0.15, 5), coat); e.position.set(x, 0.86, 0.34); return e; });
  neckPivot.add(neck, head, maneM, ...ears);
  const tail = mesh(new T.CapsuleGeometry(0.07, 0.5, 4, 6), mane); tail.position.set(0, 1.1, -1.05); tail.rotation.x = -0.5;
  const legs = [];
  for (const [x, z] of [[-0.24, 0.55], [0.24, 0.55], [-0.24, -0.55], [0.24, -0.55]]) {
    const pivot = new T.Group(); pivot.position.set(x, 0.85, z);
    const upper = mesh(new T.CapsuleGeometry(0.1, 0.4, 4, 6), coat); upper.position.y = -0.25;
    const hoof = mesh(new T.CylinderGeometry(0.1, 0.12, 0.1, 6), '#3a2a22'); hoof.position.y = -0.62;
    pivot.add(upper, hoof); legs.push(pivot); g.add(pivot);
  }
  g.add(body, chest, rump, neckPivot, tail);
  return { group: g, legs, neckPivot };
}

/** rider (any KayKit character) seated on a procedural horse; clips are driven by poseFix */
function mounted(id, char, coat, mane, hide, attach) {
  const horse = makeHorse(coat, mane);
  return {
    id, char, hide, attach,
    clips: { idle: { name: 'Sit_Chair_Pose', frames: 2, mode: 'once' }, walk: { name: 'Sit_Chair_Pose', frames: 8 }, attack: { name: 'Sit_Chair_Pose', frames: 8, mode: 'once' }, death: { name: 'Sit_Chair_Pose', frames: 6, mode: 'once' } },
    extraMeshes(root) {
      root.add(horse.group);
      const out = []; horse.group.traverse(o => { if (o.isMesh) out.push(o); });
      return out;
    },
    poseFix(root, key, ph) {
      const rig = root.getObjectByName('Rig');
      const gait = Math.sin(ph * Math.PI * 2);
      horse.legs.forEach((l, i) => { l.rotation.x = key === 'walk' ? Math.sin(ph * Math.PI * 2 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.3 : 0)) * 0.75 : 0; });
      horse.neckPivot.rotation.x = key === 'walk' ? gait * 0.05 : 0;
      let tilt = 0, drop = 0, rear = 0;
      if (key === 'walk') drop = Math.abs(gait) * 0.07;
      if (key === 'attack') rear = Math.sin(ph * Math.PI) * 0.35;
      if (key === 'death') { tilt = ph * 1.45; drop = -ph * 0.35; }
      horse.group.rotation.set(-rear, 0, tilt);
      horse.group.position.set(0, drop, 0);
      rig.position.set(0, 1.28 + drop - Math.sin(tilt) * 0.0, -0.1);
      rig.rotation.set(-rear, 0, tilt);
      root.updateMatrixWorld(true);
    },
  };
}

window.SPECS = [
  mk('knight', ADV + 'Characters/gltf/Knight.glb', { hide: HIDE_KNIGHT, clips: { idle: IDLE, walk: WALK, attack: { name: '1H_Melee_Attack_Slice_Diagonal', frames: 8, mode: 'once' }, death: DEATH } }),
  mk('spearman', ADV + 'Characters/gltf/Barbarian.glb', {
    hide: ['1H_Axe_Offhand', '1H_Axe', '2H_Axe', 'Mug'],
    attach: [{ bone: 'handslotr', proc: spear, rot: [0, 0, 0] }],
    clips: { idle: IDLE, walk: WALK, attack: { name: '1H_Melee_Attack_Stab', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('archer', ADV + 'Characters/gltf/Rogue_Hooded.glb', {
    hide: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'],
    attach: [{ bone: 'handslotl', proc: bow, rot: [0, 0, 0] }, { bone: 'chest', file: ADV + 'Assets/gltf/quiver.gltf', pos: [0, 0.12, -0.22], rot: [0, Math.PI, 0.25], scale: 1 }],
    clips: { idle: IDLE, walk: WALK, attack: { name: '1H_Ranged_Shoot', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('crossbowman', ADV + 'Characters/gltf/Rogue.glb', {
    hide: ['Knife_Offhand', '1H_Crossbow', 'Knife', 'Throwable'],
    clips: { idle: { name: '2H_Ranged_Aiming', frames: 2 }, walk: WALK, attack: { name: '2H_Ranged_Shoot', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('mage', ADV + 'Characters/gltf/Mage.glb', {
    hide: ['Spellbook', 'Spellbook_open', '1H_Wand'],
    clips: { idle: IDLE, walk: WALK, attack: { name: 'Spellcast_Shoot', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('healer', ADV + 'Characters/gltf/Mage.glb', {
    hide: ['Spellbook_open', '2H_Staff'],
    clips: { idle: IDLE, walk: WALK, attack: { name: 'Spellcast_Raise', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mounted('cavalry', ADV + 'Characters/gltf/Knight.glb', '#e8dcc6', '#7a5a3c', ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword', 'Round_Shield']),
  mk('footman', SKEL + 'Characters/gltf/Skeleton_Warrior.glb', {
    attach: [{ bone: 'handslotr', file: SKEL + 'Assets/gltf/Skeleton_Axe.gltf' }, { bone: 'handslotl', file: SKEL + 'Assets/gltf/Skeleton_Shield_Small_A.gltf' }],
    clips: { idle: IDLE, walk: WALK, attack: { name: '1H_Melee_Attack_Chop', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('raider_archer', SKEL + 'Characters/gltf/Skeleton_Rogue.glb', {
    attach: [{ bone: 'handslotr', file: SKEL + 'Assets/gltf/Skeleton_Crossbow.gltf' }, { bone: 'chest', file: SKEL + 'Assets/gltf/Skeleton_Quiver.gltf', pos: [0, 0.12, -0.22], rot: [0, Math.PI, 0.25] }],
    clips: { idle: IDLE, walk: WALK, attack: { name: '1H_Ranged_Shoot', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('ironguard', SKEL + 'Characters/gltf/Skeleton_Warrior.glb', {
    attach: [{ bone: 'handslotr', file: SKEL + 'Assets/gltf/Skeleton_Blade.gltf' }, { bone: 'handslotl', file: SKEL + 'Assets/gltf/Skeleton_Shield_Large_B.gltf' }],
    clips: { idle: IDLE, walk: { name: 'Walking_B', frames: 8 }, attack: { name: '1H_Melee_Attack_Slice_Horizontal', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('shaman', SKEL + 'Characters/gltf/Skeleton_Mage.glb', {
    attach: [{ bone: 'handslotr', file: SKEL + 'Assets/gltf/Skeleton_Staff.gltf' }],
    clips: { idle: IDLE, walk: WALK, attack: { name: 'Spellcast_Raise', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mk('brute', SKEL + 'Characters/gltf/Skeleton_Warrior.glb', {
    attach: [{ bone: 'handslotr', file: SKEL + 'Assets/gltf/Skeleton_Axe.gltf', scale: 1.5 }, { bone: 'handslotl', file: SKEL + 'Assets/gltf/Skeleton_Shield_Large_A.gltf' }],
    clips: { idle: IDLE, walk: { name: 'Walking_B', frames: 8 }, attack: { name: '2H_Melee_Attack_Chop', frames: 8, mode: 'once' }, death: DEATH },
  }),
  mounted('raider_rider', SKEL + 'Characters/gltf/Skeleton_Warrior.glb', '#4a3b3f', '#1d1518', [], [{ bone: 'handslotr', file: SKEL + 'Assets/gltf/Skeleton_Blade.gltf' }]),
];
window.specsReady = true;
