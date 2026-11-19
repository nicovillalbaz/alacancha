/* Solo se guardan archivos estáticos. Nunca respuestas de /api ni datos de sesión. */
const CACHE = 'torneos-static-v3';
const SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) throw new Error('No se pudo preparar la aplicación sin conexión.');
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
    await cache.addAll([...new Set([...SHELL, ...assets])]);
    await cache.put('/index.html', response);
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('torneos-static-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('message', event => {
  if (event.data?.kind !== 'cache-visited-assets' || !Array.isArray(event.data.assets)) return;
  const assets = [...new Set(event.data.assets.slice(0,80))]
    .filter(path => typeof path === 'string' && /^\/assets\/[a-zA-Z0-9._-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css)$/.test(path));
  if (!assets.length) return;
  event.waitUntil(caches.open(CACHE).then(cache =>
    Promise.allSettled(assets.map(async path => {
      if (!await cache.match(path)) await cache.add(path);
    }))
  ));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/ready') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  if (!['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      void caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
