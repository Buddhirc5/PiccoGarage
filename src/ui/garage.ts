import { track } from '../core/track';
import * as THREE from 'three';
import { horn, setCustomHorn, hasCustomHorn, ui as sfx, unlockAudio } from '../core/audio';
import { environment, setStage, type Stage } from '../core/renderer';
import { GLOWS, HORNS, TINTS, UPGRADES, VEHICLES, type VehicleId } from '../game/data';
import { loadModel, type LoadedModel } from '../game/models';
import { buyUpgrade, progress, save, saveBlob, stats } from '../game/progress';
import { fmtNum, h, mount, setBackdrop, toast } from './dom';
import { icon } from './icons';
import { cta } from './landing';

/** 3D turntable on a transparent canvas: the CSS gradient and giant type show through. */
class Showroom implements Stage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private pivot = new THREE.Group();
  private model: LoadedModel | null = null;
  private glow: THREE.Mesh;
  private token = 0;
  spin = 0.3; yaw = -0.6; private len = 10; private h = 3; private intro = 0;

  constructor() {
    const s = this.scene;
    s.environment = environment(); s.environmentIntensity = 0.95;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.ShadowMaterial({ opacity: 0.45 }));
    shadow.rotation.x = -Math.PI / 2; shadow.receiveShadow = true; s.add(shadow);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 12, 9); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
    s.add(key);
    const rim = new THREE.DirectionalLight(0xff4a3a, 3); rim.position.set(-8, 4, -8); s.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff6a50, 2); rim2.position.set(8, 3, -6); s.add(rim2);
    s.add(new THREE.HemisphereLight(0xfff0ea, 0x4a1012, 0.8));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.04; this.glow.visible = false;
    this.pivot.add(this.glow);
    s.add(this.pivot);
  }

  async show(id: VehicleId): Promise<void> {
    const t = ++this.token;
    const def = VEHICLES.find((v) => v.id === id)!;
    const m = await loadModel(def.model);
    if (t !== this.token) { m.dispose(); return; }
    if (this.model) { this.pivot.remove(this.model.root); this.model.dispose(); }
    this.model = m; this.len = def.length; this.h = m.size.y; this.intro = 1;
    this.pivot.add(m.root);
    this.glow.scale.set(def.width * 2.6, def.length * 1.4, 1);
    this.paint(id);
  }
  paint(id: VehicleId) {
    const def = VEHICLES.find((v) => v.id === id)!, g = progress.garage[id];
    if (def.tintable) this.model?.setTint(g.tint);
    this.glow.visible = !!g.glow;
    if (g.glow) (this.glow.material as THREE.MeshBasicMaterial).color.set(g.glow);
  }
  update(dt: number) {
    this.yaw += this.spin * dt;
    this.intro = Math.max(0, this.intro - dt * 1.6);
    const e = this.intro * this.intro;
    this.pivot.rotation.y = this.yaw - e * 1.2;
    this.pivot.position.x = e * this.len * 0.9;
    // frame the whole vehicle whatever the canvas shape
    const a = this.camera.aspect, vf = THREE.MathUtils.degToRad(this.camera.fov);
    const span = Math.max(this.len * 0.82, this.h * 1.3);
    const fit = (span / 2) / Math.tan(vf / 2) / Math.min(1, a);
    const d = fit * 0.98 + this.len * 0.12;
    this.camera.position.set(0, this.h * 0.55 + d * 0.2, d);
    this.camera.lookAt(0, this.h * 0.42, 0);
  }
}

let room: Showroom | null = null;

