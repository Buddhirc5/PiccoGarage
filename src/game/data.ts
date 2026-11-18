/** Static game data: vehicles, upgrades, horns, cities. */
export type VehicleId = 'tuk' | 'pbus' | 'sltb' | 'pink' | 'leyland' | 'ashok' | 'tukking' | 'tukneon';
export type UpgradeId = 'engine' | 'gearbox' | 'tyres' | 'brakes' | 'turbo';
export type VehicleKind = 'bus' | 'tuk';
export type Finish = 'gloss' | 'metallic' | 'matte';

export interface VehicleDef {
  id: VehicleId;
  kind: VehicleKind;
  name: string;
  /** Short word set in giant type behind the vehicle. */
  big: string;
  cutout: string;
  tagline: string;
  model: string;
  length: number;       // metres (model is scaled to this)
  width: number;
  wheelBase: number;
  eye: [number, number, number]; // driver camera (x right, y up, z forward from centre)
  // base stats
  topSpeed: number;     // km/h
  accel: number;        // m/s² at low speed
  brake: number;        // m/s²
  steer: number;        // max steering angle (rad) at low speed
  grip: number;         // lateral grip rate (higher = less slide)
  drift: number;        // 0..1 how easily it slides
  mass: number;         // 0..1 for feel (body roll, engine pitch, crash weight)
  tintable: boolean;
  defaultTint: string;
  engine: 'diesel' | 'twostroke';
  horn: string;
  /** Coins to buy. 0 = owned from the start. */
  price: number;
  /** Career stars needed before it can be bought. */
  stars: number;
}

const BUS = { kind: 'bus' as const, width: 2.5, engine: 'diesel' as const };
const TUK = { kind: 'tuk' as const, width: 1.35, length: 2.7, wheelBase: 1.9, eye: [0, 1.3, 0.35] as [number, number, number], engine: 'twostroke' as const };

export const VEHICLES: VehicleDef[] = [
  { ...TUK, id: 'tuk', name: 'Three-Wheeler', big: 'TUK TUK', cutout: '/assets/img/cut_tuk.webp', model: '/assets/models/tuk.glb',
    tagline: 'Light, nimble and everywhere. Slips through any gap.', topSpeed: 86, accel: 4.6, brake: 10, steer: 0.62, grip: 9, drift: 0.85, mass: 0.2,
    tintable: true, defaultTint: '#c8102e', horn: 'beep', price: 0, stars: 0 },
  { ...BUS, id: 'pbus', name: 'Private Coach', big: 'COACH', cutout: '/assets/img/cut_pbus.webp', model: '/assets/models/pbus.glb', length: 10.6, wheelBase: 5.6, eye: [-0.62, 2.15, 4.35],
    tagline: 'The highway king. Loud horn, long body, big presence.', topSpeed: 118, accel: 3.4, brake: 9, steer: 0.5, grip: 7, drift: 0.45, mass: 0.85,
    tintable: true, defaultTint: '#ffffff', horn: 'air', price: 0, stars: 0 },
  { ...BUS, id: 'sltb', name: 'Red Route Bus', big: 'ROUTE', cutout: '/assets/img/cut_sltb.webp', model: '/assets/models/sltb.glb', length: 10.8, wheelBase: 5.7, eye: [-0.62, 2.2, 4.45],
    tagline: 'The island workhorse. Heavy, steady, unstoppable.', topSpeed: 104, accel: 3.0, brake: 8.5, steer: 0.48, grip: 8, drift: 0.35, mass: 1,
    tintable: false, defaultTint: '#ffffff', horn: 'steady', price: 3000, stars: 6 },
  { ...TUK, id: 'tukking', name: 'Street King', big: 'KING', cutout: '/assets/img/cut_tukking.webp', model: '/assets/models/tukking.glb',
    tagline: 'Lowered, wide wheels, candy red. Built for the corners.', topSpeed: 98, accel: 5.4, brake: 11, steer: 0.66, grip: 8.5, drift: 0.95, mass: 0.22,
    tintable: true, defaultTint: '#ffffff', horn: 'twin', price: 6500, stars: 14 },
  { ...BUS, id: 'leyland', name: 'Blue Thunder', big: 'THUNDER', cutout: '/assets/img/cut_leyland.webp', model: '/assets/models/leyland.glb', length: 10.8, wheelBase: 5.7, eye: [-0.62, 2.15, 4.45],
    tagline: 'A modified Leyland-style coach. Chrome, horns and lightning paint.', topSpeed: 126, accel: 3.7, brake: 9.5, steer: 0.5, grip: 7.5, drift: 0.55, mass: 0.85,
    tintable: false, defaultTint: '#ffffff', horn: 'air', price: 9000, stars: 22 },
  { ...TUK, id: 'tukneon', name: 'Neon Rider', big: 'NEON', cutout: '/assets/img/cut_tukneon.webp', model: '/assets/models/tukneon.glb',
    tagline: 'Midnight purple with glowing underglow. Owns the night.', topSpeed: 106, accel: 5.8, brake: 11, steer: 0.66, grip: 9, drift: 0.9, mass: 0.22,
    tintable: false, defaultTint: '#ffffff', horn: 'melody', price: 12000, stars: 30 },
  { ...BUS, id: 'ashok', name: 'Sun Blazer', big: 'BLAZER', cutout: '/assets/img/cut_ashok.webp', model: '/assets/models/ashok.glb', length: 11, wheelBase: 5.8, eye: [-0.62, 2.2, 4.55],
    tagline: 'A modified Ashok-style bus in orange flames. Fast and loud.', topSpeed: 132, accel: 3.9, brake: 9.5, steer: 0.5, grip: 7.5, drift: 0.55, mass: 0.85,
    tintable: false, defaultTint: '#ffffff', horn: 'twin', price: 16000, stars: 40 },
  { ...BUS, id: 'pink', name: 'Pink Queen', big: 'QUEEN', cutout: '/assets/img/cut_pink.webp', model: '/assets/models/pink.glb', length: 12.2, wheelBase: 6.2, eye: [-0.62, 2.3, 5.3],
    tagline: 'A decorated luxury coach with roof horns and spot lamps. Built to be seen.', topSpeed: 138, accel: 4.0, brake: 10, steer: 0.46, grip: 7.5, drift: 0.5, mass: 0.9,
    tintable: false, defaultTint: '#ffffff', horn: 'twin', price: 22000, stars: 52 },
];
export const vehicle = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];

