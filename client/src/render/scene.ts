import * as THREE from 'three';
import type { MapDef, MapTheme } from '@burgwacht/shared';
import { PAL } from './palette';
import { loadModel, modelInstance } from './assets';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise2(x: number, y: number) {
  const h = (i: number, j: number) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

interface Look { a: string; b: string; dry: string; path: string; edge: string; fog: string; sun: string; sunI: number; exposure: number; skyTop: string; skyMid: string; skyLow: string }
const LOOKS: Record<MapTheme, Look> = {
  meadow: { a: '#93c76c', b: '#7db860', dry: '#bccb72', path: '#dcbd8f', edge: '#c9a574', fog: '#f5d9b4', sun: '#ffd9a0', sunI: 2.7, exposure: 1.08, skyTop: '#8fc4e8', skyMid: '#f8e1b8', skyLow: '#ffd1a1' },
  forest: { a: '#74b45c', b: '#5f9e50', dry: '#a5b862', path: '#cfb48b', edge: '#b99a6c', fog: '#dfe2b4', sun: '#ffe3ae', sunI: 2.5, exposure: 1.02, skyTop: '#86bde0', skyMid: '#e9e8bd', skyLow: '#f6dca6' },
  valley: { a: '#a8c862', b: '#92b858', dry: '#d9bb68', path: '#e1c18e', edge: '#cba670', fog: '#f7d3a8', sun: '#ffc990', sunI: 2.8, exposure: 1.1, skyTop: '#92b8e0', skyMid: '#fadcb0', skyLow: '#ffc08c' },
};

type Spot = { x: number; z: number; s: number; r: number };

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  target = new THREE.Vector3(60, 0, 45);
  dist = 70;
  yaw = 0;
  pitch = 0.95;
  look: Look;
  map: MapDef;
  /** everything that belongs to the current map; replaced wholesale by setMap() */
  private content = new THREE.Group();
  private clouds: THREE.Object3D[] = [];
  private pollen!: THREE.Points;
  private zone?: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private t = 0;
  private sunOffset = new THREE.Vector3(55, 75, 45);

  constructor(public canvas: HTMLCanvasElement, map: MapDef) {
    this.map = map;
    this.look = LOOKS[map.theme];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.look.exposure;
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 1200);
    this.scene.fog = new THREE.Fog(this.look.fog, 260, 640);
    this.scene.background = this.skyTexture();
    this.scene.add(this.content);

    this.scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.05));
    this.sun = new THREE.DirectionalLight(this.look.sun, this.look.sunI);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 80; sc.bottom = -80; sc.near = 10; sc.far = 340; // follows the camera, see frame()
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    this.build();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  private build() {
    const map = this.map;
    this.target.set(map.castle.x + 30, 0, map.castle.y);
    this.buildTerrain();
    void this.buildDecor(this.content);
    void this.buildCastle(this.content);
    this.buildClouds();
    this.buildPollen();
  }

  /** swap to another map: rebuild terrain, scenery, castle and re-tint the light */
  setMap(map: MapDef) {
    if (map.id === this.map.id) return;
    const old = this.content;
    this.scene.remove(old);
    old.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose(); // materials may be shared with the model cache, leave them
    });
    this.content = new THREE.Group();
    this.scene.add(this.content);
    this.clouds = []; this.zone = undefined;
    this.map = map; this.look = LOOKS[map.theme];
    this.renderer.toneMappingExposure = this.look.exposure;
    this.sun.color.set(this.look.sun); this.sun.intensity = this.look.sunI;
    (this.scene.fog as THREE.Fog).color.set(this.look.fog);
    this.scene.background = this.skyTexture();
    this.build();
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private skyTexture() {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const g = cv.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, this.look.skyTop); grad.addColorStop(0.55, this.look.skyMid); grad.addColorStop(1, this.look.skyLow);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /** flat playfield with rolling hills beyond its rim */
  height(x: number, z: number): number {
    const m = this.map;
    const dx = Math.max(-x, 0, x - m.width), dz = Math.max(-z, 0, z - m.depth);
    const out = Math.hypot(dx, dz);
    const amp = m.theme === 'valley' ? 22 : m.theme === 'forest' ? 11 : 9;
    return (noise2(x * 0.03, z * 0.03) * amp + noise2(x * 0.1, z * 0.1) * 2) * smooth(2, 50, out);
  }

  /** distance from (x,z) to the wobbling dirt road between a spawn and the castle */
  private roadDist(x: number, z: number): number {
    const c = this.map.castle;
    let best = 1e9;
    for (const sp of this.map.spawns) {
      const dx = c.x - sp.x, dy = c.y - sp.y, L2 = dx * dx + dy * dy;
      const t = Math.min(1, Math.max(0, ((x - sp.x) * dx + (z - sp.y) * dy) / L2));
      const wob = Math.sin(t * 9 + sp.x * 0.05 + sp.y * 0.13) * 5 * Math.sin(t * Math.PI);
      const L = Math.sqrt(L2), nx = -dy / L, ny = dx / L;
      const px = sp.x + dx * t + nx * wob, py = sp.y + dy * t + ny * wob;
      best = Math.min(best, Math.hypot(x - px, z - py));
    }
    return best;
  }

  private buildTerrain() {
    const m = this.map, pad = 140;
    const w = m.width + pad * 2, d = m.depth + pad * 2;
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w / 2.2), Math.round(d / 2.2));
    geo.rotateX(-Math.PI / 2);
    geo.translate(m.width / 2, 0, m.depth / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color(this.look.a), b = new THREE.Color(this.look.b), dry = new THREE.Color(this.look.dry);
    const path = new THREE.Color(this.look.path), edge = new THREE.Color(this.look.edge);
    const rim = new THREE.Color('#6f9c55');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setY(i, h);
      tmp.copy(a).lerp(b, noise2(x * 0.08, z * 0.08));
      tmp.lerp(dry, smooth(0.55, 0.9, noise2(x * 0.03 + 9, z * 0.03)) * 0.5);
      tmp.multiplyScalar(0.94 + noise2(x * 0.6, z * 0.6) * 0.1);
      tmp.lerp(rim, smooth(3, 14, h) * 0.35); // hills get a deeper green
      const inside = smooth(-2, 3, Math.min(x, m.width - x, z, m.depth - z)); // roads fade out beyond the playfield
      const rd = this.roadDist(x, z);
      const castleFade = smooth(m.castle.x < 100 || true ? 10 : 0, 22, Math.hypot(x - m.castle.x, z - m.castle.y)); // plaza around the castle stays cobbled-dirt
      const k = (1 - smooth(2.2, 5, rd)) * inside * (0.35 + 0.65 * castleFade) + (1 - smooth(9, 20, Math.hypot(x - m.castle.x, z - m.castle.y))) * 0.55;
      tmp.lerp(edge, Math.min(1, k) * 0.85).lerp(path, Math.min(1, k) * (1 - smooth(1, 3, rd) * 0.5) * 0.8);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    mesh.receiveShadow = true;
    this.content.add(mesh);
  }

  /** instanced scatter of a model; `targetH` is the model's height in world units */
  private async instanced(into: THREE.Group, name: string, targetH: number, spots: Spot[], shadows = targetH > 1.2) {
    const src = await loadModel(name);
    if (!src || !spots.length || into !== this.content) return; // map was swapped while the model loaded
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    const k = targetH / Math.max(0.001, box.max.y - box.min.y);
    const meshes: THREE.Mesh[] = [];
    src.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const mesh of meshes) {
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const inst = new THREE.InstancedMesh(geo, mesh.material, spots.length);
      spots.forEach((s, i) => {
        q.setFromAxisAngle(up, s.r);
        m4.compose(new THREE.Vector3(s.x, this.height(s.x, s.z) - box.min.y * k * s.s, s.z), q, new THREE.Vector3(k * s.s, k * s.s, k * s.s));
        inst.setMatrixAt(i, m4);
      });
      inst.castShadow = shadows; inst.receiveShadow = true; inst.frustumCulled = false;
      into.add(inst);
    }
  }

  private async buildDecor(into: THREE.Group) {
    const m = this.map, R = rng(m.decorSeed);
    const area = (m.width * m.depth) / (240 * 150);
    const place = (n: number, ok: (x: number, z: number) => boolean, size: [number, number], pad = 130): Spot[] => {
      const out: Spot[] = [];
      for (let guard = 0; out.length < n && guard < n * 60; guard++) {
        const x = lerp(-pad, m.width + pad, R()), z = lerp(-pad, m.depth + pad, R());
        if (ok(x, z)) out.push({ x, z, s: lerp(size[0], size[1], R()), r: R() * 6.28 });
      }
      return out;
    };
    const outside = (x: number, z: number, d: number) => x < -d || x > m.width + d || z < -d || z > m.depth + d;
    const inField = (x: number, z: number, d = 1) => x > d && x < m.width - d && z > d && z < m.depth - d;
    const onRoad = (x: number, z: number, margin: number) => this.roadDist(x, z) < margin;
    const nearCastle = (x: number, z: number, r: number) => Math.hypot(x - m.castle.x, z - m.castle.y) < r;
    const inZone = (x: number, z: number) => { const zn = m.placeZone; return x > zn.x0 - 4 && x < zn.x1 + 4 && z > zn.y0 - 4 && z < zn.y1 + 4; };

    const dense = m.theme === 'forest' ? 2.6 : m.theme === 'valley' ? 1.2 : 1;
    // framing: forests and mountains beyond the rim
    const rimOk = (x: number, z: number) => outside(x, z, 6);
    const clumps = ['hex/trees_A_large', 'hex/trees_B_large', 'hex/trees_A_medium', 'hex/trees_B_medium'];
    clumps.forEach(n => void this.instanced(into, n, 9, place(Math.round(46 * dense * Math.sqrt(area)), rimOk, [0.9, 1.5])));
    ['hex/tree_single_A', 'hex/tree_single_B'].forEach(n => void this.instanced(into, n, 11, place(Math.round(30 * dense * area), (x, z) => rimOk(x, z) || (m.theme === 'forest' && inField(x, z, 4) && !onRoad(x, z, 9) && !inZone(x, z) && !nearCastle(x, z, 30)), [0.8, 1.4])));
    ['hex/mountain_A_grass_trees', 'hex/mountain_B_grass_trees', 'hex/mountain_C_grass_trees', 'hex/mountain_A_grass'].forEach(n => void this.instanced(into, n, m.theme === 'valley' ? 62 : 44, place(Math.round(9 * area), (x, z) => outside(x, z, 60) && outside(x, z, 60), [0.8, 1.5], 280)));
    ['hex/hills_A_trees', 'hex/hills_B_trees', 'hex/hills_C_trees', 'hex/hills_A'].forEach(n => void this.instanced(into, n, 15, place(Math.round(16 * area), (x, z) => outside(x, z, 22) && !outside(x, z, 120), [0.9, 1.7], 200)));
    // forests also creep into the corners of the playfield
    void this.instanced(into, 'hex/trees_A_large', 9, place(Math.round(24 * dense * area), (x, z) => inField(x, z, 3) && (Math.min(z, m.depth - z) < 22 || (m.theme === 'forest' && Math.min(x, m.width - x) > 40 && Math.abs(z - m.depth / 2) > 50)) && !onRoad(x, z, 12) && !inZone(x, z) && !nearCastle(x, z, 40), [0.8, 1.3]));

    // villages & outposts: cozy buildings off the roads
    const colors = m.theme === 'valley' ? ['green', 'red'] : ['blue', 'red', 'green'];
    const village = (cx: number, cz: number, n: number, rad: number, color: string) => {
      const kinds = ['home_A', 'home_B', 'home_A', 'tavern', 'market', 'well', 'church', 'windmill', 'blacksmith', 'home_B', 'lumbermill'];
      const spots: { name: string; spot: Spot }[] = [];
      for (let i = 0; i < n; i++) {
        const ang = R() * 6.28, rr = Math.sqrt(R()) * rad;
        const x = cx + Math.cos(ang) * rr, z = cz + Math.sin(ang) * rr;
        if (!inField(x, z, 8) || onRoad(x, z, 8) || nearCastle(x, z, 30) || inZone(x, z)) continue;
        spots.push({ name: `hex/building_${kinds[i % kinds.length]}_${color}`, spot: { x, z, s: 0.9 + R() * 0.3, r: Math.round(R() * 4) * (Math.PI / 2) + (R() - 0.5) * 0.4 } });
      }
      const heights: Record<string, number> = { home_A: 5.6, home_B: 5.6, tavern: 8, market: 6, well: 4.5, church: 10, windmill: 9, blacksmith: 6.5, lumbermill: 7 };
      const byName = new Map<string, Spot[]>();
      for (const sp of spots) byName.set(sp.name, [...(byName.get(sp.name) ?? []), sp.spot]);
      for (const [nm, list] of byName)
        void this.instanced(into, nm, heights[nm.replace(/^hex\/building_/, '').replace(/_(blue|red|green)$/, '')] ?? 6, list, true);
    };
    const vSpots: [number, number][] = m.theme === 'forest'
      ? [[m.width * 0.5, m.depth * 0.12], [m.width * 0.72, m.depth * 0.9], [m.castle.x + 70, m.depth * 0.88]]
      : m.theme === 'valley'
        ? [[m.castle.x - 70, m.depth * 0.14], [m.castle.x + 75, m.depth * 0.86], [m.width * 0.12, m.depth * 0.8], [m.width * 0.88, m.depth * 0.18]]
        : [[m.width * 0.5, m.depth * 0.1], [m.width * 0.42, m.depth * 0.9], [m.castle.x + 70, m.depth * 0.5]];
    vSpots.forEach(([x, z], i) => village(x, z, 9, 20, colors[i % colors.length]));
    // camps along the roads
    void this.instanced(into, 'hex/tent', 4.2, place(Math.round(14 * area), (x, z) => inField(x, z, 4) && this.roadDist(x, z) > 10 && this.roadDist(x, z) < 22 && !inZone(x, z) && !nearCastle(x, z, 40), [0.9, 1.2], 0));
    void this.instanced(into, 'hex/barrel', 1.6, place(Math.round(30 * area), (x, z) => inField(x, z, 4) && !onRoad(x, z, 6) && (this.roadDist(x, z) < 22) && !inZone(x, z) && !nearCastle(x, z, 36), [0.8, 1.3], 0));

    // ground cover (Kenney Nature Kit): flowers, bushes, tufts, rocks
    const meadow = (x: number, z: number) => inField(x, z, 2) && !onRoad(x, z, 4) && !nearCastle(x, z, 14);
    for (const f of ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redB', 'flower_yellowB', 'flower_purpleC'])
      void this.instanced(into, f, 1.1, place(Math.round(90 * area), meadow, [0.8, 1.4], 0));
    void this.instanced(into, 'plant_bush', 1.5, place(Math.round(100 * area), (x, z) => meadow(x, z) || outside(x, z, 2), [0.8, 1.7], 30));
    void this.instanced(into, 'plant_bushLarge', 2.2, place(Math.round(60 * dense * area), (x, z) => outside(x, z, 3), [0.8, 1.5]));
    void this.instanced(into, 'grass_large', 1.2, place(Math.round(380 * area), meadow, [0.8, 1.5], 0));
    void this.instanced(into, 'rock_largeA', 2, place(Math.round(30 * area), (x, z) => meadow(x, z) || outside(x, z, 2), [0.7, 2.0], 40));
    void this.instanced(into, 'rock_largeC', 3, place(Math.round(22 * area), rimOk, [0.8, 2.4]));
    void this.instanced(into, 'mushroom_redGroup', 1, place(Math.round(30 * dense * area), (x, z) => rimOk(x, z) || (inField(x, z, 2) && Math.min(z, m.depth - z) < 12), [0.8, 1.3], 20));
    void this.instanced(into, 'log_stack', 1.8, place(Math.round(8 * area), (x, z) => inField(x, z, 3) && Math.min(z, m.depth - z) < 12 && x > 50, [0.9, 1.1], 0));
  }

  private async buildCastle(into: THREE.Group) {
    const m = this.map;
    const g = new THREE.Group();
    g.position.set(m.castle.x, 0, m.castle.y);
    into.add(g);
    const place = async (name: string, width: number, x: number, z: number, rotY = 0) => {
      const o = await modelInstance(name, width);
      if (!o) return;
      o.position.set(x, 0, z); o.rotation.y = rotY; g.add(o);
    };
    await Promise.all([
      place('hex/building_castle_blue', 19, 0, 0),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => place('hex/building_tower_A_blue', 6.4, sx * 12.5, sz * 12.5, Math.atan2(sx, sz))),
      ...[[13.5, -6], [13.5, 6]].map(([x, z]) => place('hex/building_tower_catapult_blue', 5.4, x, z, Math.PI / 2)),
    ]);
  }

  private buildClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92, emissive: new THREE.Color('#ffe8cc'), emissiveIntensity: 0.25 });
    const R = rng(11);
    const n = Math.round(14 * (this.map.width * this.map.depth) / (240 * 150));
    for (let i = 0; i < n; i++) {
      const c = new THREE.Group();
      const k = 4 + Math.floor(R() * 3);
      for (let j = 0; j < k; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(5 + R() * 5, 12, 10), mat);
        s.position.set(j * 6 - k * 3, R() * 2, (R() - 0.5) * 5); s.scale.y = 0.6; c.add(s);
      }
      c.position.set(R() * (this.map.width + 500) - 200, 250 + R() * 50, R() * (this.map.depth + 500) - 200); // above the highest camera so they never block the view
      c.scale.setScalar(2.6);
      c.userData.v = 1.5 + R() * 2.0;
      this.content.add(c); this.clouds.push(c);
    }
  }

  private buildPollen() {
    const n = 260, pos = new Float32Array(n * 3), R = rng(5);
    for (let i = 0; i < n; i++) { pos[i * 3] = (R() - 0.5) * 160; pos[i * 3 + 1] = 1 + R() * 10; pos[i * 3 + 2] = (R() - 0.5) * 110; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const g = cv.getContext('2d')!; const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,240,190,1)'); rg.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    this.pollen = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.8, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    this.pollen.frustumCulled = false;
    this.content.add(this.pollen);
  }

  /** highlight where troops may be placed during the preparation phase */
  setPlacementZone(visible: boolean) {
    const z = this.map.placeZone;
    if (!this.zone) {
      this.zone = new THREE.Group();
      const w = z.x1 - z.x0, d = z.y1 - z.y0;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.12, depthWrite: false }));
      plane.rotation.x = -Math.PI / 2; plane.position.set(z.x0 + w / 2, 0.06, z.y0 + d / 2);
      const pts = [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1], [z.x0, z.y0]].map(([x, y]) => new THREE.Vector3(x, 0.08, y));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.85 }));
      this.zone.add(plane, line); this.content.add(this.zone);
    }
    this.zone.visible = visible;
  }

  /** cursor ray to ground (sim coordinates) */
  screenToGround(px: number, py: number): { x: number; y: number } | undefined {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit) ? { x: hit.x, y: hit.z } : undefined;
  }
  worldToScreen(x: number, y: number, h = 0): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, visible: v.z < 1 };
  }

  /** centre the camera on a point of the map */
  focus(x: number, y: number) {
    this.target.x = Math.min(this.map.width, Math.max(0, x));
    this.target.z = Math.min(this.map.depth, Math.max(0, y));
  }

  /** pan/zoom, ambient animation and render */
  frame(dt: number, pan: { x: number; z: number }, zoom: number) {
    this.t += dt;
    const m = this.map;
    const speed = this.dist * 0.9;
    this.target.x = Math.min(m.width + 5, Math.max(-5, this.target.x + pan.x * speed * dt));
    this.target.z = Math.min(m.depth + 5, Math.max(-5, this.target.z + pan.z * speed * dt));
    this.dist = Math.min(230, Math.max(24, this.dist * (1 + zoom)));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * this.dist * cp,
      this.target.y + this.dist * sp,
      this.target.z + Math.cos(this.yaw) * this.dist * cp);
    this.camera.lookAt(this.target);

    // the shadow window follows the camera so shadows stay crisp on huge maps
    const snap = 2;
    const cx = Math.round(this.target.x / snap) * snap, cz = Math.round(this.target.z / snap) * snap;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + this.sunOffset.x, this.sunOffset.y, cz + this.sunOffset.z);
    const wide = Math.min(2.2, Math.max(1, this.dist / 70));
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - 110 * wide) > 1) { sc.left = -110 * wide; sc.right = 110 * wide; sc.top = 80 * wide; sc.bottom = -80 * wide; sc.updateProjectionMatrix(); }

    for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > m.width + 320) c.position.x = -220; }
    const p = this.pollen.geometry.attributes.position as THREE.BufferAttribute;
    this.pollen.position.set(this.target.x, 0, this.target.z);
    for (let i = 0; i < p.count; i++) {
      p.setY(i, 1 + ((p.getY(i) - 1 + dt * (0.4 + (i % 5) * 0.12)) % 11));
      let x = p.getX(i) + dt * 0.5 + Math.sin(this.t * 0.3 + i * 2) * 0.01;
      if (x > 80) x -= 160;
      p.setX(i, x);
    }
    p.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
