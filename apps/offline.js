// SJPJr with no connection (docs/apps.md): a service worker for /apps/, registered by the app
// (/apps/wardrobe). While there's a connection everything comes from the network as usual, and a
// copy of each page, script and stylesheet is kept as it passes; with none, the copy answers. The
// app opens on Today from its copy too (no address is Today). The wardrobe's photos come from
// Supabase Storage through signed links whose token changes, so the app keeps them itself (cache
// "wardrobe-photos", keyed by the file without the token) and this answers from there only when
// offline. The data is the app's own copy, in localStorage. The addresses that were apps of their
// own, /apps and /apps/recipes (a home-screen app may still open there), go straight to SJPJr and
// its Recipes tab, connection or not.
const PAGES = 'apps-pages';
const MOVED = { '/apps/': '/apps/wardrobe', '/apps/recipes': '/apps/wardrobe#recipes', '/apps/recipes.html': '/apps/wardrobe#recipes' };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.pathname.includes('/storage/v1/object/sign/photos/')) {
    if (!navigator.onLine) e.respondWith(caches.match(url.origin + url.pathname).then((r) => r || Response.error()));
    return;
  }
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate' && MOVED[url.pathname]) return e.respondWith(Response.redirect(new URL(MOVED[url.pathname] + (MOVED[url.pathname].includes('#') ? '' : url.search), location.origin), 302));
  if (!/^\/(apps|assets)\//.test(url.pathname)) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(PAGES).then((c) => c.put(req, copy))); }
    return res;
  }).catch(async () => (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || Response.error()));
});
