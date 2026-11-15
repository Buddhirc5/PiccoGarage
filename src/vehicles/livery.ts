import * as THREE from 'three';
import type { VehicleDesign } from './types';

/**
 * Bus livery painter.
 *
 * Buses use one canvas "skin" laid out like the community bus-sim skins:
 * left side, right side, front, rear and roof panels in one atlas. Each panel
 * is drawn in metres, so shapes and text look undistorted on the 3D body.
 * Every design here is original and generated in code.
 */

export interface Rect { x0: number; y0: number; x1: number; y1: number } // fractions, y from top

/**
 * Vehicles face +z. Sri Lanka drives on the left with right-hand drive, so the
 * +x face is the vehicle's LEFT (kerb side, passenger doors) and the -x face
 * is its RIGHT (road side, driver).
 */
export const ATLAS: Record<'kerb' | 'road' | 'roof' | 'bottom' | 'front' | 'rear', Rect> = {
  kerb: { x0: 0, y0: 0, x1: 1, y1: 0.3 },
  road: { x0: 0, y0: 0.3, x1: 1, y1: 0.6 },
  front: { x0: 0, y0: 0.6, x1: 0.25, y1: 1 },
  rear: { x0: 0.25, y0: 0.6, x1: 0.5, y1: 1 },
  roof: { x0: 0.5, y0: 0.6, x1: 1, y1: 0.8 },
  bottom: { x0: 0.5, y0: 0.8, x1: 1, y1: 1 },
};

/** BoxGeometry face order: +x, -x, +y, -y, +z, -z. */
const FACE_ORDER: (keyof typeof ATLAS)[] = ['kerb', 'road', 'roof', 'bottom', 'front', 'rear'];

export function mapBoxToAtlas(geo: THREE.BoxGeometry): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const r = ATLAS[FACE_ORDER[f]];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      const u = uv.getX(idx);
      const v = uv.getY(idx);
      uv.setXY(idx, r.x0 + u * (r.x1 - r.x0), 1 - r.y1 + v * (r.y1 - r.y0));
    }
  }
  uv.needsUpdate = true;
}

export interface BusDims { L: number; W: number; H: number }

// ── small helpers ───────────────────────────────────────────────────────────
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
}
function shade(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

type Ctx = CanvasRenderingContext2D;

/** Run fn with the context transformed so (0,0) is the panel's top-left in metres. */
function panel(ctx: Ctx, cw: number, ch: number, r: Rect, wM: number, hM: number, fn: () => void) {
  const rx = r.x0 * cw, ry = r.y0 * ch, rw = (r.x1 - r.x0) * cw, rh = (r.y1 - r.y0) * ch;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.setTransform(rw / wM, 0, 0, rh / hM, rx, ry);
  fn();
  ctx.restore();
}

/** Draws text with a fixed metre height, compensating for non-uniform panel scale. */
function text(
  ctx: Ctx, str: string, x: number, y: number, hM: number,
  opts: { fill: string; stroke?: string; strokeW?: number; align?: CanvasTextAlign; maxW?: number; font?: string; glow?: string },
) {
  if (!str) return;
  const m = ctx.getTransform();
  ctx.save();
  // switch to pixel space at (x,y)
  const px = m.a * x + m.e, py = m.d * y + m.f;
  ctx.setTransform(1, 0, 0, 1, px, py);
  const sizePx = hM * m.d;
  const family = opts.font ?? '"Noto Sans Sinhala", "Baloo 2", system-ui, sans-serif';
  ctx.font = `800 ${sizePx}px ${family}`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  const maxW = opts.maxW ? opts.maxW * m.a : undefined;
  if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = sizePx * 0.5; }
  if (opts.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = (opts.strokeW ?? 0.18) * sizePx;
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(str, 0, 0, maxW);
  }
  ctx.fillStyle = opts.fill;
  ctx.fillText(str, 0, 0, maxW);
  ctx.restore();
}

