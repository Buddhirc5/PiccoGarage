import * as THREE from 'three';

/**
 * Mobile-sized post-processing for the drive: the scene renders into an HDR
 * (half-float) target, a dual-Kawase bloom runs at 1/2 → 1/16 resolution, and
 * one composite pass adds the bloom, ACES tone mapping, a vivid colour grade,
 * vignette, and (while boosting) a radial speed blur with a slight colour
 * fringe. Total: one full-resolution pass plus a few tiny ones.
 */
export interface PostParams {
  boost: number;     // 0..1, eased in the drive
  speed: number;     // 0..1 of top speed
  flash: number;     // 0..1 white/red hit flash
  night: boolean;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
vec3 pick(vec2 uv) { vec3 c = texture2D(tSrc, uv).rgb; float l = max(c.r, max(c.g, c.b));
  float k = clamp(l - uThreshold + 0.5, 0.0, 1.0); k = k * k * 0.5; // soft knee
  return c * max(k, l - uThreshold) / max(l, 1e-4); }
void main() {
  vec2 o = uTexel;
  vec3 c = pick(vUv) * 0.5 + (pick(vUv + vec2(-o.x, -o.y)) + pick(vUv + vec2(o.x, -o.y)) + pick(vUv + vec2(-o.x, o.y)) + pick(vUv + o)) * 0.125;
  gl_FragColor = vec4(min(c, vec3(24.0)), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb
    + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb
    + texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb
    + (texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + o).rgb
    + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb) * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom, uExposure, uBoost, uFlash, uSat, uContrast, uVignette, uTime;
uniform vec3 uLift, uGain;
varying vec2 vUv;
vec3 aces(vec3 x) { // Narkowicz fit
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  vec3 col;
  if (uBoost > 0.01) {
    // radial speed blur, stronger towards the edges; red/blue split for a fringe
    float r = length(d);
    vec2 step = d * (0.045 * uBoost * smoothstep(0.08, 0.6, r));
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0;
      vec2 p = uv - step * t;
      acc.r += texture2D(tScene, p + step * 0.12).r;
      acc.g += texture2D(tScene, p).g;
      acc.b += texture2D(tScene, p - step * 0.12).b;
    }
    col = acc / 6.0;
  } else col = texture2D(tScene, uv).rgb;
  col += texture2D(tBloom, uv).rgb * uBloom;
  col *= uExposure;
  col = aces(col);
  // grade: lift/gain split-tone, contrast around mid grey, saturation
  col = col * uGain + uLift * (1.0 - col);
  col = (col - 0.5) * uContrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = clamp(col, 0.0, 1.0);
  // vignette (tightens a little while boosting)
  float v = smoothstep(0.85, 0.25 - uBoost * 0.08, length(d * vec2(1.15, 1.0)));
  col *= mix(1.0, v, uVignette + uBoost * 0.25);
  col = mix(col, vec3(1.0, 0.25, 0.2), uFlash * 0.35);
  col = toSRGB(col);
  // dither to stop sky banding
  col += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  private scene: THREE.WebGLRenderTarget;
  private mips: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bright: THREE.ShaderMaterial;
  private down: THREE.ShaderMaterial;
  private up: THREE.ShaderMaterial;
  readonly comp: THREE.ShaderMaterial;
  private levels: number;
  private black: THREE.DataTexture;

  constructor(samples: number, levels = 4) {
    const opt = { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: true, generateMipmaps: false });
    this.levels = levels;
    for (let i = 0; i < levels; i++) this.mips.push(new THREE.WebGLRenderTarget(1, 1, opt));
    for (let i = 0; i < levels - 1; i++) this.ups.push(new THREE.WebGLRenderTarget(1, 1, opt));
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    const mk = (fs: string, u: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.bright = mk(BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } });
    this.down = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.comp = mk(COMPOSITE, {
      tScene: { value: this.scene.texture }, tBloom: { value: null }, uBloom: { value: 0.55 }, uExposure: { value: 1.0 },
      uBoost: { value: 0 }, uFlash: { value: 0 }, uSat: { value: 1.14 }, uContrast: { value: 1.08 }, uVignette: { value: 0.35 }, uTime: { value: 0 },
      uLift: { value: new THREE.Vector3(0.0, 0.012, 0.03) }, uGain: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
    });
    // one oversized triangle covers the screen
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g, this.comp);
    this.quad.frustumCulled = false;
  }

  setSize(w: number, h: number): void {
    this.scene.setSize(w, h);
    let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) { this.mips[i].setSize(mw, mh); if (i < this.levels - 1) this.ups[i].setSize(mw, mh); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
  }

  private pass(r: THREE.WebGLRenderer, m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = m;
    r.setRenderTarget(target);
    r.render(this.quad, this.cam);
  }

  render(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, p: PostParams, t: number): void {
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    // bloom chain
    this.bright.uniforms.tSrc.value = this.scene.texture;
    this.bright.uniforms.uTexel.value.set(1 / this.scene.width, 1 / this.scene.height);
    this.bright.uniforms.uThreshold.value = p.night ? 1.0 : 1.05;
    this.pass(r, this.bright, this.mips[0]);
    for (let i = 1; i < this.levels; i++) {
      this.down.uniforms.tSrc.value = this.mips[i - 1].texture;
      this.down.uniforms.uTexel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
      this.pass(r, this.down, this.mips[i]);
    }
    let src = this.mips[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.up.uniforms.tSrc.value = src.texture;
      this.up.uniforms.tAdd.value = this.mips[i].texture;
      this.up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(r, this.up, this.ups[i]);
      src = this.ups[i];
    }
    const u = this.comp.uniforms;
    u.tBloom.value = src.texture;
    u.uBloom.value = p.night ? 0.7 : 0.5;
    u.uExposure.value = p.night ? 1.45 : 0.95;
    u.uBoost.value = p.boost;
    u.uFlash.value = p.flash;
    u.uTime.value = t % 100;
    this.pass(r, this.comp, null);
    r.toneMapping = tm;
  }

  dispose(): void {
    this.scene.dispose(); this.mips.forEach((m) => m.dispose()); this.ups.forEach((m) => m.dispose());
    [this.bright, this.down, this.up, this.comp].forEach((m) => m.dispose()); this.quad.geometry.dispose(); this.black.dispose();
  }
}
