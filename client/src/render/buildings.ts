import * as THREE from 'three';
import { isBuildingType, type BuildingType, type UnitSnap } from '@burgwacht/shared';
import type { World } from './scene';

const mat = (c: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
const STONE = mat('#a9a39a'), WOOD = mat('#8a5a34'), DARK = mat('#5b3b22'), GOLD = new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.35, metalness: 0.5, emissive: '#7a5a00', emissiveIntensity: 0.35 });
const WHITE = mat('#f3ede0'), RED = mat('#c9423f'), ROCK = mat('#7a6f66');
const BANNER = [mat('#4f8fe8'), mat('#e0698f')];

const box = (m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o;
};
const cyl = (m: THREE.Material, rt: number, rb: number, h: number, x = 0, y = 0, z = 0, seg = 14) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = true; return o;
};

function make(kind: BuildingType, owner: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'bowtower') {
    g.add(cyl(STONE, 1.9, 2.3, 5.2, 0, 2.6), cyl(WOOD, 2.5, 2.5, 0.5, 0, 5.4, 0, 12));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(box(STONE, 0.6, 0.9, 0.6, Math.cos(a) * 2.3, 6.1, Math.sin(a) * 2.3)); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.4, 12), RED); roof.position.y = 7.9; roof.castShadow = true; g.add(roof);
    g.add(cyl(WOOD, 0.08, 0.08, 2.4, 0, 9.4, 0, 6), box(BANNER[owner] ?? BANNER[0], 1.3, 0.8, 0.05, 0.65, 9.9, 0));
    g.add(box(DARK, 0.25, 1.1, 0.12, 1.85, 3.6, 0.4), box(DARK, 0.25, 1.1, 0.12, 1.85, 3.6, -0.4));
  } else if (kind === 'ballista') {
    g.add(box(WOOD, 3.4, 0.5, 3.0, 0, 0.25), cyl(DARK, 0.7, 0.9, 1.6, 0, 1.0, 0, 8));
    const arm = new THREE.Group(); arm.position.y = 2.0;
    arm.add(box(DARK, 4.4, 0.35, 0.5, 0.2, 0, 0), box(WOOD, 0.4, 0.4, 4.6, 1.6, 0, 0), box(mat('#cfc7b8'), 3.4, 0.14, 0.14, 0.6, 0.35, 0));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 6), mat('#8e8e98')); tip.rotation.z = -Math.PI / 2; tip.position.set(2.5, 0.35, 0); arm.add(tip);
    arm.rotation.y = Math.PI; g.add(arm);
    g.add(box(BANNER[owner] ?? BANNER[0], 0.9, 0.55, 0.05, -1.2, 2.1, 1.45));
  } else if (kind === 'goldmine') {
    const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(2.8, 0), ROCK); hill.scale.set(1.2, 0.8, 1.1); hill.position.y = 1.2; hill.castShadow = true; g.add(hill);
    g.add(box(WOOD, 0.4, 2.8, 0.4, 1.9, 1.4, 1.2), box(WOOD, 0.4, 2.8, 0.4, 1.9, 1.4, -1.2), box(WOOD, 0.4, 0.4, 3.2, 1.9, 2.9, 0));
    for (let i = 0; i < 5; i++) { const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.35 + (i % 3) * 0.1), GOLD); n.position.set(-1.5 + i * 0.7, 2.2 + (i % 2) * 0.5, 1.4 - (i % 3) * 0.4); g.add(n); }
    g.add(cyl(DARK, 0.12, 0.12, 2.2, -2.2, 1.1, -1.6, 6), box(BANNER[owner] ?? BANNER[0], 1.0, 0.6, 0.05, -1.7, 2.0, -1.6));
  } else {
    g.add(box(WHITE, 4.6, 2.8, 4.0, 0, 1.4));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 2.0, 4), RED); roof.rotation.y = Math.PI / 4; roof.position.y = 3.8; roof.castShadow = true; g.add(roof);
    g.add(box(RED, 1.5, 0.45, 0.1, 0, 2.0, 2.05), box(RED, 0.45, 1.5, 0.1, 0, 2.0, 2.05), box(DARK, 0.9, 1.4, 0.1, -1.4, 0.7, 2.05));
    g.add(box(BANNER[owner] ?? BANNER[0], 1.0, 0.6, 0.05, 2.3, 3.2, 0));
  }
  return g;
}

interface View { root: THREE.Group; kind: BuildingType; level: number; ring: THREE.Mesh[]; hit: number; hp: number }

/** free-standing player buildings: bow towers, ballistas, goldmines and infirmaries */
export class BuildingViews {
  private views = new Map<number, View>();
  private group = new THREE.Group();
  private t = 0;
  constructor(private world: World) { world.scene.add(this.group); }

  sync(units: UnitSnap[], dt: number) {
    this.t += dt;
    const seen = new Set<number>();
    for (const u of units) {
      if (!isBuildingType(u.type)) continue;
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) {
        const root = make(u.type, u.owner ?? 0);
        v = { root, kind: u.type, level: 1, ring: [], hit: 0, hp: u.hp };
        this.group.add(root); this.views.set(u.id, v);
      }
      if (u.level !== v.level) { // gold rings around the foot show the level
        v.ring.forEach(r => v!.root.remove(r)); v.ring = [];
        for (let i = 1; i < u.level; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(2.7 + i * 0.35, 0.12, 6, 28), GOLD);
          r.rotation.x = Math.PI / 2; r.position.y = 0.2 + i * 0.12; v.root.add(r); v.ring.push(r);
        }
        v.level = u.level;
      }
      if (u.hp < v.hp - 0.5) v.hit = 0.2;
      v.hp = u.hp; v.hit = Math.max(0, v.hit - dt);
      const f = u.hp / u.maxHp;
      v.root.position.set(u.x, this.world.height(u.x, u.y), u.y);
      v.root.scale.setScalar(1 + 0.1 * (u.level - 1));
      v.root.rotation.z = f < 0.4 ? (1 - f / 0.4) * 0.06 : 0;
      v.root.position.x += Math.sin(this.t * 60) * 0.1 * (v.hit / 0.2);
      if (v.kind === 'goldmine') v.root.children.forEach((c, i) => { if (c instanceof THREE.Mesh && c.material === GOLD) c.rotation.y = this.t * 1.2 + i; });
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { this.group.remove(v.root); this.views.delete(id); }
  }
}
