import { CITIES, type TimeOfDay, type VehicleKind, type Weather } from './data';

/**
 * Career: one chapter per city, 7 events each (the last is a boss race).
 * Events are generated from templates with rising difficulty.
 */
export type EventType = 'free' | 'sprint' | 'circuit' | 'knockout' | 'drift' | 'route' | 'checkpoint' | 'nearmiss';

export interface EventSpec {
  id: string;
  chapter: number;
  idx: number;
  type: EventType;
  title: string;
  city: string;
  kind: VehicleKind | 'any';
  laps: number;
  rivals: number;
  /** Seconds for timed events. */
  timeLimit: number;
  /** Bus stops for route events. */
  stops: number;
  /** Score thresholds for 1, 2, 3 stars (score events), or seconds for checkpoint 2/3 stars. */
  targets: [number, number, number];
  time: TimeOfDay;
  weather: Weather;
  minPR: number;
  reward: { coins: number; xp: number; gems: number };
  rivalSkill: number;
  boss?: string;
  police: boolean;
}

export const TYPE_INFO: Record<EventType, { name: string; icon: string; rules: string }> = {
  free: { name: 'Free Roam', icon: 'road', rules: 'No timer. Drive, drift, overtake and explore. Police may show up at checkpoints.' },
  sprint: { name: 'Sprint', icon: 'flag', rules: 'Point to point. Beat three rivals to the finish line.' },
  circuit: { name: 'Circuit', icon: 'trophy', rules: 'Race laps of the city loop. First across the line wins.' },
  knockout: { name: 'Knockout', icon: 'bolt', rules: 'Last place at the end of every lap is knocked out. Survive to the end.' },
  drift: { name: 'Drift Zone', icon: 'tyre', rules: 'Chain drifts for points before the timer runs out. Crashes lose the combo.' },
  route: { name: 'Bus Route', icon: 'pin', rules: 'Stop inside each bus bay, pick up passengers and keep them happy. Smooth driving pays more.' },
  checkpoint: { name: 'Checkpoint Run', icon: 'police', rules: 'Run the police checkpoints and lose the jeep before the finish.' },
  nearmiss: { name: 'Near-Miss Run', icon: 'speed', rules: 'Pass traffic as close as you dare. Each near miss scores, crashes cost you.' },
};

const BOSSES = ['Kasun "Kolla" Perera', 'Nimal the Night Rider', 'Ruwan Speed', 'Captain Galle', 'Sudu Malli', 'Kandy King'];
const CHAPTER_TIME: TimeOfDay[] = ['day', 'day', 'dusk', 'dusk', 'night', 'night'];

const TEMPLATE: { type: EventType; kind: VehicleKind | 'any'; title: string }[] = [
  { type: 'sprint', kind: 'any', title: 'Street Sprint' },
  { type: 'route', kind: 'bus', title: 'Morning Route' },
  { type: 'nearmiss', kind: 'tuk', title: 'Gap Hunter' },
  { type: 'drift', kind: 'any', title: 'Drift Zone' },
  { type: 'checkpoint', kind: 'any', title: 'Checkpoint Run' },
  { type: 'knockout', kind: 'any', title: 'Knockout' },
  { type: 'circuit', kind: 'any', title: 'Boss Race' },
];

function build(): EventSpec[] {
  const out: EventSpec[] = [];
  CITIES.forEach((c, ch) => {
    TEMPLATE.forEach((t, i) => {
      const d = ch * 7 + i; // overall difficulty step 0..41
      const boss = i === 6;
      const scale = 1 + ch * 0.35;
      const targets: [number, number, number] =
        t.type === 'drift' ? [Math.round(3000 * scale), Math.round(7000 * scale), Math.round(12000 * scale)]
        : t.type === 'nearmiss' ? [Math.round(5 * scale), Math.round(10 * scale), Math.round(16 * scale)]
        : t.type === 'route' ? [Math.round(400 * scale), Math.round(800 * scale), Math.round(1200 * scale)]
        : t.type === 'checkpoint' ? [0, Math.round(150 + c.km * 30), Math.round(110 + c.km * 25)]
        : [3, 2, 1];
      out.push({
        id: `${c.id}-${i}`, chapter: ch, idx: i, type: t.type,
        title: boss ? `${c.name} Boss: ${BOSSES[ch]}` : `${c.name} ${t.title}`,
        city: c.id, kind: t.kind,
        laps: t.type === 'circuit' ? 2 : t.type === 'knockout' ? 3 : 1,
        rivals: t.type === 'sprint' || t.type === 'circuit' ? 3 : t.type === 'knockout' ? 3 : 0,
        timeLimit: t.type === 'drift' ? 90 : t.type === 'nearmiss' ? 75 : t.type === 'route' ? 240 : 0,
        stops: t.type === 'route' ? 3 + Math.min(3, ch) : 0,
        targets,
        time: boss ? 'night' : CHAPTER_TIME[ch],
        weather: (ch === 3 && i === 3) || (ch === 5 && i % 2 === 1) || (ch === 2 && i === 1) ? 'rain' : 'clear',
        minPR: Math.round(370 + d * 6),
        reward: { coins: Math.round((400 + d * 60) * (boss ? 2.5 : 1)), xp: Math.round((150 + d * 25) * (boss ? 2 : 1)), gems: boss ? 10 : 0 },
        rivalSkill: Math.min(1.06, 0.8 + d * 0.006 + (boss ? 0.06 : 0)),
        boss: boss ? BOSSES[ch] : undefined,
        police: t.type === 'checkpoint',
      });
    });
  });
  return out;
}

export const EVENTS: EventSpec[] = build();
export const eventById = (id: string) => EVENTS.find((e) => e.id === id);

/** Free roam pseudo-event for a city. */
export function freeRoam(cityId: string, time: TimeOfDay = 'day', weather: Weather = 'clear'): EventSpec {
  return { id: `free-${cityId}`, chapter: -1, idx: -1, type: 'free', title: 'Free Roam', city: cityId, kind: 'any', laps: 0, rivals: 0, timeLimit: 0, stops: 0,
    targets: [0, 0, 0], time, weather, minPR: 0, reward: { coins: 0, xp: 0, gems: 0 }, rivalSkill: 0.85, police: true };
}

export interface RaceResult { finished: boolean; position: number | null; time: number; score: number; caught: boolean; crashes: number }

/** 0-3 stars for a finished event. */
export function starsFor(e: EventSpec, r: RaceResult): number {
  if (!r.finished) return 0;
  const t = e.targets;
  switch (e.type) {
    case 'sprint': case 'circuit': case 'knockout': {
      const p = r.position ?? 9;
      return p <= t[2] ? 3 : p <= t[1] ? 2 : p <= t[0] ? 1 : 0;
    }
    case 'checkpoint': return r.caught ? 0 : r.time <= t[2] ? 3 : r.time <= t[1] ? 2 : 1;
    default: return r.score >= t[2] ? 3 : r.score >= t[1] ? 2 : r.score >= t[0] ? 1 : 0;
  }
}

/** Unlocked if it is the first event or the previous one has a star, and the chapter is open. */
export function chapterStarsNeeded(ch: number) { return ch * 10; }
