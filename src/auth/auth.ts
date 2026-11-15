import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface PiccoProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  lang: 'en' | 'si';
  coins: number;
  xp: number;
}

/** Fields we keep from Google. We never see or store passwords. */
export interface GoogleBasics {
  name: string;
  email: string;
  avatar: string | null;
}

export function googleBasics(session: Session | null): GoogleBasics | null {
  if (!session) return null;
  const m = session.user.user_metadata ?? {};
  return {
    name: (m.full_name || m.name || '').toString(),
    email: session.user.email ?? '',
    avatar: (m.avatar_url || m.picture || null) as string | null,
  };
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (s: Session | null) => void): void {
  supabase.auth.onAuthStateChange((_event, session) => cb(session));
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Returns the existing game profile, or null on first login. */
export async function fetchProfile(userId: string): Promise<PiccoProfile | null> {
  const { data, error } = await supabase
    .from('picco_profiles')
    .select('id, display_name, avatar_url, lang, coins, xp')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as PiccoProfile | null;
}

export async function createProfile(displayName: string): Promise<PiccoProfile> {
  const { data, error } = await supabase.rpc('picco_ensure_profile', { p_display_name: displayName });
  if (error) throw error;
  return data as PiccoProfile;
}

export async function updateProfile(displayName: string, lang: 'en' | 'si'): Promise<PiccoProfile> {
  const { data, error } = await supabase.rpc('picco_update_profile', {
    p_display_name: displayName,
    p_lang: lang,
  });
  if (error) throw error;
  return data as PiccoProfile;
}

/** Deletes Picco Garage data only (the Google sign-in account is shared and kept). */
export async function deleteGameData(): Promise<void> {
  const { error } = await supabase.rpc('picco_delete_my_data');
  if (error) throw error;
  await signOut();
}
