import * as THREE from 'three';
import type { Finish } from './types';

/** Shared, cached geometries and materials so many vehicles stay cheap. */
const geoCache = new Map<string, THREE.BufferGeometry>();
export function cachedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

const matCache = new Map<string, THREE.Material>();
export function cachedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
}

export function finishParams(f: Finish): { metalness: number; roughness: number } {
  if (f === 'metallic') return { metalness: 0.65, roughness: 0.28 };
  if (f === 'matte') return { metalness: 0.0, roughness: 0.85 };
  return { metalness: 0.15, roughness: 0.32 };
}

export function paintMat(hex: string, finish: Finish): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, ...finishParams(finish) });
}

export const M = {
  chrome: () => cachedMat('chrome', () => new THREE.MeshStandardMaterial({ color: 0xe8ebf0, metalness: 1, roughness: 0.18 })),
  black: () => cachedMat('black', () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7 })),
  tyre: () => cachedMat('tyre', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.92 })),
  glass: () => cachedMat('glass', () => new THREE.MeshStandardMaterial({
    color: 0x9fb4c8, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false,
  })),
  headlight: () => cachedMat('headlight', () => new THREE.MeshStandardMaterial({
    color: 0xfffbe8, emissive: 0xfff3c4, emissiveIntensity: 0.6, roughness: 0.2,
  })),
  amber: () => cachedMat('amber', () => new THREE.MeshStandardMaterial({
    color: 0xffa31a, emissive: 0xff8a00, emissiveIntensity: 0.9, roughness: 0.4,
  })),
  red: () => cachedMat('redlamp', () => new THREE.MeshStandardMaterial({
    color: 0xff2a2a, emissive: 0xff0000, emissiveIntensity: 0.5, roughness: 0.4,
  })),
  seat: () => cachedMat('seat', () => new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.8 })),
};

export interface Wheel {
  mesh: THREE.Object3D;   // spins around local x
  pivot: THREE.Object3D;  // steers around local y
  steer: boolean;
  radius: number;
}

/** A wheel: tyre + rim + hub. Returns pivot (for steering) containing the spinning wheel. */
export function makeWheel(radius: number, width: number, rimMat: THREE.Material, whitewall = false): Wheel {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tyre = new THREE.Mesh(
    cachedGeo(`tyre${radius}_${width}`, () => new THREE.CylinderGeometry(radius, radius, width, 18, 1).rotateZ(Math.PI / 2)),
    M.tyre(),
  );
  spin.add(tyre);
  const rimGeo = cachedGeo(`rim${radius}_${width}`, () =>
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width * 1.04, 14, 1).rotateZ(Math.PI / 2));
  spin.add(new THREE.Mesh(rimGeo, rimMat));
  if (whitewall) {
    const ww = new THREE.Mesh(
      cachedGeo(`ww${radius}_${width}`, () => new THREE.TorusGeometry(radius * 0.78, radius * 0.08, 6, 20).rotateY(Math.PI / 2)),
      cachedMat('whitewall', () => new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 })),
    );
    ww.position.x = width * 0.52;
    const ww2 = ww.clone();
    ww2.position.x = -width * 0.52;
    spin.add(ww, ww2);
  }
  // spokes / bolts so rotation is visible
  const bolt = cachedGeo(`bolt${radius}`, () => new THREE.BoxGeometry(width * 1.1, radius * 0.9, radius * 0.12));
  const b = new THREE.Mesh(bolt, M.black());
  spin.add(b);
  return { mesh: spin, pivot, steer: false, radius };
}

/** Canvas texture helper for small labels such as number plates. */
export function labelTexture(
  w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function plateMesh(text: string, w = 0.52, h = 0.12, yellow = false): THREE.Mesh {
  const tex = labelTexture(256, 64, (ctx, cw, ch) => {
    ctx.fillStyle = yellow ? '#ffd23f' : '#f4f4f4';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, cw - 6, ch - 6);
    ctx.fillStyle = '#111';
    ctx.font = '800 40px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cw / 2, ch / 2 + 2, cw - 16);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
}
