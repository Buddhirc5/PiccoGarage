/** Device-local settings (also mirrored into the profile where relevant). */
export interface Settings {
  sound: number;   // 0..1
  music: number;   // 0..1
  quality: 'low' | 'medium' | 'high';
}

const KEY = 'picco.settings';

function detectQuality(): Settings['quality'] {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  if (mobile && mem <= 3) return 'low';
  return mobile ? 'medium' : 'high';
}

function load(): Settings {
  const base: Settings = { sound: 0.8, music: 0.5, quality: detectQuality() };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* storage blocked */ }
  return base;
}

export const settings: Settings = load();

export function saveSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
