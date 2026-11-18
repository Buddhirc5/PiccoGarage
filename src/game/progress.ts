import { EVENTS, chapterStarsNeeded, type EventSpec } from './career';
import { MAX_LEVEL, UPGRADES, VEHICLES, upgradeCost, type Finish, type UpgradeId, type VehicleId } from './data';

/** Local player progress, saved on the device. (Cloud sync arrives with sign-in.) */
export interface Garage { tint: string; finish: Finish; glow: string; horn: string; plate: string; up: Record<UpgradeId, number> }
export type ChallengeKind = 'drift' | 'nearmiss' | 'km' | 'win' | 'passengers' | 'overtake' | 'boost' | 'escape';
export interface Challenge { kind: ChallengeKind; goal: number; have: number; reward: number; done: boolean }
export interface Playlist { name: string; url: string }

export interface Progress {
  coins: number; gems: number; xp: number;
  km: number; drives: number; overtakes: number; wins: number; nearMisses: number; driftBest: number; passengers: number; escapes: number; catches: number;
  vehicle: VehicleId; owned: VehicleId[];
  garage: Record<VehicleId, Garage>;
  horns: string[]; finishes: Finish[];
  stars: Record<string, number>;        // event id -> best stars
  best: Record<string, number>;         // event id -> best time/score
  lastEvent: string;
  freeCity: string;
  daily: { day: string; streak: number; claimed: boolean };
  challenges: { day: string; list: Challenge[] };
  controls: 'buttons' | 'wheel' | 'tilt';
  autoGas: boolean; sensitivity: number; haptics: boolean; tiltInvert: boolean;
  tutorial: boolean;
  playlists: Playlist[]; playlist: number;
  levelSeen: number;
}

const KEY = 'picco.progress.v3';
const OLD = 'picco.progress.v2';

function garageFor(id: VehicleId): Garage {
  const v = VEHICLES.find((x) => x.id === id)!;
  return { tint: v.defaultTint, finish: 'gloss', glow: id === 'tukneon' ? '#00e5ff' : '', horn: v.horn, plate: '', up: { engine: 0, gearbox: 0, tyres: 0, brakes: 0, turbo: 0 } };
}

function fresh(): Progress {
  const garage = {} as Progress['garage'];
  for (const v of VEHICLES) garage[v.id] = garageFor(v.id);
  return {
    coins: 2500, gems: 5, xp: 0, km: 0, drives: 0, overtakes: 0, wins: 0, nearMisses: 0, driftBest: 0, passengers: 0, escapes: 0, catches: 0,
    vehicle: 'tuk', owned: ['tuk', 'pbus'], garage, horns: ['air', 'steady', 'beep', 'custom'], finishes: ['gloss'],
    stars: {}, best: {}, lastEvent: EVENTS[0].id, freeCity: 'colombo',
    daily: { day: '', streak: 0, claimed: false }, challenges: { day: '', list: [] },
    controls: 'buttons', autoGas: false, sensitivity: 1, haptics: true, tiltInvert: false, tutorial: false,
    playlists: [], playlist: 0, levelSeen: 1,
  };
}

function load(): Progress {
  const base = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      const p = { ...base, ...raw, garage: { ...base.garage } } as Progress;
      for (const v of VEHICLES) p.garage[v.id] = { ...base.garage[v.id], ...(raw.garage?.[v.id] ?? {}), up: { ...base.garage[v.id].up, ...(raw.garage?.[v.id]?.up ?? {}) } };
      return p;
    }
    // carry over a v2 save
    const old = JSON.parse(localStorage.getItem(OLD) || 'null');
    if (old) {
      base.coins = old.coins ?? base.coins; base.xp = old.xp ?? 0; base.km = old.km ?? 0; base.drives = old.drives ?? 0;
      base.overtakes = old.overtakes ?? 0; base.wins = old.wins ?? 0;
      if (old.playlist) base.playlists.push({ name: 'My playlist', url: old.playlist });
      for (const id of ['tuk', 'pbus', 'sltb', 'pink'] as VehicleId[]) {
        const g = old.garage?.[id];
        if (!g) continue;
        Object.assign(base.garage[id], { tint: g.tint ?? base.garage[id].tint, glow: g.glow ?? '', horn: g.horn ?? base.garage[id].horn });
        for (const k of ['engine', 'brakes', 'tyres'] as UpgradeId[]) base.garage[id].up[k] = Math.min(MAX_LEVEL, g.up?.[k] ?? 0);
      }
      if (old.drives > 0) base.tutorial = true;
    }
  } catch { /* ignore */ }
  return base;
}

