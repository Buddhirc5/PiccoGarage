import { UPGRADES, VEHICLES, type UpgradeId, type VehicleId } from './data';

/** Local player progress. (Cloud sync arrives with Google sign-in.) */
export interface Garage { tint: string; glow: string; horn: string; up: Record<UpgradeId, number> }
export interface Progress {
  coins: number; xp: number; km: number; drives: number; overtakes: number; wins: number;
  vehicle: VehicleId; city: string; mode: 'free' | 'race';
  garage: Record<VehicleId, Garage>;
  horns: string[];
  best: Record<string, number>; // best race time (s) per city:vehicle
  controls: 'buttons' | 'wheel';
  playlist: string;
}

const KEY = 'picco.progress.v2';

function fresh(): Progress {
  const garage = {} as Progress['garage'];
  for (const v of VEHICLES) garage[v.id] = { tint: v.defaultTint, glow: '', horn: v.horn, up: { engine: 0, brakes: 0, tyres: 0 } };
  return { coins: 2500, xp: 0, km: 0, drives: 0, overtakes: 0, wins: 0, vehicle: 'pbus', city: 'colombo', mode: 'free', garage,
    horns: ['air', 'steady', 'beep', 'custom'], best: {}, controls: 'buttons', playlist: '' };
}

export const progress: Progress = (() => {
  const base = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) return { ...base, ...raw, garage: { ...base.garage, ...raw.garage } };
  } catch { /* ignore */ }
  return base;
})();

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* storage full or blocked */ }
}

export const level = () => 1 + Math.floor(progress.xp / 1000);

/** Effective stats 0..1 for UI bars and multipliers for physics. */
export function stats(id: VehicleId) {
  const v = VEHICLES.find((x) => x.id === id)!;
  const g = progress.garage[id];
  const top = v.topSpeed * (1 + 0.06 * g.up.engine);
  const accel = v.accel * (1 + 0.1 * g.up.engine);
  const brake = v.brake * (1 + 0.14 * g.up.brakes);
  const steer = v.steer * (1 + 0.05 * g.up.tyres);
  const grip = 1 + 0.1 * g.up.tyres;
  return { top, accel, brake, steer, grip,
    bars: { speed: top / 150, accel: accel / 7, braking: brake / 15, handling: (steer * grip) / 0.9 } };
}

export function buyUpgrade(id: VehicleId, up: UpgradeId): boolean {
  const g = progress.garage[id];
  const def = UPGRADES.find((u) => u.id === up)!;
  const cost = def.costs[g.up[up]];
  if (cost === undefined || progress.coins < cost) return false;
  progress.coins -= cost;
  g.up[up]++;
  save();
  return true;
}

// ── custom horn sound (stored in IndexedDB because audio files are large) ──
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('picco', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveBlob(key: string, data: ArrayBuffer): Promise<void> {
  const d = await db();
  await new Promise<void>((res, rej) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(data, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function loadBlob(key: string): Promise<ArrayBuffer | null> {
  try {
    const d = await db();
    return await new Promise((res) => { const r = d.transaction('blobs').objectStore('blobs').get(key); r.onsuccess = () => res((r.result as ArrayBuffer) ?? null); r.onerror = () => res(null); });
  } catch { return null; }
}
