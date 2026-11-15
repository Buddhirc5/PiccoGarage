import type { Session } from '@supabase/supabase-js';
import type { PiccoProfile } from '../auth/auth';

/** Global app state. Small on purpose: screens read it, auth/save code writes it. */
export const store = {
  session: null as Session | null,
  profile: null as PiccoProfile | null,
  guest: false,
};

export function isSignedIn(): boolean {
  return !!store.session && !!store.profile;
}

const PROFILE_CACHE = 'picco.profileCache';
export function cacheProfile(p: PiccoProfile | null): void {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE, JSON.stringify(p));
    else localStorage.removeItem(PROFILE_CACHE);
  } catch { /* ignore */ }
}
export function cachedProfile(): PiccoProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE);
    return raw ? (JSON.parse(raw) as PiccoProfile) : null;
  } catch {
    return null;
  }
}
