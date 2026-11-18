import { ui as sfx, unlockAudio } from '../core/audio';
import { setStage, warmUp } from '../core/renderer';
import { settings } from '../core/settings';
import { track } from '../core/track';
import { TYPE_INFO, type EventSpec } from '../game/career';
import { city, vehicle } from '../game/data';
import { Drive, type DriveEvent } from '../game/drive';
import { progress, save } from '../game/progress';
import { fmtNum, fmtTime, h, mount, setBackdrop, toast } from './dom';
import { icon } from './icons';
import { nav } from './nav';
import { openSettings } from './settings';

let active: Drive | null = null;
export const currentDrive = () => active;

export async function startDrive(spec: EventSpec, vehicleId: string): Promise<void> {
  const c = city(spec.city), veh = vehicle(vehicleId);
  setStage(null); setBackdrop(null);
  document.body.className = 'driving';
  mount(h('div.screen.loading', { style: `background-image:url(${c.image})` },
    h('span.tag', {}, icon(TYPE_INFO[spec.type].icon, 14), TYPE_INFO[spec.type].name), h('div.giant', {}, c.name), h('div.boot-bar', {}, h('i')),
    h('p.tip', {}, TIPS[Math.floor(Math.random() * TIPS.length)])));
  await unlockAudio();
  const drive = new Drive(spec, veh.id);
  try { await drive.load(); } catch (e) { console.error(e); toast('Could not load this city. Please try again.'); nav.tab('home'); return; }
  await warmUp(drive); // compile every shader behind the loading screen
  active = drive;
  setStage(drive);
  track('drive_start', { city: c.id, vehicle: veh.id, mode: spec.type, event: spec.id, quality: settings.quality });
  (window as unknown as { drive: Drive }).drive = drive;
  buildHud(drive);
}

const TIPS = [
  'Tap the brake while steering at speed to start a drift.',
  'Near misses and drifts fill your boost meter.',
  'Stop inside the yellow bus bay to pick up passengers.',
  'Run a police checkpoint and the jeep will chase you. Get 160 m ahead to lose it.',
  'Upgrade tyres for grip and turbo for longer boosts.',
  'Rain makes the road slippery. Brake earlier.',
  'Tilt steering can be turned on in Settings.',
];

