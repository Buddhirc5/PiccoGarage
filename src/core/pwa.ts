/**
 * Installable app: service worker for fast reloads and offline menus, and an
 * install prompt (Android shows the system dialog; iPhone needs Share → Add to
 * Home Screen, so we show instructions).
 */
interface BIP extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIP | null = null;

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; });
  if ('serviceWorker' in navigator && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
export const canPrompt = () => !!deferred;
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'ios' | 'unavailable'> {
  if (deferred) { await deferred.prompt(); const c = await deferred.userChoice; deferred = null; return c.outcome === 'accepted' ? 'accepted' : 'dismissed'; }
  return isIOS() ? 'ios' : 'unavailable';
}
