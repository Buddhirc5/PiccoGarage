import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { settings } from './settings';

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
}

let renderer: THREE.WebGLRenderer;
let canvas: HTMLCanvasElement;
let stage: Stage | null = null;
let envTex: THREE.Texture | null = null;
let last = 0, time = 0;

export function initRenderer(el: HTMLCanvasElement): void {
  canvas = el;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  applyPixelRatio();
  new ResizeObserver(resize).observe(canvas);
  renderer.setAnimationLoop(loop);
}

export function applyPixelRatio(): void {
  // phones have 3x screens; rendering at 3x would cost 4x the pixels of 1.5x
  const cap = settings.quality === 'high' ? 2 : settings.quality === 'medium' ? 1.5 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  renderer.shadowMap.enabled = settings.quality !== 'low';
  resize();
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

export function setStage(s: Stage | null): void {
  stage = s;
  canvas.style.visibility = s ? 'visible' : 'hidden';
  resize();
}

function resize() {
  if (!renderer) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  if (stage) { stage.camera.aspect = w / h; stage.camera.updateProjectionMatrix(); }
}

function loop(now: number) {
  const dt = Math.min((now - last) / 1000 || 0, 1 / 20);
  last = now; time += dt;
  if (!stage || document.hidden) return;
  stage.update?.(dt, time);
  renderer.render(stage.scene, stage.camera);
}
