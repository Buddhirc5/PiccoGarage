import * as THREE from 'three';

/** Procedural canvas textures for the world. All original, no image assets needed. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, light = true) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/** Two-lane road tile, 8 m wide × 12 m long. Centre dashes, edge lines. */
export function roadTexture(lengthRepeat: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 384);
  ctx.fillStyle = '#3b3d42';
  ctx.fillRect(0, 0, 256, 384);
  noise(ctx, 256, 384, 5000, 0.12);
  noise(ctx, 256, 384, 3000, 0.25, false);
  // tyre wear tracks
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (const x of [40, 88, 168, 216]) ctx.fillRect(x - 10, 0, 20, 384);
  // edge lines (white), centre dashes
  ctx.fillStyle = '#e9e6dc';
  ctx.fillRect(8, 0, 5, 384);
  ctx.fillRect(243, 0, 5, 384);
  ctx.fillRect(125, 0, 6, 190);
  // patches
  ctx.fillStyle = 'rgba(30,30,32,0.5)';
  ctx.fillRect(150, 260, 40, 26);
  return tex(c, [1, lengthRepeat]);
}

export function pavementTexture(repeat: [number, number]): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#a49c90';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(60,55,50,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  noise(ctx, 128, 128, 1500, 0.15, false);
  return tex(c, repeat);
}

/** Black-and-white painted kerb stones. */
export function kerbTexture(repeat: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 16);
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(0, 0, 32, 16);
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(32, 0, 32, 16);
  return tex(c, [repeat, 1]);
}

export function grassTexture(repeat: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#5d8a3a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) {
    const g = 90 + Math.random() * 80;
    ctx.fillStyle = `rgba(${g * 0.5},${g},${g * 0.35},0.5)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 2 + Math.random() * 3);
  }
  return tex(c, [repeat, repeat]);
}

export function skyTexture(top: string, mid: string, bottom: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(8, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return tex(c);
}

// ── shop facades ────────────────────────────────────────────────────────────
export const SHOPS: { si: string; en: string; wall: string; sign: string; shutter: string }[] = [
  { si: 'සුනිල් ස්ටෝර්ස්', en: 'SUNIL STORES', wall: '#f3d9a4', sign: '#c62828', shutter: '#3d7a4a' },
  { si: 'අම්මාගේ බේකරිය', en: "AMMA'S BAKERY", wall: '#f7c6c0', sign: '#ffcf33', shutter: '#2e5aa8' },
  { si: 'සිරි ෆාමසි', en: 'SIRI PHARMACY', wall: '#d5ecd9', sign: '#1f8a4c', shutter: '#6b4a2b' },
  { si: 'කුමාරි ටේලර්ස්', en: 'KUMARI TAILORS', wall: '#c9def5', sign: '#7b2fa8', shutter: '#3a7d7a' },
  { si: 'රාජා ටී කඩේ', en: 'RAJA TEA KADE', wall: '#fbe7b7', sign: '#0f5f9c', shutter: '#9a3b2b' },
  { si: 'මල්ලි මොබයිල්', en: 'MALLI MOBILE', wall: '#e9e1f7', sign: '#ff6d00', shutter: '#2d2d35' },
  { si: 'නිමල් හාඩ්වෙයාර්', en: 'NIMAL HARDWARE', wall: '#f0e2cf', sign: '#2f6b2f', shutter: '#8a6d1d' },
  { si: 'ලක්කි හෝටලය', en: 'LUCKY HOTEL', wall: '#ffd8b0', sign: '#b71c1c', shutter: '#2c4f7c' },
];

/** 4×2 atlas of shop-house facades (each cell 512×512 = one 2-storey front). */
export function facadeAtlas(): THREE.CanvasTexture {
  const [c, ctx] = canvas(2048, 1024);
  SHOPS.forEach((s, i) => {
    const x0 = (i % 4) * 512, y0 = Math.floor(i / 4) * 512;
    ctx.save();
    ctx.translate(x0, y0);
    // wall
    ctx.fillStyle = s.wall;
    ctx.fillRect(0, 0, 512, 512);
    noise(ctx, 512, 512, 1500, 0.08, false);
    // damp stains near the bottom
    const g = ctx.createLinearGradient(0, 420, 0, 512);
    g.addColorStop(0, 'rgba(60,50,30,0)');
    g.addColorStop(1, 'rgba(60,50,30,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 380, 512, 132);
    // tiled roof edge
    ctx.fillStyle = '#9b4a2c';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < 512; x += 22) ctx.fillRect(x, 0, 3, 34);
    // upper floor: two windows with wooden shutters + balcony rail
    for (const wx of [70, 300]) {
      ctx.fillStyle = '#2a2622';
      ctx.fillRect(wx, 70, 142, 120);
      ctx.fillStyle = s.shutter;
      ctx.fillRect(wx - 34, 70, 34, 120);
      ctx.fillRect(wx + 142, 70, 34, 120);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      for (let y = 78; y < 190; y += 9) {
        ctx.beginPath(); ctx.moveTo(wx - 32, y); ctx.lineTo(wx - 2, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(wx + 144, y); ctx.lineTo(wx + 174, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,240,200,0.18)';
      ctx.fillRect(wx + 8, 80, 50, 100);
    }
    ctx.fillStyle = '#ece7dc';
    ctx.fillRect(20, 196, 472, 8);
    for (let x = 24; x < 490; x += 18) ctx.fillRect(x, 204, 5, 34);
    ctx.fillRect(20, 236, 472, 6);
    // sign board
    ctx.fillStyle = s.sign;
    ctx.fillRect(14, 256, 484, 74);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 262, 472, 62);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 34px "Noto Sans Sinhala", sans-serif';
    ctx.fillText(s.si, 256, 284, 460);
    ctx.font = '800 20px "Baloo 2", sans-serif';
    ctx.fillText(s.en, 256, 314, 460);
    // ground floor: open shop front with goods
    ctx.fillStyle = '#1d1a17';
    ctx.fillRect(30, 344, 452, 168);
    const goods = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa', '#f5f5f5'];
    for (let r = 0; r < 3; r++) {
      ctx.fillStyle = '#5c4632';
      ctx.fillRect(40, 380 + r * 42, 432, 6);
      for (let k = 0; k < 18; k++) {
        ctx.fillStyle = goods[(k * 3 + r + i) % goods.length];
        const h = 14 + ((k * 7 + r * 5) % 18);
        ctx.fillRect(46 + k * 23, 380 + r * 42 - h, 16, h);
      }
    }
    // rolled-up shutter
    ctx.fillStyle = '#8d9096';
    ctx.fillRect(30, 336, 452, 16);
    // pillars
    ctx.fillStyle = s.wall;
    ctx.fillRect(0, 336, 30, 176);
    ctx.fillRect(482, 336, 30, 176);
    ctx.restore();
  });
  return tex(c);
}
