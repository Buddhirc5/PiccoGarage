import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { settings } from './settings';
import { Post, type PostParams } from './post';

/**
 * One WebGL renderer for the whole app. Screens hand it a "stage" (scene +
 * camera + update fn). The canvas is transparent, so menu screens can put
 * type and gradients behind the 3D vehicle; CSS decides where the canvas sits
 * and the renderer follows its size.
 */
export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update?(dt: number, t: number): void;
  /** When set (the drive), the frame goes through bloom/grade/speed blur and resolution adapts to hold 60 fps. */
  post?: PostParams;
}

let renderer: THREE.WebGLRenderer;
let canvas: HTMLCanvasElement;
let stage: Stage | null = null;
let envTex: THREE.Texture | null = null;
let last = 0, time = 0;
let post: Post | null = null;
let prevNow = 0;
/** Dynamic resolution: fraction of the quality's pixel-ratio cap, tuned by frame time. */
let scale = 1;
const FIXED = /[?&]fixres/.test(location.search);
const pace = { acc: 0, n: 0, slow: 0, fast: 0, settle: 0 };

export function initRenderer(el: HTMLCanvasElement): void {
  canvas = el;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.info.autoReset = false; // count every pass of a frame (shadow, scene, bloom, composite)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  applyPixelRatio();
  new ResizeObserver(resize).observe(canvas);
  renderer.setAnimationLoop(loop);
}

const capRatio = () => Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 2 : settings.quality === 'medium' ? 1.5 : 1);
export function applyPixelRatio(): void {
  // phones have 3x screens; rendering at 3x would cost 4x the pixels of 1.5x
  renderer.setPixelRatio(capRatio() * (stage?.post ? scale : 1));
  renderer.shadowMap.enabled = settings.quality !== 'low';
  if (settings.quality === 'low') { post?.dispose(); post = null; }
  resize();
}

/** Compile every shader in a stage up front, so nothing hitches mid-race. */
export async function warmUp(s: Stage): Promise<void> {
  try { await renderer.compileAsync(s.scene, s.camera); } catch { renderer.compile(s.scene, s.camera); }
  if (s.post && settings.quality !== 'low') { ensurePost(); resize(); post!.render(renderer, s.scene, s.camera, s.post, 0); }
}

function ensurePost() {
  if (!post && settings.quality !== 'low') post = new Post(settings.quality === 'high' ? 4 : 2, settings.quality === 'high' ? 5 : 4);
}

/** Shared studio-style environment map for reflections on paint and chrome. */
export function environment(): THREE.Texture {
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return envTex;
}

/**
 * Reflections of the real sky: the city's sky dome, a ground disc and an HDR
 * sun pre-filtered into an environment map, so paint and glass reflect the
 * place you are driving through and catch bright sun glints (which bloom).
 */
export function skyEnvironment(sky: THREE.Mesh, sunOffset: THREE.Vector3, sunColor: THREE.Color, sunPower: number, ground: THREE.Color): THREE.WebGLRenderTarget {
  const sc = new THREE.Scene();
  const dome = new THREE.Mesh(sky.geometry, sky.material); dome.position.y = -20; sc.add(dome);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(950, 24), new THREE.MeshBasicMaterial({ color: ground }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = -2; sc.add(disc);
  let sun: THREE.Mesh | null = null;
  if (sunPower > 0) {
    sun = new THREE.Mesh(new THREE.SphereGeometry(45, 12, 8), new THREE.MeshBasicMaterial({ color: sunColor.clone().multiplyScalar(sunPower) }));
    sun.position.copy(sunOffset).normalize().multiplyScalar(700); sc.add(sun);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.015, 1, 2000);
  pm.dispose(); disc.geometry.dispose(); (disc.material as THREE.Material).dispose();
  if (sun) { sun.geometry.dispose(); (sun.material as THREE.Material).dispose(); }
  return rt;
}

export function setStage(s: Stage | null): void {
  stage = s;
  scale = 1; pace.acc = pace.n = pace.slow = pace.fast = 0; pace.settle = 1.5;
  if (s?.post) ensurePost();
  renderer.setPixelRatio(capRatio());
  canvas.style.visibility = s ? 'visible' : 'hidden';
  resize();
}

function resize() {
  if (!renderer) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  if (post) { const v = renderer.getDrawingBufferSize(new THREE.Vector2()); post.setSize(v.x, v.y); }
  if (stage) { stage.camera.aspect = w / h; stage.camera.updateProjectionMatrix(); }
}

const perf = { upd: 0, ren: 0, n: 0 };
function loop(now: number) {
  const dt = Math.min((now - last) / 1000 || 0, 1 / 20);
  last = now; time += dt;
  if (!stage || document.hidden) return;
  const a = performance.now();
  stage.update?.(dt, time);
  const b = performance.now();
  renderer.info.reset();
  if (stage.post && post) { post.render(renderer, stage.scene, stage.camera, stage.post, time); adapt(now - prevNow); }
  else renderer.render(stage.scene, stage.camera);
  prevNow = now;
  perf.upd += b - a; perf.ren += performance.now() - b; perf.n++;
}

/**
 * Hold the frame rate by trading resolution: average frame time each second;
 * two slow seconds in a row drop 12% of the pixels, four fast ones win 6% back.
 * Steps are small and rare so the change is invisible.
 */
function adapt(frameMs: number) {
  if (FIXED) return;
  if (!(frameMs > 0 && frameMs < 250)) return;
  if (pace.settle > 0) { pace.settle -= frameMs / 1000; return; }
  pace.acc += frameMs; pace.n++;
  if (pace.acc < 1000) return;
  const avg = pace.acc / pace.n; pace.acc = pace.n = 0;
  if (avg > 18.5) { pace.slow++; pace.fast = 0; } else if (avg < 15) { pace.fast++; pace.slow = 0; } else { pace.slow = pace.fast = 0; }
  const min = settings.quality === 'high' ? 0.5 : 0.6;
  let next = scale;
  if (pace.slow >= 2) { next = Math.max(min, scale * 0.88); pace.slow = 0; }
  else if (pace.fast >= 4) { next = Math.min(1, scale * 1.06); pace.fast = 0; }
  if (Math.abs(next - scale) > 0.01) { scale = next; renderer.setPixelRatio(capRatio() * scale); resize(); pace.settle = 0.5; }
}
if (/[?&]debug/.test(location.search)) (window as unknown as { __stage: () => Stage | null }).__stage = () => stage;
if (/[?&]debug/.test(location.search)) (window as unknown as { __perf: unknown }).__perf = () => {
  const i = renderer.info, r = { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, progs: i.programs?.length,
    updMs: +(perf.upd / Math.max(1, perf.n)).toFixed(2), renMs: +(perf.ren / Math.max(1, perf.n)).toFixed(2), px: +renderer.getPixelRatio().toFixed(2), scale: +scale.toFixed(2), post: !!(stage?.post && post) };
  perf.upd = perf.ren = perf.n = 0; return r;
};
