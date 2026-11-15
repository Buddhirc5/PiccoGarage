import './ui/styles.css';
import { fetchProfile, getSession, googleBasics, onAuthChange, signInWithGoogle } from './auth/auth';
import { unlockAudio } from './core/audio';
import { initRenderer, setStage, snapshot } from './core/renderer';
import { cacheProfile, cachedProfile, store } from './core/store';
import { applyI18n, onLangChange, t } from './i18n';
import { showLanding } from './landing/landing';
import { createTrailer, type Trailer } from './landing/trailer';
import { toast } from './ui/dom';
import { showHome, showNameSetup, type Nav } from './ui/screens';

let trailer: Trailer;
let screenshots: string[] = [];
let rerender: () => void = () => {};

const nav: Nav = {
  home: goHome,
  landing: goLanding,
  signIn: startGoogle,
};

function goHome() {
  trailer.setShot(0);
  rerender = () => showHome(nav);
  rerender();
}

function goLanding() {
  store.guest = false;
  store.profile = null;
  trailer.setShot(null);
  rerender = () => showLanding({ screenshots, onGoogle: startGoogle, onGuest: startGuest });
  rerender();
}

async function startGoogle() {
  toast(t('landing.signing_in'));
  try {
    await signInWithGoogle(); // redirects to Google, then back here
  } catch (e) {
    console.error(e);
    toast(t('common.error'));
  }
}

function startGuest() {
  store.guest = true;
  store.profile = null;
  goHome();
}

/** After a session exists: load or create the game profile, then go home. */
async function enterSignedIn() {
  const userId = store.session!.user.id;
  try {
    store.profile = await fetchProfile(userId);
  } catch (e) {
    console.warn('profile fetch failed, using cache', e);
    const c = cachedProfile();
    store.profile = c && c.id === userId ? c : null;
    if (!store.profile) { toast(t('common.offline')); }
  }
  if (store.profile) {
    cacheProfile(store.profile);
    goHome();
    return;
  }
  const g = googleBasics(store.session);
  rerender = () => showNameSetup(g?.name ?? '', goHome);
  rerender();
}

function reportOAuthError() {
  const q = new URLSearchParams(window.location.search + '&' + window.location.hash.slice(1));
  const err = q.get('error_description') || q.get('error');
  if (err) {
    toast(`Google sign-in: ${err}`, 6000);
    history.replaceState(null, '', window.location.pathname);
  }
}

async function boot() {
  // Fonts first, so Sinhala text painted onto canvases (signs, liveries) renders correctly.
  await Promise.race([
    Promise.all([
      document.fonts.load('800 32px "Noto Sans Sinhala"', 'අආ'),
      document.fonts.load('800 32px "Baloo 2"'),
      document.fonts.load('600 32px "Baloo 2"'),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  applyI18n(document.body);
  initRenderer(document.getElementById('gl') as HTMLCanvasElement);
  trailer = createTrailer();
  setStage(trailer);

  // Screenshots for the landing page, rendered live from the game scene.
  trailer.update?.(0, 0);
  const picks = [0, 1, 4];
  screenshots = picks.map((i, k) => {
    trailer.setShot(i, 1 + k);
    trailer.update?.(0.016, 2 + k * 3);
    return snapshot(trailer, 640, 360);
  });
  trailer.setShot(null);

  // First user gesture unlocks audio (browsers block sound before that).
  const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  onLangChange(() => rerender());
  reportOAuthError();

  store.session = await getSession();
  onAuthChange((s) => {
    const had = !!store.session;
    store.session = s;
    if (!had && s) enterSignedIn();
  });

  if (store.session) await enterSignedIn();
  else goLanding();

  document.getElementById('boot')!.classList.add('done');
  // debugging handle for QA scripts
  (window as unknown as { picco: unknown }).picco = { store, trailer, nav };
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('boot')!.innerHTML = '<p style="padding:20px">Could not start Picco Garage. Please reload.</p>';
});
