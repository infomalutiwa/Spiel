import * as THREE from 'three';
import type { UnitType } from '@burgwacht/shared';
import { PAL } from './palette';
import { modelInstance } from './assets';

const mat = (color: THREE.ColorRepresentation, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.0, ...o });
const shadow = <T extends THREE.Object3D>(o: T): T => {
  o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return o;
};
const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
};

export interface Rig {
  root: THREE.Group;
  /** bobbing/leaning part */
  body: THREE.Object3D;
  legs: THREE.Object3D[];
  arm?: THREE.Object3D;
  /** unit radius used for health bar + selection ring sizing */
  height: number;
}

const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

interface Style { team: THREE.Color; enemy: boolean; seed: number }

function biped(st: Style, o: { tunic?: THREE.ColorRepresentation; height?: number; bulk?: number; skin?: string }) {
  const h = o.height ?? 1.0, bulk = o.bulk ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = mat(o.skin ?? PAL.skin[Math.floor(hash(st.seed) * PAL.skin.length)]);
  const tunic = mat(o.tunic ?? st.team);
  const legs: THREE.Object3D[] = [];
  for (const sx of [-0.2, 0.2]) {
    const leg = new THREE.Group(); leg.position.set(sx * bulk, 0.55 * h, 0); body.add(leg);
    add(leg, new THREE.CapsuleGeometry(0.13 * bulk, 0.25 * h, 4, 8), mat(PAL.leather), 0, -0.2 * h, 0);
    legs.push(leg);
  }
  const torso = add(body, new THREE.CapsuleGeometry(0.34 * bulk, 0.4 * h, 6, 12), tunic, 0, 0.98 * h, 0);
  const head = add(body, new THREE.SphereGeometry(0.3 * bulk, 16, 14), skin, 0, 1.62 * h, 0);
  for (const sx of [-0.11, 0.11]) { // friendly little eyes
    add(head, new THREE.SphereGeometry(0.045, 8, 8), mat('#2a2018'), sx, 0.03, 0.27 * bulk);
  }
  const arm = new THREE.Group(); arm.position.set(0.42 * bulk, 1.15 * h, 0); body.add(arm);
  add(arm, new THREE.CapsuleGeometry(0.1 * bulk, 0.3, 4, 8), tunic, 0, -0.18, 0);
  add(arm, new THREE.SphereGeometry(0.11 * bulk, 8, 8), skin, 0, -0.42, 0);
  const off = new THREE.Group(); off.position.set(-0.42 * bulk, 1.15 * h, 0); body.add(off);
  add(off, new THREE.CapsuleGeometry(0.1 * bulk, 0.3, 4, 8), tunic, 0, -0.18, 0);
  add(off, new THREE.SphereGeometry(0.11 * bulk, 8, 8), skin, 0, -0.42, 0);
  return { root, body, legs, arm, off, head, torso, height: 2.0 * h };
}

function helmet(parent: THREE.Object3D, y: number, r: number, color: THREE.ColorRepresentation, plume?: THREE.Color) {
  const g = new THREE.SphereGeometry(r * 1.08, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  add(parent, g, mat(color, { metalness: 0.25, roughness: 0.5 }), 0, y, 0);
  if (plume) add(parent, new THREE.ConeGeometry(0.09, 0.4, 8), mat(plume), 0, y + r * 1.1, -0.04).rotation.x = -0.4;
}

function shield(parent: THREE.Object3D, color: THREE.ColorRepresentation, r = 0.36) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r, 0.07, 20), mat(color)).rotation.x = Math.PI / 2;
  add(g, new THREE.SphereGeometry(0.1, 10, 8), mat(PAL.gold, { metalness: 0.3 }), 0, 0, 0.05);
  parent.add(g); return g;
}

const stick = (parent: THREE.Object3D, len: number, color: THREE.ColorRepresentation = PAL.wood, r = 0.03) =>
  add(parent, new THREE.CylinderGeometry(r, r, len, 6), mat(color));

