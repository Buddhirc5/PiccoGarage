import { buildBus } from './bus';
import { buildTuktuk } from './tuktuk';
import type { VehicleModel } from './model';
import type { VehicleDesign } from './types';

export * from './types';
export type { VehicleModel } from './model';

/** Builds any vehicle class from a design. skinSize lowers bus texture size for traffic. */
export function buildVehicle(design: VehicleDesign, opts: { skinSize?: number } = {}): VehicleModel {
  if (design.cls === 'tuktuk') return buildTuktuk(design);
  return buildBus(design, opts);
}