function glass(ctx: Ctx, x: number, y: number, w: number, h: number, r = 0.06) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#2b3442');
  g.addColorStop(0.45, '#0d1118');
  g.addColorStop(0.55, '#1b2330');
  g.addColorStop(1, '#07090d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  // reflection streak
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.15, y);
  ctx.lineTo(x + w * 0.35, y);
  ctx.lineTo(x + w * 0.15, y + h);
  ctx.lineTo(x - w * 0.05, y + h);
  ctx.fill();
  ctx.restore();
  // chrome frame
  ctx.strokeStyle = 'rgba(220,225,232,0.9)';
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

// ── background styles ───────────────────────────────────────────────────────
function background(ctx: Ctx, d: VehicleDesign, w: number, h: number, seed: number) {
  const p = d.paint;
  const R = rng(seed);
  switch (d.livery) {
    case 'neon': {
      ctx.fillStyle = shade(p.body, -0.82);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 7; i++) {
        const cx = R() * w, cy = R() * h, rad = 0.6 + R() * 1.6;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, alpha(i % 2 ? p.stripe2 : p.stripe1, 0.85));
        g.addColorStop(1, alpha(p.stripe1, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.lineWidth = 0.03;
      for (let i = 0; i < 18; i++) {
        ctx.strokeStyle = alpha(i % 3 ? p.stripe2 : '#ffffff', 0.35 + R() * 0.5);
        const y = R() * h;
        ctx.beginPath();
        ctx.moveTo(-1, y + 1);
        ctx.bezierCurveTo(w * 0.3, y - 0.5, w * 0.6, y + 0.8, w + 1, y - 0.6);
        ctx.stroke();
      }
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = alpha('#ffffff', 0.08 + R() * 0.25);
        ctx.beginPath();
        ctx.arc(R() * w, R() * h, 0.03 + R() * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'flame': {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, p.stripe2);
      g.addColorStop(0.45, p.stripe1);
      g.addColorStop(1, p.body);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = R() * w, len = 0.8 + R() * 1.6, wid = 0.25 + R() * 0.4;
        ctx.fillStyle = alpha(i % 2 ? p.stripe2 : '#ffe08a', 0.35 + R() * 0.4);
        ctx.beginPath();
        ctx.moveTo(x - wid, h);
        ctx.bezierCurveTo(x - wid, h - len * 0.5, x + wid * 1.5, h - len * 0.6, x + wid * 0.6, h - len);
        ctx.bezierCurveTo(x + wid * 0.4, h - len * 0.5, x + wid, h - len * 0.3, x + wid, h);
        ctx.fill();
      }
      // white claw slashes
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = w * (0.2 + R() * 0.6);
        for (let k = 0; k < 3; k++) {
          ctx.lineWidth = 0.06 - k * 0.012;
          ctx.beginPath();
          ctx.moveTo(x + k * 0.2, 0.3);
          ctx.quadraticCurveTo(x + k * 0.2 + 0.3, h * 0.4, x + k * 0.2 - 0.1, h * 0.8);
          ctx.stroke();
        }
      }
      break;
    }
    case 'party': {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, p.body);
      g.addColorStop(0.5, p.stripe1);
      g.addColorStop(1, p.body);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) {
        const x = R() * w;
        ctx.fillStyle = alpha(i % 2 ? '#ffffff' : p.stripe2, 0.12 + R() * 0.18);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 0.15, 0);
        ctx.lineTo(x + 1.6, h);
        ctx.lineTo(x + 1.1, h);
        ctx.fill();
      }
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = alpha('#ffffff', 0.15 + R() * 0.5);
        const x = R() * w, y = R() * h, s = 0.02 + R() * 0.05;
        ctx.fillRect(x - s, y - s * 0.2, s * 2, s * 0.4);
        ctx.fillRect(x - s * 0.2, y - s, s * 0.4, s * 2);
      }
      break;
    }
    case 'night': {
      ctx.fillStyle = shade(p.body, -0.9);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = p.accent;
      ctx.shadowColor = p.accent;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 0.02;
      for (let i = 0; i < 16; i++) {
        let x = R() * w, y = R() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          if (k % 2) y += (R() - 0.5) * 0.8; else x += (R() - 0.3) * 1.8;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 0.04, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      break;
    }
    default:
      ctx.fillStyle = p.body;
      ctx.fillRect(0, 0, w, h);
  }
}

