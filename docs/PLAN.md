# Picco Garage 2.0: release plan

One big release, mobile first (iPhone and Android equally), installable as an
app. An original Sri Lankan street racing game with Need for Speed–style
depth. No copied names, cars, art or music.

Priority order (from the owner): **driving feel and visuals → menus and
polish → career and progression**, plus music and admin.

---

## 1. Driving feel and visuals (priority 1)

### 1.1 Arcade handling model (rewrite of `game/drive.ts` physics)
- Arcade model with a **slip angle**: heading and velocity direction are
  separate, so the vehicle can slide. Grip is per vehicle, per tyre upgrade
  and per surface (asphalt, pavement, grass, wet).
- **Drift**: handbrake or a sharp steer at speed starts a drift. Counter-steer
  holds it. Drift points build a multiplier, and you bank them by
  straightening out cleanly. Three-wheelers drift easily, buses slide wide
  and heavy.
- **Boost ("turbo horn")**: a meter filled by drifts, near misses, overtakes
  and air-time over bumps. Tap to burn it: speed cap +25%, FOV kick, motion
  streaks, exhaust flame, louder engine.
- **Near miss**: passing within about 1 m of traffic at speed gives +50 coins
  and boost, with a "NEAR MISS" popup.
- **Crashes**: sparks, a short camera shake, slow motion on hard head-on
  hits, phone vibration (Android only), and a recovery reset if stuck.
  No damage model.
- **Gears**: automatic gearbox with audible shifts. Reverse via the gear
  button.
- **Controls**: buttons, steering wheel or **tilt**, all selectable. Auto-gas
  option for one-thumb play.

### 1.2 Better roads and maps
- **Road network**: each city is a main loop plus **branch roads**
  (side lanes and a border road around the area) joined at junctions with
  painted markings. Race routes use the loop; free roam can use everything.
- Road detail: worn edges, **zebra crossings**, **bus stop bays**, speed
  bumps, kerbs, painted median, road signs and lamp posts that light at night.
- Roadside life (photo sprites, never harmed): pedestrians who step aside,
  stray dogs that trot off, crows, vendors at stalls, parked three-wheelers.
- **Sixth city: Kandy**, with a lake, hills and a white temple landmark.
- Sri Lankan details: Buddha statue shrines at junctions, bo trees,
  colourful shop signs, three-wheeler stands.

### 1.3 Time of day and weather
- **Day, dusk, night, rain**. Night has working headlights (light cones),
  lit lamp posts and lit shop windows. Rain has streaks, a wet glossy road,
  less grip and wipers in the cockpit view.
- Free roam cycles the time of day; career events set it per event.

### 1.4 Visual polish
- Speed effects: FOV ramp, screen-edge motion lines at boost.
- Tyre smoke on drifts and skid marks on the road (fading decals).
- Headlight and taillight glow, brake lights that light when braking.
- Quality presets (low/mid/high) tuned so mid-range phones hold 30+ FPS.

### 1.5 Sri Lanka Police (comedic, non-violent)
- Generic white police jeeps and officers. No real insignia.
- **Checkpoints**: officers wave you down at junctions. Stop in time for a
  bonus, run it and you get a **heat** level.
- **Heat pursuit**: with heat, police jeeps follow and try to box you in.
  Escape by breaking line of sight for a few seconds. Caught means a cartoon
  "warning ticket" and a coin fine, never anything harmful.
- Dedicated career events: "Checkpoint Run", "Lose the Jeep".

### 1.6 Bus route mode (signature)
- Bus stops along the route. Stop inside the bay, the doors open, passengers
  (sprites) walk on and off, and fares are added. A timer runs to the next
  stop.
- The score combines fares, punctuality and smoothness: harsh braking and
  bumps upset passengers.

---

## 2. Menus and polish (priority 2)

Visual language: the red-to-dark gradient, giant type and cut-out vehicles
already in the game, applied to every screen. Pill buttons, line icons,
spring motion.

- **Home hub**: the player's current ride on a turntable, and a big PLAY
  button for Career. Secondary actions: Garage, Free Roam, Events, Music.
  Top bar: level and XP, coins, gems, daily reward badge.
- **Bottom tab bar**: Home · Career · Garage · Events · Profile.
- **Career map**: a scrolling chapter map, one card per city, with event
  nodes on a route line, stars and lock states.
- **Event card → pre-race screen**: event type, rules, rewards, recommended
  PR, and your vehicle with a "change" button.
- **Garage**: vehicle carousel with class badge and **PR score**; tabs for
  Performance (5 parts × 5 levels), Paint (gloss, metallic, matte), Wheels,
  Horns, Lights (underglow, roof lamps), Name board (Sinhala/English text
  on the front board).
