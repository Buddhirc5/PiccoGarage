import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Loads the generated vehicle models (GLB), and normalises them: length along
 * +z (front), wheels on y = 0, scaled to a real-world length in metres.
 */
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Object3D>>();

/** Models come out of image-to-3D with the length along x; flip says the nose points to -x. */
export const MODEL_INFO: Record<string, { length: number; flip: boolean }> = {
  '/assets/models/pbus.glb': { length: 10.6, flip: false },
  '/assets/models/sltb.glb': { length: 10.8, flip: false },
  '/assets/models/tuk.glb': { length: 2.7, flip: false },
  '/assets/models/pink.glb': { length: 12.2, flip: false },
  '/assets/models/leyland.glb': { length: 10.8, flip: false },
  '/assets/models/ashok.glb': { length: 11, flip: false },
  '/assets/models/tukking.glb': { length: 2.75, flip: false },
  '/assets/models/tukneon.glb': { length: 2.75, flip: false },
  '/assets/models/police.glb': { length: 4.6, flip: false },
  '/assets/models/car.glb': { length: 3.9, flip: false },
  '/assets/models/lorry.glb': { length: 6.4, flip: false },
};

/** Lighter versions made offline with meshoptimizer: 1 = near AI (~6k tris), 2 = far AI. */
const lodUrl = (url: string, n: 1 | 2) => url.replace('/models/', '/models/lod/').replace('.glb', `_${n}.glb`);

function prepare(url: string, infoKey = url): Promise<THREE.Object3D> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      const info = MODEL_INFO[infoKey];
      const inner = gltf.scene;
      inner.rotation.y = info.flip ? Math.PI / 2 : -Math.PI / 2; // length x -> z
      inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const s = info.length / size.z;
      const c = box.getCenter(new THREE.Vector3());
      inner.position.set(-c.x * s, -box.min.y * s, -c.z * s);
      inner.scale.setScalar(s);
      const root = new THREE.Group();
      root.add(inner);
      root.userData.size = size.multiplyScalar(s);
      inner.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.envMapIntensity = 1;
        if (mat.map) mat.map.anisotropy = 4;
      });
      return root;
    });
    cache.set(url, p);
  }
  return p;
}

export interface LoadedModel { root: THREE.Object3D; size: THREE.Vector3; setTint(hex: string): void; setFinish(f: 'gloss' | 'metallic' | 'matte'): void; dispose(): void; lod: boolean }

let blob: THREE.Texture | null = null;
/** Soft contact shadow for AI vehicles, far cheaper than a shadow-map caster. */
function blobShadow(size: THREE.Vector3): THREE.Mesh {
  if (!blob) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    blob = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.35, size.z * 1.12), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.7, color: 0x000000 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.renderOrder = 1;
  return m;
}

/**
 * Returns an independent instance (own material, shared geometry/textures).
 * lod: AI vehicles get near/far simplified meshes, no shadow-map casting and a blob shadow.
 */
export async function loadModel(url: string, shareMaterial = false, lod = false, coat = false): Promise<LoadedModel> {
  let root: THREE.Object3D, proto: THREE.Object3D;
  if (lod) {
    const [a, b] = await Promise.all([prepare(lodUrl(url, 1), url), prepare(lodUrl(url, 2), url)]);
    proto = a;
    const big = (MODEL_INFO[url]?.length ?? 4) > 6;
    const l = new THREE.LOD();
    l.addLevel(a.clone(true), 0); l.addLevel(b.clone(true), big ? 90 : 60);
    l.traverse((o) => { o.castShadow = false; });
    root = new THREE.Group(); root.add(l, blobShadow(a.userData.size as THREE.Vector3));
  } else {
    proto = await prepare(url);
    root = proto.clone(true);
  }
  const mats: THREE.MeshStandardMaterial[] = [];
  const tint = { value: new THREE.Color(1, 1, 1) };
  const finish = { value: new THREE.Vector3(0, 0.3, 0.1) }; // x: weight, y: roughness, z: metalness
  if (!shareMaterial) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      let mat: THREE.MeshStandardMaterial;
      if (coat) {
        // clearcoat: a second glossy specular lobe over the paint (masked to bodywork below)
        const ph = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(ph, src);
        ph.defines = { STANDARD: '', PHYSICAL: '' };
        ph.clearcoat = 0.85; ph.clearcoatRoughness = 0.07;
        mat = ph;
      } else mat = src.clone();
      // Repaint only the bodywork: bright, colourless (white) paint takes the tint; glass, tyres and stripes keep theirs.
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTint = tint; sh.uniforms.uFinish = finish;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform vec3 uFinish;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            float paintW;
            { float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)); float mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
              paintW = smoothstep(0.2, 0.42, mx) * (1.0 - smoothstep(0.1, 0.28, (mx - mn) / max(mx, 0.001)));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(mx) * uTint, paintW); }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uFinish.y, paintW * uFinish.x);')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uFinish.z, paintW * uFinish.x);')
          .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= paintW * (1.0 - step(0.85, uFinish.y));\n#endif');
      };
      mat.customProgramCacheKey = () => (coat ? 'bodytint-coat' : 'bodytint');
      m.material = mat; mats.push(mat);
    });
  }
  return {
    root,
    size: (proto.userData.size as THREE.Vector3).clone(),
    setTint(hex) { tint.value.set(hex); },
    setFinish(f) { finish.value.set(f === 'gloss' ? 0.7 : 1, f === 'metallic' ? 0.22 : f === 'matte' ? 0.92 : 0.18, f === 'metallic' ? 0.75 : f === 'matte' ? 0 : 0.15); },
    dispose() { mats.forEach((m) => m.dispose()); },
    lod,
  };
}

export function preload(urls: string[]): Promise<unknown> {
  return Promise.all(urls.map((u) => prepare(u)));
}

/** Shadow-only stand-in (LOD1 on layer 1, which only the sun's shadow camera renders). */
export async function shadowProxy(url: string): Promise<THREE.Object3D> {
  const p = (await prepare(lodUrl(url, 1), url)).clone(true);
  p.traverse((o) => { o.layers.set(1); o.castShadow = true; });
  return p;
}
export const SHADOW_LAYER = 1;