// ── panels ──────────────────────────────────────────────────────────────────
function drawSide(ctx: Ctx, d: VehicleDesign, dims: BusDims, frontAtLeft: boolean, doorSide: boolean, seed: number) {
  const { L, H } = dims;
  const X = (s: number) => (frontAtLeft ? s : L - s);
  const rect = (s0: number, s1: number, y0: number, y1: number) => {
    const a = X(s0), b = X(s1);
    ctx.fillRect(Math.min(a, b), y0, Math.abs(b - a), y1 - y0);
  };
  const p = d.paint;
  const isPublic = d.cls === 'public_bus';
  background(ctx, d, L, H, seed);

  if (d.livery === 'classic' || d.livery === 'plain') {
    if (isPublic) {
      // public bus: blue waist stripe + white pinstripe + dark window band
      ctx.fillStyle = p.stripe1;
      rect(0, L, 1.3, 1.52);
      ctx.fillStyle = p.stripe2;
      rect(0, L, 1.24, 1.29);
      rect(0, L, 1.55, 1.59);
      ctx.fillStyle = shade(p.body, -0.25);
      rect(0, L, H - 0.2, H);
    } else {
      // signature stripes with a downward kink near the rear
      const kinkA = L * 0.6, kinkB = kinkA + 0.7;
      const band = (yTop: number, thick: number, drop: number, col: string) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(X(0), yTop);
        ctx.lineTo(X(kinkA), yTop);
        ctx.lineTo(X(kinkB), yTop + drop);
        ctx.lineTo(X(L), yTop + drop);
        ctx.lineTo(X(L), yTop + drop + thick);
        ctx.lineTo(X(kinkB - thick * 0.6), yTop + drop + thick);
        ctx.lineTo(X(kinkA - thick * 0.6), yTop + thick);
        ctx.lineTo(X(0), yTop + thick);
        ctx.closePath();
        ctx.fill();
      };
      band(1.3, 0.11, 0.55, p.stripe2);
      band(1.46, 0.16, 0.55, p.stripe1);
      // thin lines above and below the windows
      ctx.fillStyle = p.stripe1;
      rect(0, L, 0.16, 0.22);
      ctx.fillStyle = p.stripe2;
      rect(0, L, 1.2, 1.24);
      // angled colour block near the front
      ctx.fillStyle = p.stripe1;
      ctx.beginPath();
      ctx.moveTo(X(2.3), 1.24);
      ctx.lineTo(X(3.0), 1.24);
      ctx.lineTo(X(3.5), H);
      ctx.lineTo(X(2.8), H);
      ctx.fill();
      ctx.fillStyle = p.accent;
      rect(0, L, H - 0.16, H);
    }
  } else {
    // wrap liveries get a top name banner strip
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rect(0, L, 0.02, 0.3);
  }

  // windows
  const winTop = 0.32, winBot = 1.12;
  const wins: [number, number][] = [];
  if (doorSide) {
    wins.push([2.05, 3.0], [3.1, 4.05], [4.15, 5.1], [5.2, 6.15], [6.25, 7.2], [9.55, L - 0.15]);
  } else {
    wins.push([0.15, 1.05], [1.15, 2.1], [2.2, 3.15], [3.25, 4.2], [4.3, 5.25], [5.35, 6.3], [6.4, 7.35], [7.45, 8.4], [8.5, 9.45], [9.55, L - 0.15]);
  }
  for (const [s0, s1] of wins) {
    const a = X(s0), b = X(s1);
    glass(ctx, Math.min(a, b), winTop, Math.abs(b - a), winBot - winTop);
    // sliding-window split line
    ctx.fillStyle = 'rgba(200,205,212,0.85)';
    ctx.fillRect(Math.min(a, b), winTop + (winBot - winTop) * 0.38, Math.abs(b - a), 0.025);
  }
  // window rails
  ctx.fillStyle = 'rgba(225,228,234,0.9)';
  rect(0.1, L - 0.1, winBot + 0.04, winBot + 0.07);

  if (doorSide) {
    // front passenger door (behind the driver)
    door(ctx, X(1.05), X(1.95), 0.3, H - 0.05, 2);
    // rear conductor door with two tall narrow windows
    door(ctx, X(7.35), X(8.35), 0.3, H - 0.05, 2);
  }

  // wheel arches
  ctx.fillStyle = '#121214';
  for (const s of [1.95, 7.75]) {
    ctx.beginPath();
    ctx.ellipse(X(s), H + 0.08, 0.66, 0.66, 0, Math.PI, 0);
    ctx.fill();
  }

  // painted name on the side
  const name = d.nameplate.text;
  if (name && !isPublic) {
    const cx = X(doorSide ? 4.6 : 6.0);
    const hot = d.livery === 'classic' ? p.accent : '#ffffff';
    text(ctx, name, cx, 1.86, 0.42, {
      fill: hot, stroke: d.livery === 'classic' ? '#ffffff' : '#111', strokeW: 0.22, maxW: 4.2,
      glow: d.livery === 'neon' ? p.stripe2 : undefined,
    });
  }
  if (isPublic && d.route) {
    text(ctx, d.route.no, X(doorSide ? 5.0 : 4.8), 1.85, 0.32, { fill: '#ffd34d', stroke: '#111', strokeW: 0.25 });
  }
}