function buildHumanoid(type: UnitType, st: Style): Rig {
  const enemy = st.enemy;
  const cloth = enemy ? new THREE.Color('#7a4a58') : st.team;
  const accent = enemy ? new THREE.Color('#3d3037') : new THREE.Color(PAL.cloth);
  switch (type) {
    case 'knight': {
      const b = biped(st, { bulk: 1.15, height: 1.0 });
      add(b.body, new THREE.SphereGeometry(0.36, 12, 10), mat(PAL.iron, { metalness: 0.3 }), 0, 1.38, 0).scale.set(1.2, 0.5, 1);
      helmet(b.head, 0.06, 0.3, PAL.iron, st.team);
      const sw = new THREE.Group(); b.arm!.add(sw); sw.position.set(0, -0.42, 0.1);
      add(sw, new THREE.BoxGeometry(0.07, 0.8, 0.03), mat('#dfe6ec', { metalness: 0.5, roughness: 0.3 }), 0, 0.4, 0.1);
      add(sw, new THREE.BoxGeometry(0.3, 0.06, 0.06), mat(PAL.gold), 0, 0.02, 0.1);
      const sh = shield(b.body, st.team, 0.38); sh.position.set(-0.52, 1.0, 0.1); sh.rotation.y = -0.3;
      return b;
    }
    case 'spearman': {
      const b = biped(st, { tunic: cloth, bulk: 1.0 });
      add(b.head, new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(PAL.leather), 0, 0.05, 0);
      const sp = new THREE.Group(); b.arm!.add(sp); sp.position.set(0, -0.4, 0.15);
      stick(sp, 2.6).position.y = 0.2;
      add(sp, new THREE.ConeGeometry(0.09, 0.3, 8), mat(PAL.iron, { metalness: 0.5 }), 0, 1.65, 0);
      const sh = shield(b.body, accent, 0.3); sh.position.set(-0.5, 1.0, 0.1);
      return b;
    }
    case 'archer': case 'raider_archer': {
      const b = biped(st, { tunic: enemy ? cloth : new THREE.Color('#6fae6a'), bulk: 0.92, height: 0.98 });
      add(b.head, new THREE.ConeGeometry(0.36, 0.5, 10), mat(enemy ? '#4a3640' : '#4f8a4c'), 0, 0.28, -0.05).rotation.x = -0.15;
      const bow = new THREE.Group(); b.arm!.add(bow); bow.position.set(0.02, -0.4, 0.15);
      const arc = add(bow, new THREE.TorusGeometry(0.5, 0.03, 6, 16, Math.PI), mat(PAL.wood), 0, 0, 0);
      arc.rotation.z = Math.PI / 2;
      add(bow, new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), mat('#f2ead7')).position.x = -0.0;
      add(b.body, new THREE.CylinderGeometry(0.1, 0.1, 0.45, 8), mat(PAL.leather), -0.16, 1.15, -0.35).rotation.x = 0.25;
      return b;
    }
    case 'crossbowman': {
      const b = biped(st, { tunic: cloth, bulk: 1.02 });
      helmet(b.head, 0.04, 0.3, '#8a929c');
      const x = new THREE.Group(); b.arm!.add(x); x.position.set(0, -0.4, 0.3);
      add(x, new THREE.BoxGeometry(0.08, 0.1, 0.8), mat(PAL.wood));
      add(x, new THREE.BoxGeometry(0.85, 0.05, 0.05), mat('#4a3a2a'), 0, 0.05, 0.3);
      return b;
    }
    case 'mage': {
      const b = biped(st, { tunic: cloth, bulk: 0.95, height: 1.0 });
      b.legs.forEach(l => (l.visible = false));
      const robe = add(b.body, new THREE.ConeGeometry(0.55, 1.4, 14), mat(enemy ? '#5b3a6e' : '#6a58c8'), 0, 0.7, 0);
      robe.scale.set(1, 1, 0.9);
      add(b.head, new THREE.ConeGeometry(0.34, 0.8, 12), mat(enemy ? '#41284f' : '#4a3da8'), 0, 0.5, 0).rotation.z = 0.12;
      add(b.head, new THREE.TorusGeometry(0.36, 0.05, 6, 16), mat(PAL.gold), 0, 0.12, 0).rotation.x = Math.PI / 2;
      const staff = new THREE.Group(); b.arm!.add(staff); staff.position.set(0.05, -0.4, 0.1);
      stick(staff, 2.0).position.y = 0.3;
      add(staff, new THREE.SphereGeometry(0.17, 12, 12), mat('#bfa8ff', { emissive: new THREE.Color('#8f6cff'), emissiveIntensity: 1.6 }), 0, 1.4, 0);
      return b;
    }
    case 'healer': {
      const b = biped(st, { tunic: new THREE.Color('#f4efe0'), bulk: 0.95 });
      b.legs.forEach(l => (l.visible = false));
      add(b.body, new THREE.ConeGeometry(0.52, 1.35, 14), mat('#f7f2e4'), 0, 0.68, 0);
      add(b.body, new THREE.BoxGeometry(0.34, 0.1, 0.04), mat('#5ec27a'), 0, 1.0, 0.36);
      add(b.body, new THREE.BoxGeometry(0.1, 0.34, 0.04), mat('#5ec27a'), 0, 1.0, 0.36);
      add(b.head, new THREE.TorusGeometry(0.2, 0.025, 6, 20), mat(PAL.gold, { emissive: new THREE.Color('#ffe08a'), emissiveIntensity: 0.6 }), 0, 0.5, 0).rotation.x = Math.PI / 2;
      const staff = new THREE.Group(); b.arm!.add(staff); staff.position.set(0.05, -0.4, 0.1);
      stick(staff, 1.9, '#b98b5a').position.y = 0.25;
      add(staff, new THREE.SphereGeometry(0.15, 12, 10), mat('#8be0a0', { emissive: new THREE.Color('#4ccf7a'), emissiveIntensity: 1.2 }), 0, 1.25, 0);
      return b;
    }
    case 'footman': {
      const b = biped(st, { tunic: cloth, bulk: 1.05 });
      helmet(b.head, 0.05, 0.3, '#8b7480');
      const axe = new THREE.Group(); b.arm!.add(axe); axe.position.set(0, -0.4, 0.1);
      stick(axe, 0.9).position.y = 0.3;
      add(axe, new THREE.BoxGeometry(0.4, 0.28, 0.05), mat('#8c8590', { metalness: 0.4 }), 0.12, 0.7, 0);
      return b;
    }
    case 'shaman': {
      const b = biped(st, { tunic: new THREE.Color('#6d4a7c'), bulk: 0.95, height: 1.05 });
      b.legs.forEach(l => (l.visible = false));
      add(b.body, new THREE.ConeGeometry(0.55, 1.4, 12), mat('#5d3f72'), 0, 0.7, 0);
      for (let i = 0; i < 5; i++) { // feather headdress
        const f = add(b.head, new THREE.ConeGeometry(0.06, 0.5, 5), mat(['#e8745a', '#f0b54a', '#e8745a', '#5ec2b0', '#f0b54a'][i]), (i - 2) * 0.12, 0.42, -0.05);
        f.rotation.z = (i - 2) * -0.25;
      }
      const staff = new THREE.Group(); b.arm!.add(staff); staff.position.set(0.05, -0.4, 0.1);
      stick(staff, 2.0, '#4a3a2a').position.y = 0.3;
      add(staff, new THREE.SphereGeometry(0.2, 10, 10), mat('#d9b8ff', { emissive: new THREE.Color('#b05cff'), emissiveIntensity: 1.8 }), 0, 1.4, 0);
      return b;
    }
    case 'brute': {
      const b = biped(st, { tunic: new THREE.Color('#7a4a58'), bulk: 1.9, height: 1.25, skin: '#b88a6a' });
      for (const sx of [-1, 1]) add(b.head, new THREE.ConeGeometry(0.1, 0.4, 6), mat('#efe3c8'), sx * 0.3, 0.3, 0).rotation.z = sx * -0.6;
      const club = new THREE.Group(); b.arm!.add(club); club.position.set(0, -0.4, 0.2);
      add(club, new THREE.CylinderGeometry(0.09, 0.22, 1.5, 8), mat('#6b4a2c'), 0, 0.6, 0);
      return b;
    }
    default: return biped(st, {});
  }
}

