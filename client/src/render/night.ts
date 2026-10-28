import * as THREE from 'three';
import type { MapDef } from '@burgwacht/shared';
import { PAL } from './palette';
import type { World } from './scene';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** how deep into the night wave `w` (0-based) is: bright days first, dusk in the middle, deep night for the last waves */
export const nightLevel = (wave: number) => [0, 0, 0, 0.08, 0.3, 0.55, 0.8, 0.95, 1, 1, 1, 1][Math.min(11, Math.max(0, wave))];

const NIGHT = {
  skyTop: new THREE.Color('#0a1130'), skyMid: new THREE.Color('#1d2c63'), skyLow: new THREE.Color('#4a5594'),
  fog: new THREE.Color('#141d3a'), hemiSky: new THREE.Color('#41549a'), hemiGround: new THREE.Color('#1b2238'),
  sun: new THREE.Color('#a6c0ff'), cloud: new THREE.Color('#566495'), pollen: new THREE.Color('#c9ff7e'),
};

function glowTexture(stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!, rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, c] of stops) rg.addColorStop(o, c);
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

interface Flame { core: THREE.Sprite; halo: THREE.Sprite; ph: number; base: number; always: boolean }

/** day → dusk → night: sky, stars, moon, moonlight, fog, torches on the walls, lanterns, fireflies */
export class NightCycle {
  level = 0;
  target = 0;
  private lastSky = -1;
  private stars: THREE.Points;
  private moon: THREE.Sprite;
  private torches = new THREE.Group();
  private flames: Flame[] = [];
  private lights: THREE.PointLight[] = [];
  private t = 0;
  private flameTex = glowTexture([[0, 'rgba(255,244,200,1)'], [0.25, 'rgba(255,190,90,0.9)'], [0.6, 'rgba(255,120,40,0.35)'], [1, 'rgba(255,90,20,0)']]);
  private haloTex = glowTexture([[0, 'rgba(255,170,80,0.55)'], [0.5, 'rgba(255,130,50,0.18)'], [1, 'rgba(255,110,40,0)']]);
  private day = { sky: [new THREE.Color(), new THREE.Color(), new THREE.Color()], tmp: new THREE.Color() };