export const UPGRADES: { id: UpgradeId; name: string; desc: string; base: number }[] = [
  { id: 'engine', name: 'Engine', desc: 'Higher top speed.', base: 500 },
  { id: 'gearbox', name: 'Gearbox', desc: 'Faster acceleration.', base: 400 },
  { id: 'tyres', name: 'Tyres', desc: 'More grip and sharper steering.', base: 350 },
  { id: 'brakes', name: 'Brakes', desc: 'Shorter stopping distance.', base: 300 },
  { id: 'turbo', name: 'Turbo', desc: 'Stronger, longer boost.', base: 600 },
];
export const MAX_LEVEL = 5;
export const upgradeCost = (base: number, lv: number) => Math.round((base * Math.pow(1.85, lv)) / 50) * 50;

export const TINTS = ['#ffffff', '#c8102e', '#f2b705', '#1f6feb', '#16a34a', '#f97316', '#9333ea', '#ec4899', '#0ea5e9', '#1f2937', '#d4af37', '#14b8a6'];
export const GLOWS = ['', '#ff2d2d', '#2d7bff', '#22e06b', '#ffb020', '#c04dff', '#ffffff', '#00e5ff'];
export const FINISHES: { id: Finish; name: string; cost: number }[] = [
  { id: 'gloss', name: 'Gloss', cost: 0 }, { id: 'metallic', name: 'Metallic', cost: 800 }, { id: 'matte', name: 'Matte', cost: 800 },
];

export const HORNS: { id: string; name: string; cost: number }[] = [
  { id: 'air', name: 'Air Horn', cost: 0 },
  { id: 'steady', name: 'Route Horn', cost: 0 },
  { id: 'beep', name: 'City Beep', cost: 0 },
  { id: 'twin', name: 'Twin Trumpet', cost: 500 },
  { id: 'melody', name: 'Sindu Melody', cost: 900 },
  { id: 'custom', name: 'My Sound', cost: 0 },
];

export type TimeOfDay = 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'rain';

