import * as THREE from 'three';
import { capture, setLook } from '../core/renderer';
import type { Look } from '../core/post';
import { track } from '../core/track';
import type { Drive } from '../game/drive';
import { fx, ui as sfx } from '../core/audio';
import { h, toast } from './dom';
import { icon } from './icons';

/**
 * Photo Mode (design/quick-specs/photo-mode-2026-11-24.md): the drive stays
 * paused, a camera orbits the player's vehicle (drag to orbit, pinch or wheel
 * to zoom), the player picks a look and vignette, and the shutter saves a
 * watermarked PNG to the share sheet (or a download).
 */
export const LOOKS: { id: string; name: string; look: Look }[] = [
  { id: 'natural', name: 'Natural', look: { sat: 1.14, contrast: 1.08, vignette: 0.35, grain: 0, lift: [0, 0.012, 0.03], gain: [1.03, 1, 0.97] } },
  { id: 'vivid', name: 'Vivid', look: { sat: 1.45, contrast: 1.15, vignette: 0.4, grain: 0, lift: [0, 0, 0.02], gain: [1.04, 1.02, 1] } },
  { id: 'noir', name: 'Noir', look: { sat: 0, contrast: 1.3, vignette: 0.6, grain: 0.06, lift: [0.01, 0.01, 0.01], gain: [1, 1, 1] } },
  { id: 'sunset', name: 'Sunset', look: { sat: 1.2, contrast: 1.1, vignette: 0.5, grain: 0, lift: [0.02, 0.005, 0], gain: [1.12, 0.98, 0.82] } },
  { id: 'retro', name: 'Retro film', look: { sat: 0.75, contrast: 0.95, vignette: 0.55, grain: 0.09, lift: [0.06, 0.045, 0.02], gain: [1.05, 0.98, 0.86] } },
];
export const ORBIT = { sens: 0.008, pitchMin: (3 * Math.PI) / 180, pitchMax: (75 * Math.PI) / 180, zoomMin: 0.6, zoomMax: 3 };

export function openPhoto(drive: Drive, hudRoot: HTMLElement, onDone: () => void): void {
  const cam = drive.camera, len = drive.def.length, tuk = drive.def.kind === 'tuk';
  const target = new THREE.Vector3(drive.pos.x, tuk ? 0.9 : 1.6, drive.pos.z);
  // start behind the vehicle, like the chase camera
  let yaw = drive.heading + Math.PI, pitch = 0.22, dist = len * (tuk ? 1.6 : 1.1);
  const minD = Math.max(2.2, len * ORBIT.zoomMin), maxD = len * ORBIT.zoomMax;
  const fov0 = cam.fov;
  const place = () => {
    const cp = Math.cos(pitch);
    cam.position.set(target.x + Math.sin(yaw) * cp * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * cp * dist);
    cam.lookAt(target);
  };
  cam.fov = 50; cam.updateProjectionMatrix(); place();
  if (drive.post) { drive.post.boost = 0; drive.post.flash = 0; }

  let lookIdx = 0, vignette = LOOKS[0].look.vignette;
  const canLook = setLook({ ...LOOKS[0].look });
  const apply = () => { setLook({ ...LOOKS[lookIdx].look, vignette }); };

  // gestures: one pointer orbits, two pointers pinch-zoom, wheel zooms
  const pts = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const layer = h('div.ph-touch', {});
  layer.addEventListener('pointerdown', (e) => { layer.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
  layer.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) {
      yaw -= (e.clientX - p.x) * ORBIT.sens;
      pitch = Math.min(ORBIT.pitchMax, Math.max(ORBIT.pitchMin, pitch + (e.clientY - p.y) * ORBIT.sens));
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) dist = Math.min(maxD, Math.max(minD, dist * (pinch / d)));
      pinch = d;
    }
    place();
  });
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
  layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
  layer.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.min(maxD, Math.max(minD, dist * (1 + e.deltaY * 0.001))); place(); }, { passive: false });

  const chips = h('div.ph-looks', {}, ...LOOKS.map((l, i) => h('button', { class: `chip${i === 0 ? ' on' : ''}`, onclick: (ev: Event) => {
    if (!canLook) { toast('Looks need Medium or High graphics (Settings).'); return; }
    sfx.tap(); lookIdx = i; vignette = l.look.vignette; slider.value = String(vignette);
    chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); (ev.currentTarget as HTMLElement).classList.add('on'); apply();
  } }, l.name)));
  const slider = h<HTMLInputElement>('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(vignette), 'aria-label': 'Vignette' });
  slider.oninput = () => { vignette = +slider.value; if (canLook) apply(); };

  const shoot = async () => {
    sfx.tap(); shutter.disabled = true;
    const shot = await capture();
    shutter.disabled = false;
    if (!shot) { toast('Could not capture this frame on this device.'); return; }
    fx.whoosh?.();
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    // watermark bottom-right
    const g = shot.getContext('2d')!, H = shot.height, s = Math.max(12, Math.round(H * 0.022));
    g.font = `700 ${s}px "Inter Variable", system-ui, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = s * 0.6; g.fillStyle = 'rgba(255,255,255,.92)';
    g.fillText('PICCO GARAGE', shot.width - s, H - s * 0.8);
    const blob = await new Promise<Blob | null>((r) => shot.toBlob(r, 'image/png'));
    if (!blob) { toast('Could not save the photo.'); return; }
    const file = new File([blob], `picco-garage-${Date.now()}.png`, { type: 'image/png' });
    track('share', { type: 'photo', look: LOOKS[lookIdx].id });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Picco Garage' }); return; }
    } catch { /* cancelled */ return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Photo saved');
  };
  const shutter = h<HTMLButtonElement>('button.ph-shutter', { 'aria-label': 'Take photo', onclick: () => void shoot() }, h('i'));
  const flash = h('div.ph-flash');
  const done = () => {
    setLook(null);
    cam.fov = fov0; cam.updateProjectionMatrix();
    ui.remove(); hudRoot.style.visibility = '';
    onDone();
  };
  const ui = h('div.photo', {},
    layer, flash,
    h('div.ph-top', {}, h('span.ph-hint', {}, icon('camera', 15), 'Drag to orbit · pinch to zoom'), h('button.pbtn.sm', { onclick: () => { sfx.back(); done(); } }, icon('check', 15), 'Done')),
    h('div.ph-bar', {}, chips, h('label.ph-vig', {}, h('span', {}, 'Vignette'), slider), shutter));
  hudRoot.style.visibility = 'hidden';
  document.getElementById('app')!.append(ui);
  track('camera', { mode: 'photo' });
}