export function showGarage(onBack: () => void, onNext: () => void): void {
  room ??= new Showroom();
  const stage = room;
  document.body.className = 'garage';
  let idx = Math.max(0, VEHICLES.findIndex((v) => v.id === progress.vehicle));
  let tab: 'tune' | 'paint' | 'glow' | 'horn' = 'tune';
  const cur = () => VEHICLES[idx];

  const giant = h('div.giant', { 'aria-hidden': 'true' });
  setBackdrop(h('div.gbg', {}, giant, h('div.halo')));
  const coins = h('span.num');
  const name = h('div.vname');
  const statRow = h('div.stats');
  const dots = h('div.dots');
  const chips = h('div.chips');
  const opts = h('div.opts');
  const file = h<HTMLInputElement>('input', { type: 'file', accept: 'audio/*', style: 'display:none' });

  const renderHead = () => {
    const v = cur(), s = stats(v.id);
    giant.textContent = v.big;
    giant.className = 'giant';
    giant.style.fontSize = `${Math.min(40, 92 / (v.big.length * 0.46))}cqw`;
    giant.style.animation = 'none'; void giant.offsetWidth; giant.style.animation = '';
    name.replaceChildren(h('h2', {}, v.name), h('span.idx', {}, `0${idx + 1} / 0${VEHICLES.length}`));
    statRow.replaceChildren(
      h('div', {}, h('span', {}, 'Top speed'), h('b.num', {}, `${Math.round(s.top)} km/h`)),
      h('div', {}, h('span', {}, '0-60'), h('b.num', {}, `${(60 / 3.6 / s.accel).toFixed(1)} s`)),
      h('div', {}, h('span', {}, 'Grip'), h('b.num', {}, `${Math.round(s.bars.handling * 100)}`)));
    dots.replaceChildren(...VEHICLES.map((_, i) => h('i', { class: i === idx ? 'on' : '' })));
    coins.textContent = fmtNum(progress.coins);
  };
  const renderOpts = () => {
    const v = cur(), g = progress.garage[v.id];
    chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === tab));
    const st = (i: number) => `--i:${i}`;
    if (tab === 'paint') {
      if (!v.tintable) { opts.replaceChildren(h('p.note', {}, 'The route bus keeps its classic red livery.')); return; }
      opts.replaceChildren(...TINTS.map((c, i) => h('button', { class: `sw${g.tint === c ? ' on' : ''}`, style: `background:${c};${st(i)}`, 'aria-label': `Paint ${c}`,
        onclick: () => { g.tint = c; save(); sfx.select(); stage.paint(v.id); renderOpts(); } })));
    } else if (tab === 'glow') {
      opts.replaceChildren(...GLOWS.map((c, i) => h('button', { class: `sw${c ? '' : ' none'}${g.glow === c ? ' on' : ''}`, style: `${c ? `background:${c};box-shadow:0 0 22px ${c}${g.glow === c ? ',0 0 0 3px #fff' : ''}` : ''};${st(i)}`, 'aria-label': c ? `Underglow ${c}` : 'No underglow',
        onclick: () => { g.glow = c; save(); sfx.select(); stage.paint(v.id); renderOpts(); } }, c ? null : icon('close', 18))));
    } else if (tab === 'tune') {
      opts.replaceChildren(...UPGRADES.map((u, i) => {
        const lv = g.up[u.id], cost = u.costs[lv];
        const card = h('button', { class: `ocard${cost !== undefined && progress.coins < cost ? ' cant' : ''}`, style: st(i) },
          h('b', {}, icon(u.id === 'engine' ? 'bolt' : u.id === 'brakes' ? 'disc' : 'tyre', 17), u.name),
          h('div.lv', {}, ...[0, 1, 2].map((k) => h('i', { class: k < lv ? 'on' : '' }))),
          h('span.price', {}, cost === undefined ? 'Fully upgraded' : `${fmtNum(cost)} coins`));
        card.addEventListener('click', () => {
          if (cost === undefined) return;
          if (buyUpgrade(v.id, u.id)) { track('upgrade', { vehicle: v.id, part: u.id, level: lv + 1 }); sfx.buy(); toast(`${u.name} upgraded to level ${lv + 1}`); renderHead(); renderOpts(); }
          else { sfx.deny(); toast('Not enough coins yet. Drive to earn more.'); }
        });
        return card;
      }));
    } else {
      opts.replaceChildren(...HORNS.map((hn, i) => {
        const owned = progress.horns.includes(hn.id);
        const sub = hn.id === 'custom' ? (hasCustomHorn() ? 'Tap to use. Hold to replace' : 'Load a sound file') : owned ? 'Tap to play' : `${fmtNum(hn.cost)} coins`;
        const card = h('button', { class: `ocard${g.horn === hn.id ? ' on' : ''}`, style: st(i) },
          h('b', {}, icon(hn.id === 'custom' ? 'upload' : owned ? 'horn' : 'lock', 16), hn.name), h('span', {}, sub));
        let held = 0;
        card.addEventListener('pointerdown', () => { held = Date.now(); });
        card.addEventListener('click', async () => {
          await unlockAudio();
          if (hn.id === 'custom' && (!hasCustomHorn() || Date.now() - held > 500)) { file.click(); return; }
          if (!owned) {
            if (progress.coins < hn.cost) { sfx.deny(); toast('Not enough coins yet.'); return; }
            progress.coins -= hn.cost; progress.horns.push(hn.id); sfx.buy();
          }
          g.horn = hn.id; save(); renderHead(); renderOpts();
          const off = horn(hn.id); setTimeout(off, 700);
        });
        return card;
      }));
    }
  };
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    if (f.size > 3_000_000) { toast('Please choose a sound under 3 MB.'); return; }
    const data = await f.arrayBuffer();
    if (!(await setCustomHorn(data))) { toast('That file could not be read as audio.'); return; }
    await saveBlob('horn', data).catch(() => {});
    progress.garage[cur().id].horn = 'custom'; save(); renderOpts();
    toast('Your horn is ready.'); horn('custom');
  });

  const go = (d: number) => { idx = (idx + d + VEHICLES.length) % VEHICLES.length; progress.vehicle = cur().id; save(); sfx.select(); stage.show(cur().id); renderHead(); renderOpts(); track('vehicle', { vehicle: cur().id }); };
  for (const [t, label, ic] of [['tune', 'Performance', 'bolt'], ['paint', 'Paint', 'paint'], ['glow', 'Underglow', 'glow'], ['horn', 'Horn', 'horn']] as const)
    chips.append(h('button', { class: 'chip', 'data-t': t, onclick: () => { tab = t; sfx.tap(); renderOpts(); } }, icon(ic, 16), label));

  const stageEl = h('div.stagez', {},
    h('button.cbtn.arrow.l', { 'aria-label': 'Previous vehicle', onclick: () => go(-1) }, icon('chevL', 22)),
    h('button.cbtn.arrow.r', { 'aria-label': 'Next vehicle', onclick: () => go(1) }, icon('chevR', 22)),
    dots);
  // drag to rotate, swipe to change vehicle
  let drag: { x: number; x0: number; t: number } | null = null;
  stageEl.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('button')) return; drag = { x: e.clientX, x0: e.clientX, t: Date.now() }; stage.spin = 0; });
  stageEl.addEventListener('pointermove', (e) => { if (drag) { stage.yaw += (e.clientX - drag.x) * 0.01; drag.x = e.clientX; } });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, fast = Date.now() - drag.t < 300;
    if (fast && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    drag = null; stage.spin = 0.3;
  };
  stageEl.addEventListener('pointerup', end); stageEl.addEventListener('pointercancel', end);

  mount(h('div.screen.garage', {},
    h('div.bar', {}, h('button.cbtn', { 'aria-label': 'Back', onclick: () => { sfx.back(); onBack(); } }, icon('chevL', 22)), h('span.ttl', {}, 'Garage'), h('div.spacer'), h('div.coins', {}, icon('coin', 18), coins)),
    stageEl,
    h('div.info', {}, name, statRow, chips, opts, cta('Choose a city', onNext)),
    file,
  ));
  setStage(stage);
  stage.show(cur().id); renderHead(); renderOpts();
}
