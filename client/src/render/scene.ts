import * as THREE from 'three';
import type { MapDef } from '@burgwacht/shared';
import { PAL } from './palette';
import { loadModel, modelInstance } from './assets';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** cheap smooth value noise */
function noise2(x: number, y: number) {
  const h = (i: number, j: number) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  target = new THREE.Vector3(60, 0, 45);
  dist = 54;
  yaw = 0;
  pitch = 0.95;
  private clouds: THREE.Object3D[] = [];
  private pollen!: THREE.Points;
  private flags: THREE.Object3D[] = [];
  private zone?: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private t = 0;

  constructor(public canvas: HTMLCanvasElement, public map: MapDef) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 700);
    this.scene.fog = new THREE.Fog(PAL.fog, 150, 360);
    this.scene.background = this.skyTexture();

    this.scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.05));
    this.sun = new THREE.DirectionalLight(PAL.sun, 2.7);
    const c = new THREE.Vector3(map.width / 2, 0, map.depth / 2);
    this.sun.position.set(c.x + 55, 75, c.z + 45);
    this.sun.target.position.copy(c);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -105; sc.right = 105; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 260;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.buildTerrain();
    void this.buildDecor();
    void this.buildCastle();
    this.buildClouds();
    this.buildPollen();
    this.resize();
    addEventListener('resize', () => this.resize());
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
    grad.addColorStop(0, PAL.skyTop); grad.addColorStop(0.55, PAL.skyMid); grad.addColorStop(1, PAL.skyLow);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /** terrain height: flat inside the play field, rolling hills beyond */
  height(x: number, z: number): number {
    const m = this.map;
    const dx = Math.max(-x, 0, x - m.width), dz = Math.max(-z, 0, z - m.depth);
    const out = Math.hypot(dx, dz);
    const hills = (noise2(x * 0.045, z * 0.045) * 9 + noise2(x * 0.12, z * 0.12) * 1.6) * smooth(2, 40, out);
    return hills;
  }

  private buildTerrain() {
    const m = this.map, pad = 110;
    const w = m.width + pad * 2, d = m.depth + pad * 2;
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w / 2), Math.round(d / 2));
    geo.rotateX(-Math.PI / 2);
    geo.translate(m.width / 2, 0, m.depth / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color(PAL.grassA), b = new THREE.Color(PAL.grassB), dry = new THREE.Color(PAL.grassDry);
    const path = new THREE.Color(PAL.path), edge = new THREE.Color(PAL.pathEdge);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      tmp.copy(a).lerp(b, noise2(x * 0.09, z * 0.09));
      tmp.lerp(dry, smooth(0.55, 0.9, noise2(x * 0.03 + 9, z * 0.03)) * 0.5);
      tmp.multiplyScalar(0.94 + noise2(x * 0.6, z * 0.6) * 0.1);
      // dirt lanes winding from spawn to the castle gate
      let best = 99;
      for (const ly of m.lanes) {
        const wob = Math.sin(x * 0.07 + ly) * 2.2;
        const fade = 1 - smooth(m.castle.x + 6, m.castle.x + 24, x) * 0; // lanes run all the way
        best = Math.min(best, Math.abs(z - (lerp(m.castle.y, ly, smooth(m.castle.x + 5, m.castle.x + 45, x)) + wob)) / fade);
      }
      const inX = smooth(m.castle.x, m.castle.x + 6, x) * (1 - smooth(m.width - 2, m.width + 14, x));
      const k = (1 - smooth(1.6, 3.8, best)) * inX;
      tmp.lerp(edge, k * 0.85).lerp(path, k * (1 - smooth(0.5, 2.2, best)) * 0.9);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private async instanced(name: string, targetH: number, spots: { x: number; z: number; s: number; r: number }[]) {
    const src = await loadModel(name);
    if (!src || !spots.length) return;
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
      inst.castShadow = targetH > 1.2; inst.receiveShadow = true;
      this.scene.add(inst);
    }
  }

  private async buildDecor() {
    const m = this.map, R = rng(m.decorSeed);
    const nearLane = (x: number, z: number, margin: number) =>
      x > m.castle.x - 4 && x < m.width + 6 && m.lanes.some(ly => Math.abs(z - ly) < margin);
    const place = (n: number, ok: (x: number, z: number) => boolean, size: [number, number], area?: { x0: number; x1: number; z0: number; z1: number }) => {
      const out: { x: number; z: number; s: number; r: number }[] = [];
      const A = area ?? { x0: -100, x1: m.width + 100, z0: -100, z1: m.depth + 100 };
      for (let i = 0, guard = 0; out.length < n && guard < n * 40; guard++) {
        const x = lerp(A.x0, A.x1, R()), z = lerp(A.z0, A.z1, R());
        if (!ok(x, z)) continue;
        out.push({ x, z, s: lerp(size[0], size[1], R()), r: R() * 6.28 }); i++;
      }
      return out;
    };
    const outside = (x: number, z: number, d: number) => x < -d || x > m.width + d || z < -d || z > m.depth + d;
    const inField = (x: number, z: number) => x > 1 && x < m.width - 1 && z > 1 && z < m.depth - 1;
    // forests framing the field
    const forest = (x: number, z: number) => outside(x, z, 3) && !(x < m.castle.x + 20 && Math.abs(z - m.castle.y) < 30 && x < 40);
    const trees = ['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_pineTallA', 'tree_simple', 'tree_default_fall'];
    for (const t of trees)
      void this.instanced(t, t.includes('pine') ? 11 : 8.5, place(14, forest, [0.8, 1.55]));
    // a few trees sprinkled inside the north/south margins
    void this.instanced('tree_oak', 8, place(10, (x, z) => inField(x, z) && (z < 5 || z > m.depth - 5) && x > 28, [0.8, 1.2]));
    const lowOK = (x: number, z: number) => inField(x, z) && !nearLane(x, z, 3.5)
      && Math.hypot(x - m.castle.x, z - m.castle.y) > 11;
    const zone = m.placeZone;
    const meadow = (x: number, z: number) => lowOK(x, z) && !(x > zone.x0 && x < zone.x1 && z > zone.y0 && z < zone.y1 && R() < 0.8);
    for (const f of ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redB', 'flower_yellowB', 'flower_purpleC'])
      void this.instanced(f, 0.85, place(40, meadow, [0.8, 1.3]));
    void this.instanced('plant_bush', 1.1, place(45, (x, z) => meadow(x, z) || outside(x, z, 2), [0.8, 1.6]));
    void this.instanced('plant_bushLarge', 1.8, place(35, forest, [0.8, 1.5]));
    void this.instanced('grass_large', 0.9, place(120, meadow, [0.8, 1.4]));
    void this.instanced('rock_largeA', 1.6, place(16, (x, z) => (meadow(x, z) || outside(x, z, 2)) && Math.hypot(x - 60, z - 45) > 4, [0.7, 1.8]));
    void this.instanced('rock_largeC', 2.4, place(12, forest, [0.8, 2.2]));
    void this.instanced('mushroom_redGroup', 0.8, place(14, (x, z) => outside(x, z, 2) || (inField(x, z) && (z < 6 || z > m.depth - 6)), [0.8, 1.2]));
    void this.instanced('log_stack', 1.4, place(5, (x, z) => inField(x, z) && (z < 6 || z > m.depth - 6) && x > 30, [0.9, 1.1]));
  }

  private async buildCastle() {
    const m = this.map, T = 2.9, g = new THREE.Group();
    g.position.set(m.castle.x, 0, m.castle.y);
    this.scene.add(g);
    const put = async (name: string, ix: number, level: number, iz: number, size = T, rotY = 0) => {
      const o = await modelInstance(name, size);
      if (!o) return;
      o.position.set(ix * T, level * T, iz * T); o.rotation.y = rotY; g.add(o);
      return o;
    };
    // 5x5 ring: tall corner towers, crenellated wall blocks between, open gate facing the field (east), keep in the middle
    const jobs: Promise<unknown>[] = [];
    for (let ix = -2; ix <= 2; ix++) for (let iz = -2; iz <= 2; iz++) {
      const edge = Math.abs(ix) === 2 || Math.abs(iz) === 2;
      if (!edge) continue;
      const corner = Math.abs(ix) === 2 && Math.abs(iz) === 2;
      if (corner) {
        jobs.push(put('tower-square-base', ix, 0, iz), put('tower-square-mid', ix, 1, iz), put('tower-square-top-roof', ix, 2, iz));
        jobs.push(put('flag', ix, 3, iz, 1.1));
      } else if (!(ix === 2 && iz === 0)) {
        jobs.push(put(Math.abs(ix) === 2 && Math.abs(iz) === 1 ? 'wall' : 'wall', ix, 0, iz));
      } else {
        jobs.push(put('wall-pillar', ix, 0, -0.5 + iz, T * 0.9), put('wall-pillar', ix, 0, 0.5 + iz, T * 0.9));
      }
    }
    jobs.push(put('tower-square-base', 0, 0, 0, T * 1.4), put('tower-square-mid', 0, 1.4, 0, T * 1.3));
    jobs.push(put('tower-square-mid', 0, 2.7, 0, T * 1.3), put('tower-square-top-roof', 0, 4.0, 0, T * 1.35));
    await Promise.all(jobs);
  }

  private buildClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92, emissive: new THREE.Color('#ffe8cc'), emissiveIntensity: 0.25 });
    const R = rng(11);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(R() * 3);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(4 + R() * 4, 12, 10), mat);
        s.position.set(j * 5 - n * 2.5, R() * 2, (R() - 0.5) * 4); s.scale.y = 0.6; c.add(s);
      }
      c.position.set(R() * 260 - 60, 42 + R() * 14, R() * 200 - 60);
      c.userData.v = 0.6 + R() * 0.8;
      this.scene.add(c); this.clouds.push(c);
    }
  }

  private buildPollen() {
    const n = 220, pos = new Float32Array(n * 3), R = rng(5);
    for (let i = 0; i < n; i++) { pos[i * 3] = R() * this.map.width; pos[i * 3 + 1] = 1 + R() * 9; pos[i * 3 + 2] = R() * this.map.depth; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const g = cv.getContext('2d')!; const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,240,190,1)'); rg.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    this.pollen = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.7, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8,
    }));
    this.scene.add(this.pollen);
  }

  /** highlight where troops may be placed during the preparation phase */
  setPlacementZone(visible: boolean) {
    const z = this.map.placeZone;
    if (!this.zone) {
      this.zone = new THREE.Group();
      const w = z.x1 - z.x0, d = z.y1 - z.y0;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
        new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.13, depthWrite: false }));
      plane.rotation.x = -Math.PI / 2; plane.position.set(z.x0 + w / 2, 0.06, z.y0 + d / 2);
      const pts = [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1], [z.x0, z.y0]].map(([x, y]) => new THREE.Vector3(x, 0.08, y));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.8 }));
      this.zone.add(plane, line); this.scene.add(this.zone);
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

  /** pan/zoom, ambient animation and render */
  frame(dt: number, pan: { x: number; z: number }, zoom: number) {
    this.t += dt;
    const m = this.map;
    const speed = this.dist * 0.9;
    this.target.x = Math.min(m.width + 5, Math.max(-5, this.target.x + pan.x * speed * dt));
    this.target.z = Math.min(m.depth + 5, Math.max(-5, this.target.z + pan.z * speed * dt));
    this.dist = Math.min(105, Math.max(24, this.dist * (1 + zoom)));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * this.dist * cp,
      this.target.y + this.dist * sp,
      this.target.z + Math.cos(this.yaw) * this.dist * cp);
    this.camera.lookAt(this.target);

    for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 230) c.position.x = -90; }
    const p = this.pollen.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, p.getY(i) + Math.sin(this.t * 0.6 + i) * 0.004);
      p.setX(i, p.getX(i) + 0.35 * dt + Math.sin(this.t * 0.3 + i * 2) * 0.004);
      if (p.getX(i) > m.width) p.setX(i, 0);
    }
    p.needsUpdate = true;
    this.flags.forEach((f, i) => { f.rotation.z = Math.sin(this.t * 1.7 + i) * 0.04; });
    this.renderer.render(this.scene, this.camera);
  }
}
