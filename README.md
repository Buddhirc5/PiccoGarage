# Picco Garage

A Sri Lankan vehicle-culture browser game. Sign in with Google, customise
tuk-tuks and Leyland-style private buses, then drive or race them through
Colombo streets, the hills, the coast, Flood Town and Market Junction.

Built with **Three.js + Vite + TypeScript**, with **Supabase** for Google
sign-in and cloud saves. Runs in mobile browsers (Android Chrome, iPhone
Safari) and on desktop.

> Status: **build step 1 of 10** (skeleton, landing page, Google login,
> profile). See [Build progress](#build-progress).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173  (also on your LAN for phone testing)
npm run build      # type-check + production build into dist/
```

## Supabase setup

The game uses the existing **KiwiPath** Supabase project (shared sign-in).
All game tables are prefixed `picco_` and live in `public`; nothing touches
KiwiPath tables.

1. Apply the SQL in `supabase/migrations/` in order (Supabase Dashboard → SQL
   editor, or `supabase db push`).
2. Dashboard → **Authentication → URL Configuration → Redirect URLs**: add
   - `http://localhost:5173/**`
   - your Vercel URL, e.g. `https://picco-garage.vercel.app/**`
     (and `https://*-<team>.vercel.app/**` for preview builds)
3. Client keys: `src/config.ts` has the project URL and publishable key as
   defaults. Override with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   (see `.env.example`).

### Security model

- Row Level Security on every `picco_` table. Clients can **read** their own
  rows; garages are the only table clients write directly (own rows only,
  size-limited).
- Coins, purchases, race results and profile changes go through
  `SECURITY DEFINER` functions (`picco_*`) that validate on the server.
- "Delete my game data" calls `picco_delete_my_data()`, which deletes every
  Picco Garage row for that user. The shared sign-in account is kept.

## Google OAuth setup

Google sign-in is already configured on the KiwiPath project. If you move to
a dedicated project later:

1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
2. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase Dashboard → Authentication → Providers → Google: paste the client
   ID and secret.

## Deployment (Vercel)

`vercel.json` is included. Import the GitHub repo in Vercel (framework: Vite)
or run `npx vercel`. Then add the deployed URL to the Supabase redirect list
(step 2 above).

## Project layout

```
src/auth         Supabase client, Google login, profile functions
src/landing      landing page + live 3D trailer
src/core         renderer/game loop, audio engine, settings, store
src/vehicles     tuk-tuk, private bus, public bus models + livery painter
src/garage       customisation UI (step 2)
src/world        street kit, procedural textures, maps, weather, NPCs
src/modes        race modes (steps 5–7)
src/leaderboard  boards (step 7)
src/ui           menus, HUD, settings, share
src/i18n         en.json / si.json
src/ads, src/payments   placeholder adapters (step 8)
public/music, public/sounds, public/assets
supabase/migrations     SQL schema
docs/REFERENCES.md      visual reference notes
```

## How to extend

- **Translations**: add the key to `src/i18n/en.json` and `si.json`. Use
  `data-i18n="key"` in DOM built with `h()` or call `t('key')`.
- **Vehicles**: add a builder in `src/vehicles/`, register it in
  `src/vehicles/index.ts`, and add its paint zones to `ZONES` in `types.ts`.
- **Liveries**: add a style to `LiveryStyle` and a case in `background()` in
  `src/vehicles/livery.ts`. Panels are drawn in metres, so text stays
  undistorted on the model.
- **Maps, modes, music**: documented as those steps land.

## Placeholders to replace before release

| Item | Where | Status |
|---|---|---|
| Ad SDK | `src/ads` | stub (step 8) |
| Payment provider | `src/payments/paymentAdapter.ts` | stub (step 8) |
| Music tracks | `public/music/` + JSON list | silent placeholders (step 3) |
| Flood Town English name | i18n | "Flood Town" pending confirmation |
| Sound licences | `public/credits.html` | all SFX are synthesised originals |
| Privacy Policy / Terms | `public/privacy.html`, `terms.html` | drafts, need review |

## Build progress

1. ✅ Project skeleton, landing page, Supabase Google login, profile + name setup
2. ⏳ Vehicle models and garage system with saves
3. ⏳ Driving controller and sound engine
4. ⏳ Map 1 with weather, traffic and NPCs
5. ⏳ Public red bus with Route Race
6. ⏳ Maps 2–5 and remaining race modes
7. ⏳ Leaderboards and Race Series
8. ⏳ Shop, coins, rewarded ad stub, payment stub
9. ⏳ Language pass, sharing, performance pass
10. ⏳ Deployment and final QA