export const progress: Progress = load();

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* storage full or blocked */ }
}

// ── levels ──────────────────────────────────────────────────────────────────
/** XP needed to go from level n to n+1. */
const need = (n: number) => 600 + n * 250;
export function levelInfo(xp = progress.xp) {
  let lv = 1, left = xp;
  while (left >= need(lv)) { left -= need(lv); lv++; }
  return { level: lv, into: left, next: need(lv), pct: left / need(lv) };
}
export const level = () => levelInfo().level;
export const levelReward = (lv: number) => ({ coins: 300 + lv * 100, gems: lv % 5 === 0 ? 10 : 2 });

// ── vehicle stats, PR and class ─────────────────────────────────────────────
export function stats(id: VehicleId) {
  const v = VEHICLES.find((x) => x.id === id)!;
  const u = progress.garage[id].up;
  const top = v.topSpeed * (1 + 0.045 * u.engine);
  const accel = v.accel * (1 + 0.07 * u.gearbox + 0.02 * u.engine);
  const brake = v.brake * (1 + 0.1 * u.brakes);
  const steer = v.steer * (1 + 0.035 * u.tyres);
  const grip = v.grip * (1 + 0.08 * u.tyres);
  const boost = 1 + 0.12 * u.turbo;
  const pr = Math.round(top * 1.6 + accel * 22 + brake * 4 + steer * 120 + grip * 6 + (boost - 1) * 120);
  return { top, accel, brake, steer, grip, boost, drift: v.drift, pr,
    bars: { speed: top / 160, accel: accel / 7, braking: brake / 15, handling: (steer * grip) / 7 } };
}
export const prOf = (id: VehicleId) => stats(id).pr;
export function classOf(pr: number): 'C' | 'B' | 'A' | 'S' { return pr < 420 ? 'C' : pr < 500 ? 'B' : pr < 590 ? 'A' : 'S'; }

export function nextUpgradeCost(id: VehicleId, up: UpgradeId): number | null {
  const lv = progress.garage[id].up[up];
  if (lv >= MAX_LEVEL) return null;
  return upgradeCost(UPGRADES.find((u) => u.id === up)!.base, lv);
}
export function buyUpgrade(id: VehicleId, up: UpgradeId): boolean {
  const cost = nextUpgradeCost(id, up);
  if (cost === null || progress.coins < cost) return false;
  progress.coins -= cost;
  progress.garage[id].up[up]++;
  save();
  return true;
}

export const totalStars = () => Object.values(progress.stars).reduce((a, b) => a + b, 0);
export const chapterStars = (ch: number) => EVENTS.filter((e) => e.chapter === ch).reduce((a, e) => a + (progress.stars[e.id] ?? 0), 0);
export const chapterUnlocked = (ch: number) => totalStars() >= chapterStarsNeeded(ch);
export function eventUnlocked(e: EventSpec): boolean {
  if (!chapterUnlocked(e.chapter)) return false;
  if (e.idx === 0) return true;
  const prev = EVENTS.find((x) => x.chapter === e.chapter && x.idx === e.idx - 1);
  return !!prev && (progress.stars[prev.id] ?? 0) > 0;
}
/** The next event to play: first unlocked one without stars, else the weakest. */
export function nextEvent(): EventSpec {
  const open = EVENTS.filter(eventUnlocked);
  return open.find((e) => !progress.stars[e.id]) ?? open.sort((a, b) => (progress.stars[a.id] ?? 0) - (progress.stars[b.id] ?? 0))[0] ?? EVENTS[0];
}