  constructor(private w: World) {
    const R = (() => { let s = 77; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = R() * Math.PI * 2, ph = Math.acos(0.12 + R() * 0.88), r = 900;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r; pos[i * 3 + 1] = Math.cos(ph) * r; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#e6ecff', size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -2; this.stars.visible = false;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,248,1)'], [0.38, 'rgba(240,244,255,0.95)'], [0.46, 'rgba(190,210,255,0.35)'], [1, 'rgba(150,180,255,0)']]), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.moon.scale.setScalar(150); this.moon.renderOrder = -1; this.moon.visible = false;
    w.scene.add(this.stars, this.moon, this.torches);
  }

  /** same spots as the campfire props in scene.ts */
  private camps(map: MapDef) { return [{ x: map.zones[0].x - 6, z: 20 }, { x: map.zones[0].x + 8, z: map.depth - 20 }, { x: map.zones[1].x - 12, z: 22 }]; }

  /** torches along the wall crowns, braziers at the keep, lanterns on the capture poles and a few real lights */
  rebuild(map: MapDef) {
    this.torches.clear(); this.flames = []; this.lights.forEach(l => l.removeFromParent()); this.lights = [];
    const add = (x: number, y: number, z: number, size = 1.6, always = false) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 }));
      post.position.set(x, y - 0.45, z); post.castShadow = false;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#3b3029', roughness: 0.8 }));
      bowl.position.set(x, y + 0.02, z);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      core.position.set(x, y + 0.45, z); core.scale.setScalar(size * 0.9);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      halo.position.set(x, y + 0.5, z); halo.scale.setScalar(size * 5.2);
      this.torches.add(post, bowl, core, halo);
      this.flames.push({ core, halo, ph: x * 0.7 + z * 1.3, base: size, always });
    };
    for (const b of map.barriers) {
      for (let y = 12; y < map.depth - 8; y += 11) { if (Math.abs(y - b.gateY) > 13) add(b.x - 0.9, 3.75, y); }
      for (const s of [-1, 1]) add(b.x - 2.2, 3.1, b.gateY + s * 5.6, 1.9);
    }
    const k = map.castle;
    for (const s of [-1, 1]) { add(k.x + 13, 0.9, k.y + s * 10, 2.4); add(k.x + 22, 0.9, k.y + s * 7, 2.0); }
    for (const z of map.zones) add(z.x + 0.4, 7.4, z.y, 2.2); // lantern on top of the capture pole
    for (const c of this.camps(map)) add(c.x, 0.55, c.z, 2.1, true); // campfires burn day and night
    const spots: [number, number, number][] = [[map.barriers[0].x - 5, 4.5, map.barriers[0].gateY], [map.barriers[1].x - 5, 4.5, map.barriers[1].gateY], [k.x + 14, 4, k.y], [map.zones[0].x, 5, map.zones[0].y]];
    const phone = matchMedia('(pointer: coarse)').matches;
    spots.slice(0, phone ? 2 : 4).forEach(([x, y, z]) => {
      const l = new THREE.PointLight('#ffb468', 0, 46, 1.6); l.position.set(x, y, z); this.w.scene.add(l); this.lights.push(l);
    });
    this.lastSky = -1;
  }

  update(dt: number) {
    this.t += dt;
    const w = this.w;
    this.level += (this.target - this.level) * Math.min(1, dt * 0.9);
    if (Math.abs(this.target - this.level) < 0.002) this.level = this.target;
    const n = this.level, look = w.look;
    document.documentElement.style.setProperty('--night', n.toFixed(3));
    const tmp = this.day.tmp;
    // light
    w.hemi.color.set(PAL.hemiSky).lerp(NIGHT.hemiSky, n); w.hemi.groundColor.set(PAL.hemiGround).lerp(NIGHT.hemiGround, n); w.hemi.intensity = lerp(1.05, 0.62, n);
    w.sun.color.set(look.sun).lerp(NIGHT.sun, n); w.sun.intensity = lerp(look.sunI, 1.15, n);
    const fog = w.scene.fog as THREE.Fog;
    fog.color.set(look.fog).lerp(NIGHT.fog, n); fog.near = lerp(260, 170, n); fog.far = lerp(640, 470, n);
    w.renderer.toneMappingExposure = lerp(look.exposure, 0.98, n);
    // sky
    if (Math.abs(n - this.lastSky) > 0.025 || this.lastSky < 0) {
      this.lastSky = n;
      const c = [new THREE.Color(look.skyTop).lerp(NIGHT.skyTop, n), new THREE.Color(look.skyMid).lerp(NIGHT.skyMid, n), new THREE.Color(look.skyLow).lerp(NIGHT.skyLow, n)];
      // dusk: the horizon glows orange while the day fades
      c[2].lerp(tmp.set('#ff8a5a'), smooth(0.1, 0.45, n) * (1 - smooth(0.55, 1, n)) * 0.55);
      w.paintSky(c.map(x => `#${x.getHexString()}`) as [string, string, string]);
    }
    const night = smooth(0.3, 0.85, n), cam = w.camera.position;
    this.stars.visible = night > 0.02; this.stars.position.copy(cam); (this.stars.material as THREE.PointsMaterial).opacity = night * 0.9;
    this.moon.visible = night > 0.02; this.moon.position.set(cam.x - 330, cam.y + 360, cam.z - 420); (this.moon.material as THREE.SpriteMaterial).opacity = night;
    // clouds & fireflies
    w.cloudMat.color.set('#ffffff').lerp(NIGHT.cloud, n); w.cloudMat.emissiveIntensity = lerp(0.25, 0.02, n);
    w.pollenMat.color.set('#ffeebb').lerp(NIGHT.pollen, n); w.pollenMat.size = lerp(0.8, 1.25, n);
    // fire
    const fire = smooth(0.12, 0.6, n);
    this.torches.visible = true;
    for (const f of this.flames) {
      const on = f.always ? Math.max(fire, 0.55) : fire;
      const fl = 0.86 + Math.sin(this.t * 11 + f.ph) * 0.07 + Math.sin(this.t * 23 + f.ph * 2) * 0.05 + Math.random() * 0.03;
      f.core.scale.setScalar(f.base * 0.9 * fl * on); f.halo.scale.setScalar(f.base * 5.2 * (0.92 + fl * 0.1) * on);
      (f.halo.material as THREE.SpriteMaterial).opacity = f.always ? 0.25 + fire * 0.75 : fire;
      f.core.visible = f.halo.visible = on > 0.01;
    }
    this.lights.forEach((l, i) => { l.intensity = fire * 90 * (0.93 + Math.sin(this.t * 9 + i * 2) * 0.07); });
  }
}