function door(ctx: Ctx, xa: number, xb: number, y0: number, y1: number, panes: number) {
  const x0 = Math.min(xa, xb), w = Math.abs(xb - xa);
  ctx.fillStyle = 'rgba(20,20,24,0.9)';
  ctx.fillRect(x0, y0, w, y1 - y0);
  const pw = w / panes;
  for (let i = 0; i < panes; i++) {
    glass(ctx, x0 + i * pw + 0.06, y0 + 0.08, pw - 0.12, (y1 - y0) * 0.78, 0.08);
  }
  ctx.strokeStyle = '#d8dbe0';
  ctx.lineWidth = 0.03;
  ctx.strokeRect(x0, y0, w, y1 - y0);
}

function drawFront(ctx: Ctx, d: VehicleDesign, dims: BusDims, seed: number) {
  const { W, H } = dims;
  const p = d.paint;
  background(ctx, d, W, H, seed + 7);
  const isPublic = d.cls === 'public_bus';
  // destination / "special" board
  ctx.fillStyle = '#0b0b0d';
  ctx.beginPath();
  ctx.roundRect(0.35, 0.05, W - 0.7, 0.27, 0.06);
  ctx.fill();
  if (isPublic && d.route) {
    text(ctx, d.route.no, 0.62, 0.185, 0.2, { fill: '#ffcc33', glow: '#ff9900' });
    text(ctx, d.route.si, W / 2 + 0.2, 0.185, 0.17, { fill: '#ffcc33', glow: '#ff9900', maxW: 1.4 });
  } else {
    text(ctx, 'විශේෂ', W / 2, 0.19, 0.2, { fill: '#ff3b30', glow: '#ff2d20' });
  }
  // windscreen (two panes)
  glass(ctx, 0.08, 0.38, W / 2 - 0.1, 0.88, 0.08);
  glass(ctx, W / 2 + 0.02, 0.38, W / 2 - 0.1, 0.88, 0.08);
  // name strip under the windscreen
  if (!isPublic) {
    ctx.fillStyle = d.livery === 'classic' ? p.stripe1 : 'rgba(0,0,0,0.55)';
    ctx.fillRect(0.12, 1.3, W - 0.24, 0.2);
    text(ctx, d.nameplate.text, W / 2, 1.405, 0.15, { fill: '#ffffff', maxW: W - 0.4 });
  } else {
    ctx.fillStyle = p.stripe2;
    ctx.fillRect(0, 1.33, W, 0.05);
    ctx.fillStyle = p.stripe1;
    ctx.fillRect(0, 1.38, W, 0.12);
  }
  // grille
  ctx.fillStyle = isPublic ? '#141416' : '#202024';
  ctx.beginPath();
  ctx.roundRect(0.68, 1.58, W - 1.36, 0.5, 0.05);
  ctx.fill();
  ctx.strokeStyle = isPublic ? '#2b2b30' : '#c9ced6';
  ctx.lineWidth = 0.025;
  for (let y = 1.64; y < 2.06; y += 0.07) {
    ctx.beginPath();
    ctx.moveTo(0.74, y);
    ctx.lineTo(W - 0.74, y);
    ctx.stroke();
  }
  // headlight bezels (lamps are 3D meshes)
  ctx.fillStyle = '#16161a';
  ctx.beginPath(); ctx.roundRect(0.1, 1.78, 0.52, 0.28, 0.05); ctx.fill();
  ctx.beginPath(); ctx.roundRect(W - 0.62, 1.78, 0.52, 0.28, 0.05); ctx.fill();
  if (isPublic) {
    // generic triangle reflector sign
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(W / 2, 1.6); ctx.lineTo(W / 2 + 0.15, 1.86); ctx.lineTo(W / 2 - 0.15, 1.86); ctx.fill();
    ctx.fillStyle = '#d10f17';
    ctx.beginPath();
    ctx.moveTo(W / 2, 1.65); ctx.lineTo(W / 2 + 0.11, 1.83); ctx.lineTo(W / 2 - 0.11, 1.83); ctx.fill();
  }
}

