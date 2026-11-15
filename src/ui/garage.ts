import * as THREE from 'three';
import { horn, setCustomHorn, hasCustomHorn, ui as sfx, unlockAudio } from '../core/audio';
import { environment, setStage, type Stage } from '../core/renderer';
import { GLOWS, HORNS, TINTS, UPGRADES, VEHICLES, type VehicleId } from '../game/data';
import { loadModel, type LoadedModel } from '../game/models';
import { buyUpgrade, progress, save, saveBlob, stats } from '../game/progress';
import { btn, fmtNum, h, mount, toast } from './dom';
import { icon } from './icons';

/** 3D showroom: dark floor, red light bars, the vehicle on a slow turntable. */
class Showroom implements Stage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  private pivot = new THREE.Group();
  private model: LoadedModel | null = null;
  private glow: THREE.Mesh;
  private token = 0;
  spin = 0.25; yaw = -0.7; private len = 10;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x09090b);
    s.fog = new THREE.Fog(0x09090b, 26, 70);
    s.environment = environment(); s.environmentIntensity = 0.9;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x141417, roughness: 0.32, metalness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const key = new THREE.SpotLight(0xffffff, 900, 60, 0.6, 0.6); key.position.set(6, 16, 10); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xff5040, 2.2); rim.position.set(-10, 5, -8); s.add(rim);
    const fill = new THREE.DirectionalLight(0x9db8ff, 0.9); fill.position.set(10, 4, -6); s.add(fill);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff3528 });
    for (const [x, z, r] of [[-14, -12, 0.5], [14, -12, -0.5], [0, -18, 0]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.16, 0.16), barMat); b.position.set(x, 5.5, z); b.rotation.y = r; s.add(b);
      const b2 = b.clone(); b2.position.y = 0.1; s.add(b2);
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d')!, g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.05; this.glow.visible = false;
    this.pivot.add(this.glow);
    s.add(this.pivot);
  }

  async show(id: VehicleId): Promise<void> {
    const t = ++this.token;
    const def = VEHICLES.find((v) => v.id === id)!;
    const m = await loadModel(def.model);
    if (t !== this.token) { m.dispose(); return; }
    if (this.model) { this.pivot.remove(this.model.root); this.model.dispose(); }
    this.model = m; this.len = def.length;
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
    this.pivot.rotation.y = this.yaw;
    const portrait = this.camera.aspect < 1;
    const d = this.len * (portrait ? 2.5 : 1.25) + 6;
    this.camera.position.set(portrait ? 0 : -this.len * 0.12, 2.2 + this.len * 0.13, d);
    const low = !portrait && window.innerHeight < 480; // short phones: lift the vehicle above the dock
    this.camera.lookAt(portrait ? 0 : -this.len * 0.12, this.len * 0.1 + (portrait ? -this.len * 0.25 : low ? -this.len * 0.11 : 0.2), 0);
  }
}

let room: Showroom | null = null;

