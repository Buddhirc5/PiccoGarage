import * as THREE from 'three';
import propsMeta from './props.json';
import peopleMeta from './people.json';

/**
 * Realistic photo cut-outs (generated, packed into atlases) drawn as
 * camera-facing quads that turn around their vertical axis, so they read as
 * solid objects from any driving angle. Every layer is one instanced draw.
 */
export type SpriteName = keyof typeof propsMeta;
export type PersonName = keyof typeof peopleMeta;
/** frames/cols/du/dv/fps: an animated block (cols frames per row, du/dv apart, rows going down); absent = a still. */
type Meta = Record<string, { u0: number; v0: number; u1: number; v1: number; aspect: number; frames?: number; cols?: number; du?: number; dv?: number; fps?: number }>;
export interface SpriteSpot { name: string; x: number; z: number; h: number; flip?: boolean }

export const HEIGHT: Record<SpriteName, [number, number]> = {
  palm: [10, 14], palm2: [9, 13], raintree: [10, 14], mango: [7, 9.5], jak: [8, 10.5], banana: [3.8, 5],
  pole: [9, 9.6], halt: [3.1, 3.3], stall: [2.7, 2.9], bike: [1.05, 1.15], hedge: [1.4, 1.9], sign: [3.2, 3.6],
};
export const PERSON_HEIGHT: Record<PersonName, number> = { man: 1.7, woman: 1.6, boy: 1.35, cop: 1.75, dog: 0.75, shrine: 2.2 };

function material(atlas: THREE.Texture, night: boolean, time: { value: number }): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, color: night ? 0x4a5160 : 0xe6e6e6 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    // aAnim = (frames, fps, phase, du): the frame is picked on the GPU, so animating
    // every pedestrian costs nothing on the CPU and stays one draw call
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;\nattribute vec4 aAnim;\nattribute vec2 aGrid;\nuniform float uTime;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        float frame = aAnim.x > 1.0 ? floor(mod(uTime * aAnim.y + aAnim.z, aAnim.x)) : 0.0;
        float col = mod(frame, aGrid.x), row = floor(frame / aGrid.x);
        vMapUv = mix(uvRect.xy, uvRect.zw, uv) + vec2(col * aAnim.w, -row * aGrid.y);`)
      .replace('#include <project_vertex>', `
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sx = instanceMatrix[0][0];
        float sy = length(instanceMatrix[1].xyz);
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 right = normalize(vec3(camRight.x, 0.0, camRight.z) + 1e-5);
        vec3 wp = c + right * (position.x * sx) + vec3(0.0, position.y * sy, 0.0);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'billboard';
  return mat;
}

export interface SpriteLayer {
  group: THREE.Group;
  /** Move or hide instance i (h = 0 hides). */
  set(i: number, x: number, z: number, h: number, flip?: boolean, y?: number): void;
  /** Animation speed for instance i (1 = the strip's own fps, 0 = hold the first frame). */
  rate(i: number, r: number): void;
  /** Advance animation time (seconds). */
  tick(t: number): void;
  commit(): void;
  dispose(): void;
}

function layer(spots: SpriteSpot[], atlas: THREE.Texture, meta: Meta, opts: { night?: boolean; shadows?: boolean; dynamic?: boolean }): SpriteLayer {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const rect = new Float32Array(spots.length * 4);
  const anim = new Float32Array(spots.length * 4);
  const grid = new Float32Array(spots.length * 2);
  const time = { value: 0 };
  const mesh = new THREE.InstancedMesh(geo, material(atlas, !!opts.night, time), Math.max(1, spots.length));
  if (opts.dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.Matrix4();
  const aspects = spots.map((s) => meta[s.name].aspect);
  const set = (i: number, x: number, z: number, h: number, flip = false, y = 0) => {
    const w = h * aspects[i];
    m.makeScale(flip ? -w : w, h, 1).setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
  };
  spots.forEach((s, i) => {
    const r = meta[s.name];
    set(i, s.x, s.z, s.h, s.flip);
    rect.set([r.u0, r.v0, r.u1, r.v1], i * 4);
    const n = r.frames ?? 1;
    anim.set([n, r.fps ?? 0, Math.random() * n, r.du ?? 0], i * 4); // random phase: nobody walks in step
    grid.set([Math.max(1, r.cols ?? n), r.dv ?? 0], i * 2);
  });
  geo.setAttribute('uvRect', new THREE.InstancedBufferAttribute(rect, 4));
  const animAttr = new THREE.InstancedBufferAttribute(anim, 4);
  if (opts.dynamic) animAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAnim', animAttr);
  geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(grid, 2));
  const baseFps = spots.map((s) => meta[s.name].fps ?? 0);
  let animDirty = false;
  const rate = (i: number, r: number) => {
    const v = baseFps[i] * r, o = i * 4, cur = anim[o + 1];
    if (Math.abs(cur - v) < 0.05) return;
    // keep the frame continuous: t*old + phase == t*new + phase'
    anim[o + 2] = (anim[o + 2] + time.value * (cur - v)) % Math.max(1, anim[o]);
    anim[o + 1] = v; animDirty = true;
  };
  mesh.frustumCulled = false;
  group.add(mesh);

  let shGeo: THREE.BufferGeometry | null = null, shMat: THREE.Material | null = null, shTex: THREE.Texture | null = null;
  if (opts.shadows) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    shTex = new THREE.CanvasTexture(cv);
    shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false });
    const sh = new THREE.InstancedMesh(shGeo, shMat, Math.max(1, spots.length));
    spots.forEach((s, i) => {
      const big = s.name === 'palm' || s.name === 'palm2' ? 0.25 : s.name === 'pole' || s.name === 'sign' ? 0.15 : 0.75;
      const d = Math.max(0.8, s.h * aspects[i] * big);
      sh.setMatrixAt(i, m.makeScale(d, 1, d).setPosition(s.x, 0.03, s.z));
    });
    sh.renderOrder = 1;
    group.add(sh);
  }
  return {
    group, set, rate,
    tick(t: number) { time.value = t; },
    commit() { mesh.instanceMatrix.needsUpdate = true; if (animDirty) { animAttr.needsUpdate = true; animDirty = false; } },
    dispose() { geo.dispose(); (mesh.material as THREE.Material).dispose(); shGeo?.dispose(); shMat?.dispose(); shTex?.dispose(); },
  };
}

export function buildSprites(spots: SpriteSpot[], atlas: THREE.Texture, night = false): SpriteLayer {
  return layer(spots, atlas, propsMeta as Meta, { night, shadows: true });
}
export function buildPeople(spots: SpriteSpot[], atlas: THREE.Texture, night = false): SpriteLayer {
  return layer(spots, atlas, peopleMeta as Meta, { night, dynamic: true });
}
