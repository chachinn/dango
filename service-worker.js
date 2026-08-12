const CACHE = 'dango-shell-v5.2.0';
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.json',
  './icon/icon-192.png', './icon/icon-512.png', './icon/apple-touch-icon.png'
];
const CORE_PATHS = new Set(['/index.html','/style.css','/app.js','/manifest.json']);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('dango-shell-') && key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function networkFirst(request, fallbackKey) {
  try {
    const response = await fetch(request, {cache:'no-store'});
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => undefined);
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallbackKey ? await caches.match(fallbackKey) : undefined) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
  const relativePath = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) || '/' : url.pathname;
  if (CORE_PATHS.has(relativePath)) {
    event.respondWith(networkFirst(request, `.${relativePath}`));
    return;
  }

  const isShellAsset = SHELL.some(item => {
    try { return new URL(item, self.registration.scope).pathname === url.pathname; } catch { return false; }
  });
  if (!isShellAsset) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => undefined));
      }
      return response;
    }))
  );
});
