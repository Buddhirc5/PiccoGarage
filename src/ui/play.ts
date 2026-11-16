import { track } from '../core/track';
import * as THREE from 'three';
import { DEFAULT_PLAYLIST } from '../config';
import { setSfxVolume, ui as sfx, unlockAudio } from '../core/audio';
import { applyPixelRatio, setStage } from '../core/renderer';
import { saveSettings, settings } from '../core/settings';
import { createMusic, parseYouTube, type Music } from '../core/youtube';
import { CITIES, VEHICLES, type CityDef } from '../game/data';
import { Drive, type Summary } from '../game/drive';
import { level, progress, save } from '../game/progress';
import { fmtNum, fmtTime, h, mount, setBackdrop, toast } from './dom';
import { icon } from './icons';
import { cta } from './landing';

export interface Flow { home(): void; garage(): void; cities(): void; drive(): void }

const back = (fn: () => void, label = 'Back') => h('button.cbtn', { 'aria-label': label, onclick: () => { sfx.back(); fn(); } }, icon('chevL', 22));
const coinsPill = () => h('div.coins', {}, icon('coin', 18), h('span.num', {}, fmtNum(progress.coins)));

// ── city + mode select ──────────────────────────────────────────────────────
export function showCities(flow: Flow): void {
  setStage(null);
  document.body.className = '';
  let i = Math.max(0, CITIES.findIndex((c) => c.id === progress.city));
  const photo = h('div.ph');
  setBackdrop(h('div.cbg', {}, photo));
  const route = h('div.route');
  const name = h('div.cname');
  const thumbs = h('div.thumbs');
  const modes = h('div.modes');
  const statRow = h('div.stats');

  const drawRoute = (c: CityDef) => {
    const w = route.clientWidth, hgt = route.clientHeight;
    if (!w || !hgt) return;
    const curve = new THREE.CatmullRomCurve3(c.loop.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);
    const pts = curve.getSpacedPoints(160);
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const sc = Math.min((w - 40) / (maxX - minX), (hgt - 40) / (maxZ - minZ));
    const ox = (w - (maxX - minX) * sc) / 2 - minX * sc, oz = (hgt - (maxZ - minZ) * sc) / 2 - minZ * sc;
    const P = (x: number, z: number) => [x * sc + ox, z * sc + oz];
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${P(p.x, p.z).map((v) => v.toFixed(1)).join(' ')}`).join('') + 'Z';
    const [fx, fz] = P(c.loop[0][0], c.loop[0][1]);
    route.innerHTML = `<svg viewBox="0 0 ${w} ${hgt}"><path class="shadow" d="${d}"/><path class="line" pathLength="1" d="${d}"/>
      <circle r="6" fill="#fff"><animateMotion dur="${(c.km * 4).toFixed(1)}s" begin="1.6s" repeatCount="indefinite" path="${d}"/></circle></svg>`;
    c.loop.slice(1).forEach(([x, z], k) => { const [px, pz] = P(x, z); route.append(h('i.pt', { style: `left:${px}px;top:${pz}px;--i:${k}` })); });
    route.append(h('div.flag', { style: `left:${fx}px;top:${fz}px` }, icon('flag', 18)));
  };
  const render = () => {
    const c = CITIES[i];
    progress.city = c.id; save();
    photo.style.backgroundImage = `url(${c.image})`;
    photo.style.animation = 'none'; void photo.offsetWidth; photo.style.animation = '';
    name.replaceChildren(h('span', {}, c.region), h('h2', {}, c.name), h('p', {}, c.blurb));
    thumbs.querySelectorAll('.th').forEach((t, k) => t.classList.toggle('on', k === i));
    modes.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-m') === progress.mode));
    const best = progress.best[`${c.id}:${progress.vehicle}`];
    statRow.replaceChildren(
      h('div', {}, h('span', {}, 'Loop length'), h('b.num', {}, `${c.km} km`)),
      h('div', {}, h('span', {}, 'Traffic'), h('b', {}, c.traffic > 13 ? 'Heavy' : c.traffic > 8 ? 'Medium' : 'Light')),
      h('div', {}, h('span', {}, progress.mode === 'race' ? 'Your best' : 'Mode'), h('b.num', {}, progress.mode === 'race' ? (best ? fmtTime(best) : '—') : 'Free ride')));
    drawRoute(c);
  };
  const go = (d: number) => { i = (i + d + CITIES.length) % CITIES.length; sfx.select(); render(); };
  CITIES.forEach((c, k) => thumbs.append(h('button.th', { style: `background-image:url(${c.image})`, 'aria-label': c.name, onclick: () => { i = k; sfx.select(); render(); } })));
  for (const [m, label, ic] of [['free', 'Free', 'road'], ['race', 'Race', 'flag']] as const)
    modes.append(h('button', { 'data-m': m, onclick: () => { progress.mode = m; save(); sfx.tap(); render(); } }, icon(ic, 15), label));

  let sx: number | null = null;
  route.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  route.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 40) go(e.clientX < sx ? 1 : -1); sx = null; });

  mount(h('div.screen.cities', {},
    h('div.bar', {}, back(flow.garage), h('span.ttl', {}, 'Choose a city'), h('div.spacer'), coinsPill()),
    h('div.head', {}, h('h1.title.a', { html: 'Pick your<br><em>Route</em>' }), h('div.a', { style: '--i:1;display:flex;justify-content:center;margin-top:12px' }, modes)),
    route,
    h('div.info', {}, name, thumbs, statRow, cta('Start driving', flow.drive)),
  ));
  render();
  new ResizeObserver(() => drawRoute(CITIES[i])).observe(route);
}

// ── drive: loading, HUD, pause, results ─────────────────────────────────────
let music: Music | null = null;

export async function startDrive(flow: Flow): Promise<void> {
  const city: CityDef = CITIES.find((c) => c.id === progress.city) ?? CITIES[0];
  const veh = VEHICLES.find((v) => v.id === progress.vehicle)!;
  setStage(null);
  setBackdrop(null);
  document.body.className = 'driving';
  mount(h('div.screen.loading', { style: `background-image:url(${city.image})` },
    h('div.giant', {}, city.name), h('div.boot-bar', {}, h('i')), h('span.tag', {}, `${veh.name}  ·  ${progress.mode === 'race' ? 'Race' : 'Free ride'}`)));
  await unlockAudio();
  const drive = new Drive(city, veh.id, progress.mode);
  try { await drive.load(); } catch (e) { console.error(e); toast('Could not load this city. Please try again.'); document.body.className = ''; flow.cities(); return; }
  setStage(drive);
  track('drive_start', { city: city.id, vehicle: veh.id, mode: progress.mode, quality: settings.quality });
  (window as unknown as { drive: Drive }).drive = drive;

  // ── HUD elements ──
  const speedB = h('b.num', {}, '0'), gearEl = h('div.g', {}, 'D');
  const C = 2 * Math.PI * 52, C2 = 2 * Math.PI * 44, ARC = 0.75;
  const ring = (cls: string, r: number, w: number) => `<circle class="${cls}" cx="60" cy="60" r="${r}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * r * ARC} ${2 * Math.PI * r}"/>`;
  const speedo = h('div.speedo', { html: `<svg viewBox="0 0 120 120">${ring('trk', 52, 5)}${ring('val', 52, 5)}${ring('rpm', 44, 2.5)}</svg>` }, h('div.rd', {}, speedB, h('span', {}, 'KM/H')), gearEl);
  const valRing = speedo.querySelector<SVGCircleElement>('.val')!, rpmRing = speedo.querySelector<SVGCircleElement>('.rpm')!;
  const mini = h<HTMLCanvasElement>('canvas.minimap.hglass', { width: 208, height: 208 });
  const chips = h('div.tc'), flash = h('div.flash'), count = h('div.count');
  const chipA = h('div.hpill.hglass'), chipB = h('div.hpill.hglass');
  chips.append(chipA, chipB);

  // press-and-hold helper for touch controls (multi-touch safe)
  const hold = (el: HTMLElement, on: () => void, off: () => void) => {
    const up = (e: PointerEvent) => { if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId); el.classList.remove('down'); off(); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); on(); });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', () => { el.classList.remove('down'); off(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  };
  const gas = hold(h('div.pedal.gas', { role: 'button', 'aria-label': 'Accelerate' }), () => (drive.input.throttle = 1), () => (drive.input.throttle = 0));
  const brake = hold(h('div.pedal.brake', { role: 'button', 'aria-label': 'Brake' }), () => (drive.input.brake = 1), () => (drive.input.brake = 0));
  const hbtn = (ic: string | null, label: string, onClick?: () => void, text?: string) => {
    const b = h('button.hbtn.hglass', { 'aria-label': label, onclick: () => { onClick?.(); } }, ic ? icon(ic, 22) : text ?? '');
    return b;
  };
  const hornB = hold(hbtn('horn', 'Horn'), () => drive.horn(true), () => drive.horn(false));
  const gearB = hbtn(null, 'Drive or reverse', () => { drive.toggleGear(); gearB.textContent = drive.hud.gear; }, 'D');
  const camB = hbtn('camera', 'Change camera', () => { sfx.tap(); drive.nextCamera(); track('camera', { mode: drive.camMode }); });
  const musicB = hbtn('music', 'Music', () => { sfx.tap(); openMusic(); });

  const steerBox = h('div.bl');
  const buildSteer = () => {
    drive.input.steer = 0;
    if (progress.controls === 'wheel') {
      const w = h('div.swheel', { role: 'slider', 'aria-label': 'Steering wheel' });
      let start = 0, base = 0, ang = 0, active = false;
      const angleOf = (e: PointerEvent) => { const r = w.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
      const set = (a: number) => { ang = Math.max(-1.9, Math.min(1.9, a)); w.style.transform = `rotate(${ang}rad)`; drive.input.steer = -ang / 1.9; };
      w.addEventListener('pointerdown', (e) => { e.preventDefault(); w.setPointerCapture(e.pointerId); active = true; start = angleOf(e); base = ang; w.style.transition = 'none'; });
      w.addEventListener('pointermove', (e) => { if (!active) return; let d = angleOf(e) - start; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; set(base + d); });
      const up = () => { active = false; w.style.transition = 'transform .25s'; set(0); };
      w.addEventListener('pointerup', up); w.addEventListener('pointercancel', up);
      steerBox.replaceChildren(w);
    } else {
      const l = hold(h('div.ctl.hglass', { role: 'button', 'aria-label': 'Steer left' }, icon('chevL', 34)), () => (drive.input.steer = 1), () => { if (drive.input.steer === 1) drive.input.steer = 0; });
      const r = hold(h('div.ctl.hglass', { role: 'button', 'aria-label': 'Steer right' }, icon('chevR', 34)), () => (drive.input.steer = -1), () => { if (drive.input.steer === -1) drive.input.steer = 0; });
      steerBox.replaceChildren(l, r);
    }
  };
  buildSteer();

  // music (YouTube)
  const playerBox = h('div.player.hglass', { style: 'display:none' });
  const vid = h('div.vid');
  playerBox.append(vid, h('div.row', {}, h('span', {}, 'Tap play. It hides when you drive.'),
    h('button', { 'aria-label': 'Close music', onclick: () => stopMusic() }, icon('close', 16))));
  const stopMusic = () => { music?.destroy(); music = null; playerBox.style.display = 'none'; };
  const startMusic = (src: string) => {
    const parsed = parseYouTube(src);
    if (!parsed) { toast('Paste a YouTube playlist or video link.'); return; }
    stopMusic();
    playerBox.style.display = '';
    music = createMusic(vid, parsed);
    track('music');
    setMini(false);
  };
  // after the first press of the accelerator the player shrinks to a pill; music keeps playing
  // The video is only shown long enough to press play, then it shrinks to a pill.
  // Hidden with inline styles (1px, invisible) so it keeps playing on iPhone.
  let miniTimer = 0;
  const setMini = (on: boolean) => {
    clearTimeout(miniTimer);
    playerBox.classList.toggle('mini', on);
    vid.style.cssText = on ? 'position:absolute;width:2px;height:2px;opacity:0.01;pointer-events:none;overflow:hidden' : '';
    if (!on) miniTimer = window.setTimeout(() => setMini(true), 9000);
  };
  queueMicrotask(() => root.addEventListener('pointerdown', (e) => { if (music && !playerBox.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-label=Music]')) setMini(true); }, true));
  window.addEventListener('keydown', () => { if (music) setMini(true); });
  playerBox.addEventListener('click', (e) => { if (playerBox.classList.contains('mini') && !(e.target as HTMLElement).closest('button')) setMini(false); });
  const openMusic = () => {
    const src = progress.playlist || DEFAULT_PLAYLIST;
    if (music) { setMini(!playerBox.classList.contains('mini')); return; }
    if (src) startMusic(src); else openPause(true);
  };

  const cockpit = h('div.cockpit', { style: `background-image:url(/assets/img/cockpit_${veh.id === 'tuk' ? 'tuk' : 'bus'}.webp)` });
  const root = h('div.screen.hud', {},
    cockpit,
    h('div.tl', {}, h('div.tiny', {}, hbtn('pause', 'Pause', () => openPause()), musicB, camB), mini),
    chips, h('div.tr', {}, speedo),
    steerBox,
    h('div.br', {}, h('div.side', {}, hornB, gearB), brake, gas),
    flash, count, playerBox,
    h('div.rotate', {}, icon('rotate', 48), h('h2', {}, 'Turn your phone'), h('p', {}, 'Driving is built for landscape. Rotate to take the wheel.')),
  );
  mount(root);
  try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* iPhone Safari cannot lock; the rotate prompt covers it */ }

  drive.onEvent = (kind, text) => {
    if (kind === 'overtake') { const f = h('div.f.hpill.hglass', {}, icon('coin', 16), `Overtake ${text}`); flash.append(f); setTimeout(() => f.remove(), 1600); }
    if (kind === 'finish') setTimeout(() => finish(), 1400);
  };

  // per-frame HUD refresh
  const mc = mini.getContext('2d')!;
  const tr = drive.track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of tr.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = 168 / Math.max(maxX - minX, maxZ - minZ), ox = 104 - ((minX + maxX) / 2) * sc, oz = 104 - ((minZ + maxZ) / 2) * sc;
  const path = new Path2D();
  tr.pos.forEach((p, k) => (k ? path.lineTo(p.x * sc + ox, p.z * sc + oz) : path.moveTo(p.x * sc + ox, p.z * sc + oz)));
  path.closePath();
  let lastCount = -1, raf = 0, alive = true, lastSpeed = '';
  const tick = () => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const s = drive.hud;
    const sp = String(Math.round(s.kmh));
    if (sp !== lastSpeed) { speedB.textContent = sp; lastSpeed = sp; }
    valRing.style.strokeDasharray = `${C * ARC * Math.min(1, s.kmh / (veh.topSpeed * 1.25))} ${C}`;
    rpmRing.style.strokeDasharray = `${C2 * ARC * s.rpm} ${C2}`;
    gearEl.textContent = s.gear;
    root.classList.toggle('incab', drive.camMode === 1);
    if (s.race) { chipA.textContent = `P${s.race.pos} / ${s.race.total}`; chipB.textContent = fmtTime(s.race.time); }
    else { chipA.replaceChildren(icon('coin', 16), String(s.coins)); chipB.textContent = `${s.km.toFixed(2)} km`; }
    const cd = Math.ceil(s.countdown);
    if (cd !== lastCount) { lastCount = cd; count.replaceChildren(...(s.countdown > 0 ? [h('b', {}, String(cd))] : [])); }
    mc.clearRect(0, 0, 208, 208);
    mc.lineJoin = 'round'; mc.strokeStyle = 'rgba(255,255,255,.3)'; mc.lineWidth = 9; mc.stroke(path);
    for (const m of drive.movers) { mc.fillStyle = m.rival ? '#ffc24d' : 'rgba(255,255,255,.55)'; mc.beginPath(); mc.arc(m.pos.x * sc + ox, m.pos.z * sc + oz, m.rival ? 6 : 3.5, 0, 7); mc.fill(); }
    mc.fillStyle = '#e5383b'; mc.strokeStyle = '#fff'; mc.lineWidth = 3;
    mc.beginPath(); mc.arc(drive.pos.x * sc + ox, drive.pos.z * sc + oz, 8, 0, 7); mc.fill(); mc.stroke();
  };
  tick();

  const cleanup = () => { alive = false; cancelAnimationFrame(raf); stopMusic(); drive.dispose(); setStage(null); try { screen.orientation.unlock(); } catch { /* ignore */ } };

  function openPause(focusMusic = false) {
    drive.paused = true;
    const close = () => { scrim.remove(); drive.paused = false; };
    const link = h<HTMLInputElement>('input.input', { placeholder: 'YouTube playlist or video link', value: progress.playlist, inputmode: 'url' });
    const vol = (key: 'sound' | 'music') => {
      const r = h<HTMLInputElement>('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings[key], 'aria-label': key });
      r.addEventListener('input', () => { saveSettings({ [key]: +r.value }); if (key === 'sound') setSfxVolume(+r.value);  });
      return r;
    };
    const segOf = <T extends string>(opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const s = h('div.segm');
      const draw = () => s.replaceChildren(...opts.map(([v, l]) => h('button', { class: get() === v ? 'on' : '', onclick: () => { set(v); sfx.tap(); draw(); } }, l)));
      draw(); return s;
    };
    const scrim = h('div.scrim', {},
      h('div.sheet', {},
        h('h2', {}, 'Paused'),
        h('div', {},
          h('div.rowi', {}, h('label', {}, icon('wheel', 18), 'Steering'), segOf([['buttons', 'Buttons'], ['wheel', 'Wheel']], () => progress.controls, (v) => { progress.controls = v; save(); buildSteer(); })),
          h('div.rowi', {}, h('label', {}, icon('horn', 18), 'Sound'), vol('sound')),
          h('div.rowi', {}, h('label', {}, icon('music', 18), 'Music'), vol('music')),
          h('div.rowi', {}, h('label', {}, icon('speed', 18), 'Graphics'), segOf([['low', 'Low'], ['medium', 'Mid'], ['high', 'High']], () => settings.quality, (v) => { saveSettings({ quality: v }); applyPixelRatio(); })),
        ),
        h('div', { style: 'display:grid;gap:8px' },
          h('div.field', {}, link, h('button.pbtn.w', { onclick: () => { progress.playlist = link.value.trim(); save(); close(); startMusic(progress.playlist); } }, 'Play')),
          h('div.hintt', {}, 'Music streams from YouTube in a small player while you drive.')),
        h('div.acts', {}, h('button.pbtn', { onclick: () => { scrim.remove(); finish(); } }, icon('flag', 17), 'End drive'), h('button.pbtn.r', { onclick: close }, icon('play', 17), 'Resume')),
      ));
    root.append(scrim);
    if (focusMusic) link.focus();
  }

  function finish() {
    const sum = drive.end();
    track('drive_end', { city: city.id, vehicle: veh.id, mode: sum.mode, km: +sum.km.toFixed(3), time: Math.round(sum.time), overtakes: sum.overtakes, position: sum.position, top: Math.round(sum.topKmh) });
    cleanup();
    showResults(sum, flow);
  }
}

function showResults(s: Summary, flow: Flow): void {
  document.body.className = '';
  setBackdrop(null);
  const xpIn = progress.xp % 1000;
  const fill = h('i');
  const won = s.position === 1;
  const big = s.position ? `P${s.position}` : `${s.km.toFixed(1)}KM`;
  mount(h('div.screen.results', {},
    h('div.giant', { class: `giant${big.length > 3 ? ' t' : ''}` }, big),
    h('div.body', {},
      h('h1.title.a', { style: 'text-align:left;--i:0', html: s.position ? (won ? 'You won<br><em>the race</em>' : 'Race<br><em>finished</em>') : 'Drive<br><em>complete</em>' }),
      h('p.a', { style: '--i:1;color:var(--soft);font-size:14px' }, `${s.city}  ·  ${s.mode === 'race' ? (s.position ? 'Race' : 'Race ended early') : 'Free ride'}`),
      h('div.stats.a', { style: '--i:2' }, h('div', {}, h('span', {}, 'Distance'), h('b.num', {}, `${s.km.toFixed(2)} km`)), h('div', {}, h('span', {}, 'Time'), h('b.num', {}, fmtTime(s.time))), h('div', {}, h('span', {}, 'Top speed'), h('b.num', {}, `${Math.round(s.topKmh)}`))),
      h('div.stats.a', { style: '--i:3' }, h('div', {}, h('span', {}, 'Coins'), h('b.num', {}, `+${fmtNum(s.coins)}`)), h('div', {}, h('span', {}, 'Overtakes'), h('b.num', {}, String(s.overtakes))), h('div', {}, h('span', {}, s.best ? 'New best' : 'Contacts'), h('b.num', {}, s.best ? fmtTime(s.time) : String(s.bumps)))),
      h('div.xp.a', { style: '--i:4' }, h('div.lb', {}, h('span', {}, `Level ${level()}`), h('span.num', {}, `+${s.xp} XP  ·  ${xpIn} / 1000`)), h('div.t', {}, fill)),
      h('div.a', { style: '--i:5' }, cta('Drive again', flow.drive)),
      h('div.acts.a', { style: '--i:6' }, h('button.pbtn', { onclick: flow.home }, icon('home', 17), 'Home'), h('button.pbtn', { onclick: flow.garage }, icon('wrench', 17), 'Garage')),
    )));
  setTimeout(() => (fill.style.width = `${xpIn / 10}%`), 50);
  sfx.buy();
}
