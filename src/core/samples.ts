/**
 * Recorded sounds. /sounds/sounds.json lists real recordings (engine loops at
 * a few RPMs per engine type, and horns). Everything is optional: whatever is
 * missing falls back to the synthesised sound in audio.ts.
 *
 * {
 *   "engines": { "twostroke": [{ "file": "tuk_idle.m4a", "rpm": 0 }, { "file": "tuk_high.m4a", "rpm": 1 }], "diesel": [...] },
 *   "horns":   { "air": { "file": "horn_air.m4a", "loop": [0.2, 0.7] } }
 * }
 * rpm: the 0..1 engine speed the loop was recorded at. loop: seconds of the
 * steady middle of a horn, repeated while the button is held.
 */
export interface EngineLayer { file: string; rpm: number }
export interface HornSample { file: string; loop?: [number, number]; gain?: number }
interface Manifest { engines?: Record<string, EngineLayer[]>; horns?: Record<string, HornSample> }

let manifest: Manifest | null = null;
let manifestP: Promise<Manifest> | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function loadManifest(): Promise<Manifest> {
  if (!manifestP) {
    manifestP = fetch('/sounds/sounds.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((m: Manifest) => (manifest = m));
  }
  return manifestP;
}

function buffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  let p = buffers.get(file);
  if (!p) {
    p = fetch(`/sounds/${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((a) => ctx.decodeAudioData(a))
      .catch(() => null);
    buffers.set(file, p);
  }
  return p;
}

export interface LoadedLayer { buf: AudioBuffer; rpm: number }
const engines = new Map<string, LoadedLayer[]>();
const horns = new Map<string, { buf: AudioBuffer; loop?: [number, number]; gain: number }>();

/** Decode the loops for one engine type (call while the drive is loading). */
export async function loadEngine(ctx: AudioContext, kind: string): Promise<void> {
  const m = await loadManifest();
  const layers = m.engines?.[kind];
  if (!layers?.length || engines.has(kind)) return;
  const got = await Promise.all(layers.map(async (l) => ({ buf: await buffer(ctx, l.file), rpm: l.rpm })));
  const ok = got.filter((x): x is LoadedLayer => !!x.buf).sort((a, b) => a.rpm - b.rpm);
  if (ok.length) engines.set(kind, ok);
}
export const engineLayers = (kind: string) => engines.get(kind);

/** Decode every horn recording (small files; done once after audio unlocks). */
export async function loadHorns(ctx: AudioContext): Promise<void> {
  const m = await loadManifest();
  await Promise.all(Object.entries(m.horns ?? {}).map(async ([id, h]) => {
    const buf = await buffer(ctx, h.file);
    if (buf) horns.set(id, { buf, loop: h.loop, gain: h.gain ?? 1 });
  }));
}
export const hornSample = (id: string) => horns.get(id);
export const hasManifest = () => !!manifest;