- **Results**: stars animate in, plus a reward breakdown and level-up modal.
  A **share card** image goes to WhatsApp, Facebook and TikTok.
- **Daily rewards** calendar (7-day cycle) and **3 daily challenges**.
- **Settings**: controls (buttons, wheel, tilt, auto-gas), sensitivity,
  graphics, sound, music, haptics, language placeholder.
- **First-run tutorial**: a short guided drive with tips for steer, boost,
  drift and horn.
- **PWA**: manifest, icons, service worker. Installs to the home screen on
  iPhone and Android, opens full screen and caches assets for fast reloads.
  An "Install app" prompt appears in the menu.

---

## 3. Career and progression (priority 3)

- **5 + 1 chapters**: Colombo, Kottawa, Pannipitiya, Galle, Anuradhapura,
  Kandy. Each has 6 to 8 events and a **boss race** against a named rival.
- **Event types** (a focused set): Sprint, Circuit, Knockout, Drift Zone,
  Bus Route, Checkpoint Run (police), Near-Miss Run.
- **Stars**: 1 for finishing, 2 for the target time or score, 3 for clean
  or perfect. Stars unlock the next events and chapters.
- **Economy**: coins (earned everywhere) and gems (rare, earned from boss
  races, daily streaks and level-ups; reserved for later payments).
- **Vehicle classes C/B/A/S** and **PR score** from upgrades. Events have
  PR requirements.
- **Unlocks**: start with a three-wheeler and the Private Coach. The rest
  unlock through career progress plus coins.
- **Player level** with rewards at every level.

### New vehicles (generated, converted to 3D)
Generic designs with no real brand marks:
1. **Leyland-style modified bus**: airbrushed, chrome, roof horns, LED
   strips.
2. **Ashok-style modified bus**: lowered front, big visor, neon interior.
3. **Modified three-wheeler: "Street King"**: lowered, wide wheels, chrome.
4. **Modified three-wheeler: "Neon Rider"**: neon underglow and custom roof.

Total: **8 playable vehicles**.

---

## 4. Music

- **Global music bar** from the moment you start the game: menus, garage
  and in the drive. It shows play/pause, next, the track name, and the
  playlist picker.
- **Several playlists by type**: Bus Songs, Baila, Sinhala Rap, Old Hits,
  Chill. These are YouTube playlists, managed from **/admin** (no code
  change needed). Players can also add their own.
- A one-tap start on iPhone (a browser rule), then it plays behind
  everything.
- Engine and effects automatically duck under the music.

---

## 5. Admin (`/admin`)
- **Overview** (exists): visitors, players, drives, funnel, devices, hours.
- **Retention**: day 1, 7 and 30 return rates, plus new and returning
  players per day.
- **Players**: a searchable list of devices or accounts with level, coins,
  vehicles, play time and drive history; open one to see their journey.
- **Gameplay**: event completion rates, average stars, most-failed events,
  vehicle popularity, upgrade purchases, police catches.
- **Live config** (no code deploys): playlists, daily challenges, weekly
  event, coin multipliers, maintenance message.
- **Grant coins and gems** to a player.

---

## 6. Data and backend (Supabase, KiwiPath project)
- `picco_events` (analytics, exists in code, awaiting approval)
- `picco_config` (live config, admin-writable, public-readable)
- `picco_players` (anonymous device profile snapshot synced periodically:
  level, coins, vehicles, stars) for the admin Players page
- Google sign-in, cloud saves and leaderboards come after this release
  (schema ready).

---

## 7. Performance budget
- Draw calls under 150 and visible triangles under 400k on mid quality.
- Textures in WebP, models meshopt-compressed, under 600 KB each.
- City assets load on demand. The landing page loads under 1.5 MB before
  the game is opened.
- Pixel-ratio cap per quality preset, shadows off on low, traffic count
  scaled by quality.

---

## 8. Build order inside the release
1. Physics rewrite (slip, drift, boost, near miss, crash FX, tilt, auto-gas)
2. Road network, branch roads, crossings, bus bays, roadside life, Kandy
3. Day/night/rain, headlights, skid marks and smoke
4. Police checkpoints and heat pursuit; bus route mode with passengers
5. Menu system: hub, tab bar, career map, pre-race, results, daily rewards
6. Career data, events, stars, classes, PR, unlocks, economy
7. New vehicle generation (4) and garage tuning tabs
8. Global music bar and playlists by type
9. PWA install, tutorial, share card
10. Admin: retention, players, gameplay, live config, grants
11. Full QA on iPhone- and Android-sized screens, performance pass, deploy
