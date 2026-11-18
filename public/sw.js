// Picco Garage service worker: cache-first for hashed build files and game assets,
// network-first for pages so new releases show up straight away.
const CACHE = 'picco-v4';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/admin')) return;
  const asset = /^\/(assets|icons|sounds|music)\//.test(url.pathname);
  if (asset) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) c.put(req, res.clone());
      return res;
    }));
  } else if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put('/', cp)); return res; })
      .catch(() => caches.match('/')));
  }
});
