// Supabase publishable values. They are designed to be public (RLS protects the data).
// Override with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local or on Vercel.
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://rbmnfomqtscufzescxzi.supabase.co';
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PmI6rYjDFiyIO0E0Qn5NGQ_gq7QHrhx';

export const APP_VERSION = '0.2.0';

/** YouTube playlist (id or URL) that plays as in-game music. Leave empty to let players paste their own. */
export const DEFAULT_PLAYLIST = 'PLyqLkSz7MX0948RS_jI50wp3Ub_Y2O_3L';
