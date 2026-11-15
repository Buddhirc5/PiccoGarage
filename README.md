# Picco Garage

A Sri Lankan vehicle-culture browser game. Sign in with Google, customise
tuk-tuks and Leyland-style private buses, then drive or race them through
Colombo streets, the hills, the coast, Flood Town and Market Junction.

Built with **Three.js + Vite + TypeScript**, with **Supabase** for Google
sign-in and cloud saves. Runs in mobile browsers (Android Chrome, iPhone
Safari) and on desktop.

> Status: playable build. Landing page, garage (paint, underglow, horns,
> upgrades), five cities, free ride and race, YouTube music. Google sign-in,
> cloud saves and leaderboards are the next step (the Supabase schema is in
> `supabase/migrations`, not yet applied).

## How the art is made

All visual assets were generated with Higgsfield and optimised locally:

- **Vehicles**: one realistic studio image per vehicle, converted to a 3D
  model (GLB), then compressed with `gltf-transform` (meshopt + WebP
  textures, about 0.2 to 0.5 MB each) into `public/assets/models`.
- **Cities**: one sheet of six photos cropped into the city cards; one sheet
  of eight building facades used as the building texture atlas
  (`public/assets/tex/facades.webp`); one sky panorama.
- **Driving controls**: steering wheel and pedals from one transparent sheet.

To add a vehicle: generate a three-quarter studio image, convert it to GLB,
run `npx gltf-transform optimize in.glb public/assets/models/name.glb
--texture-size 1024 --texture-compress webp --compress meshopt --simplify false`,
then add it to `MODEL_INFO` in `src/game/models.ts` and `VEHICLES` in
`src/game/data.ts`.

To add a city: add an entry to `CITIES` in `src/game/data.ts` (road loop
points, building density, trees, landmark, sky) and a card image.

Music: set `DEFAULT_PLAYLIST` in `src/config.ts` to a YouTube playlist id or
URL. Players can also paste their own link from the pause menu.

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
src/game      data (vehicles, cities, upgrades), progress/saves, model loader,
              city builder (world.ts), driving session (drive.ts)
src/ui        landing page, garage showroom, city select, HUD, results, styles
src/core      renderer loop, sound engine, YouTube music, settings
src/auth      Supabase client and Google sign-in (not wired into the UI yet)
public/assets generated images, textures and 3D models
supabase/migrations  SQL schema for profiles, saves and leaderboards
```

## Not built yet

- Google sign-in, cloud saves, leaderboards, multiplayer
- Sinhala language
- Ads and payments
- Weather, pedestrians, bus-stop route mode
