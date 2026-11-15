import * as THREE from 'three';
import type { VehicleClass, VehicleDesign } from './types';
import type { Wheel } from './parts';

/** A built vehicle. root moves through the world; body tilts (roll/pitch) inside it. */
export interface VehicleModel {
  cls: VehicleClass;
  root: THREE.Group;
  body: THREE.Group;
  wheels: Wheel[];
  /** Paint zone -> materials painted with that zone's colour. */
  zones: Record<string, THREE.MeshStandardMaterial[]>;
  headlights: THREE.Mesh[];
  /** Named attachment points (roof, front_plate, rear_plate, dash, stickers…). */
  anchors: Record<string, THREE.Object3D>;
  /** Driver eye position in vehicle space (for the first-person camera). */
  driverEye: THREE.Vector3;
  dims: { length: number; width: number; height: number; wheelBase: number };
  design: VehicleDesign;
  dispose(): void;
}

export function disposeObject(obj: THREE.Object3D, keepShared: Set<THREE.Material | THREE.BufferGeometry>): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!keepShared.has(m.geometry)) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (keepShared.has(mat)) continue;
      const sm = mat as THREE.MeshStandardMaterial;
      sm.map?.dispose();
      mat.dispose();
    }
  });
}
