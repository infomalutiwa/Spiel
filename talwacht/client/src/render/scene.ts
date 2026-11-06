import * as THREE from 'three';
import { clamp, type MapDef } from '@talwacht/shared';
import { onViewport, viewportSize } from '../viewport';
import { Post } from './post';
import { loadSky, setAnisotropy } from './textures';

export const LOW = new URLSearchParams(location.search).get('q') === 'low';
const MOBILE = matchMedia('(pointer: coarse)').matches;

export interface Look { sky: string; horizon: string; fog: string; sun: string; sunI: number; hemiSky: string; hemiGround: string; exposure: number }
export const LOOKS: Record<MapDef['theme'], Look> = {
  green: { sky: '#6fa8d8', horizon: '#f2dcb6', fog: '#cfe2ee', sun: '#ffe2b0', sunI: 2.7, hemiSky: '#fff1d6', hemiGround: '#5a7a3a', exposure: 0.86 },
  gorge: { sky: '#6c9fcc', horizon: '#ecd5b0', fog: '#cde0ec', sun: '#ffdcaa', sunI: 2.6, hemiSky: '#f6ecd6', hemiGround: '#5c6c3c', exposure: 0.92 },
  river: { sky: '#72acd9', horizon: '#f0dfbe', fog: '#d0e3ef', sun: '#ffe4b6', sunI: 2.6, hemiSky: '#fff3dc', hemiGround: '#557a40', exposure: 0.9 },
  snow: { sky: '#86b2dc', horizon: '#e6eef6', fog: '#dfe7ef', sun: '#fff0d8', sunI: 2.2, hemiSky: '#eef3fa', hemiGround: '#7c8898', exposure: 0.82 },
};

/** renderer, camera rig (target + distance + yaw + pitch), sun, sky and fog */
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
  sun = new THREE.DirectionalLight('#ffe2b0', 2.6);
  hemi = new THREE.HemisphereLight('#fff1d6', '#5a7a3a', 1.0);
  target = new THREE.Vector3(250, 0, 400);
  dist = 320; yaw = 0; pitch = 0.95;
  /** world content of the current map */
  content = new THREE.Group();
  post: Post | null = null;
  look: Look = LOOKS.green;
  night = 0;
  hdr = false;
  private skyMat: THREE.ShaderMaterial;
  heightAt: (x: number, z: number) => number = () => 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW && !MOBILE, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : MOBILE ? 1.6 : 2));
    this.renderer.shadowMap.enabled = !LOW;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.content);
    this.sun.castShadow = !LOW;
    const sm = LOW ? 512 : MOBILE ? 1536 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.6;
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, night: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float night; varying vec3 vP;
        void main(){ float h = clamp(vP.y * 1.6 + 0.08, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.7));
        c = mix(c, vec3(0.04,0.06,0.13) + vec3(0.05,0.06,0.12) * (1.0-h), night); gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 24, 12), this.skyMat);
    sky.frustumCulled = false; sky.renderOrder = -1;
    this.scene.add(sky);
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    if (!LOW) loadSky(this.renderer, this.scene, () => { sky.visible = false; this.hdr = true; this.applyLook(); });
    this.scene.fog = new THREE.Fog('#d9dcc4', 500, 1600);
    if (!LOW) this.post = new Post(this.renderer, this.scene, this.camera, MOBILE);
    const resize = () => {
      const { w, h } = viewportSize();
      this.renderer.setSize(w, h, false);
      this.post?.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    };
    onViewport(resize); resize();
    this.applyLook();
  }

  setLook(theme: MapDef['theme']) { this.look = LOOKS[theme]; this.applyLook(); }

  applyLook() {
    const L = this.look, n = this.night;
    const dayFog = new THREE.Color(L.fog), nightFog = new THREE.Color('#1b2234');
    (this.scene.fog as THREE.Fog).color.copy(dayFog.lerp(nightFog, n));
    this.skyMat.uniforms.top.value.set(L.sky); this.skyMat.uniforms.bottom.value.set(L.horizon); this.skyMat.uniforms.night.value = n;
    this.sun.color.set(L.sun).lerp(new THREE.Color('#9db4ff'), n);
    this.sun.intensity = L.sunI * (1 - n * 0.82);
    this.hemi.color.set(L.hemiSky).lerp(new THREE.Color('#5b6ea8'), n);
    this.hemi.groundColor.set(L.hemiGround).lerp(new THREE.Color('#1c2030'), n);
    this.hemi.intensity = 1.0 - n * 0.55;
    this.renderer.toneMappingExposure = L.exposure * (1 - n * 0.25);
    if (this.hdr) { this.scene.backgroundIntensity = 0.95 * (1 - n * 0.88); this.scene.environmentIntensity = 0.35 * (1 - n * 0.7); }
  }

  /** place the camera from the rig and keep the sun's shadow box on what we look at */
  updateCamera() {
    this.dist = clamp(this.dist, 28, 520);
    const t = clamp((this.dist - 28) / 400, 0, 1);
    this.pitch = 0.46 + t * 0.3;
    const ground = this.heightAt(this.target.x, this.target.z);
    this.target.y += (ground - this.target.y) * 0.2;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(this.target.x + Math.sin(this.yaw) * this.dist * cp, this.target.y + this.dist * sp, this.target.z + Math.cos(this.yaw) * this.dist * cp);
    const floor = this.heightAt(this.camera.position.x, this.camera.position.z) + 6; // never inside a cliff
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.camera.lookAt(this.target);
    const fogNear = this.dist * 1.8 + 260; // clear air, only the far horizon fades
    const f = this.scene.fog as THREE.Fog; f.near = fogNear; f.far = fogNear + 900 + this.dist;
    // shadows: a box around the target sized by zoom
    const box = clamp(this.dist * 0.9, 60, 340);
    const c = this.sun.shadow.camera;
    c.left = -box; c.right = box; c.top = box; c.bottom = -box; c.near = 1; c.far = 900; c.updateProjectionMatrix();
    this.sun.position.set(this.target.x + 130, this.target.y + 280, this.target.z + 170);
    this.sun.target.position.copy(this.target);
  }

  render() {
    this.updateCamera();
    if (this.post) { this.post.setGlow(1 + this.night * 1.4); this.post.render(0.016); } else this.renderer.render(this.scene, this.camera);
  }

  clear() {
    this.scene.remove(this.content);
    this.content.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); } });
    this.content = new THREE.Group();
    this.scene.add(this.content);
  }
}
