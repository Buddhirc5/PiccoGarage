/** Static game data: vehicles, upgrades, horns, cities. */
export type VehicleId = 'pbus' | 'sltb' | 'tuk' | 'pink';
export type UpgradeId = 'engine' | 'brakes' | 'tyres';

export interface VehicleDef {
  id: VehicleId;
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
  mass: number;         // 0..1 for feel (body roll, engine pitch)
  tintable: boolean;
  defaultTint: string;
  engine: 'diesel' | 'twostroke';
  horn: string;
}

export const VEHICLES: VehicleDef[] = [
  { id: 'pbus', name: 'Private Coach', big: 'COACH', cutout: '/assets/img/cut_pbus.webp', tagline: 'The highway king. Loud horn, long body, big presence.', model: '/assets/models/pbus.glb',
    length: 10.6, width: 2.5, wheelBase: 5.6, eye: [-0.62, 2.15, 4.35], topSpeed: 118, accel: 3.4, brake: 9, steer: 0.5, mass: 0.85,
    tintable: true, defaultTint: '#ffffff', engine: 'diesel', horn: 'air' },
  { id: 'sltb', name: 'Red Route Bus', big: 'ROUTE', cutout: '/assets/img/cut_sltb.webp', tagline: 'The island workhorse. Heavy, steady, unstoppable.', model: '/assets/models/sltb.glb',
    length: 10.8, width: 2.5, wheelBase: 5.7, eye: [-0.62, 2.2, 4.45], topSpeed: 102, accel: 2.9, brake: 8, steer: 0.48, mass: 1,
    tintable: false, defaultTint: '#ffffff', engine: 'diesel', horn: 'steady' },
  { id: 'pink', name: 'Pink Queen', big: 'QUEEN', cutout: '/assets/img/cut_pink.webp', tagline: 'A decorated luxury coach with roof horns and spot lamps. Built to be seen.', model: '/assets/models/pink.glb',
    length: 12.2, width: 2.55, wheelBase: 6.2, eye: [-0.62, 2.3, 5.3], topSpeed: 128, accel: 3.2, brake: 9.5, steer: 0.45, mass: 0.9,
    tintable: false, defaultTint: '#ffffff', engine: 'diesel', horn: 'twin' },
  { id: 'tuk', name: 'Three-Wheeler', big: 'TUK TUK', cutout: '/assets/img/cut_tuk.webp', tagline: 'Light, nimble and everywhere. Slips through any gap.', model: '/assets/models/tuk.glb',
    length: 2.7, width: 1.35, wheelBase: 1.9, eye: [0, 1.3, 0.35], topSpeed: 84, accel: 4.6, brake: 10, steer: 0.62, mass: 0.2,
    tintable: true, defaultTint: '#c8102e', engine: 'twostroke', horn: 'beep' },
];

export const UPGRADES: { id: UpgradeId; name: string; desc: string; costs: number[] }[] = [
  { id: 'engine', name: 'Engine', desc: 'Higher top speed and stronger pull.', costs: [600, 1400, 2800] },
  { id: 'brakes', name: 'Brakes', desc: 'Shorter stopping distance.', costs: [400, 900, 1800] },
  { id: 'tyres', name: 'Tyres', desc: 'More grip and sharper steering.', costs: [500, 1100, 2200] },
];

export const TINTS = ['#ffffff', '#c8102e', '#f2b705', '#1f6feb', '#16a34a', '#f97316', '#9333ea', '#ec4899', '#0ea5e9', '#1f2937'];
export const GLOWS = ['', '#ff2d2d', '#2d7bff', '#22e06b', '#ffb020', '#c04dff', '#ffffff'];

export const HORNS: { id: string; name: string; cost: number }[] = [
  { id: 'air', name: 'Air Horn', cost: 0 },
  { id: 'steady', name: 'Route Horn', cost: 0 },
  { id: 'beep', name: 'City Beep', cost: 0 },
  { id: 'twin', name: 'Twin Trumpet', cost: 500 },
  { id: 'melody', name: 'Sindu Melody', cost: 900 },
  { id: 'custom', name: 'My Sound', cost: 0 },
];

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
  landmark: 'towers' | 'fort' | 'stupa' | 'flyover' | 'none';
  sky: { tint: string; fog: string; fogFar: number; sun: string; sunY: number; exposure: number };
  ground: string;
  traffic: number;
}

const DAY = { tint: '#ffffff', fog: '#c9d8e6', fogFar: 520, sun: '#fff4e0', sunY: 70, exposure: 1.0 };

export const CITIES: CityDef[] = [
  { id: 'colombo', name: 'Colombo', region: 'Western Province', blurb: 'Towers, traffic and wide city roads.', image: '/assets/img/city_colombo.webp', km: 2.3,
    loop: [[0, 0], [260, -20], [420, 90], [430, 300], [300, 420], [80, 400], [-60, 260], [-70, 90]], density: 0.95, towers: 26, trees: 0.25, palms: 0.5, sea: false, landmark: 'towers',
    sky: { ...DAY, fog: '#cfd6e2', fogFar: 480 }, ground: '#5a6068', traffic: 16 },
  { id: 'galle', name: 'Galle', region: 'Southern Province', blurb: 'The fort, the lighthouse and the ocean road.', image: '/assets/img/city_galle.webp', km: 2.5,
    loop: [[0, 0], [280, 30], [480, -30], [560, 120], [470, 280], [250, 250], [60, 300], [-80, 160]], density: 0.45, towers: 0, trees: 0.6, palms: 0.9, sea: true, landmark: 'fort',
    sky: { tint: '#ffe2c2', fog: '#f1cfae', fogFar: 600, sun: '#ffc890', sunY: 24, exposure: 1.05 }, ground: '#7c8a55', traffic: 9 },
  { id: 'anuradhapura', name: 'Anuradhapura', region: 'North Central Province', blurb: 'Quiet sacred-city roads under ancient stupas.', image: '/assets/img/city_anuradhapura.webp', km: 2.7,
    loop: [[0, 0], [320, 0], [520, 120], [520, 330], [330, 460], [80, 430], [-90, 280], [-100, 100]], density: 0.18, towers: 0, trees: 0.85, palms: 0.15, sea: false, landmark: 'stupa',
    sky: { ...DAY, fog: '#e6dcc6', fogFar: 640, sun: '#fff0cf' }, ground: '#9a8d62', traffic: 6 },
  { id: 'kottawa', name: 'Kottawa', region: 'Western Province', blurb: 'A busy junction town under the expressway.', image: '/assets/img/city_kottawa.webp', km: 2.1,
    loop: [[0, 0], [240, 10], [400, 60], [430, 230], [330, 370], [130, 380], [-40, 290], [-70, 120]], density: 0.8, towers: 4, trees: 0.4, palms: 0.5, sea: false, landmark: 'flyover',
    sky: DAY, ground: '#667052', traffic: 14 },
  { id: 'pannipitiya', name: 'Pannipitiya', region: 'Western Province', blurb: 'Leafy High Level Road with shops and shade.', image: '/assets/img/city_pannipitiya.webp', km: 2.2,
    loop: [[0, 0], [230, -30], [410, 40], [470, 210], [380, 360], [170, 400], [-20, 320], [-80, 140]], density: 0.5, towers: 0, trees: 1, palms: 0.45, sea: false, landmark: 'none',
    sky: { ...DAY, fog: '#d3e2d0', fogFar: 460 }, ground: '#5f7748', traffic: 10 },
];
