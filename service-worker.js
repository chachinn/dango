const CACHE = 'dango-shell-v5.0.0';
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.json',
  './icon/icon-192.png', './icon/icon-512.png', './icon/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dango-shell-') && key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response?.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', copy)).catch(() => undefined));
          }
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }

  const isShellAsset = SHELL.some(item => {
    try { return new URL(item, self.registration.scope).pathname === url.pathname; } catch { return false; }
  });
  if (!isShellAsset) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response?.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => undefined));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
