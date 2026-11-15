import * as THREE from 'three';
import { horn as playHorn, startEngine, ui as sfx, type EngineSound } from '../core/audio';
import { environment, type Stage } from '../core/renderer';
import { settings } from '../core/settings';
import { VEHICLES, type CityDef, type VehicleDef } from './data';
import { loadModel, type LoadedModel } from './models';
import { progress, save, stats } from './progress';
import { LANE, LIMIT, ROAD_HALF, buildWorld, type Track, type World } from './world';

/** One drive: world + player vehicle + traffic + (optional) race rivals. */
export interface Input { steer: number; throttle: number; brake: number; handbrake: boolean }
export interface HudState {
  kmh: number; gear: 'D' | 'R'; rpm: number;
  race: { pos: number; total: number; lap: number; time: number } | null;
  countdown: number;           // >0 while the race start is counting down
  coins: number; km: number; overtakes: number;
}
export interface Summary { mode: 'free' | 'race'; city: string; km: number; time: number; overtakes: number; bumps: number; coins: number; xp: number; position: number | null; total: number; best: boolean; topKmh: number }

interface Mover { model: LoadedModel; s: number; lat: number; dir: 1 | -1; speed: number; target: number; len: number; wid: number; pos: THREE.Vector3; heading: number; behind: boolean; rival?: { prog: number; skill: number; top: number; latT: number; done: number } }

const TRAFFIC_MODELS = ['car', 'car', 'tuk', 'lorry', 'car', 'sltb', 'tuk', 'pbus'];
const wrap = (d: number, L: number) => ((d + L / 2) % L + L) % L - L / 2;

