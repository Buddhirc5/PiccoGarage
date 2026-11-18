import { setSfxVolume, ui as sfx } from '../core/audio';
import { applyPixelRatio } from '../core/renderer';
import { saveSettings, settings } from '../core/settings';
import { progress, save } from '../game/progress';
import { h, toast } from './dom';
import { icon } from './icons';

/** iPhone needs a tap-triggered permission for the motion sensor. */
export async function enableTilt(): Promise<boolean> {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D) { toast('This device has no tilt sensor.'); return false; }
  if (typeof D.requestPermission === 'function') {
    try { if ((await D.requestPermission()) !== 'granted') { toast('Motion access was not allowed.'); return false; } } catch { return false; }
  }
  const M = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  if (typeof M?.requestPermission === 'function') { try { await M.requestPermission(); } catch { /* optional */ } }
  return true;
}

function seg<T extends string>(opts: [T, string][], get: () => T, set: (v: T) => void | Promise<void>) {
  const s = h('div.segm');
  const draw = () => s.replaceChildren(...opts.map(([v, l]) => h('button', { class: get() === v ? 'on' : '', onclick: async () => { await set(v); sfx.tap(); draw(); } }, l)));
  draw(); return s;
}
function toggle(get: () => boolean, set: (v: boolean) => void) {
  const b = h('button', { class: `tgl${get() ? ' on' : ''}`, role: 'switch', 'aria-checked': String(get()), onclick: () => { set(!get()); b.classList.toggle('on', get()); b.setAttribute('aria-checked', String(get())); sfx.tap(); } }, h('i'));
  return b;
}
function range(get: () => number, set: (v: number) => void, min = 0, max = 1, step = 0.05) {
  const r = h<HTMLInputElement>('input', { type: 'range', min, max, step, value: get() });
  r.addEventListener('input', () => set(+r.value));
  return r;
}

export function openSettings(onClose?: () => void): void {
  const close = () => { scrim.remove(); onClose?.(); };
  const row = (ic: string, label: string, ctrl: HTMLElement, hint?: string) => h('div.rowi', {}, h('label', {}, icon(ic, 18), h('span', {}, label, hint ? h('small', {}, hint) : null)), ctrl);
  const scrim = h('div.scrim', { onclick: (e: Event) => { if (e.target === scrim) close(); } },
    h('div.sheet.tall', {},
      h('div.sh-head', {}, h('h2', {}, 'Settings'), h('button.cbtn', { 'aria-label': 'Close', onclick: close }, icon('close', 18))),
      h('div.sh-scroll', {},
        h('div.sh-group', {}, 'Driving'),
        row('wheel', 'Steering', seg([['buttons', 'Buttons'], ['wheel', 'Wheel'], ['tilt', 'Tilt']], () => progress.controls, async (v) => {
          if (v === 'tilt' && !(await enableTilt())) return;
          progress.controls = v; save();
        })),
        row('rotate', 'Flip tilt direction', toggle(() => progress.tiltInvert, (v) => { progress.tiltInvert = v; save(); }), 'If tilting left turns right'),
        row('speed', 'Sensitivity', range(() => progress.sensitivity, (v) => { progress.sensitivity = v; save(); }, 0.6, 1.4, 0.05)),
        row('bolt', 'Auto accelerate', toggle(() => progress.autoGas, (v) => { progress.autoGas = v; save(); }), 'Gas is always on; just steer and brake'),
        row('info', 'Vibration', toggle(() => progress.haptics, (v) => { progress.haptics = v; save(); }), 'Android only'),
        h('div.sh-group', {}, 'Sound and graphics'),
        row('horn', 'Sound', range(() => settings.sound, (v) => { saveSettings({ sound: v }); setSfxVolume(v); })),
        row('glow', 'Graphics', seg([['low', 'Low'], ['medium', 'Mid'], ['high', 'High']], () => settings.quality, (v) => { saveSettings({ quality: v }); applyPixelRatio(); }), 'Use Low on older phones'),
        h('div.sh-group', {}, 'Help'),
        row('target', 'Tutorial', h('button.pbtn.sm', { onclick: () => { progress.tutorial = false; save(); toast('The tutorial will show on your next drive.'); } }, 'Replay')),
        h('div.links', {}, h('a', { href: '/privacy.html', target: '_blank' }, 'Privacy'), h('a', { href: '/terms.html', target: '_blank' }, 'Terms'), h('a', { href: '/credits.html', target: '_blank' }, 'Credits')),
      ),
    ));
  document.getElementById('app')!.append(scrim);
}
