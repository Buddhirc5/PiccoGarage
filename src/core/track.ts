import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/**
 * Anonymous analytics. A random visitor id (kept on the device) and a session
 * id; no names, emails or IPs. Events are batched and posted straight to the
 * picco_events table, which anyone may insert into but only admins can read.
 */
type EventType = 'visit' | 'heartbeat' | 'garage' | 'vehicle' | 'upgrade' | 'city' | 'drive_start' | 'drive_end' | 'music' | 'camera' | 'share';

const rid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 24);
export const visitor = (() => { try { let v = localStorage.getItem('picco.vid'); if (!v) { v = rid(); localStorage.setItem('picco.vid', v); } return v; } catch { return rid(); } })();
const session = rid();

const ua = navigator.userAgent;
const os = /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua)) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'other';
const device = /iPad|Tablet/.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua)) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) ? 'phone' : 'desktop';
const base = {
  visitor, session, device, os,
  lang: (navigator.language || '').slice(0, 16),
  tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 64),
  referrer: (() => { try { const r = document.referrer ? new URL(document.referrer).hostname : ''; return r === location.hostname ? '' : r.slice(0, 200); } catch { return ''; } })(),
};

let queue: object[] = [];
let rpcOk = true;
let timer = 0;
const enabled = !/localhost|127\.0\.0\.1/.test(location.hostname) && !navigator.webdriver;

function flush(beacon = false) {
  if (!queue.length) return;
  const events = queue; queue = [];
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  // validated server-side ingest (migration 0004); the direct table insert is the fallback until it is applied
  if (rpcOk) {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/picco_track`, { method: 'POST', headers, body: JSON.stringify({ p_events: events }), keepalive: beacon })
      .then((r) => { if (r.status === 404) { rpcOk = false; queue.unshift(...events); flush(); } })
      .catch(() => {});
  } else {
    fetch(`${SUPABASE_URL}/rest/v1/picco_events`, { method: 'POST', headers, body: JSON.stringify(events), keepalive: beacon }).catch(() => {});
  }
}

export function track(type: EventType, props: Record<string, unknown> = {}): void {
  if (!enabled) return;
  queue.push({ ...base, type, props });
  clearTimeout(timer);
  timer = window.setTimeout(() => flush(), type === 'visit' ? 0 : 2500);
}

export function startTracking(): void {
  track('visit', { path: location.pathname, w: innerWidth, h: innerHeight });
  setInterval(() => { if (!document.hidden) track('heartbeat'); }, 60_000);
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
}
