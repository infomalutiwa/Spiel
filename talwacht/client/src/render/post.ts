import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** colour grade after tone mapping: a touch more contrast and saturation, warm highlights, cool shadows, soft vignette */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, sat: { value: 1.12 }, contrast: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette, sat, contrast; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c += vec3(0.025, 0.012, -0.02) * smoothstep(0.45, 1.0, l) + vec3(-0.012, 0.0, 0.022) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/**
 * Post-processing chain: scene → bloom (only bright things glow: fire, magic, gold, lit windows) → tone mapping → grade.
 * Phones get a lighter chain; `?q=low` skips it entirely.
 */
export class Post {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, private phone: boolean) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: phone ? 0 : 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), phone ? 0.28 : 0.38, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(GradeShader));
  }
  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set((w * this.renderer.getPixelRatio()) / (this.phone ? 3 : 2), (h * this.renderer.getPixelRatio()) / (this.phone ? 3 : 2));
  }
  /** at night the lights should glow more */
  setGlow(k: number) { this.bloom.strength = (this.phone ? 0.28 : 0.38) * k; }
  render(dt: number) { this.composer.render(dt); }
}
