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
  '/assets/models/car.glb': { length: 3.9, flip: false },
  '/assets/models/lorry.glb': { length: 6.4, flip: false },
};

function prepare(url: string): Promise<THREE.Object3D> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      const info = MODEL_INFO[url];
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

export interface LoadedModel { root: THREE.Object3D; size: THREE.Vector3; setTint(hex: string): void; dispose(): void }

/** Returns an independent instance (own material, shared geometry/textures). */
export async function loadModel(url: string, shareMaterial = false): Promise<LoadedModel> {
  const proto = await prepare(url);
  const root = proto.clone(true);
  const mats: THREE.MeshStandardMaterial[] = [];
  const tint = { value: new THREE.Color(1, 1, 1) };
  if (!shareMaterial) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      // Repaint only the bodywork: bright, colourless (white) paint takes the tint; glass, tyres and stripes keep theirs.
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTint = tint;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            { float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)); float mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
              float wgt = smoothstep(0.2, 0.42, mx) * (1.0 - smoothstep(0.1, 0.28, (mx - mn) / max(mx, 0.001)));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(mx) * uTint, wgt); }`);
      };
      mat.customProgramCacheKey = () => 'bodytint';
      m.material = mat; mats.push(mat);
    });
  }
  return {
    root,
    size: (proto.userData.size as THREE.Vector3).clone(),
    setTint(hex) { tint.value.set(hex); },
    dispose() { mats.forEach((m) => m.dispose()); },
  };
}

export function preload(urls: string[]): Promise<unknown> {
  return Promise.all(urls.map(prepare));
}