function buildHorse(st: Style, enemy: boolean): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const coat = mat(enemy ? '#5b4a47' : ['#b9835a', '#e9dcc6', '#6d4b34'][Math.floor(hash(st.seed) * 3)]);
  const trunk = add(body, new THREE.CapsuleGeometry(0.4, 1.0, 6, 12), coat, 0, 1.0, 0); trunk.rotation.x = Math.PI / 2;
  const neck = add(body, new THREE.CapsuleGeometry(0.2, 0.55, 4, 8), coat, 0, 1.5, 0.75); neck.rotation.x = 0.5;
  const head = add(body, new THREE.CapsuleGeometry(0.17, 0.38, 4, 8), coat, 0, 1.78, 1.08); head.rotation.x = 1.1;
  add(head, new THREE.SphereGeometry(0.04, 6, 6), mat('#2a2018'), 0.13, 0.05, 0.12);
  add(head, new THREE.SphereGeometry(0.04, 6, 6), mat('#2a2018'), -0.13, 0.05, 0.12);
  add(body, new THREE.SphereGeometry(0.15, 8, 8), mat(enemy ? '#2e2429' : '#5a3d2a'), 0, 1.15, -0.95); // tail
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.22, 0.5], [0.22, 0.5], [-0.22, -0.5], [0.22, -0.5]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.75, z); body.add(leg);
    add(leg, new THREE.CapsuleGeometry(0.08, 0.5, 4, 6), coat, 0, -0.32, 0);
    legs.push(leg);
  }
  add(body, new THREE.BoxGeometry(0.7, 0.07, 0.6), mat(st.team), 0, 1.42, 0.05).castShadow = true; // saddle blanket
  // rider
  const rider = biped(st, { tunic: enemy ? '#7a4a58' : st.team, bulk: 0.8, height: 0.8 });
  rider.root.position.set(0, 0.9, 0); rider.legs.forEach(l => (l.visible = false));
  helmet(rider.head, 0.05, 0.3, enemy ? '#8b7480' : PAL.iron, enemy ? undefined : st.team);
  const lance = new THREE.Group(); rider.arm!.add(lance); lance.position.set(0, -0.4, 0.2);
  stick(lance, 2.6).rotation.x = Math.PI / 2 - 0.15;
  const pennant = add(lance, new THREE.ConeGeometry(0.12, 0.4, 3), mat(enemy ? '#a8434f' : st.team), 0, 0.2, 1.25);
  pennant.rotation.x = Math.PI / 2;
  body.add(rider.root);
  return { root, body, legs, arm: rider.arm, height: 2.6 };
}

