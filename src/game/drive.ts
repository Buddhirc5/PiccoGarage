import * as THREE from 'three';
import { live } from '../core/live';
import { buzz, fx as sfxFx, horn as playHorn, startEngine, startSiren, startSqueal, ui as sfx, type EngineSound } from '../core/audio';
import { environment, type Stage } from '../core/renderer';
import { settings } from '../core/settings';
import { starsFor, type EventSpec, type RaceResult } from './career';
import { city as cityById, vehicle as vehicleById, type VehicleDef } from './data';
import { Fx, glowSprite, glowTexture } from './fx';
import { loadModel, type LoadedModel } from './models';
import { levelInfo, levelReward, progress, record, save, stats, type Challenge } from './progress';
import { PERSON_HEIGHT, buildPeople, type PersonName, type SpriteLayer, type SpriteSpot } from './sprites';
import { LANE, LIMIT, ROAD_HALF, WALK, buildWorld, type Track, type World } from './world';

/** One drive session: world, player, traffic, rivals, police, passengers and the event rules. */
export interface Input { steer: number; throttle: number; brake: number; handbrake: boolean; boost: boolean }
export interface HudState {
  kmh: number; gear: number; reverse: boolean; rpm: number;
  boost: number; boosting: boolean;
  drift: { active: boolean; score: number; mult: number };
  heat: number; policeGap: number | null;
  race: { pos: number; total: number; lap: number; laps: number; progress: number } | null;
  countdown: number; time: number; timer: number | null; score: number; scoreLabel: string;
  coins: number; km: number; overtakes: number; nearMisses: number;
  stop: { index: number; total: number; dist: number; boarding: number; comfort: number } | null;
  objective: string;
}
export type DriveEvent = 'overtake' | 'nearmiss' | 'drift' | 'bump' | 'crash' | 'finish' | 'go' | 'knockout' | 'caught' | 'escaped' | 'heat'
  | 'checkpoint' | 'stop' | 'fare' | 'challenge' | 'boost';
export interface Summary {
  spec: EventSpec; vehicle: VehicleDef; result: RaceResult; stars: number; prevStars: number; newBest: boolean;
  coins: number; xp: number; gems: number;
  stats: { km: number; time: number; overtakes: number; nearMisses: number; driftBest: number; bumps: number; topKmh: number; passengers: number; escaped: number; caught: number };
  challenges: Challenge[]; levelUp: { level: number; coins: number; gems: number } | null;
}

interface Mover {
  model: LoadedModel; s: number; lat: number; dir: 1 | -1; speed: number; target: number; len: number; wid: number;
  pos: THREE.Vector3; heading: number; behind: boolean; nm: boolean; out?: boolean;
  rival?: { prog: number; skill: number; top: number; latT: number; done: number; name: string; out: boolean };
  police?: boolean;
}
interface Person { name: PersonName; base: THREE.Vector3; pos: THREE.Vector3; h: number; vx: number; vz: number; walk: number; hop: number; hide: boolean; stop?: number; board?: number }

const TRAFFIC_MODELS = ['car', 'car', 'tuk', 'lorry', 'car', 'sltb', 'tuk', 'pbus', 'car', 'pink'];
const RIVAL_NAMES = ['Kasun', 'Dilshan', 'Tharindu', 'Sanjaya', 'Chamara', 'Nuwan'];
const wrap = (d: number, L: number) => ((d + L / 2) % L + L) % L - L / 2;
const GEARS = 5;

