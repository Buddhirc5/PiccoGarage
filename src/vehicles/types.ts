export type VehicleClass = 'tuktuk' | 'private_bus' | 'public_bus';
export type Finish = 'gloss' | 'metallic' | 'matte';
export type LiveryStyle = 'classic' | 'neon' | 'flame' | 'party' | 'night' | 'plain';
export type NameplateStyle = 'gold' | 'neon' | 'wood';

export interface StickerPlacement {
  id: string;        // sticker library id (flower, star, tiger, peacock, sunmoon, border)
  anchor: string;    // attachment surface id, e.g. 'left', 'right', 'rear', 'front'
  u: number;         // 0..1 along the surface
  v: number;         // 0..1 up the surface
  scale: number;     // 0.3..2
  rot: number;       // radians
}

export interface VehicleDesign {
  cls: VehicleClass;
  /** Paint per zone. Zones depend on the class (see ZONES). */
  paint: Record<string, string>;
  finish: Finish;
  livery: LiveryStyle;
  nameplate: { text: string; style: NameplateStyle; pos: 'front' | 'side' };
  stickers: StickerPlacement[];
  horn: string;
  music: string;
  roof: string[];
  lights: { underglow: string | null; headlight: 'round' | 'quad' | 'led'; interior: string | null };
  interior: { seat: string; dash: string[]; hanging: string | null };
  plate: string;
  route?: { no: string; si: string; ta: string; en: string };
}

export const ZONES: Record<VehicleClass, string[]> = {
  tuktuk: ['body', 'accent', 'roof', 'mudguard', 'rims'],
  private_bus: ['body', 'stripe1', 'stripe2', 'accent', 'bumper'],
  public_bus: ['body', 'stripe1', 'stripe2', 'accent', 'bumper'],
};

export function defaultDesign(cls: VehicleClass): VehicleDesign {
  const base = {
    stickers: [] as StickerPlacement[],
    roof: [] as string[],
    lights: { underglow: null, headlight: 'round' as const, interior: null },
    interior: { seat: 'plain', dash: [] as string[], hanging: null },
    finish: 'gloss' as Finish,
    music: 'none',
  };
  if (cls === 'tuktuk') {
    return {
      ...base,
      cls,
      paint: { body: '#9e1b2a', accent: '#f2c14e', roof: '#1d1d1f', mudguard: '#d9d9de', rims: '#e9e9ec' },
      livery: 'plain',
      nameplate: { text: 'සුදු පුතා', style: 'gold', pos: 'front' },
      horn: 'tuk_beep',
      plate: 'WP QA-1234',
    };
  }
  if (cls === 'private_bus') {
    return {
      ...base,
      cls,
      paint: { body: '#f4f4f2', stripe1: '#1640c8', stripe2: '#3aa0ff', accent: '#d42027', bumper: '#d42027' },
      livery: 'classic',
      nameplate: { text: 'සුපිරි ගමන', style: 'gold', pos: 'front' },
      horn: 'air_deep',
      roof: ['marker_lights', 'horn_trumpets'],
      plate: 'WP ND-2024',
    };
  }
  return {
    ...base,
    cls,
    paint: { body: '#c8161d', stripe1: '#1d3f9a', stripe2: '#f1f1f1', accent: '#1b1b1b', bumper: '#7a0b10' },
    livery: 'plain',
    nameplate: { text: '', style: 'gold', pos: 'front' },
    horn: 'public_steady',
    plate: 'NB-4521',
    route: { no: '138', si: 'කොළඹ - මහරගම', ta: 'கொழும்பு - மகரகம', en: 'Colombo - Maharagama' },
  };
}
