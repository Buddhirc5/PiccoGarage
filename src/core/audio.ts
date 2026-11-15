import { settings } from './settings';

/**
 * Sound engine. Engines, horns and UI sounds are synthesised with Web Audio
 * (original, no licensed samples). Players can also load their own horn sound.
 * A limiter caps the master level.
 */
let ctx: AudioContext | null = null;
let sfx: GainNode;
let customHorn: AudioBuffer | null = null;

export function audioCtx(): AudioContext | null { return ctx; }

export async function unlockAudio(): Promise<void> {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    sfx = ctx.createGain();
    sfx.gain.value = settings.sound;
    sfx.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
}

export function setSfxVolume(v: number): void {
  if (ctx) sfx.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0, dest: AudioNode = sfx) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.03);
}

export const ui = {
  tap: () => tone(520, 0.05, 'sine', 0.18, 1.3),
  select: () => { tone(440, 0.06, 'sine', 0.16); tone(660, 0.09, 'sine', 0.16, 1, 0.05); },
  back: () => tone(380, 0.07, 'sine', 0.16, 0.75),
  buy: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.16, 1, i * 0.07)),
  deny: () => { tone(200, 0.1, 'square', 0.08); tone(160, 0.14, 'square', 0.08, 1, 0.09); },
  coin: () => { tone(988, 0.07, 'triangle', 0.14); tone(1319, 0.16, 'triangle', 0.14, 1, 0.06); },
  count: (n: number) => tone(n > 0 ? 440 : 880, n > 0 ? 0.15 : 0.5, 'square', 0.12),
  bump: () => { tone(90, 0.18, 'sawtooth', 0.3, 0.5); noiseBurst(0.12, 0.25, 900); },
};

let noiseBuf: AudioBuffer | null = null;
function noise(): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ctx!.createBuffer(1, ctx!.sampleRate * 2, ctx!.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function noiseBurst(dur: number, vol: number, cutoff: number) {
  if (!ctx || ctx.state !== 'running') return;
  const s = ctx.createBufferSource(); s.buffer = noise();
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  s.connect(f).connect(g).connect(sfx); s.start(); s.stop(ctx.currentTime + dur);
}

// ── engine ──────────────────────────────────────────────────────────────────
export interface EngineSound { update(rpm01: number, load01: number, speed01: number): void; stop(): void }

export function startEngine(kind: 'diesel' | 'twostroke'): EngineSound {
  if (!ctx) return { update() {}, stop() {} };
  const c = ctx;
  const out = c.createGain(); out.gain.value = 0; out.connect(sfx);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 1.2; lp.connect(out);
  const o1 = c.createOscillator(), o2 = c.createOscillator(), sub = c.createOscillator();
  o1.type = 'sawtooth'; o2.type = kind === 'diesel' ? 'square' : 'sawtooth'; sub.type = 'triangle';
  const g1 = c.createGain(), g2 = c.createGain(), gs = c.createGain();
  g1.gain.value = 0.5; g2.gain.value = kind === 'diesel' ? 0.25 : 0.4; gs.gain.value = kind === 'diesel' ? 0.7 : 0.15;
  o1.connect(g1).connect(lp); o2.connect(g2).connect(lp); sub.connect(gs).connect(lp);
  // chug: amplitude modulation at firing frequency
  const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.type = 'square'; lfoG.gain.value = 0.25; lfo.connect(lfoG).connect(out.gain);
  // road / wind noise
  const n = c.createBufferSource(); n.buffer = noise(); n.loop = true;
  const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 0.4;
  const ng = c.createGain(); ng.gain.value = 0; n.connect(nf).connect(ng).connect(sfx);
  [o1, o2, sub, lfo, n].forEach((x) => x.start());
  const base = kind === 'diesel' ? 38 : 70, span = kind === 'diesel' ? 95 : 190;
  return {
    update(rpm, load, speed) {
      const t = c.currentTime, f = base + span * rpm;
      o1.frequency.setTargetAtTime(f, t, 0.05); o2.frequency.setTargetAtTime(f * (kind === 'diesel' ? 1.5 : 2.01), t, 0.05); sub.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      lfo.frequency.setTargetAtTime(kind === 'diesel' ? f * 0.25 : f * 0.5, t, 0.05);
      lp.frequency.setTargetAtTime(300 + 1400 * rpm + 900 * load, t, 0.08);
      out.gain.setTargetAtTime(0.1 + 0.12 * load + 0.05 * rpm, t, 0.08);
      ng.gain.setTargetAtTime(0.16 * speed * speed, t, 0.2); nf.frequency.setTargetAtTime(400 + 1400 * speed, t, 0.2);
    },
    stop() {
      out.gain.setTargetAtTime(0, c.currentTime, 0.1); ng.gain.setTargetAtTime(0, c.currentTime, 0.1);
      setTimeout(() => { [o1, o2, sub, lfo, n].forEach((x) => { try { x.stop(); } catch { /* already stopped */ } }); out.disconnect(); ng.disconnect(); }, 400);
    },
  };
}

// ── horns ───────────────────────────────────────────────────────────────────
export async function setCustomHorn(data: ArrayBuffer | null): Promise<boolean> {
  if (!data) { customHorn = null; return true; }
  if (!ctx) await unlockAudio();
  try { customHorn = await ctx!.decodeAudioData(data.slice(0)); return true; } catch { return false; }
}
export const hasCustomHorn = () => !!customHorn;

const MELODY = [392, 494, 587, 494, 659, 587, 494, 392]; // original phrase

/** Starts a horn; returns a function that releases it. */
export function horn(id: string): () => void {
  if (!ctx || ctx.state !== 'running') return () => {};
  const c = ctx, t = c.currentTime;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.03); g.connect(sfx);
  const stopAt = (nodes: AudioScheduledSourceNode[]) => () => {
    const e = c.currentTime; g.gain.cancelScheduledValues(e); g.gain.setTargetAtTime(0.0001, e, 0.04);
    nodes.forEach((n) => { try { n.stop(e + 0.25); } catch { /* done */ } });
  };
  if (id === 'custom' && customHorn) {
    const s = c.createBufferSource(); s.buffer = customHorn; s.connect(g); s.start();
    return () => {}; // custom sounds play through once
  }
  if (id === 'melody') {
    MELODY.forEach((f, i) => { tone(f, 0.17, 'square', 0.22, 1, i * 0.16); tone(f * 1.5, 0.17, 'sawtooth', 0.1, 1, i * 0.16); });
    return () => {};
  }
  const freqs = id === 'air' ? [311, 370] : id === 'twin' ? [440, 554] : id === 'steady' ? [350, 440] : [520, 660];
  const type: OscillatorType = id === 'beep' ? 'square' : 'sawtooth';
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = id === 'beep' ? 2600 : 1700; f.connect(g);
  const oscs = freqs.map((fr) => { const o = c.createOscillator(); o.type = type; o.frequency.value = fr; const og = c.createGain(); og.gain.value = 0.5; o.connect(og).connect(f); o.start(); return o; });
  return stopAt(oscs);
}
