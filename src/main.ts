import './ui/styles.css';
import { setCustomHorn, unlockAudio } from './core/audio';
import { initRenderer, setStage } from './core/renderer';
import { setBackdrop } from './ui/dom';
import { preload } from './game/models';
import { VEHICLES } from './game/data';
import { loadBlob } from './game/progress';
import { showGarage } from './ui/garage';
import { showLanding } from './ui/landing';
import { showCities, startDrive, type Flow } from './ui/play';

const flow: Flow = {
  home: () => { setStage(null); setBackdrop(null); document.body.className = ''; showLanding(flow.garage); },
  garage: () => showGarage(flow.home, flow.cities),
  cities: () => showCities(flow),
  drive: () => { void startDrive(flow); },
};

async function boot() {
  await Promise.race([document.fonts.load('700 20px "Inter Variable"'), new Promise((r) => setTimeout(r, 1500))]);
  initRenderer(document.getElementById('gl') as HTMLCanvasElement);
  const unlock = () => { void unlockAudio().then(async () => { const d = await loadBlob('horn'); if (d) void setCustomHorn(d); }); window.removeEventListener('pointerdown', unlock); window.removeEventListener('touchend', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchend', unlock);
  window.addEventListener('keydown', unlock);
  // iOS Safari: stop pinch zoom and double-tap zoom from hijacking the controls
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  flow.home();
  document.getElementById('boot')!.classList.add('done');
  void preload(VEHICLES.map((v) => v.model)); // warm the garage while the player reads the landing page
  (window as unknown as { flow: Flow }).flow = flow;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('boot')!.innerHTML = '<p style="padding:20px">Could not start Picco Garage. Please reload.</p>';
});