function drawRear(ctx: Ctx, d: VehicleDesign, dims: BusDims, seed: number) {
  const { W, H } = dims;
  const p = d.paint;
  background(ctx, d, W, H, seed + 13);
  glass(ctx, 0.25, 0.3, W - 0.5, 0.75, 0.1);
  if (d.cls !== 'public_bus') {
    text(ctx, d.nameplate.text, W / 2, 1.35, 0.3, { fill: p.accent, stroke: '#ffffff', strokeW: 0.2, maxW: W - 0.3 });
  } else {
    ctx.fillStyle = p.stripe1;
    ctx.fillRect(0, 1.3, W, 0.2);
    if (d.route) text(ctx, d.route.no, W / 2, 0.68, 0.3, { fill: '#ffcc33', glow: '#ff9900' });
  }
  // tail light clusters
  for (const x of [0.12, W - 0.42]) {
    ctx.fillStyle = '#5a0a0a';
    ctx.fillRect(x, 1.72, 0.3, 0.42);
    ctx.fillStyle = '#ff2a2a';
    ctx.fillRect(x + 0.04, 1.76, 0.22, 0.16);
    ctx.fillStyle = '#ffa31a';
    ctx.fillRect(x + 0.04, 1.95, 0.22, 0.14);
  }
}

function drawRoof(ctx: Ctx, d: VehicleDesign, dims: BusDims) {
  ctx.fillStyle = d.cls === 'public_bus' ? '#d9d9d9' : shade(d.paint.body, -0.15);
  ctx.fillRect(0, 0, dims.W, dims.L);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let z = 0.6; z < dims.L; z += 1.2) ctx.fillRect(0, z, dims.W, 0.04);
}

/** Paints the full bus skin. Returns the canvas (for sharing/thumbnails as well). */
export function paintBusSkin(d: VehicleDesign, dims: BusDims, size = 2048): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size / 2;
  const ctx = c.getContext('2d')!;
  const cw = c.width, ch = c.height;
  const seed = [...d.nameplate.text, d.livery].join('').length * 977 + 13;
  // kerb side (+x): seen from outside, the front is on the viewer's left
  panel(ctx, cw, ch, ATLAS.kerb, dims.L, dims.H, () => drawSide(ctx, d, dims, true, true, seed));
  // road side (-x): front on the viewer's right, driver's window at the front
  panel(ctx, cw, ch, ATLAS.road, dims.L, dims.H, () => drawSide(ctx, d, dims, false, false, seed + 1));
  panel(ctx, cw, ch, ATLAS.front, dims.W, dims.H, () => drawFront(ctx, d, dims, seed));
  panel(ctx, cw, ch, ATLAS.rear, dims.W, dims.H, () => drawRear(ctx, d, dims, seed));
  panel(ctx, cw, ch, ATLAS.roof, dims.W, dims.L, () => drawRoof(ctx, d, dims));
  panel(ctx, cw, ch, ATLAS.bottom, 1, 1, () => { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 1, 1); });
  return c;
}