export class Drive implements Stage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 1600);
  input: Input = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false };
  hud: HudState = {
    kmh: 0, gear: 1, reverse: false, rpm: 0, boost: 0.35, boosting: false, drift: { active: false, score: 0, mult: 1 },
    heat: 0, policeGap: null, race: null, countdown: 0, time: 0, timer: null, score: 0, scoreLabel: '',
    coins: 0, km: 0, overtakes: 0, nearMisses: 0, stop: null, objective: '',
  };
  paused = false;
  camMode = 0;
  onEvent: (kind: DriveEvent, text: string) => void = () => {};
  track!: Track;
  movers: Mover[] = [];
  pos = new THREE.Vector3();
  heading = 0;
  done = false;
  world!: World;
  def: VehicleDef;

  private me!: LoadedModel;
  private body = new THREE.Group();
  private st: ReturnType<typeof stats>;
  private vel = new THREE.Vector2();          // world velocity (x, z)
  private vf = 0; private vl = 0; private steer = 0; private idx = 0; private prog = 0; private lastS = 0; private lat = LANE;
  private dist = 0; private bumps = 0; private overtakes = 0; private nearMisses = 0; private coinsEarned = 0; private top = 0;
  private finished: number | null = null; private failed = false; private bumpCd = 0;
  private driftT = 0; private driftOff = 0; private driftScore = 0; private driftMult = 1; private driftTotal = 0; private driftBest = 0; private drifting = false;
  private boostCount = 0; private slowmo = 0; private shake = 0;
  private engine: EngineSound | null = null; private squeal: ReturnType<typeof startSqueal> | null = null; private siren: ReturnType<typeof startSiren> | null = null;
  private hornOff: (() => void) | null = null;
  private keys = new Set<string>();
  private camInit = false; private camYaw = 0;
  private curv: number[] = [];
  private fx!: Fx;
  private raceDist = 0;
  private gear = 1;
  private crowd: Person[] = []; private crowdLayer: SpriteLayer | null = null;
  // police
  private police: Mover | null = null; private heatT = 0; private lostT = 0; private caughtT = 0; private escaped = 0; private caught = 0; private checkedCp = new Set<number>();
  private lights: { glow: THREE.Sprite[]; brake: THREE.Sprite[]; spot: THREE.SpotLight | null; bar: THREE.Sprite[] } = { glow: [], brake: [], spot: null, bar: [] };
  // bus route
  private stopsS: number[] = []; private stopIdx = 0; private boardT = 0; private fares = 0; private comfort = 1; private passengers = 0; private lastStopTime = 0;
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3();
  private glowTex = glowTexture();

  constructor(public spec: EventSpec, vehicleId: string) {
    this.def = vehicleById(vehicleId);
    this.st = stats(this.def.id);
  }

  get isRace() { return this.spec.type === 'sprint' || this.spec.type === 'circuit' || this.spec.type === 'knockout'; }

  async load(): Promise<void> {
    const q = settings.quality, low = q === 'low';
    const c = cityById(this.spec.city);
    this.world = await buildWorld(c, { time: this.spec.time, weather: this.spec.weather, quality: q });
    this.track = this.world.track;
    this.scene.add(this.world.group);
    this.scene.environment = environment();
    this.scene.environmentIntensity = this.world.night ? 0.2 : 0.7;
    const far = (low ? 0.7 : 1) * (this.world.wet ? c.sky.fogFar * 0.6 : this.world.night ? c.sky.fogFar * 0.75 : c.sky.fogFar);
    this.scene.fog = new THREE.Fog(this.world.fogColor, this.world.wet ? 40 : 90, far);
    this.fx = new Fx(low, this.world.wet);
    this.scene.add(this.fx.group);
    const tr = this.track, L = tr.length;
    for (let i = 0; i < tr.n; i++) {
      const a = tr.tan[(i + 4) % tr.n], b = tr.tan[(i - 4 + tr.n) % tr.n];
      this.curv.push(Math.abs(Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z)) / (8 * tr.step));
    }

    // player
    const g = progress.garage[this.def.id];
    this.me = await loadModel(this.def.model);
    if (this.def.tintable) this.me.setTint(g.tint);
    this.me.setFinish(g.finish);
    this.body.add(this.me.root);
    if (g.glow) {
      const ug = new THREE.Mesh(new THREE.PlaneGeometry(this.def.width * 2.4, this.def.length * 1.35),
        new THREE.MeshBasicMaterial({ map: this.glowTex, color: g.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      ug.rotation.x = -Math.PI / 2; ug.position.y = 0.06;
      this.body.add(ug);
    }
    this.addLights(this.body, this.me.size, true);
    this.scene.add(this.body);
    const startS = 10;
    this.place(startS, LANE);

    // traffic (lighter in races so the field is not blocked)
    const count = Math.round(c.traffic * (low ? 0.5 : q === 'medium' ? 0.8 : 1) * (this.isRace ? 0.7 : 1));
    for (let k = 0; k < count; k++) {
      const name = TRAFFIC_MODELS[k % TRAFFIC_MODELS.length];
      const model = await loadModel(`/assets/models/${name}.glb`, true);
      const dir = k % 2 ? -1 : 1;
      const s = 80 + ((k + 0.5) / count) * (L - 120);
      const speed = (name === 'tuk' ? 8.5 : name === 'car' ? 11.5 : 9.5) + (k % 3);
      if (this.world.night) this.addLights(model.root, model.size, false);
      this.addMover({ model, s, lat: dir * LANE, dir, speed, target: speed, len: model.size.z, wid: model.size.x, pos: new THREE.Vector3(), heading: 0, behind: true, nm: false });
    }

    // rivals
    if (this.isRace) {
      const tints = ['#f2b705', '#1f6feb', '#16a34a', '#9333ea'];
      for (let k = 0; k < this.spec.rivals; k++) {
        const model = await loadModel(this.def.model);
        if (this.def.tintable) model.setTint(tints[k]);
        if (this.world.night) this.addLights(model.root, model.size, false);
        const skill = this.spec.rivalSkill - k * 0.025;
        const s0 = startS + (k + 1) * (this.def.length + 7);
        const name = k === 0 && this.spec.boss ? this.spec.boss : RIVAL_NAMES[(this.spec.chapter + k) % RIVAL_NAMES.length];
        this.addMover({ model, s: s0, lat: k % 2 ? LANE : -LANE, dir: 1, speed: 0, target: 0, len: this.def.length, wid: this.def.width, pos: new THREE.Vector3(), heading: 0, behind: false, nm: true,
          rival: { prog: s0 - startS, skill, top: (this.st.top / 3.6) * skill, latT: k % 2 ? LANE : -LANE, done: 0, name, out: false } });
      }
      this.raceDist = this.spec.type === 'sprint' ? L * 0.85 : L * this.spec.laps;
      this.hud.race = { pos: this.spec.rivals + 1, total: this.spec.rivals + 1, lap: 1, laps: this.spec.type === 'sprint' ? 1 : this.spec.laps, progress: 0 };
      this.hud.countdown = 3.99;
    } else if (this.spec.type === 'checkpoint') {
      this.raceDist = L * 0.95; this.hud.countdown = 3.99;
    } else if (this.spec.type !== 'free') this.hud.countdown = 3.99;
    if (this.spec.timeLimit) this.hud.timer = this.spec.timeLimit;

    // police jeep (parked until heat starts)
    if (this.spec.police) {
      const model = await loadModel('/assets/models/police.glb', true);
      this.addPoliceBar(model.root, model.size);
      if (this.world.night) this.addLights(model.root, model.size, false);
      this.police = { model, s: -9999, lat: -LANE, dir: 1, speed: 0, target: 0, len: model.size.z, wid: model.size.x, pos: new THREE.Vector3(), heading: 0, behind: true, nm: true, police: true };
      this.scene.add(model.root); model.root.visible = false;
    }

    // bus stops
    if (this.def.kind === 'bus') {
      const all = this.world.layout.stops.filter((sv) => sv > startS + 40).sort((a, b) => a - b);
      this.stopsS = this.spec.type === 'route' ? all.slice(0, this.spec.stops) : all;
    }
    await this.buildCrowd();
    this.objective();
    this.syncMovers(0);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.engine = startEngine(this.def.engine);
    this.squeal = startSqueal();
    if (this.police) this.siren = startSiren();
    this.update(0);
  }

  // ── lights ────────────────────────────────────────────────────────────────
  private addLights(root: THREE.Object3D, size: THREE.Vector3, player: boolean) {
    if (!this.world.night && !player) return;
    const fz = size.z / 2, w = size.x * 0.36, y = Math.min(1.1, size.y * 0.35);
    const glow: THREE.Sprite[] = [], brake: THREE.Sprite[] = [];
    for (const x of [-w, w]) {
      const h = glowSprite(this.glowTex, 0xfff3d6, this.world.night ? 1.6 : 0.01); h.position.set(x, y, fz + 0.1); root.add(h); glow.push(h);
      const t = glowSprite(this.glowTex, 0xff2020, this.world.night ? 1.0 : 0.01); t.position.set(x, y, -fz - 0.1); root.add(t); brake.push(t);
    }
    if (player) {
      this.lights.glow = glow; this.lights.brake = brake;
      if (this.world.night) {
        const sp = new THREE.SpotLight(0xfff1d0, 60, 70, 0.55, 0.5, 1.4);
        sp.position.set(0, y + 0.3, fz); sp.target.position.set(0, 0, fz + 20);
        root.add(sp, sp.target); this.lights.spot = sp;
      }
    }
  }
  private addPoliceBar(root: THREE.Object3D, size: THREE.Vector3) {
    for (const [x, c] of [[-0.35, 0xff2030], [0.35, 0x2a5bff]] as const) {
      const s = glowSprite(this.glowTex, c, 1.4); s.position.set(x, size.y + 0.1, size.z * 0.05); root.add(s); this.lights.bar.push(s);
    }
  }

  // ── pedestrians, dogs, police officers, passengers ────────────────────────
  private async buildCrowd() {
    const tr = this.track, L = tr.length, lay = this.world.layout;
    const tex = await new THREE.TextureLoader().loadAsync('/assets/tex/people.webp');
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const add = (name: PersonName, sv: number, lat: number, extra: Partial<Person> = {}) => {
      const base = tr.at(sv, lat);
      this.crowd.push({ name, base: base.clone(), pos: base.clone(), h: PERSON_HEIGHT[name] * (0.92 + Math.random() * 0.14), vx: 0, vz: 0, walk: 0, hop: 0, hide: false, ...extra });
    };
    const n = settings.quality === 'low' ? 18 : 36;
    const peds: PersonName[] = ['man', 'woman', 'boy', 'man', 'woman'];
    for (let k = 0; k < n; k++) add(peds[k % peds.length], (k / n) * L + Math.random() * 20, (k % 2 ? 1 : -1) * (ROAD_HALF + WALK * 0.5), { walk: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.5) });
    for (let k = 0; k < 6; k++) add('dog', Math.random() * L, (Math.random() < 0.5 ? 1 : -1) * (ROAD_HALF + WALK + 1.5));
    for (const sv of lay.junctions) add('shrine', sv + 9, ROAD_HALF + WALK + 1.6);
    if (this.spec.police) for (const sv of lay.checkpoints) add('cop', sv, ROAD_HALF + 0.9);
    this.stopsS.forEach((sv, k) => { const m = 2 + Math.floor(Math.random() * 4); for (let j = 0; j < m; j++) add(peds[j % 5], sv - 4 + j * 1.6, ROAD_HALF + 1.0 + (j % 2) * 0.6, { stop: k }); });
    const spots: SpriteSpot[] = this.crowd.map((p) => ({ name: p.name, x: p.pos.x, z: p.pos.z, h: p.h }));
    this.crowdLayer = buildPeople(spots, tex, this.world.night);
    this.scene.add(this.crowdLayer.group);
  }

  private updateCrowd(dt: number) {
    if (!this.crowdLayer) return;
    const tr = this.track;
    this.crowd.forEach((p, i) => {
      if (p.hide) { this.crowdLayer!.set(i, 0, 0, 0); return; }
      if (p.board !== undefined) {
        // walking to the bus door, then gone
        const door = this.tmp.copy(this.pos);
        const dx = door.x - p.pos.x, dz = door.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d < 1.2) { p.hide = true; return; }
        p.pos.x += (dx / d) * 2.2 * dt; p.pos.z += (dz / d) * 2.2 * dt;
      } else if (p.name !== 'shrine' && p.name !== 'cop') {
        // stroll along the pavement, dodge vehicles with a hop
        if (p.walk) {
          const near = tr.nearest(p.pos, Math.floor(this.lastS / tr.step));
          p.pos.addScaledVector(tr.tan[near.i], p.walk * dt);
        }
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        const reach = this.def.length * 0.6 + 2.5;
        if (d < reach && Math.abs(this.vf) > 1) {
          const push = (reach - d) / reach;
          p.vx += (dx / Math.max(d, 0.1)) * 18 * push * dt; p.vz += (dz / Math.max(d, 0.1)) * 18 * push * dt;
          if (p.hop <= 0) p.hop = 0.35;
        }
        p.pos.x += p.vx * dt; p.pos.z += p.vz * dt;
        p.vx *= 1 - Math.min(1, 3 * dt); p.vz *= 1 - Math.min(1, 3 * dt);
      }
      p.hop = Math.max(0, p.hop - dt);
      const y = p.hop > 0 ? Math.sin((p.hop / 0.35) * Math.PI) * 0.45 : 0;
      this.crowdLayer!.set(i, p.pos.x, p.pos.z, p.h, p.walk < 0, y);
    });
    this.crowdLayer.commit();
  }

  private addMover(m: Mover) { this.movers.push(m); this.scene.add(m.model.root); }

  private place(s: number, lat: number) {
    this.track.at(s, lat, this.pos);
    this.heading = this.track.heading(s);
    this.idx = Math.floor(s / this.track.step);
    this.lastS = s; this.prog = 0; this.vel.set(0, 0);
  }

  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
    if (down && !e.repeat) {
      if (e.code === 'KeyC') this.nextCamera();
      if (e.code === 'KeyR') this.toggleGear();
      if (e.code === 'KeyH') this.horn(true);
    }
    if (!down && e.code === 'KeyH') this.horn(false);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
  };

  nextCamera() { this.camMode = (this.camMode + 1) % 3; this.camInit = false; }
  toggleGear() { if (Math.abs(this.vf) < 2) { this.hud.reverse = !this.hud.reverse; sfx.tap(); } else sfx.deny(); }
  horn(on: boolean) {
    if (on && !this.hornOff) this.hornOff = playHorn(progress.garage[this.def.id].horn);
    if (!on && this.hornOff) { this.hornOff(); this.hornOff = null; }
  }

  private objective() {
    const t = this.spec.type, h = this.hud;
    h.objective = t === 'free' ? (this.stopsS.length ? 'Free roam · pick up passengers at bus stops' : 'Free roam · drift, boost and explore')
      : t === 'route' ? `Stop ${Math.min(this.stopIdx + 1, this.stopsS.length)} of ${this.stopsS.length}`
      : t === 'drift' ? 'Drift for points' : t === 'nearmiss' ? 'Pass traffic close' : t === 'checkpoint' ? 'Run the checkpoints, lose the police'
      : t === 'knockout' ? 'Last place each lap is out' : 'Win the race';
    h.scoreLabel = t === 'drift' ? 'Drift' : t === 'nearmiss' ? 'Near misses' : t === 'route' ? 'Fares' : '';
  }

  // ── main update ───────────────────────────────────────────────────────────
  update(dtReal: number): void {
    if (this.paused || this.done) return;
    this.slowmo = Math.max(0, this.slowmo - dtReal);
    const dt = dtReal * (this.slowmo > 0 ? 0.35 : 1);
    const tr = this.track, st = this.st, def = this.def, k = this.keys, h = this.hud;
    const locked = h.countdown > 0 || this.finished !== null;
    if (h.countdown > 0) {
      const before = Math.floor(h.countdown);
      h.countdown -= dtReal;
      const after = Math.floor(Math.max(0, h.countdown));
      if (after !== before) { sfx.count(after); if (after === 0) this.onEvent('go', 'GO'); }
    } else if (!locked) h.time += dt;

    // ── input ──
    let steerIn = this.input.steer, thr = this.input.throttle, brk = this.input.brake;
    if (k.has('ArrowLeft') || k.has('KeyA')) steerIn = 1;
    if (k.has('ArrowRight') || k.has('KeyD')) steerIn = -1;
    if (k.has('ArrowUp') || k.has('KeyW')) thr = 1;
    if (k.has('ArrowDown') || k.has('KeyS')) brk = 1;
    if (progress.autoGas && !h.reverse && brk === 0) thr = Math.max(thr, 1);
    const hand = this.input.handbrake || k.has('Space');
    const wantBoost = this.input.boost || k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyB');
    if (locked) { thr = 0; brk = this.finished !== null ? 0.6 : 1; }

    // ── boost ──
    if (wantBoost && h.boost > 0.04 && !locked && !h.reverse) {
      if (!h.boosting) { h.boosting = true; this.boostCount++; sfxFx.boostStart(); this.onEvent('boost', ''); record('boost', 1); }
      h.boost = Math.max(0, h.boost - (0.3 / st.boost) * dt);
    } else h.boosting = false;
    const bmul = h.boosting ? 1.28 * Math.sqrt(st.boost) : 1;

    // ── body frame ──
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = fz, rz = -fx; // lateral axis
    this.vf = this.vel.x * fx + this.vel.y * fz;
    this.vl = this.vel.x * rx + this.vel.y * rz;
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const wet = this.world.wet ? 0.82 : 1;
    const vmax = (st.top / 3.6) * bmul, rev = h.reverse;
    const onWalk = Math.abs(this.lat) > ROAD_HALF - def.width * 0.3;

    // ── drift start / hold / exit ──
    const slip = Math.atan2(this.vl, Math.max(2, Math.abs(this.vf)));
    const kick = (brk > 0 || hand) && Math.abs(steerIn) > 0.4 && this.vf > 9 && !locked;
    if (kick && !this.drifting) { this.drifting = true; this.vl += -steerIn * this.vf * 0.18 * (0.5 + def.drift); }
    if (this.drifting && (Math.abs(slip) < 0.07 || this.vf < 5)) { this.driftOff += dt; if (this.driftOff > 0.35) this.drifting = false; } else this.driftOff = 0;

    // ── longitudinal ──
    let a = 0;
    if (!rev) a += thr * st.accel * (h.boosting ? 1.7 : 1) * Math.max(0, 1 - Math.pow(Math.max(0, this.vf) / vmax, 1.6));
    else a -= thr * st.accel * 0.6 * Math.max(0, 1 + this.vf / (vmax * 0.22));
    if (this.vf > vmax) a -= (this.vf - vmax) * 1.5; // shed speed after boost
    const sign = Math.sign(this.vf) || (rev ? -1 : 1);
    a -= sign * (0.25 + 0.0009 * this.vf * this.vf + (onWalk ? 2.2 : 0)) * (Math.abs(this.vf) > 0.05 ? 1 : 0);
    let decel = (brk * st.brake * (this.drifting ? 0.25 : 1) + (hand ? st.brake * (this.drifting ? 0.15 : 0.9) : 0)) * dt;
    this.vf += a * dt;
    if (decel) { this.comfortHit(brk * st.brake * (this.drifting ? 0.25 : 1)); this.vf = Math.abs(this.vf) <= decel ? 0 : this.vf - Math.sign(this.vf) * decel; }
    if (!thr && Math.abs(this.vf) < 0.08) this.vf = 0;
    decel = 0;

    // ── steering, yaw, lateral grip ──
    const sens = progress.sensitivity;
    const maxSteer = (st.steer * sens) / (1 + Math.abs(this.vf) / (9 * (st.grip / 7)));
    const rate = (steerIn === 0 ? 5 : 3.4) * dt;
    this.steer += THREE.MathUtils.clamp(steerIn * maxSteer - this.steer, -rate, rate);
    let yaw = (this.vf * Math.tan(this.steer)) / def.wheelBase;
    if (this.drifting) yaw *= 1 + 0.55 * def.drift;
    if (hand && Math.abs(this.vf) > 4) yaw += steerIn * 0.9 * def.drift;
    this.heading += yaw * dt;
    const gripRate = (this.drifting ? THREE.MathUtils.lerp(st.grip * 0.6, 1.4, def.drift) : st.grip) * wet * (onWalk ? 0.7 : 1);
    this.vl *= Math.exp(-gripRate * dt);
    // rebuild world velocity in the new frame
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.set(nfx * this.vf + nfz * this.vl, nfz * this.vf - nfx * this.vl);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;

    // ── drift scoring ──
    const sliding = Math.abs(slip) > 0.12 && speed > 7;
    if (sliding && !locked) {
      this.driftT += dt; this.driftScore += Math.abs(slip) * speed * dt * 14 * this.driftMult;
      this.driftMult = Math.min(5, 1 + Math.floor(this.driftT / 1.6));
    } else if (this.driftScore > 0 && !this.drifting) this.bankDrift();
    h.drift = { active: sliding && this.driftScore > 20, score: Math.round(this.driftScore), mult: this.driftMult };

    // ── corridor ──
    const near = tr.nearest(this.pos, this.idx);
    this.idx = near.i; this.lat = near.lat;
    const lim = LIMIT - def.width / 2;
    if (Math.abs(near.lat) > lim) {
      const over = Math.abs(near.lat) - lim;
      this.pos.addScaledVector(tr.left[near.i], -Math.sign(near.lat) * over);
      const th = Math.atan2(tr.tan[near.i].x, tr.tan[near.i].z);
      const diff = Math.atan2(Math.sin(th - this.heading), Math.cos(th - this.heading));
      const along = Math.abs(diff) > Math.PI / 2 ? diff - Math.sign(diff) * Math.PI : diff;
      this.heading += along * Math.min(1, 4 * dt);
      const hard = Math.abs(Math.sin(along)) > 0.25;
      if (speed > 6 && this.bumpCd <= 0) this.bump(hard ? 0.55 : 0.88, hard ? speed * 0.6 : 0, this.pos);
      else this.vel.multiplyScalar(1 - Math.min(0.9, 1.5 * dt));
    }
    this.bumpCd -= dt;

    // ── speed bumps ──
    for (const sv of this.world.layout.bumps) {
      const d = Math.abs(wrap(this.lastS - sv, tr.length));
      if (d < 1.2 && speed > 12) { this.me.root.position.y = 0.12; this.comfortHit(9); }
    }

    // ── progress ──
    const s = near.i * tr.step + this.tmp.copy(this.pos).sub(tr.pos[near.i]).dot(tr.tan[near.i]);
    const ds = wrap(s - this.lastS, tr.length);
    this.lastS = s; this.prog += ds;
    this.dist += speed * dt;
    this.top = Math.max(this.top, speed * 3.6);

    this.syncMovers(dt, s);
    this.updateEvent(dt);
    this.updatePolice(dt, s);
    if (this.stopsS.length) this.updateStops(dt, s);
    this.updateCrowd(dt);

    // ── visuals ──
    this.body.position.copy(this.pos);
    this.body.rotation.y = this.heading;
    const roll = THREE.MathUtils.clamp(-yaw * this.vf * 0.006 * (0.6 + def.mass) - slip * 0.08, -0.08, 0.08);
    this.me.root.rotation.z += (roll - this.me.root.rotation.z) * Math.min(1, 6 * dt);
    this.me.root.rotation.x += (THREE.MathUtils.clamp(-a * 0.004, -0.02, 0.02) - this.me.root.rotation.x) * Math.min(1, 5 * dt);
    this.me.root.position.y = Math.max(0, this.me.root.position.y - dt * 0.6) + (speed > 1 ? Math.sin(h.time * 31) * 0.004 : 0);
    const braking = brk > 0 || hand;
    this.lights.brake.forEach((b) => b.scale.setScalar(braking ? 1.8 : this.world.night ? 1 : 0.01));

    // smoke, skids, boost flame
    const rear = this.tmp.set(this.pos.x - nfx * def.length * 0.42, 0, this.pos.z - nfz * def.length * 0.42);
    const side = def.width * 0.42;
    if (sliding || (hand && speed > 5)) {
      if (Math.random() < 0.7) this.fx.puff(rear, this.vel.x, this.vel.y, def.kind === 'bus' ? 1.6 : 1);
      this.fx.skid([new THREE.Vector3(rear.x + nfz * side, 0, rear.z - nfx * side), new THREE.Vector3(rear.x - nfz * side, 0, rear.z + nfx * side)], def.kind === 'bus' ? 0.32 : 0.16);
    } else this.fx.skid([null, null], 0);
    if (h.boosting && Math.random() < 0.6) this.fx.sparkBurst(this.tmp2.set(rear.x, 0.5, rear.z), 1);
    this.squeal?.set(sliding ? Math.min(1, Math.abs(slip) * 2.2) : brk > 0 && speed > 12 ? 0.35 : 0);

    this.updateCamera(dtReal, speed);
    this.fx.update(dt, this.camera.position);
    const off = this.world.sun.userData.offset as THREE.Vector3;
    this.world.sun.position.copy(this.pos).add(off);
    this.world.sun.target.position.copy(this.pos);

    // ── hud + sound ──
    const sp01 = Math.abs(this.vf) / (st.top / 3.6);
    const g = Math.min(GEARS, 1 + Math.floor(sp01 * GEARS * 0.98));
    if (g !== this.gear && !rev) { if (g > this.gear) sfxFx.shift(); this.gear = g; }
    const inGear = sp01 * GEARS - (g - 1);
    h.rpm = Math.abs(this.vf) < 0.5 ? 0.12 + thr * 0.25 : 0.28 + 0.62 * THREE.MathUtils.clamp(inGear, 0, 1) + (h.boosting ? 0.08 : 0);
    h.gear = rev ? 0 : g;
    h.kmh = speed * 3.6;
    h.km = this.dist / 1000; h.overtakes = this.overtakes; h.nearMisses = this.nearMisses;
    h.coins = this.coinsEarned + Math.floor(h.km * 40);
    this.engine?.update(h.rpm, thr + (h.boosting ? 0.5 : 0), sp01);
  }

  private comfortHit(decel: number) {
    if (this.spec.type === 'route' && decel > 7) this.comfort = Math.max(0.4, this.comfort - (decel - 7) * 0.0015);
  }

  private bankDrift() {
    const pts = Math.round(this.driftScore);
    if (pts > 80) {
      this.driftTotal += pts; this.driftBest = Math.max(this.driftBest, pts);
      const coins = Math.floor(pts / 40);
      this.coinsEarned += coins;
      this.hud.boost = Math.min(1, this.hud.boost + pts * 0.00012);
      this.onEvent('drift', `${pts.toLocaleString()} drift · +${coins}`);
      record('drift', pts);
    }
    this.driftScore = 0; this.driftT = 0; this.driftMult = 1;
  }

  private bump(keep: number, impact: number, at: THREE.Vector3) {
    this.vel.multiplyScalar(keep); this.bumps++; this.bumpCd = 0.6;
    if (this.driftScore > 0) { this.driftScore = 0; this.driftT = 0; this.driftMult = 1; }
    this.comfortHit(12);
    if (impact > 8) {
      this.fx.sparkBurst(this.tmp2.set(at.x, 0.7, at.z), 18);
      this.shake = Math.min(0.6, impact * 0.03);
      if (impact > 14) this.slowmo = 0.6;
      if (progress.haptics) buzz(impact > 14 ? [40, 30, 60] : 40);
      sfx.bump(); this.onEvent('crash', '');
    } else { sfx.bump(); this.onEvent('bump', ''); }
  }

  // ── event rules ───────────────────────────────────────────────────────────
  private updateEvent(dt: number) {
    const h = this.hud, t = this.spec.type, L = this.track.length;
    if (this.finished !== null || h.countdown > 0) return;
    if (h.timer !== null) {
      h.timer = Math.max(0, h.timer - dt);
      if (h.timer === 0) {
        if (t === 'route' && this.stopIdx < this.stopsS.length) { this.failed = true; this.finish(); }
        else if (t === 'drift' || t === 'nearmiss') { if (this.driftScore) this.bankDrift(); this.finish(); }
      }
    }
    if (t === 'drift') h.score = this.driftTotal + Math.round(this.driftScore);
    if (t === 'nearmiss') h.score = this.nearMisses;
    if (t === 'route') h.score = Math.round(this.fares * this.comfort);
    if (this.isRace && h.race) {
      const r = h.race;
      const active = this.movers.filter((m) => m.rival && !m.rival.out);
      r.pos = 1 + active.filter((m) => m.rival!.done || m.rival!.prog > this.prog).length;
      r.total = active.length + 1;
      r.progress = THREE.MathUtils.clamp(this.prog / this.raceDist, 0, 1);
      const lap = Math.min(r.laps, 1 + Math.floor(this.prog / L));
      if (lap > r.lap) {
        if (t === 'knockout') {
          // last place is knocked out at each lap line
          if (r.pos === r.total) { this.failed = true; this.onEvent('knockout', 'You were knocked out'); this.finish(); return; }
          const last = active.sort((a, b) => a.rival!.prog - b.rival!.prog)[0];
          if (last) { last.rival!.out = true; last.model.root.visible = false; this.onEvent('knockout', `${last.rival!.name} is out`); }
        }
        r.lap = lap;
      }
      if (this.prog >= this.raceDist) this.finish();
    }
    if (t === 'checkpoint' && this.prog >= this.raceDist) {
      if (this.hud.heat > 0) h.objective = 'Lose the police to finish';
      else this.finish();
    }
  }

  private finish() {
    if (this.finished !== null) return;
    const h = this.hud;
    this.finished = this.isRace ? (this.failed ? h.race!.total : h.race!.pos) : 1;
    this.onEvent('finish', this.failed ? 'fail' : String(this.finished));
  }

  // ── police ────────────────────────────────────────────────────────────────
  private updatePolice(dt: number, s: number) {
    const p = this.police, h = this.hud, L = this.track.length;
    if (!p) return;
    // checkpoints
    this.world.layout.checkpoints.forEach((cp, i) => {
      const ahead = wrap(cp - s, L);
      if (ahead < 40 && ahead > 0 && !this.checkedCp.has(i)) { h.objective = h.heat ? h.objective : 'Police checkpoint ahead: slow down or run it'; }
      if (ahead <= 0 && ahead > -6 && !this.checkedCp.has(i)) {
        this.checkedCp.add(i);
        sfxFx.whistle();
        if (h.kmh > 30 && h.heat === 0) {
          h.heat = 1; this.heatT = 0; this.lostT = 0;
          p.s = cp - 30; p.lat = LANE; p.speed = this.vf * 0.9; p.model.root.visible = true;
          this.onEvent('heat', 'You ran the checkpoint!');
        } else if (h.heat === 0) {
          this.coinsEarned += 100; this.onEvent('checkpoint', 'Checked. Drive safe! +100');
        } else h.heat = Math.min(3, h.heat + 1);
        setTimeout(() => this.objective(), 3000);
      }
    });
    if (h.heat === 0) { this.siren?.set(0); h.policeGap = null; if (p.model.root.visible && Math.abs(wrap(p.s - s, L)) > 200) p.model.root.visible = false; return; }
    this.heatT += dt;
    const gap = wrap(s - p.s, L);
    h.policeGap = gap;
    // chase: faster with heat, closes in on the player's lane
    const want = Math.min((this.st.top / 3.6) * (1.02 + h.heat * 0.03), Math.max(0, this.vf) + 8 + h.heat * 3);
    p.speed += THREE.MathUtils.clamp(want - p.speed, -10 * dt, 6 * dt);
    p.lat += THREE.MathUtils.clamp(this.lat - p.lat, -2.5 * dt, 2.5 * dt);
    this.siren?.set(Math.max(0.2, 1 - Math.abs(gap) / 220));
    const flash = Math.sin(this.heatT * 18) > 0;
    this.lights.bar.forEach((b, i) => b.scale.setScalar((i === 0) === flash ? 2 : 0.6));
    if (gap > 160) { this.lostT += dt; if (this.lostT > 5) this.escape(); } else this.lostT = 0;
    if (gap < this.def.length / 2 + 6 && gap > -4 && Math.abs(this.vf) < 4) { this.caughtT += dt; if (this.caughtT > 2.2) this.caughtBy(); } else this.caughtT = Math.max(0, this.caughtT - dt);
    if (this.heatT > 30 + h.heat * 10 && gap > 80) this.escape();
  }
  private escape() {
    this.hud.heat = 0; this.escaped++; this.coinsEarned += 400; this.lostT = 0;
    record('escape', 1);
    this.onEvent('escaped', 'You lost the police! +400');
    this.objective();
  }
  private caughtBy() {
    this.hud.heat = 0; this.caught++; this.caughtT = 0;
    const fine = Math.min(300, progress.coins);
    progress.coins -= fine; save();
    this.onEvent('caught', `Pulled over. Warning ticket: −${fine} coins`);
    if (this.spec.type === 'checkpoint') { this.failed = true; this.finish(); }
    this.objective();
  }

  // ── bus stops ─────────────────────────────────────────────────────────────
  private updateStops(dt: number, s: number) {
    const h = this.hud, L = this.track.length;
    if (this.stopIdx >= this.stopsS.length) {
      if (this.spec.type === 'route' && this.finished === null) this.finish();
      h.stop = null; return;
    }
    const sv = this.stopsS[this.stopIdx], d = wrap(sv - s, L);
    h.stop = { index: this.stopIdx, total: this.stopsS.length, dist: Math.round(d), boarding: this.boardT / 2, comfort: this.comfort };
    const inBay = Math.abs(d) < 8 && this.lat > LANE - 0.9;
    if (inBay && Math.abs(this.vf) < 1.3) {
      if (this.boardT === 0) { sfxFx.door(); this.crowd.forEach((p) => { if (p.stop === this.stopIdx && !p.hide) p.board = 1; }); }
      this.boardT += dt;
      if (this.boardT >= 2) {
        const n = this.crowd.filter((p) => p.stop === this.stopIdx).length;
        const punctual = Math.max(0, 60 - (h.time - this.lastStopTime)) * 3;
        const fare = n * 40 + Math.round(punctual);
        this.fares += fare; this.passengers += n; this.coinsEarned += Math.round(fare / 2);
        this.crowd.forEach((p) => { if (p.stop === this.stopIdx) p.hide = true; });
        sfxFx.fare(); this.onEvent('fare', `${n} passengers · +${fare}`);
        record('passengers', n);
        this.stopIdx++; this.boardT = 0; this.lastStopTime = h.time;
        this.objective();
      }
    } else if (this.boardT > 0 && !inBay) this.boardT = 0;
    if (d < -12) { this.stopIdx++; this.boardT = 0; this.onEvent('stop', 'Missed the stop'); this.objective(); } // drove past
  }

  // ── traffic, rivals, police movement and contacts ─────────────────────────
  private syncMovers(dt: number, playerS = 0) {
    const tr = this.track, L = tr.length;
    const fwd = this.tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const halfL = this.def.length / 2, halfW = this.def.width / 2;
    const all = this.police && this.police.model.root.visible ? [...this.movers, this.police] : this.movers;
    for (const m of all) {
      if (m.rival?.out) continue;
      let gap = 999;
      const check = (os: number, olat: number, olen: number) => {
        if (Math.abs(olat - m.lat) > 1.9) return;
        const d = wrap(os - m.s, L) * m.dir - olen / 2 - m.len / 2;
        if (d > -2 && d < gap) gap = d;
      };
      for (const o of this.movers) if (o !== m && !o.rival?.out) check(o.s, o.lat, o.len);
      if (!m.police) check(playerS, this.lat, this.def.length);

      if (m.rival) {
        const rv = m.rival, i = Math.floor((((m.s % L) + L) % L) / tr.step) % tr.n;
        let kmax = 0; for (let q = 0; q < 14; q++) kmax = Math.max(kmax, this.curv[(i + q * 2) % tr.n]);
        // gentle rubber band: rivals far behind push a little, far ahead ease off
        const lead = rv.prog - this.prog, band = THREE.MathUtils.clamp(1 - lead / 900, 0.88, 1.12);
        let target = Math.min(rv.top * band, Math.sqrt((3.4 + rv.skill * 2.4) / Math.max(kmax, 1e-4)));
        if (this.hud.countdown > 0) target = 0;
        if (rv.done) target = 6;
        if (gap < 22) {
          const other = -rv.latT;
          const clear = !this.movers.some((o) => o !== m && Math.abs(o.lat - other) < 1.9 && Math.abs(wrap(o.s - m.s, L)) < (o.dir < 0 ? 70 : 16));
          if (clear) rv.latT = other; else target = Math.min(target, Math.max(0, gap * 0.7));
        } else if (rv.latT < 0 && gap > 40) rv.latT = LANE;
        m.lat += THREE.MathUtils.clamp(rv.latT - m.lat, -2.2 * dt, 2.2 * dt);
        m.speed += THREE.MathUtils.clamp(target - m.speed, -9 * dt, this.def.accel * rv.skill * dt);
        rv.prog += m.speed * dt;
        if (!rv.done && this.raceDist && rv.prog >= this.raceDist) rv.done = 1;
      } else if (!m.police) {
        const want = gap < 6 ? 0 : gap < 26 ? m.target * (gap - 6) / 20 : m.target;
        m.speed += THREE.MathUtils.clamp(want - m.speed, -12 * dt, 3 * dt);
      }
      m.s += m.dir * m.speed * dt;
      for (const o of this.movers) {
        if (o === m || o.rival?.out || Math.abs(o.lat - m.lat) > 1.9) continue;
        const ahead = wrap(o.s - m.s, L) * m.dir, minGap = (o.len + m.len) / 2 + 0.6;
        if (ahead > 0 && ahead < minGap) {
          m.s = o.s - m.dir * minGap;
          if (o.dir === m.dir) m.speed = Math.min(m.speed, o.speed);
          else { m.speed = 0; o.speed = 0; }
        }
      }
      tr.at(m.s, m.lat, m.pos);
      m.heading = tr.heading(m.s) + (m.dir < 0 ? Math.PI : 0);
      m.model.root.position.copy(m.pos);
      m.model.root.rotation.y = m.heading;
      const rel = this.tmp2.copy(m.pos).sub(this.pos);
      const far = rel.lengthSq();
      m.model.root.visible = far < 300 * 300;
      if (dt === 0 || far > 60 * 60) continue;

      const dz = rel.dot(fwd), dx = rel.x * fwd.z - rel.z * fwd.x;
      const same = Math.cos(m.heading - this.heading);
      const oz = halfL + (Math.abs(same) > 0.5 ? m.len : m.wid) / 2, ox = halfW + (Math.abs(same) > 0.5 ? m.wid : m.len) / 2;
      if (Math.abs(dz) < oz && Math.abs(dx) < ox) {
        const pz = oz - Math.abs(dz), px = ox - Math.abs(dx);
        const fxv = fwd.x, fzv = fwd.z;
        if (px < pz) { this.pos.x -= fzv * Math.sign(dx) * px; this.pos.z += fxv * Math.sign(dx) * px; this.vl *= 0.5; }
        else {
          this.pos.addScaledVector(fwd, -Math.sign(dz) * pz);
          const closing = this.vf * Math.sign(dz) - m.speed * same * Math.sign(dz);
          if (closing > 0) {
            if (this.bumpCd <= 0 && closing > 2) this.bump(0.35, closing, this.tmp2.copy(this.pos).addScaledVector(fwd, Math.sign(dz) * halfL));
            else { const v = m.speed * same * 0.9; this.vel.set(fwd.x * v, fwd.z * v); }
          }
        }
        if (!m.police) m.speed *= m.rival ? 0.7 : 0.5;
        m.behind = dz < 0; m.nm = true;
        continue;
      }
      if (m.police) continue;
      // near miss: alongside, very close, fast relative speed
      const along = Math.abs(dz) < halfL + m.len / 2, sideGap = Math.abs(dx) - (halfW + m.wid / 2);
      if (along && sideGap > 0 && sideGap < 1.1 && Math.abs(this.vf - m.speed * same) > 6 && !m.nm && !m.rival) {
        m.nm = true; this.nearMisses++; this.coinsEarned += 50;
        this.hud.boost = Math.min(1, this.hud.boost + 0.12);
        sfxFx.nearMiss(); this.onEvent('nearmiss', 'Near miss +50'); record('nearmiss', 1);
      }
      if (Math.abs(dz) > 30) m.nm = false;
      // overtake
      if (m.dir > 0 && Math.abs(dx) < 9) {
        if (dz > 4) m.behind = false;
        else if (dz < -halfL - m.len / 2 - 1 && !m.behind && this.vf > m.speed + 1) {
          m.behind = true; this.overtakes++; this.coinsEarned += 25;
          this.hud.boost = Math.min(1, this.hud.boost + 0.06);
          sfx.coin(); this.onEvent('overtake', 'Overtake +25'); record('overtake', 1);
        }
      }
    }
  }

  // ── camera ────────────────────────────────────────────────────────────────
  private updateCamera(dt: number, speed: number) {
    const sp = Math.min(1, speed / (this.st.top / 3.6));
    const cam = this.camera, L = this.def.length, H = this.me.size.y, tuk = this.def.kind === 'tuk';
    this.me.root.visible = this.camMode !== 1;
    const f = this.tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    let fov: number;
    if (this.camMode === 1) {
      const [ex, ey, ez] = this.def.eye;
      const right = this.tmp2.set(f.z, 0, -f.x);
      cam.position.copy(this.pos).addScaledVector(f, ez).addScaledVector(right, ex);
      cam.position.y = ey + (speed > 1 ? Math.sin(this.hud.time * 17) * 0.012 : 0);
      const look = this.pos.clone().addScaledVector(f, ez + 40).addScaledVector(right, ex);
      look.y = ey - (tuk ? 1.0 : 1.6);
      cam.lookAt(look);
      cam.rotateY(this.steer * 0.35);
      fov = (tuk ? 72 : 66) + sp * 6;
      this.camInit = false;
    } else {
      // chase: damped yaw follows the travel direction, so drifts show the car sideways
      const travel = speed > 3 && this.vf > 0 ? Math.atan2(this.vel.x, this.vel.y) : this.heading;
      if (!this.camInit) { this.camYaw = this.heading; this.camInit = true; }
      let d = travel - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * (1 - Math.exp(-dt * (this.camMode === 0 ? 4.5 : 3)));
      const cf = this.tmp2.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
      const farCam = this.camMode === 2;
      const back = tuk ? (farCam ? 11 : 4.6 + sp * 1.4) : farCam ? L * 0.6 + 14 : L * 0.5 + 5.2 + sp * 2.2;
      const up = tuk ? (farCam ? 6.5 : 2.1) : farCam ? H + 8 : H + 1.0;
      cam.position.copy(this.pos).addScaledVector(cf, -back);
      cam.position.y = up;
      const tgt = this.pos.clone().addScaledVector(cf, tuk ? 4 : L * 0.3 + 4);
      tgt.y = tuk ? 1.15 : H * 0.62;
      cam.lookAt(tgt);
      fov = (tuk ? 64 : 58) + sp * 14;
    }
    if (this.hud.boosting) fov += 10;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, 4 * dt); cam.updateProjectionMatrix(); }
  }

  // ── end: bank rewards ─────────────────────────────────────────────────────
  end(): Summary {
    this.done = true;
    if (this.driftScore) this.bankDrift();
    const spec = this.spec, km = this.dist / 1000, h = this.hud;
    const finishedOk = this.finished !== null && !this.failed;
    const result: RaceResult = { finished: finishedOk, position: this.isRace ? this.finished : null, time: h.time, score: h.score, caught: this.caught > 0, crashes: this.bumps };
    const stars = spec.type === 'free' ? 0 : starsFor(spec, result);
    const prevStars = progress.stars[spec.id] ?? 0;
    let coins = this.coinsEarned + Math.floor(km * 40), xp = Math.floor(km * 100) + this.overtakes * 20 + this.nearMisses * 15 + Math.floor(this.driftTotal / 200), gems = 0;
    if (stars > 0) {
      coins += Math.round(spec.reward.coins * (0.6 + stars * 0.2));
      xp += Math.round(spec.reward.xp * (0.6 + stars * 0.2));
      if (stars > prevStars && prevStars === 0) gems += spec.reward.gems;
      if (stars === 3 && prevStars < 3) gems += 2;
    }
    coins = Math.round(coins * (spec.id === live.weeklyEvent ? 2 : 1) * live.coinMultiplier);
    let newBest = false;
    if (finishedOk && spec.type !== 'free') {
      const key = spec.id, better = spec.type === 'checkpoint' || this.isRace ? (v: number) => h.time < v : (v: number) => h.score > v;
      const val = spec.type === 'checkpoint' || this.isRace ? h.time : h.score;
      if (progress.best[key] === undefined || better(progress.best[key])) { progress.best[key] = val; newBest = true; }
      progress.stars[key] = Math.max(prevStars, stars);
    }
    const before = levelInfo().level;
    progress.coins += coins; progress.gems += gems; progress.xp += xp; progress.km += km; progress.drives++;
    progress.overtakes += this.overtakes; progress.nearMisses += this.nearMisses; progress.passengers += this.passengers;
    progress.escapes += this.escaped; progress.catches += this.caught;
    progress.driftBest = Math.max(progress.driftBest, this.driftBest);
    if (this.isRace && this.finished === 1 && !this.failed) progress.wins++;
    const ch: Challenge[] = [...record('km', Math.round(km * 10) / 10)];
    if (this.isRace && this.finished === 1 && !this.failed) ch.push(...record('win', 1));
    const after = levelInfo().level;
    let levelUp: Summary['levelUp'] = null;
    if (after > before) {
      let c2 = 0, g2 = 0;
      for (let lv = before + 1; lv <= after; lv++) { const r = levelReward(lv); c2 += r.coins; g2 += r.gems; }
      progress.coins += c2; progress.gems += g2; levelUp = { level: after, coins: c2, gems: g2 };
    }
    save();
    return {
      spec, vehicle: this.def, result, stars, prevStars, newBest, coins, xp, gems,
      stats: { km, time: h.time, overtakes: this.overtakes, nearMisses: this.nearMisses, driftBest: this.driftBest, bumps: this.bumps, topKmh: this.top, passengers: this.passengers, escaped: this.escaped, caught: this.caught },
      challenges: ch, levelUp,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.horn(false);
    this.engine?.stop(); this.squeal?.stop(); this.siren?.stop();
    this.engine = null;
    this.me.dispose();
    this.movers.forEach((m) => m.model.dispose());
    this.police?.model.dispose();
    this.crowdLayer?.dispose();
    this.fx.dispose();
    this.glowTex.dispose();
    this.world.dispose();
  }
}
