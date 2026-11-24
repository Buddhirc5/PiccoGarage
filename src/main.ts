import './ui/styles.css';
import { DEBUG_HOOKS } from './config';
import { setCustomHorn, unlockAudio } from './core/audio';
import { loadLive } from './core/live';
import { initPwa } from './core/pwa';
import { initRenderer, setStage } from './core/renderer';
import { startTracking, track } from './core/track';
import { freeRoam } from './game/career';
import { vehicle } from './game/data';
import { preload } from './game/models';
import { loadBlob, progress } from './game/progress';
import { syncPlayer } from './game/sync';
import { showCareer } from './ui/careerui';
import { fmtNum, setBackdrop, toast } from './ui/dom';
import { freeTime, freeWeather } from './ui/events';
import { showEvents } from './ui/events';
import { showGarage } from './ui/garage';
import { showHome } from './ui/home';
import { startDrive } from './ui/hud';
import { showLanding } from './ui/landing';
import { initMusic } from './ui/music';
import { nav, type Tab } from './ui/nav';
import { showPrerace } from './ui/prerace';
import { showProfile } from './ui/profile';
import { showResults } from './ui/results';

const TABS: Record<Tab, (arg?: string) => void> = {
  home: showHome, career: showCareer, garage: showGarage, events: showEvents, profile: showProfile,
};

nav.landing = () => { setStage(null); setBackdrop(null); document.body.className = ''; showLanding(() => { track('garage'); nav.tab('home'); }); };
nav.tab = (t, arg) => { track(t === 'garage' ? 'garage' : t === 'career' ? 'city' : 'visit', { tab: t }); TABS[t](arg); };
nav.prerace = (id) => showPrerace(id);
nav.free = (cityId) => { void cityId; showPrerace(freeRoam(cityId ?? progress.freeCity, freeTime, freeWeather).id); };
nav.drive = (spec, v) => { void startDrive(spec, v); };
nav.results = (s) => { showResults(s); void syncPlayer(gift); };

function gift(coins: number, gems: number, note: string) {
  toast(`Gift from Picco Garage: ${coins ? `${fmtNum(coins)} coins` : ''}${coins && gems ? ' and ' : ''}${gems ? `${gems} gems` : ''}${note ? ` · ${note}` : ''}`, 5000);
  const c = document.getElementById('coins'); if (c) c.textContent = fmtNum(progress.coins);
}

async function boot() {
  await Promise.race([document.fonts.load('700 20px "Inter Variable"'), new Promise((r) => setTimeout(r, 1500))]);
  initRenderer(document.getElementById('gl') as HTMLCanvasElement);
  initPwa();
  initMusic();
  const unlock = () => { void unlockAudio().then(async () => { const d = await loadBlob('horn'); if (d) void setCustomHorn(d); }); window.removeEventListener('pointerdown', unlock); window.removeEventListener('touchend', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchend', unlock);
  window.addEventListener('keydown', unlock);
  // iOS Safari: stop pinch zoom and double-tap zoom from hijacking the controls
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  startTracking();
  void loadLive();
  setTimeout(() => void syncPlayer(gift), 3000);
  // returning players go straight to the hub; new players see the landing page
  if (progress.drives > 0 || location.hash === '#play') nav.tab('home'); else nav.landing();
  document.getElementById('boot')!.classList.add('done');
  void preload([vehicle(progress.vehicle).model]);
  if (DEBUG_HOOKS) (window as unknown as { nav: typeof nav }).nav = nav; // tests only: never on the live site
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('boot')!.innerHTML = '<p style="padding:20px">Could not start Picco Garage. Please reload.</p>';
});
