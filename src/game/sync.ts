import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { visitor } from '../core/track';
import { level, progress, save, totalStars } from './progress';

/**
 * Sends a small snapshot of this device's progress (for the admin's player
 * list) and collects any coins or gems the admin has gifted. Anonymous: the
 * only id is the random device id used for analytics.
 */
let busy = false;
export async function syncPlayer(onGift?: (coins: number, gems: number, note: string) => void): Promise<void> {
  if (busy || /localhost|127\.0\.0\.1/.test(location.hostname) || navigator.webdriver) return;
  busy = true;
  try {
    const snap = {
      level: level(), xp: progress.xp, coins: progress.coins, gems: progress.gems, stars: totalStars(),
      drives: progress.drives, km: Math.round(progress.km * 10) / 10, wins: progress.wins, vehicle: progress.vehicle,
      owned: progress.owned, passengers: progress.passengers, escapes: progress.escapes, controls: progress.controls,
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/picco_sync`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_visitor: visitor, p_snap: snap }),
    });
    if (!r.ok) return;
    const gifts = (await r.json()) as { coins: number; gems: number; note: string | null }[];
    for (const g of gifts) {
      progress.coins += g.coins; progress.gems += g.gems; save();
      onGift?.(g.coins, g.gems, g.note ?? '');
    }
  } catch { /* offline */ } finally { busy = false; }
}