/** build a unit figure; siege machines try the Kenney models first (async upgrade) */
export function buildRig(type: UnitType, ownerColor: THREE.Color, enemy: boolean, seed: number): Rig {
  const st: Style = { team: ownerColor, enemy, seed };
  let rig: Rig;
  if (type === 'cavalry' || type === 'raider_rider') rig = buildHorse(st, enemy);
  else if (type === 'catapult' || type === 'ram' || type === 'raider_catapult') rig = buildSiege(type, st);
  else if (type === 'castle') rig = { root: new THREE.Group(), body: new THREE.Group(), legs: [], height: 8 };
  else {
    const h = buildHumanoid(type, st);
    rig = { root: h.root, body: h.body, legs: h.legs, arm: h.arm, height: h.height ?? 2 };
  }
  shadow(rig.root);
  // soft blob of team color under every figure helps readability from above
  if (type !== 'castle') {
    const r = type === 'brute' ? 1.1 : type === 'cavalry' || type === 'raider_rider' ? 0.9 : 0.6;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 24),
      new THREE.MeshBasicMaterial({ color: ownerColor, transparent: true, opacity: 0.55, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    rig.root.add(ring);
  }
  return rig;
}

function buildSiege(type: UnitType, st: Style): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const file = type === 'ram' ? 'siege-ram' : 'siege-catapult';
  const size = type === 'ram' ? 3.6 : 3.4;
  // placeholder crate while the GLB loads, replaced when available
  const crate = add(body, new THREE.BoxGeometry(1.6, 0.8, 2.2), mat(PAL.wood), 0, 0.6, 0);
  void modelInstance(file, size).then(m => {
    if (!m) return;
    body.remove(crate);
    m.rotation.y = Math.PI / 2; // kenney models face +z; our figures face +x
    body.add(shadow(m));
  });
  const flag = add(body, new THREE.BoxGeometry(0.5, 0.3, 0.02), mat(st.team), 0.0, 2.9, 0);
  stick(body, 1.2, PAL.wood).position.set(-0.25, 2.5, 0);
  flag.position.set(0, 2.9, 0);
  return { root, body, legs: [], height: 3.2 };
}
