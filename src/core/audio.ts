import { settings } from './settings';

/**
 * Audio engine (phase 1: unlock + UI sounds). Everything is synthesised with
 * the Web Audio API, so all sounds are original. A master limiter caps the
 * output level so horns can never get painfully loud.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;

export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Must be called from a user gesture (tap/click/key) before any sound plays. */
export async function unlockAudio(): Promise<void> {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    master = ctx.createGain();
    master.gain.value = 0.9;
    sfx = ctx.createGain();
    sfx.gain.value = settings.sound;
    sfx.connect(master).connect(limiter).connect(ctx.destination);
  }
  if (ctx.state !== 'running') await ctx.resume();
}

export function setSfxVolume(v: number): void {
  if (sfx && ctx) sfx.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

function blip(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  if (!ctx || !sfx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const ui = {
  click: () => blip(660, 0.07, 'triangle', 0.25, 1.4),
  back: () => blip(520, 0.08, 'triangle', 0.22, 0.7),
  coin: () => { blip(988, 0.08, 'square', 0.12); blip(1319, 0.22, 'square', 0.12, 1, 0.07); },
  error: () => { blip(220, 0.12, 'sawtooth', 0.15); blip(180, 0.18, 'sawtooth', 0.15, 1, 0.1); },
  share: () => { blip(784, 0.08, 'triangle', 0.2); blip(1175, 0.15, 'triangle', 0.2, 1, 0.08); },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 'triangle', 0.22, 1, i * 0.09)),
};