function buildHud(drive: Drive) {
  const veh = drive.def, spec = drive.spec;
  // ── readouts ──
  const speedB = h('b.num', {}, '0'), gearEl = h('div.g', {}, '1');
  const C = 2 * Math.PI * 52, C2 = 2 * Math.PI * 44, ARC = 0.75;
  const ring = (cls: string, r: number, w: number) => `<circle class="${cls}" cx="60" cy="60" r="${r}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * r * ARC} ${2 * Math.PI * r}"/>`;
  const speedo = h('div.speedo', { html: `<svg viewBox="0 0 120 120">${ring('trk', 52, 5)}${ring('val', 52, 5)}${ring('rpm', 44, 2.5)}</svg>` }, h('div.rd', {}, speedB, h('span', {}, 'KM/H')), gearEl);
  const valRing = speedo.querySelector<SVGCircleElement>('.val')!, rpmRing = speedo.querySelector<SVGCircleElement>('.rpm')!;
  const mini = h<HTMLCanvasElement>('canvas.minimap.hglass', { width: 208, height: 208 });
  const objective = h('div.obj.hglass');
  const pills = h('div.tc', {}, objective);
  const flash = h('div.flash'), count = h('div.count');
  const combo = h('div.combo', {}, h('b.num', {}, '0'), h('span', {}, 'DRIFT'), h('i', {}, 'x1'));
  const heat = h('div.heat'), heatPill = h('div.heatpill.hglass', {}, icon('police', 16), h('span', {}, ''));
  const stopEl = h('div.stopguide.hglass', {}, h('i.sring'), h('div', {}, h('b', {}, ''), h('span', {}, '')));
  const coach = h('div.coach');

  // ── controls ──
  const hold = (el: HTMLElement, on: () => void, off: () => void) => {
    const up = () => { el.classList.remove('down'); off(); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* */ } el.classList.add('down'); on(); });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  };
  const gas = hold(h('div.pedal.gas', { role: 'button', 'aria-label': 'Accelerate' }), () => (drive.input.throttle = 1), () => (drive.input.throttle = 0));
  const brake = hold(h('div.pedal.brake', { role: 'button', 'aria-label': 'Brake' }), () => (drive.input.brake = 1), () => (drive.input.brake = 0));
  const hbtn = (ic: string | null, label: string, onClick?: () => void, text?: string) => h('button.hbtn.hglass', { 'aria-label': label, onclick: () => onClick?.() }, ic ? icon(ic, 21) : text ?? '');
  const hornB = hold(hbtn('horn', 'Horn'), () => drive.horn(true), () => drive.horn(false));
  const gearB = hbtn(null, 'Drive or reverse', () => { drive.toggleGear(); gearB.textContent = drive.hud.reverse ? 'R' : 'D'; }, 'D');
  const camB = hbtn('camera', 'Change camera', () => { sfx.tap(); drive.nextCamera(); track('camera', { mode: drive.camMode }); });
  const pauseB = hbtn('pause', 'Pause', () => openPause());
  const boostC = 2 * Math.PI * 34;
  const boostB = hold(h('div.boostbtn', { role: 'button', 'aria-label': 'Boost', html: `<svg viewBox="0 0 80 80"><circle class="bt" cx="40" cy="40" r="34" fill="none" stroke-width="5"/><circle class="bv" cx="40" cy="40" r="34" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 ${boostC}"/></svg>` }, h('span', {}, icon('lightning', 22), 'BOOST')),
    () => (drive.input.boost = true), () => (drive.input.boost = false));
  const boostRing = boostB.querySelector<SVGCircleElement>('.bv')!;
  const driftB = hold(h('div.driftbtn.hglass', { role: 'button', 'aria-label': 'Handbrake drift' }, icon('drift', 22), h('span', {}, 'DRIFT')), () => (drive.input.handbrake = true), () => (drive.input.handbrake = false));

  const steerBox = h('div.bl');
  let tiltOn = false, tiltZero: number | null = null;
  const onTilt = (e: DeviceOrientationEvent) => {
    if (!tiltOn || e.beta === null) return;
    const ang = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 90) as number;
    const raw = (ang === 270 || ang === -90 ? -1 : 1) * e.beta;
    if (tiltZero === null) tiltZero = raw;
    const v = THREE_clamp(-(raw - tiltZero) / 22, -1, 1) * (progress.tiltInvert ? -1 : 1);
    drive.input.steer = Math.abs(v) < 0.06 ? 0 : v;
  };
  window.addEventListener('deviceorientation', onTilt);
  const buildSteer = () => {
    drive.input.steer = 0; tiltOn = false; tiltZero = null;
    if (progress.controls === 'tilt') {
      tiltOn = true;
      steerBox.replaceChildren(h('button.tiltcal.hglass', { onclick: () => { tiltZero = null; sfx.tap(); toast('Steering centred'); } }, icon('rotate', 20), h('span', {}, 'Tilt to steer · tap to centre')));
    } else if (progress.controls === 'wheel') {
      const w = h('div.swheel', { role: 'slider', 'aria-label': 'Steering wheel' });
      let start = 0, base = 0, ang = 0, on = false;
      const angleOf = (e: PointerEvent) => { const r = w.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
      const set = (a: number) => { ang = Math.max(-1.9, Math.min(1.9, a)); w.style.transform = `rotate(${ang}rad)`; drive.input.steer = -ang / 1.9; };
      w.addEventListener('pointerdown', (e) => { e.preventDefault(); w.setPointerCapture(e.pointerId); on = true; start = angleOf(e); base = ang; w.style.transition = 'none'; });
      w.addEventListener('pointermove', (e) => { if (!on) return; let d = angleOf(e) - start; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; set(base + d); });
      const up = () => { on = false; w.style.transition = 'transform .25s'; set(0); };
      w.addEventListener('pointerup', up); w.addEventListener('pointercancel', up);
      steerBox.replaceChildren(w);
    } else {
      const l = hold(h('div.ctl.hglass', { role: 'button', 'aria-label': 'Steer left' }, icon('chevL', 34)), () => (drive.input.steer = 1), () => { if (drive.input.steer === 1) drive.input.steer = 0; });
      const r = hold(h('div.ctl.hglass', { role: 'button', 'aria-label': 'Steer right' }, icon('chevR', 34)), () => (drive.input.steer = -1), () => { if (drive.input.steer === -1) drive.input.steer = 0; });
      steerBox.replaceChildren(l, r);
    }
  };
  buildSteer();

  const cockpit = h('div.cockpit', { style: `background-image:url(/assets/img/cockpit_${veh.kind === 'tuk' ? 'tuk' : 'bus'}.webp)` });
  const root = h('div.screen.hud', {},
    cockpit, heat,
    h('div.tl', {}, h('div.tiny', {}, pauseB, camB), mini),
    pills, h('div.tr', {}, speedo, heatPill),
    combo, stopEl, coach,
    steerBox,
    h('div.br', {}, h('div.side', {}, hornB, gearB), h('div.side2', {}, boostB, driftB), brake, gas),
    flash, count,
    h('div.rotate', {}, icon('rotate', 48), h('h2', {}, 'Turn your phone'), h('p', {}, 'Driving is built for landscape. Rotate to take the wheel.')),
  );
  mount(root);
  try { void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch(() => {}); } catch { /* iPhone Safari cannot lock */ }

  const pop = (text: string, ic: string, cls = '') => {
    const f = h('div', { class: `f hpill hglass ${cls}` }, icon(ic, 16), text);
    flash.append(f); setTimeout(() => f.remove(), 1700);
    while (flash.children.length > 3) flash.firstElementChild?.remove();
  };
  drive.onEvent = (kind: DriveEvent, text: string) => {
    if (kind === 'overtake') pop(text, 'coin');
    if (kind === 'nearmiss') pop(text, 'speed', 'nm');
    if (kind === 'drift') pop(text, 'drift', 'dr');
    if (kind === 'knockout') pop(text, 'bolt', 'warn');
    if (kind === 'heat') pop(text, 'police', 'warn');
    if (kind === 'escaped' || kind === 'checkpoint' || kind === 'fare') pop(text, kind === 'fare' ? 'bus' : 'check', 'good');
    if (kind === 'caught') pop(text, 'police', 'warn');
    if (kind === 'stop') pop(text, 'info', 'warn');
    if (kind === 'go') pop('GO!', 'flag', 'good');
    if (kind === 'finish') setTimeout(() => finish(), 1500);
  };

  // ── tutorial (first drive) ──
  const steps = progress.tutorial ? [] : [
    { text: 'Hold the right pedal to accelerate', at: 'gas', done: () => drive.hud.kmh > 25 },
    { text: progress.controls === 'tilt' ? 'Tilt your phone to steer' : 'Steer with the left controls', at: 'steer', done: () => Math.abs(drive.input.steer) > 0.3 },
    { text: 'At speed, tap the brake while steering to drift', at: 'brake', done: () => drive.hud.drift.active },
    { text: 'Tap BOOST to fly. Drifts and near misses refill it', at: 'boost', done: () => drive.hud.boosting },
  ];
  let step = 0, stepT = 0;

  // ── minimap ──
  const mc = mini.getContext('2d')!;
  const tr = drive.track, lay = drive.world.layout;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of tr.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = 168 / Math.max(maxX - minX, maxZ - minZ), ox = 104 - ((minX + maxX) / 2) * sc, oz = 104 - ((minZ + maxZ) / 2) * sc;
  const path = new Path2D();
  tr.pos.forEach((p, k) => (k ? path.lineTo(p.x * sc + ox, p.z * sc + oz) : path.moveTo(p.x * sc + ox, p.z * sc + oz)));
  path.closePath();
  const dot = (sv: number, color: string, r: number) => { const p = tr.at(sv, 0); mc.fillStyle = color; mc.beginPath(); mc.arc(p.x * sc + ox, p.z * sc + oz, r, 0, 7); mc.fill(); };

  root.classList.toggle('nopost', !drive.post);
  // only touch the DOM when a value visibly changes (iOS restyles on every write)
  const memo = new Map<object, string>();
  const put = (el: HTMLElement | SVGElement, key: 'dash' | 'text' | 'display', v: string) => {
    const k = memo.get(el as object) ?? '';
    const tag = key + ':' + v;
    if (k === tag) return;
    memo.set(el as object, tag);
    if (key === 'dash') el.style.strokeDasharray = v; else if (key === 'text') el.textContent = v; else el.style.display = v;
  };
  const q = (x: number) => Math.round(x * 200) / 200;
  let lastCount = -1, raf = 0, alive = true, lastSpeed = '', lastT = performance.now(), mmF = -1;
  const tick = () => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const s = drive.hud;
    const sp = String(Math.round(s.kmh));
    if (sp !== lastSpeed) { speedB.textContent = sp; lastSpeed = sp; }
    put(valRing, 'dash', `${(C * ARC * q(Math.min(1, s.kmh / (veh.topSpeed * 1.35)))).toFixed(1)} ${C}`);
    put(rpmRing, 'dash', `${(C2 * ARC * q(s.rpm)).toFixed(1)} ${C2}`);
    put(gearEl, 'text', s.reverse ? 'R' : String(s.gear));
    put(boostRing, 'dash', `${(boostC * q(s.boost)).toFixed(1)} ${boostC}`);
    boostB.classList.toggle('ready', s.boost > 0.3); boostB.classList.toggle('on', s.boosting);
    root.classList.toggle('incab', drive.camMode === 1);
    root.classList.toggle('boosting', s.boosting);
    // top centre
    const parts: string[] = [];
    if (s.race) parts.push(`P${s.race.pos}/${s.race.total}`, s.race.laps > 1 ? `Lap ${s.race.lap}/${s.race.laps}` : `${Math.round(s.race.progress * 100)}%`);
    if (s.timer !== null) parts.push(`⏱ ${fmtTime(s.timer)}`); else if (spec.type !== 'free') parts.push(fmtTime(s.time));
    if (s.scoreLabel) parts.push(`${s.scoreLabel} ${fmtNum(s.score)}`);
    if (spec.type === 'free') parts.push(`${fmtNum(s.coins)} coins`, `${s.km.toFixed(1)} km`);
    const txt = `${s.objective}${parts.length ? '  ·  ' + parts.join('  ·  ') : ''}`;
    if (objective.textContent !== txt) objective.textContent = txt;
    // drift combo
    combo.classList.toggle('on', s.drift.active);
    if (s.drift.active) { put(combo.children[0] as HTMLElement, 'text', fmtNum(s.drift.score)); put(combo.children[2] as HTMLElement, 'text', `x${s.drift.mult}`); }
    // police
    root.classList.toggle('pursuit', s.heat > 0);
    put(heatPill, 'display', s.heat > 0 ? '' : 'none');
    if (s.heat > 0) put(heatPill.lastChild as HTMLElement, 'text', `Heat ${s.heat} · ${s.policeGap !== null ? Math.max(0, Math.round(s.policeGap)) : '—'} m`);
    // bus stop guide
    put(stopEl, 'display', s.stop ? '' : 'none');
    if (s.stop) {
      (stopEl.querySelector('b') as HTMLElement).textContent = s.stop.dist > 8 ? `Bus stop in ${s.stop.dist} m` : s.stop.boarding > 0 ? 'Boarding…' : 'Stop in the yellow bay';
      (stopEl.querySelector('span') as HTMLElement).textContent = `Stop ${s.stop.index + 1} of ${s.stop.total}${spec.type === 'route' ? ` · comfort ${Math.round(s.stop.comfort * 100)}%` : ''}`;
      (stopEl.querySelector('.sring') as HTMLElement).style.setProperty('--p', `${Math.round(s.stop.boarding * 100)}%`);
    }
    // countdown
    const cd = Math.ceil(s.countdown);
    if (cd !== lastCount) { lastCount = cd; count.replaceChildren(...(s.countdown > 0 ? [h('b', {}, String(cd))] : [])); }
    // tutorial
    if (step < steps.length && s.countdown <= 0) {
      const st = steps[step];
      stepT += dt;
      coach.className = `coach show at-${st.at}`; coach.textContent = st.text;
      if (st.done() && stepT > 1.2) { step++; stepT = 0; sfx.select(); if (step >= steps.length) { coach.className = 'coach'; progress.tutorial = true; save(); toast('You are ready. Enjoy the drive!'); } }
      else if (stepT > 14) { step++; stepT = 0; }
    }
    // minimap
    if (++mmF % 3 === 0) {
    mc.clearRect(0, 0, 208, 208);
    mc.lineJoin = 'round'; mc.strokeStyle = 'rgba(255,255,255,.32)'; mc.lineWidth = 9; mc.stroke(path);
    if (s.stop) lay.stops.forEach((sv) => dot(sv, '#ffcc00', 4));
    if (spec.police) lay.checkpoints.forEach((sv) => dot(sv, '#5b8cff', 4));
    for (const m of drive.movers) { if (m.rival?.out) continue; mc.fillStyle = m.rival ? '#ffc24d' : 'rgba(255,255,255,.5)'; mc.beginPath(); mc.arc(m.pos.x * sc + ox, m.pos.z * sc + oz, m.rival ? 6 : 3, 0, 7); mc.fill(); }
    if (s.heat > 0) { const pm = (drive as unknown as { police: { pos: { x: number; z: number } } }).police; if (pm) { mc.fillStyle = Math.sin(now / 90) > 0 ? '#ff3b3b' : '#3b6bff'; mc.beginPath(); mc.arc(pm.pos.x * sc + ox, pm.pos.z * sc + oz, 7, 0, 7); mc.fill(); } }
    mc.fillStyle = '#e5383b'; mc.strokeStyle = '#fff'; mc.lineWidth = 3;
    mc.beginPath(); mc.arc(drive.pos.x * sc + ox, drive.pos.z * sc + oz, 8, 0, 7); mc.fill(); mc.stroke();
    }
  };
  tick();

  const cleanup = () => {
    alive = false; cancelAnimationFrame(raf);
    window.removeEventListener('deviceorientation', onTilt);
    drive.dispose(); active = null; setStage(null);
    try { screen.orientation.unlock(); } catch { /* ignore */ }
  };

  function openPause() {
    drive.paused = true;
    const close = () => { scrim.remove(); drive.paused = false; };
    const scrim = h('div.scrim', {},
      h('div.sheet', {},
        h('div.sh-head', {}, h('h2', {}, 'Paused'), h('span.tag', {}, TYPE_INFO[spec.type].name)),
        h('p.hintt', {}, spec.type === 'free' ? 'Free roam. End the drive whenever you like to bank your coins.' : TYPE_INFO[spec.type].rules),
        h('div.acts3', {},
          h('button.pbtn.r', { onclick: close }, icon('play', 17), 'Resume'),
          spec.type !== 'free' ? h('button.pbtn', { onclick: () => { scrim.remove(); cleanup(); void startDrive(spec, veh.id); } }, icon('rotate', 17), 'Restart') : null,
          h('button.pbtn', { onclick: () => openSettings(() => buildSteer()) }, icon('gear', 17), 'Settings'),
          h('button.pbtn', { onclick: () => { scrim.remove(); finish(true); } }, icon('flag', 17), spec.type === 'free' ? 'End drive' : 'Quit event')),
      ));
    root.append(scrim);
  }

  function finish(quit = false) {
    if (!alive) return;
    const sum = drive.end();
    if (quit && spec.type !== 'free') { sum.stars = 0; }
    track('drive_end', { city: spec.city, vehicle: veh.id, mode: spec.type, event: spec.id, km: +sum.stats.km.toFixed(3), time: Math.round(sum.stats.time), overtakes: sum.stats.overtakes, position: sum.result.position, stars: sum.stars, top: Math.round(sum.stats.topKmh), drift: sum.stats.driftBest, nm: sum.stats.nearMisses, caught: sum.stats.caught, escaped: sum.stats.escaped, passengers: sum.stats.passengers });
    cleanup();
    nav.results(sum);
  }
}

function THREE_clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