export class Drive implements Stage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 1400);
  input: Input = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  hud: HudState = { kmh: 0, gear: 'D', rpm: 0, race: null, countdown: 0, coins: 0, km: 0, overtakes: 0 };
  paused = false;
  camMode = 0;
  onEvent: (kind: 'overtake' | 'bump' | 'finish' | 'go', text: string) => void = () => {};
  track!: Track;
  movers: Mover[] = [];
  pos = new THREE.Vector3();
  heading = 0;

  private world!: World;
  private me!: LoadedModel;
  private body = new THREE.Group();
  private def: VehicleDef;
  private st: ReturnType<typeof stats>;
  private v = 0; private steer = 0; private idx = 0; private prog = 0; private lastS = 0;
  private dist = 0; private time = 0; private bumps = 0; private overtakes = 0; private coins = 0; private top = 0;
  private finished: number | null = null; private bumpCd = 0;
  private engine: EngineSound | null = null; private hornOff: (() => void) | null = null;
  private keys = new Set<string>();
  private camPos = new THREE.Vector3(); private camInit = false;
  private curv: number[] = [];
  private glow: THREE.Mesh | null = null;
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3();

  constructor(public city: CityDef, vehicleId: string, public mode: 'free' | 'race') {
    this.def = VEHICLES.find((v) => v.id === vehicleId)!;
    this.st = stats(this.def.id);
  }

  async load(): Promise<void> {
    const low = settings.quality === 'low';
    this.scene.environment = environment();
    this.scene.environmentIntensity = 0.7;
    this.scene.fog = new THREE.Fog(this.city.sky.fog, 90, low ? this.city.sky.fogFar * 0.7 : this.city.sky.fogFar);
    this.world = await buildWorld(this.city);
    this.track = this.world.track;
    this.scene.add(this.world.group);
    const tr = this.track;
    for (let i = 0; i < tr.n; i++) {
      const a = tr.tan[(i + 4) % tr.n], b = tr.tan[(i - 4 + tr.n) % tr.n];
      this.curv.push(Math.abs(Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z)) / (8 * tr.step));
    }

    // player
    const g = progress.garage[this.def.id];
    this.me = await loadModel(this.def.model);
    if (this.def.tintable) this.me.setTint(g.tint);
    this.body.add(this.me.root);
    if (g.glow) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d')!, gr = c.createRadialGradient(32, 32, 4, 32, 32, 32);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, g.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
      this.glow = new THREE.Mesh(new THREE.PlaneGeometry(this.def.width * 2.4, this.def.length * 1.35),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
      this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.06;
      this.body.add(this.glow);
    }
    this.scene.add(this.body);
    this.place(10, LANE);

    // traffic
    const count = Math.round(this.city.traffic * (low ? 0.5 : settings.quality === 'medium' ? 0.8 : 1));
    for (let k = 0; k < count; k++) {
      const name = TRAFFIC_MODELS[k % TRAFFIC_MODELS.length];
      const model = await loadModel(`/assets/models/${name}.glb`, true);
      const dir = k % 2 ? -1 : 1;
      const s = 70 + ((k + 0.5) / count) * (tr.length - 110);
      const speed = (name === 'tuk' ? 8.5 : name === 'car' ? 11.5 : 9.5) + (k % 3);
      this.addMover({ model, s, lat: dir * LANE, dir, speed, target: speed, len: model.size.z, wid: model.size.x, pos: new THREE.Vector3(), heading: 0, behind: true });
    }
    // race rivals (same class as the player, lined up ahead on the grid)
    if (this.mode === 'race') {
      const tints = ['#f2b705', '#1f6feb', '#16a34a'];
      for (let k = 0; k < 3; k++) {
        const model = await loadModel(this.def.model);
        if (this.def.tintable) model.setTint(tints[k]);
        const skill = 0.8 + k * 0.05;
        this.addMover({ model, s: 16 + (k + 1) * (this.def.length + 8), lat: k % 2 ? LANE : -LANE, dir: 1, speed: 0, target: 0, len: this.def.length, wid: this.def.width, pos: new THREE.Vector3(), heading: 0, behind: false,
          rival: { prog: 6 + (k + 1) * (this.def.length + 8), skill, top: (this.def.topSpeed / 3.6) * skill, latT: k % 2 ? LANE : -LANE, done: 0 } });
      }
      this.hud.race = { pos: 4, total: 4, lap: 0, time: 0 };
      this.hud.countdown = 3.99;
    }
    this.syncMovers(0);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.engine = startEngine(this.def.engine);
    this.update(0);
  }

  private addMover(m: Mover) { this.movers.push(m); this.scene.add(m.model.root); }

  private place(s: number, lat: number) {
    this.track.at(s, lat, this.pos);
    this.heading = this.track.heading(s);
    this.idx = Math.floor(s / this.track.step);
    this.lastS = s; this.prog = 0; this.v = 0;
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
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };

  nextCamera() { this.camMode = (this.camMode + 1) % 3; this.camInit = false; }
  toggleGear() { if (Math.abs(this.v) < 2) { this.hud.gear = this.hud.gear === 'D' ? 'R' : 'D'; sfx.tap(); } else sfx.deny(); }
  horn(on: boolean) {
    if (on && !this.hornOff) this.hornOff = playHorn(progress.garage[this.def.id].horn);
    if (!on && this.hornOff) { this.hornOff(); this.hornOff = null; }
  }

  update(dt: number): void {
    if (this.paused) return;
    const tr = this.track, st = this.st, def = this.def, k = this.keys;
    const locked = this.hud.countdown > 0 || this.finished !== null;
    if (this.hud.countdown > 0) {
      const before = Math.floor(this.hud.countdown);
      this.hud.countdown -= dt;
      const after = Math.floor(Math.max(0, this.hud.countdown));
      if (after !== before) { sfx.count(after); if (after === 0) this.onEvent('go', 'GO'); }
    }

    // ── input ──
    let steerIn = this.input.steer, thr = this.input.throttle, brk = this.input.brake;
    if (k.has('ArrowLeft') || k.has('KeyA')) steerIn = 1;
    if (k.has('ArrowRight') || k.has('KeyD')) steerIn = -1;
    if (k.has('ArrowUp') || k.has('KeyW')) thr = 1;
    if (k.has('ArrowDown') || k.has('KeyS')) brk = 1;
    const hand = this.input.handbrake || k.has('Space');
    if (locked) { thr = 0; brk = this.finished !== null ? 0.5 : 1; }

    // ── longitudinal ──
    const vmax = st.top / 3.6, rev = this.hud.gear === 'R';
    const onWalk = Math.abs(this.lat) > ROAD_HALF - def.width * 0.3;
    let a = 0;
    if (!rev) a += thr * st.accel * Math.max(0, 1 - Math.pow(Math.max(0, this.v) / vmax, 1.6));
    else a -= thr * st.accel * 0.6 * Math.max(0, 1 + this.v / (vmax * 0.22));
    const sign = Math.sign(this.v) || (rev ? -1 : 1);
    a -= sign * (0.25 + 0.0009 * this.v * this.v + (onWalk ? 2.2 : 0)) * (Math.abs(this.v) > 0.05 ? 1 : 0);
    const decel = (brk * st.brake + (hand ? st.brake * 1.2 : 0)) * dt;
    this.v += a * dt;
    if (decel) this.v = Math.abs(this.v) <= decel ? 0 : this.v - Math.sign(this.v) * decel;
    if (!thr && Math.abs(this.v) < 0.08) this.v = 0;

    // ── steering (speed-sensitive) ──
    const maxSteer = st.steer / (1 + Math.abs(this.v) / (9 * st.grip));
    const rate = (steerIn === 0 ? 5 : 3.2) * dt;
    this.steer += THREE.MathUtils.clamp(steerIn * maxSteer - this.steer, -rate, rate);
    const yaw = (this.v * Math.tan(this.steer)) / def.wheelBase;
    this.heading += yaw * dt;
    this.pos.x += Math.sin(this.heading) * this.v * dt;
    this.pos.z += Math.cos(this.heading) * this.v * dt;

    // ── stay inside the street corridor ──
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
      if (Math.abs(this.v) > 6 && this.bumpCd <= 0) this.bump(Math.abs(Math.sin(along)) > 0.25 ? 0.55 : 0.9);
      else this.v *= 1 - Math.min(0.9, 1.5 * dt);
    }
    this.bumpCd -= dt;

    // ── progress along the loop ──
    const s = near.i * tr.step + this.tmp.copy(this.pos).sub(tr.pos[near.i]).dot(tr.tan[near.i]);
    const ds = wrap(s - this.lastS, tr.length);
    this.lastS = s; this.prog += ds;
    this.dist += Math.abs(this.v) * dt;
    if (!locked) this.time += dt;
    this.top = Math.max(this.top, Math.abs(this.v) * 3.6);

    this.syncMovers(dt, s);

    // ── race state ──
    if (this.hud.race) {
      const r = this.hud.race;
      r.time = this.time;
      r.pos = 1 + this.movers.filter((m) => m.rival && (m.rival.done ? true : m.rival.prog > this.prog + 10) && !(this.finished !== null && !m.rival.done)).length;
      r.lap = THREE.MathUtils.clamp(this.prog / (tr.length - 10), 0, 1);
      if (this.finished === null && this.prog >= tr.length - 10) {
        this.finished = 1 + this.movers.filter((m) => m.rival?.done).length;
        this.onEvent('finish', String(this.finished));
      }
    }

    // ── visuals ──
    this.body.position.copy(this.pos);
    this.body.rotation.y = this.heading;
    const roll = THREE.MathUtils.clamp(-yaw * this.v * 0.006 * (0.6 + def.mass), -0.07, 0.07);
    this.me.root.rotation.z += (roll - this.me.root.rotation.z) * Math.min(1, 6 * dt);
    this.me.root.rotation.x += (THREE.MathUtils.clamp(-a * 0.004, -0.02, 0.02) - this.me.root.rotation.x) * Math.min(1, 5 * dt);
    this.me.root.position.y = Math.abs(this.v) > 1 ? Math.sin(this.time * 31) * 0.006 : 0;
    this.updateCamera(dt);
    const off = this.world.sun.userData.offset as THREE.Vector3;
    this.world.sun.position.copy(this.pos).add(off);
    this.world.sun.target.position.copy(this.pos);

    // ── hud + sound ──
    const sp01 = Math.abs(this.v) / vmax;
    const gearPos = (sp01 * 4.6) % 1;
    this.hud.rpm = Math.abs(this.v) < 0.5 ? 0.12 + thr * 0.25 : 0.3 + 0.6 * gearPos + 0.1 * sp01;
    this.hud.kmh = Math.abs(this.v) * 3.6;
    this.hud.km = this.dist / 1000; this.hud.overtakes = this.overtakes; this.hud.coins = this.coins + Math.floor(this.dist / 1000 * 40);
    this.engine?.update(this.hud.rpm, thr, sp01);
  }

  private lat = LANE;

  private bump(keep: number) {
    this.v *= keep; this.bumps++; this.bumpCd = 0.7;
    sfx.bump(); this.onEvent('bump', '');
  }

  private syncMovers(dt: number, playerS = 0) {
    const tr = this.track, L = tr.length;
    const fwd = this.tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const halfL = this.def.length / 2, halfW = this.def.width / 2;
    for (const m of this.movers) {
      // look ahead in the same lane
      let gap = 999;
      const check = (os: number, olat: number, olen: number) => {
        if (Math.abs(olat - m.lat) > 1.9) return;
        const d = wrap(os - m.s, L) * m.dir - olen / 2 - m.len / 2;
        if (d > -2 && d < gap) gap = d;
      };
      for (const o of this.movers) if (o !== m) check(o.s, o.lat, o.len);
      check(playerS, this.lat, this.def.length);

      if (m.rival) {
        const rv = m.rival, i = Math.floor((((m.s % L) + L) % L) / tr.step) % tr.n;
        let kmax = 0; for (let q = 0; q < 14; q++) kmax = Math.max(kmax, this.curv[(i + q * 2) % tr.n]);
        let target = Math.min(rv.top, Math.sqrt((3.2 + rv.skill * 2.2) / Math.max(kmax, 1e-4)));
        if (this.hud.countdown > 0) target = 0;
        if (rv.done) target = 6;
        if (gap < 22) {
          // try the other lane if nothing is coming
          const other = -rv.latT;
          const clear = !this.movers.some((o) => o !== m && Math.abs(o.lat - other) < 1.9 && Math.abs(wrap(o.s - m.s, L)) < (o.dir < 0 ? 70 : 16));
          if (clear) rv.latT = other; else target = Math.min(target, Math.max(0, gap * 0.7));
        } else if (rv.latT < 0 && gap > 40) rv.latT = LANE;
        m.lat += THREE.MathUtils.clamp(rv.latT - m.lat, -2.2 * dt, 2.2 * dt);
        m.speed += THREE.MathUtils.clamp(target - m.speed, -9 * dt, this.def.accel * rv.skill * dt);
        rv.prog += m.speed * dt;
        if (!rv.done && rv.prog >= L - 10) rv.done = 1;
      } else {
        const want = gap < 6 ? 0 : gap < 26 ? m.target * (gap - 6) / 20 : m.target;
        m.speed += THREE.MathUtils.clamp(want - m.speed, -12 * dt, 3 * dt);
      }
      m.s += m.dir * m.speed * dt;
      tr.at(m.s, m.lat, m.pos);
      m.heading = tr.heading(m.s) + (m.dir < 0 ? Math.PI : 0);
      m.model.root.position.copy(m.pos);
      m.model.root.rotation.y = m.heading;
      const rel = this.tmp2.copy(m.pos).sub(this.pos);
      const far = rel.lengthSq();
      m.model.root.visible = far < 260 * 260;
      if (dt === 0 || far > 60 * 60) continue;

      // ── contact with the player (box test in the player's frame) ──
      const dz = rel.dot(fwd), dx = rel.x * fwd.z - rel.z * fwd.x;
      const same = Math.cos(m.heading - this.heading);
      const oz = halfL + (Math.abs(same) > 0.5 ? m.len : m.wid) / 2, ox = halfW + (Math.abs(same) > 0.5 ? m.wid : m.len) / 2;
      if (Math.abs(dz) < oz && Math.abs(dx) < ox) {
        const pz = oz - Math.abs(dz), px = ox - Math.abs(dx);
        if (px < pz) { this.pos.x -= fwd.z * Math.sign(dx) * px; this.pos.z += fwd.x * Math.sign(dx) * px; }
        else {
          this.pos.addScaledVector(fwd, -Math.sign(dz) * pz);
          const closing = this.v * Math.sign(dz) - m.speed * same * Math.sign(dz);
          if (closing > 0) { if (this.bumpCd <= 0 && closing > 2) this.bump(0.35); else this.v = m.speed * same * 0.9; }
        }
        if (!m.rival) m.speed *= 0.5;
        m.behind = dz < 0; // no overtake credit after a contact
        continue;
      }
      // ── overtakes: pass a vehicle travelling the same way ──
      if (m.dir > 0 && Math.abs(dx) < 9) {
        if (dz > 4) m.behind = false;
        else if (dz < -halfL - m.len / 2 - 1 && !m.behind && this.v > m.speed + 1) {
          m.behind = true; this.overtakes++; this.coins += 25; sfx.coin();
          this.onEvent('overtake', '+25');
        }
      }
    }
  }

  private updateCamera(dt: number) {
    const f = this.tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const sp = Math.min(1, Math.abs(this.v) / (this.st.top / 3.6));
    const cam = this.camera, L = this.def.length, H = this.me.size.y;
    if (this.camMode === 1) {
      const e = this.def.eye;
      cam.position.copy(this.pos).addScaledVector(f, L / 2 + 0.15).add(this.tmp2.set(f.z * e[0], e[1], -f.x * e[0]));
      cam.lookAt(this.tmp2.copy(this.pos).addScaledVector(f, L / 2 + 30).setY(e[1] - 1.2));
    } else {
      const back = this.camMode === 0 ? L * 0.78 + 5 + sp * 1.8 : L * 0.9 + 12;
      const up = this.camMode === 0 ? H * 0.9 + 1.5 : H + 8;
      const want = this.tmp2.copy(this.pos).addScaledVector(f, -back).setY(up);
      if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
      this.camPos.lerp(want, 1 - Math.exp(-dt * 6));
      cam.position.copy(this.camPos);
      cam.lookAt(this.tmp2.copy(this.pos).addScaledVector(f, L * 0.35 + 4).setY(H * 0.55));
    }
    const fov = 60 + sp * 16;
    if (Math.abs(cam.fov - fov) > 0.2) { cam.fov += (fov - cam.fov) * Math.min(1, 4 * dt); cam.updateProjectionMatrix(); }
  }

  /** Ends the drive, banks rewards and returns the summary. */
  end(): Summary {
    const km = this.dist / 1000;
    let coins = this.coins + Math.floor(km * 40);
    let xp = Math.floor(km * 100) + this.overtakes * 30;
    let best = false;
    if (this.mode === 'race' && this.finished !== null) {
      coins += [600, 350, 200, 100][this.finished - 1];
      xp += [400, 250, 150, 80][this.finished - 1];
      const key = `${this.city.id}:${this.def.id}`;
      if (!progress.best[key] || this.time < progress.best[key]) { progress.best[key] = this.time; best = true; }
      if (this.finished === 1) progress.wins++;
    }
    progress.coins += coins; progress.xp += xp; progress.km += km; progress.drives++; progress.overtakes += this.overtakes;
    save();
    return { mode: this.mode, city: this.city.name, km, time: this.time, overtakes: this.overtakes, bumps: this.bumps, coins, xp, position: this.finished, total: 4, best, topKmh: this.top };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.horn(false);
    this.engine?.stop(); this.engine = null;
    this.me.dispose();
    this.movers.forEach((m) => m.model.dispose());
    this.world.dispose();
  }
}
