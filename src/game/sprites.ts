import * as THREE from 'three';
import meta from './props.json';

/**
 * Realistic trees and roadside props as photo cut-outs (generated, packed in
 * one atlas). Each one is a quad that turns around its vertical axis to face
 * the camera, so it reads as a solid object from any driving angle. All of
 * them draw in one instanced call, with a soft contact shadow underneath.
 */
export type SpriteName = keyof typeof meta;
export interface SpriteSpot { name: SpriteName; x: number; z: number; h: number; flip?: boolean }

export const HEIGHT: Record<SpriteName, [number, number]> = {
  palm: [10, 14], palm2: [9, 13], raintree: [10, 14], mango: [7, 9.5], jak: [8, 10.5], banana: [3.8, 5],
  pole: [9, 9.6], halt: [3.1, 3.3], stall: [2.7, 2.9], bike: [1.05, 1.15], hedge: [1.4, 1.9], sign: [3.2, 3.6],
};

export function buildSprites(spots: SpriteSpot[], atlas: THREE.Texture, fogColor: THREE.Color): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const rect = new Float32Array(spots.length * 4);
  const mesh = new THREE.InstancedMesh(geo, undefined as unknown as THREE.Material, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((s, i) => {
    const r = meta[s.name];
    const w = s.h * r.aspect;
    m.makeScale(s.flip ? -w : w, s.h, 1).setPosition(s.x, 0, s.z);
    mesh.setMatrixAt(i, m);
    rect.set([r.u0, r.v0, r.u1, r.v1], i * 4);
  });
  geo.setAttribute('uvRect', new THREE.InstancedBufferAttribute(rect, 4));

  const mat = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xe6e6e6 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = mix(uvRect.xy, uvRect.zw, uv);')
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
  mesh.material = mat;
  mesh.frustumCulled = false;
  group.add(mesh);

  // soft contact shadows (flat discs), so props sit on the ground
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const shTex = new THREE.CanvasTexture(cv);
  const shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, color: 0xffffff });
  const sh = new THREE.InstancedMesh(shGeo, shMat, spots.length);
  spots.forEach((s, i) => {
    const r = meta[s.name], big = s.name === 'palm' || s.name === 'palm2' ? 0.25 : s.name === 'pole' || s.name === 'sign' ? 0.15 : 0.75;
    const d = Math.max(0.8, s.h * r.aspect * big);
    sh.setMatrixAt(i, m.makeScale(d, 1, d).setPosition(s.x, 0.03, s.z));
  });
  sh.renderOrder = 1;
  group.add(sh);
  void fogColor;
  return { group, dispose() { geo.dispose(); mat.dispose(); shGeo.dispose(); shMat.dispose(); shTex.dispose(); } };
}