export interface CityDef {
  id: string;
  name: string;
  region: string;
  blurb: string;
  image: string;
  km: number;
  /** Control points of the closed road loop (metres, x/z). */
  loop: [number, number][];
  density: number;       // 0..1 buildings along the road
  towers: number;        // tall buildings in the background
  trees: number;         // 0..1
  palms: number;         // share of palms among trees
  sea: boolean;
  lake?: boolean;
  hills?: boolean;
  landmark: 'towers' | 'fort' | 'stupa' | 'flyover' | 'temple' | 'none';
  sky: { tint: string; fog: string; fogFar: number; sun: string; sunY: number; exposure: number };
  ground: string;
  traffic: number;
}

const DAY = { tint: '#ffffff', fog: '#c9d8e6', fogFar: 520, sun: '#fff4e0', sunY: 70, exposure: 1.0 };

export const CITIES: CityDef[] = [
  { id: 'colombo', name: 'Colombo', region: 'Western Province', blurb: 'Towers, traffic and wide city roads.', image: '/assets/img/city_colombo.webp', km: 2.3,
    loop: [[0, 0], [260, -20], [420, 90], [430, 300], [300, 420], [80, 400], [-60, 260], [-70, 90]], density: 0.95, towers: 26, trees: 0.25, palms: 0.5, sea: false, landmark: 'towers',
    sky: { ...DAY, fog: '#cfd6e2', fogFar: 480 }, ground: '#5a6068', traffic: 16 },
  { id: 'kottawa', name: 'Kottawa', region: 'Western Province', blurb: 'A busy junction town under the expressway.', image: '/assets/img/city_kottawa.webp', km: 2.1,
    loop: [[0, 0], [240, 10], [400, 60], [430, 230], [330, 370], [130, 380], [-40, 290], [-70, 120]], density: 0.8, towers: 4, trees: 0.4, palms: 0.5, sea: false, landmark: 'flyover',
    sky: DAY, ground: '#667052', traffic: 14 },
  { id: 'pannipitiya', name: 'Pannipitiya', region: 'Western Province', blurb: 'Leafy High Level Road with shops and shade.', image: '/assets/img/city_pannipitiya.webp', km: 2.2,
    loop: [[0, 0], [230, -30], [410, 40], [470, 210], [380, 360], [170, 400], [-20, 320], [-80, 140]], density: 0.5, towers: 0, trees: 1, palms: 0.45, sea: false, landmark: 'none',
    sky: { ...DAY, fog: '#d3e2d0', fogFar: 460 }, ground: '#5f7748', traffic: 10 },
  { id: 'galle', name: 'Galle', region: 'Southern Province', blurb: 'The fort, the lighthouse and the ocean road.', image: '/assets/img/city_galle.webp', km: 2.5,
    loop: [[0, 0], [280, 30], [480, -30], [560, 120], [470, 280], [250, 250], [60, 300], [-80, 160]], density: 0.45, towers: 0, trees: 0.6, palms: 0.9, sea: true, landmark: 'fort',
    sky: { tint: '#ffe2c2', fog: '#f1cfae', fogFar: 600, sun: '#ffc890', sunY: 24, exposure: 1.05 }, ground: '#7c8a55', traffic: 9 },
  { id: 'anuradhapura', name: 'Anuradhapura', region: 'North Central Province', blurb: 'Quiet sacred-city roads under ancient stupas.', image: '/assets/img/city_anuradhapura.webp', km: 2.7,
    loop: [[0, 0], [320, 0], [520, 120], [520, 330], [330, 460], [80, 430], [-90, 280], [-100, 100]], density: 0.18, towers: 0, trees: 0.85, palms: 0.15, sea: false, landmark: 'stupa',
    sky: { ...DAY, fog: '#e6dcc6', fogFar: 640, sun: '#fff0cf' }, ground: '#9a8d62', traffic: 6 },
  { id: 'kandy', name: 'Kandy', region: 'Central Province', blurb: 'Around the lake, under green hills and the golden-roofed temple.', image: '/assets/img/city_kandy.webp', km: 2.4,
    loop: [[0, 0], [200, -60], [400, -20], [500, 140], [430, 330], [230, 400], [40, 340], [-80, 170]], density: 0.55, towers: 0, trees: 0.9, palms: 0.35, sea: false, lake: true, hills: true, landmark: 'temple',
    sky: { ...DAY, fog: '#cfdcd4', fogFar: 520, sun: '#fff1d8', sunY: 50 }, ground: '#56703f', traffic: 11 },
];
export const city = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0];
