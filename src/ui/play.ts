import { DEFAULT_PLAYLIST } from '../config';
import { setSfxVolume, ui as sfx, unlockAudio } from '../core/audio';
import { applyPixelRatio, setStage } from '../core/renderer';
import { saveSettings, settings } from '../core/settings';
import { createMusic, parseYouTube, type Music } from '../core/youtube';
import { CITIES, VEHICLES, type CityDef } from '../game/data';
import { Drive, type Summary } from '../game/drive';
import { level, progress, save } from '../game/progress';
import { btn, fmtNum, fmtTime, h, mount, toast } from './dom';
import { icon } from './icons';

export interface Flow { home(): void; garage(): void; cities(): void; drive(): void }

// ── city + mode select ──────────────────────────────────────────────────────
export function showCities(flow: Flow): void {
  setStage(null);
  let city = CITIES.find((c) => c.id === progress.city) ?? CITIES[0];
  const bg = h('div.bgimg');
  const desc = h('div.desc');
  const rail = h('div.rail');
  const seg = h('div.seg');
  const render = () => {
    bg.style.backgroundImage = `url(${city.image})`;
    rail.querySelectorAll('.city').forEach((el) => el.classList.toggle('on', el.getAttribute('data-id') === city.id));
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-m') === progress.mode));
    const best = progress.best[`${city.id}:${progress.vehicle}`];
    desc.textContent = progress.mode === 'free' ? 'No timer. Cruise the loop, overtake cleanly and earn coins per kilometre.'
      : `One lap against three rivals.${best ? ` Your best: ${fmtTime(best)}.` : ''}`;
  };
  for (const c of CITIES) rail.append(h('button.city', { 'data-id': c.id, style: `background-image:url(${c.image})`, onclick: () => { city = c; progress.city = c.id; save(); sfx.select(); render(); } },
    h('span.chip.km', {}, `${c.km} km`), h('div.tx', {}, h('span', {}, c.region), h('b', {}, c.name), h('p', {}, c.blurb))));
  for (const [m, label, ic] of [['free', 'Free ride', 'road'], ['race', 'Race', 'flag']] as const)
    seg.append(h('button', { 'data-m': m, onclick: () => { progress.mode = m; save(); sfx.tap(); render(); } }, icon(ic, 16), label));
  mount(h('div.screen.cities', {}, bg,
    h('div.top', {}, btn('glass icon', null, flow.garage, 'chevL'), h('h1', {}, 'Choose a city'), h('div.steps', {}, h('i.on'), h('i.on'), h('i')), h('div.spacer'), h('div.pill', {}, icon('coin', 18), h('span.num', {}, fmtNum(progress.coins)))),
    h('div.mid', {}, rail),
    h('div.foot2', {}, seg, desc, h('div.spacer'), btn('primary lg', 'Start driving', flow.drive, 'right', true)),
  ));
  render();
  rail.querySelector('.city.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ── drive: loading, HUD, pause, results ─────────────────────────────────────
let music: Music | null = null;

export async function startDrive(flow: Flow): Promise<void> {
  const city: CityDef = CITIES.find((c) => c.id === progress.city) ?? CITIES[0];
  const veh = VEHICLES.find((v) => v.id === progress.vehicle)!;
  setStage(null);
  mount(h('div.screen.loading', { style: `background-image:url(${city.image})` },
    h('div.eyebrow', {}, progress.mode === 'race' ? 'Race' : 'Free ride'), h('h2', {}, city.name), h('div.boot-bar', {}, h('i')), h('div.chip', {}, veh.name)));
  await unlockAudio();
  const drive = new Drive(city, veh.id, progress.mode);
  try { await drive.load(); } catch (e) { console.error(e); toast('Could not load this city. Please try again.'); flow.cities(); return; }
  setStage(drive);
  (window as unknown as { drive: Drive }).drive = drive;

  // ── HUD elements ──
  const speedB = h('b.num', {}, '0'), gearEl = h('div.g', {}, 'D');
  const C = 2 * Math.PI * 52, ARC = 0.75;
  const ring = (cls: string, r: number, w: number) => `<circle class="${cls}" cx="60" cy="60" r="${r}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * r * ARC} ${2 * Math.PI * r}"/>`;
  const speedo = h('div.speedo', { html: `<svg viewBox="0 0 120 120">${ring('trk', 52, 5)}${ring('val', 52, 5)}${ring('rpm', 44, 2.5)}</svg>` }, h('div.rd', {}, speedB, h('span', {}, 'KM/H')), gearEl);
  const valRing = speedo.querySelector<SVGCircleElement>('.val')!, rpmRing = speedo.querySelector<SVGCircleElement>('.rpm')!;
  const C2 = 2 * Math.PI * 44;
  const mini = h<HTMLCanvasElement>('canvas.minimap', { width: 216, height: 216 });
  const chips = h('div.tc'), flash = h('div.flash'), count = h('div.count');
  const chipA = h('div.pill'), chipB = h('div.pill');
  chips.append(chipA, chipB);

  // hold-to-press helper for touch controls
  const hold = (el: HTMLElement, on: () => void, off: () => void) => {
    const up = () => { el.classList.remove('down'); off(); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); on(); });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  };
  const gas = hold(h('div.pedal.gas', { role: 'button', 'aria-label': 'Accelerate' }), () => (drive.input.throttle = 1), () => (drive.input.throttle = 0));
  const brake = hold(h('div.pedal.brake', { role: 'button', 'aria-label': 'Brake' }), () => (drive.input.brake = 1), () => (drive.input.brake = 0));
  const hornB = hold(btn('glass icon', null, () => {}, 'horn'), () => drive.horn(true), () => drive.horn(false));
  const gearB = btn('glass icon gearb', 'D', () => { drive.toggleGear(); gearB.querySelector('span')!.textContent = drive.hud.gear; });
  const camB = btn('glass icon', null, () => drive.nextCamera(), 'camera');
  const musicB = btn('glass icon', null, () => openMusic(), 'music');

  // steering: buttons or wheel
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
      const l = hold(h('div.ctl', { role: 'button', 'aria-label': 'Steer left' }, icon('chevL', 34)), () => (drive.input.steer = 1), () => { if (drive.input.steer === 1) drive.input.steer = 0; });
      const r = hold(h('div.ctl', { role: 'button', 'aria-label': 'Steer right' }, icon('chevR', 34)), () => (drive.input.steer = -1), () => { if (drive.input.steer === -1) drive.input.steer = 0; });
      steerBox.replaceChildren(l, r);
    }
  };
  buildSteer();

  // music player (YouTube)
  const playerBox = h('div.player', { style: 'display:none' });
  const vid = h('div.vid'), title = h('span', {}, 'Music');
  let playing = false;
  const ppBtn = h('button', { 'aria-label': 'Play or pause', onclick: () => (playing ? music?.pause() : music?.play()) }, icon('pause', 16));
  playerBox.append(vid, h('div.row', {}, h('button', { 'aria-label': 'Previous', onclick: () => music?.prev() }, icon('prev', 16)), ppBtn, h('button', { 'aria-label': 'Next', onclick: () => music?.next() }, icon('next', 16)), title,
    h('button', { 'aria-label': 'Close music', onclick: () => stopMusic() }, icon('close', 16))));
  const stopMusic = () => { music?.destroy(); music = null; playerBox.style.display = 'none'; };
  const startMusic = async (src: string) => {
    const parsed = parseYouTube(src);
    if (!parsed) { toast('Paste a YouTube playlist or video link.'); return false; }
    stopMusic();
    playerBox.style.display = '';
    try {
      music = await createMusic(vid, parsed, (p, t) => { playing = p; ppBtn.replaceChildren(icon(p ? 'pause' : 'play', 16)); if (t) title.textContent = t; });
      music.volume(settings.music);
      return true;
    } catch { playerBox.style.display = 'none'; toast('YouTube could not be reached.'); return false; }
  };
  const openMusic = () => {
    const src = progress.playlist || DEFAULT_PLAYLIST;
    if (music) { stopMusic(); return; }
    if (src) startMusic(src); else openPause(true);
  };

  const root = h('div.screen.hud', {},
    h('div.tl', {}, btn('glass icon', null, () => openPause(), 'pause'), mini),
    chips, h('div.tr', {}, speedo),
    steerBox,
    h('div.br', {}, h('div.side', {}, musicB, camB), h('div.side', {}, hornB, gearB), brake, gas),
    flash, count, playerBox,
    h('div.rotate', {}, icon('rotate', 44), h('h2', {}, 'Rotate your phone'), h('p', {}, 'Driving works best in landscape.')),
  );
  mount(root);
  try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* not supported outside fullscreen */ }

  drive.onEvent = (kind, text) => {
    if (kind === 'overtake') { const f = h('div.f', {}, icon('coin', 16), `Overtake ${text}`); flash.append(f); setTimeout(() => f.remove(), 1600); }
    if (kind === 'finish') setTimeout(() => finish(), 1400);
  };

  // ── per-frame HUD refresh ──
  const mc = mini.getContext('2d')!;
  const tr = drive.track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of tr.pos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const sc = 176 / Math.max(maxX - minX, maxZ - minZ), ox = 108 - ((minX + maxX) / 2) * sc, oz = 108 - ((minZ + maxZ) / 2) * sc;
  const path = new Path2D();
  tr.pos.forEach((p, i) => (i ? path.lineTo(p.x * sc + ox, p.z * sc + oz) : path.moveTo(p.x * sc + ox, p.z * sc + oz)));
  path.closePath();
  let lastCount = -1, raf = 0, alive = true;
  const tick = () => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const s = drive.hud;
    speedB.textContent = String(Math.round(s.kmh));
    const top = veh.topSpeed * 1.25;
    valRing.style.strokeDasharray = `${C * ARC * Math.min(1, s.kmh / top)} ${C}`;
    rpmRing.style.strokeDasharray = `${C2 * ARC * s.rpm} ${C2}`;
    gearEl.textContent = s.gear; gearEl.style.background = s.gear === 'R' ? '#fff' : ''; gearEl.style.color = s.gear === 'R' ? '#000' : '';
    if (s.race) { chipA.textContent = `P${s.race.pos} / ${s.race.total}`; chipB.textContent = fmtTime(s.race.time); }
    else { chipA.replaceChildren(icon('coin', 16), String(s.coins)); chipB.textContent = `${s.km.toFixed(2)} km`; }
    const cd = Math.ceil(s.countdown);
    if (cd !== lastCount) { lastCount = cd; count.replaceChildren(...(s.countdown > 0 ? [h('b', {}, String(cd))] : [])); }
    mc.clearRect(0, 0, 216, 216);
    mc.lineJoin = 'round'; mc.strokeStyle = 'rgba(255,255,255,.28)'; mc.lineWidth = 9; mc.stroke(path);
    for (const m of drive.movers) { mc.fillStyle = m.rival ? '#ffb340' : 'rgba(255,255,255,.55)'; mc.beginPath(); mc.arc(m.pos.x * sc + ox, m.pos.z * sc + oz, m.rival ? 6 : 3.5, 0, 7); mc.fill(); }
    mc.fillStyle = '#e8322d'; mc.strokeStyle = '#fff'; mc.lineWidth = 3;
    mc.beginPath(); mc.arc(drive.pos.x * sc + ox, drive.pos.z * sc + oz, 8, 0, 7); mc.fill(); mc.stroke();
  };
  tick();

  const cleanup = () => { alive = false; cancelAnimationFrame(raf); stopMusic(); drive.dispose(); setStage(null); try { screen.orientation.unlock(); } catch { /* ignore */ } };

  // ── pause sheet ──
  function openPause(focusMusic = false) {
    drive.paused = true;
    const close = () => { scrim.remove(); drive.paused = false; };
    const link = h<HTMLInputElement>('input.input', { placeholder: 'YouTube playlist or video link', value: progress.playlist });
    const vol = (key: 'sound' | 'music') => {
      const r = h<HTMLInputElement>('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings[key], 'aria-label': key });
      r.addEventListener('input', () => { saveSettings({ [key]: +r.value }); if (key === 'sound') setSfxVolume(+r.value); else music?.volume(+r.value); });
      return r;
    };
    const segOf = <T extends string>(opts: [T, string][], get: () => T, set: (v: T) => void) => {
      const s = h('div.seg');
      const draw = () => s.replaceChildren(...opts.map(([v, l]) => h('button', { class: get() === v ? 'on' : '', onclick: () => { set(v); sfx.tap(); draw(); } }, l)));
      draw(); return s;
    };
    const scrim = h('div.scrim', {},
      h('div.sheet', {},
        h('h2', {}, 'Paused'),
        h('div', {},
          h('div.rowi', {}, h('label', {}, icon('wheel', 18), 'Steering'), segOf([['buttons', 'Buttons'], ['wheel', 'Wheel']], () => progress.controls, (v) => { progress.controls = v; save(); buildSteer(); })),
          h('div.rowi', {}, h('label', {}, icon('horn', 18), 'Sound'), vol('sound')),
          h('div.rowi', {}, h('label', {}, icon('music', 18), 'Music volume'), vol('music')),
          h('div.rowi', {}, h('label', {}, icon('speed', 18), 'Graphics'), segOf([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => settings.quality, (v) => { saveSettings({ quality: v }); applyPixelRatio(); })),
        ),
        h('div', { style: 'display:grid;gap:8px' },
          h('div.field', {}, link, btn('white sm', 'Play', async () => { progress.playlist = link.value.trim(); save(); close(); await startMusic(progress.playlist); })),
          h('div.hint', {}, 'Music streams from YouTube in a small player while you drive.')),
        h('div.acts', {}, btn('ghost', 'End drive', () => { scrim.remove(); finish(); }, 'flag'), btn('primary', 'Resume', close, 'play')),
      ));
    root.append(scrim);
    if (focusMusic) link.focus();
  }

  // ── results ──
  function finish() {
    const sum = drive.end();
    cleanup();
    showResults(sum, flow);
  }
}

function showResults(s: Summary, flow: Flow): void {
  const stat = (label: string, value: string) => h('div.stat', {}, h('span', {}, label), h('b.num', {}, value));
  const xpIn = progress.xp % 1000;
  const fill = h('i', { style: 'width:0%' });
  const ord = ['st', 'nd', 'rd', 'th'];
  const head = s.position
    ? h('div.res-top', {}, h('div', {}, h('div.eyebrow', {}, `Race · ${s.city}`), h('h2', { style: 'margin-top:8px' }, s.position === 1 ? 'You won.' : 'Race finished.')), h('div.place', {}, String(s.position), h('sup', {}, ord[s.position - 1])))
    : h('div', {}, h('div.eyebrow', {}, `${s.mode === 'race' ? 'Race ended early' : 'Free ride'} · ${s.city}`), h('h2', { style: 'margin-top:8px' }, 'Drive complete.'));
  mount(h('div.screen', { style: 'background:#0a0a0c' },
    h('div.scrim', { style: 'background:radial-gradient(90% 90% at 50% 0%, #4a0e12 0%, #0a0a0c 60%)' },
      h('div.sheet.wide', {}, head,
        h('div.grid4', {}, stat('Distance', `${s.km.toFixed(2)} km`), stat('Time', fmtTime(s.time)), stat('Overtakes', String(s.overtakes)), stat('Top speed', `${Math.round(s.topKmh)} km/h`)),
        h('div.grid4', {}, stat('Coins earned', `+${fmtNum(s.coins)}`), stat('XP earned', `+${fmtNum(s.xp)}`), stat('Contacts', String(s.bumps)), stat(s.best ? 'New best lap' : 'Total distance', s.best ? fmtTime(s.time) : `${progress.km.toFixed(1)} km`)),
        h('div.xp', {}, h('div.lb', {}, h('span', {}, `Level ${level()}`), h('span.num', {}, `${xpIn} / 1000 XP`)), h('div.t', {}, fill)),
        h('div.acts', {}, btn('ghost', 'Home', flow.home, 'home'), btn('ghost', 'Garage', flow.garage, 'wrench'), btn('primary', 'Drive again', flow.drive, 'right', true)),
      ))));
  requestAnimationFrame(() => (fill.style.width = `${xpIn / 10}%`));
  sfx.buy();
}