export function canBuyVehicle(id: VehicleId): 'owned' | 'locked' | 'coins' | 'ok' {
  const v = VEHICLES.find((x) => x.id === id)!;
  if (progress.owned.includes(id)) return 'owned';
  if (totalStars() < v.stars) return 'locked';
  if (progress.coins < v.price) return 'coins';
  return 'ok';
}
export function buyVehicle(id: VehicleId): boolean {
  if (canBuyVehicle(id) !== 'ok') return false;
  progress.coins -= VEHICLES.find((x) => x.id === id)!.price;
  progress.owned.push(id);
  progress.vehicle = id;
  save();
  return true;
}

// ── daily reward and challenges ─────────────────────────────────────────────
export const today = () => new Date().toLocaleDateString('en-CA');
export const DAILY = [
  { coins: 300, gems: 0 }, { coins: 500, gems: 0 }, { coins: 800, gems: 2 }, { coins: 1000, gems: 0 },
  { coins: 1300, gems: 3 }, { coins: 1600, gems: 0 }, { coins: 2500, gems: 10 },
];
export function dailyState() {
  const d = progress.daily, t = today();
  if (d.day === t) return { canClaim: !d.claimed, streak: d.streak };
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
  const streak = d.day === yesterday && d.claimed ? d.streak : 0;
  return { canClaim: true, streak };
}
export function claimDaily() {
  const s = dailyState();
  if (!s.canClaim) return null;
  const r = DAILY[s.streak % 7];
  progress.daily = { day: today(), streak: s.streak + 1, claimed: true };
  progress.coins += r.coins; progress.gems += r.gems;
  save();
  return r;
}

const POOL: { kind: ChallengeKind; goals: number[]; label: (n: number) => string }[] = [
  { kind: 'drift', goals: [5000, 10000, 20000], label: (n) => `Score ${n.toLocaleString()} drift points` },
  { kind: 'nearmiss', goals: [5, 10, 20], label: (n) => `Make ${n} near misses` },
  { kind: 'km', goals: [3, 6, 10], label: (n) => `Drive ${n} km` },
  { kind: 'win', goals: [1, 2, 3], label: (n) => `Win ${n} race${n > 1 ? 's' : ''}` },
  { kind: 'passengers', goals: [10, 20, 35], label: (n) => `Carry ${n} passengers` },
  { kind: 'overtake', goals: [10, 20, 40], label: (n) => `Overtake ${n} vehicles` },
  { kind: 'boost', goals: [3, 6, 10], label: (n) => `Use boost ${n} times` },
  { kind: 'escape', goals: [1, 2, 3], label: (n) => `Escape the police ${n} time${n > 1 ? 's' : ''}` },
];
export const challengeLabel = (c: Challenge) => POOL.find((p) => p.kind === c.kind)!.label(c.goal);

export function challenges(): Challenge[] {
  const t = today();
  if (progress.challenges.day !== t) {
    let seed = [...t].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pool = [...POOL].sort(() => rnd() - 0.5).slice(0, 3);
    progress.challenges = { day: t, list: pool.map((p, i) => ({ kind: p.kind, goal: p.goals[i], have: 0, reward: [400, 700, 1200][i], done: false })) };
    save();
  }
  return progress.challenges.list;
}
/** Adds progress to today's challenges. Returns challenges completed by this call. */
export function record(kind: ChallengeKind, amount: number): Challenge[] {
  const done: Challenge[] = [];
  for (const c of challenges()) {
    if (c.kind !== kind || c.done) continue;
    c.have = Math.min(c.goal, c.have + amount);
    if (c.have >= c.goal) { c.done = true; progress.coins += c.reward; done.push(c); }
  }
  save();
  return done;
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
