import { fx } from '../core/audio';
import { track } from '../core/track';
import type { Summary } from '../game/drive';
import { TYPE_INFO } from '../game/career';
import { city } from '../game/data';
import { fmtTime, toast } from './dom';

/** Builds a 1080×1350 result card image and shares it (or downloads it). */
async function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export async function shareCard(s: Summary): Promise<void> {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#060607'); bg.addColorStop(0.45, '#4b0f13'); bg.addColorStop(0.8, '#c9302c'); bg.addColorStop(1, '#d9483a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const font = (w: number, size: number, fam = 'Inter Variable, Inter, system-ui, sans-serif') => `${w} ${size}px ${fam}`;
  const big = s.result.position ? `P${s.result.position}` : s.stars ? `${s.stars}★` : `${s.stats.km.toFixed(1)}KM`;
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.textAlign = 'center'; g.font = font(400, 420, 'Anton, Impact, sans-serif'); g.fillText(big, W / 2, 470);
  try {
    const img = await loadImg(s.vehicle.cutout);
    const w = 900, hh = (img.height / img.width) * w;
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 50; g.shadowOffsetY = 30;
    g.drawImage(img, (W - w) / 2, 560 - hh / 2, w, hh); g.shadowColor = 'transparent';
  } catch { /* image failed: card still works */ }
  g.textAlign = 'left'; g.fillStyle = '#fff';
  g.font = font(650, 40); g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(`${TYPE_INFO[s.spec.type].name.toUpperCase()} · ${city(s.spec.city).name.toUpperCase()}`, 80, 880);
  g.fillStyle = '#fff'; g.font = font(700, 76);
  g.fillText(s.spec.type === 'free' ? 'Free roam' : s.result.position === 1 ? 'Won the race' : s.stars ? `${s.stars} star${s.stars > 1 ? 's' : ''}` : 'Drive complete', 80, 965);
  const stats: [string, string][] = [['Distance', `${s.stats.km.toFixed(2)} km`], ['Time', fmtTime(s.stats.time)], ['Top speed', `${Math.round(s.stats.topKmh)} km/h`], ['Best drift', s.stats.driftBest.toLocaleString()]];
  stats.forEach(([k, v], i) => {
    const x = 80 + (i % 2) * 470, y = 1060 + Math.floor(i / 2) * 110;
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = font(500, 30); g.fillText(k, x, y);
    g.fillStyle = '#fff'; g.font = font(700, 50); g.fillText(v, x, y + 56);
  });
  g.fillStyle = '#fff'; g.font = font(800, 38); g.fillText('Picco Garage', 80, H - 60);
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = font(500, 32); g.textAlign = 'right'; g.fillText(location.host, W - 80, H - 60);

  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
  const file = new File([blob], 'picco-garage.jpg', { type: 'image/jpeg' });
  const text = `I drove ${s.vehicle.name} in ${city(s.spec.city).name} on Picco Garage! Play free: ${location.origin}`;
  fx.fare(); track('share', { type: s.spec.type });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    if (navigator.share) { await navigator.share({ text, url: location.origin }); return; }
  } catch { return; /* cancelled */ }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'picco-garage.jpg'; a.click();
  toast('Image saved. Share it anywhere!');
}
