import { SUPABASE_ANON_KEY, SUPABASE_URL, DEFAULT_PLAYLIST } from '../config';
import { parseYouTube } from './youtube';

/**
 * Live config, edited from /admin without a deploy. Read from the public
 * picco_config table; falls back to these defaults when offline or not set up.
 */
export interface Station { id: string; name: string; desc: string; url: string }
export interface LiveConfig {
  stations: Station[];
  weeklyEvent: string;      // career event id featured this week (double rewards)
  coinMultiplier: number;
  message: string;          // banner on the home screen (empty = none)
}

export const live: LiveConfig = {
  stations: [
    { id: 'bus', name: 'Bus Songs', desc: 'The sound of a Sri Lankan private bus', url: DEFAULT_PLAYLIST },
    { id: 'baila', name: 'Baila', desc: 'Party baila for the open road', url: '' },
    { id: 'rap', name: 'Sinhala Rap', desc: 'Hip hop and trap', url: '' },
    { id: 'oldhits', name: 'Old Hits', desc: 'Golden oldies and classics', url: '' },
    { id: 'chill', name: 'Chill', desc: 'Easy evening drives', url: '' },
  ],
  weeklyEvent: 'colombo-5',
  coinMultiplier: 1,
  message: '',
};

export async function loadLive(): Promise<void> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/picco_config?select=key,value`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    if (!r.ok) return;
    const rows = (await r.json()) as { key: string; value: unknown }[];
    for (const { key, value } of rows) {
      if (key === 'stations' && Array.isArray(value)) {
        // keep default names, overlay admin playlist links and any new stations (validated: SEC-011)
        const clean = (value as Partial<Station>[]).filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string').slice(0, 20)
          .map((x) => ({ id: String(x.id).slice(0, 40), name: String(x.name).slice(0, 40), desc: typeof x.desc === 'string' ? x.desc.slice(0, 80) : '', url: typeof x.url === 'string' && parseYouTube(x.url) ? x.url.slice(0, 300) : '' }));
        for (const s of clean) {
          const cur = live.stations.find((x) => x.id === s.id);
          if (cur) Object.assign(cur, s); else live.stations.push(s);
        }
      }
      if (key === 'weeklyEvent' && typeof value === 'string') live.weeklyEvent = value.slice(0, 40);
      if (key === 'coinMultiplier' && typeof value === 'number' && Number.isFinite(value)) live.coinMultiplier = Math.min(3, Math.max(1, value));
      if (key === 'message' && typeof value === 'string') live.message = value.slice(0, 140);
    }
  } catch { /* offline: defaults */ }
}
