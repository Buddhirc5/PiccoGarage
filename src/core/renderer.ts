import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { settings } from './settings';

/**
 * One WebGL renderer for the whole app. Screens hand it a "stage" (scene +
 * camera + update fn); only the active stage renders, so menus and gameplay
 * share a single GPU context (important on phones).
 */
export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update?(dt: number, t: number): void;
}

let renderer: THREE.WebGLRenderer;
let stage: Stage | null = null;
let paused = false;
let envTex: THREE.Texture | null = null;
const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0, fps = 0;
const frameHooks = new Set<(dt: number) => void>();

export function initRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = settings.quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  applyPixelRatio();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  renderer.setAnimationLoop(loop);
  return renderer;
}

export function applyPixelRatio(): void {
  const cap = settings.quality === 'high' ? 2 : settings.quality === 'medium' ? 1.5 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  renderer.shadowMap.enabled = settings.quality !== 'low';
}

export function getRenderer(): THREE.WebGLRenderer {
  return renderer;
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

/** Stop drawing the 3D scene while an opaque full-screen page covers it (saves battery). */
export function setPaused(p: boolean): void {
  paused = p;
}

export function setStage(s: Stage | null): void {
  stage = s;
  resize();
}

export function currentFps(): number {
  return fps;
}

export function onFrame(fn: (dt: number) => void): () => void {
  frameHooks.add(fn);
  return () => frameHooks.delete(fn);
}

function resize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (stage) {
    stage.camera.aspect = w / h;
    stage.camera.updateProjectionMatrix();
  }
}

function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 1) { fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0; }
  frameHooks.forEach((fn) => fn(dt));
  if (!stage || document.hidden || paused) return;
  stage.update?.(dt, t);
  renderer.render(stage.scene, stage.camera);
}

/** Renders a stage once to an offscreen target and returns a JPEG data URL. */
export function snapshot(s: Stage, w: number, h: number, quality = 0.85, transparent = false): string {
  const prevAspect = s.camera.aspect;
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  s.camera.aspect = w / h;
  s.camera.updateProjectionMatrix();
  renderer.setRenderTarget(rt);
  const prevAlpha = renderer.getClearAlpha();
  if (transparent) renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(s.scene, s.camera);
  if (transparent) renderer.setClearColor(0x000000, prevAlpha);
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  renderer.setRenderTarget(null);
  rt.dispose();
  s.camera.aspect = prevAspect;
  s.camera.updateProjectionMatrix();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  ctx.putImageData(img, 0, 0);
  return transparent ? c.toDataURL('image/webp', quality) : c.toDataURL('image/jpeg', quality);
}