export function showGarage(onBack: () => void, onNext: () => void): void {
  room ??= new Showroom();
  const stage = room;
  setStage(stage);
  let idx = Math.max(0, VEHICLES.findIndex((v) => v.id === progress.vehicle));
  let tab: 'paint' | 'tune' | 'horn' | 'glow' = 'tune';

  const coins = h('span.num');
  const info = h('div.g-info');
  const body = h('div.g-body');
  const seg = h('div.seg');
  const file = h<HTMLInputElement>('input', { type: 'file', accept: 'audio/*', style: 'display:none' });
  const cur = () => VEHICLES[idx];

  const bar = (label: string, v: number) => h('div.bar', {}, h('span', {}, label), h('div.t', {}, h('i', { style: `width:${Math.min(100, v * 100)}%` })), h('b.num', {}, String(Math.round(Math.min(1, v) * 100))));
  const renderInfo = () => {
    const v = cur(), s = stats(v.id).bars;
    info.replaceChildren(
      h('div.idx', {}, `0${idx + 1} / 0${VEHICLES.length}`), h('h2', {}, v.name), h('p', {}, v.tagline),
      h('div.bars', {}, bar('Top speed', s.speed), bar('Acceleration', s.accel), bar('Braking', s.braking), bar('Handling', s.handling)));
    coins.textContent = fmtNum(progress.coins);
  };
  const renderBody = () => {
    const v = cur(), g = progress.garage[v.id];
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === tab));
    if (tab === 'paint') {
      if (!v.tintable) { body.replaceChildren(h('p', { style: 'color:var(--mute);align-self:center;padding:0 10px;font-size:14px' }, 'The red route bus keeps its classic livery.')); return; }
      body.replaceChildren(...TINTS.map((c) => h('button', { class: `sw${g.tint === c ? ' on' : ''}`, style: `background:${c}`, 'aria-label': c, onclick: () => { g.tint = c; save(); sfx.select(); stage.paint(v.id); renderBody(); } })));
    } else if (tab === 'glow') {
      body.replaceChildren(...GLOWS.map((c) => h('button', { class: `sw${c ? '' : ' none'}${g.glow === c ? ' on' : ''}`, style: c ? `background:${c};box-shadow:0 0 18px ${c}` : '', 'aria-label': c || 'none', onclick: () => { g.glow = c; save(); sfx.select(); stage.paint(v.id); renderBody(); } }, c ? null : icon('close', 16))));
    } else if (tab === 'tune') {
      body.replaceChildren(...UPGRADES.map((u) => {
        const lv = g.up[u.id], cost = u.costs[lv];
        const buy = cost === undefined ? h('span.chip.buy', { style: 'justify-content:center' }, icon('check', 14), 'Maxed')
          : btn(`${progress.coins >= cost ? 'primary' : 'ghost'} sm buy`, `Upgrade  ·  ${fmtNum(cost)}`, () => {
            if (buyUpgrade(v.id, u.id)) { sfx.buy(); renderInfo(); renderBody(); } else { sfx.deny(); toast('Not enough coins yet. Drive to earn more.'); }
          });
        return h('div.up', {}, h('div.ic', {}, icon(u.id === 'engine' ? 'bolt' : u.id === 'brakes' ? 'disc' : 'tyre')),
          h('b', {}, u.name, h('span.lv', {}, ...[0, 1, 2].map((i) => h('i', { class: i < lv ? 'on' : '' })))), h('span', {}, u.desc), buy);
      }));
    } else {
      body.replaceChildren(...HORNS.map((hn) => {
        const owned = progress.horns.includes(hn.id);
        const label = hn.id === 'custom' ? (hasCustomHorn() ? 'Tap to use, hold to replace' : 'Load a sound file') : owned ? 'Owned' : `${fmtNum(hn.cost)} coins`;
        const card = h('button', { class: `hornc${g.horn === hn.id ? ' on' : ''}` }, h('b', {}, hn.name), h('span', {}, icon(hn.id === 'custom' ? 'upload' : owned ? 'horn' : 'lock', 14), label));
        let held = 0;
        card.addEventListener('pointerdown', () => { held = Date.now(); });
        card.addEventListener('click', async () => {
          await unlockAudio();
          if (hn.id === 'custom' && (!hasCustomHorn() || Date.now() - held > 500)) { file.click(); return; }
          if (!owned) {
            if (progress.coins < hn.cost) { sfx.deny(); toast('Not enough coins yet.'); return; }
            progress.coins -= hn.cost; progress.horns.push(hn.id); sfx.buy();
          }
          g.horn = hn.id; save(); renderInfo(); renderBody();
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
    progress.garage[cur().id].horn = 'custom'; save(); renderBody();
    toast('Your horn is ready.'); horn('custom');
  });

  const go = (d: number) => { idx = (idx + d + VEHICLES.length) % VEHICLES.length; progress.vehicle = cur().id; save(); sfx.select(); stage.show(cur().id); renderInfo(); renderBody(); };
  for (const [t, label, ic] of [['tune', 'Performance', 'bolt'], ['paint', 'Paint', 'paint'], ['glow', 'Underglow', 'glow'], ['horn', 'Horn', 'horn']] as const)
    seg.append(h('button', { 'data-t': t, onclick: () => { tab = t; sfx.tap(); renderBody(); } }, icon(ic, 16), label));

  const screen = h('div.screen.garage', {},
    h('div.top', {}, btn('glass icon', null, onBack, 'chevL'), h('h1', {}, 'Garage'), h('div.steps', {}, h('i.on'), h('i'), h('i')), h('div.spacer'), h('div.pill', {}, icon('coin', 18), coins)),
    info,
    h('div.g-arrow.l', {}, btn('glass icon lg', null, () => go(-1), 'chevL')),
    h('div.g-arrow.r', {}, btn('glass icon lg', null, () => go(1), 'chevR')),
    h('div.g-dock', {}, h('div.g-panel', {}, seg, body), h('div.g-go', {}, btn('primary lg', 'Choose city', onNext, 'right', true))),
    file,
  );
  // drag to rotate the vehicle
  let drag: number | null = null;
  screen.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('button, .g-panel')) return; drag = e.clientX; stage.spin = 0; });
  screen.addEventListener('pointermove', (e) => { if (drag !== null) { stage.yaw += (e.clientX - drag) * 0.008; drag = e.clientX; } });
  const end = () => { if (drag !== null) { drag = null; stage.spin = 0.25; } };
  screen.addEventListener('pointerup', end); screen.addEventListener('pointercancel', end);

  mount(screen);
  stage.show(cur().id); renderInfo(); renderBody();
}
